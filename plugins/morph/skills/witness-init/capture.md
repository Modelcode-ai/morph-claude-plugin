# init: screenshots and video for UI tests

Witness's report shows each test's screenshots and video next to its result. Witness does not take
them: the tests do, while they run, and Witness collects the files. Without them a reviewer of a
`ui`, `mobile` or `desktop` suite sees only "passed". `witness check` runs one test of each such
suite and warns when it left no screenshot or video; the run report warns for every passing test
without one.

## The step

Look at: the suite's test framework and its config file (`playwright.config.ts`,
`cypress.config.js`, `wdio.conf.ts`, `conftest.py`, a base test class); the fixtures or hooks its
tests share; what the framework records today (often screenshots only on failure, video off); the
capture warning of `witness check`.

Settled: `witness check` prints `capture ok` for the suite.

Ask: whether to switch capture on for the suite. Say what it changes: one test config or fixture
file in the repo, and video makes the suite slower and its run folders larger. Example:

> **Screenshots and video.** The 36 tests in `frontend-e2e` record a screenshot only when they
> fail and no video (`frontend/playwright.config.ts:37`), so the report can't show what a passing
> test saw. I recommend switching screenshot, video and trace on for every test, only when
> `WITNESS_EVIDENCE` is set (Witness sets it; your own runs stay as they are). Other option: leave
> it off; the report will say the screens are missing. Shall I go ahead?

Default: switch it on.

The change, the same for every framework:

- Switch on the framework's own screenshot, video and trace capture for passing tests too, only
  when the `WITNESS_EVIDENCE` variable is set. Witness sets it for every suite; outside Witness the
  tests run exactly as before. Keep today's values for that case.
- Where the framework has no such switch, add one per-test hook in the shared fixtures (after
  each test, before the browser or driver closes) that saves a screenshot and, when the framework
  can record, the video.
- The files must land where Witness looks: in the runner report's attachments (Playwright), or
  in `$WITNESS_ARTIFACTS/<test>/`. `<test>` is the test's id as `witness check` lists it, without
  the `adapter:` prefix (a leading file or class part may be left out), with every character other
  than letters, digits, `_`, `.`, `@` and `-` replaced by `_`.
- One change for the whole suite, in the framework's config or its shared fixtures, never in each
  test. Add no dependency without asking.

Record: the edit itself. If the user declines, comment the suite in `witness.toml`:
`# no screenshots or video (user's choice)`.

Then run `witness check` again: it should print `capture ok` for the suite. A test that never
opens a screen (an API check in a UI suite) has nothing to record; the report still names it. If it still warns,
open the check's folder (`.witness/check/*/artifacts/`) and the runner's output folder to see where
the files went, and fix the path. The baseline run (stage 6) then shows every test's screenshots
and video in chapter 3 of its report.

### The base side

`witness run --against <branch>` runs the base's own tests, which lack this edit, so the base side
records nothing. Offer to apply it there in `[reference] setup` (add the section with only `setup`
if there is none; `--against <branch>` keeps it). When the file is otherwise the same on the base
(`git diff <branch> -- <file>` shows only this edit), copy it:

```toml
[reference]
setup = 'cp "${TARGET_CHECKOUT}/frontend/playwright.config.ts" frontend/playwright.config.ts'
```

Otherwise make the same edit with a command (`perl -pi -e ...`). Append to an existing `setup`
with `&&`.

## Examples

Short sketches; adapt names and paths to the repo, and keep its existing values in the
non-Witness branch.

**Playwright (JS/TS).** In `playwright.config.ts`; files become report attachments:

```ts
const evidence = !!process.env.WITNESS_EVIDENCE;
export default defineConfig({
  use: {
    screenshot: evidence ? "on" : "only-on-failure",
    video: evidence ? "on" : "off",
    trace: evidence ? "on" : "retain-on-failure",
  },
});
```

