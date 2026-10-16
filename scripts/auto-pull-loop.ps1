#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\_Services\BMS-App',
    [string]$Remote = 'origin',
    [string]$Branch = 'main',
    [string]$GitPath = 'git.exe',
    [ValidateRange(1, 86400)]
    [int]$IntervalSeconds = 900
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$lockStream = $null
$logFile = $null

function Write-LoopLog {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    if ($logFile) { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 }
}

try {
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath).ProviderPath
    if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.git'))) {
        throw "No Git repository at $RepoPath."
    }
    $pullScript = Join-Path $PSScriptRoot 'auto-pull.ps1'
    if (-not (Test-Path -LiteralPath $pullScript -PathType Leaf)) {
        throw "Missing pull script: $pullScript"
    }
    $powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $logDirectory = Join-Path $RepoPath 'logs\auto-pull'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $logFile = Join-Path $logDirectory ('loop-{0}.log' -f (Get-Date -Format 'yyyy-MM'))
    $lockPath = Join-Path $logDirectory 'loop.lock'
    try {
        $lockStream = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    }
    catch [System.IO.IOException] {
        throw "Cannot acquire $lockPath. Another loop may still be running. $($_.Exception.Message)"
    }

    Write-LoopLog "Loop started (PID $PID). Interval: $IntervalSeconds seconds. Stop with Ctrl+C."
    while ($true) {
        # Run in a child process because auto-pull.ps1 uses exit to report its result.
        # A failed pull must not terminate the repeating loop.
        try {
            & $powerShellPath -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $pullScript -RepoPath $RepoPath -Remote $Remote -Branch $Branch -GitPath $GitPath
            $pullExitCode = $LASTEXITCODE
            if ($pullExitCode -ne 0) {
                Write-LoopLog "Pull failed (exit $pullExitCode). Retrying after the interval."
            }
            else {
                Write-LoopLog 'Pull completed successfully.'
            }
        }
        catch {
            Write-LoopLog "Pull could not run: $($_.Exception.Message). Retrying after the interval."
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
}
catch {
    Write-LoopLog "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($null -ne $lockStream) { $lockStream.Dispose() }
}
