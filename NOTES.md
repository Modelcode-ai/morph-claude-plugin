# ENG-10541: Witness agent skills and test plan checks

Branch `eng-10541`, stacked on `eng-10540` (the run engine; its notes follow this section). This
section covers what this branch adds, how to run it, how it was tested, and what does not work.

## What was built

- **`witness plan check [file] [--draft] [--no-list]`** (`src/plan.ts`). Reads `.witness/plan.yaml`
  (contract schema) and checks:
  - the schema: `version: 1`, a `source`, a non-empty `items` list, and per item `id`, `behavior`,
    `expect`, `kind` (new/changed/parity) and `tests`. Unknown keys get a "did you mean" hint.
    Every problem names its YAML path and line (`items[0].kind`, line 8).
  - item ids are unique; test ids look like `<adapter>:<id>` with a known adapter and are not
    repeated within an item.
  - every referenced test exists: it lists each suite whose adapter the plan uses (the adapter's
    list command) and looks the id up. Parametrized cases (`[..]`, `(..)`, ` (..)`) count. Suites
    that list bare method names (MSTest on MTP) are matched on the method part of `Class#method`.
    A missing id gets a "did you mean" from the listing. When a suite can't list, the test is
    `unverified` (a warning).
  - `--draft` (used by the plan skill, before the tests exist) turns "not written yet" and "no
    tests" into warnings. `--no-list` skips listing. With no `witness.toml` only the schema is
    checked.
  - It ends with a ready command for the tests it found:
    `witness run --select '<suite>:<adapter>:<id>,...'`.
  - Exit 0 valid, 1 invalid, 2 file missing, 64 usage. `--json` gives items, per-test state and
    problems.
- **`witness lint [files|folders] [--plan file]`** (`src/lint.ts`). Static checks on test files in
  Python, JS/TS, C#, Java/Kotlin, Go, Ruby and PHP. Comments, strings and JS regex literals are
  blanked before matching, then test blocks are found per framework (pytest/unittest `def test*`,
  jest/vitest/playwright/mocha `it`/`test`, xunit/NUnit/MSTest attributes including multi-line
  `[Theory, InlineData]` and expression bodies, JUnit 5 annotations, Go `TestX(t *testing.T)`,
  RSpec/minitest, PHPUnit). Rules:
  - `no-assertion`: a test with no assertion. Assertion helpers defined in the same file count,
    and so do mock verifications (NSubstitute `Received`, Moq/Mockito `verify`), Testing Library
    `findBy*` and `EnsureSuccessStatusCode`. Skipped tests are ignored. When the test says it only
    checks that nothing raises ("must not raise", `test_x_is_swallowed`), this is a warning.
  - `swallowed-exception`: a catch-all handler in a test body (bare `except:`/`except Exception`,
    `catch {}`/`catch (Exception)`, `rescue => e`, `.catch(() => ...)`) that neither rethrows,
    asserts, fails, skips nor records the error. Handlers inside functions the test defines
    (mock route handlers) are ignored, and so is `.catch((e) => e)`, which captures the error.
  - `long-sleep`: a fixed wait over 5s in a test body, with each framework's units (Python
    seconds, JS ms, `Thread.Sleep`, `TimeSpan.FromSeconds`, `TimeUnit`, Go `time.Second`, ...).
    Sleeps inside functions the test defines (fake hangs) are ignored.
  - `error-status-only` (only with a plan): a plan item whose `expect` describes success but whose
    test asserts nothing except a 4xx/5xx status (numbers next to status/code, `HttpStatusCode.X`,
    `HttpStatus.X`, `status.HTTP_4xx`, `have_http_status(:not_found)`, `ok`/`IsSuccessStatusCode`
    false).
  - With no files: the test files changed in the working tree (vs HEAD, plus untracked) and the
    test files the plan names (file paths in ids, or `<Class>.<ext>` for `Class#method` ids). The
    plan is `--plan` or `.witness/plan.yaml` when it exists.
  - `witness-lint: ignore[rule]` on the line or the line above silences one finding. Exit 1 on any
    error-level finding.
