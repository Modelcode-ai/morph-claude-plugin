import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ADAPTERS } from "../src/adapters.ts";
import { buildCtrf } from "../src/ctrf.ts";
import type { ParsedFile, RawCase } from "../src/parsers/types.ts";
import { applyParity, dedupe, fromReruns, reconcile, summarize, type TestRecord, toRecord, worst } from "../src/reconcile.ts";
import { verdictSummary } from "../src/run.ts";

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

  test("a selected parametrized test is present through its cases", () => {
    const r = run([file(c("p(x: 1)"), c("p(x: 2)"), c('q ("a")'), c("r[1]"))], 0, { expected: ["com.a.T#p", "com.a.T#q", "com.a.T#r"] });
    assert.equal(r.state, "passed");
    assert.ok(!r.tests.some((t) => t.statusDetail === "missing"));
    assert.equal(run([file(c("pp(x: 1)"))], 0, { expected: ["com.a.T#p"] }).state, "error");
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
    const hung = run([], null, { end: "stalled" });
    assert.deepEqual([summarize("s", hung.state, hung.tests).failed, summarize("s", hung.state, hung.tests).error], [0, 1], "a hung suite is an error row, not a failed test");
    assert.equal(run([], null, { end: "service_died" }).cause, "service_died");
  });

  test("per-test reruns: report wins, else exit code; clean reruns after a failed suite are still an error", () => {
    const res = fromReruns([{ id: "com.a.T#a", exitCode: 0, files: [file(c("a"))] }, { id: "com.a.T#b", exitCode: 1, files: [] }], A, "s", "/repo", 1, "report_unreadable");
    assert.deepEqual(res.tests.map((t) => [t.id, t.status, t.obtained]), [["junit-maven:com.a.T#a", "passed", "per-test-rerun"], ["junit-maven:com.a.T#b", "failed", "per-test-rerun"]]);
    assert.equal(res.state, "failed");
    const clean = fromReruns([{ id: "com.a.T#a", exitCode: 0, files: [] }], A, "s", "/repo", 1, "report_unreadable");
    assert.equal(clean.state, "error");
  });

  test("a failure raised by fixture setup is an error, not a test failure", () => {
    const r = toRecord(c("a", "failed", { message: "Class fixture type 'BrowserFixture' threw in InitializeAsync" }), A, "s", "/repo");
    assert.equal(r.statusDetail, "error");
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

describe("eShopOnWeb eval fixes: reconciliation", () => {
  test("a rerun that exits 0 without the test in its report is missing, never passed", () => {
    const res = fromReruns([{ id: "com.a.T#a", exitCode: 0, files: [file()] }], A, "s", "/repo", 0, "report_unreadable");
    assert.equal(res.tests[0].status, "other");
    assert.equal(res.tests[0].statusDetail, "missing");
    assert.equal(res.state, "error");
  });

  test("a rerun of a parametrized test takes its cases' worst status", () => {
    const res = fromReruns([{ id: "com.a.T#p", exitCode: 1, files: [file(c("p(x: 1)"), c("p(x: 2)", "failed"), c("other"))] }], A, "s", "/repo", 1, "report_unreadable");
    assert.equal(res.tests[0].id, "junit-maven:com.a.T#p");
    assert.equal(res.tests[0].status, "failed");
  });

  test("all skipped is an error; only fixture errors are setup_failed; real failures stay failed", () => {
    const skipped = run([file(c("a", "skipped"), c("b", "skipped"))], 0);
    assert.equal(skipped.state, "error");
    assert.equal(skipped.cause, "report_incomplete");
    const fx = { message: "Class fixture type 'X' threw in InitializeAsync" };
    const setup = run([file(c("a", "failed", fx), c("b", "failed", fx))], 1);
    assert.equal(setup.state, "error");
    assert.equal(setup.cause, "setup_failed");
    assert.match(setup.evidence!, /threw in InitializeAsync/);
    assert.equal(run([file(c("a", "failed", fx), c("b", "failed"))], 1).state, "failed");
  });

  test("origin suite-level rows are dropped from parity", () => {
    const rec = (id: string, status: TestRecord["status"], obtained: TestRecord["obtained"] = "report"): TestRecord => ({ id, name: id, suite: "s", adapter: "dotnet", status, durationMs: 1, obtained });
    const { tests, counts } = applyParity([rec("dotnet:A#a", "passed")], [rec("dotnet:(suite unit)", "failed", "suite-level")]);
    assert.equal(tests.length, 1);
    assert.equal(counts.origin_only, 0);
    assert.equal(counts.target_only, 1);
  });
});

test("verdict counts errors, missing and origin-only tests apart from failures", () => {
  const st = { suites: [{ name: "e2e", state: "error", passed: 1, failed: 0, skipped: 1, error: 2, missing: 1 }], summary: { tests: 5, passed: 1, failed: 2, skipped: 1, pending: 0, other: 1 }, against: { ref: "main", outcome: "passed", parity: { same: 1, differs: 0, origin_only: 1, target_only: 0 } } } as never;
  assert.equal(verdictSummary(st), "1 passed, 0 failed · 2 error · 1 missing · 1 skipped · 1 only on origin · 1 suite(s) · against main: origin passed, 0 differ");
});
