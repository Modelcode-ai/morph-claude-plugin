# Witness evidence

Per-test evidence (ENG-10589): what each functional test sent to the app and what it saw,
recorded by the test while it runs, collected by Witness, and shown in the run report next to
the plan item the test proves.

## TL;DR

- **Witness owns a contract, not code.** One folder per test under `$WITNESS_ARTIFACTS`. In it, `evidence.jsonl` is the test's timeline (one observation per line) plus plain files (screenshots, video, traces).
- **An open set of observation kinds.** Eight kinds are known (`http`, `ui`, `cli`, `message`, `rpc`, `state`, `check`, `note`). Any other kind is kept and shown as its fields, so a new surface needs no change to Witness.
- **Tests produce evidence in three layers, cheapest first:**
  - what the framework already records (the Playwright preset now turns traces on);
  - one small hook the agent writes in the repo's own test helpers;
  - a line in the test for the key check.
- **Evidence never decides pass or fail.** The runner's report still does. Witness validates every line and reports problems, and the report flags planned tests that recorded nothing.
- **Proven on all 13 conformance-kit frameworks, and on eShopOnWeb.** Each kit project carries its own adapter, a few lines in its own language, and the new `evidence` scenario passes everywhere. On eShopOnWeb, all 5 planned tests record their HTTP exchanges, and the report shows where the response contains what the test checked.

## Why a contract and not shipped recorders

A first draft shipped recorders (Python, JS, .NET, bats) for repos to copy. That doesn't scale:
- **The matrix multiplies:** languages × HTTP clients × each framework's way of naming the running test.
- **Copies drift:** they would sit in repos Witness doesn't control and go stale whenever the format changes.
- **Witness would carry code for stacks it can't run.**

So Witness owns only what is the same everywhere: the folder, the line format, the collector, the validator and the renderer. The per-language glue is test code the agent writes against a fixed contract, reviewed in the PR with the tests. The kit proves the contract holds in every framework.

## The contract (v1)

```
$WITNESS_ARTIFACTS/<test id>/
  evidence.jsonl      one observation per line, appended in order
  *.png *.webm *.zip  plain files: screenshots, video, traces, HAR…
```

`<test id>` is the test's name as its runner reports it. Characters outside `[A-Za-z0-9_.@-]` become `_`. Witness matches folders to tests loosely:
- `.` and `#` count as the same;
- a trailing `()` is ignored;
- the class or file prefix can be left out when only one test ends with the name;
- a parametrized test includes its case, as its display name does.

Each line:

```json
{"v": 1, "kind": "http", "step": "update the basket", "data": {"method": "POST", "url": "…", "status": 200,
 "request": {"headers": {}, "body": "…"}, "response": {"headers": {}, "body": "…"}}, "files": ["03-after.png"], "t": "2026-11-24T…"}
```

| kind | surface | required in `data` |
| --- | --- | --- |
| `http` | HTTP, REST, GraphQL, webhooks | `method`, `url` |
| `ui` | browser, desktop, mobile actions | `action` |
| `cli` | commands and binaries | `argv` |
| `message` | queues, events, websockets | `channel`, `direction` |
| `rpc` | gRPC and other RPC | `service`, `method` |
| `state` | what a store holds after the action | `store` |
| `check` | the assertion that proves the behavior | `what` (plus `expected`, `actual`, `ok`) |
| `note` | anything else | `text` |
| any other | any surface | nothing; shown as its fields |

**Rules for producers:**
- do nothing outside a witness run;
- never change what the test sends or how it fails;
- redact auth headers and cookies;
- cut bodies at 64 KB;
- append one line at a time.

Witness sets `WITNESS_EVIDENCE=1` for every suite, so fixtures can record on passing tests too, not only on failures.

**What Witness does with it:**
- **Collects** every file into the run's `artifacts.json`, tied to its test.
- **Validates** each line: JSON, `v`, `kind`, `data`, the kind's required fields, and that referenced files exist.
- **Renders** it in `report.html` and `report.md`:
  - each planned test's timeline, with HTTP request and response;
  - for a check with an `expected` value, the excerpt of the response where it appears;
  - screenshots inline, video and traces linked;
  - the base side next to it when the run used `--against`.
