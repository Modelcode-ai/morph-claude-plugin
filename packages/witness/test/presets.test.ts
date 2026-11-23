import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { ADAPTERS, addArgs, fillSelect, presetEnv, selectCommand } from "../src/adapters.ts";
import { parseConfig, type Suite } from "../src/config.ts";
import { capabilities, listCommand, listSuiteTests, writeListCache } from "../src/listing.ts";
import { parseReportText } from "../src/parsers/index.ts";
import { httpProbe } from "../src/proc.ts";
import { fromReruns, reconcile } from "../src/reconcile.ts";
import { canSelect, missingPlugin, suiteCommand } from "../src/suite.ts";
import { APPS, ctrf, latest, readJson, tmpRepo, witness } from "./helpers.ts";

const suite = (adapter: Suite["adapter"], cmd: string, extra: Partial<Suite> = {}): Suite => ({ name: "s", kind: "api", adapter, cmd, cwd: ".", timeoutMs: 60_000, env: {}, ...extra });
const cfg = (toml: string) => parseConfig(parse(toml) as Record<string, unknown>, "/repo/.witness/witness.toml");

describe("${WITNESS_SELECT}: runner args go where the placeholder is", () => {
  test("report args and the per-test timeout land at the placeholder; the default fills it when running everything", () => {
    const s = suite("pytest", "cd app && .venv/bin/pytest ${WITNESS_SELECT:-tests/e2e} | tee out.txt", { perTestTimeoutMs: 5000 });
    assert.equal(suiteCommand(s, ADAPTERS.pytest, {}, "/r"), "cd app && .venv/bin/pytest --junitxml=/r/junit.xml -o junit_family=xunit1 --timeout=5 tests/e2e | tee out.txt");
    assert.equal(suiteCommand(s, ADAPTERS.pytest, {}, "/r", ["tests/e2e/test_a.py::test_b"]), "cd app && .venv/bin/pytest --junitxml=/r/junit.xml -o junit_family=xunit1 --timeout=5 tests/e2e/test_a.py::test_b | tee out.txt");
    assert.equal(suiteCommand(suite("jest", "true && npx jest ${WITNESS_SELECT} && echo done"), ADAPTERS.jest, {}, "/r"), "true && npx jest --json --outputFile=/r/jest.json  && echo done");
  });

  test("selection without a placeholder still rewrites simple commands, and refuses compound ones", () => {
    assert.equal(selectCommand(ADAPTERS.pytest, "cd x && pytest ${WITNESS_SELECT}", ["a.py::t"]), "cd x && pytest a.py::t");
    assert.equal(selectCommand(ADAPTERS.pytest, "cd x && pytest", ["a"]), null);
    assert.equal(selectCommand(ADAPTERS.generic, "./t.sh ${WITNESS_SELECT}", ["a"]), null);
    assert.throws(() => suiteCommand(suite("pytest", "cd x && pytest"), ADAPTERS.pytest, {}, "/r", ["a"]), /\$\{WITNESS_SELECT\}/);
    assert.equal(canSelect(suite("pytest", "cd x && pytest"), ADAPTERS.pytest), false);
    assert.equal(canSelect(suite("pytest", "cd x && pytest ${WITNESS_SELECT}"), ADAPTERS.pytest), true);
  });

  test("addArgs / fillSelect", () => {
    assert.equal(addArgs("a ${WITNESS_SELECT} b", "-x"), "a -x ${WITNESS_SELECT} b");
    assert.equal(fillSelect("a ${WITNESS_SELECT:-t/$x} b"), "a t/$x b");
    assert.equal(fillSelect("a ${WITNESS_SELECT}", "'$1'"), "a '$1'");
  });

  test("per_test_timeout_arg fills {s} and {ms} for adapters without a flag", () => {
    assert.match(suiteCommand(suite("go", "go test ./...", { perTestTimeoutMs: 3000, perTestTimeoutArg: "-timeout {s}s" }), ADAPTERS.go, {}, "/r"), /-json -timeout 3s$/);
    assert.match(suiteCommand(suite("junit-gradle", "gradle test", { perTestTimeoutMs: 3000, perTestTimeoutArg: "-Pt={ms}" }), ADAPTERS["junit-gradle"], {}, "/r"), /-Pt=3000$/);
  });
});

