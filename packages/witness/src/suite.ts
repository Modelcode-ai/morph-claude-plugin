import * as fs from "node:fs";
import * as path from "node:path";
import { ADAPTERS, type Adapter, addArgs, fillSelect, hasSelectVar, presetEnv, selectCommand, stableId } from "./adapters.ts";
import { type Config, type Suite, substitute } from "./config.ts";
import { COMPILER_ERROR, type Diagnosis, diagnose, logErrorLine } from "./diagnosis.ts";
import { listSuiteTests, type TestList, writeListCache } from "./listing.ts";
import type { Progress } from "./output.ts";
import { parseReportFile } from "./parsers/index.ts";
import type { ParsedFile } from "./parsers/types.ts";
import { childEnv, killGroup, spawnGroup } from "./proc.ts";
import { fromReruns, missing, reconcile, type ReconcileResult, type SuiteEnd, type SuiteSummary, suiteLevel, summarize, type TestRecord, toRecord } from "./reconcile.ts";
import type { RunDir } from "./rundir.ts";
import type { Stack } from "./stack.ts";
import { EVIDENCE_FILE } from "./evidence/contract.ts";
import { fileSize, fmtBytes, fmtDuration, globFiles, sleep } from "./util.ts";

export interface SuiteCtx {
  cfg: Config;
  root: string;
  outDir: string;
  stack: Stack;
  run: RunDir;
  progress: Progress;
  abort: { aborted: boolean };
  baseEnv: Record<string, string>;
  prefix?: string;
  activity: { text: string };
}

export interface SuiteRun {
  summary: SuiteSummary;
  tests: TestRecord[];
  diagnosis?: Diagnosis;
  serviceDied?: Diagnosis;
}

interface Exec {
  code: number | null;
  end: SuiteEnd;
  ms: number;
  died?: Diagnosis;
}

const MAX_RERUNS = 200;

const BUILD_FAILED = [
  /\berror (CS|FS|BC|MSB|NU|NETSDK)\d{4}\b/,
  /\bBuild FAILED\b/,
  /\[ERROR\] (COMPILATION ERROR|Failed to execute goal \S+:(compile|testCompile|resources))/,
  /Execution failed for task '[^']*:(compile\w*|process\w*Resources)'/,
  /^e: .*\.kts?:\d+/,
  /\berror TS\d{4}\b/,
  /^(FAIL|ok)\s+\S+\s+\[(build|setup) failed\]/,
  /^No test projects were found\.?$/,
  /^A compatible \.NET SDK was not found\.?$/,
  /: command not found$|^bash: .*: No such file or directory$/,
  /^(Standard output: )?(Option '--[\w-]+' .*|Unknown option '--[\w-]+'.*)$/,
  /The command-line arguments are invalid\./,
];

/** The first line of `text` that shows the suite command failed before any test ran (compile error, missing command). */
export function buildFailure(text: string, exitCode: number | null): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const re of BUILD_FAILED) {
    const hit = lines.find((l) => re.test(l.trim()));
    if (hit) return (lines.find((l) => COMPILER_ERROR.test(l.trim())) ?? hit).trim().slice(0, 500);
  }
  return exitCode === 127 ? lines.filter((l) => l.trim()).at(-1)?.trim().slice(0, 500) : undefined;
}

export function incompleteEvidence(note: string | undefined, code: number | null, log: string): string | undefined {
  const line = code ? logErrorLine(log) : undefined;
  return line ? `${note}; the log says: ${line}` : note;
}

/** A report file the framework says it wrote; it explains a missing report when that path is empty here. */
export function reportPathEvidence(text: string): string | undefined {
  const paths: string[] = [];
  let listing = false;
  for (const line of text.split(/\r?\n/)) {
    const named = /Results File:\s*(\S.*\.(?:trx|xml|json))\s*$/i.exec(line);
    if (named) paths.push(named[1]);
    if (/artifacts produced:?\s*$/i.test(line)) listing = true;
    else if (listing) {
      const m = /^\s*-\s+(\S.*\.(?:trx|xml|json))\s*$/i.exec(line);
      if (m) paths.push(m[1]);
      else if (line.trim()) listing = false;
    }
  }
  const p = paths.find((x) => path.isAbsolute(x));
  if (!p) return undefined;
  return fs.existsSync(p) ? `the test run wrote its report to ${p}, outside the folders witness reads; set report = "<glob>" for the suite` : `the test run says it wrote ${p}, but there is no such file here (written inside a container, or on another filesystem?)`;
}

