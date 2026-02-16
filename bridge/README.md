# CentralReform X32 Monitor Bridge

A lightweight Node.js server that runs on the production PC at CRC, bridging WebSocket connections from musicians' iPads to OSC commands for the Behringer X32 mixer.

## Quick Setup

### 1. Install

```bash
cd bridge
npm install
```

### 2. Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the JSON file as `bridge/service-account-key.json`

### 3. Configure

```bash
cp .env.example .env
# Edit .env — usually just the FIREBASE_SA_KEY_PATH
```

The X32 IP address and monitor bus configuration are managed through the CentralReform web app at `/monitor/admin`. No need to edit them here.

### 4. Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm run build
npm start
```

### 5. Install as Windows Service (optional)

To run the bridge automatically on PC startup:

```bash
npm run install-service
```

## Architecture

```
iPad Browser ──WebSocket──► Bridge Server ──OSC/UDP──► X32
                              │
                              ├── Reads config from Firestore
                              ├── Verifies Firebase auth tokens
                              └── Syncs fader state bidirectionally
```

## Configuration (via web app)

All configuration is done through the CentralReform web app at `/monitor/admin`:

- **Bridge URL**: The WebSocket address (e.g., `ws://192.168.1.50:9000`)
- **X32 IP**: The mixer's network address
- **Monitor Buses**: Which buses are available as monitor sends
- **Bus Assignments**: Which musician gets which bus
- **Authorized Users**: Who can see the Monitor tab

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Connection timeout" on startup | Check X32 IP, ensure both devices are on same network |
| iPads can't connect | Check firewall allows port 9000, verify WiFi is on same subnet |
| Fader changes not syncing | Verify `/xremote` subscription (check bridge logs) |
| Auth failures | Regenerate service account key, check it's in the right path |
