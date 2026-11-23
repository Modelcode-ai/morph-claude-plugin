import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, test } from "node:test";
import { ADAPTERS, type AdapterName } from "../src/adapters.ts";
import { parseReportFile } from "../src/parsers/index.ts";
import { REPORTS } from "./helpers.ts";

function rows(file: string, adapter: AdapterName, cwd = "/repo") {
  const r = parseReportFile(path.join(REPORTS, file), ADAPTERS[adapter].format, cwd);
  assert.equal(r.error, undefined, `${file}: ${r.error}`);
  return r.cases.map((c) => ({ ...c, id: ADAPTERS[adapter].id({ ...c, file: c.file?.startsWith(cwd + "/") ? c.file.slice(cwd.length + 1) : c.file }) }));
}
const byId = (rs: ReturnType<typeof rows>) => Object.fromEntries(rs.map((r) => [r.id, r]));

describe("JUnit corpus", () => {
  test("pytest xunit1: node ids from file attr, failure vs error, skip and xfail", () => {
    const r = byId(rows("junit/pytest-xunit1.xml", "pytest"));
    assert.equal(r["tests/e2e/test_invoices.py::test_create_invoice"].status, "passed");
    const f = r["tests/e2e/test_invoices.py::TestDueDate::test_update_due_date[2026-12-01]"];
    assert.equal(f.status, "failed");
    assert.equal(f.statusDetail, undefined);
    assert.match(f.trace!, /assert r.status_code == 200/);
    const e = r["tests/e2e/test_health.py::test_health"];
    assert.equal(e.status, "failed");
    assert.equal(e.statusDetail, "error");
    assert.equal(r["tests/e2e/test_health.py::test_legacy"].status, "skipped");
    assert.equal(r["tests/e2e/test_health.py::test_known_bug"].status, "skipped");
    assert.equal(Object.keys(r).length, 6);
  });

  test("pytest xunit2 (no file attr): module path inferred from classname", () => {
    assert.deepEqual(rows("junit/pytest-xunit2.xml", "pytest").map((r) => r.id), ["tests/unit/test_math.py::test_add", "tests/unit/test_math.py::TestDivide::test_by_zero"]);
  });

  test("surefire: rerunFailure counts retries, flakyFailure passes as flaky, error kept apart", () => {
    const r = byId(rows("junit/surefire-TEST-com.acme.orders.OrderServiceTest.xml", "junit-maven"));
    assert.equal(r["com.acme.orders.OrderServiceTest#rejectsEmptyCart"].status, "failed");
    assert.equal(r["com.acme.orders.OrderServiceTest#rejectsEmptyCart"].retries, 2);
    assert.equal(r["com.acme.orders.OrderServiceTest#rejectsEmptyCart"].message, "expected: <422> but was: <500>");
    const flaky = r["com.acme.orders.OrderServiceTest#computesTax(BigDecimal)[1]"];
    assert.equal(flaky.status, "passed");
    assert.equal(flaky.flaky, true);
    assert.equal(r["com.acme.orders.OrderServiceTest#loadsFixtures"].statusDetail, "error");
    assert.equal(r["com.acme.orders.OrderServiceTest#legacyExport"].status, "skipped");
  });

  test("gradle: timeout failure detected", () => {
    const r = byId(rows("junit/gradle-TEST-com.acme.api.HealthIT.xml", "junit-gradle"));
    assert.equal(r["com.acme.api.HealthIT#metricsTimeout()"].statusDetail, "timeout");
  });

  test("phpunit nested suites with data sets use the PHP class name", () => {
    const ids = rows("junit/phpunit-nested.xml", "phpunit").map((r) => `${r.id}=${r.status}`);
    assert.deepEqual(ids, ["Tests\\Feature\\CartTest#testAddsItem=passed", "Tests\\Feature\\CartTest#testTotals with data set #0=passed", "Tests\\Feature\\CartTest#testTotals with data set #1=failed"]);
  });

  test("missing classname falls back to the suite name; nameless case kept", () => {
    const ids = rows("junit/missing-classname.xml", "generic").map((r) => r.id);
    assert.deepEqual(ids, ["smoke#homepage loads", "smoke#login works", "smoke#(unnamed)"]);
  });

  test("vitest, mocha and rspec ids", () => {
    assert.deepEqual(rows("junit/vitest-junit.xml", "vitest").map((r) => r.id), ["src/cart.test.ts > cart > adds an item", "src/cart.test.ts > cart > totals > applies discount", "src/cart.test.ts > cart > todo later"]);
    assert.deepEqual(rows("junit/mocha-xunit.xml", "mocha").map((r) => r.id), ["test/users.spec.js > Users API > GET /users returns a list", "test/users.spec.js > Users API > POST /users validates email"]);
    assert.deepEqual(rows("junit/rspec-junit.xml", "rspec").map((r) => r.id), ["spec/requests/orders_spec.rb > Orders GET /orders returns 200", "spec/requests/orders_spec.rb > Orders POST /orders rejects bad input"]);
  });

  test("[[ATTACHMENT|...]] lines become attachments", () => {
    const [c] = rows("junit/attachments.xml", "generic");
    assert.deepEqual(c.attachments?.map((a) => a.path), ["test-results/checkout-pays/test-failed-1.png", "test-results/checkout-pays/trace.zip"]);
  });

  for (const [file, re] of [
    ["junit/broken-truncated.xml", /truncated: unclosed <testsuite> <testcase>/],
    ["junit/broken-unclosed.xml", /truncated: unclosed <testsuites> <testsuite> <testcase> <failure>/],
    ["junit/broken-empty.xml", /empty report/],
    ["junit/broken-html.xml", /not a JUnit report/],
  ] as const) {
    test(`unreadable: ${file}`, () => {
      const r = parseReportFile(path.join(REPORTS, file), "junit");
      assert.equal(r.cases.length, 0);
      assert.match(r.error ?? "", re);
    });
  }
});

