// Conformance kit: runs witness against tiny real projects of every supported framework and prints a matrix.
// Usage: npm run conformance -- [framework...] [--jobs n] [--docker name,...] [--scenario s,...]
import { readEvidence, titleOf } from "../src/evidence/contract.ts";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { FRAMEWORKS, type Framework, IN_DOCKER, KIT, type Scenario, SCENARIOS, type Tool } from "./frameworks.ts";

const PKG = path.dirname(KIT);
const CLI = path.join(PKG, "src", "cli.ts");
const APP = path.join(KIT, "app", "server.mjs");
const BREAK = path.join(KIT, "bin", "break-report.mjs");

type Cell = { result: "pass" | "fail" | "n.a."; detail: string; ms: number };
interface FwResult {
  name: string;
  toolchain: string;
  versions: string;
  capabilities?: unknown;
  cells: Partial<Record<Scenario, Cell>>;
}

class Fail extends Error {}
const check = (ok: unknown, msg: string) => {
  if (!ok) throw new Fail(msg);
};

function args() {
  const a = process.argv.slice(2);
  const o = { names: [] as string[], jobs: 1, docker: new Set<string>(), scenarios: new Set<Scenario>(SCENARIOS) };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--jobs") o.jobs = Number(a[++i]);
    else if (a[i] === "--docker") for (const n of a[++i].split(",")) o.docker.add(n);
    else if (a[i] === "--scenario") o.scenarios = new Set(a[++i].split(",") as Scenario[]);
    else o.names.push(a[i]);
  }
  return o;
}

const sh = (cmd: string, cwd: string, env: Record<string, string> = {}) => spawnSync("bash", ["-c", cmd], { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 20 * 60_000 });

function pickTool(fw: Framework, forceDocker: boolean): Tool | string {
  const dir = path.join(KIT, "projects", fw.project);
  const local: Tool = { docker: false, run: (c) => c };
  if (!fw.local) return local;
  if (!forceDocker && sh(fw.local, dir).status === 0) return local;
  if (!fw.docker) return `no local toolchain (${fw.local}) and no Docker image`;
  if (sh("docker info", dir).status !== 0) return `no local toolchain (${fw.local}) and Docker is not running`;
  return { docker: true, run: (c) => `${IN_DOCKER} ${fw.docker!.image} ${c}` };
}

function prepare(fw: Framework, t: Tool, dir: string): string | undefined {
  if (!fw.prepare) return;
  const cmd = fw.prepare(t);
  const stampFile = path.join(dir, ".witness", "kit-prepared");
  const manifests = ["package.json", "package-lock.json", "requirements.txt", "composer.json", "composer.lock", "Gemfile", "Gemfile.lock", "pom.xml", "build.gradle", "go.mod"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  const stamp = JSON.stringify([cmd, ...manifests.map((f) => fs.statSync(f).mtimeMs)]);
  const installed = !fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, "node_modules"));
  if (installed && fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8") === stamp) return;
  const r = sh(cmd, dir, fw.env?.(t));
  if (r.status !== 0) return `prepare failed (${cmd}): ${(r.stdout + r.stderr).trim().split("\n").slice(-5).join(" | ")}`;
  fs.mkdirSync(path.dirname(stampFile), { recursive: true });
  fs.writeFileSync(stampFile, stamp);
}

const tq = (s: string) => JSON.stringify(s);

function toml(fw: Framework, t: Tool, o: { cmd: string; env?: Record<string, string>; extra?: string[] }): string {
  const env = { ...fw.env?.(t), ...o.env };
  return [
    "version = 1",
    "",
    "[[service]]",
    'name = "app"',
    `start = ${tq(`node ${APP}`)}`,
    'ready = { http = "${self.url}/health", timeout = "30s" }',
    "",
    "[[suite]]",
    'name = "kit"',
    `kind = ${tq(fw.kind ?? "api")}`,
    `adapter = ${tq(fw.adapter)}`,
    'service = "app"',
    `cmd = ${tq(o.cmd)}`,
    'timeout = "10m"',
    ...(o.extra ?? []),
    `env = { ${Object.entries(env).map(([k, v]) => `${k} = ${tq(v)}`).join(", ")} }`,
    "",
    "[run]",
    'stall_timeout = "4m"',
    "keep_runs = 100",
    "",
  ].join("\n");
}

