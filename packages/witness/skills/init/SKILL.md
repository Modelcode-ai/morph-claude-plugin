---
name: init
description: Set up witness in a repo that has no .witness/witness.toml - detect the test frameworks and services, complete the config, and make witness check pass with one smoke run per suite. Use when witness says there is no config, or before the first witness run in a repo.
---

# Set up witness in a repo

Output: `.witness/witness.toml` that passes `witness check`, and one run per suite.

## 1. Detect

Run `witness init`. It writes `.witness/witness.example.toml` with the suites and services it
could guess from the repo (pytest, Maven, Gradle, .NET, jest, vitest, Playwright, go, mocha,
RSpec, PHPUnit, and web apps it recognises), and `.witness/.gitignore`.

Copy it to `.witness/witness.toml` and complete it. Read the repo's README, CI workflow files,
Makefile, package scripts, Dockerfile and compose files: they show how the app is built, started
and tested. Prefer the commands CI uses.

## 2. Complete the config

For each service the tests need (an API, a web front end, a worker):

- `setup`: install and build (for example `npm ci && npm run build`). Witness skips it when
  nothing changed.
- `start`: runs the app in the foreground on `${PORT}`. Witness picks a free port; pass it the way
  the app accepts it (a flag or an environment variable in `env`).
- `ready`: `{ http = "${self.url}/health", timeout = "120s" }` with a URL that answers only when
  the app is ready to serve, or `{ cmd = "..." }`.
- `env`: what the app needs, and the URLs of services it calls (`"${api.url}"`).
- `depends_on`: services that must be up first.

For databases and other infrastructure, add a `[[dependency]]` with a `check` command and, when it
can be started locally, `start` and `stop` (for example `docker compose up -d db`).

Put secrets and machine-specific values in `.witness/.env` (git-ignored) and list required names in
`[env] required`.

For each suite:

- `adapter`: the framework, so witness can read its reports and select single tests.
- `cmd`: the repo's own test command for that suite. Witness adds the report flags itself.
- `service`: which services must be up (`[]` for unit tests that need none).
- `timeout` and, when the framework supports it, `per_test_timeout`.

Keep unit, integration and end-to-end tests in separate suites, one per test project where the
framework works per project.

## 3. Check until it passes

Run `witness check`. It goes stage by stage: config, dependencies, booting each service, then
listing each suite's tests (or a smoke run when the framework cannot list). It can take minutes
on the first build; follow the "Long commands" rules of the `test-change` skill.

When a stage fails, follow the diagnosis it prints (cause, evidence line, `try` commands). The
`triage` skill explains each cause. Use `witness check --stage boot --service <name>` to work on
one service at a time. Up to five rounds; then stop and report what blocks you.

## 4. One run per suite

Run each suite once on the unchanged code: `witness run --suite <name> --label init-<name>`.

- `passed`: done with that suite.
- `failed`: the tests themselves fail on the unchanged code. Do not fix or skip them; note which
  tests fail, so later runs can tell old failures from new ones.
- `mistrial`, `error`, `stalled`: fix the setup (the `triage` skill), then run again.

## 5. Finish

- Commit `.witness/witness.toml` and `.witness/.gitignore` only if the user or your instructions
  want the config in the repo. Never commit `.witness/.env` or `.witness/runs/`.
- Report: the services and suites configured, the check result, each suite's first VERDICT, tests
  that already fail on the unchanged code, and anything left out (with the reason, for example a
  suite needing a paid service).

Do not mark a suite as `generic` without a report, or drop a service's readiness check, just to
make `witness check` pass.
