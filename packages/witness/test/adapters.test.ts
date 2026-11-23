import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ADAPTERS, appendArgs, dotnetFqnToId, pytestId, selectCommand, trxHint } from "../src/adapters.ts";
import { splitIds } from "../src/cli.ts";
import { buildFailure, reportPathEvidence, suiteCommand } from "../src/suite.ts";
import type { Suite } from "../src/config.ts";

const suite = (adapter: Suite["adapter"], cmd: string, extra: Partial<Suite> = {}): Suite => ({ name: "s", kind: "api", adapter, cmd, cwd: ".", timeoutMs: 60_000, env: {}, ...extra });

describe("adapter table", () => {
  test("every adapter has a report source and an id normalizer", () => {
    for (const a of Object.values(ADAPTERS)) {
      assert.ok(a.reportGlobs.length || a.fromStdout, a.name);
      assert.equal(typeof a.id, "function");
    }
  });

  test("report args are appended unless the command already wires a report", () => {
    assert.equal(suiteCommand(suite("pytest", "pytest tests/e2e"), ADAPTERS.pytest, {}, "/r"), "pytest tests/e2e --junitxml=/r/junit.xml -o junit_family=xunit1");
    assert.equal(suiteCommand(suite("pytest", "pytest --junitxml=out.xml"), ADAPTERS.pytest, {}, "/r"), "pytest --junitxml=out.xml");
    assert.equal(suiteCommand(suite("dotnet", "dotnet test eShopOnWeb.sln"), ADAPTERS.dotnet, {}, "/r"), "dotnet test eShopOnWeb.sln --logger trx --results-directory /r");
    assert.equal(suiteCommand(suite("dotnet", "dotnet test -- --report-trx"), ADAPTERS.dotnet, {}, "/r"), "dotnet test -- --report-trx");
    assert.equal(suiteCommand(suite("jest", "npm test"), ADAPTERS.jest, {}, "/r"), "npm test -- --json --outputFile=/r/jest.json");
    assert.equal(suiteCommand(suite("go", "go test ./..."), ADAPTERS.go, {}, "/r"), "go test ./... -json");
    assert.equal(suiteCommand(suite("junit-maven", "mvn verify"), ADAPTERS["junit-maven"], {}, "/r"), "mvn verify");
  });

  test("per-test timeout flags", () => {
    assert.match(suiteCommand(suite("playwright", "npx playwright test", { perTestTimeoutMs: 120_000 }), ADAPTERS.playwright, {}, "/r"), /--timeout=120000$/);
    assert.match(suiteCommand(suite("pytest", "pytest", { perTestTimeoutMs: 120_000 }), ADAPTERS.pytest, {}, "/r"), /--timeout=120$/);
    assert.match(suiteCommand(suite("dotnet", "dotnet test", { perTestTimeoutMs: 90_000 }), ADAPTERS.dotnet, {}, "/r"), /--blame-hang-timeout 90s$/);
  });

  test("single-test select syntax", () => {
    assert.equal(selectCommand(ADAPTERS.pytest, "python -m pytest -x tests/e2e -k smoke", ["tests/e2e/test_a.py::test_b[1]"]), "python -m pytest -x -k smoke 'tests/e2e/test_a.py::test_b[1]'");
    assert.equal(selectCommand(ADAPTERS.pytest, "cd x && pytest", ["a"]), null);
    assert.equal(selectCommand(ADAPTERS["junit-maven"], "mvn verify", ["com.a.FooTest#bar(String)[1]"]), "mvn verify '-Dtest=com.a.FooTest#bar' -Dsurefire.failIfNoSpecifiedTests=false -DfailIfNoTests=false");
    assert.equal(selectCommand(ADAPTERS["junit-gradle"], "./gradlew test", ["com.a.FooTest#bar()"]), "./gradlew test --tests com.a.FooTest.bar");
    assert.equal(selectCommand(ADAPTERS.dotnet, "dotnet test", ["Ns.C#M(x: 1)", "Ns.C#N"]), "dotnet test --filter 'FullyQualifiedName=Ns.C.M|FullyQualifiedName=Ns.C.N'");
    assert.equal(selectCommand(ADAPTERS.go, "go test ./...", ["example.com/x#TestA/sub"]), "go test ./... -run '^(TestA)$/^(sub)$'");
    assert.equal(selectCommand(ADAPTERS.jest, "npx jest", ["src/a.test.js > cart > adds"]), "npx jest -t '(cart adds)$'");
    assert.equal(selectCommand(ADAPTERS.playwright, "npx playwright test", ["a.spec.ts > pay > card [chromium]"]), "npx playwright test a.spec.ts --grep '(pay card)$'");
    assert.equal(selectCommand(ADAPTERS.phpunit, "vendor/bin/phpunit", ["Tests\\CartTest#testTotals with data set #1"]), "vendor/bin/phpunit --filter '/(Tests\\\\CartTest::testTotals)( with data set .*)?$/'");
    assert.equal(selectCommand(ADAPTERS.generic, "./t.sh", ["x"]), null);
    assert.equal(selectCommand(ADAPTERS.generic, "./t.sh", ["a b", "c"], "./t.sh --only {ids}"), "./t.sh --only 'a b' c");
  });

  test("list output parsers", () => {
    assert.deepEqual(ADAPTERS.pytest.list!.parse!("tests/a.py::test_x\ntests/a.py::TestY::test_z[1]\n\n2 tests collected in 0.01s\n"), ["tests/a.py::test_x", "tests/a.py::TestY::test_z[1]"]);
    assert.deepEqual(ADAPTERS.dotnet.list!.parse!("Test run for /x/UnitTests.dll (.NETCoreApp,Version=v8.0)\nThe following Tests are available:\n    Ns.BasketTests.AddsItem\n    Ns.OrderTests.Create(quantity: 3)\n"), ["Ns.BasketTests#AddsItem", "Ns.OrderTests#Create(quantity: 3)"]);
    assert.deepEqual(ADAPTERS.go.list!.parse!("TestA\nTestB\nok  \texample.com/x\t0.01s\nTestC\nok  \texample.com/y\t0.01s\n"), ["example.com/x#TestA", "example.com/x#TestB", "example.com/y#TestC"]);
    assert.deepEqual(ADAPTERS.playwright.list!.parse!("Listing tests:\n  [chromium] › a.spec.ts:3:5 › pay › card\n  [firefox] › a.spec.ts:3:5 › pay › card\nTotal: 2 tests in 1 file\n"), ["a.spec.ts > pay > card [chromium]", "a.spec.ts > pay > card [firefox]"]);
    assert.deepEqual(ADAPTERS.phpunit.list!.parse!("Available test(s):\n - Tests\\CartTest::testAdd\n"), ["Tests\\CartTest#testAdd"]);
    assert.equal(ADAPTERS.vitest.list!.rewrite!("npx vitest run --dir src"), "npx vitest list --dir src");
  });

  test("id helpers", () => {
    assert.equal(pytestId({ name: "test_x", classname: "tests.api.test_a.TestB", status: "passed", durationMs: 0 }), "tests/api/test_a.py::TestB::test_x");
    assert.equal(dotnetFqnToId("Ns.Sub.Class.Method(a: \"x.y\")"), 'Ns.Sub.Class#Method(a: "x.y")');
    assert.equal(appendArgs("npm run test:e2e", "--x"), "npm run test:e2e -- --x");
    assert.equal(appendArgs("npm test -- --ci", "--x"), "npm test -- --ci --x");
  });
});

