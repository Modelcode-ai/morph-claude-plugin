# Witness end-to-end evaluation (final branch)

Witness at `eng-10581` (5a634d6), run on 2026-11-23. Four sessions ran the witness skills in separate
Claude Code processes (`claude -p`, Claude Code 2.1.330, model `claude-opus-5-5`). Until now, only
the agents that built the skills had followed them.

## TL;DR

- **Gates are green.** `npm test` passed (220 tests), and so did `typecheck` and `check:skills`. The
  conformance kit gave 89 pass, 2 n.a. and 0 fail on 13 frameworks, the same matrix as
  `FRAMEWORKS.md`.
- **eShopOnWeb with the final CLI matches phase 2 exactly.** `CHECK ok`; then
  `VERDICT passed · 201 passed, 0 failed · 1 skipped`. Against `eng-10574-base`: 200 same, 0 differ
  and 2 only on target.
- **With the user present, the init interview works when init is the task.** Session 1 asked 3
  questions, one at a time and in stage order. It kept the scope override in `witness.toml`, got
  `CHECK ok`, ran a baseline and committed only what I approved. **Defaults mode works:** session 2
  asked nothing and ended with a working config and three passing baselines.
- **Two failures in the standalone `test-change` path (session 3):**
  1. The request "add X and make sure it's tested" did not trigger `test-change`. The agent wrote
     unit and integration tests, ran `dotnet test` directly and reported done. It used witness only
     after I said "Test this change with witness."
  2. Run from inside `test-change`, `init` asked the user nothing. It chose a medium-confidence scope
     and changed two build files to add a test package without asking, though session 1 asked about
     both.
- **The tests the agents wrote catch real bugs.** I broke the feature three ways (filter ignored,
  case-sensitive, wrong page count). For sessions 3 and 4, every mutant failed the plan's selected
  tests.
- **Morph profile (session 4) is close.** It asked no questions, took expectations from the request
  and committed the tests, plan and config. Its report does not list the defaulted decisions as
  blockers, though `interview.md` says it should.
- **One Witness bug, reproduced:** `lint` does not see MSTest `CollectionAssert.*` or
  `StringAssert.*` as assertions (`src/lint.ts:254`). In session 3, that false `status-only` error
  made the agent rewrite a correct assertion. Not fixed: it did not block the evaluation.
- **No fixes were made.** No `eng-10583-eval-fixes` branch was needed.

## A. Gates

Branch `eng-10581` at 5a634d6, in `packages/witness`. Logs:
`/private/tmp/claude-501/-Users-dserebro-work/82d0b087-6e41-4c1b-85eb-f9b2eafa8b64/scratchpad/e2e-eval/gates/`.

| gate | result | time |
| --- | --- | --- |
| `npm test` | 220 pass, 0 fail (33 suites) | 16s |
| `npm run typecheck` | exit 0 | - |
| `npm run check:skills` | `check-skills: ok`; largest: write 799/799, init 644/634, interview.md 1341/1252 (standalone/morph) | - |
| `KIT_DOTNET=.../dotnet11/dotnet npm run conformance` | exit 0, matrix below | 8m07s (run next to part B and session 1) |

| framework | toolchain | full | select | list | missing | broken | timeout | compound |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pytest | local | pass | pass | pass | pass | pass | pass | pass |
| jest | local | pass | pass | pass | pass | pass | pass | pass |
| vitest | local | pass | pass | pass | pass | pass | pass | pass |
| mocha | local | pass | pass | pass | pass | pass | pass | pass |
| playwright | local | pass | pass | pass | pass | pass | pass | pass |
| cli-bats | local | pass | pass | pass | pass | pass | pass | pass |
| junit-maven | docker `maven:3.9-eclipse-temurin-17` | pass | pass | pass | pass | pass | pass | pass |
| junit-gradle | docker `gradle:8.14.3-jdk17` | pass | pass | pass | pass | pass | pass | pass |
| go | local | pass | pass | pass | pass | pass | pass | pass |
| rspec | docker `ruby:3.4-slim` | pass | pass | pass | pass | pass | n.a. | pass |
| phpunit | local | pass | pass | pass | pass | pass | pass | pass |
| dotnet-xunit | local SDK 11 | pass | pass | pass | pass | pass | n.a. | pass |
| dotnet-mstest | local SDK 11 | pass | pass | pass | pass | pass | pass | pass |

