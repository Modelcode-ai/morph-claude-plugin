---
name: triage
description: Handle a witness run or check that could not produce test results (VERDICT mistrial, error or stalled) - read the diagnosis, retry or fix the setup, and decide whether the change broke the app's boot. Use whenever witness reports one of those outcomes.
---

# Triage a run that gave no answer

`mistrial`, `error` and `stalled` mean witness could not get trustworthy results: a service did
not start, a dependency was missing, a suite hung, or a report was missing or unreadable. These
are not test failures. Do not change tests or code to get around them until you know the cause.

## 1. Read the diagnosis

After the VERDICT line, witness prints a diagnosis. The same data is in
`.witness/runs/latest/status.json` under `diagnosis` (and `.witness/check/` for `witness check`):

- `stage`: config, deps, boot, suite or report.
- `cause`: for example `missing_env`, `bad_config`, `dependency_unreachable`, `setup_failed`,
  `exited_before_ready`, `ready_timeout`, `port_in_use`, `service_died`, `suite_timeout`,
  `stalled`, `report_missing`, `report_unreadable`, `report_incomplete`.
- `evidence`: the log line that shows the problem.
- `log`: the full log to read.
- `retryable`: whether trying again may help.
- `try`: concrete commands to investigate or fix it.

Read the `evidence` line and the end of the `log` before doing anything else.

## 2. Retry once if it is retryable

If `retryable` is true (for example a port was taken or the network blipped), run the same command
once more. If it then works, note the retry in your report and go back to where you were.

## 3. Did the change break the boot?

For `boot` and `deps` stages, and for a suite that hangs, find out whether the base revision
boots. This checks it out in a temporary worktree (with this checkout's `.witness/`) and leaves
the current checkout untouched:

```
witness check --stage boot --against <base-ref>
```

(`witness run --against <base-ref>` compares test outcomes, but it does not run the base when the
change itself cannot boot.)

- The base works and the change does not: the change broke startup (a crash at boot, a missing
  migration, a renamed setting, a new required variable). That is a real failure of the change.
  Fix the code if the cause is clear from the evidence; otherwise report it as the failure,
  quoting the evidence line. Do not edit the witness config to hide it.
- The base fails the same way: the environment or the config is the problem. Go to step 4.

## 4. Fix the setup, up to three tries

Typical fixes, guided by `cause` and `try`:

<!-- if morph -->
- `missing_env`: morph loads the project's variables and secrets into witness's environment. A
  setting that is not secret (a mode, a local URL) can go in the service's `env` in the config.
  A missing secret must be added to the project in morph: never write a value into a file; stop
  with a blocker that names the variable (step 5).
<!-- else -->
- `missing_env`: add the missing names to `.witness/.env` (never commit secrets). If a value is a
  secret you do not have, stop and ask (step 5).
<!-- endif -->
- `bad_config`: the message names the key; fix `.witness/witness.toml`.
- `dependency_unreachable`: start the dependency (the `try` list has the command), or add a
  `[[dependency]]` with `check` and `start` commands.
- `setup_failed`, `exited_before_ready`: read the log; fix the setup or start command, a missing
  tool or package, or a build step.
- `ready_timeout`: the ready URL or timeout is wrong, or the app is slow; check the URL in the
  service log and raise the timeout only if the log shows it is still starting.
- `port_in_use`: stop the leftover process the `try` command finds, or use a port range.
- `report_missing`, `report_unreadable`: the framework did not write its report; follow the hint
  (for .NET it names the package to add), or set the suite's `report` glob.
- `stalled`, `suite_timeout`: find the test that hangs in the suite log; run it alone with
  `--select`.

After each fix, run `witness check` (it is faster), then the original command. Record every
change to the config or env file: what, why, and the evidence that called for it.

## 5. Still failing: stop and explain

After three tries, or when you need something you cannot get (a secret, a paid service, a
machine), stop. Do not keep changing things.

<!-- if morph -->
No one can answer during the run: record a blocker for your final report with what fails, the
cause and evidence line, what you tried, and what is needed.
<!-- else -->
Tell the user what fails, the cause and evidence line, what you tried, and what is needed from
them.
<!-- endif -->

Never turn a mistrial into a pass by removing a suite, a service or a readiness check from the
config, or by marking the suite generic with no report.