- **Skills** in `packages/witness/skills/<name>/SKILL.md`: `test-change` (the entry point; shared
  rules, how to run long commands, the order of the other skills, the report), `plan`, `write`,
  `verify`, `triage` and `init`, each doing the steps the issue lists. They are 634 to 733 words
  each and name no agent-specific tool. Long runs: start the command so it can run for minutes and
  its output can be read while it runs, read `.witness/runs/latest/status.json` for progress, and
  act on the `witness  VERDICT` line and the exit code.
- **`witness skills path | list | install --dir <dir> [--link] [--prefix witness-]`**
  (`src/skills.ts`). The skills folder is found next to `src/` or `dist/` or beside the bundle
  (so the bundle plus a `skills/` folder copied together work), or from `$WITNESS_SKILLS_DIR`.
  Install copies each skill as `witness-<name>` with its frontmatter name changed to match, or
  links it (`--link`, which keeps the plain names). It replaces only folders it installed itself
  (marker file) or symlinks, and refuses others.
- **CI check** `scripts/check-skills.ts` (`npm run check:skills`, and part of `npm test`): fails
  when a SKILL.md names an agent tool or mechanism (Write/Read/Edit/Bash/... tool, TaskCreate,
  TodoWrite, run_in_background, subagent, `mcp__`, product names, slash commands), when it has
  more than 800 words, or when its frontmatter name or description is wrong.
- **Claude Code packaging**: `scripts/build-plugin.ts` (`npm run build:plugin`) generates
  `packages/witness/harness/claude/` with `.claude-plugin/plugin.json`, a local
  `marketplace.json`, a README and the skills. The output is committed, and a test fails when it
  is out of date. `claude plugin validate packages/witness/harness/claude` passes (it shows
  `witness:test-change`, `witness:plan`, ...). The Maude / morph-claude-plugin repo was not
  touched.
- **Engine changes made during the evaluation** (all on this branch, backward compatible):
  - `--select` accepts `<suite>:<adapter>:<id>`. Without it, ids for an adapter that several
    suites share (6 dotnet suites in eShopOnWeb) could not be selected in one run. With `--select`
    and no `--suite`, only the suites that own the ids run (before, the other suites ran in full).
  - A selected parametrized test (Theory/DataRow/pytest params) counts as present through its
    cases. Before, it was reported `other/missing` and the suite `error`.
  - `--against <ref>` with an unknown ref is a usage error (exit 64) before anything runs.
    Before, the target ran for minutes and then reported "origin mistrial" with no reason shown.
    The origin diagnosis is now printed and kept in `status.json` under `against.diagnosis`.
  - The evidence line in a diagnosis is the error line of the last command's output, not a stack
    frame or a build summary. For example, it now shows
    `Unhandled exception. System.InvalidOperationException: ...` instead of
    `at Program.<Main>(String[] args)`.
  - `witness check --stage config|deps|boot` prints a `CHECK ok` line.
- Bundle rebuilt: `dist/witness.mjs` grew from 257KB to 540KB, because of the `yaml` parser.

## How to run

```bash
cd packages/witness
npm install
npm test                 # 125 tests, includes the skills check and plugin freshness
npm run typecheck
npm run check:skills     # word counts + banned names
npm run build            # dist/witness.mjs
npm run build:plugin     # harness/claude
bin/witness plan check --draft
bin/witness lint
bin/witness skills install --dir ~/.agents/skills
```

## How it was tested

### Witness's own tests

- `cd packages/witness && npm test`: **125 tests, 125 pass, 0 fail**, about 15s. It was run 3
  times in a row with 125/125 each time. The engine branch had 99 tests; this branch adds 26.
- `npm run typecheck`: clean. `npm run check:skills`: ok (init 634, plan 665, test-change 647,
  triage 730, verify 662, write 733 words).
