import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { parseConfig } from "../src/config.ts";
import { classify, fileKind, functionalWarnings, scanSource } from "../src/functional.ts";
import { guess, renderExample } from "../src/init.ts";
import { PKG } from "./helpers.ts";

const FIX = path.join(PKG, "testdata", "functional");
const fx = (p: string) => path.join(FIX, p);

function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-functional-"));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  return dir;
}

const STACKS: [string, string, "api" | "ui", string, string][] = [
  ["dotnet", "dotnet test tests/Shop.ApiTests/Shop.ApiTests.csproj", "api", "dotnet test tests/Shop.Tests/Shop.Tests.csproj --filter 'FullyQualifiedName~Shop.Tests.Api'", "tests/Shop.Tests/Domain/CalcTests.cs"],
  ["pytest", "python -m pytest", "api", "python -m pytest tests/api", "tests/unit/test_calc.py"],
  ["jest", "npx jest", "api", "npx jest test", "src/sum.test.js"],
  ["vitest", "npx vitest run", "api", "npx vitest run e2e", "src/sum.test.ts"],
  ["mocha", "npx mocha", "api", "npx mocha --recursive test/http", "test/unit/sum.spec.js"],
  ["playwright", "npx playwright test", "ui", "npx playwright test e2e/ui", "e2e/static/cases.spec.ts"],
  ["junit-maven", "mvn -B verify", "api", "mvn -B verify -Dtest='com/acme/web/**/*' -Dsurefire.failIfNoSpecifiedTests=false", "src/test/java/com/acme/domain/CalcTest.java"],
  ["junit-gradle", "gradle test", "api", "gradle test --tests 'com.acme.web.*'", "src/test/java/com/acme/domain/CalcTest.java"],
  ["go", "go test ./...", "api", "go test ./api/...", "calc/calc_test.go"],
  ["rspec", "bundle exec rspec", "api", "bundle exec rspec spec/requests", "spec/models/order_spec.rb"],
  ["phpunit", "vendor/bin/phpunit", "api", "vendor/bin/phpunit tests/Feature", "tests/Unit/CalcTest.php"],
];

