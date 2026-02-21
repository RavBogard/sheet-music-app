# Bridge v2.1.0 Upgrade — WSS Fix

## What Changed

The bridge now uses **WSS** (secure WebSocket) instead of WS. This was the bug — browsers silently block `ws://` connections from `https://` pages. The OTP setup worked fine, but the actual fader connection was dead on arrival.

There was also a race condition in the app's connection hook that could prevent reconnection after the bridge restarted.

Both are fixed. The app-side changes deployed automatically when you pushed to GitHub (Vercel picks them up). The bridge side requires a new exe on the production PC.

---

## What You Need To Do

### Step 1 — Upload the release to GitHub (~2 min)

The exe is built and attached to this conversation for download. You can also build it yourself from the repo (`cd bridge && npm run build-exe`).

1. Go to https://github.com/RavBogard/sheet-music-app/releases
2. Click **Draft a new release**
3. Tag: `v2.1.0` → Create new tag
4. Title: `Bridge v2.1.0 — Secure WebSocket (WSS)`
5. Description:
   ```
   Fixes bridge↔app connection failure caused by mixed content blocking.
   
   - Bridge now serves WSS (secure WebSocket) via self-signed TLS certificate
   - Certificate auto-generated on first run (requires Git for Windows, already installed)
   - iPads trust the cert once by visiting the bridge URL in Safari
   - Connection race condition fixed in app-side hook
   ```
6. Attach the `CentralReform-Bridge-v2.1.0.exe` file
7. Publish

### Step 2 — Update the production PC (~3 min)

1. **Stop the current bridge**
   - Open Services (Win+R → `services.msc`)
   - Find "CentralReform Monitor Bridge" → Stop
   - (Or if running in a terminal, Ctrl+C)

2. **Replace the exe**
   - Download `CentralReform-Bridge-v2.1.0.exe` from the GitHub release
   - Copy it to the same folder as the current bridge exe (overwrite it)
   - The `service-account-key.json` and `bridge-config.json` stay in place — no reconfiguration needed

3. **Start the bridge**
   - If running as a service: Start it in Services
   - If running manually: double-click the exe
   - You should see in the console:
     ```
     [Cert] Generating self-signed certificate...
     [Cert] ✓ Certificate generated at ...\certs
     [HTTPS] API on port 9001 (https://0.0.0.0:9001)
     [WS] Secure WebSocket (wss://) attached to HTTPS server
     ```
   - The bridge URL in Firestore will automatically update to `wss://192.168.x.x:9001`

### Step 3 — Trust the certificate on each iPad (~30 sec per device)

This is a one-time step per device. The self-signed cert needs to be trusted by each iPad/phone that will use monitor controls.

1. On the iPad, open **Safari** (must be Safari, not Chrome)
2. Go to `https://BRIDGE_IP:9001` (the IP shown in the bridge console)
   - For example: `https://192.168.1.50:9001`
3. Safari will show a security warning — tap **Show Details** → **visit this website**
4. You'll see a green "✓ Connection Secure" confirmation page
5. Done — close the tab and go back to the CRC Music app
6. The monitor panel should connect automatically

> **Note:** If the production PC's IP address changes (DHCP), the cert regenerates automatically and devices will need to re-trust. Consider giving the bridge PC a static IP or DHCP reservation.

### Step 4 — Verify

1. Open the CRC Music app on an iPad
2. The monitor controls (quick panel or full page) should show "Connected"
3. Move a fader on the X32 — it should update on the iPad in real-time
4. Move a fader on the iPad — it should move on the X32

---

## No Configuration Changes Needed

- The `service-account-key.json` is unchanged
- The `bridge-config.json` is unchanged
- The Firestore `config/monitor` document updates itself automatically
- The app-side code deployed via Vercel automatically
- No new environment variables required
- The bridge firewall rules from setup still apply (port 9001 was already opened alongside 9000)

## Rollback

If anything goes wrong, replace the exe with the v2.0.0 version. The app-side code is backward-compatible — it follows whatever protocol the bridge URL uses (`ws://` or `wss://`).

## What's in the `certs/` folder

The bridge creates a `certs/` folder next to the exe containing:
- `bridge.crt` — the self-signed certificate (valid 10 years)
- `bridge.key` — the private key

These are auto-generated. If you delete them, the bridge regenerates them on next start. They're gitignored.
