import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Claim, loadClaims } from "./claims.ts";
import { type Contract, mapRoute } from "./contract.ts";
import { judge, type Source } from "./judge.ts";
import type { TestResult } from "./junit.ts";
import { compareExchanges, type ParityResult } from "./parity.ts";
import type { Exchange } from "./proxy.ts";
import { writeRecord } from "./record.ts";
import { Mistrial, runSuites, Side, type SuiteRun } from "./session.ts";
import { applyJudge, assessClaim, type ClaimResult, counts, overall, type Verdict } from "./verdict.ts";
import { fmtMs, git, hashFiles, readJson, say, sha, tryGit, worktreeHash, writeJson } from "./util.ts";
import { lint } from "./lint.ts";

export interface VerifyOpts {
  level: "medium" | "high";
  base?: string | null;
  judge: boolean;
  sources: string[];
  why?: string;
  rerun: boolean;
  fresh: boolean;
}

interface SideCapture {
  runs: SuiteRun[];
  reruns: SuiteRun[];
  exchanges: Exchange[];
  bootMs: number;
}

export interface Bundle {
  schema: "witness.record/v0";
  level: string;
  verdict: Verdict;
  mistrial?: { message: string; remedy: string; logTail: string };
  repo: string;
  head: { tree: string; sha: string | null; branch: string | null; dirty: boolean };
  base?: { ref: string; sha: string };
  startedAt: string;
  ms: number;
  counts: Record<string, number>;
  claims: ClaimResult[];
  regressions: TestResult[];
  otherTests: TestResult[];
  exchanges: Exchange[];
  layers: Record<string, { key: string; reused: boolean; ms?: number; note?: string }>;
  warnings: string[];
  sources: { name: string; canOverturn: boolean }[];
  logs: string[];
  judgeCalls: number;
  originSide?: "base" | "origin";
  origin?: { kind: "evolve" | "migrate"; repo: string; sha: string | null };
}

const cacheDir = (c: Contract, layer: string, key: string) => path.join(c.home, "cache", layer, key);

function resolveBase(root: string, base: string | null | undefined): { ref: string; sha: string } | null {
  if (base === null) return null;
  const candidates = base ? [base] : ["origin/main", "main", "origin/master", "master"];
  for (const ref of candidates) {
    const s = tryGit(root, ["merge-base", "HEAD", ref]);
    if (s) {
      const head = tryGit(root, ["rev-parse", "HEAD"]);
      if (!base && s === head && worktreeHash(root) === tryGit(root, ["rev-parse", "HEAD^{tree}"])?.slice(0, 16)) continue;
      return { ref, sha: s };
    }
  }
  if (base) throw new Error(`Can't resolve base "${base}" (git merge-base HEAD ${base} failed).`);
  return null;
}

async function capture(contract: Contract, side: Side, logDir: string, rerun: boolean, only?: string[]): Promise<SideCapture> {
  await side.boot();
  try {
    const runs = await runSuites(contract, side, { logDir, only });
    const reruns: SuiteRun[] = [];
    const failed = runs.flatMap((r) => r.results.filter((t) => t.status === "failed").map((t) => t.id));
    if (rerun && failed.length && failed.length <= 10) {
      say("testimony", `${side.name}: re-examining ${failed.length} failed test(s) to rule out an unreliable witness`);
      reruns.push(...(await runSuites(contract, side, { logDir, only: failed, run: "rerun" })));
    }
    return { runs, reruns, exchanges: side.exchanges(), bootMs: side.bootMs };
  } finally {
    await side.shutdown();
  }
}

/** Capture origin observations per test, booting the origin only for tests not already on record. */
async function captureOrigin(
  contract: Contract,
  o: NonNullable<Contract["origin"]>,
  tests: string[],
  testsKey: string,
  contractHash: string,
  logDir: string,
  fresh: boolean,
  bundle: Bundle,
): Promise<SideCapture> {
  const originSha = tryGit(o.repoPath!, ["rev-parse", "HEAD"]) ?? "untracked";
  const oKey = sha(`${originSha}|${testsKey}|${contractHash}`);
  const dir = cacheDir(contract, "origin", oKey);
  const file = (t: string) => path.join(dir, `${t.replace(/[^\w.-]+/g, "_")}.json`);
  const missing = tests.filter((t) => fresh || !fs.existsSync(file(t)));
  const t1 = Date.now();
  if (missing.length) {
    say("subpoena", `booting origin ${o.repo}@${originSha.slice(0, 7)} for ${missing.length} test(s) not yet on record`);
    const side = new Side("origin", contract, o.repoPath!, logDir, { services: o.services, rewrite: (u) => mapRoute(o.routes ?? [], u) });
    const cap = await capture(contract, side, logDir, false, missing);
    const results = byId(cap.runs);
    for (const t of missing) writeJson(file(t), { result: results.get(t) ?? null, exchanges: cap.exchanges.filter((e) => e.test === t) });
  } else say("subpoena", `origin ${o.repo}@${originSha.slice(0, 7)}: all ${tests.length} test(s) already on record`);
  const per = tests.map((t) => readJson<{ result: TestResult | null; exchanges: Exchange[] }>(file(t), { result: null, exchanges: [] }));
  bundle.layers.origin = { key: oKey, reused: missing.length === 0, ms: missing.length ? Date.now() - t1 : undefined, note: `${tests.length - missing.length} reused, ${missing.length} captured` };
  return {
    runs: [{ suite: "origin", side: "origin", run: "primary", code: 0, ms: 0, log: "", results: per.map((p) => p.result).filter((r): r is TestResult => !!r) }],
    reruns: [],
    exchanges: per.flatMap((p) => p.exchanges),
    bootMs: 0,
  };
}

