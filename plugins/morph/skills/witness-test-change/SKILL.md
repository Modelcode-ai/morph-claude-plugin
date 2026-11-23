---
name: witness-test-change
description: Prove that a code change works by running the repo's own tests through witness, which boots the app and records results you can trust. Use after implementing a feature, fix or refactor, or whenever you are asked to test, verify or validate a change. Runs the init, plan, write, verify and triage skills in order.
---

# Test a change with witness

This is the entry point. It runs the other skills of this set in order: `init`, `plan`, `write`,
`verify` and `triage`. Your environment may show them with a prefix, such as `witness:plan` or
`witness-plan`; they are the same skills.

## Rules for every step

- Witness runs functional tests only: tests that drive the app from outside, through its HTTP API,
  a browser, its built command, its window or a device. Unit and integration tests stay with the project's own build and test scripts; do not
  add them to the witness config, the plan or the tests you write.
- Pass or fail comes only from `witness run`. Never write, edit or delete anything under
  `.witness/runs/`, and never report a result that witness did not print.
- Never make a test pass by weakening it: do not delete or loosen assertions, add skips, catch and
  ignore errors, or assert only that a call "did not crash". Fix the code or the test's mistake.
- Use the repo's own test frameworks and conventions. Add no new framework unless the repo has none
  for that kind of test.
- Work in the checkout you were given. Do not push, open pull requests or change CI.

## Long commands

`witness check` and `witness run` can take many minutes (builds, app boot, browser tests).

- Start them so they can run to the end without being cut off by a short timeout, and so you can
  read their output while they run. If your environment can run a command in the background and
  show its output later, use that. Otherwise redirect the output to a file in `.witness/scratch/`
  (git ignores it), for example `witness run > .witness/scratch/run.out 2>&1`, and read that file.
- Progress lines start with `witness  [mm:ss]`. A heartbeat line appears at least once a minute,
  so silence for several minutes means the command itself is stuck.
- For a snapshot of a run in progress, read `.witness/runs/latest/status.json` (phase, suites,
  counts, last event).
- The run is over when the line `witness  VERDICT <outcome> · ...` appears and the process exits.
  Act on that line and the exit code: 0 passed, 1 failed, 2 error, 3 mistrial, 4 stalled or timed
  out, 5 interrupted, 64 wrong usage.
- Never start a second `witness run` or `witness check` in the same checkout while one is still
  going; witness refuses with a lock error.

## Steps

1. Check the tool: run `witness --version`. If the command is missing, stop. Standalone: tell the
   user that witness is not installed. In morph: file a blocker as your instructions describe.
2. Setup: if `.witness/witness.toml` does not exist, or `witness check --stage config` fails,
   follow the `init` skill. Continue only when `witness check` passes.
3. Plan: follow the `plan` skill. It ends with `.witness/plan.yaml` passing
   `witness plan check --draft`.
4. Write tests: follow the `write` skill. It ends with `witness lint` clean, `witness plan check`
   passing (without `--draft`), and the new tests run once with `witness run --select`.
5. Verify: follow the `verify` skill. It runs the full suites and ends with a VERDICT.
6. Whenever a VERDICT is `mistrial`, `error` or `stalled`, follow the `triage` skill before
   anything else. Those outcomes mean the tests could not give an answer; they are not test
   failures.

## Report

Finish with a short report:

- The final VERDICT line, copied exactly, and the run id (`.witness/runs/latest` points at it).
- Each plan item: id, behavior, its tests, and their status in the final run.
- Tests you added or changed, by file.
- Code you fixed because a test showed a bug.
- Any change you made to `.witness/witness.toml` or the env file, and why.
- What is not covered, and anything that blocked you.

Do not describe the change as working unless the final VERDICT is `passed`.