Results file: `packages/witness/conformance/.results/2026-11-23T21-08-32-555Z.json`.

## B. eShopOnWeb with the final CLI

The eval checkout is `~/work/witness-targets/eShopOnWeb-witness-eval`, branch `eng-10574` at
78b9f19. I used the config from `eval/eshoponweb/README.md`: the app runs in Docker, and e2e runs
on the host against it. The binary was the final `packages/witness/bin/witness`. Logs:
`/private/tmp/claude-501/-Users-dserebro-work/82d0b087-6e41-4c1b-85eb-f9b2eafa8b64/scratchpad/e2e-eval/B/`.

| step | result | time | run id | phase 2 |
| --- | --- | --- | --- | --- |
| `witness check` | `CHECK ok`. Lists functional 56, publicapi 106 and e2e 3; web was ready in 11s | 26s | - | same |
| `witness run --label e2e-eval-full` | `VERDICT passed · 201 passed, 0 failed · 1 skipped · 3 suite(s) · 24s`: functional 56, publicapi 143, e2e 2 plus 1 skipped | 24s | `r-20261123-130207-d206` | `r-20261123-114906-feed`: 201 passed, 1 skipped |
| `witness run --against eng-10574-base` | `VERDICT passed · 201 passed, 0 failed · 1 skipped · 3 suite(s) · against eng-10574-base: origin passed, 0 differ · 1m19s`. Parity: 200 same, 0 differ, 2 only on target (the two basket tests), 0 only on origin | 1m19s | `r-20261123-130236-a48b` | `r-20261123-113535-35a0`: same parity |

Afterwards the eval checkout was clean, and no `witness-dn-*` container or temporary
`witness-against-*` worktree was left.

## C. Independent agent sessions

### Setup

- Each session ran in its own `cp -R` copy of the clean clone `~/work/witness-targets/eShopOnWeb`
  (aed6281), under
  `/private/tmp/claude-501/-Users-dserebro-work/82d0b087-6e41-4c1b-85eb-f9b2eafa8b64/scratchpad/e2e-eval/<run>/repo`.
  The clone itself was not touched.
- The driver script is `.../e2e-eval/turn.sh`. It runs `claude -p` with `--output-format json`,
  `--max-budget-usd 15`, `--permission-mode auto` and no `--add-dir`. `auto` was never in the way: 0
  permission denials across all sessions.
- Standalone sessions (1-3) got `--plugin-dir .../eng-10581/plugins/morph`. I disabled the
  user-installed `morph@modelcode-morph` 0.4.0 through `--settings`, because it has the same plugin
  name and no witness skills.
- PATH started with a scratch `bin/` (a symlink to the final `bin/witness`), then the SDK 11 folder.
  `DOTNET_ROOT` and `DOTNET_HOST_ROOT` pointed at
  `~/work/witness-targets/.tools/dotnet11`. These were set from the first turn, so no session needed
  to ask about the SDK, and none did.
- `commit.gpgsign=false` was set in each copy's `.git/config`, so a session's commit could not wait
  on 1Password.
- Raw output for each session is in `.../e2e-eval/<run>/raw/`: `turn-N.json` (the `claude -p` JSON)
  and `<session_id>.jsonl` (the full transcript).
- Costs are `total_cost_usd` from the last turn. Claude Code reports it cumulatively across resumes.