describe("eShopOnWeb eval fixes: build failures, report paths, TRX hint", () => {
  test("buildFailure finds compile errors and missing commands, nothing in plain test output", () => {
    assert.match(buildFailure("Restore complete\nsrc/Basket.cs(13,59): error CS1525: Invalid expression term\nBuild FAILED.", 1)!, /error CS1525/);
    assert.match(buildFailure("[ERROR] COMPILATION ERROR :\n[ERROR] Foo.java:[3,1] ';' expected", 1)!, /COMPILATION ERROR/);
    assert.match(buildFailure("FAIL\texample.com/x [build failed]", 1)!, /build failed/);
    assert.match(buildFailure("bash: .witness/dotnet: No such file or directory", 127)!, /No such file/);
    assert.equal(buildFailure("Tests run: 3, Failures: 1\nAssertionError: expected 1 got 2", 1), undefined);
  });

  test("reportPathEvidence names a report the framework wrote somewhere witness can't see", () => {
    const out = "Test run summary: Passed!\n  duration: 788ms\nIn process file artifacts produced:\n  - /nonexistent/witness/run/reports/unit/root_x.trx\n";
    assert.match(reportPathEvidence(out)!, /says it wrote \/nonexistent\/witness\/run\/reports\/unit\/root_x\.trx, but there is no such file here/);
    assert.match(reportPathEvidence("Results File: /nonexistent/a.trx")!, /no such file/);
    assert.equal(reportPathEvidence("duration: 788ms"), undefined);
  });

  test("TRX hint without central package management asks for a versioned PackageReference", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-trx-"));
    fs.mkdirSync(path.join(dir, ".git"));
    fs.mkdirSync(path.join(dir, "t"));
    fs.writeFileSync(path.join(dir, "t", "T.csproj"), "<Project />");
    const h = trxHint(dir, "dotnet test --project t/T.csproj");
    assert.match(h, /<PackageReference Include="Microsoft\.Testing\.Extensions\.TrxReport" Version="<version>" \/> to t\/T\.csproj/);
    assert.doesNotMatch(h, /PackageVersion/);
  });
});

test("--select splits on top-level commas only; a title with a comma stays one id", () => {
  assert.deepEqual(splitIds("dotnet:A#t(x: 1, y: \"a,b\"),unit:dotnet:A#u"), ['dotnet:A#t(x: 1, y: "a,b")', "unit:dotnet:A#u"]);
  assert.deepEqual(splitIds("jest:src/a.test.ts > adds 1, 2,jest:src/a.test.ts > b"), ["jest:src/a.test.ts > adds 1, 2", "jest:src/a.test.ts > b"]);
  assert.deepEqual(splitIds("a, b"), ["a", "b"]);
});