- `claude plugin validate packages/witness/harness/claude`: "Validation passed". The only
  directory-submission notes are a missing LICENSE and icon, which do not matter for a private
  plugin.

New test files:

| File | What it covers |
| --- | --- |
| `test/plan.test.ts` | the contract example; 10 schema errors with path and line; `--draft`; YAML errors; parametrized and MSTest bare-name matching; found / missing with a hint / unverified / no owning suite; CLI exit codes 0/1/2/64 with a fake pytest lister; suite-qualified `--select` |
| `test/lint.test.ts` | masking (strings, comments, JS regex vs JSX); test-path detection; each rule in Python, TS, C#, Java, Go, Ruby and PHP, including the no-finding cases (helpers, narrow catch, skip in a handler, nested fake hangs, `.catch(e => e)`, skipped tests, ignore comments); `error-status-only` with plans in Python and C#; the CLI (changed files from git, folders, plan pickup, invalid plan) |
| `test/skills.test.ts` | the real skills pass the check; the check catches tool names, product names, a wrong name or description and the word budget; the script's exit codes; `skills path/list/install` (prefix and rename, link, reinstall, refusing foreign folders); `harness/claude` up to date |
| additions | `reconcile.test.ts` (parametrized selected ids), `diagnosis.test.ts` (evidence line), `integration.test.ts` (unknown `--against` ref) |

### Lint precision on real test code (read-only)

| Repo | Files / tests found | Result after tuning | What remains |
| --- | --- | --- | --- |
| eShopOnWeb `tests/` (C#) | 86 / 229. Every `[Fact]`/`[Theory]`/`[TestMethod]` in the repo was found (229 attributes) | 0 errors. The first pass had 12 false `no-assertion` findings: NSubstitute `Received()` and an expression-bodied theory; both fixed | - |
| morph `tests/` (pytest) | 1299 / 15122 | 91 errors, 49 warnings. The first pass had 196 errors | 87 `no-assertion` on tests that only call code (validation guards with no assert); these are real under the rule. 49 warnings are "only checks that nothing raises" tests. 2 `long-sleep` (`asyncio.sleep(10)` as a "long setup" that the test expects to be cut short; debatable). 2 `swallowed-exception`, one of which has `noqa: BLE001` |
| lens-www (TS/TSX, jest + Playwright) | 879 / 6264 | 8 errors. The first pass had 43 | 6 are Playwright `isVisible().catch(() => false)` or `waitForRequest().catch(() => null)`, which hide a missing element (real). 1 is `failed.catch(() => {})` on a deliberately rejected promise (debatable). 1 is a type-only test (`@ts-expect-error`) |

Fixes driven by this pass: JS sleep units are always ms, and `wait(20)` is no longer read as 20
seconds. Python sleeps count only when the test awaits them or blocks on them. Sleeps and catches
inside nested functions are ignored. JS regex literals are masked, with JSX `</div>` and `/>`
kept as code; this found 225 more lens-www tests. Python triple-quoted strings are masked as a
whole, so their delimiters no longer end the test block. "Does not raise" tests are warnings.

### Self-evaluation on eShopOnWeb, following the skills by hand

The repo was cloned into the scratchpad (`.../scratchpad/e10541/eshop`), with .NET SDK 11.0.100
from the scratchpad and the engine branch's config (`examples/eshoponweb.toml` plus the
TrxReport fix). I acted as the agent and followed `test-change` → `plan` → `write` → `verify`, and
`triage` on a second clone. No separate agent session was run.

The change I implemented first: "GET /api/catalog-items?name=<text> returns only items whose name
contains <text>, ignoring case. pageCount counts only matching items. It combines with the
brand/type filters and paging. A name longer than 100 characters is rejected with 400."