interface W {
  code: number | null;
  stderr: string;
  stdout: string;
  ms: number;
  ctrf?: any;
  status?: any;
}

function witness(dir: string, config: string, argv: string[]): Promise<W> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI, ...argv, "--config", config], { cwd: dir, env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGINT"), 15 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const latest = path.join(dir, ".witness", "runs", "latest");
      const read = (f: string) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(latest, f), "utf8"));
        } catch {
          return undefined;
        }
      };
      resolve({ code, stdout, stderr, ms: Date.now() - t0, ctrf: argv[0] === "run" ? read("results.ctrf.json") : undefined, status: argv[0] === "run" ? read("status.json") : undefined });
    });
  });
}

type Want = Record<string, { status: string; detail?: string; obtained?: string }>;

/** The CTRF rows must be exactly `want`, by stable id. */
function expectRows(w: W, fw: Framework, want: Want) {
  check(w.ctrf, `no results.ctrf.json (exit ${w.code}): ${tail(w.stderr)}`);
  const rows: any[] = w.ctrf.results.tests;
  const got = new Map(rows.map((r) => [r.extra.witness.id, r]));
  const problems: string[] = [];
  for (const [id, e] of Object.entries(want)) {
    const r = got.get(`${fw.adapter}:${id}`);
    if (!r) problems.push(`missing row ${id}`);
    else {
      const d = r.extra.witness.status_detail;
      if (r.status !== e.status) problems.push(`${id}: ${r.status}${d ? `/${d}` : ""}, want ${e.status}`);
      if (e.detail !== undefined && d !== e.detail) problems.push(`${id}: status_detail ${d ?? "-"}, want ${e.detail}`);
      if (e.obtained && r.extra.witness.obtained !== e.obtained) problems.push(`${id}: obtained ${r.extra.witness.obtained}, want ${e.obtained}`);
    }
    got.delete(`${fw.adapter}:${id}`);
  }
  for (const [id, r] of got) problems.push(`unexpected row ${id} (${r.status})`);
  check(!problems.length, `${problems.join("; ")}${problems.some((p) => p.startsWith("unexpected") || p.startsWith("missing")) ? ` · rows: ${rows.map((r) => r.extra.witness.id).join(" | ")}` : ""}`);
}

function expectSuite(w: W, want: { state: string; passed?: number; failed?: number; skipped?: number; error?: number; missing?: number; cause?: string }) {
  const s = w.status?.suites?.[0];
  check(s, `no suite in status.json (exit ${w.code}): ${tail(w.stderr)}`);
  for (const [k, v] of Object.entries(want)) check(s[k] === v, `status.json suite ${k} = ${s[k] ?? "-"}, want ${v}${s.note ? ` (note: ${s.note})` : ""}`);
}

const tail = (s: string) => s.trim().split("\n").slice(-6).join(" | ");

const base = (fw: Framework): Want => ({
  [fw.ids.pass]: { status: "passed" },
  [fw.ids.fail]: { status: "failed" },
  [fw.ids.skip]: { status: "skipped" },
  [fw.ids.hang]: { status: "skipped" },
});

