# Witness MVP: implementation plan

Status: revised after review round 1 · 2026-11-17 · time box: 4 hours total on one laptop: ~25 min planning, ~1h40 build, ~1h30 review/iterate, ~25 min report.
Design source: the "Witness Verification Proposal" artifact (courtroom vocabulary confirmed).

## Goal of the MVP

Prove on this machine, end to end, that:

1. A coding agent (Claude Code, through a plugin) can verify its own change to an enterprise-style Java app at the API boundary using **native** tests (JUnit 5 + REST Assured, run by Maven), with the **runner** deciding pass/fail, not the agent.
2. Each run produces **the record** (evidence bundle): `bundle.json` + exchanges + a self-contained `index.html` viewer with a 5-second verdict, a claims checklist, and per-claim evidence.
3. The **bite check** works: new tests must fail against the base commit's app and pass against head.
4. **High** level works incrementally: after a Medium run, `--level high` reuses the target layer, captures only missing origin observations ("subpoena"), and compares them under equivalence rules ("cross-examination"), with a failing mismatch that a judge may overturn only by quoting a source.
5. A developer who has never seen it can install the plugin and get a useful verdict without reading source.

Non-goals for the MVP (recorded in the final report): UI/browser evidence beyond a stretch slice, OpenMRS, morph/lens ingestion, GitHub Action execution against a real PR (we generate it and render the PR comment locally), boundary mutation, pi-based author agent, signing.

## Revisions after plan review round 1

1. **Scope cut to fit 1h40 of build.** v1 = contract + boot + proxy + suites + claims + bite + High-via-base + judge + record/viewer (single page: verdict, claims list, per-claim exchanges/test/judge panels) + plugin (verify + claims skills, Stop hook) + lint/doctor (minimal) + init (template only). **Stretch, in order:** Migrate origin with `map.toml` (AngularJS), `pr.md` rendering polish, `depose`, `up|down`, `ci github`, UI/browser evidence.
2. **Attribution is explicit.** Native tests send `X-Witness-Test: Class#method` from one small idiomatic helper per language (Java: an abstract `WitnessTestBase` with a JUnit 5 `@BeforeEach(TestInfo)` that installs a RestAssured filter). The proxy keys exchanges on that header and strips it before forwarding. Exchanges without it are kept as `unattributed`. `lint` warns when a proof test's class doesn't extend the base / the header never appears in a run.
3. **High for Evolve reuses the bite run.** Origin = base. The bite run already boots base and runs head's tests against it through the proxy, so base exchanges *are* the origin observations. One base boot serves bite and parity. The origin cache is keyed by base SHA + head test-files hash; "subpoena" = base not yet captured for these tests. A Medium run with `--base` therefore already holds everything High needs except the comparison; a Medium run without `--base` makes High boot base only. Migrate origin + `map.toml` is stretch.
4. **Docker networking is explicit.** Services run in containers publishing `-p <PORT>:<container port>`. The proxy runs on the host (bound to 127.0.0.1 if containers can reach it via `host.docker.internal`, else 0.0.0.0 — checked by `doctor`). Suite commands receive `WITNESS_API_URL=http://localhost:<proxy>`; container-based suite scripts rewrite `localhost` → `host.docker.internal`. The demo agent warms `~/.m2` first.
5. **Bite run semantics.** Suites always run with cwd = head checkout. Base services are booted from **head's** contract with cwd = a base git worktree (`CHECKOUT` env points at it; `WITNESS_HOME` points at head's `.witness/` so scripts resolve).
6. **Cache/stale keys.** Tree hash via temporary index (`GIT_INDEX_FILE=tmp git add -A; git write-tree`), excluding `.witness/records` and `.witness/cache`, which are also git-ignored via `.witness/.gitignore`. Target-layer key = tree hash + contract hash + base SHA. Stop hook uses the same function.
7. **Overturn sources the agent can't plant.** The judge may cite only (a) base-revision copies of `VERIFY.md` and `.witness/sources/*` (e.g. exported morph spec/roadmap), and (b) files passed with `--source <path>` that live outside the repo (e.g. the issue text). Quotes must match verbatim after whitespace normalization and be ≥ 30 characters. Claims and commit messages written in the diff can't justify an overturn (`changed` claims still classify intended differences mechanically and are human-gated in PR review).
8. **Stop hook** exits 0 when `stop_hook_active` is true; otherwise blocks once if the tree hash differs from the latest record's.
9. **State isolation.** Head and base each get a fresh boot; `fixtures.reset` (if declared) runs before each suite invocation. Flake reruns are recorded as a separate attempt; parity pairs only primary-run exchanges.
10. **Goal 5** is measured only by the average-developer persona round.

