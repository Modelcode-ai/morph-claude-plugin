import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parseConfig } from "../src/config.ts";
import { idMatches, type Listing, matchTests, parsePlan } from "../src/plan.ts";
import { splitSelect, UsageError } from "../src/run.ts";
import { tmpRepo, witness } from "./helpers.ts";

const CONTRACT_EXAMPLE = `version: 1
source: "PR #123 description"
items:
  - id: P1
    behavior: "PATCH /invoices/{id} updates the due date"
    expect: "200, then GET returns the new date"
    kind: new
    tests: ["pytest:tests/e2e/test_invoices.py::test_update_due_date"]
`;

const cfg = (suites: string) => parseConfig({ version: 1, suite: JSON.parse(suites).map((s: object) => ({ kind: "api", ...s })) }, path.join(os.tmpdir(), "x", ".witness", "witness.toml"));

test("plan: the contract example is valid", () => {
  const { plan, problems } = parsePlan(CONTRACT_EXAMPLE);
  assert.deepEqual(problems, []);
  assert.equal(plan?.items[0].id, "P1");
  assert.equal(plan?.items[0].kind, "new");
  assert.equal(plan?.items[0].line, 4);
});

test("plan: schema errors name the path and the line", () => {
  const text = `version: 2
source: ""
itmes: []
items:
  - id: P1
    behavior: b
    expect: e
    kind: added
    tests: ["pytst:a::b", "pytest:"]
  - id: P1
    behaviour: b
    expect: e
    kind: parity
    tests: ["pytest:a::b", "pytest:a::b"]
`;
  const { plan, problems } = parsePlan(text);
  assert.equal(plan, undefined);
  const by = (w: string) => problems.find((p) => p.where === w);
  assert.match(by("version")!.message, /must be 1/);
  assert.match(by("source")!.message, /required/);
  assert.match(by("itmes")!.message, /did you mean "items"/);
  assert.match(by("items[0].kind")!.message, /new, changed, parity/);
  assert.equal(by("items[0].kind")!.line, 8);
  assert.match(by("items[0].tests[0]")!.message, /unknown adapter "pytst" \(did you mean "pytest"\?\)/);
  assert.match(by("items[0].tests[1]")!.message, /no test id/);
  assert.match(by("items[1].id")!.message, /already used by items\[0\]/);
  assert.match(by("items[1].behaviour")!.message, /did you mean "behavior"/);
  assert.match(by("items[1].tests")!.message, /listed twice/);
});

test("plan: an item without tests is an error, or a warning with --draft", () => {
  const text = `version: 1\nsource: issue\nitems:\n  - {id: P1, behavior: b, expect: e, kind: changed}\n`;
  assert.equal(parsePlan(text).problems[0].level, "error");
  const d = parsePlan(text, { draft: true });
  assert.equal(d.problems[0].level, "warning");
  assert.ok(d.plan);
});

test("plan: YAML syntax errors and non-mappings are reported", () => {
  assert.equal(parsePlan("version: 1\nitems: [\n").problems[0].where, "yaml");
  assert.match(parsePlan("- a\n- b\n").problems[0].message, /expected a mapping/);
  assert.equal(parsePlan("version: 1\nversion: 1\n").problems[0].where, "yaml");
});

test("plan: listed ids match exactly or as parametrized cases", () => {
  assert.ok(idMatches("tests/a.py::test_x", "tests/a.py::test_x"));
  assert.ok(idMatches("tests/a.py::test_x[1-2]", "tests/a.py::test_x"));
  assert.ok(idMatches("Ns.C#M(a: 1)", "Ns.C#M"));
  assert.ok(idMatches('Ns.C#M ("a=1")', "Ns.C#M"));
  assert.ok(!idMatches("tests/a.py::test_xy", "tests/a.py::test_x"));
});

test("plan: tests are found, missing (with a hint) or unverified", () => {
  const plan = parsePlan(`version: 1
source: s
items:
  - id: P1
    behavior: b
    expect: e
    kind: new
    tests: ["pytest:tests/a.py::test_x", "pytest:tests/b.py::test_y", "go:pkg#TestZ", "jest:a.test.ts > t"]
`).plan!;
  const c = cfg(`[{"name":"api","adapter":"pytest","cmd":"pytest"},{"name":"unit","adapter":"go","cmd":"go test ./..."}]`);
  const listings: Listing[] = [
    { suite: "api", adapter: "pytest", ids: ["tests/a.py::test_x[1]", "tests/c.py::test_y"] },
    { suite: "unit", adapter: "go", error: "listing failed (exit 1)" },
  ];
  const { checks, problems } = matchTests(plan, c, listings, false);
  assert.deepEqual(checks.map((x) => x.state), ["found", "missing", "unverified", "missing"]);
  assert.deepEqual(checks[0].suites, ["api"]);
  const miss = problems.find((p) => p.where.includes("test_y"))!;
  assert.equal(miss.level, "error");
  assert.match(miss.message, /did you mean "pytest:tests\/c.py::test_y"/);
  assert.equal(problems.find((p) => p.where.includes("TestZ"))!.level, "warning");
  assert.match(problems.find((p) => p.where.includes("jest"))!.message, /no suite uses the jest adapter/);
  const draft = matchTests(plan, c, listings, true).problems.find((p) => p.where.includes("test_y"))!;
  assert.equal(draft.level, "warning");
  assert.match(draft.message, /not written yet/);
});

