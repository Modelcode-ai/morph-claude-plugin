# init: tests that need another repo's app

Some suites drive an app this repo does not contain: a frontend's browser tests need the backend's
API running, or a client's tests need a server from another repo. Witness starts that app from the
other repo's own config and records both repos' commits; this config lists the repo in a
`[[repo]]` table.

## When it applies

Look for a chosen suite that needs a service no `[[service]]` here can start:

- CI checks out a second repository (`actions/checkout` with `repository:`) or starts its image;
- the tests or the app read a URL nothing here serves: `env` names such as `API_URL` or
  `BACKEND_URL`, a `baseURL`, a dev-server proxy (`proxy.conf.json`, `server.proxy`);
- the README or the agent instruction files say to start the other repo first.

<!-- if morph -->
Use `[[repo]]` when the other repo is checked out next to this one. When it is not, record a
blocker naming the repo and the evidence, and go on with the suites that do not need it.
<!-- else -->
Ask, with the evidence: where the other repo is checked out, and whether it may get its own
`.witness/witness.toml`. Options:

- `[[repo]]` (recommended when there is a checkout): witness starts its app, records its commit,
  and `--against` compares both repos;
- `external = "<url>"` on a service here: an app already running somewhere; witness starts
  nothing and records no commit;
- leave the suite out, with a comment naming why.

Default: `[[repo]]` when a sibling folder (`../<name>`) holds that repo.
<!-- endif -->

## The other repo's config

Its `.witness/witness.toml` says how its services start; this config never copies them. If it has
none, set it up there with stages 2 to 5 of `interview.md` (services, infrastructure, secrets,
check); it needs no suites. Its secrets go in its own `.witness/.env`.
<!-- if standalone -->
Ask before writing files in the other repo.
<!-- endif -->

## Record

```toml
[[repo]]
name = "backend"
path = "../backend"           # relative to this repo
services = ["api"]            # default: every service in its config
suites = []                   # its suites to run here too; default none
env = { CORS_ORIGINS = "*" }  # set for its services, over their own env

[[service]]
name = "web"
start = "npm start -- --port ${PORT}"
depends_on = ["backend.api"]
env = { API_URL = "${backend.api.url}" }
ready = { http = "${self.url}/", timeout = "180s" }
```

- Its services are named `<repo>.<name>`; their dependencies come along. Use the name in
  `depends_on`, `service = [...]` and `${backend.api.url}`. Tests get `WITNESS_BACKEND_API_URL`.
- Point the app here at the other one through whatever it reads: an env variable, a start flag,
  or a proxy file written in `setup`. Comment it when it is not obvious.
- A suite defined here whose tests live in the other repo gets `repo = "backend"`; its `cwd` is
  then relative to that repo.
- Ports, setup and env files stay per repo; witness gives every service its own port.

## Check and compare

`witness check` prints each listed repo and boots its services with the rest. A boot failure
names `backend.api` and its log; the fix belongs in the other repo's config.

`witness run --against main` runs the base of this repo and of each listed repo (its merge base
with its default branch); `--against backend=<ref>` picks the other repo's base.
