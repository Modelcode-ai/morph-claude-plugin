# write: evidence the tests record

Witness's report shows, for each planned behavior, what its test sent to the app and what it saw.
The test records that while it runs; witness collects it. Evidence never decides pass or fail: the
test runner's report does. Make every test you write or change for the plan record evidence.

## The contract

During a witness run, `WITNESS_ARTIFACTS` names a folder and `WITNESS_EVIDENCE=1` is set. Each test
writes into `$WITNESS_ARTIFACTS/<test id>/`, where `<test id>` is how the test runner names the test
(the id in the plan, without the `adapter:` prefix; the class or file part may be left out; a
parametrized test includes its case, as the framework's display name does), with every
character other than letters, digits, `_`, `.`, `@` and `-` replaced by `_`.

In that folder:

- `evidence.jsonl`: the test's timeline, one JSON object per line, appended in order:
  `{"v": 1, "kind": "<kind>", "data": {...}, "step": "<optional label>", "files": ["<optional file in this folder>"], "t": "<optional ISO time>"}`
- Any plain files: screenshots (`.png`, `.jpg`), video (`.webm`, `.mp4`), traces (`.zip`), HAR files.
  A `files` entry ties a file to the observation it shows (the screenshot after a step).

Kinds witness knows, with the fields it needs in `data` (other fields are kept and shown):

| kind | for | needs | usually also |
| --- | --- | --- | --- |
| `http` | HTTP, REST, GraphQL, webhooks | `method`, `url` | `status`, `ms`, `request: {headers, body}`, `response: {headers, body}` |
| `ui` | browser, desktop or mobile actions | `action` (`navigate`, `click`, `fill`, `see`...) | `target`, `value`, `url`, and a screenshot in `files` |
| `cli` | a command the test runs | `argv` (list) | `exit`, `stdout`, `stderr`, `ms` |
| `message` | queues, events, websockets | `channel`, `direction` (`sent` or `received`) | `payload`, `headers` |
| `rpc` | gRPC and other RPC | `service`, `method` | `request`, `response`, `status` |
| `state` | what a store holds after the action | `store` | `query`, `result` |
| `check` | a key assertion, as the reader would state it | `what` | `expected`, `actual`, `ok` |
| `note` | anything else worth knowing | `text` | |

Any other `kind` is allowed. The report shows its fields as they are, so a new surface needs no
change to witness.

## How to record

Use the cheapest layer that works, in this order:

1. **The framework already records.** Screenshots and video of every test in a `ui`, `mobile` or
   `desktop` suite are set up once, repo-wide, by the init skill's "Screenshots and video" step.
   If `witness check` warns that the suite's tests leave none, do that step first. In the test,
   add `ui` observations for the steps that matter, each with its screenshot.
2. **One hook in the test's client, in the repo's own helpers.** Where tests share an HTTP client,
   a test host, a command runner or a message consumer, add one small function there that appends
   an observation for every exchange: a response hook, a handler or middleware on the client, a
   wrapper around the command runner. Write it in the repo's language and style, next to the
   other test helpers. Keep it short; it is test code the team owns.
3. **A line in the test itself**, for what no hook sees: a `check` for the assertion that proves
   the behavior, a `state` for what the store holds.

The hook needs the running test's id. Most frameworks expose it: the `PYTEST_CURRENT_TEST`
variable (pytest), `expect.getState().currentTestName` and `testPath` (jest, vitest), `testInfo`
(Playwright), `TestContext.Current` (xUnit v3), `TestContext` (MSTest, NUnit), the extension
context (JUnit 5), `t.Name()` (Go), `example.full_description` (RSpec),
`$BATS_TEST_DESCRIPTION` (bats). When a framework hides it, set it from a per-test setup hook.

Rules for the hook:

- Do nothing when `WITNESS_ARTIFACTS` is unset, so the tests run as before outside witness.
- Never change what the test sends or how it fails. Read a response body without consuming it
  (buffer or clone it first).
- Replace the values of `Authorization`, `Cookie`, `Set-Cookie` and API-key headers with
  `[redacted]`. Never record secrets, passwords or tokens from bodies.
- Cut bodies and output after 64 KB, saying how much was cut.
- Append; never rewrite the file. Tests may run in parallel: open, append one line, close.

A sketch in Python (the shape is the same in any language):

```python
def record(kind, data, step=None, files=None):
    root, test = os.environ.get("WITNESS_ARTIFACTS"), os.environ.get("PYTEST_CURRENT_TEST", "").rsplit(" (", 1)[0]
    if not root or not test:
        return
    folder = os.path.join(root, re.sub(r"[^\w.@-]+", "_", test))
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "evidence.jsonl"), "a") as f:
        f.write(json.dumps({"v": 1, "kind": kind, "data": data, "step": step, "files": files}) + "\n")
```

## Check it

Run the tests with `witness run --select <ids>` and open the run's `report.md`: each planned test
lists what it recorded. Problems in `evidence.jsonl` (a line that isn't JSON, a missing field)
show there and in the report's next steps.