| session | session id | turns | questions | cost | agent time |
| --- | --- | --- | --- | --- | --- |
| 1. interview | `3b15b43d-c12a-4b1f-a0ce-10ed12714565` | 4 | 3 | $0.76 | 2m25s |
| 2. defaults | `776227cc-707e-4b53-838d-89caf4caf2ed` | 1 | 0 | $0.70 | 2m33s |
| 3. test-change | `8a2b6cab-abaf-4783-9100-828a47d12f9e` | 2 | 0 | $2.16 | 9m22s |
| 4. morph | `bba7bfad-93e2-4627-a4c7-eaa33a18f185` | 1 | 0 | $1.53 | 7m32s (wall 9m28s) |

### Session 1: interview, standalone

Prompt: "Set up witness for this repo so I can run its functional tests."

The agent loaded `witness-init`, ran `witness init --scan` and read `interview.md`. It checked
`DependencyTests.cs` and the SDKs before it asked anything.

**Q1 (stage 1, scope)**, trimmed:

> **Scope: which test projects become witness suites.** I recommend three suites:
> 1. **`functionaltests`** ... 12 files start the app with `WebApplicationFactory` ... e.g. `tests/FunctionalTests/Web/Endpoints/UserEndpoints/LogoutEndpointTest.cs:20`.
> 2. **`endtoendtests`** ... They need Playwright's Chromium installed. CI installs it with `pwsh .../playwright.ps1 install` (`.github/workflows/dotnetcore.yml:33`), but `pwsh` isn't on this machine, so you'd have to install the browser yourself.
> 3. **`publicapiintegrationtests`** ... with a filter ... medium-confidence ... `DependencyTests.cs` only checks that the obsolete `BlazorInputFile` package isn't a dependency ...
>
> I'd leave out `tests/UnitTests`, `tests/IntegrationTests` (database access only) and `tests/AppHostTests` ...
> Other options: Drop the browser suite for now ... Keep `PublicApiIntegrationTests` unfiltered ...
> Shall I go ahead with the three suites as proposed?

**A1 (the override):** "Leave out the browser suite (EndToEndTests) for now, I don't want browser
tests in witness yet. The other two as you proposed, with the DependencyTests filter."

The agent wrote `witness.toml` with the two suites and recorded the override as
`#   tests/EndToEndTests: left out, browser (Playwright) tests not wanted in witness yet (user's choice)`.
It settled stages 2 to 4 from the repo without asking: no services, `sqlserver` not needed (with
the fixture lines as evidence), and a comment naming the unused secrets. Then it ran `witness check`.

**Q2 (stage 5, check)**, trimmed:

> **Per-test report for `publicapiintegrationtests`.** This project runs on the MSTest runner (`EnableMSTestRunner`, `PublicApiIntegrationTests.csproj:8`) under Microsoft.Testing.Platform (`global.json:7`). It has no TRX reporter ...
> I recommend adding the reporter package ... `PublicApiIntegrationTests.csproj` ... `Directory.Packages.props` ...
> Other options: **Leave the suite out for now.** ... **Keep it without a report.** ... I wouldn't do it ...
> Shall I add the TRX reporter package?

**A2:** "Yes, add the TRX reporter package."

The agent added TrxReport 2.5.3 (matching MSTest 4.5.3) and re-ran `witness check`. Then it ran
the baselines: `init-functionaltests` (`r-20261123-130438-332a`, passed, 54) and
`init-publicapiintegrationtests` (`r-20261123-130449-8954`, passed, 143).

**Q3 (stage 7, commit)**, at the end of the report:

> Nothing is committed yet. I'd commit `.witness/witness.toml`, `.witness/.gitignore` and the two project-file edits, but not `.witness/.env` or `.witness/runs/`. Should I commit them?

**A3:** "Yes, commit the config."

The agent created branch `chore/witness-setup` and committed `9907dcb` with the four files it had
listed. It then asked whether to push and open a PR. I did not answer.

Final diff against aed6281: `.witness/witness.toml` (+43), `.witness/.gitignore` (+8),
`Directory.Packages.props` (+1) and `PublicApiIntegrationTests.csproj` (+1). VERDICTs printed:
`passed · 54 passed` and `passed · 143 passed`. I re-ran `witness check` on the committed config and
got `CHECK ok`.

