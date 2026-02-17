# CentralReform X32 Monitor Bridge

A lightweight Node.js server that runs on the production PC at CRC, bridging WebSocket connections from musicians' iPads to OSC commands for the Behringer X32 mixer.

## Architecture

```
iPad Browser ──WebSocket──► Bridge Server ──OSC/UDP──► X32
                              │
                              ├── Reads config from Firestore
                              ├── Verifies Firebase auth tokens
                              └── Syncs fader state bidirectionally
```

## Quick Start

### Option A: One-Click Installer (recommended)

The simplest way. No Node.js, no terminal commands, no build steps.

1. Download `CentralReform-Bridge.exe` from the [latest release](https://github.com/RavBogard/sheet-music-app/releases)
2. Download your Firebase service account key (see below) and put it in the same folder
3. **Double-click** `CentralReform-Bridge.exe`
4. Follow the 4-step setup wizard (finds your key, opens firewall, installs as auto-start service)
5. Done — configure buses and access in the CentralReform admin panel

After setup, the bridge runs as a Windows service in the background. It starts automatically when the PC boots and restarts itself if it crashes.

**Useful flags:**
```
CentralReform-Bridge.exe --setup       # Re-run the setup wizard
CentralReform-Bridge.exe --uninstall   # Remove the Windows service
```

### Prerequisites (all options)

- Firebase service account key (see below)
- X32 mixer on the same network as this PC

### 1. Get the Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project → Project Settings → Service Accounts
2. Click **"Generate New Private Key"**
3. Save the JSON file as `bridge/service-account-key.json`

### 2. Choose a Deployment Method

---

#### Option A: Docker (recommended)

The simplest way to run the bridge with auto-restart and logging.

```bash
cd bridge

# Place your service-account-key.json in this directory, then:
docker compose up -d
```

That's it. The bridge starts, auto-restarts on crash or reboot, and logs are managed automatically.

**Useful commands:**
```bash
docker compose logs -f          # Watch logs
docker compose restart           # Restart
docker compose down              # Stop
docker compose up -d --build     # Rebuild after code changes
```

**Health check:**
```bash
curl http://localhost:9001/health
```

---

#### Option B: Windows Service

For running directly on Windows without Docker.

```bash
cd bridge
npm install
npm run build

# Install as auto-start Windows service:
npm install -g node-windows
npm run install-service
```

**Manage the service:**
```bash
npm run uninstall-service        # Remove auto-start service
```

The service starts automatically on boot and restarts on crash.

---

#### Option C: Manual / Development

```bash
cd bridge
npm install
cp .env.example .env             # Edit if needed (defaults are fine)

npm run dev                      # Development (auto-restart on file changes)

# — or —

npm run build
npm start                        # Production
```

---

## Configuration

**All configuration is done through the CentralReform web app** at `/admin` → Sound System section (or the Setup Wizard for first-time config).

The web app manages:

| Setting | Description |
|---------|-------------|
| Bridge URL | WebSocket address (e.g., `ws://192.168.1.50:9000`) |
| X32 IP | Mixer's network address (auto-discovered on bridge startup) |
| Monitor Buses | Which buses are available as monitor sends |
| Bus Assignments | Which musician gets which bus |
| Authorized Users | Who can access the Monitor tab |

You don't need to edit any config files on the bridge server — it reads everything from Firestore in real time.

## HTTP API

The bridge exposes a small HTTP API on port 9001:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check — returns `{ status: "ok", uptime, x32Connected, clients }` |
| `GET /status` | Full status — X32 connection, address, client count, bus list |
| `GET /scan` | Scan local network for X32 mixers (used by admin Setup Wizard) |

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 9000 | WebSocket | iPad connections |
| 9001 | HTTP | API (health, status, scan) |
| 10023 | UDP (outbound) | OSC commands to X32 |

Make sure your firewall allows inbound connections on ports 9000 and 9001.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Connection timeout" on startup | Check X32 IP, ensure both devices are on same network |
| iPads can't connect | Check firewall allows port 9000, verify WiFi is on same subnet |
| Fader changes not syncing | Verify `/xremote` subscription (check bridge logs) |
| Auth failures | Regenerate service account key, check it's in the right path |
| Docker can't reach X32 | Uses `network_mode: host` — ensure Docker has LAN access |
| Health check failing | Check that port 9001 is not blocked |

## Building the Installer EXE

To compile a new `CentralReform-Bridge.exe` (only needed if you change the bridge code):

```bash
cd bridge
npm install
npm run build-exe
```

This uses [pkg](https://github.com/yao-pkg/pkg) to bundle Node.js + all dependencies into a single ~60MB executable. The output goes to `dist/CentralReform-Bridge.exe`.

To distribute: just share the `.exe` file. The user only needs the exe and their Firebase key file.

## File Structure

```
bridge/
├── Dockerfile                 # Container image definition
├── docker-compose.yml         # One-command deployment
├── .dockerignore
├── .env.example               # Environment variable template
├── package.json
├── tsconfig.json
├── scripts/
│   ├── install-service.js     # Windows service installer
│   └── uninstall-service.js   # Windows service uninstaller
└── src/
    ├── launcher.ts            # Smart entry point (setup wizard + service manager)
    ├── index.ts               # Bridge server — startup, HTTP API
    ├── config.ts              # Firestore config manager
    ├── ws-server.ts           # WebSocket server for iPads
    ├── x32-client.ts          # OSC client for Behringer X32
    └── types.ts               # TypeScript interfaces
```
