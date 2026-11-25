import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { renderHtml } from "../src/report/html.ts";
import { writeReport } from "../src/report/index.ts";
import { renderMd } from "../src/report/md.ts";
import { buildModel } from "../src/report/model.ts";
import { latest, service, tmpRepo, witness } from "./helpers.ts";

const RUN = `\n[run]\nstall_timeout = "5s"\nheartbeat = "1s"\nkill_grace = "1s"\n`;

type T = { id: string; suite: string; status: string; parity?: string; origin?: string; message?: string };
const PLAN = `version: 1
source: "request in the PR"
items:
  - {id: P1, behavior: "Filter by name", expect: "only matching items", kind: new, tests: ["pytest:tests/test_api.py::test_filter"]}
  - {id: P2, behavior: "Paging still works", expect: "10 per page", kind: parity, tests: ["pytest:tests/test_api.py::test_paging"]}
`;

function runDir(o: { outcome: string; tests: T[]; suites?: object[]; against?: object; plan?: string; context?: object; diagnosis?: object; artifacts?: object[] }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-report-"));
  const sum = (s: string) => o.tests.filter((t) => t.status === s).length;
  const suites = o.suites ?? [
    { name: "api", state: o.outcome === "passed" ? "passed" : "failed", passed: sum("passed"), failed: sum("failed"), skipped: sum("skipped"), error: 0, missing: 0, kind: "api", services: [] },
  ];
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ run_id: "r-1", phase: "finished", outcome: o.outcome, started_at: "2026-11-23T10:00:00.000Z", finished_at: "2026-11-23T10:01:05.000Z", commit: "abcdef1234567", branch: "feature", dirty: false, suites, last_event: "", pid: 1, summary: { tests: o.tests.length, passed: sum("passed"), failed: sum("failed"), skipped: sum("skipped"), pending: 0, other: 0 }, against: o.against, diagnosis: o.diagnosis }));
  fs.writeFileSync(path.join(dir, "results.ctrf.json"), JSON.stringify({ results: { tests: o.tests.map((t) => ({ name: t.id, status: t.status, duration: 5, message: t.message, extra: { witness: { id: t.id, suite: t.suite, obtained: "report", parity: t.parity, origin_status: t.origin } } })) } }));
  fs.writeFileSync(path.join(dir, "events.jsonl"), ["run_started", "suite_started", "suite_finished", "run_finished"].map((type, i) => JSON.stringify({ t: new Date(Date.parse("2026-11-23T10:00:00Z") + i * 1000).toISOString(), type, suite: "api", state: "passed", ms: 1000 })).join("\n") + "\n");
  if (o.plan) fs.writeFileSync(path.join(dir, "plan.yaml"), o.plan);
  fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(o.context ?? { selected: false }));
  fs.writeFileSync(path.join(dir, "artifacts.json"), JSON.stringify(o.artifacts ?? []));
  return dir;
}

const passing: T[] = [
  { id: "pytest:tests/test_api.py::test_filter", suite: "api", status: "passed", parity: "target_only" },
  { id: "pytest:tests/test_api.py::test_paging", suite: "api", status: "passed", parity: "same", origin: "passed" },
  { id: "pytest:tests/test_api.py::test_other", suite: "api", status: "skipped", parity: "same", origin: "skipped" },
];
const AGAINST = { ref: "main", outcome: "passed", parity: { same: 2, differs: 0, origin_only: 0, target_only: 1 } };
const CHANGE = { selected: false, change: { base: "0123456789ab", baseLabel: "main", commits: [{ sha: "abc1234", subject: "Filter catalog items by name", body: "Adds ?name=." }], files: [{ path: "src/api.py", added: 10, deleted: 2, role: "app" }, { path: "tests/test_api.py", added: 20, deleted: 0, role: "test" }] } };