| Step | Command | Result |
| --- | --- | --- |
| plan | wrote `.witness/plan.yaml`: 5 items (4 new, 1 parity), 9 test refs across the `unit` (xunit v3) and `publicapi` (MSTest) suites; `witness plan check --draft` | First run: the 2 existing MSTest tests were reported missing, because MSTest lists bare method names, and the hint suggested a wrong id. Fixed (method-name matching). After the fix: `PLAN ok · 5 item(s), 9 test ref(s): 3 found, 6 missing` (all 6 "not written yet"), in 25s for listing 5 dotnet suites |
| write, deliberately weak first draft | a test with `try { EnsureSuccessStatusCode } catch (Exception) {}` and `Thread.Sleep(8000)`, and a pageCount test asserting only `HttpStatusCode.NotFound`; `witness lint` | exit 1: `swallowed-exception`, `long-sleep` (8s), and `error-status-only: P2 expects "200; with pageSize=1 ... pageCount is N" but ... only asserts an error status` |
| write, real tests | 4 MSTest API tests and 2 xunit spec tests in the files' own style; `witness lint`; `witness plan check` | `LINT ok · 3 file(s), 19 test(s)`; `PLAN ok · 9 found` with the printed `--select` command |
| run selected | the printed `witness run --select 'publicapi:dotnet:...,unit:dotnet:...'` | First run: `error`, because selected Theory ids were "missing" (engine bug, fixed). A plain `--select` across two dotnet suites was refused (fixed with suite-qualified ids). After the fixes: **`VERDICT passed · 18 passed, 0 failed · 2 suite(s) · 4s`** |
| verify | `witness run --label verify-1 --against master` | The target passed every suite except `e2e` (the known Playwright fixture failure from ENG-10540). The repo has no `master`, so the origin was a "mistrial" with no reason shown after 2 minutes. Fixed: now exit 64 at once, `--against master: not a commit in this repo` |
| verify | `witness run --label verify-2 --against main` (5 suites, without the broken e2e) | **`VERDICT passed · 298 passed, 0 failed · 5 suite(s) · against main: origin passed, 0 differ · 37s`**; parity 289 same, 9 only on target (the new tests) |
| do the tests bite? | made the spec case-sensitive and dropped the name from the count spec; reran the plan's tests | `VERDICT failed · 14 passed, 4 failed`: 3 `MatchesNameIgnoringCase` cases and `PageCountCountsOnlyMatchingItems` (`expected: 2 actual: 12`). Reverted |
| triage (second clone) | Web now throws at startup when `CatalogRegion` is not configured; `witness check --stage boot` | `exited_before_ready`. The evidence was the stack frame `at Program.<Main>(String[] args)`; fixed to `Unhandled exception. System.InvalidOperationException: CatalogRegion is not configured` |
| triage step 3 | the skill's base-worktree commands (`git worktree add`, copy `.witness/witness.toml`, `witness check --stage boot`, remove) | the base booted (`ready ... (5s)`), so the change broke startup, which the skill reports as the failure; worktree removed |

## Known gaps

- The skills were checked by following them myself on eShopOnWeb. No independent agent session
  (Claude Code with the plugin, or another harness) has run them yet. The plugin passes
  `claude plugin validate` but was not installed into a live Claude Code (that changes user
  settings).
- Lint is heuristic (regexes over masked source, not a parser):
  - It can miss tests: `it.each(...)(...)`, `test.describe` bodies are not tests themselves,
    Kotlin expression bodies, and Ruby blocks with unusual indentation.
  - It can mistake a helper for an assertion: any call named `assert*`/`expect*`/`verify*`/
    `should*` counts.
  - `error-status-only` works line by line, finds the test by its last id segment, and judges
    "expects success" from words in `expect` (an expect that mentions "error" or a 4xx counts as a
    failure behavior).
  - Long sleeps in shared helpers outside the test body are not seen.
- `plan check` runs the suites' list commands without booting services and substitutes only env
  vars and `${CHECKOUT}`. A suite command that uses `${svc.url}` will fail to list, and its tests
  become `unverified` warnings. Listing every dotnet suite builds them (25s on eShopOnWeb).
