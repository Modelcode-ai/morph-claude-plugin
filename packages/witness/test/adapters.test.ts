import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ADAPTERS, appendArgs, dotnetFqnToId, pytestId, selectCommand } from "../src/adapters.ts";
import { suiteCommand } from "../src/suite.ts";
import type { Suite } from "../src/config.ts";

const suite = (adapter: Suite["adapter"], cmd: string, extra: Partial<Suite> = {}): Suite => ({ name: "s", adapter, cmd, cwd: ".", timeoutMs: 60_000, env: {}, ...extra });

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
    assert.deepEqual(ADAPTERS.pytest.list!.parse("tests/a.py::test_x\ntests/a.py::TestY::test_z[1]\n\n2 tests collected in 0.01s\n"), ["tests/a.py::test_x", "tests/a.py::TestY::test_z[1]"]);
    assert.deepEqual(ADAPTERS.dotnet.list!.parse("Test run for /x/UnitTests.dll (.NETCoreApp,Version=v8.0)\nThe following Tests are available:\n    Ns.BasketTests.AddsItem\n    Ns.OrderTests.Create(quantity: 3)\n"), ["Ns.BasketTests#AddsItem", "Ns.OrderTests#Create(quantity: 3)"]);
    assert.deepEqual(ADAPTERS.go.list!.parse("TestA\nTestB\nok  \texample.com/x\t0.01s\nTestC\nok  \texample.com/y\t0.01s\n"), ["example.com/x#TestA", "example.com/x#TestB", "example.com/y#TestC"]);
    assert.deepEqual(ADAPTERS.playwright.list!.parse("Listing tests:\n  [chromium] › a.spec.ts:3:5 › pay › card\n  [firefox] › a.spec.ts:3:5 › pay › card\nTotal: 2 tests in 1 file\n"), ["a.spec.ts > pay > card [chromium]", "a.spec.ts > pay > card [firefox]"]);
    assert.deepEqual(ADAPTERS.phpunit.list!.parse("Available test(s):\n - Tests\\CartTest::testAdd\n"), ["Tests\\CartTest#testAdd"]);
    assert.equal(ADAPTERS.vitest.list!.cmd("npx vitest run --dir src"), "npx vitest list --dir src");
  });

  test("id helpers", () => {
    assert.equal(pytestId({ name: "test_x", classname: "tests.api.test_a.TestB", status: "passed", durationMs: 0 }), "tests/api/test_a.py::TestB::test_x");
    assert.equal(dotnetFqnToId("Ns.Sub.Class.Method(a: \"x.y\")"), 'Ns.Sub.Class#Method(a: "x.y")');
    assert.equal(appendArgs("npm run test:e2e", "--x"), "npm run test:e2e -- --x");
    assert.equal(appendArgs("npm test -- --ci", "--x"), "npm test -- --ci --x");
  });
});
