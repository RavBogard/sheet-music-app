# CentralReform X32 Monitor Bridge

A small Electron tray app that runs on the studio PC at CRC, connecting the
musicians' iPads to the Behringer X32 mixer. All iPad↔bridge traffic flows
through Firestore — the bridge does **not** open any inbound network ports.

## Architecture

```
   ┌──────────────┐   ┌─────────────────────────────────────────┐   ┌────────┐
   │ iPads / web  │──►│ Firestore (monitor-live/* + config/*)   │◄─►│ Bridge │──OSC/UDP──► X32
   │ admin panel  │   │ • state, commands/pending, acks         │   │ tray   │
   └──────────────┘   │ • bridgeLog, selftest, bridge.heartbeat │   │ app    │
                      └─────────────────────────────────────────┘   └────────┘
```

- **Electron tray app** (`src/main.ts`). Hidden window + tray icon; auto-starts
  at Windows login (when installed via the EXE).
- **Firestore message bus** — bridge writes state and reads `monitor-live/commands/pending`.
  No WebSocket server, no inbound HTTP, nothing to firewall.
- **Single-writer lease** — multiple bridges on the same network self-elect; only
  one writes to the X32 at a time.
- **Auto-update** — `electron-updater` polls GitHub releases and installs new
  versions during studio idle (won't restart mid-service).

The bridge talks to the X32 over OSC/UDP on port `10023` (outbound only).
Configuration lives in Firestore under `config/monitor`; everything is managed
from the CentralReform admin panel.

## Installation

The only supported install path is the EXE installer.

1. Download the latest **`CentralReform-Bridge-Setup-x.y.z.exe`** from the
   [GitHub releases page](https://github.com/RavBogard/sheet-music-app/releases)
   and run it. (NSIS one-click; installs to per-user `%LOCALAPPDATA%`.)
2. Open the CentralReform admin panel → **Sound System** → **Generate Setup Code**.
   You'll get a **10-character code** valid for 10 minutes.
3. The bridge opens to a setup wizard on first run. Enter the App URL
   (`https://www.centralreform.live`) and the 10-character code, then click
   **Connect Bridge**. The bridge redeems the code at `/api/bridge/setup-code`
   and stores the returned service-account credential under the Electron
   user-data directory.
4. From then on, the bridge auto-starts at login, runs in the tray, and updates
   itself in place.

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for the step-by-step walkthrough.

## Operating

- **Tray icon** — right-click → open the dashboard, view logs, check for
  updates, quit.
- **Dashboard** (`ui/index.html`) — X32 connection badge, client count, live
  log stream, and the setup-code overlay on first run.
- **Logs** — also streamed to Firestore as a bounded ring (`monitor-live/bridgeLog`,
  last ~50 errors), visible to admins via the `get_bridge_health` MCP tool.
- **Recovery** — if the studio PC is reinstalled or the EXE is moved to a new
  path, the previously-redeemed credential lives in the Electron user-data
  directory (the bridge auto-migrates from the legacy `exeDir` location on
  first boot of v10.x). If credentials are lost, re-run the setup wizard from
  the tray menu.
- **Watchdog** (`watchdog/`) — a Windows Task Scheduler job that restarts the
  bridge within a minute if the PROCESS dies. Every other recovery lever here
  (crash guards, X32 reconnect, remote `restart`) needs the process to still
  exist; this is the layer below them. Install once per venue PC —
  `watchdog/INSTALL.md`. Not bundled in the installer yet (see the note at the
  end of that file).
- **Election** — the single-writer lease at `config/monitor.bridgeLease` decides
  which bridge drives the desk. TTL 20s, renewed every 6s. A bridge that
  relaunches on the SAME machine takes its own lease straight back (a persisted
  machine ID + a dead-PID check — `src/lease-identity.ts`); a takeover from a
  different PC waits out the TTL. A bridge that is up but not elected publishes
  `config/monitor.bridgeStandby` and writes nothing under `config/monitor.bridge`,
  so a standby can never make a dark desk read as online.

## File structure

```
bridge/
├── package.json              # entry: dist/main.js (Electron)
├── tsconfig.json
├── src/
│   ├── main.ts               # Electron entry — tray, IPC, auto-updater, cred discovery
│   ├── index.ts              # bridge boot — heartbeat, lease, sleep/wake detect
│   ├── x32-client.ts         # OSC/UDP transport — /xremote, /xinfo, reconnect, sync pool
│   ├── firestore-transport.ts # Firestore message bus — commands, acks, state writes
│   ├── ack-writer.ts         # monitor-live/commands/acks/{id} writer + TTL sweep
│   ├── config.ts             # Firestore config snapshot + R5 resubscribe-on-error
│   ├── lease-identity.ts     # persisted machine ID, PID liveness, same-host steal rule
│   ├── bridge-control.ts     # remote dispatch (resync / reconnect / restart / selftest)
│   ├── remote-log.ts         # bounded error ring + startup-noise filter
│   └── types.ts
├── ui/index.html             # tray dashboard + setup-wizard overlay
├── watchdog/                 # Task Scheduler job that restarts a dead bridge (INSTALL.md)
└── __tests__/                # vitest suites (mocked firebase-admin, dgram)
```

## Building a release

Releases are produced from this directory via `electron-builder` and published
to GitHub. See the `[[project_bridge_release_build]]` memory entry for the
end-to-end procedure (build, gh release upload, electron-updater
`latest.yml`).

```bash
cd bridge
npm install
npm run build      # tsc
npm run dist       # tsc && electron-builder --win  →  release/CentralReform-Bridge-Setup-*.exe
```

Operating + recovery notes (credential paths, setup-code re-credential,
bridge health diagnostics) live in `[[project_bridge_update_ops]]` and
`[[project_bridge_state_freshness_diagnostic]]`.