| check | score | evidence |
| --- | --- | --- |
| one decision at a time, in order, each with a recommendation and evidence | partial | Q1 and Q2 each have a recommendation, `file:line` evidence and options, in stage order 1, 5, 7. Q1's browser evidence is wrong: Chromium 1248 is already in `~/Library/Caches/ms-playwright`, which session 2 found. Q3 gives no evidence or options, and its recommendation (commit) is the opposite of `interview.md` stage 7's default ("do not commit") |
| asks nothing the repo answers | pass | The scope question is warranted (PublicApi is medium confidence). The TrxReport question changes build files outside `.witness/`. Stages 2-4 were settled from the repo and stated in the report |
| override respected in `witness.toml` | pass | e2e absent, with a comment saying it was the user's choice |
| `witness check` passes | pass | `CHECK ok` (my re-run) |
| baseline | pass | one `init-<suite>` run per suite, both passed |
| commits only what was approved | pass | the four files named in Q3. It also made a branch it was not asked for, which is harmless |

### Session 2: defaults

Prompt: "Set up witness for this repo using your defaults."

It asked no questions. In one turn it did the following:

- wrote a three-suite config (endtoendtests, functionaltests and publicapiintegrationtests with the
  filter);
- added TrxReport as a default, the same choice as the ENG-10581 self-check;
- checked the dev certificate (`dotnet dev-certs https --check`) and the SDK;
- ran the three baselines: functional `r-20261123-130600-d8a2` (54 passed), publicapi
  `r-20261123-130610-9bb1` (143 passed) and e2e `r-20261123-130616-b609` (2 passed, 1 skipped).

Each VERDICT passed. The report splits the decisions into "from the repo's facts" and "my defaults",
and makes no commit, as `interview.md` stage 7 says.

The config diff matches session 1 plus the e2e suite, with comments for the variables it left out,
`sqlserver` and the test users. It wrote no `required` entry for the SDK, because SDK 11 was already
first on PATH. The config therefore works only with that PATH. It said so in its report, but not in
the config.

| check | score | evidence |
| --- | --- | --- |
| no questions | pass | 1 turn, the report ends with no question |
| working config or a clear blocker report | pass | `CHECK ok`, three baselines passed |
| side note | - | It wrote the scan JSON and run logs to the shared `/tmp` (`/tmp/witness-scan.json`, `/tmp/witness-run-*.log`), not `.witness/scratch/`. I moved them to `raw/tmp-files/` |

### Session 3: full test-change, standalone

**Turn 1 prompt:** "Add an optional `name` filter (case-insensitive contains) to GET
/api/catalog-items in PublicApi and make sure it's tested."

The agent did not load any witness skill. It implemented the filter and added unit tests and 8
PublicApi integration tests. It checked them by removing the filter by hand, then ran `dotnet test`
directly ("101 unit tests and 152 PublicApi integration tests"). It reported done without
mentioning witness.

**Turn 2 prompt (my nudge):** "Test this change with witness."

- **test-change and init.** It loaded `witness-test-change`, found no config and followed
  `witness-init`. It asked no questions. The report says: "I made these choices from what the repo
  shows rather than asking you." These choices included the medium-confidence PublicApi scope and
  the TrxReport change to two build files.