describe("init proposes functional suites only", () => {
  for (const [stack, cmd, kind, mixedCmd, mixedOut] of STACKS) {
    test(`${stack}: unit excluded, functional proposed, mixed filtered`, () => {
      const unit = guess(fx(`${stack}/unit`));
      assert.deepEqual(unit.suites, []);
      assert.equal(unit.excluded.length, 1);
      assert.match(unit.excluded[0].reason, /^unit \(/);

      const fn = guess(fx(`${stack}/functional`));
      assert.deepEqual(fn.suites.map((s) => [s.cmd, s.kind]), [[cmd, kind]]);
      assert.deepEqual(fn.excluded, []);

      const mixed = guess(fx(`${stack}/mixed`));
      assert.deepEqual(mixed.suites.map((s) => [s.cmd, s.kind]), [[mixedCmd, kind]]);
      assert.deepEqual(mixed.excluded.map((e) => e.path), [mixedOut]);
      const cfg = parseConfig(parse(renderExample(mixed)) as Record<string, unknown>, path.join(fx(`${stack}/mixed`), ".witness", "witness.toml"));
      assert.deepEqual(cfg.suites.map((s) => s.kind), [kind]);
    });
  }

  test("tests that host the app get service = []; tests that read its URL keep every service", () => {
    assert.equal(guess(fx("pytest/functional")).suites[0].hostsApp, true);
    assert.equal(guess(fx("vitest/functional")).suites[0].hostsApp, false);
    const g = guess(fx("dotnet/functional"));
    g.services.push({ name: "web", cwd: ".", start: "x", ready: "${self.url}/", why: "test" });
    assert.match(renderExample(g), /kind = "api"\nadapter = "dotnet"\ncwd = "."\ncmd = ".*"\nservice = \[\]/);
  });

  test("a mixed project with no separating folder or tag needs a filter and is not proposed", () => {
    const g = guess(fx("pytest/mixed-flat"));
    assert.deepEqual(g.suites, []);
    assert.equal(g.needsFilter.length, 1);
    assert.deepEqual(g.needsFilter[0].functionalFiles, ["tests/test_orders.py"]);
    const toml = renderExample(g);
    assert.match(toml, /# Needs a filter: \. \(pytest\): 1 of 2 test files drive the app/);
    assert.match(toml, /^# \[\[suite\]\]\n# name = "pytest"\n# kind = "api"/m);
    assert.equal(parseConfig(parse(toml) as Record<string, unknown>, "/x/.witness/witness.toml").suites.length, 0);
  });

  test("Playwright: config-wide testIgnore applies, project testMatch and sibling configs don't, empty configs are excluded", () => {
    const ui = 'import { test } from "@playwright/test";\ntest("home", async ({ page }) => { await page.goto("/"); });\n';
    const guard = 'import { test, expect } from "@playwright/test";\ntest("config", () => { expect(1).toBe(1); });\n';
    const g = guess(repo({
      "package.json": JSON.stringify({ devDependencies: { "@playwright/test": "1" } }),
      "playwright.config.ts": "const IGNORE = /[/\\\\]regression[/\\\\]/;\nexport default defineConfig({\n  testDir: './e2e',\n  testIgnore: IGNORE,\n  projects: [{ name: 'setup', testMatch: /auth\\.setup\\.ts$/ }],\n});\n",
      "e2e/home.spec.ts": ui,
      "e2e/regression/guards/config.spec.ts": guard,
      "e2e/playwright.other.config.ts": "export default defineConfig({ testDir: '.', webServer: { command: 'npm start' } });\n",
      "tools/playwright.config.ts": "export default defineConfig({ testDir: './none' });\n",
    }));
    const def = g.suites.find((s) => s.cmd === "npx playwright test");
    assert.ok(def, JSON.stringify(g));
    assert.equal(def.hostsApp, false);
    assert.match(def.why, /^e2e: 1 test file\(s\) drive the app/);
    assert.deepEqual(g.excluded.map((e) => `${e.path}: ${e.reason}`), ["tools/playwright.config.ts: no tests found"]);
    assert.deepEqual(g.needsFilter.map((n) => n.path), ["e2e/playwright.other.config.ts"]);
  });

  test("the excluded list goes into the generated file as comments", () => {
    const toml = renderExample(guess(fx("dotnet/unit")));
    assert.match(toml, /# Not proposed: .*\n# {3}tests\/Shop\.UnitTests: unit \(no app host, HTTP client, browser driver or run of the app's command\)/);
  });

  test("dotnet: a few stray unit tests are skipped by class; xunit v3 on MTP gets its own filter flags", () => {
    const csproj = (refs: string) => `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" />${refs}</ItemGroup></Project>`;
    const api = (ns: string, n: number) => `using System.Net;\nnamespace ${ns};\npublic class Orders${n}Test {\n  [TestMethod]\n  public async Task Lists() { var r = await ProgramTest.NewClient.GetAsync("api/orders"); Assert.AreEqual(HttpStatusCode.OK, r.StatusCode); }\n}\n`;
    const files: Record<string, string> = {
      "tests/Api/Api.csproj": csproj('<PackageReference Include="MSTest.TestFramework" /><PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />'),
      "tests/Api/ProgramTest.cs": "using Microsoft.AspNetCore.Mvc.Testing;\nnamespace Api;\npublic class ProgramTest { static WebApplicationFactory<Program> f = new(); }\n",
      "tests/Api/DependencyTests.cs": "namespace Api;\n[TestClass]\npublic class DependencyTests {\n  [TestMethod]\n  public void NoBlazor() { Assert.IsTrue(true); }\n}\n",
    };
    for (let i = 0; i < 3; i++) files[`tests/Api/Orders${i}/Orders${i}Test.cs`] = api(`Api.Orders${i}`, i);
    const g = guess(repo(files));
    assert.equal(g.suites[0].cmd, "dotnet test tests/Api/Api.csproj --filter 'FullyQualifiedName!~Api.DependencyTests'");
    assert.deepEqual(g.excluded.map((e) => e.path), ["tests/Api/DependencyTests.cs"]);

    const mtp = guess(repo({
      "global.json": JSON.stringify({ test: { runner: "Microsoft.Testing.Platform" } }),
      "tests/Shop.Tests/Shop.Tests.csproj": csproj('<PackageReference Include="xunit.v3" /><PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />'),
      ...Object.fromEntries(fs.readdirSync(fx("dotnet/mixed/tests/Shop.Tests"), { recursive: true }).map(String).filter((f) => f.endsWith(".cs")).map((f) => [`tests/Shop.Tests/${f}`, fs.readFileSync(fx(`dotnet/mixed/tests/Shop.Tests/${f}`), "utf8")])),
    }));
    assert.equal(mtp.suites[0].cmd, "dotnet test --project tests/Shop.Tests/Shop.Tests.csproj --filter-namespace 'Shop.Tests.Api*'");
  });
});

describe("file classifier", () => {
  const kindOf = (file: string, src: string, ctx = { host: false, url: false }) => fileKind(scanSource(file, src, { isTest: true })!, ctx);
  test("in-process app hosts and browser drivers from the definition", () => {
    const api: [string, string][] = [
      ["test_views.py", "from django.test import TestCase\nclass T(TestCase):\n    def test_home(self):\n        r = self.client.get('/')\n        self.assertEqual(r.status_code, 200)\n"],
      ["test_flask.py", "def test_home(app):\n    client = app.test_client()\n    assert client.get('/').status_code == 200\n"],
      ["test_api.py", "from fastapi.testclient import TestClient\nclient = TestClient(app)\ndef test_a():\n    assert client.get('/a').status_code == 200\n"],
      ["OrdersTest.php", "<?php\nclass OrdersTest extends WebTestCase {\n  public function testList(): void { $client = static::createClient(); $client->request('GET', '/orders'); $this->assertResponseIsSuccessful(); }\n}\n"],
      ["OrdersTest.java", "class OrdersTest {\n  @Test void list() throws Exception { mockMvc.perform(get(\"/orders\")).andExpect(status().isOk()); }\n}\n"],
      ["router_test.go", "func TestList(t *testing.T) {\n\tw := httptest.NewRecorder()\n\tNewRouter().ServeHTTP(w, httptest.NewRequest(\"GET\", \"/orders\", nil))\n}\n"],
      ["orders.test.ts", "import request from 'supertest';\ntest('list', async () => { await request(app).get('/orders').expect(200); });\n"],
      ["test_helper_client.py", "from fastapi.testclient import TestClient\ndef _client():\n    return TestClient(app)\ndef test_a():\n    assert _client().post('/echo', json={}).status_code == 200\n"],
      ["test_fixture_client.py", "from fastapi.testclient import TestClient\ndef test_a(client: TestClient):\n    assert client.get(URL).status_code == 200\n"],
    ];
    for (const [f, src] of api) assert.equal(kindOf(f, src), "api", f);
    const ui: [string, string][] = [
      ["home_spec.rb", "RSpec.describe 'Home', type: :system do\n  it 'shows products' do\n    visit root_path\n    expect(page).to have_content('Products')\n  end\nend\n"],
      ["checkout_spec.rb", "feature 'Checkout' do\n  scenario 'pays' do\n    visit '/cart'\n  end\nend\n"],
      ["test_ui.py", "from selenium import webdriver\ndef test_home():\n    d = webdriver.Chrome()\n    d.get('http://localhost:8000/')\n"],
      ["home.cy.ts", "it('home', () => { cy.visit('/'); cy.contains('Products'); });\n"],
    ];
    for (const [f, src] of ui) assert.equal(kindOf(f, src), "ui", f);
  });

  test("mocked HTTP, repository calls and localhost test data don't count", () => {
    assert.equal(kindOf("test_client.py", "import responses\nimport requests\n@responses.activate\ndef test_a():\n    requests.get('http://x/a')\n", { host: false, url: true }), null);
    assert.equal(kindOf("DeleteBasket.cs", "public class DeleteBasket {\n  [Fact]\n  public async Task Deletes() { await _repo.DeleteAsync(basket); }\n}\n", { host: true, url: false }), null);
    assert.equal(kindOf("proxy.test.ts", "import http from 'node:http';\nconst server = http.createServer((req, res) => res.end());\nbeforeAll(() => server.listen(0, '127.0.0.1'));\nit('times out', async () => { await fetch(url); });\n"), null);
    assert.equal(kindOf("EmailTests.cs", "public class EmailTests {\n  [Fact]\n  public void Link() { Assert.Equal(\"https://localhost:5001/confirm\", svc.Link()); }\n}\n"), null);
    const files = [scanSource("tests/helpers.py", "BASE = 'http://localhost:8000'\n", { isTest: false })!, scanSource("tests/test_a.py", "import requests\ndef test_a():\n    requests.get(BASE + '/a')\n")!];
    assert.equal(classify(files).status, "functional");
  });

  test("Aspire tests that only inspect the app model are excluded with that reason", () => {
    const f = scanSource("AppHostTests.cs", "using Aspire.Hosting.Testing;\npublic class T {\n  [Fact]\n  public async Task Model() { var b = await DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>(); Assert.Single(b.Resources); }\n}\n")!;
    assert.match(classify([f], "AppHostTests").reason, /^unit \(.*\); inspects the Aspire app model without starting the app or calling it$/);
  });
});

describe("check warns about non-functional suites", () => {
  const cfgFor = (root: string, suites: string) => parseConfig(parse(`version = 1\n${suites}`) as Record<string, unknown>, path.join(root, ".witness", "witness.toml"));
  test("names the suite, the files scanned and the fix; filtered, functional and generic suites pass", () => {
    const cfg = cfgFor(FIX, `
[[suite]]
name = "unit"
kind = "api"
adapter = "pytest"
cwd = "pytest/unit"
cmd = "python -m pytest tests"
[[suite]]
name = "api"
kind = "api"
adapter = "pytest"
cwd = "pytest/functional"
cmd = "python -m pytest"
[[suite]]
name = "mixed"
kind = "api"
adapter = "pytest"
cwd = "pytest/mixed"
cmd = "python -m pytest"
[[suite]]
name = "mixed-filtered"
kind = "api"
adapter = "pytest"
cwd = "pytest/mixed"
cmd = "python -m pytest -m api"
[[suite]]
name = "smoke"
kind = "api"
adapter = "generic"
cmd = "curl -fsS http://127.0.0.1:3000/"
`);
    const w = functionalWarnings(cfg);
    assert.deepEqual(w.map((x) => x.suite), ["unit", "mixed"]);
    assert.match(w[0].message, /^suite unit looks non-functional: unit \(no app host, HTTP client, browser driver or run of the app's command\)\. Scanned 1 test file\(s\) under pytest\/unit\/tests \(pytest\/unit\/tests\/test_calc\.py\)\. Witness runs functional tests only: give the suite a filter .* or remove it\.$/);
    assert.match(w[1].message, /^suite mixed: 1 of 2 test files under pytest\/mixed don't drive the app \(pytest\/mixed\/tests\/unit\/test_calc\.py\)/);
  });
});
