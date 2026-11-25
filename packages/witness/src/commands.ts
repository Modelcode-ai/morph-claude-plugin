import { writeReport, writeRunsIndex } from "./report/index.ts";
import { renderMd } from "./report/md.ts";
import { buildModel } from "./report/model.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { ADAPTERS, addArgs, fillSelect } from "./adapters.ts";
import { type Config, loadEnv, type Suite, substitute } from "./config.ts";
import { type Diagnosis, diagnose, formatDiagnosis } from "./diagnosis.ts";
import { functionalWarnings } from "./functional.ts";
import { type Capabilities, capabilities, capabilityLine, listSuiteTests } from "./listing.ts";
import { color, outcomeColor, Progress } from "./output.ts";
import { childEnv, groupAlive, killGroup, runCapture } from "./proc.ts";
import { EXIT, type TestRecord } from "./reconcile.ts";
import { acquireLock, LockError, newRunId, reapStale, RunDir, resolveRun, type Status } from "./rundir.ts";
import { type ReferenceSide, referenceSetup, releaseReference, resolveReference } from "./reference.ts";
import { describeRepoSide } from "./repos.ts";
import { neededServices, pickSuites, verdictSummary } from "./run.ts";
import { Failure, readUp, Stack, upFile, type UpState } from "./stack.ts";
import { canSelect, collectArtifacts, runSuite, type SuiteCtx } from "./suite.ts";
import { CAPTURE_FIX, VISUAL_KINDS, visualGaps } from "./evidence/visuals.ts";
import { gitInfo, pidAlive, readJson, sleep, writeJson } from "./util.ts";

type Stage = "config" | "deps" | "boot" | "suite";
const STAGES: Stage[] = ["config", "deps", "boot", "suite"];

function printDiag(p: Progress, d: Diagnosis) {
  for (const l of formatDiagnosis(d)) p.plain(`  ${l}`);
}

