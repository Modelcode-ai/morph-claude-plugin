# witness

`witness` boots the services a repo needs, runs the repo's own functional test suites, and decides
pass or fail from the reports and exit codes that it collected itself. Every run gets a directory with live status,
logs, raw reports, a CTRF results file and an artifacts manifest. When something goes wrong before
the tests could say anything, the output is a cause code plus the log line behind it, not a guess.

No AI model calls happen inside the CLI.

Functional tests only: a suite's tests drive the app through its HTTP API (`kind = "api"`, with the
app in the test process, such as `WebApplicationFactory`, FastAPI `TestClient`, supertest or
`MockMvc`, or at a URL), in a browser (`kind = "ui"`: Playwright, Cypress, Selenium, Capybara) or
through its built binary or command (`kind = "cli"`: subprocess, execa, `os/exec`, assert_cmd,
bats). `kind = "desktop"` and `kind = "mobile"` are accepted and detected; their drivers and
devices are modelled with today's `[[service]]` and `[[dependency]]` (`docs/witness/APP-KINDS.md`).
Unit tests, and integration tests that call a repository or database directly, are left to the
project's own build and test scripts.

## Run it

Needs Node 22.18+ (the sources use type stripping; the bundle is tested on the same version).

```bash
bin/witness init                      # .witness/witness.example.toml (functional suites guessed from the repo), .gitignore, scratch/
bin/witness init --scan               # the repo's facts as JSON, each with confidence and evidence; writes nothing
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
kind = "api"                             # required: api (HTTP), ui (browser), cli, desktop or mobile
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

Additions beyond the shared contract: `service.origin_for` (which target an `role = "origin"`
service stands in for; defaults to the name minus `-origin`), `run.kill_grace` (SIGTERM to SIGKILL
delay, default 5s), and the per-suite overrides below.

Adapters are presets. The dotnet preset runs every command with the MSBuild server, node reuse and
the compiler servers off (`DOTNET_CLI_USE_MSBUILD_SERVER=0`, `MSBUILDDISABLENODEREUSE=1`,
`UseSharedCompilation=false`, `UseRazorBuildServer=false`): they leave the suite's process group and
outlive a stalled suite. A suite's own `env` overrides them. Each capability can be set per suite:

| key | what it does |
| --- | --- |
| `report = "<glob>"` | read the report from here instead of asking the framework for one |
| `${WITNESS_SELECT}` in `cmd` | marks where the runner's arguments go. Witness puts its report args, the per-test timeout and the selection there (nothing when running everything; `${WITNESS_SELECT:-tests/e2e}` gives a default). Selection then works in any command shape: `cd app && pytest ${WITNESS_SELECT:-tests} \| tee out.txt` |
| `select = "<cmd> {ids}"` | a whole command that runs only `{ids}` (or `{id}`, one at a time) |
| `list = "<cmd>"` or `list = { cmd, format, report }` | lists the suite's tests. `format`: `lines` (one id per line; the default when the adapter has no list parser), `adapter` (the adapter's own list output), `report` (the command writes a report, to `$WITNESS_REPORT_DIR` or `report = "<glob>"`, and its test ids are the list) |
| `per_test_timeout_arg = "-timeout {s}s"` | the runner flag for `per_test_timeout` when the adapter has none: `{s}` seconds, `{ms}` milliseconds |

When a suite can't list its tests (no `list`, no adapter listing, or the listing fails), witness
uses the tests of the suite's last complete report: every full run whose report was readable and
whose process exited on its own refreshes `.witness/cache/tests/<suite>.json`. That list feeds
`plan check`, the tests witness looks for when a report is missing, and the per-test reruns, and
the output always names it (`list: last report r-… (2h ago, 12 tests)`). An id from an old report
that no longer exists ends as `other/missing`, never as a failure. `witness check` prints one line
per suite with where `report`, `list`, `select` and the per-test timeout come from, and what each
missing one costs. `docs/witness/FRAMEWORKS.md` has the tested support matrix.

`witness init` reads each test project (per csproj, pytest root, package.json, Maven/Gradle
build, go module, Cargo.toml, `.bats` files, Gemfile, phpunit.xml, Android `src/androidTest`,
Flutter `integration_test`, `*UITests`, Maestro flows, Detox) and classifies its test files from
imports, package references and calls (`src/functional.ts`). A CLI test runs the app's own command:
the console scripts, package `bin`, `cmd/` binaries and cargo bins that the manifests name, a built
binary path, `go run`, or `python -m <pkg>`; a test that calls the command's functions is a unit
test. It proposes a suite only for projects whose tests drive the app, sets `kind` (desktop, mobile,
ui, api, cli: the first one any file needs) and `service = []` when the tests start the app or run
its command themselves. A service that no proposed suite uses is written commented out, with the
reason. A mixed project gets a filtered command when a folder, tag or a few test classes
separate the functional tests; otherwise it is listed as "needs a filter" with its suite commented
out. Every project left out is printed with its reason and written into the file as a comment.
`witness check` warns (it does not fail) when a configured suite's test files don't drive the app.

`witness init --scan` never prompts and writes nothing: it prints JSON facts for the `init` skill to
decide from. Every fact has `confidence` (`high`, `medium`, `low`) and `evidence` (`file:line`, a
file or a manifest):

| key | what |
| --- | --- |
| `testProjects` | each test project as `functional`, `needs-filter` or `excluded`, with the reason, `kind` and the proposed `suite` (`cmd`, `cwd`, `hostsApp`, `filtered`) |
| `services` | the services `init` guesses (start, setup, ready) |
| `commands` | `setup`, `build`, `start`, `test`, `migrate` and `seed` candidates from CI workflows (`${{ env.X }}` resolved), package scripts (`runs` holds the script), Makefiles, justfiles, Procfiles, Dockerfiles, compose, the README and agent instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, Copilot and Cursor rules; medium confidence, `cwd` is the file's folder) |
| `containers` | compose services built from the repo: `docker compose up --build <name>`, ports, `depends_on` |
| `infrastructure` | compose services by image (postgres, redis, ...) with candidate `start`, `stop` and `check` (the compose healthcheck run in the container when there is one); CI service containers; database URLs in env examples and `appsettings*.json` (type and host, never the value); database drivers, low confidence |
| `urls`, `health` | URLs from launch profiles and published compose ports; health and readiness routes in the app's code, with the guessed service |
| `env` | names the app, the tests, CI (`secrets.X`), compose and env examples read: `secret`, `testUser`, `readBy`, `exampleValue` (an example file sets a real value), `envName` for .NET and Spring config keys. Values are never printed |
| `data` | seeds, fixtures, migrations, compose init scripts, and test users (logins from seeds, constants and functional tests) |
| `frameworks`, `adapters` | app and test frameworks and toolchain versions; the witness adapters of the candidate suites |
| `machine` | for the repo's toolchains: whether each tool is on the PATH, the installed .NET SDKs, whether the Docker daemon answers, and the Playwright browsers downloaded (`PLAYWRIGHT_BROWSERS_PATH` or the per-OS cache) |
| `config` | when `.witness/witness.toml` exists: its suites, services, dependencies and required names, what the scan found that it does not cover (`missing`), and entries the scan can't tie to the repo (`unmatched`). Covered facts carry `configured`: the entry's name, or `"comment"` when only a comment in the config names it (a recorded choice). `rendered` is true when morph wrote it |

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
bin/witness skills path [--profile standalone|morph] | list
bin/witness skills install --dir .claude/skills [--profile standalone|morph] [--link] [--prefix witness-]
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
`verify`, `triage`). They are plain procedures that name no agent-specific tool.

`init` is an interview: it reads `witness init --scan`, then settles one decision at a time, at the
stage where it matters (scope, how the app runs, infrastructure, secrets and test data, boot
failures, the baseline run, the commit). Each question carries a recommendation and its evidence;
what the repo already answers is never asked, and "use your defaults" skips every question. The
choices live in `witness.toml` itself (a one-line comment where a value doesn't explain itself), so a
later `init` asks only about what the config doesn't cover. In the morph profile the questions
become blockers in the report.

### Skill profiles

The same skills run in two settings, and each skill source is rendered for one of them:

- `standalone` (the default): a developer's coding agent with the user present. The user answers
  questions and owns the config, the secrets in `.witness/.env` and the commits.
- `morph`: an agent in a morph sandbox with no one to ask. Questions become blockers in the final
  report; morph renders `.witness/witness.toml` and supplies the secrets; expectations come from the
  milestone spec; `node "$WITNESS"` stands in for `witness` when it is not on the PATH; temporary
  files go in `$MCODE_DIR/scratch/`; the final run is full and, when morph asks for parity,
  `--against origin`.

Text for one profile sits between markers, each alone on its line (indenting it is fine):

```markdown
Shared text.