function byId(runs: SuiteRun[]): Map<string, TestResult> {
  const m = new Map<string, TestResult>();
  for (const r of runs) for (const t of r.results) m.set(t.id, t);
  return m;
}

function testSource(root: string, id: string): ClaimResult["source"] {
  const [cls, method] = id.split("#");
  const files = fs.globSync(path.join(root, "**", `${cls}.*`)).filter((f) => !f.includes("node_modules") && !f.includes("/target/") && !f.includes("/.witness/"));
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    const i = lines.findIndex((l) => new RegExp(`\\b${method}\\s*\\(`).test(l));
    if (i >= 0) {
      let start = i;
      while (start > 0 && /^\s*@/.test(lines[start - 1])) start--;
      let depth = 0;
      let end = i;
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
        end = j;
        if (j > i && depth <= 0) break;
      }
      return { file: path.relative(root, f), line: start + 1, snippet: lines.slice(start, Math.min(end + 1, start + 60)).join("\n") };
    }
  }
  return undefined;
}

function loadSources(root: string, home: string, base: { sha: string } | null, extra: string[], why?: string): Source[] {
  const out: Source[] = [];
  const atBase = (rel: string) => (base ? tryGit(root, ["show", `${base.sha}:${rel}`]) : null);
  const verify = atBase("VERIFY.md");
  if (verify) out.push({ name: "VERIFY.md@base", text: verify, canOverturn: true });
  if (base) {
    const list = tryGit(root, ["ls-tree", "--name-only", base.sha, ".witness/sources/"]);
    for (const f of (list ?? "").split("\n").filter(Boolean)) {
      const t = atBase(f);
      if (t) out.push({ name: `${f}@base`, text: t, canOverturn: true });
    }
  }
  const realRoot = fs.realpathSync(root);
  for (const f of extra) {
    const abs = fs.realpathSync(path.resolve(f));
    const inside = abs.startsWith(realRoot + path.sep);
    out.push({ name: path.basename(f), text: fs.readFileSync(abs, "utf8"), canOverturn: !inside });
  }
  for (const f of fs.existsSync(path.join(home, "claims")) ? fs.readdirSync(path.join(home, "claims")) : [])
    out.push({ name: `claims/${f}`, text: fs.readFileSync(path.join(home, "claims", f), "utf8"), canOverturn: false });
  const local = path.join(root, "VERIFY.md");
  if (fs.existsSync(local) && !verify) out.push({ name: "VERIFY.md", text: fs.readFileSync(local, "utf8"), canOverturn: false });
  if (base) {
    const log = tryGit(root, ["log", "--format=%s%n%b", `${base.sha}..HEAD`]);
    if (log) out.push({ name: "commit-messages", text: log, canOverturn: false });
  }
  if (why) out.push({ name: "change-description", text: why, canOverturn: false });
  return out;
}

function exchangeText(ex: Exchange[]): string {
  return ex
    .map((e) => `[${e.side}] ${e.method} ${e.path}${e.reqBody ? `\n  request: ${e.reqBody.slice(0, 800)}` : ""}\n  -> ${e.status} ${e.resBody.slice(0, 1500)}`)
    .join("\n");
}