- MSTest listings have no class names, so a plan id is matched on the method name alone. Two
  classes with the same method name can't be told apart.
- In `--select`, an id that contains a comma (a jest title, for example) is split. This is
  inherited from the engine.
- The triage skill's base-boot check is a shell recipe (`git worktree add` + `witness check`),
  because `run --against` does not run the base when the target can't boot. A `witness check
  --against <ref>` would be simpler; it is not built.
- `skills install --link` keeps the plain skill names (`plan`, `write`, ...), which can collide
  with other skills in a shared folder. Copy mode prefixes them.
- The plugin does not ship the `witness` binary. The skills expect `witness` on PATH (test-change
  step 1 stops when it is missing).
- The bundle doubled in size (yaml parser); it is not minified.
- xunit v3 TRX names escape quotes (`name: \"mug\"`), so those ids contain a backslash. This comes
  from the TRX file, not from witness.

## Scope changes vs the contract and the issue

- Added: `witness skills list` (prints the skills and their descriptions) and `--prefix` on
  `skills install`.
- Added: `plan check --draft` and `--no-list`, and the printed `--select` command. Reason: the
  plan is written before its tests exist; `--draft` lets the plan skill check the schema at that
  point.
- Added: an optional `--plan` for lint, and the `witness-lint: ignore[rule]` comment.
- Added (engine, found in the eval): suite-qualified `--select` ids, and only the owning suites
  run when `--select` has no `--suite`; parametrized selected tests count as present; unknown
  `--against` ref → exit 64; the origin diagnosis is shown and stored; evidence-line selection;
  a `CHECK ok` line for `--stage`.
- Interpretation: `error-status-only` is checked only when a plan exists (as the issue says).
  The write skill states the general rule for every test.
- Deferred: merging with the Maude / morph-claude-plugin repo (not touched).
- Not done: a pre-commit hook for `witness lint`. The POC hook was deleted in ENG-10540, and the
  issue did not ask for it again.

---

# ENG-10540: Witness run engine

Branch `eng-10540`, package `packages/witness/`. This file covers what was built, how to run it, how it was
tested, and what does not work yet.

## What was built

- **Config v1** (`src/config.ts`): TOML via smol-toml. Unknown keys are rejected with a "did you mean"
  hint. Errors name the key, for example `service.api.ready.timeout: expected a duration like "30s"`.
  It checks duplicate names, unknown `depends_on`/`service`/`${svc.url}` references and dependency
  cycles. It also loads the env file (process env wins) and checks `required` names.
- **Adapter table** (`src/adapters.ts`): pytest, junit-maven, junit-gradle, dotnet, jest, vitest,
  playwright, go, mocha, rspec, phpunit and generic. Each one is data: how to request a report, report
  globs, select syntax, list command and parser, per-test timeout flag and id normalizer. The dotnet
  adapter reads `global.json` and the test project to choose `--logger trx` (VSTest),
  `--report-xunit-trx` (xunit v3 on MTP) or `--report-trx` (MTP with TrxReport). When the project has
  no TRX reporter, the diagnosis says which package to add.
- **Parsers** (`src/parsers/`): tolerant JUnit (nested suites, error vs failure, skipped, flaky and
  rerun failures, missing classname, `[[ATTACHMENT|..]]`, truncated XML reported as unreadable with the
  unclosed tags), TRX (including data-driven inner results), Playwright JSON, Jest JSON and
  `go test -json`. The format is detected from the content.
