import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { expectsSuccess, findTests, isTestPath, lintSource, mask } from "../src/lint.ts";
import { parsePlan } from "../src/plan.ts";
import { witness } from "./helpers.ts";

const rules = (file: string, src: string, plan?: string) =>
  lintSource(file, src, { plan: plan ? parsePlan(plan).plan : undefined }).findings.map((f) => `${f.level === "error" ? "" : "warn:"}${f.rule}@${f.line}`);

test("lint: mask blanks comments and strings but keeps lines and quotes", () => {
  const src = `x = "a { b" # c }\ny = """\n}\n"""\n`;
  const m = mask(src, "py");
  assert.equal(m.length, src.length);
  assert.equal(m.split("\n").length, src.split("\n").length);
  assert.ok(!m.includes("{") && !m.includes("}"));
  assert.ok(m.startsWith('x = "     "'));
  const js = mask("const r = /a'b/; f(a / b); el = <div>{x}</div>; s = `t${'{'}`;", "js");
  assert.ok(!js.includes("'b"), js);
  assert.ok(js.includes("f(a / b)"));
  assert.ok(js.includes("</div>"));
});

test("lint: test paths by convention", () => {
  for (const p of ["tests/test_api.py", "src/a.test.ts", "e2e/login.spec.ts", "tests/UnitTests/Basket/AddItem.cs", "pkg/x_test.go", "spec/models/user_spec.rb", "src/test/java/FooTest.java", "tests/Unit/FooTest.php"]) assert.ok(isTestPath(p), p);
  for (const p of ["src/app.ts", "src/Basket.cs", "README.md", "tests/data.json"]) assert.ok(!isTestPath(p), p);
});

test("lint python: no assertion, swallowed except, long sleep; helpers, skips and nested hangs are fine", () => {
  const src = `import time, asyncio, pytest

def check_ok(r):
    assert r.status_code == 200

def test_ok(client):
    check_ok(client.get("/"))

def test_nothing(client):
    client.get("/")

def test_swallow(client):
    try:
        client.get("/")
        assert True
    except Exception:
        pass

def test_narrow(client):
    try:
        client.get("/")
    except KeyError:
        pass
    assert 1

def test_skip_on_missing_db():
    try:
        connect()
    except Exception as exc:
        pytest.skip(f"no db: {exc}")
    assert 1

def test_sleepy():
    time.sleep(10)
    assert 1

async def test_fake_hang():
    async def hang():
        await asyncio.sleep(60)
    assert await run(hang, timeout=1)

def test_multiline_string():
    content = """
x: 1
"""
    assert parse(content)

@pytest.mark.skip(reason="later")
def test_skipped():
    pass

def test_bounded_sleep():
    time.sleep(2)
    assert 1

def test_ignored():  # witness-lint: ignore[no-assertion]
    run()

def test_does_not_raise_when_empty():
    run([])  # must not raise
`;
  assert.deepEqual(rules("tests/test_x.py", src), ["no-assertion@9", "swallowed-exception@16", "long-sleep@34", "warn:no-assertion@59"]);
});

test("lint typescript: jest/playwright tests, catch blocks, setTimeout, regex literals", () => {
  const src = `import { test, expect } from '@playwright/test';

test('loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/it's here/)).toBeVisible();
});

test('clicks only', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Go');
});

it('swallows', async () => {
  try {
    await api();
  } catch (e) {
    console.log(e);
  }
  expect(1).toBe(1);
});

it('captures the error to assert on it', async () => {
  const err = await api().catch((e) => e);
  expect(err).toBeInstanceOf(Error);
});

it('hides a missing element', async () => {
  if (await el.isVisible().catch(() => false)) expect(1).toBe(1);
});

it('waits', async () => {
  await new Promise((r) => setTimeout(r, 10000));
  await page.waitForTimeout(6000);
  expect(1).toBe(1);
});

it('mock route ignores bad JSON', async () => {
  await page.route('**', async (route) => {
    try { JSON.parse(x); } catch { /* ignore */ }
  });
  await screen.findByText('ok');
});

it.skip('later', () => {});
`;
  assert.deepEqual(rules("e2e/a.spec.ts", src), ["no-assertion@8", "swallowed-exception@16", "swallowed-exception@28", "long-sleep@32", "long-sleep@33"]);
});