A project whose own `use` sets these overrides the top level: change it there too. A context a
fixture opens itself (`browser.newContext()`) gets none of this: under the same guard, pass
`recordVideo: { dir: testInfo.outputPath("videos") }` to it, and before it closes `testInfo.attach`
a `page.screenshot()` of each page, then after it closes each `page.video().path()`.

**Playwright for Python (pytest-playwright).** In `conftest.py`; the files go to the test's folder:

```python
import os, re, pytest

def witness_dir(item):
    root = os.environ.get("WITNESS_ARTIFACTS")
    if os.environ.get("WITNESS_EVIDENCE") and root:
        folder = os.path.join(root, re.sub(r"[^\w.@-]", "_", item.nodeid))
        os.makedirs(folder, exist_ok=True)
        return folder

@pytest.fixture
def browser_context_args(browser_context_args, request):
    folder = witness_dir(request.node)
    return {**browser_context_args, "record_video_dir": folder} if folder else browser_context_args

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    yield
    page, folder = item.funcargs.get("page"), witness_dir(item)
    if call.when == "call" and page and folder:
        page.screenshot(path=os.path.join(folder, "end.png"))
```

The video is written when the test's context closes.

**Playwright for Java or .NET.** Set `RecordVideoDir` (`setRecordVideoDir`) in the context options
to the test's folder, and take `page.screenshot` to it in the after-each method.

**Cypress.** Video is one file per spec. In `cypress.config.js`:

```js
const fs = require("fs"), path = require("path");
const evidence = !!process.env.WITNESS_EVIDENCE;
const dir = (title) => path.join(process.env.WITNESS_ARTIFACTS, title.replace(/[^\w.@-]/g, "_"));
module.exports = defineConfig({
  video: evidence,
  env: { WITNESS_EVIDENCE: process.env.WITNESS_EVIDENCE },
  e2e: {
    setupNodeEvents(on) {
      if (!evidence) return;
      on("after:screenshot", (d) => {
        const to = path.join(dir(d.name), "end.png");
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(d.path, to);
        return { path: to };
      });
      on("after:spec", (spec, results) => {
        for (const t of results?.video ? results.tests : []) {
          fs.mkdirSync(dir(t.title.join(" ")), { recursive: true });
          fs.copyFileSync(results.video, path.join(dir(t.title.join(" ")), "spec.mp4"));
        }
      });
    },
  },
});
```

and in `cypress/support/e2e.js`:
`afterEach(() => { if (Cypress.env("WITNESS_EVIDENCE")) cy.screenshot(Cypress.currentTest.titlePath.join(" ")); });`

**Selenium.** No video of its own; a screenshot from the teardown hook, for example pytest:

```python
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    yield
    driver, folder = item.funcargs.get("driver"), witness_dir(item)  # witness_dir as above
    if call.when == "call" and driver and folder:
        driver.save_screenshot(os.path.join(folder, "end.png"))
```

Java: `getScreenshotAs(OutputType.BYTES)` in `@AfterEach`; C#: `GetScreenshot().SaveAsFile(...)`
in `[TearDown]`. Video only when the repo already runs a Selenium Grid that records it.

**WebdriverIO.** In `wdio.conf.ts`:

```ts
afterTest: async (test) => {
  if (!process.env.WITNESS_EVIDENCE) return;
  const dir = path.join(process.env.WITNESS_ARTIFACTS!, `${test.parent} ${test.title}`.replace(/[^\w.@-]/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  await browser.saveScreenshot(path.join(dir, "end.png"));
},
```

Video needs a plugin (`wdio-video-reporter`): ask first.

**Appium.** Record the device's screen around each test: `driver.start_recording_screen()` in
setup; in teardown, write `base64.b64decode(driver.stop_recording_screen())` to
`<folder>/screen.mp4` and `driver.save_screenshot("<folder>/end.png")` (Java: `startRecordingScreen`
and `stopRecordingScreen` of `CanRecordScreen`).

**Others** (Capybara, Detox, Espresso, XCUITest, WinAppDriver): the same move, a screenshot and,
when the tool records, the video, from the after-each hook into the test's folder.