- **Runner** (`src/stack.ts`, `src/suite.ts`, `src/run.ts`, `src/proc.ts`, `src/rundir.ts`):
  - processes: detached process groups, group kill with SIGTERM, then a grace period, then SIGKILL
  - startup: readiness checks over http or cmd, dependency checks with optional start and stop,
    port pools or free ports, services booted in `depends_on` order
  - services: watched during suites (exit, pidfile pid gone, or 3 failed probes means
    `service_died`); external services are attached; pidfile and `stop` cover daemonizing starts;
    `up`/`down` keep services running between runs
  - suites: stall watchdog (no log output and no report growth), suite timeout, heartbeat lines
  - run directory: `status.json`/`events.jsonl` updated live, `state.json` with pids and pgids, and
    a `latest` link
  - safety: stale runs (and their `--against` worktrees) are reaped on the next invocation; a lock
    stops concurrent runs on one checkout
  - Ctrl-C and SIGTERM end with outcome `interrupted` and keep the run dir; a second Ctrl-C kills
    everything at once
  - setup is skipped when its inputs hash is unchanged, or with `--no-setup`
- **Reconciliation + CTRF** (`src/reconcile.ts`, `src/ctrf.ts`) follow the contract rules. Stable ids
  are `<adapter>:<id>`. `obtained` is report, per-test-rerun or suite-level. `status_detail` is
  error, missing or timeout. `--retries n` reruns the failed tests through select, and a test that
  passes on retry is marked flaky.
- **Artifacts manifest**: files left under `WITNESS_ARTIFACTS/<test-id>/` and framework attachments
  (Playwright, JUnit attachment lines) are copied into the run directory. A file name like
  `01-home.png` gives `step_index` and `step_label`.
- **Diagnosis** (`src/diagnosis.ts`): the cause codes from the contract. The log tail can refine the
  cause:
  - `EADDRINUSE` / address already in use → `port_in_use`
  - connection refused → `dependency_unreachable`
  - 401 or failed authentication → `auth_failed`
  - DNS errors → `network`
  - a missing module or command keeps the cause and quotes the line as evidence

  `evidence` is the line that matched and `try` lists concrete next commands. A failure raised while a
  test fixture sets up gets `status_detail: error`.
- **`--against <ref>`**: if the config has `role = "origin"` services, it uses them. Otherwise it runs
  the same suites in a temporary `git worktree` of the ref. Per-test parity is
  same/differs/origin_only/target_only, plus `origin_status`. The outcome still comes from the target
  run.
- **Commands**: check, run, up, down, status, report (md/json) and init. Init guesses adapters from
  the repo files, and services from Web csproj, spring-boot, `npm start` and `manage.py`. All commands
  accept `--json`, `--config` and `--run-dir-root`. Exit codes and the final `witness  VERDICT ...`
  line follow the contract.
- **Bundle**: `bun build` writes `dist/witness.mjs` (committed). `bin/witness` runs the sources when
  `node_modules` is present and the bundle otherwise; `WITNESS_USE_DIST=1` forces the bundle.
- **POC removed** in a separate commit: `engine/`, POC `skills/`, `hooks/`, `dist/` and viewer,
  `.claude-plugin/`, `build.sh` and `.pre-commit-hooks.yaml`. `docs/` is kept. The root README and the
  root `bin/witness` now point at the package.

## How to run

```bash
cd packages/witness
npm install
npm test             # node --test over test/*.test.ts
npm run typecheck    # tsc --noEmit (erasable syntax only)
npm run build        # bun -> dist/witness.mjs
bin/witness --help
```

## How it was tested

### Witness's own tests

Command: `cd packages/witness && npm test`.

Result: 99 tests, 12 suites, 99 pass, 0 fail, about 15s. I ran it 3 more times in a row: 99/99 each
time.

| File | What it covers |
| --- | --- |
| `config.test.ts` | the contract example; 13 error messages that name the key; topo order; substitution; env file; durations |
| `adapters.test.ts` | report args and markers; npm `--`; per-test timeouts; select for every adapter; list parsers |
| `parsers.test.ts` | the whole `testdata/reports` corpus, broken files included (4 broken JUnit, truncated TRX, truncated Playwright, go without events, truncated go stream) |
| `reconcile.test.ts` | every rule in the contract; reruns; dedupe/flaky; outcome precedence; parity; CTRF shape |
| `diagnosis.test.ts` | each heuristic, with the log line as evidence |
| `init.test.ts` | adapter guessing; the generated config parses |
| `bundle.test.ts` | `bin/witness --version` through `dist/` |
| `integration.test.ts` | the fixture apps in `testdata/apps` (31 scenarios, listed below) |

