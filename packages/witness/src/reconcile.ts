import * as path from "node:path";
import { type Adapter, normFile, stableId } from "./adapters.ts";
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
}

const cleanId = (adapter: Adapter, id: string) => (id.startsWith(`${adapter.name}:`) ? id.slice(adapter.name.length + 1) : id);

export function toRecord(c: RawCase, adapter: Adapter, suite: string, cwd: string, obtained: Obtained = "report"): TestRecord {
  const file = normFile(c.file, cwd);
  const raw = { ...c, file };
  const local = adapter.id(raw);
  const r: TestRecord = { id: stableId(adapter.name, local), name: local, suite, adapter: adapter.name, status: c.status, durationMs: c.durationMs, obtained };
  if (c.statusDetail) r.statusDetail = c.statusDetail;
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
    else if (t.status === "failed" && t.statusDetail !== "error") s.failed++;
    else if (t.statusDetail === "missing") s.missing++;
    else s.error++;
  }
  return s;
}

export function suiteLevel(adapter: Adapter, suite: string, exitCode: number | null, message: string): TestRecord {
  const ok = exitCode === 0;
  const r: TestRecord = { id: stableId(adapter.name, `(suite ${suite})`), name: suite, suite, adapter: adapter.name, status: ok ? "passed" : "failed", durationMs: 0, obtained: "suite-level", message };
  if (!ok) r.statusDetail = "error";
  return r;
}

/** Apply the reconciliation rules: what the report says vs. how the process ended. */
export function reconcile(inp: ReconcileInput): ReconcileResult {
  const { adapter, suite, exitCode, end, cwd } = inp;
  const unreadable = inp.files.filter((f) => f.error);
  let tests = dedupe(inp.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd))));
  const expected = (inp.expected ?? []).map((id) => stableId(adapter.name, cleanId(adapter, id)));

  if (end === "interrupted" || end === "service_died" || end === "timeout" || end === "stalled") {
    const have = new Set(tests.map((t) => t.id));
    for (const id of expected) if (!have.has(id)) tests.push(missing(id, adapter, suite, end === "timeout" || end === "stalled" ? "timeout" : "missing"));
    const state: SuiteState = end === "interrupted" ? "interrupted" : end === "service_died" ? "error" : end === "timeout" ? "timeout" : "stalled";
    const cause: Cause | undefined = end === "service_died" ? "service_died" : end === "timeout" ? "suite_timeout" : end === "stalled" ? "stalled" : undefined;
    if (!tests.length && end !== "interrupted") tests = [{ ...suiteLevel(adapter, suite, 1, `suite ${end === "service_died" ? "aborted: a service died" : end}`), statusDetail: end === "service_died" ? "error" : "timeout" }];
    return { tests, state, cause };
  }

  if (tests.length) {
    const have = new Set(tests.map((t) => t.id));
    const absent = expected.filter((id) => !have.has(id));
    for (const id of absent) tests.push(missing(id, adapter, suite, "missing"));
    const failed = tests.some((t) => t.status === "failed");
    if (failed) return { tests, state: "failed", note: unreadable.length ? `${unreadable.length} report file(s) unreadable` : undefined };
    if (exitCode !== 0) return { tests, state: "error", cause: "report_incomplete", note: `exit code ${exitCode} but the report shows no failures` };
    if (absent.length) return { tests, state: "error", cause: "report_incomplete", note: `${absent.length} expected test(s) missing from the report` };
    if (unreadable.length) return { tests, state: "error", cause: "report_unreadable", note: `${unreadable.length} report file(s) unreadable: ${unreadable[0].error}` };
    return { tests, state: "passed" };
  }

  if (inp.exitCodeOnly) {
    return { tests: [suiteLevel(adapter, suite, exitCode, `exit code ${exitCode}`)], state: exitCode === 0 ? "passed" : "failed" };
  }
  const cause: Cause = unreadable.length ? "report_unreadable" : "report_missing";
  const note = unreadable.length ? `report unreadable: ${unreadable[0].error}` : inp.files.length ? "report lists no tests" : "no report written";
  if (expected.length) return { tests: [], state: "error", cause, note, rerun: expected.map((id) => cleanId(adapter, id.slice(adapter.name.length + 1))) };
  return { tests: [suiteLevel(adapter, suite, exitCode, `${note}; exit code ${exitCode}`)], state: "error", cause, note };
}

function missing(id: string, adapter: Adapter, suite: string, detail: StatusDetail): TestRecord {
  return { id, name: id.slice(adapter.name.length + 1), suite, adapter: adapter.name, status: "other", statusDetail: detail, durationMs: 0, obtained: "report", message: detail === "timeout" ? "did not finish before the suite was stopped" : "expected but absent from the report" };
}

/** Results of rerunning tests one at a time after the suite's own report was unusable. */
export function fromReruns(results: { id: string; exitCode: number | null; files: ParsedFile[]; timedOut?: boolean }[], adapter: Adapter, suite: string, cwd: string, originalExit: number | null, cause: Cause): ReconcileResult {
  const tests: TestRecord[] = [];
  for (const r of results) {
    const sid = stableId(adapter.name, r.id);
    const cases = r.files.flatMap((f) => f.cases.map((c) => toRecord(c, adapter, suite, cwd, "per-test-rerun")));
    const hit = cases.find((c) => c.id === sid) ?? (cases.length === 1 ? { ...cases[0], id: sid } : undefined);
    if (hit) tests.push(hit);
    else {
      const t: TestRecord = { id: sid, name: r.id, suite, adapter: adapter.name, status: r.exitCode === 0 ? "passed" : "failed", durationMs: 0, obtained: "per-test-rerun", message: r.timedOut ? "timed out when run alone" : `run alone: exit code ${r.exitCode}` };
      if (r.timedOut) t.statusDetail = "timeout";
      tests.push(t);
    }
  }
  const failed = tests.some((t) => t.status === "failed");
  if (failed) return { tests, state: "failed", cause, note: "suite report unusable; tests rerun one by one" };
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
    counts.origin_only++;
    out.push({ id: ot.id, name: ot.name, suite: ot.suite, adapter: ot.adapter, status: "other", statusDetail: "missing", durationMs: 0, obtained: ot.obtained, filePath: ot.filePath, parity: "origin_only", originStatus: ot.status, message: "present on the origin, absent on the target" });
  }
  return { tests: out, counts };
}
