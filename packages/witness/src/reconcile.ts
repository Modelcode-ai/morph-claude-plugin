import * as path from "node:path";
import { type Adapter, normFile, stableId } from "./adapters.ts";
import type { Kind } from "./config.ts";
import type { Cause } from "./diagnosis.ts";
import type { Attachment, ParsedFile, RawCase, StatusDetail, TestStatus } from "./parsers/types.ts";

export type Obtained = "report" | "per-test-rerun" | "suite-level";
export type Parity = "same" | "differs" | "origin_only" | "target_only";

export interface TestRecord {
  id: string;
  name: string;
  suite: string;
  adapter: string;
  status: TestStatus;
  statusDetail?: StatusDetail;
  durationMs: number;
  message?: string;
  trace?: string;
  filePath?: string;
  retries?: number;
  flaky?: boolean;
  obtained: Obtained;
  parity?: Parity;
  originStatus?: TestStatus;
  attachments?: Attachment[];
}

export type SuiteState = "passed" | "failed" | "error" | "stalled" | "timeout" | "interrupted" | "skipped" | "pending" | "running";
export type SuiteEnd = "exit" | "timeout" | "stalled" | "interrupted" | "service_died";

export interface SuiteSummary {
  name: string;
  state: SuiteState;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  missing: number;
  exit_code?: number | null;
  cause?: Cause;
  note?: string;
  kind?: Kind;
  /** Services witness started for the suite; empty when the tests host the app themselves. */
  services?: string[];
}

export interface ReconcileInput {
  suite: string;
  adapter: Adapter;
  exitCode: number | null;
  end: SuiteEnd;
  files: ParsedFile[];
  expected?: string[];
  cwd: string;
  /** No report was asked for (generic adapter without `report`): the exit code is the result. */
  exitCodeOnly?: boolean;
}

export interface ReconcileResult {
  tests: TestRecord[];
  state: SuiteState;
  cause?: Cause;
  note?: string;
  /** No usable report: the caller should rerun these ids one by one. */
  rerun?: string[];
  evidence?: string;
  hint?: string;
}

const SETUP_FAILURE = /fixture type .* threw|threw in InitializeAsync|OneTimeSetUp|"before all" hook|beforeAll hook|setUpClass|error in fixture setup|failed on setup/i;

const cleanId = (adapter: Adapter, id: string) => (id.startsWith(`${adapter.name}:`) ? id.slice(adapter.name.length + 1) : id);

export function toRecord(c: RawCase, adapter: Adapter, suite: string, cwd: string, obtained: Obtained = "report"): TestRecord {
  const file = normFile(c.file, cwd);
  const raw = { ...c, file };
  const local = adapter.id(raw);
  const r: TestRecord = { id: stableId(adapter.name, local), name: local, suite, adapter: adapter.name, status: c.status, durationMs: c.durationMs, obtained };
  if (c.statusDetail) r.statusDetail = c.statusDetail;
  else if (c.status === "failed" && SETUP_FAILURE.test(c.message ?? "")) r.statusDetail = "error";
  if (c.message) r.message = c.message;
  if (c.trace) r.trace = c.trace;
  if (file) r.filePath = file;
  if (c.retries) r.retries = c.retries;
  if (c.flaky) r.flaky = true;
  if (c.attachments?.length) r.attachments = c.attachments.map((a) => ({ ...a, path: path.isAbsolute(a.path) ? a.path : path.join(cwd, a.path) }));
  return r;
}

/** One record per id; a later result wins, and pass-after-fail is flaky. */
export function dedupe(tests: TestRecord[]): TestRecord[] {
  const m = new Map<string, TestRecord>();
  for (const t of tests) {
    const prev = m.get(t.id);
    if (!prev) {
      m.set(t.id, t);
      continue;
    }
    const merged = { ...t, retries: (prev.retries ?? 0) + (t.retries ?? 0) + 1 };
    if (t.status === "passed" && prev.status === "failed") merged.flaky = true;
    merged.attachments = [...(prev.attachments ?? []), ...(t.attachments ?? [])];
    if (!merged.attachments.length) delete merged.attachments;
    m.set(t.id, merged);
  }
  return [...m.values()];
}

export function summarize(name: string, state: SuiteState, tests: TestRecord[]): SuiteSummary {
  const s: SuiteSummary = { name, state, passed: 0, failed: 0, skipped: 0, error: 0, missing: 0 };
  for (const t of tests) {
    if (t.status === "passed") s.passed++;
    else if (t.status === "skipped" || t.status === "pending") s.skipped++;
    else if (t.status === "failed" && !t.statusDetail) s.failed++;
    else if (t.statusDetail === "missing") s.missing++;
    else s.error++;
  }
  return s;
}

