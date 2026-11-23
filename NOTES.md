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