async function runScenario(fw: Framework, t: Tool, dir: string, sc: Scenario): Promise<Cell> {
  const t0 = Date.now();
  const cfg = (name: string, o: Parameters<typeof toml>[2]) => {
    const f = path.join(dir, ".witness", `kit-${name}.toml`);
    fs.writeFileSync(f, toml(fw, t, o));
    return f;
  };
  const sel = (ids: string[]) => ids.flatMap((id) => ["--select", `${fw.adapter}:${id}`]);
  try {
    switch (sc) {
      case "full": {
        const w = await witness(dir, cfg(sc, { cmd: fw.cmd(t) }), ["run", "--json"]);
        expectRows(w, fw, base(fw));
        expectSuite(w, { state: "failed", passed: 1, failed: 1, skipped: 2, error: 0, missing: 0 });
        check(w.code === 1, `exit ${w.code}, want 1`);
        const msg = w.ctrf.results.tests.find((r: any) => r.extra.witness.id === `${fw.adapter}:${fw.ids.fail}`)?.message ?? "";
        check(/banana|Fruits/.test(msg), `the failure message does not show the assertion: ${JSON.stringify(msg.slice(0, 200))}`);
        return { result: "pass", detail: `4 rows, ${(w.ms / 1000).toFixed(0)}s`, ms: Date.now() - t0 };
      }
      case "select": {
        const w = await witness(dir, cfg(sc, { cmd: fw.cmd(t) }), ["run", "--json", ...sel([fw.ids.pass, fw.ids.fail])]);
        expectRows(w, fw, { [fw.ids.pass]: { status: "passed" }, [fw.ids.fail]: { status: "failed" } });
        expectSuite(w, { state: "failed", passed: 1, failed: 1, skipped: 0 });
        for (const n of [1, 2]) {
          const again = await witness(dir, cfg(sc, { cmd: fw.cmd(t) }), ["run", "--json", ...sel([fw.ids.pass])]);
          check(again.code === 0, `selecting the passing test alone, run ${n}: exit ${again.code} (${again.status?.suites?.[0]?.note ?? tail(again.stderr)})`);
          expectRows(again, fw, { [fw.ids.pass]: { status: "passed" } });
        }
        return { result: "pass", detail: "only the selected ran; the same selection twice in a row still reports", ms: Date.now() - t0 };
      }
      case "list": {
        const config = cfg(sc, { cmd: fw.cmd(t) });
        const bogus = `${fw.adapter}:${fw.ids.pass.replace(/(\w+)(\W*)$/, "$1Bogus$2")}`;
        const ids = Object.values(fw.ids);
        fs.writeFileSync(path.join(dir, ".witness", "plan.yaml"), `version: 1\nsource: conformance kit\nitems:\n  - id: K1\n    behavior: the kit tests exist\n    expect: listed\n    kind: new\n    tests: [${[...ids.map((i) => `${fw.adapter}:${i}`), bogus].map((x) => JSON.stringify(x)).join(", ")}]\n`);
        const w = await witness(dir, config, ["plan", "check", "--json"]);
        const out = JSON.parse(w.stdout || "{}");
        const l = out.listings?.[0];
        check(l, `no listing in plan check output (exit ${w.code}): ${tail(w.stderr)}`);
        check(l.source === fw.list, `list source ${l.source} (${l.detail}), want ${fw.list}`);
        const listed = new Set<string>(l.ids ?? []);
        const lost = ids.filter((i) => !listed.has(i));
        const extra = [...listed].filter((i) => !ids.includes(i));
        check(!lost.length && !extra.length, `listing: missing ${JSON.stringify(lost)}, extra ${JSON.stringify(extra)}`);
        const states = Object.fromEntries((out.tests as any[]).map((x) => [x.test, x.state]));
        check(ids.every((i) => states[`${fw.adapter}:${i}`] === "found") && states[bogus] === "missing", `plan check states ${JSON.stringify(states)}`);
        return { result: "pass", detail: l.detail, ms: Date.now() - t0 };
      }
      case "missing":
      case "broken": {
        const env: Record<string, string> = {};
        if (fw.reportPaths) env.KIT_REPORT_PATHS = fw.reportPaths;
        if (fw.stdoutReport) env.KIT_STDOUT_REPORT = "1";
        const w = await witness(dir, cfg(sc, { cmd: `node ${BREAK} ${sc} ${fw.cmd(t)}`, env }), ["run", "--json"]);
        // the report of go is its stdout: no JSON events in it reads as unreadable, and a cut stream keeps the tests it finished
        const cause = sc === "missing" && !fw.stdoutReport ? "report_missing" : "report_unreadable";
        const partial = sc === "broken" && fw.stdoutReport;
        const want = Object.fromEntries(Object.entries(base(fw)).map(([k, v]) => [k, partial ? v : { ...v, obtained: "per-test-rerun" }]));
        expectRows(w, fw, want);
        check(w.ctrf.results.tests.some((r: any) => r.extra.witness.obtained === "per-test-rerun"), "no test was rerun alone");
        expectSuite(w, { state: "failed", cause, passed: 1, failed: 1, skipped: 2 });
        return { result: "pass", detail: `${cause}, 4 tests rerun alone (${w.status.suites[0].note?.split(" · ").pop()})`, ms: Date.now() - t0 };
      }
      case "timeout": {
        if ("na" in fw.timeout) return { result: "n.a.", detail: fw.timeout.na, ms: 0 };
        const extra = [`per_test_timeout = ${tq(fw.timeout.perTest)}`, ...(fw.timeout.arg ? [`per_test_timeout_arg = ${tq(fw.timeout.arg)}`] : [])];
        const w = await witness(dir, cfg(sc, { cmd: fw.cmd(t), env: { WITNESS_KIT_HANG: "1" }, extra }), ["run", "--json"]);
        const want = base(fw);
        want[fw.ids.hang] = { status: "failed", detail: "timeout" };
        expectRows(w, fw, want);
        expectSuite(w, { state: "failed", passed: 1, failed: 1, skipped: 1, error: 1 });
        check(w.ms < 180_000, `took ${(w.ms / 1000).toFixed(0)}s`);
        return { result: "pass", detail: `hang stopped at ${fw.timeout.perTest}${fw.timeout.arg ? ` via per_test_timeout_arg ${fw.timeout.arg}` : ""}, run ${(w.ms / 1000).toFixed(0)}s`, ms: Date.now() - t0 };
      }
      case "evidence": {
        const w = await witness(dir, cfg(sc, { cmd: fw.cmd(t) }), ["run", "--json", ...sel([fw.ids.pass])]);
        expectRows(w, fw, { [fw.ids.pass]: { status: "passed" } });
        const run = path.join(dir, ".witness", "runs", "latest");
        const arts: { file: string; test_id: string | null; artifact_type: string }[] = JSON.parse(fs.readFileSync(path.join(run, "artifacts.json"), "utf8"));
        const own = arts.filter((a) => a.test_id === `${fw.adapter}:${fw.ids.pass}`);
        if ("file" in fw.evidence) {
          const want = fw.evidence.file;
          check(own.some((a) => a.artifact_type === want), `no ${want} for the passing test; artifacts: ${JSON.stringify(arts.map((a) => [a.test_id, a.artifact_type, a.file]))}`);
          return { result: "pass", detail: `${want} collected by the preset`, ms: Date.now() - t0 };
        }
        const kind = fw.evidence.kind;
        const file = own.find((a) => a.artifact_type === "evidence");
        check(file, `no evidence.jsonl tied to the passing test; folders: ${JSON.stringify([...new Set(arts.map((a) => path.dirname(a.file)))])}`);
        const ev = readEvidence(path.join(run, file!.file));
        check(!ev.problems.length, `evidence problems: ${JSON.stringify(ev.problems)}`);
        const o = ev.observations.find((x) => x.kind === kind);
        check(o, `no ${kind} observation: ${JSON.stringify(ev.observations.map((x) => x.kind))}`);
        const d = o!.data as Record<string, unknown>;
        check(kind !== "http" || (d.status === 200 && /\/api\/items$/.test(String(d.url))), `http observation ${JSON.stringify(d).slice(0, 200)}`);
        check(kind !== "cli" || d.exit === 0, `cli observation ${JSON.stringify(d).slice(0, 200)}`);
        const md = fs.readFileSync(path.join(run, "report.md"), "utf8");
        return { result: "pass", detail: `${ev.observations.length} observation(s): ${titleOf(o!)}${md.includes(titleOf(o!)) ? "" : " (not in report.md)"}`, ms: Date.now() - t0 };
      }
      case "capture": {
        if (!fw.capture) return { result: "n.a.", detail: `a ${fw.kind ?? "api"} suite: no screenshots expected`, ms: 0 };
        const id = `${fw.adapter}:${fw.ids.pass}`;
        const run = path.join(dir, ".witness", "runs", "latest");
        const read = (f: string) => fs.readFileSync(path.join(run, f), "utf8");
        const warning = "The passing test in kit (ui) left no screenshot or video";
        const on = cfg(sc, { cmd: fw.cmd(t) });
        const c = await witness(dir, on, ["check", "--json"]);
        check(c.code === 0 && /capture ok/.test(c.stderr) && !JSON.parse(c.stdout || "{}").warnings?.length, `check with capture: exit ${c.code}: ${tail(c.stderr)}`);
        const w = await witness(dir, on, ["run", "--json", ...sel([fw.ids.pass])]);
        expectRows(w, fw, { [fw.ids.pass]: { status: "passed" } });
        const own = (JSON.parse(read("artifacts.json")) as { file: string; test_id: string | null; artifact_type: string }[]).filter((a) => a.test_id === id);
        const shot = own.find((a) => a.artifact_type === "screenshot");
        const video = own.find((a) => a.artifact_type === "video");
        check(shot && video, `the passing test has ${JSON.stringify(own.map((a) => a.artifact_type))}, want a screenshot and a video`);
        const html = read("report.html");
        check(html.includes(`<img class="thumb" src="${shot!.file}"`) && html.includes(`<video class="thumb" src="${video!.file}"`), "report.html does not show the screenshot and the video");
        check(!read("report.md").includes("left no screenshot or video"), "report.md warns although the test recorded both");
        const off = cfg(`${sc}-off`, { cmd: fw.cmd(t), env: { WITNESS_EVIDENCE: "" } });
        const c2 = await witness(dir, off, ["check", "--json"]);
        const warned = (JSON.parse(c2.stdout || "{}").warnings ?? []).find((x: { suite: string }) => x.suite === "kit");
        check(c2.code === 0 && /left no screenshot or video/.test(warned?.message ?? ""), `check without capture: exit ${c2.code}, no capture warning: ${tail(c2.stderr)}`);
        const w2 = await witness(dir, off, ["run", "--json", ...sel([fw.ids.pass])]);
        expectRows(w2, fw, { [fw.ids.pass]: { status: "passed" } });
        check(read("report.md").includes(`Warning: ${warning}`) && read("report.html").includes(warning), "the report does not warn when the test left no screenshot or video");
        return { result: "pass", detail: `${path.basename(shot!.file)} and ${path.basename(video!.file)} in report.html; check and the report warn with capture off`, ms: Date.now() - t0 };
      }
      case "compound": {
        const config = cfg(sc, { cmd: fw.compound(t) });
        const s = await witness(dir, config, ["run", "--json", ...sel([fw.ids.pass, fw.ids.fail])]);
        expectRows(s, fw, { [fw.ids.pass]: { status: "passed" }, [fw.ids.fail]: { status: "failed" } });
        const f = await witness(dir, config, ["run", "--json"]);
        expectRows(f, fw, base(fw));
        return { result: "pass", detail: "select and full run through ${WITNESS_SELECT}", ms: Date.now() - t0 };
      }
    }
  } catch (e) {
    if (e instanceof Fail) return { result: "fail", detail: e.message, ms: Date.now() - t0 };
    throw e;
  }
}

