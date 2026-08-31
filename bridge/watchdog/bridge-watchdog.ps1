<#
.SYNOPSIS
    Keeps the CentralReform Bridge running on the venue PC.

.DESCRIPTION
    R1 (self-healing). The bridge is unattended during a service and nobody can
    intervene: the sound engineer is on the floor, not at the PC. Every other
    recovery lever in the bridge is IN-PROCESS (the uncaught-exception guards in
    main.ts, the X32 reconnect loop, the remote `bridgeControl.restart` action) —
    all of which need the process to still exist. This script is the one layer
    that survives the process dying: Task Scheduler runs it every minute, and it
    starts the bridge again if it is gone.

    It is deliberately dumb. It does not health-check, it does not decide whether
    the bridge is "working", it does not kill anything. A watchdog that can
    restart a HEALTHY bridge is a new outage source; this one only ever acts on
    the single unambiguous fact that the process is not in the process table.

    Duplicate-launch safety: the bridge holds a Windows single-instance lock
    (`app.requestSingleInstanceLock` in main.ts), so a second launch quits itself
    within a second. Even a mistimed start during an auto-update relaunch is
    therefore harmless.

.PARAMETER ExePath
    Full path to "CentralReform Bridge.exe". Optional — the script resolves it
    from the uninstall registry key, then from the usual install locations.

.PARAMETER LogPath
    Log file. Defaults to %LOCALAPPDATA%\CentralReform Bridge\watchdog.log.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "C:\CRC\watchdog\bridge-watchdog.ps1"
#>

[CmdletBinding()]
param(
    [string]$ExePath,
    [string]$LogPath
)

$ErrorActionPreference = 'Stop'

# The productName in bridge/package.json -> the .exe name and the process name.
$ProcessName = 'CentralReform Bridge'
$ExeName     = "$ProcessName.exe"

# Keep the log to a size a human can open. Trimmed to the most recent lines when
# it crosses the cap; a watchdog that fills the venue PC's disk is worse than no
# watchdog at all.
$MaxLogBytes = 1MB
$KeepLines   = 2000

if (-not $LogPath) {
    $LogPath = Join-Path $env:LOCALAPPDATA "CentralReform Bridge\watchdog.log"
}

function Write-Log {
    param([string]$Message)
    try {
        $dir = Split-Path -Parent $LogPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt $MaxLogBytes)) {
            $tail = Get-Content -Path $LogPath -Tail $KeepLines
            Set-Content -Path $LogPath -Value $tail
        }
        $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
        Add-Content -Path $LogPath -Value $line
    } catch {
        # Never let logging be the thing that stops the watchdog from restarting
        # the bridge.
    }
}

<#
    Find the installed exe.

    electron-builder's NSIS target here is oneClick + perMachine:false, so the
    real install path is under the USER's AppData and can move between versions.
    Rather than hardcode a guess that silently rots, ask the uninstall registry
    (what the installer itself wrote), then fall back to the known layouts.
#>
function Resolve-BridgeExe {
    $candidates = @()

    foreach ($root in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )) {
        try {
            Get-ItemProperty $root -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -like "*CentralReform*Bridge*" -and $_.InstallLocation } |
                ForEach-Object { $candidates += (Join-Path $_.InstallLocation $ExeName) }
        } catch { }
    }

    $candidates += Join-Path $env:LOCALAPPDATA "Programs\centralreform-bridge\$ExeName"
    $candidates += Join-Path $env:LOCALAPPDATA "Programs\CentralReform Bridge\$ExeName"
    $candidates += Join-Path ${env:ProgramFiles} "CentralReform Bridge\$ExeName"
    if (${env:ProgramFiles(x86)}) {
        $candidates += Join-Path ${env:ProgramFiles(x86)} "CentralReform Bridge\$ExeName"
    }

    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

# ── main ──

$running = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    # Quiet on the happy path: this runs 1440 times a day and every line of
    # "still fine" makes the interesting lines harder to find.
    exit 0
}

if (-not $ExePath) { $ExePath = Resolve-BridgeExe }

if (-not $ExePath -or -not (Test-Path $ExePath)) {
    Write-Log "NOT RUNNING and the bridge exe could not be found. Pass -ExePath to the scheduled task. Looked for '$ExeName'."
    exit 1
}

Write-Log "Bridge is NOT running — starting: $ExePath"
try {
    # `--hidden` matches the login-item arguments main.ts registers, so a
    # watchdog start behaves exactly like a normal boot start: tray only, no
    # window popping up on the projector during a service.
    Start-Process -FilePath $ExePath -ArgumentList '--hidden' -WindowStyle Hidden
} catch {
    Write-Log "START FAILED: $($_.Exception.Message)"
    exit 1
}

# Confirm it actually came up, so the log distinguishes "we restarted it" from
# "we tried and it died again" — the second is the one that needs a human.
Start-Sleep -Seconds 15
$after = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($after.Count -gt 0) {
    Write-Log "Started OK (pid $($after[0].Id))."
    exit 0
} else {
    Write-Log "Started but the process is gone again 15s later — the bridge is failing on startup. A human needs to look at this."
    exit 1
}
