$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner = Join-Path $RootDir "setup/run.ps1"

& $Runner @args
exit $LASTEXITCODE