/** One row for a whole suite. Without a report, exit 0 proves nothing, so it is other/missing, never passed. */
export function suiteLevel(adapter: Adapter, suite: string, exitCode: number | null, message: string, exitCodeOnly = false): TestRecord {
  const ok = exitCode === 0;
  const r: TestRecord = { id: stableId(adapter.name, `(suite ${suite})`), name: suite, suite, adapter: adapter.name, status: ok ? (exitCodeOnly ? "passed" : "other") : "failed", durationMs: 0, obtained: "suite-level", message };
  if (!exitCodeOnly) r.statusDetail = ok ? "missing" : "error";
  return r;
}

/** A selected id is present when the report has it, or has parametrized cases of it (Theory, DataRow, pytest params). */
export function presentIn(ids: Set<string>, id: string): boolean {
  if (ids.has(id)) return true;
  for (const x of ids) if (x.startsWith(`${id}(`) || x.startsWith(`${id} (`) || x.startsWith(`${id}[`)) return true;
  return false;
}

/** Apply the reconciliation rules: what the report says vs. how the process ended. */
export function reconcile(inp: ReconcileInput): ReconcileResult {
  const { adapter, suite, exitCode, end, cwd } = inp;
  const unreadable = inp.files.filter((f) => f.error);
  let tests = dedupe(inp.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd))));
  const expected = (inp.expected ?? []).map((id) => stableId(adapter.name, cleanId(adapter, id)));

  if (end === "interrupted" || end === "service_died" || end === "timeout" || end === "stalled") {
    const have = new Set(tests.map((t) => t.id));
    for (const id of expected) if (!presentIn(have, id)) tests.push(missing(id, adapter, suite, end === "timeout" || end === "stalled" ? "timeout" : "missing"));
    const state: SuiteState = end === "interrupted" ? "interrupted" : end === "service_died" ? "error" : end === "timeout" ? "timeout" : "stalled";
    const cause: Cause | undefined = end === "service_died" ? "service_died" : end === "timeout" ? "suite_timeout" : end === "stalled" ? "stalled" : undefined;
    if (!tests.length && end !== "interrupted") tests = [{ ...suiteLevel(adapter, suite, 1, `suite ${end === "service_died" ? "aborted: a service died" : end}`), statusDetail: end === "service_died" ? "error" : "timeout" }];
    return { tests, state, cause };
  }

  if (tests.length) {
    const have = new Set(tests.map((t) => t.id));
    const absent = expected.filter((id) => !presentIn(have, id));
    for (const id of absent) tests.push(missing(id, adapter, suite, "missing"));
    const failed = tests.filter((t) => t.status === "failed");
    if (failed.length && failed.every((t) => t.statusDetail === "error")) {
      const lines = (failed[0].message ?? "").split("\n").map((l) => l.replace(/^[-\s]+/, "").trim()).filter(Boolean);
      const inner = lines.slice(1).find((l) => /exception|error|did not|timed? ?out|refused|not found/i.test(l));
      return { tests, state: "error", cause: "setup_failed", note: `${failed.length} test(s) errored in fixture setup; none failed its own checks`, evidence: [lines[0], inner].filter(Boolean).join(" · ").slice(0, 500), hint: "a test fixture's setup failed (it starts a browser, app, container or database), so no test ran its own checks: fix what the fixture needs, then run the suite again" };
    }
    if (failed.length) return { tests, state: "failed", note: unreadable.length ? `${unreadable.length} report file(s) unreadable` : undefined };
    if (exitCode !== 0) return { tests, state: "error", cause: "report_incomplete", note: `exit code ${exitCode} but the report shows no failures` };
    if (absent.length) return { tests, state: "error", cause: "report_incomplete", note: `${absent.length} expected test(s) missing from the report` };
    if (unreadable.length) return { tests, state: "error", cause: "report_unreadable", note: `${unreadable.length} report file(s) unreadable: ${unreadable[0].error}` };
    if (tests.every((t) => t.status === "skipped" || t.status === "pending"))
      return { tests, state: "error", cause: "report_incomplete", note: `all ${tests.length} test(s) were skipped; nothing was checked`, hint: "every test was skipped: look for a skip condition that fired (a fixture that skips when the app or a dependency is unreachable, a missing marker or env var)" };
    return { tests, state: "passed" };
  }

  if (inp.exitCodeOnly) {
    return { tests: [suiteLevel(adapter, suite, exitCode, `exit code ${exitCode}`, true)], state: exitCode === 0 ? "passed" : "failed" };
  }
  const cause: Cause = unreadable.length ? "report_unreadable" : "report_missing";
  const note = unreadable.length ? `report unreadable: ${unreadable[0].error}` : inp.files.length ? "report lists no tests" : "no report written";
  if (expected.length) return { tests: [], state: "error", cause, note, rerun: expected.map((id) => cleanId(adapter, id.slice(adapter.name.length + 1))) };
  return { tests: [suiteLevel(adapter, suite, exitCode, `${note}; exit code ${exitCode}`)], state: "error", cause, note };
}

