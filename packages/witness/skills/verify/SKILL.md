---
name: verify
description: Run all the repo's test suites through witness, fix what the failures show, and report the VERDICT. Use after the write skill, or whenever a change must be checked end to end before it is called done.
---

# Verify the change

Output: a final `witness  VERDICT ...` line from a full run, and a report.

## 1. Run everything

```
witness run --label verify-1
```

It boots the services, runs every suite and can take many minutes. Follow the "Long commands"
rules of the `test-change` skill: let it run to the end, read its output as it goes, and check
`.witness/runs/latest/status.json` for progress.

<!-- if morph -->
Your instructions say whether to compare with the original application. When they do (the config
has `role = "origin"` services), every full run is `witness run --against origin`: witness runs
the same suites on the origin services too and records, for each test, whether its outcome is the
same or differs. Otherwise do not use `--against` for full runs.

Morph records your last `witness run` (`.witness/runs/latest`) when you finish, so the last run
must be a full run, never a `--select` run.
<!-- else -->
When the plan has `parity` items, add `--against <base-ref>` (for example `--against origin/main`),
or `--against reference` when the config has a `[reference]` section. Witness then runs the same
suites on the base too and records, for each test, whether its outcome is the same or differs.

- When the VERDICT says the origin side was not compared (`origin error` or `origin mistrial`)
  because the base lacks a step this checkout's setup added (a report package, a build flag), add
  that step as `setup` in `[reference]`, with `ref` set to the base branch (never `HEAD`), and run
  `--against reference`.
- When the reference app lives in another repo or starts differently (a port or rewrite), ask the
  user where it is and how it runs, and record it in `[reference]`: `repo`, `ref`, `setup` and
  `[reference.service.<name>]` with the commands that differ.
<!-- endif -->

## 2. Read the result

The last lines give the outcome:

- `passed`: every test passed. Go to step 4.
- `failed`: some tests failed. Go to step 3.
- `mistrial`, `error`, `stalled` or `interrupted`: the tests could not give an answer. Follow the
  `triage` skill, then run again.

Details are in the run directory (`.witness/runs/latest/`):

- `results.ctrf.json`: every test with `status`, `message` and `trace`; witness's own fields are
  in `extra.witness` (`id`, `suite`, `status_detail`, `parity`, `origin_status`).
- `logs/<suite>.log` and `logs/<service>.log`: the full output of each suite and service.
- `report.md`: the run's report (verdict, plan evidence, comparison, next steps); `report.html` is
  the same for people.

Read these files; never edit them.

## 3. Fix failures, up to three rounds

For each failed test:

1. Read its message and trace, and the suite or service log around it.
2. Decide what is wrong:
   - The code: the change has a bug, or broke an existing behavior (a `parity` test or any old
     test that passed before). Fix the code.
   - The new test: it has a mistake of its own (wrong URL, data, selector, or an expectation the
     plan does not say). Fix the test, keeping the plan's expectation.
   - An old test whose expectation the change deliberately changes: this must be a `changed` item
     in the plan, backed by a source. Update the test to the new expected behavior. If no source
     supports the change in behavior, treat it as a bug in the code.
   - Unrelated to the change (it also fails on the base branch): check with
     `witness run --suite <s> --select <id> --against <base-ref>`. If the base fails the same way,
     leave it and list it in the report as failing before the change.
3. Run the failed tests alone first: `witness run --suite <s> --select <id>,<id>`. A test that
   passes only some of the time can be confirmed with `--retries 2`; witness marks it flaky.
   Report it; do not hide it.
4. Then run everything again (`witness run --label verify-2`, and so on).

Stop after three full rounds that still fail, and report what remains with the evidence.

Never do any of these to get a green run: delete or skip a test, remove or loosen an assertion,
widen a timeout without a reason the logs show, catch errors in a test, change test data so a
broken behavior is no longer exercised, or edit anything under `.witness/runs/`.

## 4. Report

- The last VERDICT line, exactly as printed, and the run id.
- Counts: passed, failed, skipped, and flaky tests.
- For each plan item, its tests and their final status. With `--against`, the parity counts
  (same, differs, origin_only, target_only) and each test whose outcome differs, with both
  statuses.
- What you fixed in the code and in tests during these rounds.
- Failures you left, each with the reason (failing on the base too, or the limit of three rounds
  reached) and the test's message.

A change is verified only when the final full run says `VERDICT passed`, or when every remaining
failure is shown to fail the same way on the base.
