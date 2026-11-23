import * as fs from "node:fs";
import * as path from "node:path";
import { ADAPTERS, type Adapter, appendArgs, selectCommand } from "./adapters.ts";
import { type Config, type Suite, substitute } from "./config.ts";
import { type Diagnosis, diagnose } from "./diagnosis.ts";
import type { Progress } from "./output.ts";
import { parseReportFile } from "./parsers/index.ts";
import type { ParsedFile } from "./parsers/types.ts";
import { childEnv, killGroup, runCapture, spawnGroup } from "./proc.ts";
import { fromReruns, reconcile, type ReconcileResult, type SuiteEnd, type SuiteSummary, suiteLevel, summarize, type TestRecord, toRecord } from "./reconcile.ts";
import type { RunDir } from "./rundir.ts";
import type { Stack } from "./stack.ts";
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

/** Build the command a suite runs: select, report args, per-test timeout. */
export function suiteCommand(suite: Suite, adapter: Adapter, vars: Record<string, string | undefined>, reportDir: string, select?: string[], cwd = "."): string {
  let cmd = substitute(suite.cmd, vars);
  if (select?.length) {
    const sel = selectCommand(adapter, cmd, select, suite.select ? substitute(suite.select, vars) : undefined);
    if (!sel) throw new Error(`suite ${suite.name}: adapter ${adapter.name} cannot select single tests; add select = "... {ids}" to the suite`);
    cmd = sel;
  }
  if (adapter.reportArgs && !suite.report && !(adapter.reportMarker && adapter.reportMarker.test(cmd))) cmd = appendArgs(cmd, adapter.reportArgs(reportDir, cwd, cmd));
  const ptt = suite.perTestTimeoutMs && adapter.perTestTimeout ? adapter.perTestTimeout(suite.perTestTimeoutMs, cwd, cmd) : null;
  if (ptt) cmd = appendArgs(cmd, ptt);
  return cmd;
}

