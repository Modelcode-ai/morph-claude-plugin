# witness

`witness` boots the services a repo needs, runs the repo's own functional test suites, and decides
pass or fail from the reports and exit codes that it collected itself. Every run gets a directory with live status,
logs, raw reports, a CTRF results file and an artifacts manifest. When something goes wrong before
the tests could say anything, the output is a cause code plus the log line behind it, not a guess.

No AI model calls happen inside the CLI.

Functional tests only: a suite's tests drive the app through its HTTP API (`kind = "api"`, with the
app in the test process, such as `WebApplicationFactory`, FastAPI `TestClient`, supertest or
`MockMvc`, or at a URL) or in a browser (`kind = "ui"`: Playwright, Cypress, Selenium, Capybara).
Unit tests, and integration tests that call a repository or database directly, are left to the
project's own build and test scripts.

## Run it

Needs Node 22.18+ (the sources use type stripping; the bundle is tested on the same version).

```bash
bin/witness init                      # .witness/witness.example.toml: functional suites guessed from the repo
bin/witness check                     # config -> deps -> boot -> list tests (or a smoke run)
bin/witness check --stage boot --against main   # does main boot? (temporary worktree, this .witness/)
bin/witness run                       # everything; exit code is the outcome
bin/witness run --suite api --select pytest:tests/e2e/test_a.py::test_b --retries 1
bin/witness run --against main        # same suites on main too; per-test parity in the results
bin/witness up / down                 # leave services running between runs
bin/witness status latest
bin/witness report --format md|json
```

`bin/witness` runs `src/cli.ts` when `node_modules` is present, otherwise `dist/witness.mjs`
(set `WITNESS_USE_DIST=1` to force the bundle).

Exit codes: 0 passed, 1 failed, 2 error, 3 mistrial, 4 stalled/timeout, 5 interrupted, 64 usage.

## Config: `.witness/witness.toml`

```toml
version = 1

[env]
file = ".witness/.env"
required = ["DATABASE_URL"]

[[dependency]]
name = "postgres"
check = "pg_isready -h localhost"
start = "docker compose up -d db"
stop = "docker compose stop db"

[[service]]
name = "api"
setup = "npm ci"                         # skipped when nothing under cwd changed since it last passed
start = "npm start -- --port ${PORT}"
ports = "3000-3005"                      # optional pool; otherwise any free port
ready = { http = "${self.url}/health", timeout = "120s" }   # required; { cmd = "true" } for a worker

[[suite]]
name = "api-e2e"
kind = "api"                             # required: "api" (HTTP) or "ui" (browser)
service = "api"                          # omit: all target services; [] : none (tests host the app)
adapter = "pytest"
cmd = "pytest tests/e2e"
per_test_timeout = "120s"

[run]
stall_timeout = "5m"
heartbeat = "60s"
```

Variables: `${PORT}`, `${self.url}`, `${<service>.url}`, `${CHECKOUT}`, `${WITNESS_RUN_DIR}`,
`${WITNESS_REPORT_DIR}` (suites) and any environment variable. Unknown `${X}` is left for the shell.
Suites also get `WITNESS_<SERVICE>_URL`, `WITNESS_REPORT_DIR` and `WITNESS_ARTIFACTS`.

Additions beyond the shared contract: `suite.select` (a command template with `{ids}` or `{id}`
for adapters that can't select tests on their own), `service.origin_for` (which target an
`role = "origin"` service stands in for; defaults to the name minus `-origin`) and
`run.kill_grace` (SIGTERM to SIGKILL delay, default 5s).

`witness init` reads each test project (per csproj, pytest root, package.json, Maven/Gradle
build, go module, Gemfile, phpunit.xml) and classifies its test files from imports, package
references and calls (`src/functional.ts`). It proposes a suite only for projects whose tests drive
the app, sets `kind` (`ui` when a browser driver is used) and `service = []` when the tests start the
app themselves. A mixed project gets a filtered command when a folder, tag or a few test classes
separate the functional tests; otherwise it is listed as "needs a filter" with its suite commented
out. Every project left out is printed with its reason and written into the file as a comment.
`witness check` warns (it does not fail) when a configured suite's test files don't drive the app.

Readiness: `ready` is required for every started service (an `external` service without one is
probed at its URL; any HTTP answer below 500 counts). Before starting, witness fails with
`port_in_use` when the ready URL names a fixed local port that something already answers on. A ready
URL that keeps answering the same 4xx fails after min(30s, timeout/2) as a wrong URL (not retryable).
`ready.cmd` probes get the service's `env`.

`.witness/scratch/` is created with a `.gitignore` of `*`: a place for agents' temporary files
(for example a redirected `witness run` output) that never shows up in `git status`.

## Test plans, lint and agent skills

```bash
bin/witness plan check [.witness/plan.yaml] [--draft] [--no-list]
bin/witness lint [files or folders...] [--plan file]
bin/witness skills path | list
bin/witness skills install --dir .claude/skills [--link] [--prefix witness-]
```

`plan check` validates `.witness/plan.yaml` (schema, unique item ids, `<adapter>:<id>` test ids) and
lists each suite whose adapter the plan uses, to confirm every referenced test exists. `--draft`
turns "not written yet" and "no tests" into warnings (the plan is written before the tests).
Suites that list bare method names (MSTest) match on the method part of `Class#method`. It ends
with a ready `witness run --select '<suite>:<adapter>:<id>,...'` line for the tests it found.

