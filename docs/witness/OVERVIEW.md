# witness

Boot an app, run its own tests, and keep results that an agent cannot talk its way around.

The code lives in [`packages/witness`](packages/witness). Start with its README.

```bash
packages/witness/bin/witness init     # guess suites from the repo
packages/witness/bin/witness check    # config, deps, boot, list tests
packages/witness/bin/witness run      # full run; writes .witness/runs/<run-id>/
```

`bin/witness` at the repo root forwards to the package.

The proof of concept (claims, judge, recording proxy, record viewer, Claude Code plugin) was removed when
the package replaced it; it is in git history before the ENG-10540 commits. `docs/` keeps the study and
report from that phase.
