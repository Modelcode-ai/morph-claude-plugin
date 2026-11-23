import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { parseConfig } from "../src/config.ts";
import { type Entries, fileKind, functionalWarnings, projectEntries, scanSource } from "../src/functional.ts";
import { guess, renderExample } from "../src/init.ts";
import { PKG } from "./helpers.ts";

const CLI = path.join(PKG, "testdata", "functional", "cli");

function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-kinds-"));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  return dir;
}

const CASES: [string, string, string][] = [
  ["python", "python -m pytest", "python -m pytest tests/cli"],
  ["node", "npx jest", "npx jest test/cli"],
  ["go", "go test ./...", "go test ./e2e/..."],
  ["bats", "bats test", "bats -r test/cli"],
  ["rust", "cargo test", "cargo test --test cli"],
];

describe("CLI tests: the app's built binary or command, not its functions", () => {
  for (const [stack, cmd, mixedCmd] of CASES) {
    test(`${stack}: unit excluded, cli proposed with service = [], mixed filtered`, () => {
      const unit = guess(path.join(CLI, stack, "unit"));
      assert.deepEqual(unit.suites, []);
      assert.match(unit.excluded[0]?.reason ?? "", /^unit \(/);
      const cli = guess(path.join(CLI, stack, "cli"));
      assert.deepEqual(cli.suites.map((s) => [s.cmd, s.kind, s.hostsApp]), [[cmd, "cli", true]]);
      assert.deepEqual(cli.excluded, []);
      const mixed = guess(path.join(CLI, stack, "mixed"));
      assert.deepEqual(mixed.suites.map((s) => [s.cmd, s.kind]), [[mixedCmd, "cli"]]);
      assert.equal(mixed.excluded.length, 1);
      const toml = renderExample(mixed);
      assert.match(toml, /kind = "cli"\n.*\n.*\ncmd = .*\n(# .*\n)?service = \[\] +# the tests run the app's command themselves/);
      assert.deepEqual(parseConfig(parse(toml) as Record<string, unknown>, "/x/.witness/witness.toml").suites.map((s) => s.kind), ["cli"]);
    });
  }

  test("entry points come from the manifests: console scripts, package bins, go cmd dirs, cargo bins", () => {
    assert.deepEqual(projectEntries(path.join(CLI, "python", "cli")), { names: ["itemsctl"], paths: [], funcs: ["main"], modules: ["itemsctl"] });
    const node = projectEntries(path.join(CLI, "node", "cli"));
    assert.deepEqual([node.names, node.paths], [["itemsctl"], ["bin/itemsctl.js"]]);
    assert.deepEqual(projectEntries(path.join(CLI, "go", "cli")).names, ["itemsctl"]);
    assert.deepEqual(projectEntries(path.join(CLI, "rust", "cli")).names, ["itemsctl"]);
  });

  const e: Entries = { names: ["itemsctl"], paths: ["bin/itemsctl.js"], funcs: ["main"], modules: ["itemsctl"] };
  const kindOf = (file: string, src: string) => fileKind(scanSource(file, src, { isTest: true, entries: e })!, { host: false, url: false });

  test("each stack's way of running the real command counts", () => {
    const cli: [string, string][] = [
      ["test_a.py", "import pexpect\ndef test_a():\n    child = pexpect.spawn('itemsctl list')\n    child.expect('apple')\n"],
      ["test_b.py", "from typer.testing import CliRunner\nfrom itemsctl.cli import main\nrunner = CliRunner()\ndef test_b():\n    assert runner.invoke(main, ['list']).exit_code == 0\n"],
      ["test_c.py", "def test_c(script_runner):\n    assert script_runner.run(['itemsctl', 'list']).success\n"],
      ["a.test.ts", "import { execa } from 'execa';\ntest('a', async () => { expect((await execa('node', ['./bin/itemsctl.js'])).exitCode).toBe(0); });\n"],
      ["main_test.go", "func TestMain(t *testing.T) {\n\tout, _ := exec.Command(\"./bin/itemsctl\", \"list\").Output()\n\t_ = out\n}\n"],
      ["cli.rs", "#[test]\nfn runs() {\n    let bin = env!(\"CARGO_BIN_EXE_itemsctl\");\n    assert!(std::process::Command::new(bin).status().unwrap().success());\n}\n"],
      ["cmd.rs", "#[test]\nfn cli_tests() {\n    trycmd::TestCases::new().case(\"tests/cmd/*.toml\");\n}\n"],
      ["CliTests.cs", "public class CliTests {\n  [Fact]\n  public void Lists() { var p = Process.Start(new ProcessStartInfo(\"dotnet\", \"bin/Release/itemsctl.dll list\")); p.WaitForExit(); Assert.Equal(0, p.ExitCode); }\n}\n"],
      ["CliIT.java", "class CliIT {\n  @Test void lists() throws Exception { var p = new ProcessBuilder(\"java\", \"-jar\", \"target/itemsctl.jar\", \"list\").start(); assertEquals(0, p.waitFor()); }\n}\n"],
    ];
    for (const [f, src] of cli) assert.equal(kindOf(f, src), "cli", f);
  });

  test("calling the command's functions, or running some other program, is a unit test", () => {
    const unit: [string, string][] = [
      ["test_a.py", "from itemsctl.cli import main\ndef test_a():\n    assert main(['list']) == 0\n"],
      ["test_b.py", "import subprocess\ndef test_b():\n    subprocess.run(['git', 'init'])\n"],
      ["test_c.py", "from click.testing import CliRunner\nfrom itemsctl.cli import helper\ndef test_c():\n    CliRunner().invoke(helper, [])\n"],
      ["a.test.js", "const { execSync } = require('child_process');\ntest('a', () => { execSync('git status'); });\n"],
      ["x_test.go", "func TestX(t *testing.T) {\n\texec.Command(\"git\", \"status\").Run()\n}\n"],
      ["strings.bats", "load helpers\n\n@test \"trims\" {\n  run trim '  a '\n  [ \"$output\" = a ]\n}\n"],
    ];
    for (const [f, src] of unit) assert.equal(kindOf(f, src), null, f);
  });

  test("check warns about a CLI suite whose files only call functions", () => {
    const cfg = parseConfig(parse(`version = 1\n[[suite]]\nname = "u"\nkind = "cli"\nadapter = "bats"\ncwd = "bats/unit"\ncmd = "bats test"\n[[suite]]\nname = "c"\nkind = "cli"\nadapter = "bats"\ncwd = "bats/cli"\ncmd = "bats test"\n`) as Record<string, unknown>, path.join(CLI, ".witness", "witness.toml"));
    assert.deepEqual(functionalWarnings(cfg).map((w) => w.suite), ["u"]);
  });
});

describe("desktop and mobile: accepted, proposed with a note about the driver", () => {
  const kindOf = (file: string, src: string) => fileKind(scanSource(file, src, { isTest: true })!, { host: false, url: false });
  test("signals per driver", () => {
    const desktop: [string, string][] = [
      ["app.spec.ts", "import { _electron as electron, test } from '@playwright/test';\ntest('opens', async () => { const app = await electron.launch({ args: ['.'] }); await app.firstWindow(); });\n"],
      ["test_win.py", "from pywinauto.application import Application\ndef test_notepad():\n    Application().start('notepad.exe')\n"],
      ["CalcTests.cs", "using OpenQA.Selenium.Appium.Windows;\npublic class CalcTests {\n  [Fact]\n  public void Adds() { var s = new WindowsDriver<WindowsElement>(new Uri(\"http://127.0.0.1:4723\"), o); }\n}\n"],
      ["MainViewTest.java", "import org.testfx.framework.junit5.ApplicationTest;\nclass MainViewTest extends ApplicationTest {\n  @Test void click() { clickOn(\"#ok\"); }\n}\n"],
    ];
    for (const [f, src] of desktop) assert.equal(kindOf(f, src), "desktop", f);
    const mobile: [string, string][] = [
      ["login.e2e.js", "describe('login', () => { it('shows', async () => { await device.launchApp(); await expect(element(by.id('w'))).toBeVisible(); }); });\n"],
      ["test_app.py", "from appium import webdriver\nfrom appium.options.android import UiAutomator2Options\ndef test_opens():\n    webdriver.Remote('http://127.0.0.1:4723', options=UiAutomator2Options())\n"],
      ["MainActivityTest.kt", "import androidx.test.espresso.Espresso.onView\nclass MainActivityTest {\n  @Test fun shows() { onView(withId(R.id.title)) }\n}\n"],
      ["AppUITests.swift", "import XCTest\nfinal class AppUITests: XCTestCase {\n  func testLaunch() { let app = XCUIApplication(); app.launch() }\n}\n"],
      ["app_test.dart", "import 'package:integration_test/integration_test.dart';\nvoid main() {\n  IntegrationTestWidgetsFlutterBinding.ensureInitialized();\n  testWidgets('counter', (t) async {});\n}\n"],
    ];
    for (const [f, src] of mobile) assert.equal(kindOf(f, src), "mobile", f);
  });

  test("init: Electron, androidTest, Maestro, Flutter and Detox projects get their kind and the driver note", () => {
    const g = guess(repo({
      "package.json": JSON.stringify({ devDependencies: { "@playwright/test": "1", detox: "20", jest: "29" } }),
      "playwright.config.ts": "export default defineConfig({ testDir: './e2e' });\n",
      "e2e/app.spec.ts": "import { _electron as electron, test } from '@playwright/test';\ntest('opens', async () => { const app = await electron.launch({ args: ['.'] }); });\n",
      ".detoxrc.js": "module.exports = { testRunner: { args: { config: 'mobile/jest.config.js' } } };\n",
      "mobile/login.test.js": "it('logs in', async () => { await device.launchApp(); });\n",
      "src/sum.test.js": "test('sum', () => { expect(1 + 1).toBe(2); });\n",
      "android/build.gradle": "",
      "android/gradlew": "",
      "android/app/build.gradle": "",
      "android/app/src/androidTest/java/com/x/MainTest.kt": "import androidx.test.espresso.Espresso.onView\nclass MainTest {\n  @Test fun shows() { onView(withId(1)) }\n}\n",
      ".maestro/login.yaml": "appId: com.example.app\n---\n- launchApp\n- tapOn: Login\n",
      "app/pubspec.yaml": "name: app\n",
      "app/integration_test/app_test.dart": "import 'package:integration_test/integration_test.dart';\nvoid main() {\n  testWidgets('counter', (t) async {});\n}\n",
    }));
    const by = Object.fromEntries(g.suites.map((s) => [s.name, [s.kind, s.cmd]]));
    assert.deepEqual(by, {
      playwright: ["desktop", "npx playwright test"],
      detox: ["mobile", "npx detox test"],
      "android-tests": ["mobile", "./gradlew connectedAndroidTest"],
      "flutter-integration": ["mobile", "flutter test integration_test"],
      maestro: ["mobile", "maestro test --format junit --output ${WITNESS_REPORT_DIR}/maestro.xml .maestro"],
    });
    assert.deepEqual(g.excluded.map((e) => `${e.path}: ${e.reason}`), ["android: no tests found", ". (jest): unit (no app host, HTTP client, browser driver or run of the app's command)"]);
    const toml = renderExample(g);
    assert.equal((toml.match(/# kind = "mobile": model the emulator or device and its driver \(Appium server, adb\) as a \[\[dependency\]\] or \[\[service\]\]/g) ?? []).length, 4);
    assert.match(toml, /# kind = "desktop": model the driver/);
    assert.equal(parseConfig(parse(toml) as Record<string, unknown>, "/x/.witness/witness.toml").suites.length, 5);
  });
});

describe("init leaves services that no suite uses commented out", () => {
  test("every suite hosts the app: the service is a comment with the reason", () => {
    const g = guess(path.join(CLI, "python", "cli"));
    g.services.push({ name: "web", cwd: ".", start: "npm start", ready: "${self.url}/", why: "start script in package.json" });
    const toml = renderExample(g);
    assert.match(toml, /^# start script in package\.json; commented out: every proposed suite starts the app itself, so nothing uses it\n# \[\[service\]\]\n# name = "web"/m);
    assert.equal(parseConfig(parse(toml) as Record<string, unknown>, "/x/.witness/witness.toml").services.length, 0);
  });

  test("a suite that tests the running app keeps it", () => {
    const g = guess(path.join(PKG, "testdata", "functional", "vitest", "functional"));
    g.services.push({ name: "web", cwd: ".", start: "npm start", ready: "${self.url}/", why: "start script in package.json" });
    assert.match(renderExample(g), /^\[\[service\]\]\nname = "web"/m);
  });
});