`lint` with no files checks the test files changed in the working tree plus the files the plan
names. Rules: `no-assertion` (a warning when the test says it only checks that nothing raises),
`swallowed-exception` (catch-all handlers in a test body that neither rethrow, assert, skip nor
record), `long-sleep` (fixed waits over 5s in a test body; sleeps inside functions the test defines,
such as fake hangs, are ignored) and, when a plan exists, `error-status-only` (a plan item that
expects success whose test asserts only a 4xx/5xx status) and `status-only` (an item whose `expect`
asks for more than a status code, whose test checks only status codes, e.g. only
`EnsureSuccessStatusCode()`). Plan ids of the form `Class#method` match only tests in that class. Languages: Python, JS/TS, C#, Java/Kotlin,
Go, Ruby, PHP. Silence one finding with `witness-lint: ignore[rule]` on that line or the line above.

`--select` also accepts `<suite>:<adapter>:<id>` when several suites share an adapter; with
`--select` and no `--suite`, only the suites that own the selected tests run. The list is split on
commas outside brackets and quotes, and a piece without an `adapter:` prefix continues the previous
id, so `Method(a: 1, b: 2)` and titles with commas stay whole.

The agent skills live in `skills/` (`test-change` is the entry point; then `init`, `plan`, `write`,
`verify`, `triage`). They are plain procedures that name no agent-specific tool;
`npm run check:skills` (also part of `npm test`) enforces that and an 800-word budget.
`npm run build:plugin` copies them into the repo's `morph` Claude Code plugin as
`plugins/morph/skills/witness-<name>`; commit the result (a test fails when it is stale). For other agents, `witness skills install --dir <dir>`
copies them as `witness-<name>` (or links them with `--link`, keeping their own names).

## Adapters

| adapter | report witness asks for | select one test | list |
| --- | --- | --- | --- |
| pytest | `--junitxml` (xunit1, for file paths) | node ids replace positional args | `--collect-only -q` |
| junit-maven | surefire/failsafe XML from `target/` | `-Dtest=Class#method` | - |
| junit-gradle | `build/test-results/**/*.xml` | `--tests Class.method` | - |
| dotnet | TRX: `--logger trx` (VSTest), `--report-xunit-trx` (xunit v3 on MTP), `--report-trx` (MTP + TrxReport) | `--filter FullyQualifiedName=...` | `--list-tests` |
| jest | `--json --outputFile` (parsed natively) | `-t` | - |
| vitest | `--reporter=junit` | `-t` | `vitest list` |
| playwright | JSON reporter | file + `--grep` | `--list` |
| go | `go test -json` on stdout | `-run` | `-list .` |
| mocha | `--reporter xunit` | `--grep` | - |
| rspec | `RspecJunitFormatter` (gem required) | `-e` | - |
| phpunit | `--log-junit` | `--filter` | `--list-tests` |
| generic | any JUnit/TRX/JSON in `$WITNESS_REPORT_DIR` or `report = "<glob>"`; else the exit code | `select` template | - |

If the command already wires a report (for example `--junitxml=...`), witness adds nothing and
reads it through `report = "<glob>"`. Stable test ids are `<adapter>:<id>`: a pytest node id,
`Class#method` for JUnit/TRX, `file > describe > title` for jest/vitest/playwright/mocha.

## Reading a run

```
.witness/runs/<run-id>/   status.json  events.jsonl  state.json  logs/  reports/<suite>/
                          results.ctrf.json  artifacts.json  artifacts/<test-id>/  against/
.witness/runs/latest -> <run-id>
```

The CTRF file carries `results.extra.witness` (run id, outcome, commit, branch, dirty, source,
against, diagnosis) and per-test `extra.witness` (id, suite, kind, adapter, obtained, status_detail,
parity, origin_status). Each suite in `status.json` has `kind` and `services`: the services witness
started for it, empty when the tests host the app themselves (they don't exercise those services,
and `--against` with origin services tests the same code twice). `witness report` shows both.

Reconciliation, in short: failures in the report are trusted; a clean report with a non-zero exit is
`error` (report_incomplete); a test that was asked for but isn't in the report is `other/missing`; an
unreadable or absent report makes witness rerun each known test alone (when the adapter can list and
select), and otherwise records one suite-level result. Never a pass without evidence: a suite whose
tests were all skipped is `error`; a suite-level row with exit 0 but no report is `other/missing`; a
test rerun alone that exits 0 but is not in its report is `other/missing`; a report file that was
already on disk (unchanged) before the suite started is ignored. A suite whose only failures come from
fixture setup, and a suite that fails to build or whose command is missing (exit 127) before any test
ran, are `error` with cause `setup_failed` (no listing or reruns after a build failure).

A service that fails to boot makes the run a `mistrial`, but suites that don't need it still run.
`--against <ref>` and `check --against <ref>` copy this checkout's `.witness/` (minus runs, cache and
scratch) into the temporary worktree, because the config is this checkout's. The VERDICT line counts
failed, error (fixture errors, timeouts), missing and skipped tests per suite, and tests that exist
only on the origin separately.

Cause codes: missing_env, bad_config, dependency_unreachable, setup_failed, exited_before_ready,
ready_timeout, port_in_use, auth_failed, network, service_died, suite_timeout, stalled,
report_missing, report_unreadable, report_incomplete.

## Develop

```bash
npm install
npm test                 # node --test, about 20s
npm run typecheck
npm run build            # bun -> dist/witness.mjs (commit it)
npm run build:plugin     # skills -> plugins/morph/skills/witness-* (commit it)
npm run check:skills     # word budget and no harness-specific tool names
```

Fixtures live in `testdata/`: report corpus per framework (including broken files) under
`testdata/reports/`, small node apps for the integration tests under `testdata/apps/`, and one
unit, functional and mixed repo per stack for the `init` classifier under `testdata/functional/`.