export function missing(id: string, adapter: Adapter, suite: string, detail: StatusDetail, message?: string): TestRecord {
  return { id, name: id.slice(adapter.name.length + 1), suite, adapter: adapter.name, status: "other", statusDetail: detail, durationMs: 0, obtained: "report", message: message ?? (detail === "timeout" ? "did not finish before the suite was stopped" : "expected but absent from the report") };
}

/** Results of rerunning tests one at a time after the suite's own report was unusable. */
export function fromReruns(results: { id: string; exitCode: number | null; files: ParsedFile[]; timedOut?: boolean }[], adapter: Adapter, suite: string, cwd: string, originalExit: number | null, cause: Cause): ReconcileResult {
  const tests: TestRecord[] = [];
  for (const r of results) {
    const sid = stableId(adapter.name, r.id);
    const cases = r.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd, "per-test-rerun")));
    const exact = cases.find((c) => c.id === sid);
    const params = cases.filter((c) => presentIn(new Set([c.id]), sid));
    const hit = exact ?? (params.length ? { ...params[0], id: sid, status: params.some((c) => c.status === "failed") ? ("failed" as const) : params[0].status } : cases.length === 1 ? { ...cases[0], id: sid } : undefined);
    if (hit) tests.push(hit);
    else if (r.timedOut || r.exitCode !== 0) {
      const t: TestRecord = { id: sid, name: r.id, suite, adapter: adapter.name, status: "failed", durationMs: 0, obtained: "per-test-rerun", message: r.timedOut ? "timed out when run alone" : `run alone: exit code ${r.exitCode}` };
      if (r.timedOut) t.statusDetail = "timeout";
      tests.push(t);
    } else {
      // exit 0 without the test in a report can mean the filter matched nothing: never a pass
      tests.push({ id: sid, name: r.id, suite, adapter: adapter.name, status: "other", statusDetail: "missing", durationMs: 0, obtained: "per-test-rerun", message: "run alone: exit code 0 but the test is not in its report (the filter may have matched nothing)" });
    }
  }
  const failed = tests.some((t) => t.status === "failed");
  if (failed) return { tests, state: "failed", cause, note: "suite report unusable; tests rerun one by one" };
  if (tests.some((t) => t.status === "other")) return { tests, state: "error", cause, note: "suite report unusable; some tests rerun alone are missing from their reports" };
  if (originalExit !== 0) return { tests, state: "error", cause: "report_incomplete", note: `suite exited ${originalExit} without a usable report, but each test passes alone` };
  return { tests, state: "passed", cause, note: "suite report unusable; tests rerun one by one" };
}

const RANK: Record<string, number> = { passed: 0, failed: 1, error: 2, stalled: 3, mistrial: 4, interrupted: 5 };
export type Outcome = "passed" | "failed" | "error" | "mistrial" | "stalled" | "interrupted";

export function worst(a: Outcome, b: Outcome): Outcome {
  return RANK[b] > RANK[a] ? b : a;
}

export function suiteOutcome(s: SuiteSummary): Outcome {
  switch (s.state) {
    case "passed":
    case "skipped":
      return "passed";
    case "failed":
      return "failed";
    case "stalled":
    case "timeout":
      return "stalled";
    case "interrupted":
      return "interrupted";
    case "error":
      return s.cause === "service_died" ? "mistrial" : "error";
    default:
      return "error";
  }
}

export const EXIT: Record<Outcome, number> = { passed: 0, failed: 1, error: 2, mistrial: 3, stalled: 4, interrupted: 5 };

/** Per-test parity of the target run against the origin run. */
export function applyParity(target: TestRecord[], origin: TestRecord[]): { tests: TestRecord[]; counts: Record<Parity, number> } {
  const o = new Map(origin.map((t) => [t.id, t]));
  const counts: Record<Parity, number> = { same: 0, differs: 0, origin_only: 0, target_only: 0 };
  const out: TestRecord[] = target.map((t) => {
    const ot = o.get(t.id);
    o.delete(t.id);
    if (!ot) {
      counts.target_only++;
      return { ...t, parity: "target_only" };
    }
    const p: Parity = ot.status === t.status ? "same" : "differs";
    counts[p]++;
    return { ...t, parity: p, originStatus: ot.status };
  });
  for (const ot of o.values()) {
    if (ot.obtained === "suite-level") continue;
    counts.origin_only++;
    out.push({ id: ot.id, name: ot.name, suite: ot.suite, adapter: ot.adapter, status: "other", statusDetail: "missing", durationMs: 0, obtained: ot.obtained, filePath: ot.filePath, parity: "origin_only", originStatus: ot.status, message: "present on the origin, absent on the target" });
  }
  return { tests: out, counts };
}