describe("config: list and per_test_timeout_arg", () => {
  const base = (extra: string) => `version = 1\n[[suite]]\nname = "s"\nkind = "api"\nadapter = "junit-maven"\ncmd = "mvn test"\n${extra}`;
  test("list as a command (lines) or a table; format checked against the adapter", () => {
    assert.deepEqual(cfg(base('list = "./list-tests.sh"')).suites[0].list, { cmd: "./list-tests.sh", format: "lines" });
    assert.deepEqual(cfg(base('list = { cmd = "mvn surefire:test -DdryRun", format = "junit", report = "target/*.xml" }')).suites[0].list, { cmd: "mvn surefire:test -DdryRun", format: "report", report: "target/*.xml" });
    assert.throws(() => cfg(base('list = { cmd = "x", format = "adapter" }')), /junit-maven adapter has no list parser/);
    assert.throws(() => cfg(base('list = { cmd = "x", formt = "lines" }')), /suite\.s\.list\.formt: unknown key \(did you mean "format"\?\)/);
    assert.throws(() => cfg(base('per_test_timeout_arg = "--timeout"')), /needs \{s\} or \{ms\}/);
  });
});

describe("listing: template, native, last report", () => {
  test("native listings are built from the suite command; report-format listings ask for a report", () => {
    assert.equal(listCommand(suite("pytest", "cd a && pytest ${WITNESS_SELECT:-t}"), ADAPTERS.pytest, {}, "/l", ".")!.cmd, "cd a && pytest --collect-only -q t");
    assert.match(listCommand(suite("jest", "npx jest"), ADAPTERS.jest, {}, "/l", ".")!.cmd, /^npx jest --testNamePattern='\^witness-list-only.*' --json --outputFile=\/l\/jest\.json$/);
    assert.match(listCommand(suite("vitest", "npx vitest run"), ADAPTERS.vitest, {}, "/l", ".")!.cmd, /^npx vitest run -t '\^witness-list-only.*' --reporter=default --reporter=junit --outputFile\.junit=\/l\/junit\.xml$/);
    assert.equal(listCommand(suite("junit-maven", "mvn test"), ADAPTERS["junit-maven"], {}, "/l", "."), null);
  });

  test("a lines template, then the last report as the fallback (also after the command changes), none after the folder changes", async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-list-")));
    const ctx = { root, cwd: root, vars: {}, env: { PATH: process.env.PATH ?? "" }, log: path.join(root, "list.log"), scratch: path.join(root, "scratch") };
    const tpl = await listSuiteTests(suite("junit-maven", "mvn test", { list: { cmd: "printf 'junit-maven:a.B#c\\n# note\\na.B#d\\n'", format: "lines" } }), ctx);
    assert.deepEqual([tpl.ids, tpl.source], [["a.B#c", "a.B#d"], "template"]);
    const s = suite("junit-maven", "mvn test");
    assert.equal((await listSuiteTests(s, ctx)).source, "none");
    writeListCache(root, s, "r-1", "abc", ["a.B#c", "a.B#e"]);
    const old = await listSuiteTests(s, ctx);
    assert.deepEqual(old.ids, ["a.B#c", "a.B#e"]);
    assert.match(old.detail, /^list: last report r-1 \(.* ago, 2 tests\)$/);
    assert.equal((await listSuiteTests({ ...s, cmd: "./wrapper mvn verify" }, ctx)).source, "last-report");
    const moved = await listSuiteTests({ ...s, cwd: "sub" }, ctx);
    assert.equal(moved.source, "none");
    assert.match(moved.detail, /different adapter or folder/);
  });

  test("dotnet listings of bare method names get class names from the last report", async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-list-")));
    const s = suite("dotnet", "printf 'The following Tests are available:\\n    ListsItems\\n    Other\\n' #");
    writeListCache(root, s, "r-2", "abc", ["Kit.ItemsTests#ListsItems"]);
    const l = await listSuiteTests(s, { root, cwd: root, vars: {}, env: { PATH: process.env.PATH ?? "" }, log: path.join(root, "l.log"), scratch: path.join(root, "x") });
    assert.deepEqual(l.ids, ["Kit.ItemsTests#ListsItems", "Other"]);
    assert.match(l.detail, /class names from the last report r-2/);
  });

  test("capabilities name what is missing and what it costs", () => {
    const c = capabilities(suite("junit-gradle", "cd x && gradle test", { perTestTimeoutMs: 5000 }), "/nonexistent", "/nonexistent", { stallMs: 300_000 });
    assert.equal(c.list, "none");
    assert.equal(c.select, "native");
    assert.equal(c.per_test_timeout, "none");
    assert.ok(c.consequences.some((x) => /no test list: plan check can't confirm/.test(x)));
    assert.ok(c.consequences.some((x) => /per_test_timeout = 5s is ignored/.test(x)));
    const p = capabilities(suite("pytest", "cd x && pytest"), "/nonexistent", "/nonexistent", { stallMs: 300_000 });
    assert.equal(p.select, "none");
    assert.ok(p.consequences.some((x) => /put \$\{WITNESS_SELECT\}/.test(x)));
    assert.equal(capabilities(suite("pytest", "cd x && pytest ${WITNESS_SELECT}"), "/nonexistent", "/nonexistent", { stallMs: 1 }).select, "placeholder");
  });
});

