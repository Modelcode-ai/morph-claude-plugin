import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ADAPTERS, selectCommand } from "./adapters.ts";
import { type Config, loadEnv, type Service, type Suite, topoOrder } from "./config.ts";
import { buildCtrf } from "./ctrf.ts";
import { type Diagnosis, diagnose, formatDiagnosis } from "./diagnosis.ts";
import { color, outcomeColor, Progress } from "./output.ts";
import { applyParity, EXIT, type Outcome, type Parity, type SuiteSummary, suiteOutcome, type TestRecord, worst } from "./reconcile.ts";
import { acquireLock, killTracked, LockError, newRunId, pruneRuns, reapStale, RunDir, type Status } from "./rundir.ts";
import { Failure, readUp, Stack } from "./stack.ts";
import { type ArtifactEntry, collectArtifacts, runSuite, type SuiteCtx } from "./suite.ts";
import { fmtDuration, git, gitInfo, writeJson } from "./util.ts";

export interface RunOptions {
  suites?: string[];
  select?: string[];
  retries: number;
  noSetup: boolean;
  against?: string;
  label?: string;
  json: boolean;
  runDirRoot: string;
}

export class UsageError extends Error {}

export function pickSuites(cfg: Config, names?: string[]): Suite[] {
  if (!names?.length) return cfg.suites;
  const out: Suite[] = [];
  for (const n of names) {
    const s = cfg.suites.find((x) => x.name === n);
    if (!s) throw new UsageError(`unknown suite "${n}"; suites: ${cfg.suites.map((x) => x.name).join(", ") || "(none)"}`);
    out.push(s);
  }
  return out;
}

/** --select ids per suite: `adapter:x` belongs to the suites with that adapter; `suite:adapter:x` names its suite. */
export function splitSelect(suites: Suite[], select?: string[]): Map<string, string[]> | undefined {
  if (!select?.length) return undefined;
  const m = new Map<string, string[]>();
  for (const raw of select) {
    let colon = raw.indexOf(":");
    let pre = colon > 0 ? raw.slice(0, colon) : "";
    let pool = suites;
    if (pre && !(pre in ADAPTERS) && suites.some((s) => s.name === pre)) {
      const rest = raw.slice(colon + 1);
      const c2 = rest.indexOf(":");
      if (c2 > 0 && rest.slice(0, c2) in ADAPTERS) {
        pool = suites.filter((s) => s.name === pre);
        colon += c2 + 1;
        pre = rest.slice(0, c2);
      }
    }
    const owners = pre in ADAPTERS ? pool.filter((s) => s.adapter === pre) : pool;
    const id = pre in ADAPTERS ? raw.slice(colon + 1) : raw;
    if (!owners.length) throw new UsageError(`--select ${raw}: no selected suite uses adapter ${pre}`);
    if (owners.length > 1) throw new UsageError(`--select ${raw}: suites ${owners.map((s) => s.name).join(", ")} could all own it; add --suite or write it as <suite>:${raw}`);
    m.set(owners[0].name, [...(m.get(owners[0].name) ?? []), id]);
  }
  return m;
}

export function neededServices(cfg: Config, suites: Suite[], role: Service["role"] = "target"): string[] {
  const all = cfg.services.filter((s) => s.role === role).map((s) => s.name);
  return [...new Set(suites.flatMap((s) => s.services ?? all))];
}

export function originMap(cfg: Config): Map<string, Service> {
  const m = new Map<string, Service>();
  for (const o of cfg.services.filter((s) => s.role === "origin")) {
    const target = o.originFor ?? o.name.replace(/[-_]origin$/, "");
    if (cfg.services.some((s) => s.name === target && s.role === "target")) m.set(target, o);
  }
  return m;
}

interface Side {
  outcome: Outcome;
  suites: SuiteSummary[];
  tests: TestRecord[];
  diagnosis?: Diagnosis;
  artifacts: ArtifactEntry[];
}

