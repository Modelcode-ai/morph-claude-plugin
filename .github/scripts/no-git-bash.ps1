# Drop every PATH folder with a bash.exe or sh.exe (Git Bash, MSYS) for the job's later steps; git.exe stays.
$keep = $env:PATH -split ';' | Where-Object {
  $_ -and ($_ -match '\\(System32|WindowsApps)\\?$' -or -not ((Test-Path (Join-Path $_ 'bash.exe')) -or (Test-Path (Join-Path $_ 'sh.exe'))))
}
$path = $keep -join ';'
"PATH=$path" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
$env:PATH = $path
$left = Get-Command bash, sh -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch '\\(System32|WindowsApps)\\' }
if ($left) { throw "still on PATH: $($left.Source -join ', ')" }
Get-Command git, pwsh, powershell | Format-Table Name, Source -AutoSize