describe("reconcile: selections, framework timeouts, ids from an old report", () => {
  const junit = (body: string) => ({ file: "r.xml", cases: [], ...body ? {} : {} });
  test("under --select, skipped rows for tests nobody asked for are dropped", () => {
    const cases = [
      { name: "a", classname: "C", status: "passed" as const, durationMs: 1 },
      { name: "b", classname: "C", status: "skipped" as const, durationMs: 0 },
      { name: "c", classname: "C", status: "skipped" as const, durationMs: 0 },
    ];
    const r = reconcile({ suite: "s", adapter: ADAPTERS.jest, exitCode: 0, end: "exit", files: [{ ...junit(""), cases: cases.map((c) => ({ ...c, titles: [c.name] })) }], expected: ["a", "c"], cwd: "/", selected: true });
    assert.deepEqual(r.tests.map((t) => [t.id, t.status]), [["jest:a", "passed"], ["jest:c", "skipped"]]);
  });

  test("a framework's own per-test timeout message makes the row a timeout", () => {
    for (const message of ["Failed: Timeout (>3.0s) from pytest-timeout.", "Exceeded timeout of 3000 ms for a test.", "Error: Timeout of 3000ms exceeded. For async tests...", "Test timeout of 5000ms exceeded."]) {
      const r = reconcile({ suite: "s", adapter: ADAPTERS.generic, exitCode: 1, end: "exit", files: [{ file: "x", cases: [{ name: "t", classname: "C", status: "failed", durationMs: 1, message }] }], cwd: "/" });
      assert.equal(r.tests[0].statusDetail, "timeout", message);
    }
  });

  test("a rerun of an id from an old report that is gone now is missing, not failed", () => {
    const r = fromReruns([{ id: "C#gone", exitCode: 1, files: [] }], ADAPTERS["junit-maven"], "s", "/", 1, "report_missing", "list: last report r-1 (1m ago, 3 tests)");
    assert.deepEqual([r.tests[0].status, r.tests[0].statusDetail], ["other", "missing"]);
    assert.match(r.tests[0].message!, /renamed or deleted/);
  });

  test("missing plugins are recognised from the framework's own error", () => {
    assert.equal(missingPlugin(ADAPTERS.pytest, "pytest: error: unrecognized arguments: --timeout=5", true)?.name, "pytest-timeout");
    assert.equal(missingPlugin(ADAPTERS.pytest, "pytest: error: unrecognized arguments: --timeout=5", false), undefined);
    assert.match(missingPlugin(ADAPTERS.rspec, "kernel_require.rb:136:in 'Kernel#require': cannot load such file -- rspec_junit_formatter (LoadError)", false)!.hint, /gem "rspec_junit_formatter"/);
    assert.equal(missingPlugin(ADAPTERS.rspec, "$ bundle exec rspec --format RspecJunitFormatter --out r.xml\n3 examples, 1 failure", false), undefined);
  });
});

