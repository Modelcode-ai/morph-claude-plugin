## TL;DR

- **Asking for witness by name now loads the right skill.** "use witness to verify your work" loaded `test-change`. "Create a test plan with witness" loaded `plan`.
- **The interview works when setup is the whole task (S1).** It asked two questions, each with a recommendation, evidence and options. It kept the override, got `CHECK ok` and ran two passing baselines. The commit question now offers two options and recommends leaving the commit to the user.
- **D2 is still open.** For "implement X and use witness to verify your work", `init` asked nothing. I ran this twice, in S3 and in a repeat I added (S3b). S3 said: "I took these defaults without asking you." When witness was the whole request (T(a) turn 2, S1), the agent did stop and ask.
- **`[reference]` works, but each session first hit a failed run.** Both S3 runs used `--against` and read the new VERDICT (`origin error (report_missing in publicapiintegrationtests: no comparison for that suite)`). Both added `[reference] setup` and re-ran to `origin passed, 0 differ`. Each first tried `setup` without `ref`, which the config rejects, although the README, the verify skill and witness's own hint all lead there. This is a new Witness bug (F2).
- **Morph profile: the `node "$WITNESS"` fix works; blockers are still missing.** S4 wrote out `node "$WITNESS"` 9 times, with no variable and no `find /`. Its report ends with "No blockers." and does not mention the medium-confidence PublicApi scope it chose by default.
- **Also fixed:** lint (D3), machine facts (D5), the commit question (D6) and `/tmp` use (D7). No session wrote to `/tmp`. S3's tests use `CollectionAssert` and lint passes.
- **The new tests catch bugs.** All six mutants (three each for S3 and S4) failed the plan's selected tests.
- **Cost:** $5.45 across 6 sessions, 0 permission denials.

## Per session

- **T(a) triggering, test-change:** PASS. `Skill: morph:witness-test-change` was the first call of turn 2, followed by init's first question.
- **T(b) triggering, plan:** PASS. `Skill: morph:witness-plan` was the first call; `PLAN ok · 9 item(s), 11 test ref(s): 0 found, 0 missing, 11 unverified`.
- **S1 interview:** PASS on every check, including the three new ones (scratch, machine claims, commit question). Side note: it added TrxReport to two build files without asking. The previous S1 asked; the current stage 5 text allows it.
- **S3 test-change:** PARTIAL. Interview FAIL: 0 questions, in S3 and S3b. Everything else passed: plan, MSTest tests, lint with `CollectionAssert`, `--against` plus `[reference] setup` (after F2), the exact VERDICT, no `/tmp`, no writes under `.witness/runs`, 3/3 mutants caught.
- **S4 morph:** PARTIAL. Blockers FAIL ("No blockers."). PASS: `node "$WITNESS"`, no questions, expectations from the request, commit `3d3a90a`, 3/3 mutants caught. Scratch PARTIAL: it used `.witness/scratch/` instead of `$MCODE_DIR/scratch/`.

---

# Witness end-to-end re-run (eng-10586: ENG-10585 + ENG-10586 fixes)

Run on 2026-11-23 against worktree `eng-10585`, branch `eng-10586` (f0b7638 on top of de03b0c). Previous report: `eng-10583-eval/docs/witness/E2E-EVAL.md`.

## Setup

- **Driver.** `e2e-eval-2/turn.sh`, copied from `e2e-eval/turn.sh`, with `E` and `WT` changed.
  - Two additions: `BUDGET` sets `--max-budget-usd` (default 15; 3 for the T sessions), and the script copies each session's transcript into `raw/`.
  - Otherwise unchanged: `claude -p --output-format json --permission-mode auto`; the user-installed `morph@modelcode-morph` plugin is disabled; standalone runs get `--plugin-dir eng-10585/plugins/morph`.
  - `PATH` starts with a scratch `bin/witness` (a symlink to `eng-10585/packages/witness/bin/witness`), then SDK 11.
  - `PROFILE=morph` drops the plugin and sets `WITNESS=.../dist/witness.mjs` and `MCODE_DIR=<run>/mcode`.
- **Repo copies.** Each session ran in its own `cp -R` copy of `~/work/witness-targets/eShopOnWeb` (aed6281), made by `e2e-eval-2/mkcopy.sh`, with `commit.gpgsign=false`. The clone itself was not touched.
- **S4 setup, as before.**
  - Skills installed with `witness skills install --dir .claude/skills --profile morph --prefix witness-` and hidden with `.git/info/exclude`.
  - The previous session 4's implementation was re-applied as commit `20f2f90` on `milestone-1`; `main` stays at aed6281.
