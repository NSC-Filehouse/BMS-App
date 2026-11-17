#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 3091,
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3090
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Get-AppListeners {
    # Query all listeners so an unused port is an empty result, not a CIM error.
    Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalPort -in @($BackendPort, $FrontendPort) }
}

function Find-AppConsole {
    param($Listener, $Processes, [string]$LauncherPath)

    $role = if ($Listener.LocalPort -eq $BackendPort) { 'backend' } else { 'frontend' }
    $pattern = '(?i)\bcall\s+"' + [regex]::Escape($LauncherPath) + '"\s+"[^"]*"\s+' + $role + '\s*$'
    $processId = [int]$Listener.OwningProcess
    $visited = @{}

    while ($Processes.ContainsKey($processId) -and -not $visited.ContainsKey($processId)) {
        $visited[$processId] = $true
        $process = $Processes[$processId]
        if ($process.Name -ieq 'cmd.exe' -and $process.CommandLine -match $pattern) {
            return $process
        }
        $parentId = [int]$process.ParentProcessId
        # A parent PID may have been reused since the child was started.
        if (-not $Processes.ContainsKey($parentId) -or
            $Processes[$parentId].CreationDate -gt $process.CreationDate) {
            break
        }
        $processId = $parentId
    }

    throw "Port $($Listener.LocalPort) ist durch PID $($Listener.OwningProcess) belegt. Keine eindeutig zugehoerige BMS-Startkonsole gefunden. Bitte diesen Prozess manuell pruefen und beenden; es wurde nichts gestartet."
}

try {
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath).ProviderPath
    $listeners = @(Get-AppListeners)
    if ($listeners.Count -eq 0) {
        Write-Host "BMS-Ports $BackendPort und $FrontendPort sind frei."
        exit 0
    }

    $launcherPath = Join-Path $RepoPath 'scripts\start-app-console.bat'
    $processes = @{}
    foreach ($process in Get-CimInstance Win32_Process -ErrorAction Stop) {
        $processes[[int]$process.ProcessId] = $process
    }

    # Validate BOTH ports before stopping anything. Only this checkout's named
    # startapp consoles qualify; other applications and PM2 are left alone.
    $consoles = @{}
    foreach ($listener in $listeners) {
        $console = Find-AppConsole $listener $processes $launcherPath
        $consoles[[int]$console.ProcessId] = $console
    }

    foreach ($console in $consoles.Values) {
        $consoleId = [int]$console.ProcessId
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $consoleId" -ErrorAction Stop
        if ($null -eq $current) { continue }
        if ($current.CreationDate -ne $console.CreationDate -or
            $current.CommandLine -ne $console.CommandLine) {
            throw "PID $consoleId hat sich waehrend der Pruefung geaendert. Start abgebrochen."
        }

        Write-Host "Beende bisherige BMS-Startkonsole PID $consoleId mit npm/nodemon und Kindprozessen..."
        & "$env:SystemRoot\System32\taskkill.exe" /PID $consoleId /T /F
        if ($LASTEXITCODE -ne 0) {
            throw "BMS-Startkonsole PID $consoleId konnte nicht beendet werden. Gegebenenfalls mit denselben Benutzerrechten starten."
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $remaining = @(Get-AppListeners)
        if ($remaining.Count -eq 0) {
            Write-Host "BMS-Ports $BackendPort und $FrontendPort sind jetzt frei."
            exit 0
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "BMS-Ports sind weiterhin belegt. Start abgebrochen."
}
catch {
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