/** Validate config, env, deps, boot each service, then list or smoke-run each suite. */
export async function checkCommand(cfg: Config, o: { stage?: Stage; service?: string; suites?: string[]; json: boolean; noSetup: boolean; against?: string; againstRepos?: Record<string, string> }): Promise<number> {
  const p = new Progress();
  const upTo = STAGES.indexOf(o.stage ?? "suite");
  const report: { stage: Stage; ok: boolean; detail: string; diagnosis?: Diagnosis }[] = [];
  const warnings = functionalWarnings(cfg);
  const caps: Capabilities[] = pickSuites(cfg, o.suites).map((s) => capabilities(s, cfg.root, path.resolve(s.root ?? cfg.root, s.cwd), { stallMs: cfg.run.stallMs }));
  const done = (code: number) => {
    if (o.json) process.stdout.write(JSON.stringify({ ok: code === 0, stages: report, warnings, capabilities: caps }, null, 2) + "\n");
    return code;
  };
  report.push({ stage: "config", ok: true, detail: `${cfg.services.length} service(s), ${cfg.suites.length} suite(s), adapters: ${[...new Set(cfg.suites.map((s) => s.adapter))].join(", ") || "-"}` });
  p.line(`check  config · ok · ${report[0].detail}`);
  for (const r of cfg.repos) p.line(`check  repo ${r.name} · ${r.root}${r.file ? "" : " (no witness.toml: listed for its commit and suites)"}${r.via ? ` · listed by ${r.via}` : ""}`);
  for (const w of warnings) p.line(color.yellow(`check  warn · ${w.message}`));
  for (const c of caps) {
    p.line(`check  suite ${c.suite} · ${capabilityLine(c)}`);
    for (const x of c.consequences) p.plain(`         - ${x}`);
  }
  if (upTo < 1) {
    p.plain(color.green("CHECK ok · config"));
    return done(0);
  }

  const { env, missing, fileUsed, repos: repoEnvs, missingFiles } = loadEnv(cfg);
  if (missing.length) {
    const d = diagnose({ stage: "config", cause: "missing_env", envMissing: missing, envFiles: missingFiles });
    report.push({ stage: "deps", ok: false, detail: "missing env", diagnosis: d });
    p.line(color.red(`check  env · missing ${missing.join(", ")}${fileUsed ? ` (env file ${fileUsed})` : ""}`));
    printDiag(p, d);
    return done(EXIT.mistrial);
  }
  let release: () => void;
  try {
    release = acquireLock(path.join(cfg.root, ".witness", "run.lock"));
  } catch (e) {
    if (e instanceof LockError) {
      p.plain(color.red(e.message));
      return done(EXIT.error);
    }
    throw e;
  }
  const checkRoot = path.join(cfg.root, ".witness", "check");
  await reapStale(checkRoot, cfg.run.graceMs, (m) => p.line(m));
  fs.rmSync(checkRoot, { recursive: true, force: true });
  const g = gitInfo(cfg.root);
  const run = new RunDir(checkRoot, newRunId(), { commit: g.commit, branch: g.branch, dirty: g.dirty, label: "check" });
  const abort = { aborted: false };
  const onSig = () => (abort.aborted = true);
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  let side: ReferenceSide | undefined;
  if (o.against) {
    const r = resolveReference(cfg, o.against, o.againstRepos);
    if ("diagnosis" in r) {
      release();
      p.line(color.red(`check  --against ${o.against} · ${r.diagnosis.evidence}`));
      return done(EXIT_USAGE);
    }
    side = r;
    if (r.worktree) {
      run.state.worktrees.push(r.worktree);
      run.saveState();
      p.line(`check  against ${r.label} · checked out ${r.sha!.slice(0, 10)} in ${r.worktree}${r.copied ? " (with this checkout's .witness/)" : ""}`);
    } else p.line(`check  against ${r.label} · reference services run in ${r.root}`);
    for (const x of r.repos) p.line(`check  against repo ${x.name} · ${describeRepoSide(x)}`);
    if (r.repos.some((x) => x.worktree)) {
      run.state.worktrees.push(...r.repos.flatMap((x) => (x.worktree ? [x.worktree] : [])));
      run.saveState();
    }
  }
  const root = side?.root ?? cfg.root;
  const suiteRoot = side?.suiteRoot ?? cfg.root;
  const fresh = !!side?.worktree || !!side?.repos.some((x) => x.worktree);
  const stack = new Stack({ cfg: side?.cfg ?? cfg, root, baseEnv: env, repoEnvs, logDir: run.file("logs"), progress: p, run, noSetup: o.noSetup && !fresh, setupCacheDir: side ? side.setupCacheDir : path.join(cfg.root, ".witness", "cache", "setup"), runDirPath: run.dir, abort, reuse: side ? null : readUp(cfg.root) });
  let code = 0;
  try {
    if (side) {
      const failed = await referenceSetup(side, { cfg, baseEnv: env, logDir: run.file("logs"), abort, run });
      if (failed) throw new Failure(failed);
    }
    await stack.checkDeps();
    report.push({ stage: "deps", ok: true, detail: `${cfg.dependencies.length} dependency check(s) passed` });
    if (upTo < 2) {
      p.plain(color.green(`CHECK ok · up to deps${o.against ? ` · against ${o.against}` : ""}`));
      return done(0);
    }
    const targets = cfg.services.filter((s) => s.role === "target").map((s) => s.name);
    const needed = neededServices(cfg, pickSuites(cfg, o.suites));
    const unused = cfg.suites.length ? targets.filter((n) => !needed.includes(n)) : [];
    const services = o.service ? [o.service] : targets.filter((n) => !unused.includes(n));
    if (!o.service && unused.length) p.line(color.yellow(`check  boot · not starting ${unused.join(", ")}: no suite checked here uses it (suites with service = [] start the app themselves); remove it, or name it in a suite's service`));
    for (const s of services) if (!cfg.services.some((x) => x.name === s)) throw new Error(`unknown service "${s}"`);
    await stack.boot(services);
    report.push({ stage: "boot", ok: true, detail: [...stack.live.values()].map((l) => `${l.svc.name} at ${l.url}`).join(", ") || "no services" });
    if (upTo < 3) {
      p.plain(color.green(`CHECK ok · up to boot${o.against ? ` · against ${o.against}` : ""}`));
      return done(0);
    }
    const suites = pickSuites(side?.cfg ?? cfg, o.suites).filter((s) => !o.service || !s.services || s.services.includes(o.service));
    const ctx = { cfg, root: suiteRoot, outDir: run.dir, stack, run, progress: p, abort, baseEnv: env, activity: { text: "" } };
    for (const s of suites) {
      const ad = ADAPTERS[s.adapter];
      const hint = s.report ? undefined : ad.reportHint?.(path.resolve(s.root ?? suiteRoot, s.cwd), s.cmd);
      if (hint) {
        const d = diagnose({ stage: "report", cause: "report_missing", suite: s.name, command: s.cmd, evidence: hint, extraTry: [hint] });
        report.push({ stage: "suite", ok: false, detail: `${s.name}: cannot write a per-test report`, diagnosis: d });
        p.line(color.red(`check  suite ${s.name} · cannot write a per-test report`));
        printDiag(p, d);
        code = Math.max(code, EXIT.error);
        continue;
      }
      const cwd = path.resolve(s.root ?? suiteRoot, s.cwd);
      const svars = stack.vars(undefined, s);
      const cenv = childEnv(stack.envOf(s.repo), { ...stack.serviceUrlEnv(s.repo), ...ad.env, ...Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, substitute(v, svars)])) });
      let pluginMissing = false;
      for (const pl of ad.plugins ?? []) {
        if (!pl.needed(!!s.perTestTimeoutMs) || !pl.probeArgs) continue;
        const r = await runCapture(fillSelect(addArgs(substitute(s.cmd, svars), pl.probeArgs)), { cwd, env: cenv, timeoutMs: 5 * 60_000, log: run.file("logs", `${s.name}.plugins.log`), abort, track: run.tracker("list", s.name) });
        if (r.code === 0 || !pl.missing.test(r.out)) continue;
        const d = diagnose({ stage: "suite", cause: "setup_failed", suite: s.name, command: s.cmd, evidence: r.out.split(/\r?\n/).find((l) => pl.missing.test(l))?.trim(), extraTry: [pl.hint] });
        report.push({ stage: "suite", ok: false, detail: `${s.name}: ${pl.name} is missing`, diagnosis: d });
        p.line(color.red(`check  suite ${s.name} · ${pl.name} is missing: ${pl.hint}`));
        printDiag(p, d);
        code = Math.max(code, EXIT.error);
        pluginMissing = true;
      }
      if (pluginMissing) continue;
      const l = await listSuiteTests(s, { root: cfg.root, cwd, vars: svars, env: cenv, log: run.file("logs", `${s.name}.list.log`), scratch: run.file("reports", s.name, "list"), abort, track: run.tracker("list", s.name) });
      const cap = caps.find((c) => c.suite === s.name);
      if (cap) cap.list = l.detail.replace(/^list: /, "");
      if (l.ids && l.source !== "last-report") {
        report.push({ stage: "suite", ok: true, detail: `${s.name}: ${l.ids.length} test(s) listed (${l.detail})` });
        p.line(`check  suite ${s.name} · ${l.ids.length} test(s) listed (${l.detail}), e.g. ${s.adapter}:${l.ids[0]}`);
        if (!VISUAL_KINDS.includes(s.kind) || !l.ids.length) continue;
        if (!canSelect(s, ad, stack.vars())) {
          p.line(`check  suite ${s.name} · capture not checked: the suite can't run a single test`);
          continue;
        }
        p.line(`check  suite ${s.name} · running ${s.adapter}:${l.ids[0]} to see whether it leaves a screenshot or video`);
        const r = await runSuite(ctx, s, [l.ids[0]], 0);
        const w = captureWarning(ctx, s, r.tests);
        if (w) warnings.push(w);
        if (r.serviceDied) break;
        continue;
      }
      p.line(`check  suite ${s.name} · ${l.detail}; doing a smoke run`);
      const r = await runSuite(ctx, s, undefined, 0);
      const ok = r.summary.state === "passed" || r.summary.state === "failed";
      report.push({ stage: "suite", ok, detail: `${s.name}: ${r.summary.state}`, diagnosis: r.diagnosis });
      if (!ok) {
        code = Math.max(code, r.serviceDied ? EXIT.mistrial : EXIT.error);
        if (r.diagnosis) printDiag(p, r.diagnosis);
      }
      if (VISUAL_KINDS.includes(s.kind)) {
        const w = captureWarning(ctx, s, r.tests);
        if (w) warnings.push(w);
      }
      if (r.serviceDied) break;
    }
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    const stage = e.diagnosis.stage === "deps" ? "deps" : "boot";
    report.push({ stage, ok: false, detail: e.diagnosis.cause, diagnosis: e.diagnosis });
    p.line(color.red(`check  ${stage} · ${e.diagnosis.cause}`));
    printDiag(p, e.diagnosis);
    code = EXIT.mistrial;
  } finally {
    await stack.teardown();
    if (side) {
      releaseReference(side);
      run.state.worktrees = [];
      run.saveState();
    }
    run.status.phase = "finished";
    run.saveStatus();
    release();
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
  if (abort.aborted) code = EXIT.interrupted;
  const on = o.against ? ` · against ${o.against}` : "";
  p.plain(code === 0 ? color.green(`CHECK ok${on}`) : color.yellow(`CHECK failed${on} · logs: ${run.file("logs")}`));
  return done(code);
}