Each integration scenario checks the outcome, the cause and the exit code:

| Scenario | Outcome | Cause | Exit |
| --- | --- | --- | --- |
| passing suite | passed | | 0 |
| failing test | failed | | 1 |
| service crashes after ready | mistrial | service_died | 3 |
| service never ready | mistrial | ready_timeout | 3 |
| hanging suite, stall_timeout 2s | stalled | stalled | 4 |
| suite timeout | stalled | suite_timeout | 4 |
| port already in use (log line, and a busy fixed pool) | mistrial | port_in_use | 3 |
| broken XML + non-zero exit | error | report_unreadable, suite-level result | 2 |
| broken XML with selected tests | error | report_incomplete (each test rerun alone via select) | |
| report says all passed but exit non-zero | error | report_incomplete | 2 |
| expected test absent from the report | error | other/missing | |
| generic suite, no report | passed or failed by exit code | | |
| report configured but missing | error | report_missing | 2 |
| missing required env, then fixed via `.witness/.env` | mistrial, then passed | missing_env | |
| bad config | mistrial | key named in the message | 3 |
| unreachable dependency | mistrial | dependency_unreachable | 3 |
| dependency started and stopped by witness | passed | | |
| missing module | | exited_before_ready, with the evidence line | |
| connection refused | | dependency_unreachable | |
| setup failed; setup skipped when unchanged and with `--no-setup` | | setup_failed | |
| artifacts manifest | | | |
| SIGINT | interrupted, service killed | | 5 |
| stale run reaped | orphan process group killed | | |
| lock refused, then a stale lock taken over | | | |
| up / run reuses / down | | | |
| depends_on order | | | |
| `--against HEAD~1` in a worktree (same, differs, target_only; worktree removed) | | | |
| `--against` with `role = "origin"` services | | | |
| check stages | | | |
| status and report | | | |
| usage errors | | | 64 |
| external service, pidfile + stop daemon, keep_runs | | | |

### Self-evaluation on eShopOnWeb (standalone witness, no agent)

The repo was cloned to the scratchpad; the main checkout was not touched. It needs .NET SDK 11.0.100,
and only 10.0.403 is installed, so I installed 11.0.100 into the scratchpad with `dotnet-install.sh`.
The test projects use xunit v3 and MSTest on Microsoft.Testing.Platform. The config I used is
`packages/witness/examples/eshoponweb.toml`.

