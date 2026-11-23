# init: the decisions, stage by stage

Each stage lists what to look at in the `witness init --scan` output, when the repo already
settles it, what to ask, the default, and how to record the choice in `.witness/witness.toml`.

A question names the decision, your recommendation, its evidence and the other options, for example:

> **Scope.** I recommend two suites: `tests/Api` (api) and `tests/E2E` (ui, a browser).
> Evidence: `tests/Api/Api.csproj` references Microsoft.AspNetCore.Mvc.Testing and
> `tests/Api/OrdersTest.cs:17` sends requests through it. I'd leave out `tests/Unit` (no app host
> or HTTP client). Other option: drop the browser suite, which needs Playwright's browsers
> installed. Shall I go ahead?

Ask the user and wait for the answer. One decision per question. If an answer changes an earlier
decision, change the config to match.

## 1. Scope

Look at: `testProjects`, and the CI test command (`commands` with role `test`).

Settled: a `functional` project with high confidence becomes a suite; an `excluded` project stays
out.

Ask when: a project `needs-filter`; a functional one has medium or low confidence (a filtered
command, a guessed kind); a suite needs something the user may not want here (a device, a paid
service, Docker inside Docker); or CI runs the tests in a way the proposal does not.

Default: the suites `--scan` proposes. For a project that needs a filter, narrow its command to
the functional files it lists (a folder, marker, category or tag); if nothing narrows it, leave
it out.

Record: run `witness init`, then start `.witness/witness.toml` from
`.witness/witness.example.toml` (or edit the existing config). One `[[suite]]` per project:

- `name`, `kind` and `adapter` (the framework, so witness reads its reports and selects tests);
- `cwd` and `cmd`: the repo's own test command; witness adds the report flags itself;
- `service`: the services that must be up; `[]` when the tests start the app themselves;
- `timeout` and, when the framework supports it, `per_test_timeout`.

Keep API and browser tests in separate suites, one per test project. A functional project left
out gets a comment: `# tests/AppHostTests: left out, needs Docker inside Docker (user's choice)`.

## 2. How the app runs

Skip when every chosen suite has `service = []`.

Look at: `services`; `commands` with role `start`, `build` and `setup`; `containers`; `urls`;
`health`; `frameworks` with role `toolchain` (the SDK or runtime version). Commands with source
`agent-docs` come from the repo's instruction files for coding agents and are usually the team's
current way to run the app; read those files too.

Settled: only one way to run the app is found, and this machine has what it needs.

Ask: which way to run it:

- a local process: `setup` installs and builds, `start` runs it in the foreground on `${PORT}`;
- Docker or compose: `start = "docker compose up --build <name>"` on its published port;
- an existing URL the user gives: `external = "<url>"`, and witness starts nothing.

Default: a local process with CI's commands, or the manifest's; Docker when this machine lacks the
SDK or OS the app needs and the repo has a Dockerfile or compose file.

Record: a `[[service]]` with `setup`, `start`, and
`ready = { http = "${self.url}<route>", timeout = "180s" }` on a route from `health` (else a page
that answers only when the app is ready to serve), `env` for the settings the app needs and the
URLs of services it calls (`"${api.url}"`), and `depends_on` for services that must be up first.
Pass the port as a flag or in `env`. Comment a mode that is not the obvious one:
`# compose: this machine has no .NET 11 SDK (user's choice)`.

## 3. Infrastructure

Skip when nothing in `infrastructure` is used by the chosen services and suites.

Look at: `infrastructure` (compose services with candidate `start`, `stop` and `check`; database
URLs in env examples and settings, with their `host`); `env` names such as `DATABASE_URL`;
settings that switch the app to an in-memory store; `commands` with role `migrate`.

Settled: the repo's compose file starts it and the user has Docker.

Ask: start it with compose, use an existing database or queue (the user gives its URL), or use an
in-memory mode the app supports.

Default: compose when the repo has it; otherwise an in-memory mode the app supports; an existing
database only when the user names one.

Record: a `[[dependency]]` with `name` and `check` (or `check_http`), and, for compose, `start`
and `stop` from the scan. Witness checks dependencies before any service boots. Migrations go in
the service's `setup` after the build. An existing database: its URL variable in `[env] required`.
Not using a store the repo has gets a comment: `# sqlserver: not needed, UseOnlyInMemoryDatabase=true`.

## 4. Secrets, test users and test data

Look at: `env` (`secret`, `testUser`, `readBy`, `exampleValue`, `configured`); `data` (seeds,
fixtures, migrations, test users and their logins); `commands` with role `seed`.

Settled: a variable with a working example value or a default in the code; a seed the app runs on
its own at startup.

Ask, for each secret the chosen services and suites need that has no value: does the user have
one, should the tests use the provider's test mode, or should the suite that needs it be left
out? For test users: which account the tests sign in as, when the seed and the tests disagree or
nothing seeds one. For test data: whether a seed command must run before the suites.

Default: leave out secrets that no chosen service or suite reads; sign in as the user the seed
creates and the tests already use; run the repo's seed command when tests expect seeded data.

Record: names in `[env] required`; values in `.witness/.env` (git-ignored). Never ask for a secret
in the conversation: the user writes it into `.witness/.env` themselves. You may write a value that
is not secret, such as a local database URL.
A seed goes in the service's `setup` after migrations; `setup` is skipped when nothing changed, so
a seed that must run before every run goes in `start` (`npm run seed && npm start`). A secret left
out gets a comment naming it: `# STRIPE_SECRET_KEY: not set, payment tests left out`.

## 5. Check until it passes

Run `witness check`: config, dependencies, the suites' services, then each suite's test listing
(or a smoke run).

It also prints each suite's capabilities (`report`, `list`, `select`, per-test timeout) and what a
missing one costs. Fix what you can: when `select` is `none` because the command is compound
(`cd x && ...`), put `${WITNESS_SELECT}` where the runner's arguments go; when `list` is `none`,
add `list = "<command printing one test id per line>"` or let one full run fill it.

When a stage fails, follow its diagnosis (cause, evidence, `try` commands; the `triage` skill
explains each cause). `witness check --stage boot --service <name>` works on one service at a time.

Ask only when the fix is a choice the user owns: installing an SDK, a browser or a certificate on
their machine, freeing a port their own process holds, or moving the app into Docker. Fix the rest
yourself: a wrong path, a missing flag, the readiness URL.

Default: the fix that changes least outside the repo. Installing software or changing the machine
is never a default: write the config so that it works once the user has done it (a required
variable such as the SDK's folder), and report the exact step as what blocks you.

After five rounds, stop and report what blocks you.

## 6. Baseline

Run each suite once on the unchanged code: `witness run --suite <name> --label init-<name>`.

- `passed`: done with that suite.
- `failed`: tests that fail on the unchanged code. Ask whether to keep them in the suite as known
  failures, or narrow the suite to leave them out. Never fix or skip them yourself.
- `mistrial`, `error`, `stalled`: fix the setup (the `triage` skill), then run again.

Default: keep them, so later runs can tell old failures from new.

Record: a suite narrowed to leave failing tests out gets a comment naming them. Known failures go
in the report, not the config.

## 7. Commit

Ask whether to commit `.witness/witness.toml` and `.witness/.gitignore`.

Default: do not commit; the report names the two files to commit.

Never commit `.witness/.env` or `.witness/runs/`.
