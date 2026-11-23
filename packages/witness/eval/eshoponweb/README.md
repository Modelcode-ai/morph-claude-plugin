# eShopOnWeb: standalone witness evaluation (ENG-10540, ENG-10541)

## Summary

Witness `1.0.0-mvp` (branch `eng-10541`, commit 6bacb7e) was run on a clean upstream clone of eShopOnWeb (`aed6281`). Every build, test and app run went through the `mcr.microsoft.com/dotnet/sdk:11.0` Docker image, because the host has only SDK 10.

- **ENG-10540, per-test CTRF from existing suites: met.** CTRF counts match the TRX files and dotnet's own summary exactly, test by test, for all 4 test projects (288 tests plus 1 HTTP smoke check).
- **ENG-10540, failures get the right cause: met for 9 of 10 injected faults.** The miss: when the app's port is already held by another process, witness probed that process and reported `ready_timeout` (HTTP 404) after 3 minutes, not `port_in_use`.
- **ENG-10541, an agent with only the skills plans and writes tests for a real change: met.** I followed `test-change` (plan, write, verify) for a real bug fix in the basket page. Plan check, lint, the selected run and the full verify run with `--against` all worked. Reverting the fix made the new test fail with the expected message. Caveat: I followed the skills myself; no separate agent session ran them.
- The rough edges witness hit are listed under [Witness bugs and rough edges](#witness-bugs-and-rough-edges), each with the exact output.

## Setup

| File | What it is |
| --- | --- |
| `witness/witness.toml` | The config since ENG-10574: 1 service (`web`) and the 3 functional suites (`functional`, `publicapi`, `e2e`). See [Functional scope and Playwright e2e](#functional-scope-and-playwright-e2e-eng-10574-phase-1). The earlier 5-suite config, which `witness init` produced and I edited by following the `init` skill, is in `patches/0001`. |
| `witness/dotnet` | A wrapper that runs `dotnet` in the SDK 11 image. It mounts the checkout at its own path, so the host paths witness passes (`--results-directory`) also work inside the container. It also forwards `WITNESS_*` and app env vars, publishes `${PORT}`, and removes the container on SIGTERM. |
| `witness/dotnet-host` | A wrapper that runs `dotnet` from a host SDK 11 at `$DOTNET_HOST_ROOT`, with `--artifacts-path .witness/cache/host-artifacts`, so host builds never share `bin/` or `obj/` with container builds. The `e2e` suite uses it. |
| `witness/plan.yaml` | The test plan for the change in step 4. |
| `compare.py` | Compares a run's CTRF counts with its TRX files and with dotnet's `total:` line: `python3 compare.py <run dir>`. |
| `patches/` | The local commits in `~/work/witness-targets/eShopOnWeb-witness-eval`. 0001-0007 are on branch `witness-eval`: config, TrxReport package, the change, plan, tests, wrapper fix, plan fix. 0008-0009 are on branch `eng-10574`: the `BrowserFixture` change and the functional-scope config. |

To reproduce: `git am patches/*.patch` on a clone of eShopOnWeb at `aed6281`, then `witness check` and `witness run`. This needs Docker, the SDK 11 image and the `eshop-nuget` volume. Since 0009 it also needs a host SDK 11 named in `.witness/.env` (`DOTNET_HOST_ROOT=...`) and Chromium 1248 (see the e2e section).

## Results

| Step | Command | Result | Time |
| --- | --- | --- | --- |
| init | `witness init` | Found 6 dotnet suites (MTP detected) and 2 services (Web, PublicApi). It did not know about `UseOnlyInMemoryDatabase` or the health-check URL; I added both from `src/Infrastructure/Dependencies.cs` and `src/Web/Program.cs`. | 0.1s |
| check | `witness check` | `CHECK ok`: Web built and became ready in 3s. Tests listed: unit 87, integration 3, functional 54, publicapi 107. smoke-http passed. | 66s (first build) |
| run, clean upstream | `witness run --label baseline-1` | `VERDICT error · 146 passed`. Cause `report_missing` on publicapi, with the hint to add `Microsoft.Testing.Extensions.TrxReport`. `check` had passed and did not warn about this. | 33s |
| follow the hint literally | add the `PackageReference` only | `error`; evidence `error NU1010 ... do not define a corresponding PackageVersion` (the repo uses central package management) | 3s |
| add the PackageVersion | `witness run --suite publicapi` | First `report_missing`, evidence `No test projects were found.` (dotnet keeps that state once after a failed restore). The rerun passed with 144 tests. | 5s |
| baseline | `witness run --label baseline-2` | `VERDICT passed · 289 passed, 0 failed · 5 suite(s)` | 47s |
| counts vs TRX vs dotnet | `compare.py` on the run dir | unit 87/87/87, integration 3/3/3, functional 54/54/54, publicapi 144/144/144 (CTRF / TRX `UnitTestResult` / `total:` line). Ids are unique; publicapi has 37 repeated display names (data rows), and they still get distinct ids. | - |
| fault: missing env | `required = ["ESHOP_EVAL_TOKEN"]` | `mistrial`, `missing_env`, exit 3, names the var and the `.env` line to add | 1s |
| fault: wrong start | `--project src/Web/Wbe.csproj` | `mistrial`, `exited_before_ready`, evidence `The provided file path does not exist: src/Web/Wbe.csproj.`, exit 3 | 2s |
| fault: wrong ready URL | `/home_page_health_chek`, timeout 20s | `mistrial`, `ready_timeout`, evidence `not ready after 20s: HTTP 404`, exit 3 | 22s |
| fault: port pool taken | `ports = "5199"` with 5199 in use | `mistrial`, `port_in_use`, `try: lsof -nP -iTCP:5199`, exit 3 | 0s |
| fault: app port taken | app hard-coded to 5199, which another process holds | **wrong cause**: `ready_timeout`, `HTTP 404` from the other process, after the full 3m. Expected `port_in_use`. | 181s |
| fault: hanging test | `Thread.Sleep(10 min)` test, `stall_timeout = "45s"` | `stalled`, exit 4, container removed. One suite-level result; the hung test is not named. | 52s |
| fault: service dies | `docker kill` of Web during a 30s HTTP suite | `mistrial`, `service_died`, `exited with code 137`, exit 3, within 1s | 12s |
| fault: service freezes | `docker pause` of Web | `mistrial`, `service_died`, `readiness check failed 3 times in a row` | 28s |
| fault: corrupt report | the TRX truncated to 1500 bytes once | `report_unreadable`, then 3 per-test reruns. `passed`, every test `obtained: per-test-rerun`. | 34s |
| fault: compile error | syntax error in `Basket.cs` | `error`, exit 2, evidence `Basket.cs(13,59): error CS1525`. The cause is `report_missing`, not a build cause. | 8s |
| interrupt | SIGINT during functional | `interrupted`, exit 5, container removed | 4s |
| up / reuse / down | `witness up`, `run --suite smoke-http`, `witness down` | reused the running Web; `down` removed the container | 7s + 0.1s |
| e2e (Playwright) | extra suite `tests/EndToEndTests` | `failed`: 2 tests `status_detail: error` (`BrowserFixture ... Web app did not start within 90 seconds`), 1 skipped. Not set up: it needs browsers, OS packages and an HTTPS dev cert inside the container. | 105s |
| AppHostTests | not run | They need Aspire and Docker-in-Docker for SQL Server. | - |

### Step 4: test a real change with the skills

The change (commit `e9d3947`) fixes a real bug. Posting a negative quantity to `/basket/update` rendered "Basket is empty" and lost the validation message, because `OnPostUpdate` returned before loading the basket. The fix also changes the message "Quantity must be bigger than 0" to "Quantity must be 0 or more", because 0 is allowed (it removes the line).

| Skill step | Command | Result | Time |
| --- | --- | --- | --- |
| plan | `.witness/plan.yaml`: 5 items (P1 changed, P2 to P5 parity); `witness plan check --draft` | `PLAN ok · 5 test ref(s): 3 found, 2 missing` (2 `not written yet` warnings) | 31s |
| write | 2 xUnit tests in `tests/FunctionalTests/Web/Pages/Basket/IndexTest.cs`, written with the existing `WebPageHelpers.PostFormAsync` and `GetId` helpers; `witness lint` | `LINT ok · 2 file(s), 5 test(s)` | <1s |
| lint, weak draft | 3 deliberately bad tests | caught `error-status-only` (matched to P1), `swallowed-exception`, `long-sleep 10s`. **Missed** a test whose only check is `EnsureSuccessStatusCode()` for an item that expects specific page content. | <1s |
| plan check | `witness plan check` | `PLAN ok · 5 found`; printed the `--select` command | 21s |
| run selected | the printed `witness run --select 'functional:dotnet:...'` (5 ids) | `VERDICT passed · 5 passed, 0 failed · 1 suite(s)` | 7s |
| verify-1 | `witness run --label verify-1 --against 5f331db` | Target passed with 291 tests. Origin `error`: every dotnet suite was `report_missing`, with evidence `duration: 788ms`. Triage: the origin worktree is in `/var/folders/...`, but its `--results-directory` is the target's run dir, which the container did not mount. I fixed the wrapper to also mount `$WITNESS_RUN_DIR`, and made a base branch `witness-eval-base` (5f331db plus that fix), because worktree mode runs the ref's own copy of `.witness/dotnet`. | 2m17s |
| verify-2 | `witness run --label verify-2 --against witness-eval-base` | **`VERDICT passed · 291 passed, 0 failed · 5 suite(s) · against witness-eval-base: origin passed, 0 differ · 1m33s`**. Parity: 289 same, 2 target_only (the new tests). | 94s |
| do the tests bite? | fix reverted, plan tests run | `VERDICT failed · 4 passed, 1 failed`: P1 failed with `Not found: "Quantity must be 0 or more"`. P2 passed, because the old code did not save on a bad update either, so I moved P2 to `parity` in the plan. | 11s |
| do the tests bite? (wrong fix) | negative quantities clamped to 0 | `VERDICT failed · 0 passed, 2 failed` (P1 and P2) | 13s |
| against upstream | `witness run --suite unit --against main` | Origin `error`: `bash: .witness/dotnet: No such file or directory` (exit 127), reported as `report_missing`. The target summary gains `1 other`. | 9s |

Final report (the `test-change` format): VERDICT `passed` (run `r-20261123-090444-552e`). P1 `IndexTest#OnPostUpdateNegativeQuantityShowsBasketAndValidationMessage` passed. P2 `#OnPostUpdateNegativeQuantityLeavesBasketUnchanged` passed. P3 `#OnPostUpdateTo50Successfully` passed. P4 `#OnPostUpdateTo0EmptyBasket` passed. P5 `CheckoutTest#SucessfullyPay` passed. Config changes: the TrxReport package, and the wrapper mounting the run dir. Not covered: the e2e and AppHost suites.

## Witness bugs and rough edges

Ordered by how much each one misleads an agent.

1. **The app's port held by another process reads as `ready_timeout`.** When the start command binds a fixed port (no `${PORT}`) and something already listens there, the readiness probe talks to that other process. Witness waited 3m, then printed `cause: ready_timeout ... evidence: not ready after 3m00s: HTTP 404` with `try: raise ready.timeout`. The progress line also said `starting on port 58123`, a port the service never used. Fix: before start, probe the ready URL's port; if it already answers, fail with `port_in_use`.
2. **`ready_timeout` on a steady 404 is `retryable` and suggests raising the timeout.** A 404 that persists means a wrong URL. Raising the timeout or retrying (the triage skill's step 2) costs 20s to 3m and cannot help.
3. **`--against` in worktree mode runs the ref's copy of the files the config references** (here `.witness/dotnet`), with the target's `witness.toml`. A ref that predates them fails with `bash: .witness/dotnet: No such file or directory`, reported as `report_missing` instead of `bad_config` or `setup_failed`. Fix: copy the target's `.witness/` (except runs) into the worktree, or diagnose exit 127 as a setup problem.
4. **Weak evidence when no report appears and nothing in the log looks like an error.** The origin diagnosis said `evidence: duration: 788ms`. dotnet's log had the useful line, `In process file artifacts produced: - /Users/.../against/reports/unit/root_...trx`, which shows the TRX was written to a path witness then found empty (inside a container). Witness could parse that line and say "report written to X but not found there".
5. **Worktree-mode parity cannot show that a new test fails on the base.** The ref runs its own tests, so new tests are always `target_only`. I needed a manual revert to show that P1 catches the bug and that P2 does not. Suggestion: an option to run the target's test files against the base code, plus a plan-check warning when a `new` or `changed` item's tests pass on the base.
6. **Synthetic suite-level rows from the origin pollute the target's summary.** `dotnet:(suite unit)` from the origin is added to the target's `tests[]` as `other/missing/origin_only`. The VERDICT then says `87 passed ... 1 other` for a run whose target ran 87 tests.
7. **`witness check` passes when a suite cannot write a report.** On upstream, check listed 107 publicapi tests and printed `CHECK ok`. The `report_missing` and TrxReport hint only appeared on the first `run`. The adapter already knows the mode is `mtp-none` at check time.
8. **The TrxReport hint ignores central package management.** `add <PackageReference Include="Microsoft.Testing.Extensions.TrxReport" />` alone fails with `NU1010`. With `ManagePackageVersionsCentrally` set, the hint must also name a `<PackageVersion>` in `Directory.Packages.props`.
9. **A build failure is reported as `report_missing`.** Its `try` says `check that suite unit writes its report (adapter args, or set report = "<glob>")`. The evidence line (`error CS1525`) is right, but the cause and `try` send an agent to the report settings. Witness also lists tests after a build failure, which cannot work. A compile error should get a build cause (or `setup_failed`) with no report advice.
10. **A hung suite gets one suite-level result and no test name.** For dotnet on MTP the `try` suggests `set per_test_timeout`, but the dotnet adapter returns no per-test timeout flag for MTP, so that advice does nothing. xunit v3's long-running-test report, or a hang dump, could name the test.
11. **Boot failure of a service blocks suites that don't need it.** `unit`, `integration`, `functional` and `publicapi` have `service = []`, yet all were `skipped · not run: exited_before_ready` when Web failed.
12. **A fixture-only failure counts as `failed`.** In e2e, every failure was `status_detail: error` (the class fixture threw), yet the outcome was `failed` with no diagnosis. It reads like a test failure, though no test ran. The suite line says `2 error` while the VERDICT says `2 failed`, which is also inconsistent.
13. **Lint misses status-only success checks.** A test whose only check is `response.EnsureSuccessStatusCode()`, for a plan item that expects page content, passes `witness lint`. `error-status-only` covers 4xx/5xx only, and `no-assertion` does not fire.
14. **`error-status-only` matched a test in a different class.** It matched `WeakDraftTest.OnPostUpdate...` to plan item P1, whose id names `IndexTest`, because matching uses only the last id segment (a known gap, confirmed here).
15. **Minor:**
    - The VERDICT counts a suite-level error as `failed` (`0 passed, 1 failed`) while the suite line says `1 error`.
    - CTRF `name` equals the id, with no display name.
    - `filePath` is empty for dotnet.
    - xunit v3 ids keep escaped quotes (`(email: \"demouser@eshop.test\", ...)`).
    - Per-test reruns cost about 6s each in Docker, so an unreadable publicapi report means about 11 minutes of reruns.

These held up and need no change:

- Process-group teardown with Docker: no container was left running after any run in this evaluation, including kill, pause, stall and SIGINT.
- Setup caching (`skipped (inputs unchanged)`).
- `up`/`down` reuse.
- `--select` with suite-qualified ids.
- Per-test reruns after a corrupt TRX.
- Exit codes 0, 1, 2, 3, 4 and 5, each as the contract says.

## Re-run after the review fixes (2026-11-23)

Witness at the tip of `eng-10541` after the review pass (see `NOTES.md`, "Review and fix pass"), same
eval worktree, same Docker setup. Each fault was injected, run, and reverted; `git status` in the eval
worktree was clean afterwards and no `witness-dn-*` container was left running after any step.

| Step (bug # above) | Command | Before | After | Time |
| --- | --- | --- | --- | --- |
| baseline | `witness run --label fix-baseline` | passed, 289 | `VERDICT passed · 291 passed, 0 failed · 5 suite(s)` (291 = 289 + the 2 new plan tests) | 35s |
| app port taken (1) | start and ready URL fixed to 5199, `python3 -m http.server 5199` holding it | `ready_timeout` after 181s | `mistrial`, `port_in_use`, evidence `port 5199 (in ready.http ...) already accepts connections before web started`, `try: lsof -nP -iTCP:5199` | 1s |
| wrong ready URL (2) | `/home_page_health_chek`, timeout 180s | `ready_timeout`, retryable, "raise ready.timeout" | `ready_timeout`, not retryable, evidence `... answered HTTP 404 for 30s: the app is up but this URL is not its health check`, `try: ... fix ready.http` | 34s |
| compile error (9) | `int broken = ;` in `Basket.cs` | `report_missing` + report advice, listing attempted | `error`, `setup_failed`, evidence `Basket.cs(13,72): error CS1525`, no listing, no reruns | 4s |
| `--against main` (3, 6) | `witness run --suite unit --against main` | origin `error` (`.witness/dotnet: No such file or directory`), target summary `1 other` | `copied the target's .witness/ (config helpers) into the worktree`; origin passed, parity 87 same; `VERDICT passed · 87 passed, 0 failed` | 20s |
| no TRX reporter (7, 8) | `witness check --against main --suite publicapi` | `CHECK ok` | `CHECK failed`: `report_missing` with the hint to add the `PackageReference` and a `<PackageVersion ...>` to `Directory.Packages.props` (CPM detected) | 16s |
| wrong start project (11) | `--project src/Web/Wbe.csproj` | every suite skipped | `VERDICT mistrial · 290 passed`: unit 87, integration 3, functional 56, publicapi 144 ran; only smoke-http skipped (`not run: service web exited_before_ready`) | 28s |
| hanging test (10) | `Thread.Sleep(10 min)` test, `stall_timeout = "45s"` | `stalled`, `0 passed, 1 failed`, `try: set per_test_timeout` | `stalled`, `0 passed, 0 failed · 1 error`; try: HangDump (`--hangdump --hangdump-timeout 5m`) and `--select` to narrow down; no per_test_timeout advice | 52s |
| e2e fixture errors (12) | `tests/EndToEndTests` suite | `failed`, `2 failed`, no diagnosis | `error`, `setup_failed`, evidence `Class fixture type '...BrowserFixture' threw in InitializeAsync · System.TimeoutException : Web app did not start within 90 seconds.`; VERDICT `0 failed · 2 error · 1 skipped` | 97s |
| weak draft lint (13, 14) | `witness lint WeakDraftTest.cs` (a `WeakDraftTest` class reusing P1's method name, and an `IndexTest` test for P2 with only `EnsureSuccessStatusCode()`) | P1 matched in the wrong class; status-only test passed | `WeakDraftTest` no longer matched to P1; `status-only: P2 expects "GET /basket ... shows the item with quantity 1 ..." but ... only checks the status code` | <1s |
| verify | `witness run --label fix-verify --against witness-eval-base` | passed, 289 same, 2 target_only | same result: `VERDICT passed · 291 passed · against witness-eval-base: origin passed, 0 differ` | 80s |
| plan | `witness plan check`, then the printed `--select` run | `PLAN ok · 5 found`; 5 passed | same | 21s + 6s |
| SIGINT | Ctrl-C during functional | interrupted, exit 5 | same; no container left | 4s |

Still open from the list above: 4 is improved only when the framework names the report path in its
log (dotnet does); 5 (new tests always `target_only` in worktree mode); 10 (the hung test is still not
named without HangDump); 15 (display names, `filePath` for dotnet, escaped quotes in xunit v3 ids,
rerun cost).

## Functional scope and Playwright e2e (ENG-10574, phase 1)

### Summary

- **Scope.** The earlier runs counted 291 tests, but `unit` and `integration` are not functional tests, and `smoke-http` repeated the `web` ready check. The config now has only the functional suites: `functional` (56, in-process WebApplicationFactory), `publicapi` (144, in-process API) and `e2e` (3, Playwright .NET).
- **e2e runs and passes.** `witness run`: `VERDICT passed · 202 passed, 0 failed · 1 skipped · 3 suite(s) · 24s` (run `r-20261123-105002-ede6`). The skipped test is the repo's intentional failure demo.
- **The app runs in Docker; Playwright and Chromium run on the host.** The `web` container publishes its port on `127.0.0.1`. The e2e suite builds with a host SDK 11 and gets `E2E_BASE_URL = "${web.url}"`.
- **Failure artifacts are captured.** With the demo's `Skip` removed, `artifacts.json` lists the screenshot, trace and video under the failing test's id (run `r-20261123-104806-533e`). This needed one Witness fix (commit `426711c`).

### How e2e runs

```toml
[[suite]]
name = "e2e"
adapter = "dotnet"
cwd = "."
cmd = ".witness/dotnet-host test --project tests/EndToEndTests/EndToEndTests.csproj"
service = ["web"]
env = { E2E_BASE_URL = "${web.url}" }
timeout = "10m"
```

The `web` service is unchanged: `.witness/dotnet run ... --urls http://0.0.0.0:${PORT}` in the SDK 11 image, published on `127.0.0.1:${PORT}`, ready on `/home_page_health_check`. `[env] required = ["DOTNET_HOST_ROOT"]`; `.witness/.env` (gitignored) sets it to the host SDK 11 root. Without it the run stops at once: `mistrial · missing_env · missing: DOTNET_HOST_ROOT`.

One-time host setup:

```bash
export DOTNET_HOST_ROOT=<sdk 11 root>
.witness/dotnet-host build tests/EndToEndTests/EndToEndTests.csproj
# Microsoft.Playwright 1.64.1 wants chromium 1248 (.playwright/package/browsers.json); no pwsh needed
B=.witness/cache/host-artifacts/bin/EndToEndTests/debug/.playwright
$B/node/darwin-arm64/node $B/package/cli.js install chromium
```

The install took 10s and put `chromium-1248` and `chromium_headless_shell-1248` in `~/Library/Caches/ms-playwright`. The cached revisions (1208, 1217, 1223) did not match.

`BrowserFixture` change (patch 0008), kept minimal:

- `E2E_BASE_URL` set: `BaseUrl` is that URL and the fixture does not start the app. Unset: it runs `dotnet run` at `https://localhost:5001` as before.
- `WITNESS_ARTIFACTS` set: the artifacts root is that folder, and each test writes to `<root>/<Class>#<method>/` (`failure.png`, `trace.zip`, `video/*.webm`), using xunit's `TestContext.Current.TestClass.TestClassName`. Unset: `TestResults/PlaywrightArtifacts/<test>-<timestamp>/` as before.

### HTTP, HTTPS and the Secure cookie

The app is served over plain HTTP at `http://127.0.0.1:<port>`. Nothing broke:

- `UseHttpsRedirection` does not redirect. With no HTTPS endpoint it logs `Failed to determine the https port for redirect.` and passes the request through.
- The basket cookie (`eShop`) and the antiforgery cookie have no `Secure` flag. The demo test added an item, and the basket page showed it with the cart count at 1 (`failure.png` in the artifact run).
- The identity cookie `EshopIdentifier` has `SecurePolicy = Always`. No e2e test logs in, so I checked it separately with the same Chromium 1248 against `witness up`. Logging in as `demouser@eshop.test` got `Set-Cookie: EshopIdentifier=…; path=/; secure; samesite=strict; httponly`. Chromium stored it (`secure=true`), and the header showed the user, on both `http://127.0.0.1` and `http://localhost`. Chromium treats loopback as a trustworthy origin. The same cookie would be dropped on a non-loopback HTTP host, for example a Docker network name, so keep the published port on `127.0.0.1`.

### Results

| Step | Command | Result | Time | Run id |
| --- | --- | --- | --- | --- |
| manual | web via `.witness/dotnet run` on 5188; `E2E_BASE_URL=http://127.0.0.1:5188 .witness/dotnet-host test --project tests/EndToEndTests/...` | `total: 3, succeeded: 2, skipped: 1` | 6s | - |
| check | `witness check` | `CHECK ok`. Listed functional 56, publicapi 107 (data rows are counted at run time: 144), e2e 3. | 20s | - |
| run | `witness run --label eng-10574-functional` (config uncommitted, same content) | `VERDICT passed · 202 passed, 0 failed · 1 skipped · 3 suite(s)` | 26s | `r-20261123-104606-dc7b` |
| demo failure, before the fix | `Skip` removed; `witness run --suite e2e` | `failed · 2 passed, 1 failed`. Screenshot, trace and video in `artifacts.json`, each with `test_id: null` | 45s | `r-20261123-104642-8bac` |
| demo failure, after the fix | same | `failed · 2 passed, 1 failed`, exit 1. Screenshot (533 KB), trace (2.8 MB) and video (2.2 MB), each with `test_id: dotnet:Microsoft.eShopWeb.EndToEndTests.Playwright.BasketTests#Cart_AddItem_ShowsExpectedTotal` | 39s | `r-20261123-104806-533e` |
| select | `witness run --select 'e2e:dotnet:...CatalogTests#HomePage_ShowsCatalog'` | `--filter FullyQualifiedName=...` passed through the wrapper; `1 passed` | 6s | `r-20261123-104950-1368` |
| missing host SDK | `.witness/.env` moved away; `witness run` | `mistrial · missing_env · missing: DOTNET_HOST_ROOT` | 0s | `r-20261123-104956-a4ec` |
| final | `witness run --label eng-10574-final` (clean tree, `Skip` restored) | `VERDICT passed · 202 passed, 0 failed · 1 skipped · 3 suite(s)` | 24s | `r-20261123-105002-ede6` |
| counts | `compare.py` on the final run | CTRF, TRX and dotnet's `total:` agree: e2e 2+1 skipped, functional 56, publicapi 144 | - | - |

No `witness-dn-*` container was left after any step, including `witness up` / `witness down`.

### Findings

1. **Witness bug, fixed: artifacts in a folder named with the raw test id were not linked to the test.** `collectArtifacts` (`src/suite.ts`) looked the folder name up against sanitized ids only (`safeId`: `Class_method`). A folder named `Class#method`, the id Witness itself shows, was listed with `"test_id": null` (run `r-20261123-104642-8bac`):

   ```json
   { "file": "artifacts/Microsoft.eShopWeb.EndToEndTests.Playwright.BasketTests#Cart_AddItem_ShowsExpectedTotal/failure.png",
     "artifact_type": "screenshot",
     "test_name": "Microsoft.eShopWeb.EndToEndTests.Playwright.BasketTests#Cart_AddItem_ShowsExpectedTotal",
     "test_id": null, ... }
   ```

   The fix sanitizes the folder name before the lookup, so both forms match. There is a regression test in `test/eval-fixes.test.ts`.
2. **The repo's failure demo fails one step early.** `Cart_AddItem_ShowsExpectedTotal` should fail on `Expect(page.GetByText("$999.99"))`. It times out after 30s on `GetByRole(AriaRole.Link, new() { Name = "Basket" })`, because clicking "Add to Basket" already opens the basket page and the cart icon has no accessible name "Basket". The artifacts are produced either way. This is in the upstream test, so I left it.
3. **Rough edge: `witness check` lists 107 publicapi tests while the run counts 144.** `--list-tests` lists each theory once, and the run reports each data row. Known; not new.