function readFrom(file: string, offset: number): string {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(offset, size - 512 * 1024);
      const buf = Buffer.alloc(Math.max(0, size - start));
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

export const safeId = (id: string) => id.replace(/[^\w.@-]+/g, "_").slice(0, 180);

function dirSize(dir: string): number {
  let n = 0;
  const walk = (d: string) => {
    let es: fs.Dirent[];
    try {
      es = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else n += fileSize(p) + 1;
    }
  };
  walk(dir);
  return n;
}

/** The per-test timeout args: the suite's per_test_timeout_arg, else the adapter's flag. */
export function perTestTimeoutArgs(suite: Suite, adapter: Adapter, cwd: string, cmd: string): string | null {
  if (!suite.perTestTimeoutMs) return null;
  if (suite.perTestTimeoutArg) return suite.perTestTimeoutArg.replace(/\{s\}/g, String(Math.ceil(suite.perTestTimeoutMs / 1000))).replace(/\{ms\}/g, String(suite.perTestTimeoutMs));
  return adapter.perTestTimeout?.(suite.perTestTimeoutMs, cwd, cmd) ?? null;
}

/** Build the command a suite runs: select, report args, per-test timeout; runner args go where `${WITNESS_SELECT}` is, else at the end. */
export function suiteCommand(suite: Suite, adapter: Adapter, vars: Record<string, string | undefined>, reportDir: string, select?: string[], cwd = "."): string {
  let cmd = substitute(suite.cmd, vars);
  let selection: string | undefined;
  if (select?.length) {
    const fail = () => new Error(`suite ${suite.name}: adapter ${adapter.name} cannot select single tests in this command; put \${WITNESS_SELECT} where the runner's arguments go, or add select = "... {ids}" to the suite`);
    if (!suite.select && hasSelectVar(cmd)) {
      if (!adapter.selectArgs) throw fail();
      selection = adapter.selectArgs(select);
    } else cmd = selectCommand(adapter, cmd, select, suite.select ? substitute(suite.select, vars) : undefined) ?? (() => { throw fail(); })();
  }
  if (adapter.reportArgs && !suite.report && !(adapter.reportMarker && adapter.reportMarker.test(cmd))) cmd = addArgs(cmd, adapter.reportArgs(reportDir, cwd, cmd));
  const ptt = perTestTimeoutArgs(suite, adapter, cwd, cmd);
  if (ptt) cmd = addArgs(cmd, ptt);
  return fillSelect(cmd, selection);
}

/** Report rows from the readable part of a report plus the tests rerun alone for the rest. */
function mergePartial(kept: TestRecord[], reran: ReconcileResult, exitCode: number | null): ReconcileResult {
  const tests = [...kept, ...reran.tests];
  const note = `report partly unreadable; ${reran.tests.length} test(s) rerun alone`;
  if (tests.some((t) => t.status === "failed")) return { ...reran, tests, state: "failed", cause: "report_unreadable", note };
  if (tests.some((t) => t.status === "other")) return { ...reran, tests, state: "error", cause: "report_unreadable", note };
  return { ...reran, tests, state: exitCode === 0 ? "passed" : "error", cause: exitCode === 0 ? "report_unreadable" : "report_incomplete", note };
}

/** Whether witness can run a subset of this suite's tests. */
export function canSelect(suite: Suite, adapter: Adapter, vars: Record<string, string | undefined> = {}): boolean {
  if (suite.select) return true;
  const cmd = substitute(suite.cmd, vars);
  if (hasSelectVar(cmd)) return !!adapter.selectArgs;
  return !!selectCommand(adapter, cmd, ["x"]);
}

/** The plugin the framework says is missing (a report formatter, a timeout plugin), from the suite's output. */
export function missingPlugin(adapter: Adapter, output: string, perTestTimeout: boolean) {
  const said = output.split(/\r?\n/).filter((l) => !l.startsWith("$ ")).join("\n");
  return adapter.plugins?.find((p) => p.needed(perTestTimeout) && p.missing.test(said));
}

export async function runSuite(ctx: SuiteCtx, suite: Suite, select: string[] | undefined, retries: number): Promise<SuiteRun> {
  const adapter = ADAPTERS[suite.adapter];
  const cwd = path.resolve(suite.root ?? ctx.root, suite.cwd);
  const p = ctx.prefix ?? "";
  const reportDir = path.join(ctx.outDir, "reports", suite.name);
  const log = path.join(ctx.outDir, "logs", `${suite.name}.log`);
  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const t0 = Date.now();
  const vars = { ...ctx.stack.vars(undefined, suite), WITNESS_REPORT_DIR: reportDir };
  const cmd = suiteCommand(suite, adapter, vars, reportDir, select, cwd);
  ctx.progress.line(`${p}suite  ${suite.name} · ${cmd}`);
  ctx.run.event("suite_started", { suite: suite.name, cmd, origin: !!p }, `${p}suite ${suite.name} running`);
  const logStart = fileSize(log);
  const before = snapshotReports(ctx, suite, adapter, cwd, reportDir);
  const exec = await execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, suite.timeoutMs);
  const files = collect(ctx, suite, adapter, cwd, reportDir, log, before, logStart);
  let expected = select;
  const usable = files.some((f) => f.cases.length);
  const hint = adapter.reportHint?.(cwd, cmd);
  const exitCodeOnly = suite.adapter === "generic" && !suite.report && files.length === 0;
  const output = !usable && exec.end === "exit" && !exitCodeOnly ? readFrom(log, logStart) : "";
  const plugin = output && exec.code !== 0 ? missingPlugin(adapter, output, !!suite.perTestTimeoutMs) : undefined;
  const broken = output && exec.code !== 0 ? (plugin ? output.split(/\r?\n/).find((l) => !l.startsWith("$ ") && plugin.missing.test(l))?.trim().slice(0, 500) : buildFailure(output, exec.code)) : undefined;
  let listed: TestList | undefined;
  if (!expected && (!usable || files.some((f) => f.error || f.partial)) && !hint && !broken && exec.end === "exit" && !(suite.adapter === "generic" && !suite.report)) {
    listed = await listTests(ctx, suite, cwd, log);
    expected = listed.ids;
  }
  let res: ReconcileResult = broken
    ? plugin
      ? { tests: [suiteLevel(adapter, suite.name, exec.code, `${plugin.name} is missing: ${broken}`)], state: "error", cause: "setup_failed", note: `${plugin.name} is missing`, evidence: broken, hint: plugin.hint }
      : { tests: [suiteLevel(adapter, suite.name, exec.code, `the suite command failed before running tests: ${broken}`)], state: "error", cause: "setup_failed", note: "build or command failed before any test ran", evidence: broken, hint: "the suite failed before any test ran (build error, missing command or invalid runner arguments): fix that first; witness does not list or rerun tests after it" }
    : reconcile({ suite: suite.name, adapter, exitCode: exec.code, end: exec.end, files, expected, cwd, exitCodeOnly, selected: !!select?.length });
  if (!select?.length && !p && exec.end === "exit" && usable && !files.some((f) => f.error) && (res.state === "passed" || res.state === "failed"))
    writeListCache(ctx.cfg.root, suite, ctx.run.runId, ctx.run.status.commit, res.tests.filter((t) => t.obtained === "report").map((t) => t.id.slice(adapter.name.length + 1)));

  const kept = res.rerun?.length ? res.tests : [];
  if (res.rerun?.length && !ctx.abort.aborted) {
    const selectable = canSelect(suite, adapter, vars);
    if (res.rerun.length <= MAX_RERUNS && selectable && !hint) {
      ctx.progress.line(`${p}suite  ${suite.name} · ${res.cause === "report_unreadable" ? "report unreadable" : "no report"}; rerunning ${res.rerun.length} test(s) one at a time (${listed?.detail ?? "list: --select"})`);
      const results = [];
      for (const [i, id] of res.rerun.entries()) {
        if (ctx.abort.aborted) break;
        const dir = path.join(reportDir, "rerun", String(i + 1));
        fs.mkdirSync(dir, { recursive: true });
        const c = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, [id], cwd);
        const snap = snapshotReports(ctx, suite, adapter, cwd, dir);
        const rlog = path.join(ctx.outDir, "logs", `${suite.name}.rerun.log`);
        const from = fileSize(rlog);
        const e = await execWatched(ctx, suite, adapter, c, cwd, dir, rlog, suite.perTestTimeoutMs ?? Math.min(suite.timeoutMs, 10 * 60_000));
        if (e.died) {
          exec.died = e.died;
          break;
        }
        const got = collect(ctx, suite, adapter, cwd, dir, rlog, snap, from);
        if (i === 0 && !got.some((f) => f.cases.length)) {
          ctx.progress.line(`${p}suite  ${suite.name} · a single test run alone wrote no report either; not rerunning the rest`);
          results.length = 0;
          break;
        }
        results.push({ id, exitCode: e.code, files: got, timedOut: e.end !== "exit" });
      }
      const ids = res.rerun;
      res = results.length ? fromReruns(results, adapter, suite.name, cwd, exec.code, res.cause!, listed?.source === "last-report" ? listed.detail : undefined) : { ...res, rerun: undefined, tests: ids.map((id) => missing(stableId(adapter.name, id), adapter, suite.name, "missing", `no report from the suite (exit code ${exec.code}), nor when one test ran alone`)) };
      if (kept.length) res = mergePartial(kept, res, exec.code);
      if (listed) res.note = `${res.note} · ${listed.detail}`;
    } else {
      const why = !selectable ? "this suite can't select single tests" : hint ? "the suite can't write a per-test report" : `more than ${MAX_RERUNS} tests`;
      const note = `${res.note}; exit code ${exec.code}; no per-test reruns: ${why}`;
      res = { ...res, tests: kept.length ? [...kept, ...res.rerun.map((id) => missing(stableId(adapter.name, id), adapter, suite.name, "missing", note))] : [suiteLevel(adapter, suite.name, exec.code, note)] };
    }
  } else if (res.cause && (res.cause === "report_missing" || res.cause === "report_unreadable") && listed && !listed.ids) {
    res.note = `${res.note} · ${listed.detail}`;
  }

  if (retries > 0 && res.state === "failed" && exec.end === "exit" && !exec.died && canSelect(suite, adapter, vars)) {
    await retryFailed(ctx, suite, adapter, cwd, vars, reportDir, res.tests, retries);
    if (!res.tests.some((t) => t.status === "failed")) res = { ...res, state: "passed" };
  }

  copyAttachments(ctx.run.dir, ctx.outDir, res.tests);
  const summary = summarize(suite.name, res.state, res.tests);
  summary.exit_code = exec.code;
  if (res.cause) summary.cause = res.cause;
  if (res.note) summary.note = res.note;
  let diagnosis: Diagnosis | undefined;
  if (exec.died) diagnosis = exec.died;
  else if (res.cause && res.state !== "failed" && res.state !== "passed") {
    const h = res.cause === "report_missing" ? hint : undefined;
    const evidence = res.evidence ?? h ?? (res.cause === "report_unreadable" ? files.find((f) => f.error)?.error : res.cause === "report_incomplete" ? incompleteEvidence(res.note, exec.code, log) : res.cause === "report_missing" ? reportPathEvidence(output) : undefined);
    const extraTry = [h, res.hint].filter((x): x is string => !!x);
    diagnosis = diagnose({ stage: res.cause.startsWith("report") ? "report" : "suite", cause: res.cause, suite: suite.name, command: cmd, log, cwd: suite.cwd, evidence, extraTry, perTestTimeout: !!(adapter.perTestTimeoutEnv || adapter.perTestTimeout?.(60_000, cwd, cmd)), adapter: suite.adapter });
  }
  ctx.run.event("suite_finished", { suite: suite.name, state: summary.state, exit_code: exec.code, end: exec.end, cause: res.cause, passed: summary.passed, failed: summary.failed, ms: Date.now() - t0 }, `${p}suite ${suite.name} ${summary.state}`);
  const counts = [`${summary.passed} passed`, `${summary.failed} failed`, summary.error && `${summary.error} error`, summary.missing && `${summary.missing} missing`, summary.skipped && `${summary.skipped} skipped`].filter(Boolean).join(", ");
  ctx.progress.line(`${p}suite  ${suite.name} · ${summary.state} · ${counts} · exit ${exec.code ?? "-"} (${fmtDuration(Date.now() - t0)})${res.note ? ` · ${res.note}` : ""}`);
  return { summary, tests: res.tests, diagnosis, serviceDied: exec.died };
}