export async function runCommand(cfg: Config, opts: RunOptions): Promise<number> {
  let suites = pickSuites(cfg, opts.suites);
  const select = splitSelect(suites, opts.select);
  if (select && !opts.suites?.length) suites = suites.filter((s) => select.has(s.name));
  if (opts.against && !originMap(cfg).size && !git(cfg.root, ["rev-parse", "--verify", "--quiet", `${opts.against}^{commit}`]).ok)
    throw new UsageError(`--against ${opts.against}: not a commit in this repo (try a branch, tag or sha from \`git log\`)`);
  if (!suites.length) throw new UsageError("no [[suite]] in the config");
  for (const [name, ids] of select ?? []) {
    const s = suites.find((x) => x.name === name)!;
    if (!selectCommand(ADAPTERS[s.adapter], s.cmd, ids, s.select)) throw new UsageError(`suite ${name}: adapter ${s.adapter} cannot select tests${s.select ? ` with select = "${s.select}" (use {ids}, or {id} for one test)` : '; add select = "<cmd> {ids}" to the suite'}`);
  }
  const progress = new Progress(Date.now(), false);
  let release: () => void;
  try {
    release = acquireLock(path.join(cfg.root, ".witness", "run.lock"));
  } catch (e) {
    if (e instanceof LockError) {
      progress.plain(color.red(e.message));
      return EXIT.error;
    }
    throw e;
  }
  await reapStale(opts.runDirRoot, cfg.run.graceMs, (m) => progress.line(m));
  const g = gitInfo(cfg.root);
  const run = new RunDir(opts.runDirRoot, newRunId(), { commit: g.commit, branch: g.branch, dirty: g.dirty, label: opts.label });
  run.linkLatest();
  const abort = { aborted: false };
  const activity = { text: "" };
  const t0 = Date.now();
  progress.line(`run ${run.runId} · ${g.branch || "(no branch)"} @ ${g.commit.slice(0, 10) || "(no commit)"}${g.dirty ? " (dirty)" : ""} · ${suites.length} suite(s)`);

  let sigints = 0;
  const onSignal = (sig: NodeJS.Signals) => {
    sigints++;
    abort.aborted = true;
    run.event("signal", { signal: sig }, `interrupted by ${sig}`);
    if (sigints === 1) progress.line(`${sig}: stopping (press Ctrl-C again to kill everything now)`);
    else {
      for (const p of run.state.procs) void killTracked(p, 0, { runStop: false });
      run.status.phase = "finished";
      run.status.outcome = "interrupted";
      run.status.finished_at = new Date().toISOString();
      run.saveStatus();
      release();
      process.exit(EXIT.interrupted);
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const hb = setInterval(() => {
    if (Date.now() - progress.lastAt >= cfg.run.heartbeatMs) progress.line(`… ${activity.text || run.status.last_event}`);
  }, Math.min(cfg.run.heartbeatMs, 1000));

  const { env: baseEnv, missing } = loadEnv(cfg);
  let target: Side = { outcome: "passed", suites: [], tests: [], artifacts: [] };
  let against: { ref: string; outcome: Outcome; parity?: Record<Parity, number>; diagnosis?: Diagnosis } | undefined;
  let internalError: string | undefined;

  try {
    if (missing.length) {
      target = { ...target, outcome: "mistrial", diagnosis: diagnose({ stage: "config", cause: "missing_env", envMissing: missing }) };
    } else {
      target = await runSide(cfg, {
        root: cfg.root,
        run,
        outDir: run.dir,
        progress,
        abort,
        activity,
        baseEnv,
        suites,
        select,
        retries: opts.retries,
        noSetup: opts.noSetup,
        setupCacheDir: path.join(cfg.root, ".witness", "cache", "setup"),
        reuseUp: true,
      });
      if (opts.against && !abort.aborted && target.outcome !== "mistrial") {
        run.setPhase("against", `running against ${opts.against}`);
        const origin = await runAgainst(cfg, opts, { run, progress, abort, activity, baseEnv, suites, select });
        const { tests, counts } = applyParity(target.tests, origin.tests);
        target.tests = tests;
        against = { ref: opts.against, outcome: origin.outcome, parity: counts, diagnosis: origin.diagnosis };
        target.artifacts.push(...origin.artifacts);
        progress.line(`against ${opts.against} · origin ${origin.outcome} · parity: ${counts.same} same, ${counts.differs} differ, ${counts.target_only} only on target, ${counts.origin_only} only on origin`);
        if (origin.diagnosis && origin.outcome !== "passed" && origin.outcome !== "failed") for (const l of formatDiagnosis(origin.diagnosis)) progress.plain(`  origin ${l}`);
      }
    }
  } catch (e) {
    internalError = (e as Error).stack ?? String(e);
    progress.plain(color.red(`witness internal error: ${internalError}`));
    target = { ...target, outcome: "error" };
  } finally {
    clearInterval(hb);
  }
  if (abort.aborted) target.outcome = "interrupted";

  run.setPhase("report", "writing results");
  const finishedAt = Date.now();
  const status: Status = run.status;
  status.suites = target.suites;
  status.outcome = target.outcome;
  if (target.diagnosis) status.diagnosis = target.diagnosis;
  if (internalError) status.internal_error = internalError.split("\n")[0];
  if (against) status.against = { ref: against.ref, outcome: against.outcome, parity: against.parity, ...(against.diagnosis && against.outcome !== "passed" && against.outcome !== "failed" ? { diagnosis: against.diagnosis } : {}) };
  const ctrf = buildCtrf(
    {
      runId: run.runId,
      outcome: target.outcome,
      commit: g.commit,
      branch: g.branch,
      dirty: g.dirty,
      label: opts.label,
      startedAt: t0,
      finishedAt,
      diagnosis: target.diagnosis,
      against: against ? { ref: against.ref, outcome: against.outcome, parity: against.parity } : undefined,
      adapters: [...new Set(suites.map((s) => s.adapter))],
    },
    target.tests,
  );
  writeJson(run.file("results.ctrf.json"), ctrf);
  writeJson(run.file("artifacts.json"), target.artifacts);
  status.summary = { tests: ctrf.results.summary.tests, passed: ctrf.results.summary.passed, failed: ctrf.results.summary.failed, skipped: ctrf.results.summary.skipped, pending: ctrf.results.summary.pending, other: ctrf.results.summary.other };
  status.finished_at = new Date(finishedAt).toISOString();
  status.phase = "finished";
  status.last_event = `finished: ${target.outcome}`;
  run.saveStatus();
  run.event("run_finished", { outcome: target.outcome, summary: status.summary });
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  pruneRuns(opts.runDirRoot, cfg.run.keepRuns);
  release();

  printVerdict(progress, status, finishedAt - t0, run.dir);
  if (opts.json) process.stdout.write(JSON.stringify(status, null, 2) + "\n");
  return EXIT[target.outcome];
}

export function verdictSummary(status: Status, ms?: number): string {
  const parts: string[] = [];
  if (status.summary) {
    const sum = (k: "passed" | "failed" | "error" | "missing" | "skipped") => status.suites.reduce((a, x) => a + (x[k] ?? 0), 0);
    parts.push(`${sum("passed")} passed, ${sum("failed")} failed`);
    if (sum("error")) parts.push(`${sum("error")} error`);
    if (sum("missing")) parts.push(`${sum("missing")} missing`);
    if (sum("skipped")) parts.push(`${sum("skipped")} skipped`);
    if (status.against?.parity?.origin_only) parts.push(`${status.against.parity.origin_only} only on origin`);
  }
  parts.push(`${status.suites.length} suite(s)`);
  if (status.against) parts.push(`against ${status.against.ref}: origin ${status.against.outcome}${status.against.parity ? `, ${status.against.parity.differs} differ` : ""}`);
  if (ms != null) parts.push(fmtDuration(ms));
  return parts.join(" · ");
}

export function printVerdict(progress: Progress, status: Status, ms: number, dir: string) {
  const o = status.outcome ?? "error";
  progress.plain(`${color.bold(outcomeColor(o)(`VERDICT ${o}`))} · ${verdictSummary(status, ms)}`);
  if (status.diagnosis && o !== "passed" && o !== "failed") for (const l of formatDiagnosis(status.diagnosis)) progress.plain(`  ${l}`);
  for (const s of status.suites) if (s.state !== "passed") progress.plain(`  suite ${s.name}: ${s.state}${s.cause ? ` (${s.cause})` : ""}${s.note ? ` · ${s.note}` : ""}`);
  progress.plain(`  run dir: ${dir}`);
}

interface SideOpts {
  root: string;
  run: RunDir;
  outDir: string;
  progress: Progress;
  abort: { aborted: boolean };
  activity: { text: string };
  baseEnv: Record<string, string>;
  suites: Suite[];
  select?: Map<string, string[]>;
  retries: number;
  noSetup: boolean;
  setupCacheDir: string | null;
  reuseUp: boolean;
  prefix?: string;
  origin?: Map<string, Service>;
}

/** Deps, boot, suites and teardown for one side (target, or origin for --against). */
async function runSide(cfg: Config, o: SideOpts): Promise<Side> {
  const side: Side = { outcome: "passed", suites: [], tests: [], artifacts: [] };
  const logDir = path.join(o.outDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const stack = new Stack({ cfg, root: o.root, baseEnv: o.baseEnv, logDir, progress: o.progress, run: o.run, noSetup: o.noSetup, setupCacheDir: o.setupCacheDir, runDirPath: o.run.dir, abort: o.abort, reuse: o.reuseUp ? readUp(cfg.root) : null });
  const isTarget = !o.prefix;
  try {
    if (isTarget) o.run.setPhase("deps", "checking dependencies");
    await stack.checkDeps();
    if (isTarget) o.run.setPhase("boot", "booting services");
    const alias = new Map<string, string>();
    const bootName = (n: string) => {
      const org = o.origin?.get(n);
      if (org) alias.set(org.name, n);
      return org?.name ?? n;
    };
    const chain = (names: string[]) => topoOrder(cfg.services, names.map(bootName)).map((x) => x.name);
    const bootFailed = new Map<string, Diagnosis>();
    const blocker = (names: string[]) => chain(names).find((n) => bootFailed.has(n));
    for (const n of neededServices(cfg, o.suites)) {
      if (o.abort.aborted || blocker([n])) continue;
      try {
        await stack.boot([bootName(n)], alias);
      } catch (e) {
        if (!(e instanceof Failure)) throw e;
        bootFailed.set(e.diagnosis.service && chain([n]).includes(e.diagnosis.service) ? e.diagnosis.service : bootName(n), e.diagnosis);
        o.run.event("mistrial", { diagnosis: e.diagnosis }, `mistrial: ${e.diagnosis.cause}`);
        side.outcome = "mistrial";
        side.diagnosis ??= e.diagnosis;
      }
    }
    if (isTarget) o.run.setPhase("suite", "running suites");
    const ctx: SuiteCtx = { cfg, root: o.root, outDir: o.outDir, stack, run: o.run, progress: o.progress, abort: o.abort, baseEnv: o.baseEnv, prefix: o.prefix, activity: o.activity };
    for (const s of o.suites) {
      if (o.abort.aborted) break;
      const blocked = blocker(neededServices(cfg, [s]));
      if (blocked) {
        side.suites.push({ name: s.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: `not run: service ${blocked} ${bootFailed.get(blocked)!.cause}` });
        continue;
      }
      const r = await runSuite(ctx, s, o.select?.get(s.name), o.retries);
      side.suites.push(r.summary);
      side.tests.push(...r.tests);
      const so = suiteOutcome(r.summary);
      if (worst(side.outcome, so) !== side.outcome) {
        side.outcome = worst(side.outcome, so);
        if (r.diagnosis) side.diagnosis = r.diagnosis;
      }
      if (isTarget) {
        o.run.status.suites = side.suites;
        o.run.saveStatus();
      }
      if (r.serviceDied) {
        for (const rest of o.suites.slice(o.suites.indexOf(s) + 1)) side.suites.push({ name: rest.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: "not run: a service died" });
        break;
      }
    }
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    side.outcome = "mistrial";
    side.diagnosis = e.diagnosis;
    o.run.event("mistrial", { diagnosis: e.diagnosis }, `mistrial: ${e.diagnosis.cause}`);
    for (const s of o.suites) if (!side.suites.some((x) => x.name === s.name)) side.suites.push({ name: s.name, state: "skipped", passed: 0, failed: 0, skipped: 0, error: 0, missing: 0, note: `not run: ${e.diagnosis.cause}` });
  } finally {
    await stack.teardown();
  }
  side.artifacts = collectArtifacts(o.run.dir, o.outDir, side.tests);
  return side;
}

/** Run the same suites on `ref`: origin services when the config has them, else a temporary git worktree. */
async function runAgainst(cfg: Config, opts: RunOptions, o: Omit<SideOpts, "root" | "outDir" | "retries" | "noSetup" | "setupCacheDir" | "reuseUp">): Promise<Side> {
  const outDir = path.join(o.run.dir, "against");
  const origin = originMap(cfg);
  if (origin.size) {
    o.progress.line(`against ${opts.against} · using role = "origin" services: ${[...origin.values()].map((s) => s.name).join(", ")}`);
    return runSide(cfg, { ...o, root: cfg.root, outDir, retries: 0, noSetup: opts.noSetup, setupCacheDir: path.join(cfg.root, ".witness", "cache", "setup-origin"), reuseUp: false, prefix: "origin ", origin });
  }
  const ref = opts.against!;
  const w = addWorktree(cfg, ref);
  if ("diagnosis" in w) return { outcome: "mistrial", suites: [], tests: [], diagnosis: w.diagnosis, artifacts: [] };
  o.run.state.worktrees.push(w.wt);
  o.run.saveState();
  o.progress.line(`against ${ref} · checked out ${w.sha.slice(0, 10)} in ${w.wt}`);
  if (w.copied) o.progress.line(`against ${ref} · copied the target's .witness/ (config helpers) into the worktree`);
  try {
    return await runSide(cfg, { ...o, root: w.root, outDir, retries: 0, noSetup: false, setupCacheDir: null, reuseUp: false, prefix: "origin " });
  } finally {
    removeWorktree(cfg, w.wt);
    o.run.state.worktrees = o.run.state.worktrees.filter((x) => x !== w.wt);
    o.run.saveState();
  }
}

/** A temporary detached worktree of `ref` with the target's .witness/ copied in; `root` is the config root inside it. */
export function addWorktree(cfg: Config, ref: string): { wt: string; root: string; sha: string; copied: boolean } | { diagnosis: Diagnosis } {
  const resolved = git(cfg.root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok) return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence: `--against ${ref}: not a commit in this repo (${resolved.err})` }) };
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "witness-against-"));
  const add = git(cfg.root, ["worktree", "add", "--detach", wt, resolved.out]);
  if (!add.ok) {
    fs.rmSync(wt, { recursive: true, force: true });
    return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence: `git worktree add failed: ${add.err}` }) };
  }
  const root = path.join(wt, path.relative(gitTop(cfg.root), fs.realpathSync(cfg.root)));
  const copied = copyWitnessDir(path.join(cfg.root, ".witness"), path.join(root, ".witness"));
  return { wt, root, sha: resolved.out, copied };
}

export function removeWorktree(cfg: Config, wt: string) {
  git(cfg.root, ["worktree", "remove", "--force", wt]);
  fs.rmSync(wt, { recursive: true, force: true });
  git(cfg.root, ["worktree", "prune"]);
}

const NOT_COPIED = new Set(["runs", "check", "cache", "up", "up.json", "run.lock", "scratch"]);

/** The worktree runs the target's config, so it needs the target's helper files next to it, not the ref's. */
export function copyWitnessDir(src: string, dst: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dst, { recursive: true, force: true, filter: (p) => !NOT_COPIED.has(path.relative(src, p).split(path.sep)[0]) });
  return true;
}

/** `.witness/scratch/` is for agents' temporary files; it ignores itself so nothing in it gets committed. */
export function ensureScratch(root: string) {
  const dir = path.join(root, ".witness", "scratch");
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, ".gitignore"))) fs.writeFileSync(path.join(dir, ".gitignore"), "*\n");
  } catch {
    /* read-only checkout */
  }
}

function gitTop(dir: string): string {
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  return r.ok ? fs.realpathSync(r.out) : dir;
}