export async function runSuite(ctx: SuiteCtx, suite: Suite, select: string[] | undefined, retries: number): Promise<SuiteRun> {
  const adapter = ADAPTERS[suite.adapter];
  const cwd = path.resolve(ctx.root, suite.cwd);
  const p = ctx.prefix ?? "";
  const reportDir = path.join(ctx.outDir, "reports", suite.name);
  const log = path.join(ctx.outDir, "logs", `${suite.name}.log`);
  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const t0 = Date.now();
  const vars = { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir };
  const cmd = suiteCommand(suite, adapter, vars, reportDir, select, cwd);
  ctx.progress.line(`${p}suite  ${suite.name} · ${cmd}`);
  ctx.run.event("suite_started", { suite: suite.name, cmd, origin: !!p }, `${p}suite ${suite.name} running`);
  const exec = await execWatched(ctx, suite, adapter, cmd, cwd, reportDir, log, suite.timeoutMs);
  const files = collect(ctx, suite, adapter, cwd, reportDir, log, t0);
  let expected = select;
  const usable = files.some((f) => f.cases.length);
  const hint = adapter.reportHint?.(cwd, cmd);
  if (!expected && !usable && !hint && exec.end === "exit" && adapter.list && !(suite.adapter === "generic" && !suite.report)) {
    expected = await listTests(ctx, suite, adapter, cwd, log);
  }
  const exitCodeOnly = suite.adapter === "generic" && !suite.report && files.length === 0;
  let res: ReconcileResult = reconcile({ suite: suite.name, adapter, exitCode: exec.code, end: exec.end, files, expected, cwd, exitCodeOnly });

  if (res.rerun?.length && !ctx.abort.aborted) {
    if (res.rerun.length <= MAX_RERUNS && (adapter.select || suite.select) && !hint) {
      ctx.progress.line(`${p}suite  ${suite.name} · ${res.cause === "report_unreadable" ? "report unreadable" : "no report"}; rerunning ${res.rerun.length} test(s) one at a time`);
      const results = [];
      for (const [i, id] of res.rerun.entries()) {
        if (ctx.abort.aborted) break;
        const dir = path.join(reportDir, "rerun", String(i + 1));
        fs.mkdirSync(dir, { recursive: true });
        const c = suiteCommand(suite, adapter, { ...vars, WITNESS_REPORT_DIR: dir }, dir, [id], cwd);
        const e = await execWatched(ctx, suite, adapter, c, cwd, dir, path.join(ctx.outDir, "logs", `${suite.name}.rerun.log`), suite.perTestTimeoutMs ?? Math.min(suite.timeoutMs, 10 * 60_000));
        if (e.died) {
          exec.died = e.died;
          break;
        }
        const got = collect(ctx, suite, adapter, cwd, dir, path.join(ctx.outDir, "logs", `${suite.name}.rerun.log`), Date.now() - e.ms);
        if (i === 0 && !got.some((f) => f.cases.length)) {
          ctx.progress.line(`${p}suite  ${suite.name} · a single test run alone wrote no report either; not rerunning the rest`);
          results.length = 0;
          break;
        }
        results.push({ id, exitCode: e.code, files: got, timedOut: e.end !== "exit" });
      }
      res = results.length ? fromReruns(results, adapter, suite.name, cwd, exec.code, res.cause!) : { ...res, rerun: undefined, tests: [suiteLevel(adapter, suite.name, exec.code, `${res.note}; exit code ${exec.code}`)] };
    } else {
      res = { ...res, tests: [suiteLevel(adapter, suite.name, exec.code, `${res.note}; exit code ${exec.code}`)] };
    }
  }

  if (retries > 0 && res.state === "failed" && exec.end === "exit" && !exec.died && (adapter.select || suite.select)) {
    await retryFailed(ctx, suite, adapter, cwd, vars, reportDir, res.tests, retries);
    if (!res.tests.some((t) => t.status === "failed")) res = { ...res, state: "passed" };
  }

  const summary = summarize(suite.name, res.state, res.tests);
  summary.exit_code = exec.code;
  if (res.cause) summary.cause = res.cause;
  if (res.note) summary.note = res.note;
  let diagnosis: Diagnosis | undefined;
  if (exec.died) diagnosis = exec.died;
  else if (res.cause && res.state !== "failed" && res.state !== "passed") {
    const h = res.cause === "report_missing" ? hint : undefined;
    diagnosis = diagnose({ stage: res.cause.startsWith("report") ? "report" : "suite", cause: res.cause, suite: suite.name, command: cmd, log, cwd: suite.cwd, evidence: h ?? (res.cause === "report_unreadable" ? files.find((f) => f.error)?.error : res.cause === "report_incomplete" ? res.note : undefined), extraTry: h ? [h] : undefined });
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
  const vars = ctx.stack.vars();
  const env = childEnv(ctx.baseEnv, {
    ...ctx.stack.serviceUrlEnv(),
    WITNESS_REPORT_DIR: reportDir,
    WITNESS_ARTIFACTS: artifacts,
    WITNESS_RUN_DIR: ctx.run.dir,
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
      const d = await ctx.stack.watch();
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

function collect(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, reportDir: string, log: string, startedAt: number): ParsedFile[] {
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
  const globs = suite.report ? [{ base: "cwd" as const, glob: substitute(suite.report, { ...ctx.stack.vars(), WITNESS_REPORT_DIR: reportDir }) }] : adapter.reportGlobs;
  for (const g of globs) {
    if (g.base === "report-dir") {
      for (const f of globFiles(reportDir, [g.glob], { skipDirs: new Set(["rerun", "retry"]) })) files.push(path.join(reportDir, f));
      continue;
    }
    let base = cwd;
    let glob = g.glob;
    if (path.isAbsolute(glob)) {
      const fixed = glob.split("/").findIndex((s) => /[*?{]/.test(s));
      const parts = glob.split("/");
      base = fixed < 0 ? path.dirname(glob) : parts.slice(0, fixed).join("/") || "/";
      glob = fixed < 0 ? path.basename(glob) : parts.slice(fixed).join("/");
    }
    for (const rel of globFiles(base, [glob], { skipDirs: new Set([".git", "node_modules", ".witness"]) })) {
      const src = path.join(base, rel);
      if (src.startsWith(reportDir + path.sep)) {
        files.push(src);
        continue;
      }
      try {
        if (fs.statSync(src).mtimeMs < startedAt - 2000) continue;
      } catch {
        continue;
      }
      const dst = path.join(reportDir, rel.replace(/[\\/]/g, "__"));
      fs.copyFileSync(src, dst);
      files.push(dst);
    }
  }
  const uniq = [...new Set(files)];
  return uniq.map((f) => parseReportFile(f, adapter.format, cwd));
}

async function listTests(ctx: SuiteCtx, suite: Suite, adapter: Adapter, cwd: string, log: string): Promise<string[] | undefined> {
  const base = substitute(suite.cmd, ctx.stack.vars());
  const cmd = adapter.list!.cmd(base);
  if (!cmd) return undefined;
  ctx.progress.line(`${ctx.prefix ?? ""}suite  ${suite.name} · listing tests to see what the run left out`);
  const r = await runCapture(cmd, { cwd, env: childEnv(ctx.baseEnv, ctx.stack.serviceUrlEnv()), timeoutMs: 5 * 60_000, log: log.replace(/\.log$/, ".list.log") });
  if (r.code !== 0) return undefined;
  const ids = adapter.list!.parse(r.out);
  return ids.length ? ids : undefined;
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
    const t0 = Date.now();
    const e = await execWatched(ctx, suite, adapter, cmd, cwd, dir, rlog, suite.timeoutMs);
    if (e.end !== "exit") return;
    const again = collect(ctx, suite, adapter, cwd, dir, rlog, t0).flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite.name, cwd)));
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
  artifact_type: "screenshot" | "video" | "trace" | "log" | "report";
  test_name: string | null;
  test_id: string | null;
  content_type: string;
  size_bytes: number;
  step_index?: number;
  step_label?: string;
}

export function artifactType(file: string, ct: string): ArtifactEntry["artifact_type"] {
  if (ct.startsWith("image/")) return "screenshot";
  if (ct.startsWith("video/")) return "video";
  if (/trace/i.test(path.basename(file)) || ct === "application/zip") return "trace";
  if (ct === "text/plain") return "log";
  return "report";
}

/** Manifest of files the suites left under artifacts/<test-id>/, plus framework attachments copied in. */
export function collectArtifacts(runDir: string, outDir: string, tests: TestRecord[]): ArtifactEntry[] {
  const out: ArtifactEntry[] = [];
  const artDir = path.join(outDir, "artifacts");
  const bySafe = new Map<string, TestRecord>();
  for (const t of tests) {
    bySafe.set(safeId(t.id), t);
    bySafe.set(safeId(t.id.slice(t.adapter.length + 1)), t);
    bySafe.set(safeId(t.name), t);
  }
  for (const t of tests) {
    for (const a of t.attachments ?? []) {
      if (!fs.existsSync(a.path) || fs.statSync(a.path).size > 200 * 1024 * 1024) continue;
      const dst = path.join(artDir, safeId(t.id), path.basename(a.path));
      if (path.resolve(a.path) !== dst) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(a.path, dst);
      }
      a.path = path.relative(runDir, dst);
    }
  }
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
        const entry: ArtifactEntry = { file: path.relative(runDir, p), artifact_type: artifactType(e.name, fromAttachment?.contentType || ct), test_name: test?.name ?? dirName, test_id: test?.id ?? null, content_type: fromAttachment?.contentType || ct, size_bytes: fileSize(p) };
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
      if (e.isDirectory()) walk(path.join(artDir, e.name), bySafe.get(e.name), e.name);
    }
  } catch {
    /* none */
  }
  return out;
}
