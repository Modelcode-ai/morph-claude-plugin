---
name: witness-write
description: Write or update the functional tests named in .witness/plan.yaml, in the repo's own test framework and style, then lint them and run just those tests with witness. Use after the plan skill, or when a change needs new or updated tests.
---

# Write the tests in the plan

Input: `.witness/plan.yaml`. Output: the plan's tests exist, `witness lint` is clean,
`witness plan check` passes, and the new tests have run once.

## 1. Learn the local style

Write functional tests only: each test drives the app from outside (HTTP API, browser, built
command, window or device). No unit tests, nor tests that read the database directly.

For each suite your plan uses (see `.witness/witness.toml`):

- Open two or three existing tests of similar behavior (same API or page). Imitate them: file
  naming, fixtures, helpers, how they reach the app, test data setup and cleanup, assertions.
- Prefer tests that call the app witness started. Witness gives every suite each running
  service's URL as `WITNESS_<SERVICE>_URL` (`WITNESS_WEB_URL` for a service named `web`), and
  `${web.url}` works in the suite's `cmd` and `env`. Such tests exercise the configured app, and
  `--against` with a reference app runs them against both apps; tests that start their own
  copy (`service = []`) test the same code twice. Never hard-code a host or port.
- Use the repo's framework for that kind of test; add one only if it has none, and say so.

## 2. Write each test

For every planned test id that does not exist yet, write the test with exactly the name its id
implies (file, class and method, or describe and title). For `changed` items, update the old tests
to the new expected behavior.

Each test must:

- Assert on observable behavior from the item's `expect`: the response body or fields, the record
  read back through the API, the text or state on the page. Not on internals or mocks.
- Check the success result for success behaviors. A test of a success behavior must never pass by
  asserting only an error status (4xx/5xx) or only that nothing crashed.
- For error behaviors, assert the status and the message or the unchanged state.
- Be independent: create its own data, and not depend on test order or on leftovers.
- Wait for conditions, not for time: use the framework's wait or expect with a timeout, or poll.
  No fixed sleep longer than a few seconds.
- Not catch exceptions just to carry on. Catch only a specific exception you then assert on.

Keep tests small: one behavior each, named for what it proves.

Each test also records evidence of what it sent and saw: read `evidence.md` in this skill's
folder first.

## 3. Lint

Run `witness lint`. With no arguments it checks the test files changed in the working tree and
the files the plan names. It reports:

- `no-assertion`: the test asserts nothing.
- `swallowed-exception`: a catch-all handler that lets the test carry on.
- `long-sleep`: a fixed wait over 5 seconds.
- `error-status-only`: a plan item expects success, but its test asserts only an error status.
- `status-only`: a plan item expects content or state, but its test checks only the status code.

Fix every error by improving the test. Do not silence the linter. An ignore comment
(`witness-lint: ignore[rule]`) is acceptable only when the finding is wrong, and the report must
say which line and why.

## 4. Check the plan again

Run `witness plan check` (without `--draft`). Every test in the plan must now exist in its suite's
test listing. Fix ids that differ from the names you used, in the plan or in the test, whichever
is wrong.

## 5. Run only the new tests

Run the new and changed tests once. `witness plan check` ends with the exact command, for
example:

```
witness run --select 'api:pytest:tests/e2e/test_invoices.py::test_update_due_date,web:dotnet:Ns.InvoicePageTests#RejectsPastDates'
```

Each id there is prefixed with the suite that owns it, so only those suites run. This can take
minutes (it builds and may boot the app); follow the "Long commands" rules of the `test-change`
skill and act on the VERDICT line.

- `passed`: go on to the `verify` skill.
- `failed`: read each failure's message in the output or in
  `.witness/runs/latest/results.ctrf.json`. Decide whether the test is wrong (wrong URL, data,
  selector or expectation that contradicts the plan) or the code is wrong. Fix the one that is
  wrong and run again. A test that fails because the change has a bug is doing its job: fix the
  code, not the test.
- `mistrial`, `error` or `stalled`: follow the `triage` skill.

Never change a test's expectation away from the plan to make it pass. If the plan itself is
wrong, fix the plan first, from the sources, and say so in your report.
