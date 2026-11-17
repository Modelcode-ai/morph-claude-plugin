# witness

Verify a change at its API boundary with the repo's own tests, and keep a record a reviewer can trust.

witness boots your app, runs your boundary tests (JUnit, pytest, Playwright: anything that writes
JUnit XML) through a recording proxy, and decides each **claim** from the test reports, not from
what an agent says. Then it:

- **checks the tests bite**: new tests must fail on the base commit and pass on your change;
- at `--level high`, **cross-examines the origin**: the base commit's app (a change to an existing
  app) or a separate legacy app (a migration), and compares what both returned;
- asks an isolated **judge** only about what can't be asserted, or about an origin difference. The
  judge may overturn a failure only by quoting a source the agent can't edit;
- writes **the record**: a self-contained `index.html`, a digest for agents (`agent.md`) and a PR
  comment (`pr.md`).

Status: MVP. HTTP APIs only; tested on macOS with Docker.

## Install

Needs Node 22.18+ (the CLI runs TypeScript directly) and, for the demo app, Docker.

**Claude Code plugin** (recommended): skills `/witness:verify`, `/witness:claims`, `/witness:init`,
and a Stop hook that asks for a fresh verdict when the code changed since the last one.

```bash
claude plugin marketplace add /Users/dserebro/work/witness
claude plugin install witness@witness-local
# or, for one session:  claude --plugin-dir /Users/dserebro/work/witness
```

**CLI only**: `/Users/dserebro/work/witness/bin/witness` (symlink it onto your PATH).

## Use it

In a repo that has `.witness/` (see `witness init` or `/witness:init` to set one up):

```bash
witness verify                  # medium: claims + bite check against the base commit
witness verify --level high     # also compare responses with the origin
witness open                    # open the latest record in a browser
witness report --format pr      # PR comment for the latest record
```

In Claude Code, just ask: "implement X and verify it". The plugin's skills tell the agent how to write
claims, pin them with native tests and read the verdict.

Exit codes: `0` proven · `1` needs a look, or nothing proven (no claims) · `2` mistrial (the app or the claims couldn't be put on trial).

What keeps a green verdict honest:
- **Rules come from the base commit.** If a PR edits `equivalence.toml`, results that only pass under the
  new rules show as "can't tell" until the change is merged. New or edited claims, declared differences
  and deleted claims are listed under "Changed in this PR" for the reviewer.
- **Unclaimed changes are caught at high level.** Existing tests that no claim mentions are compared
  with main too; a difference shows up as an `E` claim.
- **The PR can't grade itself.** A skipped proof test fails its claim. A proof test that never calls the
  app proves nothing. A `parity` claim whose test changed in the PR can't pass on its own. Changes to
  the boot/test harness (`witness.toml`, `.witness/bin`, `.witness/origin`) force "Needs a look", and only
  base-revision docs or `--trusted-source` files (vouched for by a human) can justify an overturn.
- **"Proven, pending approval"** means everything holds, and the PR adds or edits claims a reviewer
  should approve. Exit code 0.
- **Requests are checked for coverage.** With `--source issue.md` (or `--why "..."`), the judge lists
  requirements no claim covers as `U` claims ("not tested").

## How a repo is set up

```
.witness/
  witness.toml          # how to boot the app, where tests live, how to run them
  equivalence.toml      # what counts as "the same" when comparing with the origin (optional)
  claims/*.md           # what each change must do, linked to tests
  origin/               # migrations only: how to boot the legacy app, and its route map
  bin/                  # small build/start/test scripts the contract calls
VERIFY.md               # how verification works here; compatibility rules the judge may cite
```

A claims file:

```markdown
---
feature: owners
change: "Filter owners by city"
---
- C1 [api, new] Listing owners filtered by city returns only owners in that city.
  proof: OwnerCityWitnessIT#filtersByCity
- C5 [api, parity] Listing all owners without filters returns the same owners as before.
  proof: OwnersWitnessIT#listsOwners
- L3 [api, changed] An unknown owner returns 404 instead of the legacy app's 500.
  proof: OwnersWitnessIT#unknownOwnerIsNotFound
  expect-diff: status, body
```

Tags: `new` (must fail on the base commit), `parity` (must match the origin), `changed` (an intended
difference from the origin, with `expect-diff`), `judged` (the judge decides from the evidence).

Tests attribute their requests by sending `X-Witness-Test: Class#method`. Add one small helper per
test framework (see `WitnessTestBase.java` in the demo).

## Levels and the origin

- **medium**: boots this change and the base commit; proves claims; checks that new tests bite.
- **high**: medium plus a comparison with the origin for every `parity` and `changed` claim.
  - Same repo (a change to an existing app): the origin is the base commit, already captured by medium.
  - Migration: `[origin] repo/contract/map` in `witness.toml` boots the legacy app and maps routes.
- Results are cached in layers (target, base, origin per test, parity), so High after Medium only
  captures what's missing. Changing `equivalence.toml` re-runs only the comparison.

## Demo

`/Users/dserebro/work/witness-demo/petclinic-rest` (Spring PetClinic REST, in Docker), branches:

| Branch | Shows |
|---|---|
| `feature/owners-by-city` | Proven; all new tests bite |
| `feature/owners-by-city-bug` | Needs a look; the seeded bug is pinned to claim C3 |
| `feature/owners-by-city-drift` | High: a reordered list is overturned by a VERIFY.md rule; a phone format change stays failed |
| `migrate/legacy-parity` | High against the legacy AngularJS app with a route map |

## Develop

```bash
cd engine && npm install && npm test   # unit tests
./build.sh                            # bundle dist/witness.mjs for installs without node_modules
```
