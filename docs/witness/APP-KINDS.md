# Witness app kinds

## TL;DR

A suite's `kind` says how its tests drive the app: `api`, `ui`, `cli`, `desktop` or `mobile`.
`api`, `ui` and `cli` are supported end to end: `init` finds them, `check` warns about suites that
don't fit, and the conformance kit proves them (`FRAMEWORKS.md`). `desktop` and `mobile` are
accepted in config, detected by `init`, and carried to `status.json`, CTRF and the report. Running
them still needs the driver or emulator modelled by hand as a `[[service]]` or `[[dependency]]`.
Kit projects and device handling come in the full release.

`kind` changes nothing at run time. It is a label for the reader and the reason `init` proposes a
suite at all: a test that drives the app from outside is functional; a test that calls the app's
functions is a unit test and stays with the project's own scripts.

## api

What counts: tests that send HTTP requests to the app, hosted in the test process
(`WebApplicationFactory`, FastAPI `TestClient`, supertest, `MockMvc`, `httptest` with the real
router) or at a URL. Mocked HTTP and direct repository or database calls don't count.

Model: a `[[service]]` with `start` and a `ready.http` check, and a suite without a `service` key
(it gets `WITNESS_<SERVICE>_URL`), or `service = []` when the tests host the app themselves.

## ui

What counts: tests that drive a browser: Playwright, Cypress, Selenium, Capybara, Dusk, Panther,
chromedp.

Model: the same as `api`. Playwright's `webServer` means the tests start the app: `service = []`.

## cli

What counts: tests that run the app's built binary or real command entry point and check its
output, exit code or files. The classifier needs both a process call and something that names the
app's command:

| stack | process call | names the app |
| --- | --- | --- |
| Python | `subprocess.*`, `pexpect`, `asyncio.create_subprocess_*`, `os.system` | a console script from `pyproject.toml`/`setup.cfg`/`setup.py`, `-m <pkg>` with a `__main__.py`, a path under `bin/`, `dist/` and the like |
| Python | click or typer `CliRunner().invoke(f)` | `f` is the function a console script points at (or `cli`/`main`/`app` when there is none) |
| Python | pytest-console-scripts `script_runner.run` | always |
| Node | `child_process`, `execa`, `cross-spawn`, `zx` imported | a `package.json` `bin` name or file |
| Go | `exec.Command` | `go run`/`go build`, a built binary path, a `cmd/<name>` or module name |
| Go | `testscript`, `gexec.Build` | always |
| Rust | `Command::cargo_bin`, `cargo_bin!`, `env!("CARGO_BIN_EXE_...")`, `trycmd`, `snapbox::cmd` | always |
| .NET | `Process.Start`, `ProcessStartInfo`, CliWrap | a `.dll`, `.exe` or built-binary path |
| Java | `ProcessBuilder`, `Runtime.exec` | `-jar`, a `.jar` path or the `pom.xml` artifactId |
| bats | each command a test runs | a path, a variable such as `$BIN`, a known name, or a bare name after the file or a file it `load`s changed `PATH` |

Calling `main(["list"])` directly, or running some other program (`git`, `docker`), is a unit
test. A file that runs the command and also sends HTTP requests is `api`: it starts the app and
calls it.

