---
name: plan
description: Write the test plan for a change in .witness/plan.yaml - the behaviors it must have, where each expectation came from, and which tests prove each one. Use before writing or running tests for a change, as the first step of test-change.
---

# Plan the tests for a change

The result is `.witness/plan.yaml`, checked by `witness plan check --draft`.

## 1. Gather the expectations

Collect what the change is supposed to do from sources the change itself did not write, in this
order:

1. What the user asked for: the request and any acceptance criteria.
2. The pull request description, and the issue or ticket it links.
3. In morph: the spec and task you were given.
4. Commit messages on the branch: `git log --oneline <base>..HEAD`.

Turn each expectation into one sentence about behavior someone can observe: an HTTP response, a
page, a stored record, a command's output. Note which source it came from; the plan's `source`
field names them.

## 2. Read the change

- `git diff --stat <base>...HEAD`, then the diff of each changed file. Include uncommitted work
  (`git status`, `git diff`).
- List each behavior the code changes: endpoints, pages, commands, jobs, validation rules.
- If the code changes a behavior that no expectation mentions, still plan it, and say so in the
  behavior text ("not in the request").

## 3. Find the tests that exist

- `.witness/witness.toml` lists the suites, their adapters and folders.
- Find tests that touch the changed code: search the test folders for the changed function,
  route, class or page names.
- The ids of tests that ran before are in `.witness/runs/latest/results.ctrf.json`, under
  `results.tests[].extra.witness.id`.

Test ids are `<adapter>:<id>`:

| adapter | id |
| --- | --- |
| pytest | `pytest:tests/api/test_invoices.py::test_update_due_date` (classes: `::TestX::test_y`) |
| dotnet, junit-maven, junit-gradle, phpunit | `dotnet:Namespace.ClassName#MethodName` |
| jest, vitest, playwright, mocha | `jest:src/a.test.ts > describe title > test title` |
| go | `go:example.com/module/pkg#TestName` |
| rspec | `rspec:spec/models/user_spec.rb > User has a name` |

## 4. Write the items

```yaml
version: 1
source: "user request; PR #123 description; issue ENG-42"
items:
  - id: P1
    behavior: "PATCH /invoices/{id} updates the due date"
    expect: "200 with the new due date, and GET /invoices/{id} returns it"
    kind: new
    tests: ["pytest:tests/e2e/test_invoices.py::test_update_due_date"]
  - id: P2
    behavior: "PATCH /invoices/{id} with a past due date is rejected"
    expect: "422 with message 'due date is in the past'; the invoice is unchanged"
    kind: new
    tests: ["pytest:tests/e2e/test_invoices.py::test_update_due_date_in_past"]
  - id: P3
    behavior: "GET /invoices still lists all invoices of the account"
    expect: "200 with every invoice, same fields as before"
    kind: parity
    tests: ["pytest:tests/e2e/test_invoices.py::test_list_invoices"]
```

- `kind`: `new` for behavior that did not exist; `changed` for existing behavior that now works
  differently (its old tests need updating); `parity` for existing behavior near the change that
  must stay the same.
- `expect`: the observable result a test will check. For success, name what comes back or what is
  stored, not just the status code. For an error case, name the status and the message.
- `tests`: ids of existing tests that already prove the item, plus the ids that the tests you are
  about to write will have. One test may serve several items.
- Cover every expectation from step 1 and every changed behavior from step 2. Add one to three
  `parity` items for the nearby behavior most likely to break. Do not pad the plan with items no
  source supports.

## 5. Check it

Run `witness plan check --draft`.

- Fix every `ERROR` line: schema problems, duplicate ids, unknown adapters, items without tests,
  test ids that do not belong to any suite.
- `not written yet` warnings are expected for tests you have not written.
- A `did you mean` hint usually means an id typo; fix the id.
- `can't confirm it exists` means the suite could not list its tests; that is fine at this stage.

The plan describes expectations only. Never put a test result or a status in it.
