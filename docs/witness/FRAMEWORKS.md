# Witness framework support

## TL;DR

Every adapter has now run for real. The conformance kit (`packages/witness/conformance/`) runs
witness against a small real test project per framework, all calling one shared HTTP app that
witness starts as a `[[service]]`. One project, `cli-bats`, tests a command-line client of that app
(`kind = "cli"`). On 2026-11-23 (macOS arm64, Node 24.15) all 13 projects passed every scenario that
applies to them: 89 pass, 2 n.a., 0 fail. The two n.a. cells are per-test timeouts that the
framework has no command-line flag for.

```bash
cd packages/witness
npm run conformance                          # every framework
npm run conformance -- jest go --jobs 2      # some of them
npm run conformance -- --docker phpunit      # force the Docker toolchain
KIT_DOTNET=/path/to/dotnet npm run conformance -- dotnet-xunit
```

CI runs the same kit once per framework on native toolchains (`.github/workflows/validate.yml`,
job `witness-conformance`).

## Matrix

| framework | toolchain | full | select | list | missing | broken | timeout | compound | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pytest | local | pass | pass | pass | pass | pass | pass | pass | pass |
| jest | local | pass | pass | pass | pass | pass | pass | pass | pass |
| vitest | local | pass | pass | pass | pass | pass | pass | pass | pass |
| mocha | local | pass | pass | pass | pass | pass | pass | pass | pass |
| playwright (UI, Chromium) | local | pass | pass | pass | pass | pass | pass | pass | pass |
| cli-bats (CLI) | local | pass | pass | pass | pass | pass | pass | pass | pass |
| junit-maven | docker `maven:3.9-eclipse-temurin-17` | pass | pass | pass | pass | pass | pass | pass | pass |
| junit-gradle | docker `gradle:8.14.3-jdk17` | pass | pass | pass | pass | pass | pass | pass | pass |
| go | local | pass | pass | pass | pass | pass | pass | pass | pass |
| rspec | docker `ruby:3.4-slim` | pass | pass | pass | pass | pass | n.a. | pass | pass |
| phpunit | local | pass | pass | pass | pass | pass | pass | pass | pass |
| dotnet: xunit v3 on Microsoft.Testing.Platform | local SDK 11 | pass | pass | pass | pass | pass | n.a. | pass | pass |
| dotnet: MSTest on VSTest | local SDK 11 | pass | pass | pass | pass | pass | pass | pass | pass |

Whole kit with `--jobs 3`: about 3 minutes once dependencies are installed.

Each project has four tests: one passes, one fails on an assertion about the response, one is
always skipped, and one hangs on `/api/hang` (a URL that never answers). In `cli-bats` the tests
run `cli/kit-items` (a Node CLI that reads `$WITNESS_APP_URL`) and check its output; the hang is
the CLI waiting on `/api/hang`. The hanging test runs only
when `WITNESS_KIT_HANG=1`; otherwise it skips itself. Every scenario checks the CTRF rows by stable
id and the suite entry in `status.json`:

| scenario | what witness must do |
| --- | --- |
| full | exactly 4 rows: passed, failed, skipped, skipped; `obtained = report`; suite `failed` with counts 1/1/2; exit 1; the failure message names the wrong value |
| select | `--select` of the passing and failing tests gives exactly those 2 rows; selecting the passing test alone, twice in a row, gives a passed row each time |
| list | `witness plan check` lists exactly the 4 ids, from the expected source (`native`, or `last-report` for Maven, Gradle and bats), and reports a made-up id as missing |
| missing | the report is deleted after the run: cause `report_missing`, each test rerun alone (`obtained = per-test-rerun`), the same 4 statuses |
| broken | the report is truncated: cause `report_unreadable`, then the same as `missing` |
| timeout | with `per_test_timeout` and the hang enabled, the hung test is `failed` with `status_detail = timeout`, the other 3 keep their statuses, and the suite finishes on its own |
| compound | `cd … && runner ${WITNESS_SELECT} && echo done`: a selection and a full run both give the right rows |
| evidence | the passing test's own adapter (a few lines of test code per project) writes `evidence.jsonl`; witness ties it to the test, it validates, and an `http` (or `cli`) observation shows status 200 (exit 0). Playwright: the preset's `--trace=on` trace, collected from the report's attachments. See [EVIDENCE.md](EVIDENCE.md) |

## Versions and capabilities

The capabilities are what `witness check` prints for the kit's suite.

