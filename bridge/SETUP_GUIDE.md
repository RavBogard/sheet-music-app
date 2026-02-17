# Production PC Setup Guide — CentralReform X32 Monitor Bridge

This is the step-by-step guide for getting the bridge server running on the production PC at CRC. The bridge sits between the musicians' iPads/phones and the Behringer X32 mixer, letting everyone control their own monitor mix from the CentralReform app.

```
Musicians' iPads ──WiFi──► Production PC (this bridge) ──Ethernet/WiFi──► X32 Mixer
```

---

## What You Need Before Starting

- The production PC (Windows), connected to the same network as the X32
- The X32 powered on and connected to the network
- Admin access to the CentralReform web app
- About 5 minutes

---

## The Easy Way: One-Click Installer

### Step 1: Download Two Files

Put these in the same folder (like `C:\CentralReform\`):

1. **CentralReform-Bridge.exe** — from the [GitHub releases page](https://github.com/RavBogard/sheet-music-app/releases)

2. **Firebase service account key** — a JSON file you download from Firebase:
   - Go to https://console.firebase.google.com
   - Select the CentralReform project
   - Gear icon (⚙️) → Project settings → Service accounts tab
   - Click "Generate new private key"
   - Save the downloaded file into the same folder as the exe

### Step 2: Double-Click the EXE

The setup wizard walks you through everything:

1. **Key file** — It auto-detects the Firebase key in the folder. Hit Enter to confirm.
2. **Ports** — Defaults are fine (9000 for iPads, 9001 for health checks). Hit Enter.
3. **Firewall** — If running as admin, it opens the ports automatically. Hit Enter.
4. **Service** — Installs as a Windows service so it auto-starts on boot. Hit Enter.

That's it. The bridge is running.

### Step 3: Configure in the Web App

1. Open **https://your-site.vercel.app/admin** → Sound System
2. Set the Bridge URL to: `ws://<this-pc-ip>:9000`
   (the wizard shows you the PC's IP address at the end)
3. Choose monitor buses, assign them to musicians, authorize who gets access
4. Save — the bridge picks up changes instantly

### Step 4: Test

On a musician's iPad, open the app → tap the Audio button in performance mode. Faders should appear. Move one — the X32 responds.

---

## After Setup

The bridge runs silently in the background. It starts on boot, restarts on crash, and logs to `bridge.log` in the same folder as the exe.

| To do this... | Do this |
|---|---|
| Re-run setup | `CentralReform-Bridge.exe --setup` |
| Remove the service | `CentralReform-Bridge.exe --uninstall` |
| Check it's running | Open a browser to `http://localhost:9001/health` |
| Read logs | Open `bridge.log` in the exe folder |
| Update after code changes | Download the new exe, replace the old one, reboot |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Windows protected your PC" on first run | Click "More info" → "Run anyway" |
| Wizard can't find the key file | Make sure it's a `.json` file in the same folder as the exe |
| iPads can't connect | Check firewall (re-run with `--setup`), confirm same WiFi |
| Bridge starts but X32 not found | Verify X32 is on, check its IP on the X32 Setup screen |
| Faders move on iPad but X32 doesn't respond | Check bridge.log for errors |
| Service won't install | Right-click the exe → "Run as administrator" |

---

---

## The Manual Way (for developers)

If you prefer to run from source instead of the exe, expand below.

<details>
<summary>Click to expand manual setup instructions</summary>

### Part 1: Install Node.js

The bridge server runs on Node.js. You only need to do this once.

1. Open a browser on the production PC and go to **https://nodejs.org**
2. Download the **LTS** version (should be 20.x or higher)
3. Run the installer — accept all defaults, click through to finish
4. Open **Command Prompt** (or PowerShell) and verify:

```
node --version
```

You should see something like `v20.11.0` or higher. If you see an error, restart the PC and try again.

---

## Part 2: Get the Bridge Code

You have two options depending on whether Git is installed.

### Option A: Clone with Git (preferred)

```
git clone https://github.com/RavBogard/sheet-music-app.git
cd sheet-music-app/bridge
```

### Option B: Download ZIP

1. Go to **https://github.com/RavBogard/sheet-music-app**
2. Click the green **Code** button → **Download ZIP**
3. Extract the ZIP somewhere easy to find (like `C:\CentralReform\`)
4. Open Command Prompt and navigate to the bridge folder:

```
cd C:\CentralReform\sheet-music-app\bridge
```

---

## Part 3: Install Dependencies

From inside the `bridge` folder:

```
npm install
```

This downloads everything the bridge needs (Firebase Admin SDK, OSC library, WebSocket server). Takes about a minute.

---

## Part 4: Get the Firebase Service Account Key

The bridge needs a key file to authenticate with Firebase (to verify musician logins and read the config you set in the admin panel).

1. Go to **https://console.firebase.google.com**
2. Select the **CentralReform** project
3. Click the **gear icon** (⚙️) → **Project settings**
4. Click the **Service accounts** tab
5. Click **"Generate new private key"**
6. Save the downloaded JSON file into the `bridge` folder and rename it to:

```
service-account-key.json
```

So you should now have `bridge/service-account-key.json` sitting right next to `bridge/package.json`.

**Keep this file safe.** It grants admin access to the Firebase project. Don't commit it to Git or share it.

---

## Part 5: Create the .env File

In the `bridge` folder, copy the example file:

```
copy .env.example .env
```

Open `.env` in Notepad and verify these values:

```
WS_PORT=9000
HTTP_PORT=9001
FIREBASE_SA_KEY_PATH=./service-account-key.json
```

The defaults are fine — you shouldn't need to change anything unless you have a port conflict.

---

## Part 6: Build and Start the Bridge

```
npm run build
npm start
```

You should see output like:

```
[Config] Loaded: {"x32":"192.168.1.100:10023","buses":[1,2,3,4],"authorized":3}
[X32] Connected to 192.168.1.100
[WS] WebSocket server listening on port 9000
[HTTP] Health/status API on port 9001
```

**If it can't find the X32**, check:
- Is the X32 powered on?
- Is the PC on the same network/subnet as the X32?
- What IP does the X32 show on its Setup screen?

You can verify it's working:

```
curl http://localhost:9001/health
```

Should return `{"status":"ok","x32Connected":true,...}`

---

## Part 7: Configure the Firewall

Windows Firewall will block incoming connections from the iPads unless you allow the bridge ports.

1. Open **Windows Defender Firewall** (search for "firewall" in Start)
2. Click **"Allow an app or feature through Windows Defender Firewall"**
3. Click **"Change settings"** → **"Allow another app..."**
4. Browse to `C:\Program Files\nodejs\node.exe`
5. Check both **Private** and **Public** checkboxes
6. Click **OK**

Alternatively, create specific port rules:

1. Click **"Advanced settings"** (left sidebar)
2. Click **"Inbound Rules"** → **"New Rule..."**
3. Select **Port** → **TCP** → enter **9000, 9001**
4. Allow the connection → apply to all profiles
5. Name it **"CentralReform Bridge"**

---

## Part 8: Configure in the Web App

Now set up the connection from the CentralReform admin panel.

1. Open **https://your-site.vercel.app/admin** on any device
2. Scroll to the **Sound System** section (or click the Setup Wizard if it's your first time)
3. Set the **Bridge URL** to the production PC's local IP:

```
ws://192.168.1.50:9000
```

Replace `192.168.1.50` with whatever the production PC's actual IP address is on the network. To find it, run `ipconfig` in Command Prompt and look for the IPv4 address.

4. The wizard will try to connect and scan for the X32 automatically
5. Choose which **monitor buses** to expose (e.g., buses 1–4)
6. **Assign buses** to musicians and **authorize** who can access the Monitor tab
7. Save

Once saved, the bridge picks up the config changes in real time — no restart needed.

---

## Part 9: Install as a Windows Service (Auto-Start)

You don't want to manually start the bridge every time the PC reboots. Install it as a Windows service so it starts automatically.

First, install the service manager globally:

```
npm install -g node-windows
```

Then register the bridge:

```
npm run install-service
```

You should see:

```
✅ Service installed and started!
   The bridge will now start automatically on boot.
```

The service:
- Starts automatically when Windows boots
- Restarts automatically if it crashes
- Runs in the background (no Command Prompt window needed)

**To remove the service later:**

```
npm run uninstall-service
```

---

## Part 10: Test It End to End

1. On the production PC, verify the bridge is running:
   ```
   curl http://localhost:9001/health
   ```

2. On a musician's iPad (connected to the same WiFi):
   - Open the CentralReform app
   - Log in with an authorized account
   - Tap the **Monitor** tab (or the **Audio** button in performance mode)
   - You should see the fader controls for their assigned bus

3. Move a fader on the iPad — the X32 should respond in real time

4. Move a fader on the X32 — the iPad should update to match

If something doesn't work, check the bridge logs. If it's running as a service, you can see logs in Windows Event Viewer under **Applications**, or stop the service and run `npm start` manually to see console output.

---

## Quick Reference

| What | Where |
|------|-------|
| Bridge folder | `sheet-music-app/bridge/` |
| Service account key | `bridge/service-account-key.json` |
| Config file | `bridge/.env` |
| WebSocket port | 9000 (iPads connect here) |
| HTTP API port | 9001 (health checks) |
| Start manually | `cd bridge && npm start` |
| Install service | `cd bridge && npm run install-service` |
| Check health | `curl http://localhost:9001/health` |
| View X32 status | `curl http://localhost:9001/status` |
| Scan for mixers | `curl http://localhost:9001/scan` |
| Web admin config | `/admin` → Sound System |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `node: command not found` | Restart PC after installing Node.js |
| `Cannot find module` on `npm start` | Run `npm run build` first |
| Bridge starts but can't find X32 | Check IP, make sure same subnet, X32 is powered on |
| iPads can't connect to bridge | Check firewall (Part 7), confirm same WiFi network |
| "Unauthorized" errors from iPads | Regenerate service account key, check it's the right Firebase project |
| Faders move on iPad but X32 doesn't respond | Check bridge logs for OSC errors, verify X32 IP in admin config |
| Service won't install | Run Command Prompt as Administrator |
| After a code update | `git pull && npm install && npm run build` then restart service |

---

## Updating the Bridge After Code Changes

If you or I push updates to the bridge code:

```
cd sheet-music-app
git pull
cd bridge
npm install
npm run build
```

Then restart the service — either reboot the PC or:

```
npm run uninstall-service
npm run install-service
```

</details>