/** Prints whether the passing tests a check ran left a screenshot or video; the warning when none did. */
function captureWarning(ctx: SuiteCtx, s: Suite, tests: TestRecord[]): { suite: string; files: string[]; message: string } | undefined {
  const g = visualGaps([s], tests, collectArtifacts(ctx.run.dir, ctx.outDir, tests))[0];
  if (!g) {
    ctx.progress.line(`check  suite ${s.name} · capture not checked: no test passed (${tests.map((t) => `${t.id} ${t.status}`).slice(0, 3).join(", ") || "no result"})`);
    return undefined;
  }
  if (!g.bare.length) {
    ctx.progress.line(`check  suite ${s.name} · capture ok: ${g.passed === 1 ? tests.find((t) => t.status === "passed")!.id : `${g.passed} passing tests`} left a screenshot or video`);
    return undefined;
  }
  const who = g.passed === 1 ? `its test ${g.bare[0]} passed but` : `${g.bare.length} of ${g.passed} passing tests`;
  const message = `suite ${s.name} (${s.kind}): ${who} left no screenshot or video; ${CAPTURE_FIX}`;
  ctx.progress.line(color.yellow(`check  warn · ${message}`));
  return { suite: s.name, files: [], message };
}

const EXIT_USAGE = 64;

/** Start deps and services and leave them running; `run` reuses them. */
export async function upCommand(cfg: Config, o: { service?: string; noSetup: boolean; json: boolean; runDirRoot: string }): Promise<number> {
  const p = new Progress();
  const existing = readUp(cfg.root);
  if (existing && Object.values(existing.services).some((s) => (s.pgid && groupAlive(s.pgid)) || (s.pid && pidAlive(s.pid)))) {
    p.plain(`services are already up (${Object.keys(existing.services).join(", ")}); run \`witness down\` first`);
    return EXIT.error;
  }
  const { env, missing, missingFiles, repos: repoEnvs } = loadEnv(cfg);
  if (missing.length) {
    printDiag(p, diagnose({ stage: "config", cause: "missing_env", envMissing: missing, envFiles: missingFiles }));
    return EXIT.mistrial;
  }
  await reapStale(o.runDirRoot, cfg.run.graceMs, (m) => p.line(m));
  const logDir = path.join(cfg.root, ".witness", "up", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const abort = { aborted: false };
  const stack = new Stack({ cfg, root: cfg.root, baseEnv: env, repoEnvs, logDir, progress: p, noSetup: o.noSetup, setupCacheDir: path.join(cfg.root, ".witness", "cache", "setup"), abort });
  try {
    await stack.checkDeps();
    await stack.boot(o.service ? [o.service] : neededServices(cfg, cfg.suites));
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    await stack.teardown();
    p.plain(color.yellow(`UP failed · ${e.diagnosis.cause}`));
    printDiag(p, e.diagnosis);
    return EXIT.mistrial;
  }
  const state: UpState = { pid: process.pid, started_at: new Date().toISOString(), root: cfg.root, services: {}, deps_started: stack.depsStarted.map((d) => d.name) };
  for (const [n, l] of stack.live) state.services[n] = { pgid: l.pgid, pid: l.pid, port: l.port, url: l.url, log: l.log, external: !!l.svc.external };
  writeJson(upFile(cfg.root), state);
  for (const l of stack.live.values()) l.proc?.child.unref();
  p.plain(color.green(`UP · ${[...stack.live.values()].map((l) => `${l.svc.name} ${l.url}`).join(" · ")}`));
  if (o.json) process.stdout.write(JSON.stringify(state, null, 2) + "\n");
  return 0;
}

export async function downCommand(cfg: Config, o: { json: boolean }): Promise<number> {
  const p = new Progress();
  const state = readUp(cfg.root);
  if (!state) {
    p.plain("nothing is up");
    return 0;
  }
  const { env, repos } = loadEnv(cfg);
  const envOf = (repo?: string) => (repo && repos[repo]) || env;
  for (const [name, s] of Object.entries(state.services).reverse()) {
    const svc = cfg.services.find((x) => x.name === name);
    if (s.external) continue;
    if (svc?.stop) await runCapture(svc.stop, { cwd: path.resolve(svc.root ?? cfg.root, svc.cwd), env: childEnv(envOf(svc.repo), { PORT: String(s.port ?? "") }), timeoutMs: 60_000, log: s.log });
    if (s.pid && pidAlive(s.pid)) {
      try {
        process.kill(s.pid, "SIGTERM");
      } catch {
        /* gone */
      }
      for (let i = 0; i < 50 && pidAlive(s.pid); i++) await sleep(100);
    }
    if (s.pgid) await killGroup(s.pgid, cfg.run.graceMs);
    p.line(`down   ${name} · stopped`);
  }
  for (const d of [...state.deps_started].reverse()) {
    const dep = cfg.dependencies.find((x) => x.name === d);
    if (dep?.stop) {
      await runCapture(dep.stop, { cwd: dep.root ?? cfg.root, env: childEnv(envOf(dep.repo)), timeoutMs: 120_000 });
      p.line(`down   ${d} · stopped`);
    }
  }
  fs.rmSync(upFile(cfg.root), { force: true });
  if (o.json) process.stdout.write(JSON.stringify({ ok: true }) + "\n");
  return 0;
}

export function statusCommand(runRoot: string, id: string | undefined, json: boolean): number {
  const dir = resolveRun(runRoot, id);
  const st = dir ? readJson<Status | null>(path.join(dir, "status.json"), null) : null;
  if (!st) {
    process.stderr.write(`witness  no run found${id ? ` for ${id}` : ""} under ${runRoot}\n`);
    return EXIT.error;
  }
  if (json) {
    process.stdout.write(JSON.stringify(st, null, 2) + "\n");
    return 0;
  }
  const o = st.outcome ?? "running";
  const lines = [`${st.run_id} · ${st.phase}${st.outcome ? ` · ${outcomeColor(o)(o)}` : ""} · ${st.branch} @ ${st.commit.slice(0, 10)}${st.dirty ? " (dirty)" : ""}`];
  for (const [n, r] of Object.entries(st.repos ?? {})) lines.push(`repo ${n} · ${r.branch} @ ${r.commit.slice(0, 10)}${r.dirty ? " (dirty)" : ""}`);
  lines.push(`last event: ${st.last_event}`);
  if (st.phase !== "finished" && !pidAlive(st.pid)) lines.push(color.yellow(`witness (pid ${st.pid}) is gone; the next run will reap this one`));
  for (const s of st.suites) lines.push(`  ${s.name.padEnd(20)} ${(s.kind ?? "").padEnd(7)} ${s.state.padEnd(11)} ${s.passed} passed, ${s.failed} failed, ${s.error} error, ${s.missing} missing, ${s.skipped} skipped${s.cause ? ` · ${s.cause}` : ""}${s.state === "skipped" && s.note ? ` · ${s.note}` : ""}`);
  if (st.summary) lines.push(verdictSummary(st));
  if (st.diagnosis) lines.push(...formatDiagnosis(st.diagnosis).map((l) => `  ${l}`));
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

interface CtrfTest {
  name: string;
  status: string;
  message?: string;
  suite?: string;
  extra?: { witness?: { id: string; status_detail?: string; parity?: string; origin_status?: string; obtained?: string } };
}

const appCell = (services?: string[]) => (!services ? "-" : services.length ? services.join(", ") : "in the tests");

export function reportCommand(runRoot: string, id: string | undefined, format: string): number {
  const dir = resolveRun(runRoot, id);
  const st = dir ? readJson<Status | null>(path.join(dir, "status.json"), null) : null;
  if (!dir || !st) {
    process.stderr.write(`witness  no run found${id ? ` for ${id}` : ""} under ${runRoot}\n`);
    return EXIT.error;
  }
  if (format === "html") {
    const r = writeReport(dir);
    writeRunsIndex(runRoot);
    process.stdout.write(`${r.html}\n`);
    return 0;
  }
  if (format === "md") {
    process.stdout.write(renderMd(buildModel(dir)));
    return 0;
  }
  const ctrf = readJson<{ results?: { tests: CtrfTest[] } } | null>(path.join(dir, "results.ctrf.json"), null);
  const tests = ctrf?.results?.tests ?? [];
  const bad = tests.filter((t) => t.status === "failed" || t.status === "other");
  const differs = tests.filter((t) => t.extra?.witness?.parity === "differs");
  if (format === "json") {
    const out = { run_id: st.run_id, outcome: st.outcome, commit: st.commit, branch: st.branch, dirty: st.dirty, ...(st.repos ? { repos: st.repos } : {}), summary: st.summary, suites: st.suites, diagnosis: st.diagnosis, against: st.against, not_passing: bad.map((t) => ({ id: t.extra?.witness?.id, status: t.status, status_detail: t.extra?.witness?.status_detail, message: t.message })), parity_differs: differs.map((t) => ({ id: t.extra?.witness?.id, status: t.status, origin_status: t.extra?.witness?.origin_status })) };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }
  const md: string[] = [];
  md.push(`# Witness run ${st.run_id}: ${st.outcome ?? st.phase}`);
  md.push("");
  md.push(`${st.branch} @ \`${st.commit.slice(0, 12)}\`${st.dirty ? " (uncommitted changes)" : ""}${st.label ? ` · ${st.label}` : ""} · ${verdictSummary(st)}`);
  md.push("");
  md.push("| Suite | Kind | App | State | Passed | Failed | Error | Missing | Skipped |");
  md.push("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of st.suites) md.push(`| ${s.name} | ${s.kind ?? "-"} | ${appCell(s.services)} | ${s.state}${s.cause ? ` (${s.cause})` : ""}${s.state === "skipped" && s.note ? `: ${s.note}` : ""} | ${s.passed} | ${s.failed} | ${s.error} | ${s.missing} | ${s.skipped} |`);
  if (st.suites.some((s) => s.services && !s.services.length)) md.push("", "App: the services witness started for the suite, or \"in the tests\" when the tests start the app themselves (those suites don't exercise witness's services, and `--against` with origin services doesn't change what they test).");
  if (st.diagnosis) {
    md.push("", "## Diagnosis", "");
    for (const l of formatDiagnosis(st.diagnosis)) md.push(`- ${l.replace(/^(\w+):/, "**$1**:")}`);
  }
  if (bad.length) {
    md.push("", `## Not passing (${bad.length})`, "");
    for (const t of bad.slice(0, 50)) md.push(`- \`${t.extra?.witness?.id ?? t.name}\` ${t.status}${t.extra?.witness?.status_detail ? ` (${t.extra.witness.status_detail})` : ""}${t.message ? `: ${t.message.split("\n")[0].slice(0, 200)}` : ""}`);
    if (bad.length > 50) md.push(`- … ${bad.length - 50} more in results.ctrf.json`);
  }
  if (st.against) {
    md.push("", `## Against ${st.against.ref}`, "", `Origin outcome: ${st.against.outcome}.${st.against.parity ? ` Parity: ${Object.entries(st.against.parity).map(([k, v]) => `${v} ${k}`).join(", ")}.` : ""}`);
    for (const t of differs.slice(0, 50)) md.push(`- \`${t.extra?.witness?.id}\`: ${t.extra?.witness?.origin_status} on origin, ${t.status} on target`);
  }
  md.push("", `Run dir: \`${dir}\``);
  process.stdout.write(md.join("\n") + "\n");
  return 0;
}