- **Counts** it in evidence strength ("Requests and screens recorded").
- **Adds next steps:** "Record evidence for P2" when a planned test recorded nothing, and "Fix the evidence of N tests" when lines are invalid.

Code: `packages/witness/src/evidence/contract.ts` (kinds, validation, titles), `src/suite.ts` (`collectArtifacts`), `src/report/` (rendering). The agent's instructions are in `skills/write/evidence.md`.

## Compared with morph's functional testing today

| | morph today | Witness |
| --- | --- | --- |
| Surfaces | Separate backend (`rest` or `cli`, hard-coded) and frontend (Playwright) models and tables | One model for every surface, with an open set of kinds |
| Who reports a result | The agent calls `write_test_results.py` per test and types in the expected and actual status, the response body and the comparison | The tests record evidence while they run, and Witness collects it. Pass or fail comes only from the runner's report |
| Origin and target comparison | A flag the agent fills in (`response_match`, `origin_output`) | Witness runs both sides and pairs results and evidence by test id |
| Test manifest | Tests with a description, protocol and `applicable_for` | `plan.yaml`: behavior, expected result, where the expectation came from, and the tests that prove it |
| Steps and screenshots | Frontend only (`step_index`, `step_label`) | Any observation can carry a `step` and `files` |
| Skips | A vocabulary of skip reasons | Mistrial diagnosis with cause codes, plus the report's next steps |

What morph does that Witness keeps: per-test records, screenshots and video for UI, request and response for APIs, command and output for CLIs, and origin and target pairs.

What changes: the evidence comes from the test code, not from an agent's account of it. One model covers every surface. Witness checks the evidence rather than trusting it.

## Results

**Conformance kit**, `evidence` scenario. In each project the passing test records an observation, and Witness ties, validates and reports it.

| framework | adapter (in the kit project) | observation |
| --- | --- | --- |
| pytest | `record()` in the test module, using `PYTEST_CURRENT_TEST` | `http` |
| jest, vitest | `record()` using `expect.getState()` | `http` |
| mocha | `record()` using `this.currentTest` | `http` |
| playwright | none: the preset's `--trace=on`, collected from the report's attachments | trace file |
| junit (Maven and Gradle) | `@BeforeEach` with `TestInfo`, and a static recorder | `http` |
| go | `record(t, …)` using `t.Name()` | `http` |
| rspec | a `before` hook with `example.full_description` | `http` |
| phpunit | `$this->name()` | `http` |
| dotnet xunit v3 | a `DelegatingHandler` on the test's `HttpClient`, using `TestContext.Current` | `http` |
| dotnet MSTest | the same handler, with the name set from `TestInitialize` | `http` |
| bats | `witness_run`, a wrapper of `run` | `cli` |

**eShopOnWeb** (branch `eng-10589` of the evaluation checkout; patches in `packages/witness/eval/eshoponweb/`):
- a 60-line `WitnessEvidence.cs` in the functional tests, with an `EvidenceHandler` added to the `WebApplicationFactory` client;
- a `RecordStepAsync` in the e2e browser fixture, which writes a screenshot and a `ui` observation;
- one `check` line in the P1 test.

Run `r-20261123-201532-6c3f`:
- `VERDICT passed · 201 passed`;
- 52 evidence files, all tied to their tests;
- evidence strength 3 of 5, with "Requests and screens recorded" met (5 of 5 planned tests).

## Not yet

- **`check` in a framework's own assertions.** It is recorded only where the test adds a line. Assertion libraries could emit checks through their own hooks; that is per-framework work for later.
- **A proxy on the URLs Witness hands out.** This optional zero-code layer for out-of-process API tests isn't built. Without the test's help it can't tell which test sent a request.
- **Comparing base and target evidence** beyond showing them side by side, for example response bodies that differ. That is the Compare milestone.
- **The morph integration** would ingest `evidence.jsonl` in place of `write_test_results.py`. Its storage keeps `artifact_type` values (`screenshot`, `video`, `trace`); `evidence` is new.