| framework | tested versions | report | list | select | per-test timeout |
| --- | --- | --- | --- | --- | --- |
| pytest | Python 3.14.3, pytest 9.1.1, pytest-timeout 2.4.0 | `--junitxml` | native `--collect-only -q` | native (rewrites positional args) | native `--timeout` (needs pytest-timeout) |
| jest | jest 30.5.2 | `--json --outputFile` | native: a run whose `--testNamePattern` matches nothing reports every test as skipped without running it | native `-t` | native `--testTimeout --forceExit` |
| vitest | vitest 5.0.5 | junit reporter | native: the same trick with `-t` (`vitest list` leaves out skipped tests) | native `-t` | native `--testTimeout` |
| mocha | mocha 12.0.2 | `--reporter xunit` | native `--dry-run` | native `--grep` | native `--timeout --exit` |
| playwright | @playwright/test 1.60.0, Chromium build 1223 | JSON reporter | native `--list` | native: file + `--grep` | native `--timeout` |
| junit-maven | Maven 3.9.16, Temurin 17.0.20, Surefire 3.5.3, JUnit 5.12.2 | `target/surefire-reports` | last report | native `-Dtest=` | native `-Djunit.jupiter.execution.timeout.default` |
| junit-gradle | Gradle 8.14.3, JDK 17, JUnit 5.12.2 | `build/test-results` (witness adds `--rerun`) | last report | native `--tests` | none; the kit uses `per_test_timeout_arg = "-PkitTestTimeout={s}"`, which its `build.gradle` turns into the JUnit property |
| go | go 1.25.6 | `-json` on stdout | native `-list .` | native `-run` | none; the kit uses `per_test_timeout_arg = "-timeout {s}s"` |
| rspec | Ruby 3.4.13, rspec-core 3.13.7, rspec_junit_formatter 0.6.0 | RspecJunitFormatter | native `--dry-run` | native `-e` | none |
| cli-bats | Node 24.15.0, bats 1.13.0 (npm) | `--report-formatter junit --output` | last report | native `--filter '^(name)$'` | native: `BATS_TEST_TIMEOUT` in the environment |
| phpunit | PHP 8.5.4, PHPUnit 12.5.40, php-invoker 6.0.0 | `--log-junit` | native `--list-tests` | native `--filter` | native `--enforce-time-limit --default-time-limit` |
| dotnet (xunit v3, MTP) | SDK 11.0.100, xunit.v3 4.0.3 | `--report-xunit-trx` | native `--list-tests` | native `--filter` | none |
| dotnet (MSTest, VSTest) | SDK 11.0.100, MSTest 4.5.3, Microsoft.NET.Test.Sdk 18.12.0 | `--logger trx` | native `--list-tests`; class names from the last report | native `--filter` | native `--blame-hang-timeout` |

"last report" means the tests of the suite's last complete report, cached in
`.witness/cache/tests/<suite>.json`. A suite can override any of these: `report`, `list`, `select`,
`${WITNESS_SELECT}` and `per_test_timeout_arg` (see the package README).

## Known limits

- **Go and Gradle per-test timeout.** Neither has a per-test flag. Go's `-timeout` limits the whole
  test binary, so it works as a per-test limit only when every test is short. Gradle does not pass
  `-D` to the test JVM, so the build has to forward a property.
- **RSpec and xunit v3 per-test timeout.** No command-line option exists. A hung test holds the suite
  until `timeout` or `stall_timeout`; `witness check` says so.
- **PHPUnit time limits** need `phpunit/php-invoker` and the pcntl extension. They don't interrupt
  blocking I/O: in the kit the hung HTTP call returned only after PHP's 60s `default_socket_timeout`,
  so the timeout run takes 64s. PHPUnit reports the aborted test as risky, which JUnit shows as a
  pass. Witness reads the console line "This test was aborted after N seconds" and records the test
  as `failed`/`timeout`.
- **VSTest `--blame-hang-timeout`** kills the test host, and the hung test is not in the TRX. Witness
  takes its name from the console ("The test running when the crash occurred") and adds a
  `failed`/`timeout` row. Collecting the hang dump makes that run take about 35s.
- **MSTest listings** have no class names. Witness fills them in from the last report; before the
  first full run, `plan check` matches on the method name only.
- **bats** has no listing flag; witness lists from the last complete report, like Maven and Gradle.
  Its timeout comes from `BATS_TEST_TIMEOUT`, and the failure reads "`cmd' failed due to timeout".
- **Maven and Gradle listing** is the last complete report. Tests added since that run are unknown
  until the next full run. Ids from that report that no longer exist end as `other/missing`, never
  `failed`.
- **go reports.** The report is stdout. Output with no JSON events is `report_unreadable`, not
  `report_missing`. A cut stream keeps the tests it finished and reruns the rest.
- **jest and mocha** keep running after a timed-out test while its request is still open. Witness
  adds `--forceExit` / `--exit` together with the per-test timeout. Without `per_test_timeout`, a
  stall diagnosis quotes jest's "did not exit" line and suggests `--forceExit`.
- **Docker toolchains.** Maven, Gradle and RSpec ran in Docker on this Mac (no Java, Ruby 2.6).
  pytest, go, phpunit and dotnet ran on local toolchains. Their Docker fallbacks (`--docker <name>`)
  are defined in `conformance/frameworks.ts` but were not run.
