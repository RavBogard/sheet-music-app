# Production PC Setup — CentralReform X32 Monitor Bridge

Step-by-step for getting a fresh studio PC running the bridge. The bridge is a
small Electron tray app that talks to the X32 over OSC and to iPads through
Firestore — no firewall holes, no inbound ports, no Node install on the studio PC.

```
   iPads ──► Firestore ──► Bridge (this PC) ──OSC/UDP──► X32
```

## What you need

- The studio PC (Windows), on the same LAN as the X32
- The X32 powered on and connected to the network
- Admin access to the CentralReform web app
- About 5 minutes

## Step 1 — Download the installer

From the [GitHub releases page](https://github.com/RavBogard/sheet-music-app/releases),
download the latest **`CentralReform-Bridge-Setup-x.y.z.exe`** and run it.
NSIS will install the bridge under `%LOCALAPPDATA%\Programs\CentralReform Bridge`
and launch it. The tray icon (purple circle) appears in the Windows
system tray.

> **First-run SmartScreen:** "Windows protected your PC" → click **More info** →
> **Run anyway**. The installer is unsigned; this is expected.

## Step 2 — Generate a setup code

1. In a browser, open the CentralReform admin panel and go to **Sound System**.
2. Click **Generate Setup Code**.
3. You'll see a **10-character code** (letters and digits, no `0/O/1/I`)
   that's valid for 10 minutes. Leave the page open.

## Step 3 — Connect the bridge

The bridge opens to a setup overlay on first run.

1. **App URL** — pre-filled with `https://www.centralreform.live`. Change it
   only if you're running against a different deployment.
2. **Setup Code** — type or paste the 10-character code from Step 2.
3. Click **Connect Bridge**. The bridge calls `/api/bridge/setup-code`,
   receives a scoped service-account credential, and stores it in the
   Electron user-data directory.

Within a few seconds the dashboard switches to the live status view:
the X32 badge turns green, the log panel starts streaming, and the bridge
publishes its heartbeat to `config/monitor.bridge`.

## Step 4 — Configure buses (one-time)

Back in the admin panel → **Sound System**:

1. Choose which **monitor buses** to expose to iPads (e.g., buses 1–4).
2. **Assign buses** to musicians and **authorize** who can see the Monitor tab.
3. Save.

The bridge picks up config changes from Firestore in real time — no restart.

## Step 5 — Verify

On an authorized iPad (same WiFi):

1. Open the CentralReform app and sign in.
2. Tap the **Monitor** tab (or the Audio button in performance mode).
3. The assigned bus's fader strip should appear.
4. Move the fader — the X32 responds.
5. Move a fader on the X32 — the iPad updates.

## After setup

The bridge auto-starts at every Windows login and runs in the tray.
Right-click the tray icon for: **Open Dashboard**, **Check for Updates**,
**Quit**. New releases install themselves during idle periods.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tray icon doesn't appear | Open Task Manager → look for "CentralReform Bridge". If absent, re-run the installer. |
| Setup code rejected | Codes expire after 10 minutes and can only be used once. Generate a new one in the admin panel. |
| "Could not reach app" during setup | Check the App URL. Verify the PC has internet (open `https://www.centralreform.live` in a browser). |
| X32 badge red | Check the X32 is powered on, on the same subnet, and that its IP matches what the bridge discovered (visible in the dashboard logs). |
| Faders move on iPad but X32 doesn't respond | Open the tray dashboard and read the log stream for OSC errors. |
| Credentials lost (PC reinstall, exe moved) | Right-click the tray icon → re-run setup wizard, or generate a fresh setup code in the admin panel. |
| Bridge silent for hours | Daniel: check `config/monitor.bridge.lastSeen` via Firebase MCP, or call `get_bridge_health` from Claude Desktop. |

Recovery + operating detail (credential paths, setup-code re-credential,
diagnostics) lives in the `[[project_bridge_update_ops]]` and
`[[project_bridge_state_freshness_diagnostic]]` memory entries.