const TOML = `version = 1
[[suite]]
kind = "api"
name = "api"
adapter = "pytest"
cmd = "node $APPS/lister.mjs"
service = []
`;

function repoWithPlan(plan: string) {
  const dir = tmpRepo(TOML);
  fs.writeFileSync(path.join(dir, ".witness", "plan.yaml"), plan);
  return dir;
}

test("plan: dotnet suites that list bare method names (MSTest) match on the method", () => {
  const plan = parsePlan(`version: 1\nsource: s\nitems:\n  - {id: P1, behavior: b, expect: e, kind: parity, tests: ["dotnet:Api.ListTests#ReturnsFirst10", "dotnet:Api.ListTests#Missing"]}\n`).plan!;
  const c = cfg(`[{"name":"publicapi","adapter":"dotnet","cmd":"dotnet test"}]`);
  const { checks, problems } = matchTests(plan, c, [{ suite: "publicapi", adapter: "dotnet", ids: ["ReturnsFirst10", 'ReturnsBadRequest ("x")'] }], false);
  assert.deepEqual(checks.map((x) => x.state), ["found", "missing"]);
  assert.match(checks[0].detail!, /method name only/);
  assert.doesNotMatch(problems[0].message, /did you mean/);
});

test("plan check CLI: exit 0 when every test is listed, 1 when one is missing", async () => {
  const dir = repoWithPlan(CONTRACT_EXAMPLE);
  const ok = await witness(dir, ["plan", "check", "--json"], { env: { LISTER_IDS: "tests/e2e/test_invoices.py::test_update_due_date,tests/e2e/test_invoices.py::test_other" } });
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.json?.tests[0].state, "found");
  assert.match(ok.stderr, /PLAN ok · 1 item\(s\), 1 test ref\(s\): 1 found/);
  const missing = await witness(dir, ["plan", "check"], { env: { LISTER_IDS: "tests/e2e/test_invoices.py::test_other" } });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /not in the test listing of api \(1 tests\)/);
  const draft = await witness(dir, ["plan", "check", "--draft"], { env: { LISTER_IDS: "tests/e2e/test_invoices.py::test_other" } });
  assert.equal(draft.code, 0, draft.stderr);
  assert.match(draft.stderr, /not written yet/);
  const failing = await witness(dir, ["plan", "check"], { env: { LISTER_FAIL: "1" } });
  assert.equal(failing.code, 0);
  assert.match(failing.stderr, /can't confirm it exists \(api: listing failed \(exit 2\)\)/);
  const skipped = await witness(dir, ["plan", "check", "--no-list"]);
  assert.equal(skipped.code, 0);
  assert.match(skipped.stderr, /listing skipped/);
});

test("plan check CLI: invalid plan exits 1, absent file 2, no config only checks the schema", async () => {
  const dir = repoWithPlan("version: 1\nsource: s\nitems: []\n");
  const bad = await witness(dir, ["plan", "check"]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /plan.yaml:3 items: required/);
  const absent = await witness(dir, ["plan", "check", "nope.yaml"]);
  assert.equal(absent.code, 2);
  const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-plan-")));
  fs.writeFileSync(path.join(bare, "plan.yaml"), CONTRACT_EXAMPLE);
  const noCfg = await witness(bare, ["plan", "check", "plan.yaml"]);
  assert.equal(noCfg.code, 0, noCfg.stderr);
  assert.match(noCfg.stderr, /no .witness\/witness.toml found/);
  const usage = await witness(dir, ["plan", "lint"]);
  assert.equal(usage.code, 64);
});

test("--select: suite-qualified ids pick the suite when several share an adapter", () => {
  const c = cfg(`[{"name":"unit","adapter":"dotnet","cmd":"dotnet test a"},{"name":"api","adapter":"dotnet","cmd":"dotnet test b"},{"name":"py","adapter":"pytest","cmd":"pytest"}]`);
  assert.throws(() => splitSelect(c.suites, ["dotnet:A#b"]), (e: Error) => e instanceof UsageError && /write it as <suite>:dotnet:A#b/.test(e.message));
  const m = splitSelect(c.suites, ["unit:dotnet:A#b", "api:dotnet:C#d", "pytest:t.py::x", "api:dotnet:C#e"])!;
  assert.deepEqual([...m.entries()], [["unit", ["A#b"]], ["api", ["C#d", "C#e"]], ["py", ["t.py::x"]]]);
});