- **Raw data.** `e2e-eval-2/<run>/raw/` (`turn-N.json`, `<session>.jsonl`) and `<run>/turn-N.out`.
- **Scheduling.** At most two sessions ran at once. The sessions that run e2e tests on fixed ports (S3, S3b, S4) never overlapped. No session used Docker.

| session | session id | turns | questions | cost | agent time |
| --- | --- | --- | --- | --- | --- |
| T(a) | `617f88d7-6358-4897-9315-9a5b86e0e859` | 2 | 1 (stopped there) | $0.50 | 54s |
| T(b) | `c771b43f-1491-4d79-946d-b8050ba4e65c` | 1 | 0 | $0.48 | 53s |
| S1 | `f1d0bb5f-9452-4ac4-9734-2f5fc6486d5d` | 3 | 2 | $0.67 | 1m57s |
| S3 | `9dcdfea5-1615-44aa-af55-308bd271e128` | 1 | 0 | $1.43 | 6m24s |
| S3b (repeat) | `bed29a77-5d44-4c83-93fb-e8b7f61f7ae0` | 1 | 0 | $1.33 | 6m23s |
| S4 morph | `8f7e79a3-7ed3-4a0c-9eda-d7185c78e2ff` | 1 | 0 | $1.04 | 4m02s |

S3b was added because the S3 interview result is the main thing fix 1 targets, and one sample was not enough to call it.

## T: triggering

**T(a).**
- Turn 1: "In PublicApi, make GET /api/catalog-brands return the brands sorted by name." The agent made the change and added an MSTest test, with no skill loaded.
- Turn 2: "use witness to verify your work." It loaded `morph:witness-test-change`, then `morph:witness-init`, then ran `witness init` and `init --scan > .witness/scratch/scan.json`. It stopped with: "this repo had no `.witness/witness.toml`, so I'm setting witness up first ... The setup asks you a few questions, one at a time, and this is the first. **Scope: which test projects become witness suites?** ... Chromium, Firefox and WebKit are installed on this machine ... Shall I go ahead with all three suites?"

**T(b).** The first call was `Skill: morph:witness-plan`. It wrote 9 items and got `PLAN ok · 9 item(s), 11 test ref(s): 0 found, 0 missing, 11 unverified`. It ended by offering to run init, which "will ask you a few setup questions".

| check | score | evidence |
| --- | --- | --- |
| (a) loads `test-change` | pass | first call of turn 2 |
| (b) loads `plan` | pass | first call |
| note | - | T(a) turn 1 mentioned neither testing nor witness and loaded no skill, as expected. D1's plain "make sure it's tested" wording was not re-tested |

## S1: interview, standalone

**Q1 (stage 1).** It treated e2e and functional as settled by the repo. Then: "**Scope: `tests/PublicApiIntegrationTests`.** I recommend making it an api suite whose command leaves out one test class ... 24 of its 25 files call the PublicApi over HTTP through `WebApplicationFactory` (for example `AuthEndpoints/AuthenticateEndpointTest.cs:27`) ... **Other options:** (b) Keep the whole project unfiltered ... (c) Leave the project out entirely. Shall I use the filtered suite?"

**A1 (override):** "Yes, use the filtered suite. But leave out the browser suite (EndToEndTests) for now, I don't want browser tests in witness yet."

**Turn 2.**
- It wrote the config with `# tests/EndToEndTests: left out, no browser tests in witness yet (user's choice)`.
- The first `check` failed on the missing TRX reporter. It added TrxReport 2.5.3 to two build files without asking, then got `CHECK ok`.
- Baselines: `r-20261123-152558-972f` `VERDICT passed · 54 passed, 0 failed · 1 suite(s) · 9s` and `r-20261123-152607-9683` `VERDICT passed · 143 passed, 0 failed · 1 suite(s) · 5s`.
- The report says who made each decision ("**My default:** adding the reporter package.").

**Q2 (stage 7):** "I recommend you commit these yourself after reviewing the diff, so I haven't committed anything ... Or I can commit them now if you'd like."