Model: usually nothing. `init` sets `service = []` because the tests run the command themselves.
When the command is a client of a service (the kit's `kit-items` reads the kit app), drop
`service = []` so witness starts the service and the tests get `WITNESS_<SERVICE>_URL`. When the
binary must be built first, put the build in the suite's `cmd` (`cargo build && cargo test --test
cli`) or in a service `setup` that later suites share.

Adapters: pytest, jest, vitest, mocha, go and the JVM and .NET adapters work as they are. `bats` is
a new preset: JUnit through `--report-formatter junit`, selection with `--filter`, the per-test
timeout through `BATS_TEST_TIMEOUT`; it has no listing, so witness lists from the last report.

Rust: `cargo test` writes no JUnit, so `init` proposes a `generic` suite that records one row from
the exit code. For per-test rows use cargo-nextest with a JUnit profile:

```toml
# .config/nextest.toml
[profile.default.junit]
path = "junit.xml"
```

```toml
[[suite]]
name = "cli"
kind = "cli"
adapter = "generic"
service = []
cmd = "cargo nextest run --test cli"
report = "target/nextest/default/junit.xml"
```

I did not add a `cargo test` adapter: `--format json` is nightly-only (or `RUSTC_BOOTSTRAP=1`), and
`cargo2junit` is another tool to install. nextest is the common choice and needs no adapter.

What is missing: selecting single Rust tests through the generic adapter (needs a `select`
template), and a `node --test` preset (works today as `generic` with `--test-reporter=junit
--test-reporter-destination=$WITNESS_REPORT_DIR/node.xml`).

## desktop

What counts: tests that drive a desktop app through its window: Playwright `_electron.launch`,
Spectron, WebdriverIO's Electron service, WinAppDriver or Appium with `platformName` Windows or Mac,
FlaUI, pywinauto, TestFX.

Model with today's config:

```toml
[[dependency]]
name = "winappdriver"
check = "curl -fsS http://127.0.0.1:4723/status"
start = "start-process 'C:/Program Files/Windows Application Driver/WinAppDriver.exe'"
timeout = "60s"

[[suite]]
name = "desktop"
kind = "desktop"
adapter = "dotnet"
service = []
cmd = "dotnet publish src/App -c Release -o .witness/cache/app && dotnet test tests/App.UiTests"
env = { APP_PATH = "${CHECKOUT}/.witness/cache/app/App.exe" }
```

Electron with Playwright needs no driver: the test launches the app. Its suite needs only the
built app.

The dependency only has to answer its check; witness does not start the app under test, the test
does (through the driver).

What is missing: a kit project, a display on CI (Xvfb on Linux), window screenshots as artifacts,
and a place for a build step that several suites share without a long-running service.

## mobile

What counts: Appium with `platformName` Android or iOS (or the Python client's Android/iOS
options), Detox, Espresso and UiAutomator under `src/androidTest`, XCUITest
(`XCUIApplication()`; assumed iOS), Maestro flows, Flutter `integration_test`, `flutter_driver` and
Patrol.

`init` proposes:

| project | adapter | command |
| --- | --- | --- |
| `src/androidTest` in a Gradle module | junit-gradle, `report = "**/build/outputs/androidTest-results/connected/**/*.xml"` | `./gradlew connectedAndroidTest` |
| Detox (its config's test folder, else `e2e/`) | jest | `npx detox test` |
| `*UITests/` Swift files | generic, exit code only | `xcodebuild test -scheme <project> -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:<target>` |
| Maestro flows (`.maestro/` or YAML with `appId:` and `launchApp`) | generic, JUnit | `maestro test --format junit --output ${WITNESS_REPORT_DIR}/maestro.xml <dir>` |
| `integration_test/` next to `pubspec.yaml` | generic, exit code only | `flutter test integration_test` |

These commands are starting points; none has been run under witness yet.

Model the emulator and the driver with a ready check:

```toml
[[dependency]]
name = "emulator"
check = "adb shell getprop sys.boot_completed | grep -q 1"
start = "emulator -avd witness -no-window -no-audio &"
timeout = "180s"

[[service]]
name = "appium"
start = "appium --port ${PORT}"
ready = { http = "${self.url}/status", timeout = "60s" }

[[suite]]
name = "mobile"
kind = "mobile"
adapter = "pytest"
service = ["appium"]
cmd = "python -m pytest tests/mobile"
env = { APPIUM_URL = "${appium.url}" }
```

What is missing: a kit project, device and simulator lifecycle (boot, wipe, install the build),
iOS on CI, `.xcresult` to JUnit, and screenshots and videos as artifacts.