<!-- if morph -->
Only in the morph profile.
<!-- else -->
Only in the standalone profile.
<!-- endif -->

<!-- if standalone -->
Only in the standalone profile.
<!-- endif -->
```

`else` is optional; blocks do not nest. An unknown profile, a marker sharing its line with text, a
marker in the frontmatter, a stray `else`/`endif` or an unclosed `if` is an error naming the file
and line. Rendering drops every marker and the blank line a dropped block would leave doubled.

- `witness skills install --dir <dir> [--profile p]` writes the rendered skills as
  `witness-<name>` (`--prefix` changes that). Morph's vendoring script uses `--profile morph`.
- `witness skills path [--profile p]` renders into `$XDG_CACHE_HOME/witness/skills/<profile>`
  (default `~/.cache/...`) and prints that folder.
- `--link` links each skill to its rendered standalone copy in that folder, keeping its own name.
  It refuses another profile: a sandbox gets copies, and the links refresh whenever witness renders
  again (`skills path` or `install --link`), not when a source file changes.
- `npm run build:plugin` renders the standalone profile into the repo's `morph` Claude Code plugin as
  `plugins/morph/skills/witness-<name>`; commit the result (a test fails when it is stale).
- `npm run check:skills` (also part of `npm test`) checks each skill as every profile renders it:
  the markers, the frontmatter, no agent-specific tool names and the 800-word budget.

A skill can keep detail the agent needs only at one step in reference files: other `.md` files in
its folder (`init/interview.md`), which `SKILL.md` names and tells the agent when to read. They take
the same markers and are rendered per profile by `skills install`, `skills path` and
`build:plugin`. `check:skills` gives each one a budget of 1500 words per profile, runs the same
tool-name check, rejects frontmatter in them, and fails when a profile of `SKILL.md` never names one.

## Adapters

| adapter | report witness asks for | select one test | list | per-test timeout |
| --- | --- | --- | --- | --- |
| pytest | `--junitxml` (xunit1, for file paths) | node ids replace positional args | `--collect-only -q` | `--timeout` (pytest-timeout) |
| junit-maven | surefire/failsafe XML from `target/` | `-Dtest=Class#method` | last report | `-Djunit.jupiter.execution.timeout.default` |
| junit-gradle | `build/test-results/**/*.xml` | `--tests Class.method` | last report | - |
| dotnet | TRX: `--logger trx` (VSTest), `--report-xunit-trx` (xunit v3 on MTP), `--report-trx` (MTP + TrxReport) | `--filter FullyQualifiedName=...`, ANDed into a `--filter` already in `cmd` | `--list-tests` | `--blame-hang-timeout` (VSTest only) |
| jest | `--json --outputFile` (parsed natively) | `-t` | a run whose `-t` matches nothing (every test reported skipped) | `--testTimeout --forceExit` |
| vitest | `--reporter=junit` | `-t` | the same trick as jest | `--testTimeout` |
| playwright | JSON reporter | file + `--grep` | `--list` | `--timeout` |
| go | `go test -json` on stdout | `-run` | `-list .` | - |
| mocha | `--reporter xunit` | `--grep` | `--dry-run` | `--timeout --exit` |
| rspec | `RspecJunitFormatter` (gem required) | `-e` | `--dry-run` | - |
| phpunit | `--log-junit` | `--filter` | `--list-tests` | `--enforce-time-limit --default-time-limit` (php-invoker) |
| bats | `--report-formatter junit --output` | `--filter '^(name)$'` | last report | `BATS_TEST_TIMEOUT` (environment) |
| generic | any JUnit/TRX/JSON in `$WITNESS_REPORT_DIR` or `report = "<glob>"`; else the exit code | `select` template | `list` template | `per_test_timeout_arg` |

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
against, diagnosis) and per-test `extra.witness` (id, suite, kind, services, adapter, obtained, status_detail,
parity, origin_status). Each suite in `status.json` has `kind` and `services`: the services witness
started for it, empty when the tests host the app themselves (they don't exercise those services,
and `--against` with origin services tests the same code twice). `witness report` shows both, and
both `witness status` and `witness report` say why a skipped suite did not run (`not run: service web
service_died`).