**A2:** "Leave them, I'll commit them myself." The agent committed nothing. My own `witness check` on the final config printed `CHECK ok`.

| check | score | evidence |
| --- | --- | --- |
| one decision at a time, in order, recommendation + evidence | pass | stage 1, then stage 7, one turn each; options given |
| asks nothing the repo answers | pass | high-confidence suites and stages 2-4 were stated, not asked |
| override respected | pass | e2e absent, with a "(user's choice)" comment |
| `witness check` passes | pass | agent's run and my re-run |
| baseline | pass | both suites passed |
| commits only what was approved | pass | nothing committed |
| new: scratch, no `/tmp` | pass | scan in `.witness/scratch/`; no `/tmp` path in tool inputs (ignoring the copy's own `/private/tmp/claude-501/...` path) |
| new: machine claims match `machine` | pass | S1 made no machine claim. T(a)'s browser claim matches `machine` (`chromium-1248`, `firefox-1522`, `webkit-2287` in `~/Library/Caches/ms-playwright`) |
| new: commit question, two options, leave recommended | pass | Q2 |

## S3: test-change, standalone

**Prompt:** "Add an optional `name` filter (case-insensitive contains) to GET /api/catalog-items in PublicApi, and use witness to verify your work."

The agent implemented the filter, then loaded `test-change` and `init`. Its progress text: "the repo has no `.witness/witness.toml`, so setup comes first ... I'm taking the scan's proposed suites as defaults and writing the config ... The PublicApi test project lacks a TRX reporter; adding it". Its report: "I took these defaults without asking you."

**Init.**
- Three suites, including the filtered, medium-confidence PublicApi suite, plus TrxReport.
- Baselines ran with only `src/` stashed (the stash was restored): `r-20261123-152910-e88a` (143), `-152918-daf4` (54), `-152931-d758` (2 passed, 1 skipped).

**Plan.** 5 items (P1-P4 new, P5 parity): `PLAN ok · 5 item(s), 7 test ref(s): 7 found, 0 missing, 0 unverified`.

**Write.**
- 4 MSTest tests in `CatalogItemListPagedEndpoint.cs`, using `CollectionAssert.*` and `Assert.*`.
- `LINT ok · 1 file(s), 11 test(s), 0 error(s)`.
- Selection run `r-20261123-153110-9fc9`: `passed · 8 passed`.

**Verify.**
1. `--against HEAD` gave `VERDICT passed · 204 passed, 0 failed · 1 skipped · 3 suite(s) · against HEAD: origin error (report_missing in publicapiintegrationtests: no comparison for that suite), 0 differ · 52s` (`r-20261123-153122-1b0c`).
2. It saved the build-file diff as `.witness/reference-trx.patch` and added `[reference] setup = "git apply .witness/reference-trx.patch"`. The config was rejected: `reference: needs ref ...` and `VERDICT mistrial · the config can't be used`.
3. It added `ref = "HEAD"` and ran `--against reference`: `VERDICT passed · 204 passed, 0 failed · 1 skipped · 3 suite(s) · against reference: origin passed, 0 differ · 52s` (`r-20261123-153225-1222`). Parity: 200 same, 0 differ, 5 only on target.

**Its own mutation check.** It stashed `src/` and ran the new tests (`r-20261123-153324-3b38`, `failed · 2 passed, 3 failed`). As a result, `latest` points at that run; it said so.

**VERDICT reported:** `witness  VERDICT passed · 204 passed, 0 failed · 1 skipped · 3 suite(s) · against reference: origin passed, 0 differ · 52s`. It is identical to `.witness/scratch/verify-2.out`.

**S3b (same prompt, fresh copy) behaved the same way.**
- No questions: "I made every setup choice from the repo's own files rather than asking you."
- `--against main` gave `origin error (report_missing ...)` (`r-20261123-154552-51f3`).
- It tried `setup` without `ref` and got `VERDICT mistrial · the config can't be used`, then added `ref = "main"`.
- Final: `witness  VERDICT passed · 203 passed, 0 failed · 1 skipped · 3 suite(s) · against reference: origin passed, 0 differ · 52s` (`r-20261123-154657-8505`).

**Mutation check (mine).** Run in `s3-test-change/mutation/repo` with the 7 tests that `plan check` selects; the source was restored after each run.

| mutant | VERDICT | failed | run id |
| --- | --- | --- | --- |
| M1: endpoint passes `null` name | `failed · 5 passed, 3 failed` | ...IgnoringCase, ...CombinesWithBrandFilterAndPaging, ReturnsEmptyListGivenNameWithNoMatch | `r-20261123-153531-f53f` |
| M2: case-sensitive | `failed · 6 passed, 2 failed` | ...IgnoringCase, ...CombinesWithBrandFilterAndPaging | `r-20261123-153546-6bd1` |
| M3: count ignores name | `failed · 6 passed, 2 failed` | ...CombinesWithBrandFilterAndPaging, ReturnsEmptyListGivenNameWithNoMatch | `r-20261123-153552-55a0` |

| check | score | evidence |
| --- | --- | --- |
| reaches `test-change` | pass | S3, S3b |
| says witness isn't set up | partial | in progress text and the report; never stops |
| init's questions (user present) | **fail** | 0 questions in both runs |
| setup questions only via init | pass (vacuous) | none asked at all |
| plan | pass | 7 found |
| tests in the repo's framework | pass | MSTest, existing class |
| lint accepts `CollectionAssert` | pass | `LINT ok`. My control: with only `EnsureSuccessStatusCode` + 4 `CollectionAssert` lines, `LINT ok`; with those lines removed, `status-only: P1 ...` |
| `--against` for parity items | pass | HEAD (S3), main (S3b) |
| base not compared → `[reference] setup` + re-run | pass, with friction | F2 |
| reports the exact VERDICT | pass | matches `verify-2.out` |
| no edits under `.witness/runs` | pass | transcript |
| no `/tmp` | pass | transcript |
| mutants fail | pass | 3/3 |

## S4: morph profile

**Prompt** (as in the previous session 4): "Test the change for milestone 1: ... make sure it's tested. Follow witness-test-change."

- **`$WITNESS`.** `witness --version` failed with `command not found: witness`, as step 1 expects. After that it wrote out `node "$WITNESS" ...` for all 9 calls.
- **Init.**
  - Three suites, including PublicApi, which the scan rates `"confidence":"medium"`, plus TrxReport.
  - Baselines `r-20261123-153708-3796`, `-153713-31be`, `-153722-aea8`, on the changed commit (disclosed).
- **Plan and tests.**
  - 6 items, 5 new tests.
  - Lint correctly flagged the existing `ReturnsBadRequestGivenInvalidPaging` as `status-only`, so the agent dropped it from P6.
- **Verify.** One full run, without `--against`, which matches the morph text.
- **Commit.** `3d3a90a` on `milestone-1`; not pushed.

**VERDICT reported:** `witness  VERDICT passed · 204 passed, 0 failed · 1 skipped · 3 suite(s) · 22s` (`r-20261123-153940-a53c`). It matches `verify-1.out`.

**Report.** The "Gaps and decisions I made without asking" section lists the missing spec, the baseline on changed code, the dropped test and the untested filters. It ends with "**No blockers.**" The scope decision is not listed.

**Mutation check (mine),** with 8 selected tests:

| mutant | VERDICT | run id |
| --- | --- | --- |
| M1: pre-change `src` | `failed · 4 passed, 4 failed` | `r-20261123-154120-8ffc` |
| M2: case-sensitive | `failed · 5 passed, 3 failed` | `r-20261123-154129-7fbb` |
| M3: count ignores name | `failed · 6 passed, 2 failed` | `r-20261123-154137-1c52` |

| check | score | evidence |
| --- | --- | --- |
| no questions | pass | |
| defaulted setup decisions as blockers | **fail** | "No blockers."; the medium-confidence scope is missing |
| `node "$WITNESS"` in full | pass | 9 calls |
| expectations from the request | pass | plan `source` |
| `$MCODE_DIR/scratch` | partial | empty; everything went to `.witness/scratch/` (F6) |
| commit | pass | `3d3a90a` |
| no edits under `.witness/runs` | pass | |
| mutants fail | pass | 3/3 |

## Findings, by severity

**F1. High: `init` asks nothing when setup happens inside a larger request (D2 still open).**
- What happened: S3 and S3b both chose the medium-confidence scope and edited two build files without asking.
- Contrast: T(a) and S1 stopped and asked. The difference is the task. With "implement and verify", the agent treats the turn as one job to finish.
- Suggested fix: test-change step 2 should say to end the turn with init's first question and not plan or write tests until the user answers. Or it should ask the setup questions before implementing.

**F2. Medium (Witness bug): `[reference]` with only `setup` is rejected.**
- Cause: `src/config.ts:240` requires `ref`, `repo` or a service override, even when `--against <ref>` gives the ref.
- Why agents land there: the README says "`--against <ref>` keeps the rest of the section and checks out `<ref>` instead". The verify skill says "add that step as `setup` in `[reference]` and run again". The hint `witness run` prints says "add that step as [reference] setup".
- Effect: both S3 runs got `VERDICT mistrial · the config can't be used` and lost one run.
- Reproduced in `s3-test-change/mutation/repo`. Removing `ref` gives `evidence: reference: needs ref (a branch, tag or commit), repo (another repo's path or git URL), or a [reference.service.<name>] override`.
- Not fixed: the worktree is read-only for this eval.

**F3. Medium: morph reports still leave out defaulted setup decisions (D8 still open).**
- S4: "No blockers." The PublicApi project is medium confidence, which is a stage-1 "ask when" case.
- The new test-change line ("including every setup decision `init` made by default") did not change the outcome.

**F4. Low: the TRX reporter's build-file edit isn't asked about.**
- S1 added TrxReport without asking; the previous S1 asked.
- Stage 5 says to ask "only when the fix is a choice the user owns: installing an SDK, a browser or a certificate". A package reference does not count, so the agent is following the text.
- S1 did label it "My default".
- Open question: should edits to build files outside `.witness/` be the user's call?

**F5. Low: `ref = "HEAD"` goes stale.** S3 wrote it. Once the change is committed, `--against reference` compares the change with itself. S3b used `main`. The verify skill could say to use the base branch.

**F6. Info: the morph skills name two scratch places (D10 still open, now sharper).** Morph `test-change` says `$MCODE_DIR/scratch/`. Morph `init` now says `.witness/scratch/` is "where your temporary files go". S4 used only the second.

**F7. Info: in S3 and S3b, `latest` ends on a failed `--select` run.** That is the agent's own "without the change" check, which it ran after verify. Both disclosed it. It is harmless standalone; the morph verify skill already forbids it.

**F8. Info: no sign of tampering.** No session wrote under `.witness/runs/`. Every reported VERDICT matches the redirected output, and all 6 mutants were caught.

**F9. Info: the new `/tmp` entries come from dotnet.** 99 entries appeared during the run: 98 Unix sockets with 32-hex-character names, plus `zeb_def_ipc_5468`. They are dotnet's inter-process sockets (I ran dotnet too). No agent tool call names a `/tmp` path.

## Previous findings: fixed vs open

| previous | status | evidence |
| --- | --- | --- |
| D1 plain request doesn't reach test-change | fixed for explicit "witness" requests; plain wording not re-tested | T(a), T(b), S3, S3b |
| D2 init asks nothing inside test-change | **open** | F1 |
| D3 lint misses `CollectionAssert` / `StringAssert` | fixed | S3 `LINT ok`; my control |
| D4 `--against` can't compare after setup changes build files | fixed, with friction | VERDICT names the cause; `[reference] setup` gives `origin passed`, 200 same; F2 |
| D5 wrong machine claim | fixed | `machine` fact; T(a)'s claim is correct; no wrong claims |
| D6 commit question contradicts the default | fixed | S1 Q2 |
| D7 `/tmp` use | fixed | no `/tmp` in any session's tool calls |
| D8 morph blockers | **open** | F3 |
| D9 `$WITNESS` in a zsh variable | fixed | S4 |
| D10 two scratch places | open (info) | F6 |
| D11 no tampering | still holds | F8 |

## Cleanup

- No `witness-*` containers.
- No `witness-against-*` worktrees in `$TMPDIR` or `/tmp`; each copy's `git worktree list` shows only itself.
- No `dotnet`, `testhost` or `VBCSCompiler` processes left.
- The clone is clean at aed6281.
- Nothing was pushed, and the eng-10585 worktree was not modified.

---

Files are in `/private/tmp/claude-501/-Users-dserebro-work/82d0b087-6e41-4c1b-85eb-f9b2eafa8b64/scratchpad/e2e-eval-2/`:
- `turn.sh` and `mkcopy.sh`: the driver scripts
- `t-a/`, `t-b/`, `s1-interview/`, `s3-test-change/`, `s3b-test-change/`, `s4-morph/`: one folder per session, each with `raw/`
- `s3-test-change/mutation/` and `s4-morph/mutation/`: my mutant runs and the F2 repro

---

# Re-run after F1–F6 fixes

The fixes were uncommitted on disk in `eng-10585` (branch `eng-10586`): 15 files, `dist` and `plugins/morph` rebuilt. I did not modify the worktree. Same driver, fresh copies `s3c-test-change` and `s4b-morph`, budget $5 per turn.

| session | session id | turns | questions | cost | agent time |
| --- | --- | --- | --- | --- | --- |
| S3c test-change | `1db97eca-2e63-4b93-9bbe-5b9befc56ec5` | 3 | 3 (scope, TrxReport, commit) | $1.79 | 8m28s |
| S4b morph | `92acec61-4c85-43ad-aeb2-f875d7eccc0e` | 1 | 0 | $1.07 | 4m14s |

Total: $2.86. Running total for this eval: $8.31.

## TL;DR

- **F1 fixed.** Mid-task, S3c implemented the filter and then ended its turn with init's scope question. It went on only after my answer.
- **F4 fixed.** S3c asked before adding TrxReport ("Fixing it means editing two repo files outside `.witness/`, so I need your OK first.").
- **F3 fixed.** S4b's report has a "Decisions to confirm" section that lists the suite scope and the TrxReport edit.
- **F5 fixed.** S3c set `ref = "aed6281"` (the base commit), not `HEAD`.
- **F6 fixed.** Both sessions used only `.witness/scratch/`. No `/tmp` paths, and `$MCODE_DIR/scratch` is no longer named.
- **F2 partly fixed, and the fix opened a worse bug (F10, High).** A `setup`-only `[reference]` is now accepted, and `--against reference` without a ref gives a clear usage error. But with `setup` only, `--against <ref>` runs **this checkout's tests** on the origin side. With in-process suites, that compares the change with itself. I reproduced it: `origin passed, 0 differ` with `210 same, 0 only on target`, though the 10 new filter tests cannot pass on the base. S3c did not hit this because it set `ref`.
- **The tests catch bugs.** S3c's tests are a new kind (each creates its own items with a unique marker), so I ran the mutants: 3/3 caught.

## S3c: test-change, standalone

**Turn 1** (same prompt as S3). It implemented the filter and built with 0 errors. It loaded `test-change` and `init`, ran the scan into `.witness/scratch/`, and ended the turn:

> I've added the `name` filter, but I haven't verified it with witness yet. This repo had no witness config, so I've started setting one up, and the first decision is yours. ... **Setup decision: which test projects witness should run.** I recommend three suites ... `endtoendtests` ... The browsers are already installed on this machine. `pwsh` isn't, but the browsers are what these tests need. ... Your other options: Drop the browser suite ... Use only `publicapiintegrationtests` ... Shall I go ahead with all three? If you'd rather I stop asking, say "use your defaults" ...

The machine claims match `machine` (browsers present, `pwsh` not found).

**A1:** "Yes, all three."

**Turn 2.** It wrote the config. `check` failed on `report_missing` for publicapi. It then asked:

> I wrote the witness config, but `witness check` fails on one suite. Fixing it means editing two repo files outside `.witness/`, so I need your OK first. ... **Decision: may I add the TRX reporter package?** I recommend two lines ... Other options: Drop `publicapiintegrationtests` from witness ... Make the change yourself. Shall I add it?

**A2:** "Yes, add it."

**Turn 3.**
- **Baselines.** Ran with `src/` stashed, then restored; `git stash list` is empty afterwards. `r-20261123-161049-77b2` (143 passed), `-161058-cfb0` (54), `-161109-4b8d` (2 passed, 1 skipped).
- **Plan.** 7 items: `PLAN ok · 7 item(s), 13 test ref(s): 13 found, 0 missing, 0 unverified`.
- **Selection run.** `r-20261123-161348-f255`: `passed · 13 passed`.
- **Its own check without the change.** `r-20261123-161359-7f71`: `failed · 5 passed, 8 failed`.
- **First verify.** `--against aed6281` gave `VERDICT passed · 209 passed, 0 failed · 1 skipped · 3 suite(s) · against aed6281: origin error (report_missing in publicapiintegrationtests: no comparison for that suite), 0 differ · 57s` (`r-20261123-161416-4615`).
- **Reference.** It added `[reference]` with `ref = "aed6281"` and a `setup` that adds the two TrxReport lines idempotently. Its comment explains the choice: "Local main is behind origin/main, so origin/main would be a different codebase." It ran `--against reference` with no rejected attempt.

**VERDICT reported:** `witness  VERDICT passed · 209 passed, 0 failed · 1 skipped · 3 suite(s) · against reference: origin passed, 0 differ · 51s` (`r-20261123-161526-2f1c`). It matches `.witness/scratch/verify-2.out` exactly. Parity: `200 same, 0 differ, 10 only on target, 0 only on origin`.

The report ends with a commit question: "should `.witness/` (config and plan) be committed to the repo?" It gives neither options nor a recommendation, unlike S1's stage-7 question. This is a minor regression in the test-change path, not tied to F1–F6.

**Mutants (mine).** Run in `s3c-test-change/mutation/repo` with the 13 tests that `plan check` selects; the source was restored after each.

| mutant | VERDICT | failed | run id |
| --- | --- | --- | --- |
| M1: endpoint passes `null` name | `failed · 5 passed, 8 failed` | all 8 filter tests | `r-20261123-161744-86a8` |
| M2: case-sensitive `Contains` | `failed · 9 passed, 4 failed` | FiltersByNameIgnoringCase ×3, CombinesNameWithBrandAndTypeFilters | `r-20261123-161750-c3ec` |
| M3: count spec ignores `name` | `failed · 11 passed, 2 failed` | ReturnsNoItemsGivenNameThatMatchesNothing, PagesOverTheFilteredItems | `r-20261123-161757-c9a7` |

| check | score | evidence |
| --- | --- | --- |
| F1: init's first question ends the turn, mid-task | pass | turn 1 ends with the scope question; nothing planned or written before A1 |
| F1: questions only via init | pass | scope, TrxReport, then the stage-7 commit question |
| F4: editing files outside `.witness/` is asked | pass | turn 2 |
| F2: `[reference]` with `setup` | pass (agent path) | set `ref` + `setup` together; no rejected run |
| F5: `ref` is not `HEAD` | pass | `ref = "aed6281"`, the base commit, with the reason in a comment |
| F6: scratch only in `.witness/scratch/` | pass | no `/tmp` path in tool inputs; scan, logs and verify output in `.witness/scratch/` |
| VERDICT copied exactly | pass | matches `verify-2.out` |
| no edits under `.witness/runs` | pass | only reads |
| mutants fail | pass | 3/3 |

## S4b: morph profile

Same setup and prompt as S4. The milestone commit was re-applied as `c51073a`.

- **`$WITNESS`.** 10 calls written out as `node "$WITNESS"`; no variable and no `find /`.
- **Scratch.** `.witness/scratch/` (scan, check, select, verify output); `$MCODE_DIR/scratch` is empty and the morph skills no longer name it. No `/tmp`.
- **Tests.** 7 new tests. Its `ReturnsBadRequestGivenNameWithInvalidPageSize` asserts both the 400 and the error field.
- **Commit.** `c22651f` on `milestone-1`; not pushed.
- **VERDICT:** `witness  VERDICT passed · 206 passed, 0 failed · 1 skipped · 3 suite(s) · 22s` (`r-20261123-160714-9c6a`). It matches `verify-1.out`.

**Report section, quoted:**

> **Decisions to confirm**
> 1. **No database.** I left SQL Server out because the test settings set `UseOnlyInMemoryDatabase` and `WebTestFixture` uses `UseInMemoryDatabase`.
> 2. **Suites:** I kept all three that witness suggested, and left out UnitTests, IntegrationTests, AppHostTests and `DependencyTests.cs`, which don't call the running app.
> 3. **No separate run on the code before the change.** The change was already committed, so I didn't run the suites on the parent commit. ...
> 4. **Committing the TRX package** into the test project is a small change to the repo's build files.

| check | score | evidence |
| --- | --- | --- |
| F3: defaulted setup decisions listed | pass | "Decisions to confirm": scope (#2), TrxReport (#4). #2 does not say the PublicApi suite was medium confidence, but it names the filter (`DependencyTests.cs` left out) |
| F6: one scratch place | pass | `.witness/scratch/` only |
| `node "$WITNESS"` in full | pass | 10 calls |
| new: stage-6 baseline | note | skipped entirely ("No separate run on the code before the change"). It is listed under decisions to confirm. S4 had run the baselines on the changed commit instead |

Mutants skipped: the tests are the same kind as S4's (MSTest in the existing class, against seeded data).

## New findings

**F10. High (Witness bug, introduced by the F2 fix): with a `setup`-only `[reference]`, `--against <ref>` compares the target with itself.**
- Cause: `src/config.ts:238` defaults `tests` to `"target"` when the config has no `ref` (`repo || !ref ? "target" : "reference"`). `--against <ref>` then supplies a ref, but `resolveReference` (`src/reference.ts:69`) still uses `r.tests`. The origin side runs this checkout's tests ("suites run from this checkout against the reference services").
- Why it matters: eShopOnWeb's suites start the app in-process from the checkout they run in. So the "origin" ran the changed code, while the reference worktree and its `setup` went unused.
- Repro: in `s3c-test-change/mutation/repo`, remove `ref` from `[reference]` and run `witness run --against aed6281`. Result: `VERDICT passed · 209 passed, 0 failed · 1 skipped · 3 suite(s) · against aed6281: origin passed, 0 differ · 43s` (`r-20261123-161810-39cc`), with parity `210 same, 0 differ, 0 only on target`. The origin publicapi suite reports `153 passed` (the base has 143), and the origin TRX contains `FiltersByNameIgnoringCase`. The correct run with `ref` set gives `200 same, 10 only on target`.
- Effect: a false parity result that looks green. Nothing in the output warns about it.
- Fix direction: decide the `tests` default after `--against <ref>` resolves (this repo at a ref → `"reference"`), or refuse `setup`-only with `--against <ref>` again but name `ref` in the hint.
- The usage error for `--against reference` without a ref is good: `--against reference: [reference] has no ref, repo or service override, so there is nothing to compare with: set ref = "<base branch>" in [reference], or pass --against <base branch>`.

**F11. Low: the test-change commit question lost its options.** S3c asked "should `.witness/` ... be committed?" with no options and no recommendation. S1 (init as the task) gave both.

**F12. Low: morph skipped the stage-6 baseline.** S4b ran no `init-<suite>` runs because the change was already committed. It disclosed this under "Decisions to confirm". Morph could run the baseline on the parent commit (`--against HEAD~1`, or a worktree) instead of skipping it.

**F13. Info: agents' direct `dotnet build` leaves build servers running.** After S3c (which ran `dotnet build` and `dotnet test` outside witness), MSBuild node-reuse processes (started 16:01:42) and `VBCSCompiler` (16:13:04) were still alive. I stopped them with `dotnet build-server shutdown`. Witness's own runs do not leave them; the agent's direct calls do.

**Correction to the first report's cleanup line:** each copy's `git worktree list` shows two entries. The second is `eShopOnWeb-witness-eval`, which `cp -R` copied over from the clone's metadata. No session created a worktree.

## F1–F6 status

| finding | status | evidence |
| --- | --- | --- |
| F1 init asks nothing mid-task | fixed | S3c turn 1 ends on the scope question |
| F2 `setup`-only rejected | fixed as specified; **new bug F10** | config accepted, clear usage error; but the origin side runs the target's tests |
| F3 morph omits defaulted decisions | fixed | S4b "Decisions to confirm" |
| F4 build-file edits not asked | fixed | S3c turn 2 |
| F5 `ref = "HEAD"` | fixed | S3c `ref = "aed6281"` |
| F6 two scratch places | fixed | `.witness/scratch/` only in both sessions |

## Cleanup (re-run)

No `witness-*` containers. No `witness-against-*` directories in `$TMPDIR` (my F10 repro's worktree was removed by witness). Leftover dotnet build servers were stopped (F13). The clone is clean at aed6281 with its original two worktrees. Nothing pushed. `eng-10585` untouched (its pending diff is the coordinator's).

## After the re-run

- F10 fixed: `tests` is decided after `--against <ref>` fills in the ref, so a `setup`-only
  `[reference]` with `--against <base>` runs the base's own tests. `test/reference.test.ts` asserts
  the new test is `target_only` (it fails on the old code).
- Open: F11 (test-change's commit question has no options), F12 (morph skips the baseline on a
  committed change; disclosed), F13 (direct `dotnet` calls leave build servers running).