async function runFramework(fw: Framework, o: ReturnType<typeof args>, log: (s: string) => void): Promise<FwResult> {
  const dir = path.join(KIT, "projects", fw.project);
  const res: FwResult = { name: fw.name, toolchain: "", versions: "", cells: {} };
  const t = pickTool(fw, o.docker.has(fw.name));
  if (typeof t === "string") {
    res.toolchain = "none";
    for (const sc of o.scenarios) res.cells[sc] = { result: "n.a.", detail: t, ms: 0 };
    log(`${fw.name}: n.a. (${t})`);
    return res;
  }
  res.toolchain = t.docker ? `docker ${fw.docker!.image}` : "local";
  for (const d of ["runs", "cache", "check"]) fs.rmSync(path.join(dir, ".witness", d), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, ".witness"), { recursive: true });
  log(`${fw.name}: preparing (${res.toolchain})`);
  const bad = prepare(fw, t, dir);
  if (bad) {
    for (const sc of o.scenarios) res.cells[sc] = { result: "fail", detail: bad, ms: 0 };
    log(`${fw.name}: ${bad}`);
    return res;
  }
  const v = sh(fw.versions(t), dir, fw.env?.(t));
  res.versions = (v.stdout + v.stderr).trim().split("\n").filter((l) => l.trim() && !/^\s*$|WARNING|Downloading|Welcome/.test(l)).slice(0, 4).join("; ");
  const capCfg = path.join(dir, ".witness", "kit-check.toml");
  fs.writeFileSync(capCfg, toml(fw, t, { cmd: fw.cmd(t) }));
  const cap = await witness(dir, capCfg, ["check", "--stage", "config", "--json"]);
  res.capabilities = JSON.parse(cap.stdout || "{}").capabilities?.[0];
  for (const sc of SCENARIOS.filter((s) => o.scenarios.has(s))) {
    const c = await runScenario(fw, t, dir, sc);
    res.cells[sc] = c;
    log(`${fw.name} · ${sc}: ${c.result}${c.result === "pass" ? "" : ` · ${c.detail}`} (${(c.ms / 1000).toFixed(0)}s)`);
  }
  return res;
}

