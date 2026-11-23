---
name: witness-init
description: Set up witness in a repo that has no .witness/witness.toml - detect the functional test suites and services, complete the config, and make witness check pass with one smoke run per suite. Use when witness says there is no config, or before the first witness run in a repo.
---

# Set up witness in a repo

Output: a `.witness/witness.toml` that passes `witness check`, plus one run per suite.

## 1. Detect

Witness runs functional tests only: tests that drive the app through its HTTP API (`kind =
"api"`, with the app in the test process or at a URL) or in a browser (`kind = "ui"`). Unit and
integration tests belong to the project's own build and test scripts.

Run `witness init`. It writes `.witness/witness.example.toml` and `.witness/.gitignore`, and
proposes a suite only for test projects whose tests drive the app. It prints, and writes into the
file as comments:

- excluded: each project left out, with the reason (for example `tests/UnitTests: unit (no app
  host, HTTP client or browser driver)`). Do not add these back.
- needs a filter: a project mixing functional and other tests with no folder or tag between them.
  Narrow its commented-out `cmd` to the functional files listed, then uncomment it.

If a guess looks wrong, read the project's tests and say so in your report.

Copy the file to `.witness/witness.toml` and complete it. Read the README, CI workflows, Makefile,
package scripts and compose files for how the app is built, started and tested; prefer CI's commands.

## 2. Complete the config

For each service the tests need (an API, a web front end, a worker):

- `setup`: install and build (for example `npm ci && npm run build`). Witness skips it when
  nothing changed.
- `start`: runs the app in the foreground on the free port `${PORT}` (pass it as a flag or in `env`).
- `ready`: `{ http = "${self.url}/health", timeout = "120s" }` with a URL that answers only when
  the app is ready to serve, or `{ cmd = "..." }`.
- `env`: what the app needs, including URLs of services it calls (`"${api.url}"`).
- `depends_on`: services that must be up first.

For databases and other infrastructure, add a `[[dependency]]` with a `check` command and, when it
can be started locally, `start` and `stop` (for example `docker compose up -d db`).

Put secrets and machine-specific values in `.witness/.env` (git-ignored) and list required names in
`[env] required`.

For each suite:

- `adapter`: the framework, so witness can read its reports and select single tests.
- `kind`: `api` or `ui` (required).
- `cmd`: the repo's own test command for that suite. Witness adds the report flags itself.
- `service`: which services must be up; `[]` when the tests start the app themselves.
- `timeout` and, when the framework supports it, `per_test_timeout`.

Keep API and browser tests in separate suites, one per test project. `witness check` warns when a suite's tests don't drive the app; fix that with a filter or
remove the suite.

## 3. Check until it passes

Run `witness check`. It checks config and dependencies, boots the suites' services, then lists each
suite's tests (or smoke-runs it). It can take minutes
on the first build; follow the "Long commands" rules of the `test-change` skill.

It also prints each suite's capabilities (`report`, `list`, `select`, per-test timeout) and what a
missing one costs. Fix what you can: when `select` is `none` because the
command is compound (`cd x && ...`), put `${WITNESS_SELECT}` where the runner's arguments go; when
`list` is `none`, add `list = "<command printing one test id per line>"` or let one full run fill it.

When a stage fails, follow its diagnosis (cause, evidence, `try` commands; the `triage` skill
explains each cause). Use `witness check --stage boot --service <name>` to work on
one service at a time. After five rounds, stop and report what blocks you.

## 4. One run per suite

Run each suite once on the unchanged code: `witness run --suite <name> --label init-<name>`.

- `passed`: done with that suite.
- `failed`: the tests themselves fail on the unchanged code. Don't fix or skip them; note them
  so later runs can tell old failures from new.
- `mistrial`, `error`, `stalled`: fix the setup (the `triage` skill), then run again.

## 5. Finish

- Commit `.witness/witness.toml` and `.witness/.gitignore` only if the user or your instructions
  want the config in the repo. Never commit `.witness/.env` or `.witness/runs/`.
- Report: the services and suites configured, the check result, each suite's first VERDICT, tests
  that already fail on the unchanged code, and anything left out (with the reason, for example a
  suite needing a paid service).

Do not mark a suite as `generic` without a report, or drop a service's readiness check, just to
make `witness check` pass.
