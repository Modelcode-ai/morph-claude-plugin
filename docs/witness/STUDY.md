# Comparison study: witness vs. the human test suite (INCOMPLETE)

Status: **not run.** The study was stopped at the setup stage when the time box was cut. No agent run,
no seeded-bug run and no baseline test run happened, so this file has **no results**. It records the
method, the setup that exists, and one finding about the setup that a re-run needs to handle.

Witness version when stopped: `2193240` ("Round 2: close false passes ..."). That commit landed while
setup was in progress. Any re-run should record the witness commit it uses, because the verdict rules
changed in it: skipped proof tests now fail claims, harness edits are flagged, and there is a new
"Proven, pending approval" verdict.

## Method (planned)

Repo: `/Users/dserebro/work/witness-demo/clone-study` (spring-petclinic-rest with the witness contract
on `origin/main`). Three real merged upstream PRs:

| PR | Change | Squash |
|---|---|---|
| #393 | Owner telephone must be exactly 10 digits (OpenAPI, entity, 4 SQL schemas) | a4cb2c8 |
| #383 | Visit date required (OpenAPI `required`, `@NotNull`, NOT NULL in 3 schemas, default constructor removed) | 5180cc9 |
| #396 | Name patterns for Specialty, PetType, Role | 0515ec8 |

For each PR:
1. Make a "before" branch: `origin/main` with the PR reverted.
2. Give the PR title and body to `claude -p` (sonnet, with the witness plugin) as an issue. Record
   the verdict, claims, bite results, cost and time.
3. Seed 2–3 bugs into the agent's implementation, then run `witness verify` on each.
4. Baseline: seed the same bugs on `origin/main` (the human implementation and tests), then run the
   PR's test classes in Docker.
5. For each concern the human reviewers raised, check whether the witness record answers it.

## Setup done

- Branches `study/before-393`, `study/before-383` and `study/before-396` exist in clone-study. All
  three reverts applied cleanly.
- PR metadata and review comments were saved outside the repo, in the session scratchpad
  (`study/pr-N.json`, `study/pr-N-rc.json`).

## Setup issue a re-run must handle

`witness verify` with no `--base` takes the merge-base of HEAD with `origin/main` (see
`resolveBase` in `engine/src/verify.ts`). On a branch cut from `study/before-N`, that merge-base is
`origin/main`. But `origin/main` already contains the real PR, so the "base" would already have the
behaviour, and new tests could not bite. Each arm must run with `--base study/before-N`. The
simpler option is a separate clone per PR whose `origin/main` points at the before branch. The
headless agent cannot be relied on to pass `--base` by itself.

A second, smaller issue: if the per-PR clones sit under `/Users/dserebro/work`, the headless agent
also loads an unrelated parent `CLAUDE.md`. Clones should live somewhere neutral.

## Results

| PR | Seeded bug | Witness caught? | Human suite caught? |
|---|---|---|---|
| #393 | (not run) | not run | not run |
| #383 | (not run) | not run | not run |
| #396 | (not run) | not run | not run |

Agent runs (verdict, claims, bites, cost, time): **not run.**

## Review concerns raised on the real PRs (coverage not assessed)

| PR | Concern | Would witness answer it? |
|---|---|---|
| #393 | arey: use `@ParameterizedTest` over the invalid phone values | not assessed (test-style concern) |
| #393 | arey: also assert `title == MethodArgumentNotValidException` and that `schemaValidationErrors[0].field == telephone`, not just 400 | not assessed |
| #393 | arey: same for the PUT test | not assessed |
| #383 | arey, with vfedoriv agreeing: remove the `Visit()` constructor that defaults the date to today, since the date is now required | not assessed |
| #396 | no review comments | n/a |

## What this does and doesn't show

It shows nothing yet about whether witness catches more or fewer bugs than the human tests. The
only result is the base-resolution issue above: a revert-based study design silently breaks the
bite check unless the base is set explicitly. Even once run, this design has known limits:

- Small n: 2–3 PRs and 2–3 bugs each.
- The same person writes the seeded bugs and runs the study.
- All three PRs are validation-only.
- The baseline is the human tests, and the human review loop had already improved them.