describe("partly readable reports and console-only facts", () => {
  const ev = (o: object) => JSON.stringify({ Time: "t", Package: "example.com/k", ...o });
  const stream = [ev({ Action: "run", Test: "TestA" }), ev({ Action: "pass", Test: "TestA", Elapsed: 0 }), ev({ Action: "run", Test: "TestB" }), '{"Time":"t","Action":"pa'].join("\n");

  test("a cut go test -json stream keeps finished tests and reruns the rest", () => {
    const f = { file: "stdout.jsonl", ...parseReportText(stream, "go-json") };
    assert.match(f.partial!, /cut off at line 4/);
    const r = reconcile({ suite: "s", adapter: ADAPTERS.go, exitCode: 1, end: "exit", files: [f], expected: ["example.com/k#TestA", "example.com/k#TestB", "example.com/k#TestC"], cwd: "/" });
    assert.deepEqual(r.tests.map((t) => t.id), ["go:example.com/k#TestA"]);
    assert.deepEqual(r.rerun?.sort(), ["example.com/k#TestB", "example.com/k#TestC"]);
    assert.equal(r.cause, "report_unreadable");
  });

  test("go -timeout panics name the hung test as a timeout", () => {
    const out = [ev({ Action: "run", Test: "TestH" }), ev({ Action: "output", Test: "TestH", Output: "panic: test timed out after 3s\n" }), ev({ Action: "fail", Elapsed: 3 })].join("\n");
    const c = parseReportText(out, "go-json").cases.find((x) => x.name === "TestH")!;
    assert.deepEqual([c.status, c.statusDetail, c.message], ["failed", "timeout", "panic: test timed out after 3s"]);
  });

  test("phpunit: a test aborted at its time limit is a timeout, not the pass JUnit shows", () => {
    const cases = [{ name: "testHangs", classname: "Kit\\ItemsTest", status: "passed" as const, durationMs: 1 }, { name: "testOk", classname: "Kit\\ItemsTest", status: "passed" as const, durationMs: 1 }];
    ADAPTERS.phpunit.amend!([{ file: "p.xml", cases }], "There was 1 risky test:\n\n1) Kit\\ItemsTest::testHangs\n* This test was aborted after 3 seconds\n\n* This test did not perform any assertions\n");
    assert.deepEqual([cases[0].status, (cases[0] as { statusDetail?: string }).statusDetail, cases[1].status], ["failed", "timeout", "passed"]);
  });
});

test("dotnet: the test VSTest names after killing a hung test host gets a timeout row", () => {
  const files = [{ file: "a.trx", cases: [{ name: "ListsItems", classname: "Kit.ItemsTests", status: "passed" as const, durationMs: 1 }] }];
  const out = "Data collector 'Blame' message: The specified inactivity time of 5 seconds has elapsed. Collecting hang dumps\nThe test running when the crash occurred: \nKit.ItemsTests.Hangs\nThis test may, or may not be the source of the crash.\n";
  ADAPTERS.dotnet.amend!(files, out);
  assert.deepEqual(files[0].cases.map((c) => [c.classname, c.name, c.status, (c as { statusDetail?: string }).statusDetail]), [["Kit.ItemsTests", "ListsItems", "passed", undefined], ["Kit.ItemsTests", "Hangs", "failed", "timeout"]]);
});

describe("readiness on IPv6 loopback", () => {
  test("localhost is probed on 127.0.0.1 and on ::1", async () => {
    const srv = http.createServer((_q, r) => r.end("ok"));
    await new Promise<void>((res) => srv.listen(0, "::1", res));
    const port = (srv.address() as AddressInfo).port;
    try {
      assert.equal((await httpProbe(`http://localhost:${port}/`)).ok, true);
      assert.equal((await httpProbe(`http://127.0.0.1:${port}/`)).ok, false);
    } finally {
      srv.close();
    }
  });

  test("a started service that listens on ::1 only is ready, and suites get its [::1] URL", async () => {
    const dir = tmpRepo(`version = 1
[[service]]
name = "api"
start = "node $APPS/server.mjs"
env = { HOST = "::1" }
ready = { http = "\${self.url}/health", timeout = "10s" }
[[suite]]
name = "s"
kind = "api"
service = "api"
cmd = "node -e \\"fetch(process.env.WITNESS_API_URL + '/hello').then(r => process.exit(r.ok ? 0 : 1))\\""
`);
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /answers on ::1 \(IPv6 loopback\) only, not on 127\.0\.0\.1; its URL is http:\/\/\[::1\]:\d+/);
    assert.equal(ctrf(dir).results.tests[0].status, "passed");
    assert.equal(readJson(path.join(latest(dir), "status.json")).outcome, "passed");
    void APPS;
  });
});

