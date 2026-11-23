# witness

`witness` boots the services a repo needs, runs the repo's own test suites, and decides pass or fail
from the reports and exit codes that it collected itself. Every run gets a directory with live status,
logs, raw reports, a CTRF results file and an artifacts manifest. When something goes wrong before
the tests could say anything, the output is a cause code plus the log line behind it, not a guess.

No AI model calls happen inside the CLI.

## Run it

Needs Node 22.18+ (the sources use type stripping; the bundle is tested on the same version).

```bash
bin/witness init                      # .witness/witness.example.toml guessed from the repo
bin/witness check                     # config -> deps -> boot -> list tests (or a smoke run)
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
ready = { http = "${self.url}/health", timeout = "120s" }

[[suite]]
name = "api-e2e"
service = "api"                          # omit: all target services; [] : none
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
expects success whose test asserts only a 4xx/5xx status). Languages: Python, JS/TS, C#, Java/Kotlin,
Go, Ruby, PHP. Silence one finding with `witness-lint: ignore[rule]` on that line or the line above.

`--select` also accepts `<suite>:<adapter>:<id>` when several suites share an adapter; with
`--select` and no `--suite`, only the suites that own the selected tests run.

The agent skills live in `skills/` (`test-change` is the entry point; then `init`, `plan`, `write`,
`verify`, `triage`). They are plain procedures that name no agent-specific tool;
`npm run check:skills` (also part of `npm test`) enforces that and an 800-word budget.
`npm run build:plugin` generates `harness/claude/`, a Claude Code plugin and local marketplace with
the same skills (`claude plugin marketplace add packages/witness/harness/claude`, then
`claude plugin install witness@witness-local`). For other agents, `witness skills install --dir <dir>`
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
against, diagnosis) and per-test `extra.witness` (id, suite, adapter, obtained, status_detail,
parity, origin_status).

Reconciliation, in short: failures in the report are trusted; a clean report with a non-zero exit is
`error` (report_incomplete); a test that was asked for but isn't in the report is `other/missing`; an
unreadable or absent report makes witness rerun each known test alone (when the adapter can list and
select), and otherwise records one suite-level result.

Cause codes: missing_env, bad_config, dependency_unreachable, setup_failed, exited_before_ready,
ready_timeout, port_in_use, auth_failed, network, service_died, suite_timeout, stalled,
report_missing, report_unreadable, report_incomplete.

## Develop

```bash
npm install
npm test                 # node --test, about 20s
npm run typecheck
npm run build            # bun -> dist/witness.mjs (commit it)
npm run build:plugin     # skills -> harness/claude (commit it)
npm run check:skills     # word budget and no harness-specific tool names
```

Fixtures live in `testdata/`: report corpus per framework (including broken files) under
`testdata/reports/`, and small node apps for the integration tests under `testdata/apps/`.