## Repo layout (`/Users/dserebro/work/witness`)

```
witness/
  engine/                 # TypeScript, run directly by Node 24 (type stripping), no build step
    src/cli.ts            # entry: witness <command>
    src/contract.ts       # parse .witness/witness.toml + workspace sides
    src/services.ts       # boot/teardown services, port allocation, readiness probes
    src/proxy.ts          # recording reverse proxy (HTTP exchanges -> JSONL)
    src/suites.ts         # run native suites, parse JUnit XML (universal adapter)
    src/claims.ts         # parse .witness/claims/*.md, link claims -> test ids
    src/verdict.ts        # tiers: T0 setup, T1 asserted, bite, parity, T2 judge
    src/parity.ts         # observations, equivalence rules, map rewrite, layer cache
    src/judge.ts          # isolated judge via `claude -p --json-schema`
    src/record.ts         # write bundle.json, agent.md, pr.md; render viewer
    src/viewer/index.html # template: self-contained viewer, data embedded at write time
    src/lint.ts, src/doctor.ts
    test/                 # node:test unit tests for parsers, verdict logic, equivalence
  plugin/                 # Claude Code plugin (local marketplace)
    .claude-plugin/plugin.json
    skills/verify/SKILL.md     # run, read agent.md, fix, re-run
    skills/claims/SKILL.md     # write claims + pin native tests in the repo's style
    skills/init/SKILL.md       # draft witness.toml/VERIFY.md for a repo
    hooks/hooks.json           # Stop hook: block if code changed since the last verdict
    bin/witness                # shim -> engine/src/cli.ts
  marketplace/.claude-plugin/marketplace.json
  demo/                   # scripts to fetch and prepare the PetClinic repos (not vendored)
  docs/PLAN.md, docs/REPORT.md
```

Language: TypeScript on Node 24 with native type stripping (no compile). Dependencies kept to `smol-toml` (TOML) and `fast-xml-parser` (JUnit XML). The judge shells out to `claude -p`.

## Demo apps (Spring PetClinic family, all in Docker since no local JDK)

- **Target (Evolve, Medium):** `spring-petclinic/spring-petclinic-rest` (Spring Boot, H2 in-memory, REST under `/petclinic/api`). Built and run through `maven:3-eclipse-temurin-17` with a shared `~/.m2` volume so rebuilds are fast.
- **Change under test:** an agent-authored change on a branch, modeled on a real issue in that repo (to be picked during setup; fallback: a small feature such as filtering owners by city or a validation fix). A seeded-bug variant of the same change proves the verdict goes red.
- **Origin (Migrate, High):** `spring-petclinic/spring-petclinic-angularjs` backend if it builds; its REST routes differ from the target, which exercises `map.toml`. Fallback if it won't build in the time box: an older tagged commit of `spring-petclinic-rest` as origin (same language, still exercises subpoena/cross-examination/caching/overturn). The report will say which one was used.
- **Native tests:** JUnit 5 + REST Assured under `src/test/java/.../witness/` in the target repo, reading the base URL from `WITNESS_API_URL`, run with `mvn -Dtest='*WitnessIT' test` (or a profile) so the repo's unit tests are not run. Results come from surefire JUnit XML.

## The contract (`.witness/witness.toml`) supported in the MVP

