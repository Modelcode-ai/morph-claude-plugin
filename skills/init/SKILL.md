---
name: init
description: Set up witness in a repo that doesn't have it yet. Writes the contract that boots the app, a small witness test helper in the repo's own test framework, and the first boundary tests and claims for existing behavior. Use when the user asks to set up witness, or when `witness` says there is no .witness/witness.toml.
---

# Set up witness in a repo

1. `witness init` writes `.witness/witness.toml` and `VERIFY.md` templates.
2. Find how the app builds and runs: Dockerfile, docker-compose, Makefile, `pom.xml`, `build.gradle`,
   `package.json` scripts, README. Prefer what the repo already documents.
3. Write small scripts in `.witness/bin/`:
   - `build.sh`: idempotent; skips work when sources haven't changed.
   - `start.sh`: runs the app in the foreground on `$PORT`. Use `cd "${CHECKOUT:-$(dirname "$0")/../..}"`
     so the same script can boot the base commit from another checkout. If it uses Docker, name the
     container after the port and stop it on SIGTERM.
   - `test.sh`: runs only the boundary tests against `$WITNESS_API_URL`, honors `$WITNESS_TESTS`
     (comma list of `Class#method`), and writes JUnit XML. If tests run in a container, rewrite
     `localhost` to `host.docker.internal`.
4. Fill in `witness.toml`: `setup`, `start`, a `ready` URL that returns 200 once the app is up, the
   suite `cmd`, its `junit` glob and its `tests` glob.
5. Add the witness helper in the repo's test language: a base class or fixture that reads the base
   URL from `WITNESS_API_URL` and adds the header `X-Witness-Test: <Class>#<method>` to every request.
6. Write two or three boundary tests for important existing behavior, and a claims file that links
   them with `parity` claims.
7. `witness doctor` until the app boots, then `witness verify --no-base`.
8. Fill `VERIFY.md`: how the app boots, where boundary tests live, and any compatibility rules (for
   example "list order is not guaranteed"). Those rules are what the judge may cite later.
9. Commit `.witness/`, `VERIFY.md` and the tests. `.witness/records` and `.witness/cache` are git-ignored.