function matrix(results: FwResult[], scenarios: Scenario[]): string {
  const head = ["framework", "toolchain", ...scenarios];
  const rows = results.map((r) => [r.name, r.toolchain, ...scenarios.map((s) => r.cells[s]?.result ?? "-")]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(w[i])).join("  ");
  return [line(head), line(w.map((n) => "-".repeat(n))), ...rows.map(line)].join("\n");
}

async function main() {
  const o = args();
  const unknown = o.names.filter((n) => !FRAMEWORKS.some((f) => f.name === n));
  if (unknown.length) {
    console.error(`unknown framework(s): ${unknown.join(", ")}; one of ${FRAMEWORKS.map((f) => f.name).join(", ")}`);
    process.exit(64);
  }
  const fws = o.names.length ? FRAMEWORKS.filter((f) => o.names.includes(f.name)) : FRAMEWORKS;
  const log = (s: string) => console.error(`kit  ${s}`);
  const results: FwResult[] = new Array(fws.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, o.jobs) }, async () => {
      for (let i = next++; i < fws.length; i = next++) results[i] = await runFramework(fws[i], o, log);
    }),
  );
  const scenarios = SCENARIOS.filter((s) => o.scenarios.has(s));
  console.log(`\n${matrix(results, scenarios)}\n`);
  for (const r of results) for (const s of scenarios) if (r.cells[s]?.result === "fail") console.log(`FAIL ${r.name} · ${s}: ${r.cells[s]!.detail}`);
  const out = path.join(KIT, ".results");
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, node: process.version, results }, null, 2));
  fs.copyFileSync(file, path.join(out, "latest.json"));
  console.log(`results: ${file}`);
  process.exit(results.some((r) => Object.values(r.cells).some((c) => c?.result === "fail")) ? 1 : 0);
}

await main();