```toml
[[service]]
name  = "api"
setup = "…"                 # optional, run once per checkout, cached by input hash
start = "…${PORT}…"         # long-running; PORT allocated by witness
ready = { http = "${self.url}/petclinic/api/owners", status = 200, timeout = "240s" }

[fixtures]
reset = "…"                 # optional

[surfaces]
api = { service = "api" }   # tests get WITNESS_API_URL pointing at the recording proxy

[[suite]]
name   = "api"
cmd    = "…mvn … -Dtest=*WitnessIT test"
junit  = "target/surefire-reports/*.xml"

[origin]                    # optional: High level
ref      = "base"           # Evolve, or:
repo     = "../petclinic-origin"   # Migrate: path to origin checkout + its own contract
contract = ".witness/origin/witness.toml"
map      = ".witness/origin/map.toml"
equivalence = ".witness/equivalence.toml"
```

`${PORT}`, `${self.url}`, `${WITNESS_TMP}`, `${CHECKOUT}` are substituted. Services start with their cwd at the checkout being verified (head, base worktree, or origin path).

## Claims format (`.witness/claims/*.md`)

```
---
feature: owners
change: "Filter owners by city"
---
- C1 [api, parity] Listing owners filtered by city returns only owners in that city.
  proof: OwnerCityWitnessIT#filtersByCity
- C2 [api, changed] Unknown city returns an empty list instead of 404.
  expect-diff: status
- C3 [api, new] …
  proof: …
- C4 [api, judged] The error message for an invalid city is understandable to a user.
  evidence: exchanges matching GET /petclinic/api/owners?city=
```

`proof:` resolves to a JUnit testcase by `Class#method` (suffix match on classname). `judged` claims go to T2 with the exchanges named by `evidence:`.

## Run flow: `witness verify [--level medium|high] [--base <ref>] [--no-judge]`