describe("run report model", () => {
  test("a passing, compared run: plan items proven, the base's new tests tied to items, no blockers first", () => {
    const m = buildModel(runDir({ outcome: "passed", tests: passing, plan: PLAN, against: AGAINST, context: CHANGE }));
    assert.equal(m.headline, "Filter catalog items by name");
    assert.deepEqual(m.plan?.items.map((i) => [i.id, i.state, i.base]), [["P1", "proven", "new"], ["P2", "proven", "same"]]);
    assert.deepEqual(m.against?.newTests, [{ id: "pytest:tests/test_api.py::test_filter", item: "P1" }]);
    assert.deepEqual(m.signals.map((s) => s.state), ["y", "y", "n", "n", "n"]);
    assert.equal(m.steps[0].title, "No blockers to merging");
    assert.ok(m.steps.some((s) => /Decide on 1 skipped test/.test(s.title)));
    assert.ok(!m.steps.some((s) => s.tone === "fix"));
  });

  test("a failing plan test leads the next steps, marks its item failed, and drops 'no blockers'", () => {
    const tests = passing.map((t) => (t.id.endsWith("test_filter") ? { ...t, status: "failed", message: "expected 1 item, got 3" } : t));
    const m = buildModel(runDir({ outcome: "failed", tests, plan: PLAN, against: AGAINST, context: CHANGE }));
    assert.equal(m.plan?.items[0].state, "failed");
    assert.equal(m.steps[0].tone, "fix");
    assert.match(m.steps[0].title, /Fix 1 failing test/);
    assert.match(m.steps[0].prompt!, /test_filter/);
    assert.ok(!m.steps.some((s) => s.title === "No blockers to merging"));
    const html = renderHtml(m);
    assert.match(html, /class="hero tone-bad/);
    assert.match(html, /1 of 2 planned behaviors fail/);
    assert.match(renderMd(m), /1\. \*\*Fix: Fix 1 failing test\.\*\*/);
  });

  test("a regression against the base is its own step; a mistrial's diagnosis comes first", () => {
    const tests = passing.map((t) => (t.id.endsWith("test_paging") ? { ...t, status: "failed", parity: "differs" } : t));
    const m = buildModel(runDir({ outcome: "failed", tests, plan: PLAN, against: { ...AGAINST, parity: { same: 1, differs: 1, origin_only: 0, target_only: 1 } }, context: CHANGE }));
    assert.ok(m.steps.some((s) => /1 test that pass on the base fail here/.test(s.title)));
    assert.equal(m.signals[1].state, "n");
    const mis = buildModel(runDir({ outcome: "mistrial", tests: [], diagnosis: { stage: "boot", cause: "ready_timeout", service: "web", evidence: "answered 404 for 30s", retryable: false, try: [] } }));
    assert.equal(mis.steps[0].title, "Fix the setup: ready timeout in web");
    assert.match(renderHtml(mis), /class="hero tone-warn/);
  });

  test("no plan and no comparison: the report says what it can't tell and how to fix that", () => {
    const m = buildModel(runDir({ outcome: "passed", tests: passing.map((t) => ({ ...t, parity: undefined })), context: CHANGE }));
    assert.equal(m.plan, undefined);
    assert.ok(m.steps.some((s) => s.title === "Write a test plan for this change"));
    assert.ok(m.steps.some((s) => s.title === "Compare with main" && /--against main/.test(s.prompt!)));
    assert.match(renderHtml(m), /no test plan/);
  });

  test("running-app suites: a changed behavior tested only in-process gets a step; recorded evidence counts", () => {
    const suites = [
      { name: "api", state: "passed", passed: 2, failed: 0, skipped: 0, error: 0, missing: 0, kind: "api", services: [] },
      { name: "e2e", state: "passed", passed: 1, failed: 0, skipped: 0, error: 0, missing: 0, kind: "ui", services: ["web"] },
    ];
    const tests: T[] = [...passing.slice(0, 2), { id: "playwright:e2e/home.spec.ts > loads", suite: "e2e", status: "passed" }];
    const m = buildModel(runDir({ outcome: "passed", tests, suites, plan: PLAN, context: CHANGE, artifacts: [{ file: "artifacts/x.png", test_id: tests[0].id, artifact_type: "screenshot" }] }));
    assert.ok(m.steps.some((s) => s.title === "Test P1 on the running app" && /e2e suite/.test(s.prompt!)));
    assert.equal(m.signals.find((s) => s.key === "running")?.state, "p");
    assert.equal(m.signals.find((s) => s.key === "evidence")?.state, "p");
    assert.match(renderHtml(m), /Running app, started by Witness/);
  });

  test("ui tests without a screenshot or video: a warning in both reports, a step, and a weaker evidence signal", () => {
    const suites = [{ name: "e2e", state: "passed", passed: 3, failed: 0, skipped: 0, error: 0, missing: 0, kind: "ui", services: ["web"] }];
    const tests: T[] = ["a", "b", "c"].map((x) => ({ id: `playwright:home.spec.ts > ${x}`, suite: "e2e", status: "passed" }));
    const shots = [
      { file: "artifacts/a/test-finished-1.png", test_id: tests[0].id, artifact_type: "screenshot" },
      { file: "artifacts/a/video.webm", test_id: tests[0].id, artifact_type: "video" },
      { file: "artifacts/b/trace.zip", test_id: tests[1].id, artifact_type: "trace" },
      { file: "against/artifacts/c/x.png", test_id: tests[2].id, artifact_type: "screenshot" },
    ];
    const m = buildModel(runDir({ outcome: "passed", tests, suites, artifacts: shots }));
    assert.deepEqual(m.visuals, [{ suite: "e2e", kind: "ui", passed: 3, bare: [tests[1].id, tests[2].id] }]);
    const sig = m.signals.find((s) => s.key === "evidence")!;
    assert.equal(sig.state, "p");
    assert.match(sig.detail, /1 of 3 passing UI tests have a screenshot or video/);
    const step = m.steps.find((s) => s.title === "Record screenshots and video for 2 tests")!;
    assert.equal(step.detail, "2 of 3 passing tests in e2e (ui) left no screenshot or video.");
    assert.match(step.prompt!, /WITNESS_EVIDENCE is set/);
    assert.match(renderMd(m), /- Warning: 2 of 3 passing tests in e2e \(ui\) left no screenshot or video: `playwright:home.spec.ts > b`/);
    const html = renderHtml(m);
    assert.match(html, /Screenshots and video of 1 test<\/summary>/);
    assert.match(html, /2 of 3 passing tests in e2e \(ui\) left no screenshot or video\./);
    assert.match(html, /<video class="thumb" src="artifacts\/a\/video.webm"/);

    const all = buildModel(runDir({ outcome: "passed", tests, suites, artifacts: tests.map((t) => ({ file: `artifacts/${t.id.slice(-1)}/v.webm`, test_id: t.id, artifact_type: "video" })) }));
    assert.equal(all.visuals[0].bare.length, 0);
    assert.ok(!all.steps.some((s) => /Record screenshots/.test(s.title)));
    assert.match(renderMd(all), /- e2e \(ui\): every passing test left a screenshot or video \(3\)/);
    const none = buildModel(runDir({ outcome: "passed", tests, suites }));
    assert.equal(none.signals.find((s) => s.key === "evidence")!.state, "n");
    assert.equal(none.steps.find((s) => /Record screenshots/.test(s.title))!.detail, "All 3 passing tests in e2e (ui) left no screenshot or video.");
    const api = buildModel(runDir({ outcome: "passed", tests: passing }));
    assert.deepEqual(api.visuals, []);
  });

  test("names and messages are escaped in the page, including a closing script tag", () => {
    const tests: T[] = [{ id: 'pytest:t.py::test_<img src=x onerror=alert(1)>"', suite: "api", status: "failed", message: "</script><script>alert(1)</script>" }];
    const html = renderHtml(buildModel(runDir({ outcome: "failed", tests })));
    assert.ok(!html.includes("<img src=x"));
    assert.ok(!html.includes("</script><script>alert(1)"));
    assert.equal(html.match(/<script>/g)?.length, 1);
  });
});

describe("run report on disk", () => {
  test("every run writes report.html, report.md, a verifiable SHA256SUMS and the runs index", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}\n[[suite]]\nkind = "api"\nname = "fake"\nservice = "api"\ncmd = "EXTRA_TEST=$(cat new.txt 2>/dev/null) node $APPS/suite.mjs pass"\n${RUN}`, { git: true });
    const g = (...a: string[]) => spawnSync("git", a, { cwd: dir });
    fs.writeFileSync(path.join(dir, "new.txt"), "filters");
    fs.writeFileSync(path.join(dir, ".witness", "plan.yaml"), `version: 1\nsource: "the request"\nitems:\n  - {id: P1, behavior: "Filters", expect: "it works", kind: new, tests: ["generic:Api#filters"]}\n`);
    g("add", "-A");
    g("commit", "-qm", "Add filtering");
    const r = await witness(dir, ["run", "--against", "HEAD~1"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /report: +.*report\.html/);
    const run = latest(dir);
    for (const f of ["report.html", "report.md", "SHA256SUMS", "plan.yaml", "context.json"]) assert.ok(fs.existsSync(path.join(run, f)), f);
    for (const line of fs.readFileSync(path.join(run, "SHA256SUMS"), "utf8").trim().split("\n")) {
      const [h, f] = line.split(/ {2}/);
      assert.equal(createHash("sha256").update(fs.readFileSync(path.join(run, f))).digest("hex"), h, f);
    }
    const md = fs.readFileSync(path.join(run, "report.md"), "utf8");
    assert.match(md, /> Add filtering/);
    assert.match(md, /\*\*Plan:\*\* 1 of 1 behaviors pass/);
    assert.match(md, /`generic:Api#filters` \(P1\)/);
    assert.match(fs.readFileSync(path.join(dir, ".witness", "runs", "index.html"), "utf8"), /report\.html/);
    const again = await witness(dir, ["report", "--format", "html"]);
    assert.equal(fs.realpathSync(again.stdout.trim()), fs.realpathSync(path.join(run, "report.html")));
    assert.match((await witness(dir, ["report"])).stdout, /## Recommended next steps/);
  });

  test("writeReport works on a run folder from before reports existed", () => {
    const dir = runDir({ outcome: "passed", tests: passing });
    fs.rmSync(path.join(dir, "context.json"));
    const r = writeReport(dir);
    assert.match(fs.readFileSync(r.md, "utf8"), /No test plan was found/);
  });
});