test("lint c#: xunit/nunit/mstest attributes, expression bodies, mocks, Thread.Sleep and catch", () => {
  const src = `public class BasketTests
{
    [Fact]
    public async Task AddsItem()
    {
        var b = new Basket("x");
        b.AddItem(1, 1.5m);
        Assert.Single(b.Items);
    }

    [
        Theory,
        InlineData(1),
    ]
    public void ExpressionBodied(int n) =>
        Assert.Equal(n, new Thing { Id = n }.Id);

    [Fact]
    public async Task CallsRepo()
    {
        await svc.Run();
        await _repo.Received().UpdateAsync(Arg.Any<Basket>());
    }

    [Fact]
    public void Nothing()
    {
        svc.Run();
    }

    [TestMethod]
    public void Swallows()
    {
        try { svc.Run(); } catch (Exception) { }
        Assert.IsTrue(true);
    }

    [Test]
    public void Sleeps()
    {
        Thread.Sleep(TimeSpan.FromSeconds(30));
        Task.Delay(6000).Wait();
        Assert.Pass();
    }

    [Fact(Skip = "flaky")]
    public void Skipped() { }

    [Fact]
    public void NarrowCatch()
    {
        try { svc.Run(); } catch (InvalidOperationException) { }
        svc.Should().NotBeNull();
    }
}
`;
  const code = mask(src, "cs");
  assert.deepEqual(findTests(src, code, "cs").map((t) => t.name), ["AddsItem", "ExpressionBodied", "CallsRepo", "Nothing", "Swallows", "Sleeps", "Skipped", "NarrowCatch"]);
  assert.deepEqual(rules("tests/UnitTests/BasketTests.cs", src), ["no-assertion@25", "swallowed-exception@34", "long-sleep@41", "long-sleep@42"]);
});

test("lint java, go, ruby and php", () => {
  const java = `class ApiTest {
  @Test
  void returnsUser() throws Exception {
    mvc.perform(get("/u/1")).andExpect(status().isOk());
  }
  @Test
  void swallows() {
    try { call(); } catch (Exception e) { }
    assertTrue(true);
  }
  @ParameterizedTest
  @ValueSource(ints = {1, 2})
  void sleeps(int n) throws Exception {
    Thread.sleep(7000L);
    verify(repo).save(any());
  }
}
`;
  assert.deepEqual(rules("src/test/java/ApiTest.java", java), ["swallowed-exception@8", "long-sleep@14"]);
  const go = `package x

func TestOk(t *testing.T) {
	if got := Add(1, 2); got != 3 {
		t.Errorf("got %d", got)
	}
}

func TestNothing(t *testing.T) {
	Add(1, 2)
}

func TestSleep(t *testing.T) {
	time.Sleep(10 * time.Second)
	require.NoError(t, err)
}

func TestFakeHang(t *testing.T) {
	go func() { time.Sleep(time.Minute) }()
	assert.True(t, ok)
}
`;
  assert.deepEqual(rules("x_test.go", go), ["no-assertion@9", "long-sleep@14"]);
  const rb = `describe User do
  it "has a name" do
    expect(User.new.name).to eq("x")
  end

  it "does nothing" do
    User.new
  end

  it "rescues" do
    begin
      User.create!
    rescue => e
      puts e
    end
    expect(1).to eq(1)
  end

  it "sleeps" do
    sleep 8
    expect { User.new }.not_to raise_error
  end
end
`;
  assert.deepEqual(rules("spec/user_spec.rb", rb), ["no-assertion@6", "swallowed-exception@13", "long-sleep@20"]);
  const php = `<?php
class UserTest extends TestCase
{
    public function testName(): void
    {
        $this->assertSame('x', (new User())->name);
    }

    #[Test]
    public function createsNothing(): void
    {
        new User();
    }

    public function testSwallow(): void
    {
        try { User::create(); } catch (\\Exception $e) { }
        sleep(9);
        self::assertTrue(true);
    }
}
`;
  assert.deepEqual(rules("tests/Unit/UserTest.php", php), ["no-assertion@9", "swallowed-exception@17", "long-sleep@18"]);
});

const PLAN = `version: 1
source: "issue #9"
items:
  - id: P1
    behavior: "GET /basket/{id} returns the basket"
    expect: "200 with the items"
    kind: new
    tests: ["pytest:tests/test_basket.py::test_get_basket", "pytest:tests/test_basket.py::test_get_basket_ok"]
  - id: P2
    behavior: "GET /basket/{id} of another user is refused"
    expect: "403"
    kind: new
    tests: ["pytest:tests/test_basket.py::test_other_user"]
`;