export async function verify(contract: Contract, opts: VerifyOpts): Promise<{ bundle: Bundle; dir: string }> {
  const t0 = Date.now();
  const root = contract.root;
  const recordId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const dir = path.join(contract.home, "records", recordId);
  const logDir = path.join(dir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(contract.home, ".gitignore"), "records/\ncache/\n");

  const tree = worktreeHash(root);
  const headSha = tryGit(root, ["rev-parse", "HEAD"]);
  const branch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = tree !== (tryGit(root, ["rev-parse", "HEAD^{tree}"]) ?? "").slice(0, 16);
  const base = resolveBase(root, opts.base);
  const files = loadClaims(contract.home);
  const claims: Claim[] = files.flatMap((f) => f.claims).filter((c) => !c.retired);
  const contractHash = sha(contract.raw);
  const warnings = lint(contract, files).filter((w) => w.level !== "error").map((w) => w.message);

  say("court in session", `level ${opts.level} · head ${branch ?? "?"}@${(headSha ?? "").slice(0, 7)}${dirty ? "+dirty" : ""}${base ? ` · base ${base.ref}@${base.sha.slice(0, 7)}` : " · no base"} · ${claims.length} claims`);

  const bundle: Bundle = {
    schema: "witness.record/v0",
    level: opts.level,
    verdict: "mistrial",
    repo: root,
    head: { tree, sha: headSha, branch, dirty },
    base: base ?? undefined,
    startedAt: new Date(t0).toISOString(),
    ms: 0,
    counts: {},
    claims: [],
    regressions: [],
    otherTests: [],
    exchanges: [],
    layers: {},
    warnings,
    sources: [],
    logs: [],
    judgeCalls: 0,
  };

  try {
    const errors = lint(contract, files).filter((w) => w.level === "error");
    if (errors.length) throw new Mistrial(`The claims don't hold together: ${errors.map((e) => e.message).join("; ")}`, "Fix the claims files (see `witness lint`).");

    // Target layer: head app + head tests.
    // Claims, equivalence rules and docs don't change what the app returns, so they don't key captures.
    const captureTree = worktreeHash(root, [".witness/claims", ".witness/equivalence.toml", ".witness/sources", "VERIFY.md"]);
    const tKey = sha(`${captureTree}|${contractHash}`);
    const tFile = path.join(cacheDir(contract, "target", tKey), "capture.json");
    let target = opts.fresh ? null : readJson<SideCapture | null>(tFile, null);
    if (target) say("record", `target layer reused (${tKey})`);
    else {
      const t1 = Date.now();
      target = await capture(contract, new Side("head", contract, root, logDir), logDir, opts.rerun);
      writeJson(tFile, target);
      bundle.layers.target = { key: tKey, reused: false, ms: Date.now() - t1 };
    }
    bundle.layers.target ??= { key: tKey, reused: true };

    // Base layer: the base commit's app, for the bite check (and Evolve parity).
    let baseCap: SideCapture | null = null;
    const testGlobs = contract.suites.map((s) => s.tests);
    const testsKey = testGlobs.every(Boolean) ? hashFiles(testGlobs.flatMap((g) => fs.globSync(path.join(root, g!)))) : captureTree;
    if (base) {
      const bKey = sha(`${base.sha}|${testsKey}|${contractHash}`);
      const bFile = path.join(cacheDir(contract, "base", bKey), "capture.json");
      baseCap = opts.fresh ? null : readJson<SideCapture | null>(bFile, null);
      if (baseCap) {
        say("subpoena", `base ${base.sha.slice(0, 7)} already on record; reused (${bKey})`);
        bundle.layers.base = { key: bKey, reused: true };
      } else {
        const t1 = Date.now();
        say("subpoena", `booting base ${base.ref}@${base.sha.slice(0, 7)} in a worktree`);
        const wt = path.join(os.tmpdir(), `witness-base-${base.sha.slice(0, 12)}-${process.pid}`);
        git(root, ["worktree", "add", "--detach", "-f", wt, base.sha]);
        try {
          baseCap = await capture(contract, new Side("base", contract, wt, logDir), logDir, false);
        } finally {
          tryGit(root, ["worktree", "remove", "--force", wt]);
        }
        writeJson(bFile, baseCap);
        bundle.layers.base = { key: bKey, reused: false, ms: Date.now() - t1 };
      }
    }

    const head = byId(target.runs);
    const rerun = byId(target.reruns);
    const baseRes = baseCap ? byId(baseCap.runs) : undefined;
    const primary = (caps: SideCapture | null, test: string) => (caps?.exchanges ?? []).filter((e) => e.run === "primary" && e.test === test).sort((a, b) => a.seq - b.seq);
    const parityClaims = claims.filter((c) => c.proof && (c.tags.includes("parity") || c.tags.includes("changed")));

    // Origin layer (High): the base commit (Evolve) or a separate legacy checkout (Migrate).
    let originCap: SideCapture | null = null;
    if (opts.level === "high") {
      const o = contract.origin;
      if (o?.repo) {
        originCap = await captureOrigin(contract, o, parityClaims.map((c) => c.proof!), testsKey, contractHash, logDir, opts.fresh, bundle);
        bundle.originSide = "origin";
        bundle.origin = { kind: "migrate", repo: o.repo, sha: tryGit(o.repoPath!, ["rev-parse", "HEAD"]) };
      } else if (baseCap) {
        originCap = baseCap;
        bundle.originSide = "base";
        bundle.origin = { kind: "evolve", repo: ".", sha: base!.sha };
        bundle.layers.origin = { key: bundle.layers.base!.key, reused: true, note: "same as the base layer" };
      }
    }

    // Parity layer (High): pure comparison over stored observations.
    const parity = new Map<string, ParityResult>();
    if (opts.level === "high") {
      if (!originCap) bundle.warnings.push("High level needs an origin: a base commit or an [origin] repo in witness.toml. None was found, so no cross-examination ran.");
      else {
        const pKey = sha(`${bundle.layers.target.key}|${bundle.layers.origin!.key}|${JSON.stringify(contract.equivalence)}`);
        say("cross-examination", `comparing origin and target observations for ${parityClaims.length} claim(s) (${pKey})`);
        for (const c of parityClaims) parity.set(c.id, compareExchanges(primary(originCap, c.proof!), primary(target, c.proof!), contract.equivalence, c.expectDiff));
        bundle.layers.parity = { key: pKey, reused: false, note: `${parity.size} claim(s) compared` };
      }
    }

    const results = claims.map((c) => {
      const r = assessClaim(c, { head, base: baseRes, rerun, parity: parity.get(c.id), level: opts.level, migrate: !!contract.origin?.repo });
      if (c.proof) r.source = testSource(root, c.proof);
      return r;
    });

    // T2: judge.
    const sources = loadSources(root, contract.home, base, opts.sources, opts.why);
    bundle.sources = sources.map((s) => ({ name: s.name, canOverturn: s.canOverturn }));
    const toJudge = results.filter((r) => (r.tags.includes("judged") && r.status === "cant_tell") || (r.parity?.status === "unexplained" && r.status === "failed"));
    if (toJudge.length && opts.judge) {
      say("deliberation", `the judge reviews ${toJudge.length} item(s)`);
      for (const r of toJudge) {
        const kind = r.parity?.status === "unexplained" ? "parity" : "judged";
        const ex = r.testId ? [...(kind === "parity" ? primary(originCap, r.testId) : []), ...primary(target, r.testId)] : [];
        const evidence =
          kind === "parity"
            ? `Differences (origin -> target):\n${r.parity!.diffs.map((d) => `- ${d.field}: ${d.origin} -> ${d.target}`).join("\n")}\n\nExchanges:\n${exchangeText(ex)}`
            : `${r.evidence ? `Evidence hint: ${r.evidence}\n` : ""}Exchanges:\n${exchangeText(ex.length ? ex : target.exchanges.filter((e) => !r.evidence || e.path.includes(r.evidence.split(" ").pop() ?? "")).slice(0, 12))}`;
        const question =
          kind === "parity"
            ? "Is this difference between origin and target justified by a source that may justify an overturn? If yes, answer overturn with the verbatim quote; otherwise fail or cant_tell."
            : "Does the evidence show the claim holds? Answer pass, fail or cant_tell, and flag any ambiguity between the claim, the change description and the behavior.";
        const j = judge({ kind, claim: `${r.id}: ${r.text}`, question, evidence }, sources, path.join(contract.home, "cache", "judge"));
        if (!j.cached) bundle.judgeCalls++;
        say("deliberation", `${r.id}: ${j.accepted}${j.error ? ` (${j.error.slice(0, 80)})` : ""}${j.cached ? " (ruling on record, reused)" : ` in ${fmtMs(j.ms)}`}`);
        applyJudge(r, j, kind);
      }
    } else if (toJudge.length) {
      for (const r of toJudge) if (r.tags.includes("judged")) r.reasons.push("Judge skipped (--no-judge).");
    }

    const claimed = new Set(results.map((r) => r.testId).filter(Boolean));
    const all = [...head.values()];
    bundle.regressions = all.filter((t) => !claimed.has(t.id) && t.status === "failed" && rerun.get(t.id)?.status !== "passed");
    bundle.otherTests = all.filter((t) => !claimed.has(t.id));
    if (!all.length) throw new Mistrial("No test results were found after the suites ran.", "Check the suite command and its junit path in witness.toml; see the suite log.", "");
    bundle.claims = results;
    bundle.exchanges = [...(baseCap?.exchanges ?? []), ...(originCap && originCap !== baseCap ? originCap.exchanges : []), ...target.exchanges].filter((e) => e.run === "primary" || e.run === "rerun");
    bundle.verdict = overall(results, bundle.regressions);
    bundle.counts = counts(results);
  } catch (e) {
    if (e instanceof Mistrial) {
      bundle.verdict = "mistrial";
      bundle.mistrial = { message: e.message, remedy: e.remedy, logTail: e.logTail };
    } else throw e;
  } finally {
    bundle.ms = Date.now() - t0;
    bundle.logs = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
  }
  writeRecord(dir, bundle);
  return { bundle, dir };
}
