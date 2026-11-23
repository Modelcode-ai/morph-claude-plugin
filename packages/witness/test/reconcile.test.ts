import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ADAPTERS } from "../src/adapters.ts";
import { buildCtrf } from "../src/ctrf.ts";
import type { ParsedFile, RawCase } from "../src/parsers/types.ts";
import { applyParity, dedupe, fromReruns, reconcile, type TestRecord, toRecord, worst } from "../src/reconcile.ts";

const A = ADAPTERS["junit-maven"];
const c = (name: string, status: RawCase["status"] = "passed", extra: Partial<RawCase> = {}): RawCase => ({ name, classname: "com.a.T", status, durationMs: 5, ...extra });
const file = (...cases: RawCase[]): ParsedFile => ({ file: "r.xml", cases });
const run = (files: ParsedFile[], exitCode: number | null, extra: Partial<Parameters<typeof reconcile>[0]> = {}) => reconcile({ suite: "s", adapter: A, exitCode, end: "exit", files, cwd: "/repo", ...extra });

describe("reconciliation rules", () => {
  test("failures + non-zero exit: trust the report", () => {
    const r = run([file(c("a"), c("b", "failed"))], 1);
    assert.equal(r.state, "failed");
    assert.equal(r.cause, undefined);
  });

  test("all passed + non-zero exit: suite error report_incomplete; tests keep status", () => {
    const r = run([file(c("a"), c("b"))], 2);
    assert.equal(r.state, "error");
    assert.equal(r.cause, "report_incomplete");
    assert.ok(r.tests.every((t) => t.status === "passed"));
  });

  test("all passed + exit 0: passed", () => {
    assert.equal(run([file(c("a"))], 0).state, "passed");
  });

  test("expected test absent: other/missing and suite error", () => {
    const r = run([file(c("a"))], 0, { expected: ["com.a.T#a", "junit-maven:com.a.T#gone"] });
    const gone = r.tests.find((t) => t.id === "junit-maven:com.a.T#gone")!;
    assert.equal(gone.status, "other");
    assert.equal(gone.statusDetail, "missing");
    assert.equal(r.state, "error");
  });

  test("unreadable report with known tests: rerun each alone", () => {
    const r = run([{ file: "r.xml", cases: [], error: "invalid XML" }], 1, { expected: ["com.a.T#a", "com.a.T#b"] });
    assert.deepEqual(r.rerun, ["com.a.T#a", "com.a.T#b"]);
    assert.equal(r.cause, "report_unreadable");
  });

  test("absent report, nothing known: one suite-level result", () => {
    const r = run([], 1);
    assert.equal(r.cause, "report_missing");
    assert.equal(r.tests.length, 1);
    assert.equal(r.tests[0].obtained, "suite-level");
    assert.equal(r.tests[0].status, "failed");
  });

  test("exit-code-only suites pass or fail on the exit code", () => {
    assert.equal(run([], 0, { exitCodeOnly: true }).state, "passed");
    assert.equal(run([], 3, { exitCodeOnly: true }).state, "failed");
  });

  test("stalled / timed out / service died keep partial results", () => {
    const s = run([file(c("a"))], null, { end: "stalled", expected: ["com.a.T#a", "com.a.T#b"] });
    assert.equal(s.state, "stalled");
    assert.equal(s.cause, "stalled");
    assert.equal(s.tests.find((t) => t.id.endsWith("#b"))?.statusDetail, "timeout");
    assert.equal(run([], null, { end: "timeout" }).cause, "suite_timeout");
    assert.equal(run([], null, { end: "service_died" }).cause, "service_died");
  });

  test("per-test reruns: report wins, else exit code; clean reruns after a failed suite are still an error", () => {
    const res = fromReruns([{ id: "com.a.T#a", exitCode: 0, files: [file(c("a"))] }, { id: "com.a.T#b", exitCode: 1, files: [] }], A, "s", "/repo", 1, "report_unreadable");
    assert.deepEqual(res.tests.map((t) => [t.id, t.status, t.obtained]), [["junit-maven:com.a.T#a", "passed", "per-test-rerun"], ["junit-maven:com.a.T#b", "failed", "per-test-rerun"]]);
    assert.equal(res.state, "failed");
    const clean = fromReruns([{ id: "com.a.T#a", exitCode: 0, files: [] }], A, "s", "/repo", 1, "report_unreadable");
    assert.equal(clean.state, "error");
  });

  test("duplicate ids: later wins, pass after fail is flaky", () => {
    const t = (status: TestRecord["status"]) => toRecord(c("a", status), A, "s", "/repo");
    const [d] = dedupe([t("failed"), t("passed")]);
    assert.equal(d.status, "passed");
    assert.equal(d.flaky, true);
    assert.equal(d.retries, 1);
  });

  test("outcome precedence", () => {
    assert.equal(worst("failed", "error"), "error");
    assert.equal(worst("stalled", "failed"), "stalled");
    assert.equal(worst("mistrial", "stalled"), "mistrial");
    assert.equal(worst("interrupted", "mistrial"), "interrupted");
  });
});

describe("parity and CTRF", () => {
  const rec = (id: string, status: TestRecord["status"]): TestRecord => ({ id, name: id, suite: "s", adapter: "pytest", status, durationMs: 1, obtained: "report" });

  test("same / differs / target_only / origin_only", () => {
    const { tests, counts } = applyParity([rec("pytest:a", "passed"), rec("pytest:b", "failed"), rec("pytest:new", "passed")], [rec("pytest:a", "passed"), rec("pytest:b", "passed"), rec("pytest:old", "passed")]);
    assert.deepEqual(counts, { same: 1, differs: 1, origin_only: 1, target_only: 1 });
    assert.equal(tests.find((t) => t.id === "pytest:b")?.originStatus, "passed");
    const old = tests.find((t) => t.id === "pytest:old")!;
    assert.equal(old.status, "other");
    assert.equal(old.parity, "origin_only");
  });

  test("CTRF shape with witness extras", () => {
    const doc = buildCtrf({ runId: "r-1", outcome: "failed", commit: "abc", branch: "main", dirty: false, startedAt: 1, finishedAt: 2, adapters: ["pytest"], against: { ref: "main", outcome: "passed" } }, [rec("pytest:a", "passed"), { ...rec("pytest:b", "other"), statusDetail: "missing", parity: "differs", originStatus: "passed" }]);
    assert.equal(doc.reportFormat, "CTRF");
    assert.deepEqual({ ...doc.results.summary }, { tests: 2, passed: 1, failed: 0, skipped: 0, pending: 0, other: 1, start: 1, stop: 2 });
    const w = doc.results.extra.witness as Record<string, unknown>;
    assert.equal(w.schema, "witness.run/v1");
    assert.equal(w.run_id, "r-1");
    assert.deepEqual(w.against, { ref: "main", outcome: "passed" });
    assert.ok(["local", "ci", "morph"].includes(w.source as string));
    const b = doc.results.tests[1] as { extra: { witness: Record<string, unknown> } };
    assert.deepEqual(b.extra.witness, { id: "pytest:b", suite: "s", adapter: "pytest", obtained: "report", status_detail: "missing", parity: "differs", origin_status: "passed" });
  });
});