- **Baseline.** It ran the baselines on the unchanged code by stashing only the feature's files
  (`git stash push -m feature-name-filter -- src tests/...`, in the copy's own `.git`): publicapi
  `r-...131111-dd60` (143), functional `r-...131121-f395` (54) and e2e `r-...131136-367e`.
- **plan.** It wrote `.witness/plan.yaml` with 7 items: P1-P4 `new` (P3 and P4 marked "not in the
  request") and P5-P7 `parity` (P7 is the Web home page, which shares the changed specifications).
  It then ran `witness plan check --draft`.
- **write.** `witness lint` flagged an existing test, `ReturnsBadRequestGivenInvalidPaging`, as
  `status-only` for P6. The agent rewrote it to parse the error body and changed P6's `expect`. Lint
  still failed while the test used `CollectionAssert.Contains(errorFields, invalidField)`. The agent
  read the lint rules and switched to `Assert.Contains`, and lint passed (finding D3). The plan's
  selection gave `VERDICT passed · 20 passed` (`r-...131447-0c3d`).
- **verify.** `witness run --label verify-1 --against HEAD`, output redirected to `.witness/scratch/`.

**VERDICT reported:**
`witness  VERDICT passed · 207 passed, 0 failed · 1 skipped · 3 suite(s) · against HEAD: origin error, 0 differ · 56s`
(`r-20261123-131505-dfd4`). This matches `.witness/scratch/verify-1.out` character for character.
The agent explained "origin error" correctly. HEAD lacks the TrxReport package, so the origin's
publicapi suite was `report_missing`. It pointed to the baseline run as the parity evidence for that
suite (finding D4).

It edited no files under `.witness/runs/`; the transcript has only reads there.

**Mutation check (mine).** I ran three mutants with the session's selection (the `--select` line
from `witness plan check`, 20 tests) and restored the source afterwards:

| mutant | VERDICT | failed tests | run id |
| --- | --- | --- | --- |
| M1: endpoint ignores `name` | `failed · 15 passed, 5 failed` | FiltersByNameCaseInsensitively ×3, CombinesNameFilterWithBrandFilter, ReturnsNoItemsWhenNameMatchesNothing | `r-20261123-131738-98c5` |
| M2: case-sensitive `Contains` | `failed · 15 passed, 5 failed` | FiltersByNameCaseInsensitively ×3, CombinesNameFilterWithBrandFilter, PageCountReflectsNameFilter | `r-20261123-131804-0918` |
| M3: count spec ignores `name` (wrong PageCount) | `failed · 18 passed, 2 failed` | PageCountReflectsNameFilter, ReturnsNoItemsWhenNameMatchesNothing | `r-20261123-131819-cdf9` |

Final diff: 4 source files (+30/-5), `CatalogItemListPagedEndpoint.cs` tests (+96/-8, 5 new tests
plus the strengthened one), 2 unit-test files (+65), TrxReport (+2), and the new `.witness/`
(`witness.toml`, `plan.yaml`, `.gitignore`). Nothing was committed.

| check | score | evidence |
| --- | --- | --- |
| the request reaches `test-change` | fail | turn 1 used no witness skill and claimed done |
| init's questions (user present) | fail | 0 questions in turn 2, vs 2 for the same decisions in session 1 |
| plans (`.witness/plan.yaml`) | pass | 7 items with sources; `PLAN ok · 11 found` |
| functional tests in the repo's framework (publicapi, api kind) | pass | MSTest, in the existing `CatalogItemListPagedEndpoint.cs`, through `ProgramTest.NewClient`. The unit tests are extra and outside witness, as the rules allow |
| runs `witness run` and reports the VERDICT witness printed | pass | as above |
| never edits `.witness/runs` | pass | transcript |
| new tests fail when the feature breaks | pass | 3/3 mutants caught |

### Session 4: morph profile

- **Setup.** I installed the skills into `.claude/skills` with
  `witness skills install --dir .claude/skills --profile morph --prefix witness-` and hid them with
  `.git/info/exclude`. The plugin was not loaded and `witness` was not on PATH.
  `WITNESS=.../packages/witness/dist/witness.mjs` and `MCODE_DIR=<scratch>/mcode` (with `scratch/`).
- **The change.** To match a morph milestone, the change already existed when the session started.
  I committed my own implementation as `29d464e` on branch `milestone-1`, with no tests. I checked it
  with curl first: `?name=MUG` returns 2 items.
- **Prompt:** "Test the change for milestone 1: Add an optional `name` filter (case-insensitive
  contains) to GET /api/catalog-items in PublicApi and make sure it's tested. Follow
  witness-test-change."

What it did:

- **Finding witness.** It found `witness` missing and used `$WITNESS`. Its first try,
  `W="node $WITNESS"; $W ...`, failed in zsh, and it then ran `find / -name witness.mjs` before it
  switched to a shell function.
- **Init.** It ran `init --scan` into `$MCODE_DIR/scratch/scan.json` and read `interview.md`, whose
  morph text says "take its default and add a blocker to your report". It wrote a three-suite config
  with the `sqlserver` comment, added TrxReport, got `CHECK ok` and ran the baselines.
- **Plan and tests.** It wrote 7 plan items (5 new, 2 parity) sourced to "user request ... commit
  29d464e message. No milestone spec file found in the repo." It added 6 tests in
  `CatalogItemListPagedEndpoint.cs`. Lint flagged the existing `ReturnsBadRequestGivenInvalidPaging`
  as `status-only`, so the agent dropped that parity item rather than edit the test.
- **Its own mutation check.** It restored the pre-change source (`git checkout HEAD~1 -- src/...`)
  and found that 2 of its 5 new tests still passed. It tightened them and re-ran, and all 5 failed.
- **Verify.** It ran the full suites without `--against`; morph did not ask for parity.
- **Commit.** It committed `7d3d84b` (tests, plan, `witness.toml`, `.gitignore`, TrxReport) on
  `milestone-1`. It did not push.

**VERDICT reported:** `witness  VERDICT passed · 205 passed, 0 failed · 1 skipped · 3 suite(s) · 28s`
(`r-20261123-132526-d8ff`). It matches `.witness/scratch/verify-1.out`.

My mutation check with the session's selection (9 tests) gave these results:

| mutant | result | run id |
| --- | --- | --- |
| M1 pre-change source | `failed · 4 passed, 5 failed` | `r-20261123-132719-b810` |
| M2 case-sensitive | `failed · 5 passed, 4 failed` | `r-20261123-132727-4e7a` |
| M3 wrong count | `failed · 7 passed, 2 failed` | `r-20261123-132735-e123` |

| check | score | evidence |
| --- | --- | --- |
| asks no questions | pass | 1 turn, no question |
| blockers recorded in the final report instead | partial | The report has a "Gaps" section (no spec file, paging item dropped, the baseline ran on the changed commit). It does not list the decisions `interview.md` says become blockers: the medium-confidence PublicApi scope and the TrxReport change |
| expectations from the request (milestone spec) | pass | plan `source`; P4 and P5 are marked "follow from the code" |
| uses `$MCODE_DIR/scratch` | partial | the scan went there; run output went to `.witness/scratch/`, which the same skill's "Long commands" section names. Nothing went to `/tmp` |
| commits tests, plan and config | pass | `7d3d84b` |
| new tests fail when the feature breaks | pass | 3/3 mutants caught |

## D. Findings, by severity