/** Run a command under the watchdog: suite timeout, stall (no output, no report growth), dying services, interrupts. */
async function execWatched(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cmd: string, cwd: string, reportDir: string, log: string, timeoutMs: number): Promise<Exec> {
  const artifacts = path.join(ctx.outDir, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const vars = ctx.stack.vars(undefined, suite);
  const env = childEnv(ctx.stack.envOf(suite.repo), {
    ...ctx.stack.serviceUrlEnv(suite.repo),
    WITNESS_REPORT_DIR: reportDir,
    WITNESS_ARTIFACTS: artifacts,
    WITNESS_EVIDENCE: "1",
    WITNESS_RUN_DIR: ctx.run.dir,
    ...presetEnv(adapter, suite.perTestTimeoutMs, !!suite.perTestTimeoutArg),
    ...(adapter.reportEnv && !suite.report ? adapter.reportEnv(reportDir) : {}),
    ...Object.fromEntries(Object.entries(suite.env).map(([k, v]) => [k, substitute(v, { ...vars, WITNESS_REPORT_DIR: reportDir })])),
  });
  const t0 = Date.now();
  const proc = spawnGroup(cmd, { name: suite.name, cwd, env, log });
  ctx.run.track({ kind: "suite", name: suite.name, pid: proc.pid, pgid: proc.pgid });
  let lastSize = -1;
  let lastProgress = Date.now();
  let lastWatch = 0;
  let end: SuiteEnd = "exit";
  let died: Diagnosis | undefined;
  const logStart = fileSize(log);
  for (;;) {
    const exited = await Promise.race([proc.exit.then(() => true), sleep(500).then(() => false)]);
    if (exited) break;
    const now = Date.now();
    const size = fileSize(log) + dirSize(reportDir);
    if (size !== lastSize) {
      lastSize = size;
      lastProgress = now;
    }
    ctx.activity.text = `suite ${suite.name} running ${fmtDuration(now - t0)} · log ${fmtBytes(fileSize(log) - logStart)} · last output ${fmtDuration(now - lastProgress)} ago`;
    if (ctx.abort.aborted) end = "interrupted";
    else if (now - t0 > timeoutMs) end = "timeout";
    else if (now - lastProgress > ctx.cfg.run.stallMs) end = "stalled";
    else if (now - lastWatch >= 1000) {
      lastWatch = now;
      const d = await ctx.stack.watch(suite.services ?? ctx.cfg.services.filter((x) => x.role === "target").map((x) => x.name));
      if (d) {
        died = d;
        end = "service_died";
      }
    }
    if (end !== "exit") {
      const why = end === "timeout" ? `suite timeout (${fmtDuration(timeoutMs)})` : end === "stalled" ? `no output and no report growth for ${fmtDuration(ctx.cfg.run.stallMs)}` : end === "service_died" ? `service ${died?.service} died` : "interrupted";
      ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · stopping: ${why}`);
      fs.appendFileSync(log, `\nwitness: stopping suite: ${why}\n`);
      await killGroup(proc.pgid, ctx.cfg.run.graceMs);
      break;
    }
  }
  await Promise.race([proc.exit, sleep(2000)]);
  ctx.run.untrack(proc.pgid);
  ctx.activity.text = "";
  return { code: end === "exit" ? proc.code : null, end, ms: Date.now() - t0, died };
}

/** Report files the adapter or `report` globs find outside the run's report dir (e.g. TestResults/, target/surefire-reports/). */
function outsideReports(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, reportDir: string): { src: string; rel: string }[] {
  const out: { src: string; rel: string }[] = [];
  const globs = suite.report ? [{ base: "cwd" as const, glob: substitute(suite.report, { ...ctx.stack.vars(undefined, suite), WITNESS_REPORT_DIR: reportDir }) }] : adapter.reportGlobs;
  for (const g of globs) {
    if (g.base === "report-dir") continue;
    let base = cwd;
    let glob = g.glob;
    if (path.isAbsolute(glob)) {
      const fixed = glob.split("/").findIndex((x) => /[*?{]/.test(x));
      const parts = glob.split("/");
      base = fixed < 0 ? path.dirname(glob) : parts.slice(0, fixed).join("/") || "/";
      glob = fixed < 0 ? path.basename(glob) : parts.slice(fixed).join("/");
    }
    for (const rel of globFiles(base, [glob], { skipDirs: new Set([".git", "node_modules", ".witness"]) })) out.push({ src: path.join(base, rel), rel });
  }
  return out;
}

const stamp = (f: string) => {
  try {
    const st = fs.statSync(f);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "";
  }
};

/** What the report globs already match before a command runs; collect() ignores these unless they change. */
function snapshotReports(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, reportDir: string): Map<string, string> {
  return new Map(outsideReports(ctx, suite, adapter, cwd, reportDir).filter((f) => !f.src.startsWith(reportDir + path.sep)).map((f) => [f.src, stamp(f.src)]));
}

function collect(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, reportDir: string, log: string, before: Map<string, string>, logFrom = 0): ParsedFile[] {
  const files: string[] = [];
  if (adapter.fromStdout && !suite.report) {
    const out = path.join(reportDir, "stdout.jsonl");
    try {
      fs.copyFileSync(log, out);
      files.push(out);
    } catch {
      /* no log */
    }
  }
  if (!suite.report) for (const g of adapter.reportGlobs) if (g.base === "report-dir") for (const f of globFiles(reportDir, [g.glob], { skipDirs: new Set(["rerun", "retry"]) })) files.push(path.join(reportDir, f));
  for (const { src, rel } of outsideReports(ctx, suite, adapter, cwd, reportDir)) {
    if (src.startsWith(reportDir + path.sep)) {
      files.push(src);
      continue;
    }
    // a report that was already there and unchanged belongs to an earlier run
    if (before.get(src) === stamp(src)) continue;
    const dst = path.join(reportDir, rel.replace(/[\\/]/g, "__"));
    fs.copyFileSync(src, dst);
    files.push(dst);
  }
  const parsed = [...new Set(files)].map((f) => parseReportFile(f, adapter.format, cwd));
  adapter.amend?.(parsed, readFrom(log, logFrom));
  return parsed;
}

async function listTests(ctx: SuiteCtx, suite: Suite, cwd: string, log: string): Promise<TestList> {
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · listing tests to see what the run left out`);
  const l = await listSuiteTests(suite, { root: ctx.cfg.root, cwd, vars: ctx.stack.vars(undefined, suite), env: childEnv(ctx.stack.envOf(suite.repo), ctx.stack.serviceUrlEnv(suite.repo)), log: log.replace(/\.log$/, ".list.log"), scratch: path.join(ctx.outDir, "reports", suite.name, "list"), abort: ctx.abort, track: ctx.run.tracker("list", suite.name), noCache: path.resolve(ctx.root) !== path.resolve(ctx.cfg.root) });
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · ${l.ids ? `${l.ids.length} test(s), ` : ""}${l.detail}`);
  return l;
}

async function retryFailed(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, vars: Record<string, string | undefined>, reportDir: string, tests: TestRecord[], retries: number) {
  for (let k = 1; k <= retries; k++) {
    const failing = tests.filter((t) => t.status === "failed" && t.obtained !== "suite-level");
    if (!failing.length || ctx.abort.aborted) return;
    const ids = failing.map((t) => t.id.slice(adapter.name.length + 1));
    const dir = path.join(reportDir, "retry", String(k));
    fs.mkdirSync(dir, { recursive: true });
    const cmd = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, ids, cwd);
    ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · retry ${k}/${retries} of ${ids.length} failed test(s)`);
    const rlog = path.join(ctx.outDir, "logs", `${suite.name}.retry.log`);
    const snap = snapshotReports(ctx, suite, adapter, cwd, dir);
    const from = fileSize(rlog);
    const e = await execWatched(ctx, suite, adapter, cmd, cwd, dir, rlog, suite.timeoutMs);
    if (e.end !== "exit") return;
    const again = collect(ctx, suite, adapter, cwd, dir, rlog, snap, from).flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite.name, cwd)));
    for (const t of failing) {
      const r = again.find((a) => a.id === t.id);
      t.retries = (t.retries ?? 0) + 1;
      if (r?.status === "passed") {
        t.status = "passed";
        t.flaky = true;
        delete t.statusDetail;
      }
    }
  }
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".webm": "video/webm", ".mp4": "video/mp4", ".mov": "video/quicktime", ".zip": "application/zip", ".json": "application/json", ".xml": "application/xml", ".trx": "application/xml", ".html": "text/html", ".txt": "text/plain", ".log": "text/plain", ".md": "text/markdown" };