| Step | Command | Result |
| --- | --- | --- |
| init | `witness init` | 6 dotnet suites (one per test project, `dotnet test --project ...` because global.json selects MTP) and 2 services (Web, PublicApi) guessed correctly |
| check | `witness check` | Web built, booted on a free port with in-memory DB, ready in 5s. Tests listed: unit 87, integration 3, functional 54, publicapi 107 |
| first run | `witness run` | Found a real gap: PublicApiIntegrationTests (MSTest) has no TRX reporter, so `--report-xunit-trx` was rejected (exit 5). The first version then reran 107 tests one by one and marked them all failed, which is a false failure. Fixed: per-project TRX detection; reruns stop when a single rerun also writes no report; the diagnosis says `add <PackageReference Include="Microsoft.Testing.Extensions.TrxReport" />`. After the fix: outcome `error`, cause `report_missing`, with that hint |
| wrong SDK on PATH (accidental) | `witness run` | `mistrial`, `setup_failed`, evidence `A compatible .NET SDK was not found.` |
| after adding TrxReport, as suggested | `witness run --label eshop-baseline` | **passed**: 289 tests (unit 87, integration 3, functional 54, publicapi 144, smoke-http 1) in 22s |
| broke `Basket.AddItem` | `witness run --suite unit --suite functional --against HEAD~1` | failed: 138 passed, 3 failed with the xunit assertion messages. Origin (worktree) passed. Parity: 138 same, 3 differs. Worktree removed |
| select + retry on MTP/xunit v3 | `witness run --suite unit --select <2 ids> --retries 1` | `--filter FullyQualifiedName=...` worked; 1 passed, 1 failed after 1 retry |
| against the upstream commit | `witness run ... --against aed6281` | target passed (289). The origin booted Web from its own worktree build; origin outcome `error` (no TRX reporter for publicapi there). Parity: 145 same, 144 target_only, 1 origin_only |
| Playwright E2E | `witness run --suite e2e` | failed: 1 passed, 1 failed, 1 skipped. The suite's own fixture starts Web on https://localhost:5001 and timed out after 90s. The same thing happens with plain `dotnet test`, so it is not caused by witness. Witness reported the fixture error; a fixture-setup failure is now marked `status_detail: error` |
| AppHostTests | not run | needs Aspire + Docker SQL Server |

## Known gaps / what does not work

- Heartbeat lines are printed during `run` only. `check` and `up` have none.
- Some ids come out differently in the listing and in the report:
  - MSTest list output uses display names (`PublicApiDoesNotDependOnBlazorInputFile`), while the TRX
    report uses `Class#method`. This only matters when listing fills in expected tests for an
    unreadable report.
  - jest cannot list single tests.
  - The maven and gradle adapters have no list command.
- A `dotnet test` at solution level, in a repo that mixes xunit v3 and MSTest on MTP, can't get one
  TRX flag that every project accepts. Use one suite per test project (what `init` generates).
- pytest per-test timeout needs `pytest-timeout`; rspec needs the `rspec_junit_formatter` gem. Witness
  does not check that either is installed: the suite fails and the diagnosis points at the log.
- pytest select rewrites positional args, and only for simple commands (no `&&`, pipes or subshells).
  Otherwise select is unsupported unless the suite sets a `select` template.
- `--against` in worktree mode always reruns setup, and runs the ref's own tests. Tests added on the
  target show as `target_only`.
- Tests that exist only on the origin are added to `tests[]` as `status: other`, `status_detail:
  missing`, `parity: origin_only`, so they count in `summary.other`. The target outcome ignores them.
- The setup inputs hash covers the git tree under the service cwd plus untracked files. On a large
  untracked tree it reads files up to 1MB each, capped at 5000 files.
- Readiness probes use 127.0.0.1. A service that binds only `::1` needs `ready.cmd` or `external`.
- The reaper only kills process groups recorded by runs that started less than 24h ago, to avoid
  pgid reuse. Older leftovers are only marked interrupted.
- Not tested on Linux (all runs were on macOS) and not tested on Windows (process groups are POSIX
  only).
- Out of scope here (ENG-10541): skills, `plan check`, `lint` and `skills install`. The POC
  pre-commit hook that called `witness lint` was deleted with the POC.

## Scope changes vs the contract (additive)

- The jest adapter parses `--json` natively instead of JUnit, so `jest-junit` isn't needed.
- New keys: `suite.select` (a command template with `{ids}`/`{id}`), `service.origin_for` and
  `run.kill_grace`.
- `artifacts.json` entries also carry `test_id` and `size_bytes`; `test_name` is the directory name
  when no test matches.
- `status.json` adds `pid`, `summary` and `against`. Suite entries add `exit_code`, `cause` and `note`.
  Suite state can also be `timeout`, `skipped` or `interrupted`.
- A suite without `service` waits for every target service; `service = []` means none.
- A service that dies mid-run makes the outcome `mistrial` (exit 3), with cause `service_died`.
- `witness check` writes its logs to `.witness/check/` instead of a run dir, so `latest` is not
  touched.