1. **High: a plain "make sure it's tested" request does not reach `test-change`.** In session 3
   turn 1, with the plugin loaded, the agent ran `dotnet test` and reported done. The skill's
   description ("Use after implementing a feature ... or whenever you are asked to test, verify or
   validate a change") did not win against the agent's habit of running the repo's tests. Witness
   was used only after the user named it. Users who don't know to say "witness" never get it. The
   description needs a stronger trigger (for example "before you report a feature or fix as done"),
   or the plugin needs a hook.
2. **High: inside `test-change`, the standalone `init` interview asked no questions.** Session 3
   settled the PublicApi scope (medium confidence) and edited `Directory.Packages.props` and a csproj
   without asking. Session 1 asked about both decisions when init was the task. The agent's words:
   "I made these choices from what the repo shows rather than asking you." `test-change` step 2
   ("follow the `init` skill. Continue only when `witness check` passes") reads as a step to get
   through. It should say that init's questions still go to the user and that the agent waits.
3. **Medium (Witness bug): lint does not count MSTest `CollectionAssert.*` / `StringAssert.*` as
   assertions.** `COMMON_ASSERT` (`src/lint.ts:254`) needs a word boundary before `assert`, so
   `CollectionAssert.Contains(` and `StringAssert.Contains(` don't match, and no `cs` pattern covers
   them. I reproduced it in session 3's copy. With
   `CollectionAssert.Contains(errorFields, invalidField)` or
   `StringAssert.Contains(string.Join(",", errorFields), invalidField)` after the 400 check, lint
   reports `status-only: P6 ... only checks the status code`. `Assert.Contains(...)` and
   `Assert.IsTrue(errorFields.Contains(...))` pass. The same gap would make `no-assertion` fire on a
   test whose only assertions use these classes, in NUnit too. Effect in this evaluation: session 3
   rewrote a correct assertion to satisfy the linter. Not fixed, because it did not block the
   evaluation.
4. **Medium: after `init` changes build files, `--against <base>` cannot compare that suite.**
   Session 3's `--against HEAD` copied `.witness/` but not the TrxReport package, so the origin's
   publicapi suite was `report_missing`. Parity was `57 same, 151 only on target`, and the VERDICT
   still says `passed ... origin error`. Every first `test-change` on an MTP repo without TrxReport
   will hit this. The `verify` skill could tell the agent to run the base with the setup change
   (commit the setup first, or compare against a ref that has it). Witness could also name the
   missing reporter in the origin diagnosis, as `check --against` already does.
5. **Low: session 1's first question used wrong evidence.** It said the user would have to install
   Chromium because `pwsh` is missing. Chromium 1248 was already in `~/Library/Caches/ms-playwright`,
   and session 2 found it (`dotnet dev-certs https --check` plus the cache). `--scan` reports CI's
   install command but not whether the browser is present. The agent filled the gap with a guess and
   stated it as fact.
6. **Low: the commit question contradicts the skill's default.** `interview.md` stage 7's default is
   "do not commit". Session 1 recommended committing ("I'd commit ...") and gave no options. Session
   2, in defaults mode, followed the default and did not commit. This is ENG-10581's open question
   showing up in practice: the recommendation and the default disagree.
7. **Low: standalone sessions write temporary files to the shared `/tmp`.** Session 2 wrote
   `/tmp/witness-scan.json` and `/tmp/witness-run-*.log`. Session 3 wrote `/tmp/scan.json` and
   `/tmp/ep.bak`. The `init` skill's "Facts first" step doesn't say where the scan output goes. Only
   `test-change`'s "Long commands" section names `.witness/scratch/`, and only for run output.
8. **Low: morph sessions don't list defaulted decisions as blockers.** Session 4's report has a
   "Gaps" section but no blocker for the scope or TrxReport decisions that `interview.md` (morph)
   says to record. Morph reviewers would not see that a build file changed on a default.
9. **Low: the morph `$WITNESS` instruction is easy to break in zsh.** "run every `witness <args>` as
   `node "$WITNESS" <args>`" led the agent to `W="node $WITNESS"; $W`, which zsh doesn't split. It
   then ran `find / -name witness.mjs`. The skill could show a one-line function:
   `witness() { node "$WITNESS" "$@"; }`.
10. **Info: two scratch locations in the morph skill.** `test-change` (morph) says temporary files go
    in `$MCODE_DIR/scratch/`, and its "Long commands" section says run output goes to
    `.witness/scratch/`. Session 4 used both, as written. One place would be simpler.
11. **Info: no sign of result tampering.** In all four sessions, no session wrote under
    `.witness/runs/`. Every VERDICT a session reported matches the redirected output, and every
    session's tests caught the mutants.

## Environment notes

- `cp -R` copied the clean clone's ignored `bin/` and `obj/` folders.
- Sessions 3 and 4 ran one after the other. Both e2e suites start the app on the fixed
  `https://localhost:5001`, so running them at the same time would collide.
- Cleanup: no witness containers and no `dotnet`, `testhost` or `VBCSCompiler` processes are left.
  No `witness-against-*` worktree is left. The `/tmp` files the sessions wrote were moved into the
  sessions' `raw/tmp-files/`.