test("a stalled jest run that finished but did not exit says so and suggests --forceExit", async () => {
  const { diagnose } = await import("../src/diagnosis.ts");
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "witness-linger-")), "s.log");
  fs.writeFileSync(log, "Tests: 1 failed, 3 passed, 4 total\nJest did not exit one second after the test run has completed.\n\nwitness: stopping suite: no output and no report growth for 4m00s\n");
  const d = diagnose({ stage: "suite", cause: "stalled", suite: "s", log, perTestTimeout: true });
  assert.match(d.evidence!, /Jest did not exit/);
  assert.ok(d.try.some((t) => /--forceExit/.test(t)));
});

describe("ENG-10579 presets: bats, and dotnet without build servers", () => {
  test("bats: junit report into the report dir, --filter on the test names, the per-test timeout through BATS_TEST_TIMEOUT", () => {
    const s = suite("bats", "npx bats test", { perTestTimeoutMs: 3000 });
    assert.equal(suiteCommand(s, ADAPTERS.bats, {}, "/r", ["items.bats#lists items", "items.bats#a.b (c)"]), "npx bats test --filter '^(lists items|a\\.b \\(c\\))$' --report-formatter junit --output /r");
    assert.deepEqual(presetEnv(ADAPTERS.bats, 3000), { BATS_TEST_TIMEOUT: "3" });
    assert.deepEqual(presetEnv(ADAPTERS.bats, 3000, true), {});
    assert.equal(capabilities(s, "/nowhere", "/nowhere", { stallMs: 60_000 }).per_test_timeout, "native, per_test_timeout = 3s");
    assert.match(parseReportText(`<testsuites><testsuite name="items.bats"><testcase classname="items.bats" name="hangs"><failure type="failure">(in test file test/items.bats, line 13)\n  \`sleep 30' failed due to timeout</failure></testcase></testsuite></testsuites>`, "junit", "r.xml").cases[0].message ?? "", /failed due to timeout/);
    const r = reconcile({ suite: "s", adapter: ADAPTERS.bats, exitCode: 1, end: "exit", files: [parseReportText(`<testsuite name="items.bats"><testcase classname="items.bats" name="hangs"><failure>(in test file test/items.bats, line 13)\n  \`sleep 30' failed due to timeout</failure></testcase></testsuite>`, "junit", "r.xml")], cwd: "." });
    assert.deepEqual(r.tests.map((t) => [t.id, t.status, t.statusDetail]), [["bats:items.bats#hangs", "failed", "timeout"]]);
  });

  test("every dotnet suite runs with the MSBuild server, node reuse and the compiler servers off; the suite's env wins", async () => {
    const dump = `node -e "require('fs').writeFileSync(process.env.OUT, JSON.stringify(process.env))" --`;
    const dir = tmpRepo(`version = 1\n[[suite]]\nname = "net"\nkind = "api"\nadapter = "dotnet"\nservice = []\ncmd = ${JSON.stringify(dump)}\nenv = { OUT = "\${WITNESS_RUN_DIR}/env.json", UseSharedCompilation = "true" }\n`);
    await witness(dir, ["run", "--json"]);
    const env = readJson(path.join(latest(dir), "env.json"));
    assert.deepEqual([env.DOTNET_CLI_USE_MSBUILD_SERVER, env.MSBUILDDISABLENODEREUSE, env.UseRazorBuildServer, env.UseSharedCompilation], ["0", "1", "false", "true"]);
  });
});
