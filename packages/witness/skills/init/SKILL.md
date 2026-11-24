---
name: init
description: Set up witness in a repo that has no .witness/witness.toml, or whose config no longer fits - gather the repo's facts, settle each setup decision (with the user, one question at a time), write the config and make witness check pass with one run per suite. Use when witness says there is no config, or before the first witness run in a repo.
---

# Set up witness in a repo

Output: a `.witness/witness.toml` that records the choices made below and passes `witness check`,
plus one run per suite on the unchanged code.

Witness runs functional tests only: tests that drive the app through its HTTP API (`kind =
"api"`), a browser (`"ui"`), built command (`"cli"`), window (`"desktop"`) or device (`"mobile"`).
Unit and integration tests belong to the project's own build and test scripts.

## Facts first

Run `witness init`: it writes `.witness/witness.example.toml`, `.witness/.gitignore` and the
git-ignored `.witness/scratch/`. Then run `witness init --scan > .witness/scratch/scan.json`: JSON
facts, each with a `confidence` and its `evidence` (file:line or manifest):

- `testProjects`: functional, needs-filter or excluded, with the reason and the proposed suite;
- `commands` (setup, build, start, test, migrate, seed) from CI, package scripts, Makefiles,
  Dockerfiles and compose files; `containers`, `urls` and `health` routes;
- `infrastructure`: compose services with candidate commands, database URLs in env examples;
- `env`: the names the app, tests, CI and compose read, secrets flagged (values never printed);
- `data`: seeds, fixtures, migrations, test users; `frameworks` and `adapters`;
- `machine`: the toolchains, SDKs, Docker and test browsers this machine has;
- `config`: what an existing `.witness/witness.toml` covers, and what is `missing` or `unmatched`.

Open the evidence a decision rests on before you rely on it. Prefer CI's commands. Never say this
machine lacks something unless `machine` or a command you ran shows it.

## Deciding

<!-- if morph -->
No one answers here. When morph rendered `.witness/witness.toml`, it has made stages 1 to 4: keep
it, and edit it only to fix what `witness check` or a diagnosis shows is wrong. For any other
decision:

- A high-confidence fact that nothing contradicts settles it.
- Otherwise take the recommendation in `interview.md`, and list it under "Decisions to confirm" in
  your report: the question you would have asked, your choice and its evidence.
- When it needs something only the user has (a secret, a URL, a paid service), record a blocker
  and go on with the work that does not depend on it.
<!-- else -->
Settle each decision with the user, one at a time, at the stage where it matters:

- Never ask what the repo answers. A high-confidence fact that nothing contradicts settles it: say
  in one line what you chose and why.
- Otherwise ask one question: your recommendation, its evidence, and the other options. Then end
  your turn and wait for the answer, even when setup is one step of a larger task.
- If the user tells you to use your defaults, at any point, ask nothing more: take every
  recommendation in `interview.md` and list them in your report.
- With an existing config, ask only about what `config.missing` and `config.unmatched` name, or
  what changed since.
<!-- endif -->

The config is the record: each choice shows in `witness.toml`. Where a value alone would not say
why (a project left out, an in-memory store instead of a database), add a one-line comment that
names it; `--scan` counts a comment naming a project, dependency or variable as a decision made.
Keep no other notes file.

## Stages

When you reach stage 1, read `interview.md` in this skill's folder: for each stage, what to look
at, when it is already decided, the question and its default, and how to record the answer.

1. Scope: which test projects become suites; the excluded ones; the ones that need a filter.
2. How the app runs: a local process, Docker or compose, or an existing URL.
3. Infrastructure: start it with compose, or use an existing database or queue.
4. Secrets, test users and test data.
5. Check until it passes: `witness check`, and boot failures that need a choice.
6. Baseline: one run per suite on the unchanged code, and tests that already fail there.
7. Commit: whether the config goes into the repo.

Builds and runs can take minutes: follow the "Long commands" rules of the `test-change` skill.

Never add back an excluded project, mark a suite `generic` without a report, or drop a service's
readiness check just to make `witness check` pass.

## Report

- The services and suites configured, the check result and each suite's first VERDICT.
- Tests that already fail on the unchanged code.
- Anything left out, with the reason.
<!-- if morph -->
- Decisions to confirm: each decision you took by default, with the question, your choice and
  the evidence.
- Each blocker: what is needed (a secret, a URL, a paid service) and the evidence.
<!-- else -->
- Each decision and who made it: the user, your default, or the repo's facts.
<!-- endif -->
