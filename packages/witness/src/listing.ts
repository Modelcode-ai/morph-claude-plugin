import * as fs from "node:fs";
import * as path from "node:path";
import { ADAPTERS, type Adapter, addArgs, fillSelect, hasSelectVar } from "./adapters.ts";
import { type ListFormat, type Suite, substitute, type Vars } from "./config.ts";
import { parseReportFile } from "./parsers/index.ts";
import { childEnv, runCapture } from "./proc.ts";
import { toRecord } from "./reconcile.ts";
import { fmtDuration, globFiles, readJson, sha, writeJson } from "./util.ts";

export type ListSource = "native" | "template" | "last-report" | "none";

export interface TestList {
  ids?: string[];
  source: ListSource;
  /** Where the list came from, e.g. `list: last report r-… (2h ago, 12 tests)`. */
  detail: string;
  error?: string;
  log?: string;
}

export interface ListCommand {
  cmd: string;
  format: ListFormat;
  source: "native" | "template";
  report?: string;
}

interface ListCache {
  suite: string;
  key: string;
  run_id: string;
  commit: string;
  at: string;
  ids: string[];
}

const cacheFile = (root: string, suite: string) => path.join(root, ".witness", "cache", "tests", `${suite}.json`);

/** What the cached list depends on. Not the command: wrapping or adding flags keeps the tests; ids that are gone end as missing, never failed. */
export const suiteKey = (s: Suite) => sha(JSON.stringify(s.repo ? [s.adapter, s.cwd, s.repo] : [s.adapter, s.cwd]));

export function readListCache(root: string, suite: Suite): ListCache | undefined {
  const c = readJson<ListCache | null>(cacheFile(root, suite.name), null);
  return c && Array.isArray(c.ids) && c.ids.length ? c : undefined;
}

/** Remember the tests of a complete report; the fallback list for suites that can't list. */
export function writeListCache(root: string, suite: Suite, runId: string, commit: string, ids: string[]) {
  if (!ids.length) return;
  try {
    writeJson(cacheFile(root, suite.name), { suite: suite.name, key: suiteKey(suite), run_id: runId, commit, at: new Date().toISOString(), ids: [...new Set(ids)] } satisfies ListCache);
  } catch {
    /* read-only checkout: no cache */
  }
}

/** The command that lists the suite's tests: the suite's `list` template, else the adapter's own; null when neither exists. */
export function listCommand(suite: Suite, adapter: Adapter, vars: Vars, reportDir: string, cwd: string): ListCommand | null {
  const v = { ...vars, WITNESS_REPORT_DIR: reportDir };
  if (suite.list) return { cmd: fillSelect(substitute(suite.list.cmd, v)), format: suite.list.format, source: "template", report: suite.list.report && substitute(suite.list.report, v) };
  const nl = adapter.list;
  if (!nl) return null;
  let cmd: string | null = substitute(suite.cmd, v);
  if (nl.rewrite) cmd = nl.rewrite(cmd);
  if (!cmd) return null;
  if (nl.args) cmd = addArgs(cmd, nl.args);
  if (nl.format === "report") {
    if (!adapter.reportArgs || suite.report || (adapter.reportMarker && adapter.reportMarker.test(cmd))) return null;
    cmd = addArgs(cmd, adapter.reportArgs(reportDir, cwd, cmd));
  }
  return { cmd: fillSelect(cmd), format: nl.format, source: "native" };
}

const CLASS_HASH = new Set(["dotnet", "junit-maven", "junit-gradle", "phpunit", "generic"]);

function parseListing(lc: ListCommand, adapter: Adapter, out: string, reportDir: string, cwd: string): string[] {
  if (lc.format === "lines") return [...new Set(out.split(/\r?\n/).map((l) => l.trim().replace(new RegExp(`^${adapter.name}:`), "")).filter((l) => l && !l.startsWith("#")))];
  if (lc.format === "adapter") return adapter.list?.parse?.(out) ?? [];
  const files = globFiles(reportDir, ["**/*.{xml,trx,json}"]).map((f) => path.join(reportDir, f));
  if (lc.report) {
    const abs = path.isAbsolute(lc.report);
    const base = abs ? path.dirname(lc.report) : cwd;
    files.push(...globFiles(base, [abs ? path.basename(lc.report) : lc.report]).map((f) => path.join(base, f)));
  }
  const ids = files.flatMap((f) => parseReportFile(f, adapter.format, cwd).cases.map((c) => toRecord(c, adapter, "list", cwd).name));
  return [...new Set(ids)];
}

const ago = (iso: string) => fmtDuration(Math.max(0, Date.now() - Date.parse(iso)));

export interface ListCtx {
  root: string;
  cwd: string;
  vars: Vars;
  env: Record<string, string>;
  log: string;
  scratch: string;
  abort?: { aborted: boolean };
  track?: (pgid: number, running: boolean) => void;
  /** The suite runs from another checkout (the base side): this checkout's last report says nothing about its tests. */
  noCache?: boolean;
}