test("lint with a plan: a success behavior tested only by an error status is flagged", () => {
  const src = `def test_get_basket(client):
    r = client.get("/basket/1")
    assert r.status_code == 404

def test_get_basket_ok(client):
    r = client.get("/basket/1")
    assert r.status_code == 200
    assert r.json()["items"] == []

def test_other_user(client):
    r = client.get("/basket/2")
    assert r.status_code == 403
`;
  assert.deepEqual(rules("tests/test_basket.py", src, PLAN), ["error-status-only@1"]);
  assert.deepEqual(rules("tests/test_basket.py", src), []);
  assert.deepEqual(rules("other/test_basket2.py", src, PLAN), []);
  const p = parsePlan(PLAN).plan!;
  assert.equal(expectsSuccess(p.items[0]), true);
  assert.equal(expectsSuccess(p.items[1]), false);
  const cs = `public class BasketApi {
    [Fact]
    public async Task GetBasket() {
        var r = await client.GetAsync("/basket/1");
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
    }
}`;
  const csPlan = `version: 1\nsource: s\nitems:\n  - {id: P1, behavior: b, expect: "returns the basket", kind: new, tests: ["dotnet:Tests.BasketApi#GetBasket"]}\n`;
  assert.deepEqual(rules("tests/BasketApi.cs", cs, csPlan), ["error-status-only@2"]);
});

function gitRepo(files: Record<string, string>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-lint-")));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  const g = (...a: string[]) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "t");
  g("config", "commit.gpgsign", "false");
  g("add", "-A");
  g("commit", "-qm", "init");
  return dir;
}

test("lint CLI: changed test files by default, explicit files and folders, plan picked up from .witness/plan.yaml", async () => {
  const dir = gitRepo({ "tests/test_old.py": "def test_old():\n    pass\n", "src/app.py": "x = 1\n" });
  const clean = await witness(dir, ["lint"]);
  assert.equal(clean.code, 0);
  assert.match(clean.stderr, /nothing to lint/);
  fs.writeFileSync(path.join(dir, "tests/test_new.py"), "def test_new():\n    assert 1\n");
  fs.writeFileSync(path.join(dir, "src/app.py"), "x = 2\n");
  const ok = await witness(dir, ["lint", "--json"]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.deepEqual(ok.json?.files, ["tests/test_new.py"]);
  const all = await witness(dir, ["lint", "tests"]);
  assert.equal(all.code, 1);
  assert.match(all.stderr, /tests\/test_old.py:1 no-assertion/);
  assert.match(all.stderr, /LINT failed · 2 file\(s\), 2 test\(s\), 1 error\(s\)/);
  fs.mkdirSync(path.join(dir, ".witness"));
  fs.writeFileSync(path.join(dir, ".witness", "plan.yaml"), PLAN);
  fs.writeFileSync(path.join(dir, "tests/test_basket.py"), 'def test_get_basket(client):\n    assert client.get("/b").status_code == 404\n');
  const planned = await witness(dir, ["lint"]);
  assert.equal(planned.code, 1);
  assert.match(planned.stderr, /error-status-only: P1 expects "200 with the items"/);
  fs.writeFileSync(path.join(dir, ".witness", "plan.yaml"), "version: 3\n");
  const badPlan = await witness(dir, ["lint"]);
  assert.equal(badPlan.code, 64);
});

test("lint: success-status-only flags a status check for an item that expects content; plan ids match their class", () => {
  const cs = `public class IndexTest {
    [Fact]
    public async Task OnPostUpdateShowsMessage() {
        var r = await client.PostAsync("/basket/update", form);
        r.EnsureSuccessStatusCode();
    }
}
public class WeakDraftTest {
    [Fact]
    public async Task OnPostUpdateShowsMessage() {
        var r = await client.PostAsync("/basket/update", form);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }
}`;
  const plan = (expect: string) => `version: 1\nsource: s\nitems:\n  - {id: P1, behavior: b, expect: "${expect}", kind: changed, tests: ["dotnet:Web.Basket.IndexTest#OnPostUpdateShowsMessage"]}\n`;
  assert.deepEqual(rules("tests/IndexTest.cs", cs, plan("the basket page shows the validation message")), ["success-status-only@2"]);
  assert.deepEqual(rules("tests/IndexTest.cs", cs, plan("200")), []);
  const py = `def test_list(client):\n    r = client.get("/items")\n    assert r.status_code == 200\n`;
  const pyPlan = `version: 1\nsource: s\nitems:\n  - {id: P1, behavior: b, expect: "200 with the three seeded items", kind: new, tests: ["pytest:tests/test_items.py::test_list"]}\n`;
  assert.deepEqual(rules("tests/test_items.py", py, pyPlan), ["success-status-only@1"]);
});