Reconciliation, in short: failures in the report are trusted; a clean report with a non-zero exit is
`error` (report_incomplete); a test that was asked for but isn't in the report is `other/missing`; an
unreadable or absent report makes witness rerun each known test alone (when the adapter can list and
select), and otherwise records one suite-level result. Never a pass without evidence: a suite whose
tests were all skipped is `error`; a suite-level row with exit 0 but no report is `other/missing`; a
test rerun alone that exits 0 but is not in its report is `other/missing`; a report file that was
already on disk (unchanged) before the suite started is ignored. A suite whose only failures come from
fixture setup, and a suite that fails to build or whose command is missing (exit 127) before any test
ran, are `error` with cause `setup_failed` (no listing or reruns after a build failure).

A service that fails to boot or dies makes the run a `mistrial`, but suites that don't need it still run.
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
npm run build:plugin     # skills (standalone profile) -> plugins/morph/skills/witness-* (commit it)
npm run check:skills     # every profile, reference files too: markers, word budgets, no harness-specific tool names
npm run conformance -- [framework...] [--jobs n] [--docker name,...] [--scenario s,...]
```

`npm run conformance` is the conformance kit (`conformance/`): one small HTTP app and a real test
project per framework (pytest, jest, vitest, mocha, Playwright, JUnit with Maven and Gradle, go,
RSpec, PHPUnit, xunit v3 on Microsoft.Testing.Platform, MSTest on VSTest, and a CLI tested with
bats). For each it runs witness
through a full run, `--select`, listing, a deleted and a truncated report, a per-test timeout and a
`${WITNESS_SELECT}` compound command, checks the CTRF and `status.json`, and prints a framework ×
scenario matrix (results in `conformance/.results/`). It uses the local toolchain when there is one,
else a Docker image (`--docker <name>` forces it); `KIT_DOTNET=/path/to/dotnet` picks a .NET SDK.
CI runs it per framework on native toolchains.

Fixtures live in `testdata/`: report corpus per framework (including broken files) under
`testdata/reports/`, small node apps for the integration tests under `testdata/apps/`, and one
unit, functional and mixed repo per stack for the `init` classifier under `testdata/functional/`
(CLI stacks under `testdata/functional/cli/`).