/** List a suite's tests: its template, the adapter's own listing, else the tests of the last complete report. */
export async function listSuiteTests(suite: Suite, ctx: ListCtx): Promise<TestList> {
  const adapter = ADAPTERS[suite.adapter];
  fs.rmSync(ctx.scratch, { recursive: true, force: true });
  fs.mkdirSync(ctx.scratch, { recursive: true });
  const lc = listCommand(suite, adapter, ctx.vars, ctx.scratch, ctx.cwd);
  const cache = ctx.noCache ? undefined : readListCache(ctx.root, suite);
  const fresh = cache && cache.key === suiteKey(suite) ? cache : undefined;
  let error: string | undefined;
  if (lc) {
    const v = { ...ctx.vars, WITNESS_REPORT_DIR: ctx.scratch };
    const env = childEnv(ctx.env, { WITNESS_REPORT_DIR: ctx.scratch, ...adapter.env, ...(lc.format === "report" && lc.source === "native" && adapter.reportEnv ? adapter.reportEnv(ctx.scratch) : {}), ...Object.fromEntries(Object.entries(suite.env).map(([k, x]) => [k, substitute(x, v)])) });
    const r = await runCapture(lc.cmd, { cwd: ctx.cwd, env, timeoutMs: 5 * 60_000, log: ctx.log, abort: ctx.abort, track: ctx.track });
    let ids = r.code === 0 || lc.format === "report" ? parseListing(lc, adapter, r.out, ctx.scratch, ctx.cwd) : [];
    if (ids.length) {
      let detail = `list: ${lc.source}`;
      if (CLASS_HASH.has(adapter.name) && fresh && ids.some((x) => !x.includes("#"))) {
        const byMethod = new Map<string, string[]>();
        for (const c of fresh.ids) if (c.includes("#")) byMethod.set(c.slice(c.indexOf("#") + 1), [...(byMethod.get(c.slice(c.indexOf("#") + 1)) ?? []), c]);
        ids = ids.map((x) => (!x.includes("#") && byMethod.get(x)?.length === 1 ? byMethod.get(x)![0] : x));
        detail += `, class names from the last report ${fresh.run_id}`;
      }
      return { ids, source: lc.source, detail, log: ctx.log };
    }
    error = r.timedOut ? "listing timed out" : `listing failed (exit ${r.code}${r.code === 0 ? ", no tests in the output" : ""})`;
  }
  if (fresh) return { ids: fresh.ids, source: "last-report", detail: `list: last report ${fresh.run_id} (${ago(fresh.at)} ago, ${fresh.ids.length} tests${error ? `; ${lc!.source} ${error}` : ""})`, error, log: lc ? ctx.log : undefined };
  const why = error ?? (lc ? "no tests listed" : `the ${adapter.name} adapter can't list tests and the suite has no complete run yet`);
  return { source: "none", detail: `list: none (${cache ? `${why}; the last report is from a different adapter or folder` : why})`, error: why, log: lc ? ctx.log : undefined };
}

export interface Capabilities {
  suite: string;
  report: string;
  list: string;
  select: string;
  per_test_timeout: string;
  consequences: string[];
}

/** What witness can do for this suite, and what each missing capability costs, without running anything. */
export function capabilities(suite: Suite, root: string, cwd: string, runSettings: { stallMs: number }): Capabilities {
  const a = ADAPTERS[suite.adapter];
  const out: string[] = [];
  const hint = suite.report ? undefined : a.reportHint?.(cwd, suite.cmd);
  let report: string;
  if (suite.report) report = `override ${suite.report}`;
  else if (hint) report = "none";
  else if (suite.adapter === "generic") report = "exit code only (or a report found in $WITNESS_REPORT_DIR)";
  else report = `adapter (${a.format}${a.fromStdout ? " on stdout" : ""})`;
  if (hint) out.push(`no per-test report: ${hint}`);
  else if (suite.adapter === "generic" && !suite.report) out.push('exit code only: one suite-level row and no per-test results unless the command writes a report to $WITNESS_REPORT_DIR (or set report = "<glob>")');

  const cache = readListCache(root, suite);
  const fresh = cache && cache.key === suiteKey(suite) ? cache : undefined;
  const nativeList = listCommand(suite, a, {}, "/x", cwd);
  const list = suite.list ? "template" : nativeList ? "native" : fresh ? `last-report ${fresh.run_id}` : "none";
  if (list === "none")
    out.push("no test list: plan check can't confirm test ids, and a missing or unreadable report gives one suite-level row instead of per-test reruns (set list = \"<cmd>\", or run the whole suite once so witness can reuse its report)");
  else if (list.startsWith("last-report")) out.push(`test list from the last complete report (${fresh!.run_id}, ${ago(fresh!.at)} ago): tests added since are unknown until the next full run`);

  let select: string;
  if (suite.select) select = "template";
  else if (hasSelectVar(suite.cmd)) select = a.selectArgs ? "placeholder" : "none";
  else if (a.select ? a.select(suite.cmd, ["x"]) : a.selectArgs) select = "native";
  else select = "none";
  if (select === "none")
    out.push(`no selection: --select, --retries and per-test reruns don't work${a.selectArgs ? " (put ${WITNESS_SELECT} where the runner's arguments go: the command is too complex to rewrite)" : ' (set select = "<cmd> {ids}")'}`);

  const nativeTimeout = !!a.perTestTimeoutEnv || !!a.perTestTimeout?.(60_000, cwd, suite.cmd);
  const ptt = suite.perTestTimeoutArg ? "template" : nativeTimeout ? "native" : "none";
  const set = suite.perTestTimeoutMs ? `per_test_timeout = ${fmtDuration(suite.perTestTimeoutMs)}` : "per_test_timeout not set";
  if (ptt === "none")
    out.push(`no per-test timeout${suite.perTestTimeoutMs ? ` (per_test_timeout = ${fmtDuration(suite.perTestTimeoutMs)} is ignored)` : ""}: a hanging test holds the suite until its timeout (${fmtDuration(suite.timeoutMs)}) or ${fmtDuration(runSettings.stallMs)} without output; set per_test_timeout_arg = "<runner flag with {s}>" if the runner has one`);
  return { suite: suite.name, report, list, select, per_test_timeout: ptt === "none" ? "none" : `${ptt}, ${set}`, consequences: out };
}

export const capabilityLine = (c: Capabilities) => `report: ${c.report} · list: ${c.list} · select: ${c.select} · per-test timeout: ${c.per_test_timeout}`;
