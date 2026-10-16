#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\_Services\BMS-App',
    [string]$Remote = 'origin',
    [string]$Branch = 'main',
    [string]$GitPath = 'git.exe'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$exitCode = 1
$lockStream = $null
$logFile = $null

function Write-PullLog {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    if ($logFile) {
        Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    }
}

function Invoke-RepoGit {
    param([string[]]$GitArguments)
    # Windows PowerShell 5.1 exposes native stderr as ErrorRecord objects.
    # Decide success using Git's exit code, including commands with progress output.
    $ErrorActionPreference = 'Continue'
    $output = @(& $script:gitExecutable -C $RepoPath @GitArguments 2>&1)
    $gitExitCode = $LASTEXITCODE
    $outputText = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    if ($gitExitCode -ne 0) {
        throw "Git failed (exit $gitExitCode): $outputText"
    }
    return $outputText
}

try {
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath).ProviderPath
    if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.git'))) {
        throw "No Git repository at $RepoPath."
    }
    $script:gitExecutable = (Get-Command $GitPath -CommandType Application -ErrorAction Stop).Source
    $gitDirectory = Invoke-RepoGit -GitArguments @('rev-parse', '--absolute-git-dir')
    $lockPath = Join-Path $gitDirectory 'bms-auto-pull.lock'
    try {
        $lockStream = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    }
    catch [System.IO.IOException] {
        throw "Cannot acquire $lockPath. Another update may still be running. $($_.Exception.Message)"
    }

    $logDirectory = Join-Path $RepoPath 'logs\auto-pull'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $logFile = Join-Path $logDirectory ('auto-pull-{0}.log' -f (Get-Date -Format 'yyyy-MM'))
    Write-PullLog "Starting update: $RepoPath ($Remote/$Branch)."

    $currentBranch = Invoke-RepoGit -GitArguments @('symbolic-ref', '--quiet', '--short', 'HEAD')
    if ($currentBranch -cne $Branch) {
        throw "Expected branch '$Branch', found '$currentBranch'."
    }
    $status = Invoke-RepoGit -GitArguments @('status', '--porcelain', '--untracked-files=normal')
    if ($status) {
        throw 'Working tree contains local changes or untracked files. Resolve them manually before retrying.'
    }

    $before = Invoke-RepoGit -GitArguments @('rev-parse', 'HEAD')
    $pullOutput = Invoke-RepoGit -GitArguments @('pull', '--ff-only', '--no-rebase', '--no-autostash', $Remote, $Branch)
    if ($pullOutput) { Write-PullLog $pullOutput }
    $after = Invoke-RepoGit -GitArguments @('rev-parse', 'HEAD')
    if ($before -eq $after) {
        Write-PullLog "No new commits applied. HEAD: $after"
    }
    else {
        Write-PullLog "Updated: $before -> $after"
    }
    $exitCode = 0
}
catch {
    $failure = $_.Exception.Message
    try { Write-PullLog "ERROR: $failure" }
    catch { Write-Host "ERROR: $failure (log could not be written)." }
}
finally {
    if ($null -ne $lockStream) { $lockStream.Dispose() }
}

exit $exitCode