export interface ArtifactEntry {
  file: string;
  artifact_type: "evidence" | "screenshot" | "video" | "trace" | "log" | "report";
  test_name: string | null;
  test_id: string | null;
  content_type: string;
  size_bytes: number;
  step_index?: number;
  step_label?: string;
}

export function artifactType(file: string, ct: string): ArtifactEntry["artifact_type"] {
  if (path.basename(file) === EVIDENCE_FILE) return "evidence";
  if (ct.startsWith("image/")) return "screenshot";
  if (ct.startsWith("video/")) return "video";
  if (/trace/i.test(path.basename(file)) || ct === "application/zip") return "trace";
  if (ct === "text/plain") return "log";
  return "report";
}

/** The one test whose id ends with the folder's name at a word boundary (a folder named without the namespace). */
/** A test id as a folder name: "." and "#" alike, and no trailing "_" (a "()" the runner adds). */
const folderKey = (id: string) => safeId(id).replace(/[.]/g, "_").replace(/_+/g, "_").replace(/_+$/, "");

function bySuffix(tests: TestRecord[], dir: string): TestRecord | undefined {
  const hits = tests.filter((t) => {
    const id = folderKey(t.id);
    return id.length > dir.length && id.endsWith(dir) && /[_@-]/.test(id[id.length - dir.length - 1]);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/** Copy framework attachments into artifacts/<test-id>/ right after their suite: a later suite may clear the runner's output folder. */
export function copyAttachments(runDir: string, outDir: string, tests: TestRecord[]): void {
  const artDir = path.join(outDir, "artifacts");
  for (const t of tests) {
    for (const a of t.attachments ?? []) {
      if (!path.isAbsolute(a.path) || !fs.existsSync(a.path) || fs.statSync(a.path).size > 200 * 1024 * 1024) continue;
      const dst = path.join(artDir, safeId(t.id), path.basename(a.path));
      if (path.resolve(a.path) !== dst) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(a.path, dst);
      }
      a.path = path.relative(runDir, dst).split(path.sep).join("/");
    }
  }
}

/** Manifest of files the suites left under artifacts/<test-id>/, plus framework attachments copied in. */
export function collectArtifacts(runDir: string, outDir: string, tests: TestRecord[]): ArtifactEntry[] {
  const out: ArtifactEntry[] = [];
  const artDir = path.join(outDir, "artifacts");
  const bySafe = new Map<string, TestRecord>();
  for (const t of tests) {
    bySafe.set(folderKey(t.id), t);
    bySafe.set(folderKey(t.id.slice(t.adapter.length + 1)), t);
    bySafe.set(folderKey(t.name), t);
  }
  copyAttachments(runDir, outDir, tests);
  const walk = (d: string, test: TestRecord | undefined, dirName: string) => {
    let es: fs.Dirent[];
    try {
      es = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, test, dirName);
      else {
        const ext = path.extname(e.name).toLowerCase();
        const ct = MIME[ext] ?? "application/octet-stream";
        const fromAttachment = test?.attachments?.find((a) => path.resolve(runDir, a.path) === p);
        const step = /^(?:step[-_]?)?(\d+)[-_](.+)\.\w+$/.exec(e.name);
        const entry: ArtifactEntry = { file: path.relative(runDir, p).split(path.sep).join("/"), artifact_type: artifactType(e.name, fromAttachment?.contentType || ct), test_name: test?.name ?? dirName, test_id: test?.id ?? null, content_type: fromAttachment?.contentType || ct, size_bytes: fileSize(p) };
        if (step) {
          entry.step_index = Number(step[1]);
          entry.step_label = step[2].replace(/[-_]+/g, " ");
        }
        out.push(entry);
      }
    }
  };
  try {
    for (const e of fs.readdirSync(artDir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(artDir, e.name), bySafe.get(folderKey(e.name)) ?? bySuffix(tests, folderKey(e.name)), e.name);
    }
  } catch {
    /* none */
  }
  return out;
}