1. **T0 setup ("mistrial" if it fails):** parse contract and claims; `lint` (every proof resolves to a test file/method name found by grep; claims have ids). Boot head services on free ports behind a recording proxy; wait for readiness. Failure → verdict `blocked` with the failing step's log tail and a remedy line.
2. **T1 asserted:** run suites with `WITNESS_API_URL` = proxy URL and `WITNESS_TEST_HEADER` hint. Parse JUnit XML. Re-run failed tests once (if the suite cmd supports a filter placeholder `${TESTS}`); fail→pass = `flaky` ("unreliable witness").
3. **Bite (when `--base` given, default merge-base with `main` if it exists):** create a git worktree of base, boot it on other ports, run head's suites against it (tests are black-box, so head's tests run against the base app). For each claim tagged `new`/`changed`/untagged with a proof: expect fail on base, pass on head → `bites`. Pass on both → `vacuous` warning (red in the viewer as "doesn't bite").
4. **Medium output = target layer** stored under `.witness/cache/target/<hash>` where hash = head tree hash (`git stash create`-style tree id incl. working changes) + contract hash + test files hash. Reused on next run if unchanged.
5. **High (subpoena + cross-examination):** for each `parity`/`changed` claim's test, look up origin capture in `.witness/cache/origin/<hash>` (origin SHA + test hash + map hash). Missing → boot origin (contract from `[origin]`), run only those tests against the origin through the proxy (with `map.toml` route rewrites applied on the way to the origin and field renames on the way back), store observations. Then compare head vs origin exchanges per test, paired by order + method + normalized path, under `equivalence.toml` (ignore fields, unordered arrays, header allowlist). Results: `equal`, `intended` (matches a `changed` claim's `expect-diff`), `unexplained` → claim fails. Parity layer is pure computation, cached by (target hash, origin hash, equivalence hash).
6. **T2 judge (skippable with `--no-judge`):** one `claude -p` call per judged claim and per unexplained parity difference. Input: claim, evidence excerpts (exchanges), and sources (claims file, `VERIFY.md`, change description from `--why` or the branch's commit messages, morph spec text if provided). Output schema: `{verdict: pass|fail|cant_tell|overturn, citations:[{source, quote}], note, suggested_claim}`. Overturn accepted only if verdict=overturn, the item is a parity failure, and at least one citation quote is found verbatim in a provided source document (checked by the engine). Otherwise downgraded to fail.
7. **The record:** `.witness/records/<timestamp>/` with `bundle.json`, `exchanges/*.jsonl`, `logs/*.log`, `index.html` (viewer with data embedded), `agent.md` (failure digest ≤ ~150 lines), `pr.md` (Level-0 PR comment). `.witness/records/latest` symlink. Exit code: 0 pass, 1 fail/needs a look, 2 blocked.

## Viewer (static, no framework)

- Header: verdict word (Proven / Needs a look / Mistrial), counts (proven, failed, can't tell, overturned, not tested), level, SHAs, duration.
- Left: claims grouped by feature with status dot, surface tag, `bites`/`doesn't bite`, parity dot at High.
- Right: claim detail with tabs: Evidence (exchanges for the linked test: request/response, base vs head when available), Origin vs Target (High), Test (source snippet located by method name, highlighted), Judge (verdict, citations), Logs.
- Works offline from `file://`. Plain words in UI; courtroom terms only in CLI output and docs.

## Claude Code plugin (shipped first, used for the dogfood)

- `/witness:verify` skill: runs `witness verify`, reads `agent.md`, fixes code or tests (never edits claims to make a failure disappear without telling the user), re-runs; finishes by printing the Level-0 summary and the viewer path.
- `/witness:claims` skill: from a change description + diff, write/update claims and pin native tests by following existing tests in the repo; never decides verdicts.
- `/witness:init` skill: draft `witness.toml` + `VERIFY.md` from the repo (Dockerfile/pom/package.json/compose), run `witness doctor` until boot succeeds.
- Stop hook: if the working tree changed since the last record's tree hash and the repo has `.witness/`, block once with "verification is stale; run /witness:verify" (one block per session to avoid loops; disable with `WITNESS_HOOK=off`).
- Installed from the local marketplace: `claude plugin marketplace add /Users/dserebro/work/witness/marketplace` then `claude plugin install witness@witness-local`. Headless use: `claude --plugin-dir plugin`.

## Other commands

`witness init` (writes a commented template), `witness doctor` (docker running, ports free, setup/start commands resolvable, boots and probes), `witness lint`, `witness up|down` (boot head for manual poking), `witness depose <METHOD> <path> [body]` (probe via the proxy; recorded as deposition exhibits), `witness open` (prints/opens viewer path), `witness report --format pr|agent`, `witness ci github` (writes a workflow file).

## Verification of the MVP itself

- Unit tests (`node --test`) for: claims parser, JUnit parser, verdict computation incl. bite and overturn rules, equivalence comparator, map rewrite, cache keys.
- End-to-end on PetClinic: (a) good change → Proven with bites; (b) seeded bug → Needs a look with a pinpointed failing claim; (c) vacuous test → flagged; (d) High after Medium → origin captured once, second High run reuses everything (timed); (e) an intended difference is classified, an unexplained one fails, and an overturn only sticks with a verbatim quote.
- Plugin dogfood: a headless Claude Code session with the plugin implements a small change from an issue description and reaches a verdict.

## Review loop (per the request)

1. Blank-slate reviewer approves this plan (fix and re-review until approved).
2. After implementation, each round runs three agents in parallel: (a) zero-context adversarial reviewer on the repo; (b) design-alignment reviewer with the artifact HTML + this plan; (c) "average developer" persona that installs the plugin from the README and tries to verify a change. Fix the findings, repeat until a round produces no high-severity findings or time runs out.
3. Final report: `docs/REPORT.md`.

## Time plan (start 02:10)

- 02:10–02:35 plan + review
- 02:35–04:15 build: engine core (me) in parallel with a demo-setup agent (clone, build in Docker, write contract, change branch, native tests, origin)
- 04:15–05:45 review rounds (2 expected)
- 05:45–06:10 final report

## Risks

- Maven in Docker is slow on first run (dependency download). Mitigation: shared `~/.m2` volume, warm it first, use `-o` once warm.
- AngularJS origin may not build. Mitigation: fallback origin documented above.
- Pairing exchanges between origin and target when routes differ. Mitigation: pair per test by order after `map.toml` normalization; report unpaired exchanges explicitly.
- Judge cost/latency. Mitigation: only judged claims and unexplained diffs; `--no-judge`.
