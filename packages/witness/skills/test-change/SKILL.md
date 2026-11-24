---
name: test-change
description: Prove that a code change works by running the repo's own tests through witness, which boots the app and records results you can trust. Use when the user asks to use witness, after implementing a feature, fix or refactor, or when asked to test, verify or validate a change. Runs the init, plan, write, verify and triage skills in order.
---

# Test a change with witness

This is the entry point. It runs the other skills of this set in order: `init`, `plan`, `write`,
`verify` and `triage` (your environment may prefix them, as in `witness-plan`).

## Rules for every step

- Witness runs functional tests only: tests that drive the app from outside (HTTP API, browser,
  built command, window or device). Unit and integration tests stay with the project's own
  scripts; keep them out of the witness config, the plan and the tests you write.
- Pass or fail comes only from `witness run`. Never write, edit or delete anything under
  `.witness/runs/`, and never report a result that witness did not print.
- Never make a test pass by weakening it: do not delete or loosen assertions, add skips, catch and
  ignore errors, or assert only that a call "did not crash". Fix the code or the test's mistake.
- Use the repo's own test frameworks and conventions. Add no new framework unless the repo has none
  for that kind of test.
- Work in the checkout you were given. Do not push, open pull requests or change CI.
- Temporary files go in `.witness/scratch/` (git ignores it), never in `/tmp`.
<!-- if morph -->
- No one answers questions here. Wherever a skill says to ask or tell the user, record a blocker
  for your final report instead (what is needed, witness's cause and evidence line, what you
  tried) and go on with the work that does not depend on it.
- When morph rendered `.witness/witness.toml` from the project's lifecycle config (its first
  line says so), morph renders it again before each run until it is edited; then your version is
  kept. Edit it only to fix what `witness check` or a diagnosis shows is wrong.
- Commit your tests, `.witness/plan.yaml` and `.witness/witness.toml`, never `.witness/runs/`.
<!-- endif -->

## Long commands

`witness check` and `witness run` can take many minutes (builds, app boot, browser tests).

- Start them so a short timeout cannot cut them off and you can read their output as it comes: in
  the background, or redirected, for example `witness run > .witness/scratch/run.out 2>&1`.
- Progress lines start with `witness  [mm:ss]`. A heartbeat line appears at least once a minute,
  so silence for several minutes means the command itself is stuck.
- For a snapshot of a run in progress, read `.witness/runs/latest/status.json` (phase, suites,
  counts, last event).
- The run is over when the line `witness  VERDICT <outcome> · ...` appears and the process exits.
  Act on that line and the exit code: 0 passed, 1 failed, 2 error, 3 mistrial, 4 stalled or timed
  out, 5 interrupted, 64 wrong usage.
- Run one `witness run` or `witness check` at a time per checkout; a second one fails on a lock.

## Steps

1. Check the tool: run `witness --version`.
   <!-- if morph -->
   If `witness` is not on the PATH but `$WITNESS` is set, run every `witness <args>` in these
   skills as `node "$WITNESS" <args>`, written out in full (not kept in a variable). If neither
   works, stop with a blocker.
   <!-- else -->
   If the command is missing, stop and tell the user that witness is not installed.
   <!-- endif -->
2. Setup: if `.witness/witness.toml` does not exist, or `witness check --stage config` fails,
   <!-- if morph -->
   follow the `init` skill. Continue only when `witness check` passes.
   <!-- else -->
   tell the user (quote the error) and follow the `init` skill. Its questions need the user's
   answers: end your turn with its first question, even mid-task, and go on after the answer
   (unless the user said to use your defaults). Those are the only questions this skill asks.
   Continue only when `witness check` passes.
   <!-- endif -->
3. Plan: follow the `plan` skill. It ends with `.witness/plan.yaml` passing
   `witness plan check --draft`.
4. Write tests: follow the `write` skill. It ends with `witness lint` clean, `witness plan check`
   passing (without `--draft`), and the new tests run once with `witness run --select`.
5. Verify: follow the `verify` skill. It runs the full suites and ends with a VERDICT.
6. Whenever a VERDICT is `mistrial`, `error` or `stalled`, follow the `triage` skill first. Those
   outcomes mean the tests could not give an answer; they are not test failures.

## Report

Finish with a short report:

- The final VERDICT line, copied exactly, and the run id (`.witness/runs/latest` points at it).
- Each plan item: id, behavior, its tests, and their status in the final run.
- Tests you added or changed, by file.
- Code you fixed because a test showed a bug.
- Any change you made to `.witness/witness.toml` or the env file, and why.
<!-- if morph -->
- What is not covered, and each blocker with what is needed and the diagnosis lines.
- Decisions to confirm: each setup decision `init` took by default, with its evidence ("none" only
  if the repo settled all).
<!-- else -->
- What is not covered, and anything that blocked you.
<!-- endif -->

Do not describe the change as working unless the final VERDICT is `passed`.
