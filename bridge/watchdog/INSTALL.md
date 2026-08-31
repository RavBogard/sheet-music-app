# Bridge watchdog — install on the venue PC

**What this does:** every minute, Windows checks whether the CentralReform Bridge is
running. If it isn't, it starts it again. That's all it does — it never stops or
restarts a bridge that IS running.

**Why you want it:** during a service nobody is at the PC. If the bridge process
dies, this brings it back within a minute without anyone touching anything.

**Time needed:** about 5 minutes, once. You never have to think about it again.

---

## Before you start

- Do this **on the venue PC**, logged in as the account the bridge normally runs
  under (the one whose desktop shows the bridge's tray icon).
- The bridge must already be installed and working.

---

## Step 1 — put the script on the PC

1. Make a folder: `C:\CRC\watchdog`
   (Open File Explorer, go to `C:\`, right-click → New → Folder, name it `CRC`;
   open it and make another folder inside called `watchdog`.)
2. Copy **`bridge-watchdog.ps1`** into `C:\CRC\watchdog\`.

If you put it somewhere else, use that path everywhere below instead.

## Step 2 — create the scheduled task

Open **PowerShell as Administrator**:
press `Start`, type `powershell`, right-click **Windows PowerShell**, choose
**Run as administrator**.

Copy this **whole block**, paste it into the blue window, and press Enter.
Replace `VENUEPC\soundbooth` with the actual account name — you can find it by
running `whoami` in that same window first.

```powershell
schtasks /Create `
  /TN "CRC Bridge Watchdog" `
  /TR "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"C:\CRC\watchdog\bridge-watchdog.ps1\"" `
  /SC MINUTE /MO 1 `
  /RU "VENUEPC\soundbooth" `
  /RL LIMITED `
  /F
```

It should print `SUCCESS: The scheduled task "CRC Bridge Watchdog" has successfully been created.`

> **Alternative (same result):** import the supplied
> `CRC-Bridge-Watchdog.xml` instead — it also adds a "run at logon" trigger:
> ```powershell
> schtasks /Create /TN "CRC Bridge Watchdog" /XML "C:\CRC\watchdog\CRC-Bridge-Watchdog.xml" /F
> ```
> If that reports a malformed XML error, just use the one-liner above; it does
> the important part.

## Step 3 — check that it works

1. Run it once by hand:
   ```powershell
   schtasks /Run /TN "CRC Bridge Watchdog"
   ```
2. Now the real test. Close the bridge completely — right-click its tray icon →
   Quit (or open Task Manager, find **CentralReform Bridge**, End Task).
3. Wait about **90 seconds**.
4. The bridge's tray icon should be back on its own.
5. Confirm in the log:
   ```powershell
   Get-Content "$env:LOCALAPPDATA\CentralReform Bridge\watchdog.log" -Tail 20
   ```
   You should see a line like
   `2026-08-31 19:04:11  Bridge is NOT running — starting: C:\Users\...\CentralReform Bridge.exe`
   followed by `Started OK (pid 1234).`

If step 4 doesn't happen, read the log — see Troubleshooting below.

---

## Where things live

| Thing | Path |
|---|---|
| The script | `C:\CRC\watchdog\bridge-watchdog.ps1` |
| The log | `%LOCALAPPDATA%\CentralReform Bridge\watchdog.log` |
| The task | Task Scheduler → Task Scheduler Library → **CRC Bridge Watchdog** |

The log is capped at about 1 MB and trims itself — it will never fill the disk.
On a healthy day it stays **empty**: the watchdog only writes when it has to act.

## Turning it off / removing it

```powershell
schtasks /Change /TN "CRC Bridge Watchdog" /DISABLE   # pause it
schtasks /Delete /TN "CRC Bridge Watchdog" /F         # remove it
```

## Troubleshooting

**The log says "the bridge exe could not be found."**
The script looks in the Windows uninstall registry and the usual install folders.
If the bridge was installed somewhere unusual, find the real path (right-click the
Start-menu shortcut → Open file location → right-click the shortcut → Properties →
"Target"), then recreate the task with that path appended:

```powershell
schtasks /Delete /TN "CRC Bridge Watchdog" /F
schtasks /Create /TN "CRC Bridge Watchdog" `
  /TR "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"C:\CRC\watchdog\bridge-watchdog.ps1\" -ExePath \"C:\Full\Path\To\CentralReform Bridge.exe\"" `
  /SC MINUTE /MO 1 /RU "VENUEPC\soundbooth" /RL LIMITED /F
```

**The log says "Started but the process is gone again 15s later."**
The watchdog is doing its job; the bridge itself is failing at startup (usually
missing Firebase credentials after a reinstall). Start the bridge by hand and read
the error it shows. A watchdog cannot fix this one — it needs a person.

**Nothing in the log at all, and the bridge stayed down.**
Open Task Scheduler, find the task, look at **Last Run Result**. `0x1` means the
script ran and reported a problem (check the log); a missing "Last Run Time" means
the task isn't firing — most often because `/RU` names an account that isn't
logged in. Re-create it with the account from `whoami`.

**Will this fight with the bridge's auto-update?**
No. The bridge holds a single-instance lock, so if the watchdog starts it during
the few seconds an update is relaunching it, the extra copy quits itself
immediately.

**Will it start a second bridge if one is already running?**
No. It checks the process list first, and the single-instance lock is the backstop.

---

## Note for developers: folding this into the installer later

Not done here, and **the installer config was deliberately not modified**.

The bridge packages with electron-builder → NSIS (`bridge/package.json` →
`build.nsis`, `oneClick: true`, `perMachine: false`, with a custom
`include: "build/installer.nsh"` hook already declared). When someone wants the
watchdog installed automatically:

1. Ship the two files as `extraResources` so they land in the install tree:
   ```json
   "extraResources": [{ "from": "watchdog", "to": "watchdog" }]
   ```
2. In the existing `build/installer.nsh`, add to the `customInstall` macro a
   `schtasks /Create ... /F` line pointing at
   `$INSTDIR\resources\watchdog\bridge-watchdog.ps1`, and to `customUnInstall` a
   matching `schtasks /Delete /TN "CRC Bridge Watchdog" /F`.
3. Keep `/RU` empty in the installer context so the task inherits the installing
   user — `perMachine: false` means the installer already runs as that user, which
   is the account the task must run as.

Do NOT run the watchdog task as SYSTEM. The bridge is a tray app that reads its
credentials and its persisted machine ID from the user's `AppData`; a
SYSTEM-context launch produces a bridge that cannot find either.
