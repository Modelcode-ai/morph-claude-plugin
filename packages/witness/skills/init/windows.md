# Commands on Windows

Witness runs each command in `witness.toml` under one shell. `[run] shell` sets it for the whole
config, and a `[[service]]`, `[[suite]]` or `[[dependency]]` can set its own `shell`. With
`"auto"` (the default) macOS and Linux use bash; Windows uses PowerShell 7 (`pwsh`), then Windows
PowerShell 5.1, then cmd.exe; it never picks bash unless the config says `shell = "bash"`.

## Which shell to write for

- `shell.windows` in the scan says what the repo's Windows CI runs its steps under. When it is
  `bash` and this machine has Git for Windows, keep `shell = "bash"` and write bash.
- Otherwise, when `shell.here` is `pwsh` or `powershell`, write PowerShell. Commands copied from a
  Linux CI or a README need translating; test each one in PowerShell before you put it in.
- `.ps1` scripts in `shell.scripts` run as `./scripts/build.ps1`; witness allows scripts to run.
  A `.sh` script needs bash: use what it does, in PowerShell, or `shell = "bash"` for that entry.

## What works in every shell

- Witness's own placeholders are replaced before the shell sees the command: `${PORT}`,
  `${self.url}`, `${<service>.url}`, `${CHECKOUT}`, `${WITNESS_REPORT_DIR}` and any variable set
  when witness starts.
- The arguments witness adds (report flags, test selections, per-test timeouts) are quoted for
  the shell the entry runs under.
- A suite's or service's `env = { NAME = "value" }` sets variables without shell syntax. Prefer it
  to setting them in the command.

## PowerShell for bash habits

| bash | PowerShell |
| --- | --- |
| `NAME=value cmd` | `$env:NAME = 'value'; cmd` (or the entry's `env`) |
| `$NAME`, `${NAME:-x}` in a command | `$env:NAME`; `$(if ($env:NAME) { $env:NAME } else { 'x' })` |
| `a && b` | the same on `pwsh`; on Windows PowerShell 5.1, `a; if ($LASTEXITCODE) { exit $LASTEXITCODE }; b` |
| `test -f x` | `Test-Path x` (`if (-not (Test-Path x)) { exit 1 }` to fail) |
| `mkdir -p d` | `New-Item -ItemType Directory -Force d \| Out-Null` |
| `rm -rf d` | `Remove-Item -Recurse -Force d` |
| `sleep 3` | `Start-Sleep 3` |
| `echo msg >&2` | `[Console]::Error.WriteLine('msg')` |
| `$(cat f)` | `(Get-Content f)` |
| `cmd > out 2>&1 & echo $! > app.pid` | `$p = Start-Process -PassThru -FilePath cmd -ArgumentList 'a','b' -RedirectStandardOutput out; Set-Content app.pid $p.Id` |
| `kill $(cat app.pid)` | `Stop-Process -Id (Get-Content app.pid)` |

Quoting: single quotes are literal (`'it''s'` for a quote inside); double quotes expand `$`. A
program path with spaces needs `&` in front: `& 'C:\Program Files\App\app.exe' --port ${PORT}`.

## How witness runs PowerShell

Each command stops at the first error, as `bash -e` would: a failing cmdlet, and on `pwsh` 7.4 or
later a native command that exits non-zero. The command's exit code is the failing program's;
a command that is not found exits 127. Output is UTF-8. A fallback like `a || b` does not help on
`pwsh`, since `a` failing stops the command first: write `try { a } catch { b }`.

A command of plain words (no quotes, `$`, `;`, `|`, `&&` or redirection) whose program is an
`.exe`, such as `dotnet test --project tests/Api.csproj`, starts without a shell. npm's
`npx` and `node_modules/.bin/<tool>` shims run through PowerShell.
