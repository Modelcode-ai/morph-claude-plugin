# Spring PetClinic: witness on Java + Angular (ENG-10594)

Witness at branch `eng-10594` (with `witness-next`: `[[repo]]`, capture, Windows) on fresh upstream
clones of `spring-petclinic-rest` (`220f4ba`, Spring Boot 4, Java 17) and `spring-petclinic-angular`
(`75ed319`, Angular 22, Playwright). The host has no JDK or Maven: every build, test and app run
of the REST repo went through Docker (`maven:3.9-eclipse-temurin-17`, `eclipse-temurin:17-jre`,
`~/.m2` mounted).

## Summary

- **Per-test results match the runner.** MockMvc (`junit-maven`, 138 tests), the repo's Postman
  collection through newman (`generic` + JUnit, 12 assertions) and Playwright (15 mocked + live
  tests) match surefire's `Tests run:` line, newman's assertion table and Playwright's stats,
  passing and failing (`compare.py`).
- **Broken startups are mistrials with the right cause.** Bad DB URL → `dependency_unreachable`
  (`Connection refused`); port held → `port_in_use`, before start; missing build →
  `exited_before_ready` (`no jar in .../target`); wrong ready URL → `ready_timeout` on a steady 404,
  not retryable. Also compile errors, a hanging test, a killed container, a truncated report and
  SIGINT. The same holds for a service of another repo (`rest.app`).
- **An agent with only the skills sets witness up (S1, S2).** One question at a time, with
  evidence; Docker chosen for the missing JDK; in the Angular repo it saw that the e2e tests mock the
  API, and when asked for the real backend it used `[[repo]]` and asked before editing
  `angular.json`. Screenshots and video were switched on (`capture ok`), but not asked about.
- **Real changes, planned and tested by agents (P1, P2, P3, P3b).** All final VERDICTs `passed`,
  `--against` passed with the new tests only on the target, including
  `--against master --against backend=master` across both repos. 14 of 14 mutants failed the new
  tests. P3 skipped the write and verify steps (no lint, no `--against`); its repeat P3b did them.
- Seven Witness bugs were fixed on `eng-10594`, each with a test (list below).

## Files

| path | what |
| --- | --- |
| `rest/witness.toml`, `rest/mvn`, `rest/app` | REST config: a `mockmvc` suite (controller tests, `service = []`) and a `newman` suite against the app; `mvn` runs Maven in Docker with the checkout at its own path, `app` runs a copy of the jar on `127.0.0.1:$PORT` |
| `angular/witness.toml`, `angular/playwright*.config.ts` | Angular config: `web` (ng serve on a witness port), the upstream e2e suite (mocked API) and an `e2e-live` suite against the REST app through `[[repo]] rest`; screenshots and video under `WITNESS_EVIDENCE` |
| `compare.py` | CTRF counts vs the collected JUnit/JSON reports vs the runner's own summary: `python3 compare.py <run dir>` |
| `patches/rest`, `patches/angular` | the eval branches (`git am` on the upstream commits above; the Angular config expects the REST checkout at `../spring-petclinic-rest-witness-eval`) |
| `patches/sessions/` | what each agent session changed: S1/S2 setups, P1 (owners `city` filter), P2 (reject future visit dates), P3 (City search, both repos) |

## Results

| check | result | evidence |
| --- | --- | --- |
| counts vs runner | match, 6 runs | e.g. baseline `mockmvc 138/138/138`, `newman 12/12/12`; failing run `135+3` = surefire `Failures: 3` |
| bad DB URL | `mistrial`, `dependency_unreachable` | `Caused by: java.net.ConnectException: Connection refused`; the in-process suite still ran |
| port taken (pool, and the app's fixed port) | `mistrial`, `port_in_use` | `port 19966 (in ready.http ...) already accepts connections before app started` |
| missing build | `mistrial`, `exited_before_ready` | `no jar in .../target; run the setup (mvn package) first`; setup reruns next time |
| S1 REST init | pass | 3 questions (scope, Docker, commit); `CHECK ok`; 138 + 12 baseline |
| S2 Angular init + `[[repo]]` | pass; capture not asked | 16/16 tests with screenshot, video and trace |
| P1 owners city filter | pass, 4/4 mutants | `VERDICT passed · 165 passed, 0 failed · 2 suite(s) · against HEAD: origin passed, 0 differ` |
| P2 future visit dates | pass, 3/3 mutants | `VERDICT passed · 155 passed, 0 failed · 2 suite(s) · against master: origin passed, 0 differ` |
| P3 City search, two repos | partial (no verify step), 4/4 mutants | mine: `VERDICT passed · 20 passed · against master, backend=master: origin passed, 0 differ` |
| P3b repeat | pass, 3/3 mutants | `VERDICT passed · 20 passed · against master, backend=merge base with origin/master: origin passed, 0 differ` |

Six sessions cost $10.18 in total.

## Witness bugs fixed (eng-10594)

1. Maven and npm failures named their boilerplate as evidence (`[ERROR] [Help 1] http://...`,
   `[ERROR] COMPILATION ERROR :`, `npm error A complete log ...`); now the compiler's
   `File.java:[line,col]` line. `report_incomplete` adds the log's error line (JaCoCo's gate).
2. A suite's Playwright attachments were lost when a later Playwright suite cleared the same output
   folder; they are copied right after each suite.
3. A cached setup stayed skipped after its output was deleted (`mvn clean`, `node_modules`); a boot
   failure after a cached skip now reruns setup next time.
4. The scan said Java was installed because macOS ships a `/usr/bin/java` stub.
5. init's Spring Boot guess ignored `server.servlet.context-path` and the Maven wrapper.
6. The base side of `--against` listed tests from this checkout's last report, so a suite whose
   tests are all new read `differs` instead of `only on target`.
7. The base worktree had no `.witness/scratch/`, so a setup that copies its build there failed.

## Still open

- init proposes `mvn -B verify` with a `-Dtest` filter: it runs the coverage gate (JaCoCo fails on
  the subset) and repackages the jar under a running app. Both agents and I hit it.
- The scan misses the Postman/Newman suite (`newman-pipeline.yml`, `postman-tests.sh`); there is
  no newman adapter, so no list, select or per-test timeout. Agents had to read the bundled CLI
  (`strings`) to learn what `generic` reads.
- A suite whose tests are all new ends `origin error (report_missing ...: no comparison)`, because
  Playwright exits 1 on "No tests found" on the base.
- A per-test timeout gives `VERDICT failed · 137 passed, 0 failed · 1 error`.
- `[[repo]]`'s default base is the merge base with `origin/master`, not a local `master` that is
  ahead of it.
