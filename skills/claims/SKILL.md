---
name: claims
description: Write or update witness claims for a change and pin each one with a native boundary test in the repo's own test framework. Use when a change in a repo with .witness/ has no claims yet, when behavior changed and its claims are out of date, or when the user asks what a change should be verified against.
---

# Write claims and pin them with native tests

A claim is one sentence of behavior a reviewer cares about, checked at the app's boundary (HTTP API,
CLI or UI), and linked to the test that proves it. Claims live in `.witness/claims/*.md` and ship
in the PR, where a human approves them.

## 1. Learn the repo's conventions

Read, in this order: `VERIFY.md`, `.witness/witness.toml` (the `[[suite]] tests` glob shows where
boundary tests live), the existing claims files, and two or three existing boundary tests. Copy
their framework, helpers, naming and style exactly. Tests must extend or use the repo's witness
helper (it reads the base URL from `WITNESS_API_URL` and sends the `X-Witness-Test` header so the
record can attribute requests to tests).

## 2. Write the claims

One file per feature or change, e.g. `.witness/claims/owners-by-city.md`:

```markdown
---
feature: owners
change: "Filter owners by city"
---
- C1 [api, new] Listing owners filtered by city returns only owners in that city.
  proof: OwnerCityWitnessIT#filtersByCity
- C2 [api, parity] Listing all owners without filters returns the same owners as before the change.
  proof: OwnersWitnessIT#listsOwners
- C3 [api, changed] Unknown owners now return 404 instead of 500.
  proof: OwnersWitnessIT#unknownOwnerIsNotFound
  expect-diff: status
- C4 [api, judged] The error for an invalid city tells the user which values are allowed.
  evidence: GET /owners?city=
```

- Ids are unique across all claim files. Keep them stable; never reuse a retired id.
- Tags: `new` (behavior that didn't exist before: its test must fail on the base commit),
  `parity` (existing behavior that must not change), `changed` (an intended difference from the
  base, with `expect-diff:` naming what differs: `status`, `body`, `body.city`, `header.content-type`),
  `judged` (can't be asserted mechanically; the judge rules on it from the evidence).
- `proof: Class#method` must name a real test method.
- Add `parity` claims for neighboring behavior your change could break. They cost little and
  catch regressions the new tests don't.

## 3. Pin each claim with a native test

- Black box only: talk to the app through its URL. Don't import application classes.
- Each test sets up the data it needs, or uses seed data the app ships with. Don't depend on other
  tests' side effects or on run order.
- Assert the specific behavior in the claim (status and the fields that matter), so the test fails
  without the change.

## 4. Curate

- If your change makes an existing claim wrong, don't delete it. Add `retired: <why>` under it, or
  update its text and say so.
- List the suite changes in your final message ("+3 claims, C2 retired, 1 test rewritten") so the
  reviewer can approve them in the PR.

Then run `witness lint` and follow the `verify` skill.