describe("TRX corpus", () => {
  test("xunit via vstest: Class#Method ids, outcomes incl. timeout and NotExecuted", () => {
    const r = byId(rows("trx/xunit-vstest.trx", "dotnet"));
    const pre = "Microsoft.eShopWeb.UnitTests.ApplicationCore";
    assert.equal(r[`${pre}.Entities.BasketTests.BasketAddItem#AddsBasketItemIfNotPresent`].status, "passed");
    const f = r[`${pre}.Entities.BasketTests.BasketAddItem#IncrementsQuantityOfItemIfPresent`];
    assert.equal(f.status, "failed");
    assert.match(f.message!, /Assert.Equal\(\) Failure/);
    assert.match(f.trace!, /BasketAddItem.cs:line 31/);
    assert.equal(r[`${pre}.Services.OrderServiceTests#CreateOrder(quantity: 3)`].durationMs, 1500);
    assert.equal(r[`${pre}.Services.OrderServiceTests#Skipped`].status, "skipped");
    assert.equal(r[`${pre}.Services.OrderServiceTests#HangsForever`].statusDetail, "timeout");
  });

  test("data-driven inner results flattened; assembly suffix stripped; Error outcome", () => {
    assert.deepEqual(rows("trx/mstest-data-driven.trx", "dotnet").map((r) => `${r.id}=${r.status}${r.statusDetail ? `/${r.statusDetail}` : ""}`), ['Shop.Tests.PriceTests#ParsesPrice ("1.00")=passed', 'Shop.Tests.PriceTests#ParsesPrice ("abc")=failed', "Shop.Tests.PriceTests#Crashes=failed/error"]);
  });

  test("truncated TRX is unreadable", () => {
    assert.match(parseReportFile(path.join(REPORTS, "trx/broken-truncated.trx"), "trx").error ?? "", /invalid XML/);
  });
});

describe("Playwright JSON corpus", () => {
  test("describe nesting, projects, timeout, flaky, skipped, attachments", () => {
    const r = byId(rows("playwright/report.json", "playwright"));
    assert.equal(r["checkout.spec.ts > guest can open cart [chromium]"].status, "passed");
    const t = r["checkout.spec.ts > payment > pays with card [chromium]"];
    assert.equal(t.status, "failed");
    assert.equal(t.statusDetail, "timeout");
    assert.equal(t.message, "Test timeout of 30000ms exceeded.");
    assert.deepEqual(t.attachments?.map((a) => a.contentType), ["image/png", "application/zip"]);
    const fl = r["checkout.spec.ts > payment > pays with card [firefox]"];
    assert.equal(fl.status, "passed");
    assert.equal(fl.flaky, true);
    assert.equal(fl.retries, 1);
    assert.equal(r["checkout.spec.ts > payment > pays with paypal [firefox]"].status, "skipped");
  });

  test("single project: no project suffix", () => {
    assert.deepEqual(rows("playwright/single-project.json", "playwright").map((r) => r.id), ["home.spec.ts > shows title"]);
  });

  test("truncated JSON is unreadable", () => {
    assert.match(parseReportFile(path.join(REPORTS, "playwright/broken-truncated.json"), "playwright-json").error ?? "", /invalid JSON/);
  });
});

describe("Jest JSON corpus", () => {
  test("ancestor titles, pending, retried, suite that failed to run", () => {
    const r = byId(rows("jest/report.json", "jest"));
    assert.equal(r["src/__tests__/cart.test.js > cart > totals > applies discount"].status, "failed");
    assert.doesNotMatch(r["src/__tests__/cart.test.js > cart > totals > applies discount"].trace!, /\x1b/);
    assert.equal(r["src/__tests__/cart.test.js > cart > is pending"].status, "skipped");
    assert.equal(r["src/__tests__/cart.test.js > top level"].flaky, true);
    const broken = r["src/__tests__/broken.test.js > (test file failed to run)"];
    assert.equal(broken.statusDetail, "error");
    assert.match(broken.message!, /Cannot find module/);
  });
});

describe("go test -json corpus", () => {
  test("subtests, skip, build failure, non-JSON lines ignored", () => {
    const r = byId(rows("go/go-test.jsonl", "go"));
    assert.equal(r["example.com/shop/api#TestHealth"].status, "passed");
    assert.equal(r["example.com/shop/api#TestOrders/create"].status, "failed");
    assert.match(r["example.com/shop/api#TestOrders/create"].message!, /got status 500, want 201/);
    assert.equal(r["example.com/shop/api#TestLegacy"].status, "skipped");
    assert.equal(r["example.com/shop/broken#(package)"].statusDetail, "error");
  });

  test("truncated stream: unfinished test is failed/error", () => {
    const r = byId(rows("go/truncated.jsonl", "go"));
    assert.equal(r["example.com/shop/db#TestMigrate"].status, "passed");
    assert.equal(r["example.com/shop/db#TestSlowQuery"].statusDetail, "error");
  });

  test("no events -> unreadable", () => {
    assert.match(parseReportFile(path.join(REPORTS, "go/broken-no-events.txt"), "go-json").error ?? "", /no go test -json events/);
  });
});
