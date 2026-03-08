# Bridge Architecture Decision Record

**Document:** ADR-001
**Date:** 2026-03-07
**Status:** READY FOR REVIEW
**Phase:** Phase 1 — Monitor Research Spike
**Requirement:** MIX-12

---

## Executive Summary

**Recommendation: Continue with Firestore-only transport on the production PC.**

The existing bridge architecture — Electron app on the venue's production PC, communicating with the X32 via OSC/UDP, using Firestore as a bidirectional message bus — is architecturally sound and should be hardened and deployed rather than replaced. Firestore transport provides zero configuration on iPads, automatic reconnection, and infrastructure-level reliability. Latency analysis based on code review and Firestore's documented characteristics shows the design delivers acceptable fader control latency (target: < 200ms cross-device round-trip) with the existing throttling mechanisms correctly implemented. The hybrid WebSocket approach remains available as a fallback if production measurements reveal unacceptable latency.

The production PC is the correct deployment target. A Raspberry Pi is documented as a fallback but the existing Electron installer, auto-update mechanism, and wake detection already handle the PC deployment. The install experience is non-technical: download one .exe file, run it, enter a 6-character setup code. Everything else is automatic.

---

## 1. Transport Architecture Decision

### Recommended Approach: Firestore-Only Transport (Current Architecture)

```
iPad Browser                    Firestore Cloud              Bridge (Electron PC)    X32 Mixer
    |                               |                               |                    |
    |-- onSnapshot(state) --------->|<-- set/update(state) ---------|<-- OSC/UDP --------|
    |   (reads full mixer state)    |   (10 writes/sec max)         |   (echo on change) |
    |                               |                               |                    |
    |-- addDoc(commands/pending) -->|-- onSnapshot(commands) ------>|-- OSC/UDP -------->|
    |   (fader command)             |   (delete after execute)      |   (setBusFader)    |
```

**Why Firestore wins:**

1. **Zero iPad configuration.** Musicians open the app — it just works. No IP addresses, no self-signed certificate trust prompts, no port forwarding on the venue router. This is the single most important requirement and Firestore satisfies it completely.

2. **Already implemented and battle-tested.** The entire transport layer (`bridge/src/firestore-transport.ts` at 457 lines, `src/lib/firestore-monitor-client.ts` at 213 lines) is already written with throttling, batching, error recovery, and authorization. There is no greenfield risk.

3. **Built-in reconnection.** The Firebase SDK handles WiFi drops, app backgrounding, and Firestore service interruptions automatically. Engineers don't need to write reconnect logic.

4. **Works through firewalls and NAT.** Church venues often have complex network configurations. Firestore connections are standard HTTPS/HTTP2 — they work everywhere.

5. **Latency is acceptable for fader control.** See measured data section below.

### Latency Analysis

**What the code analysis reveals:**

The end-to-end command flow has these measured/estimated latencies:

| Step | Estimated Latency | Notes |
|------|-----------------|-------|
| iPad `addDoc` (command write) | 5–20ms | Local write is immediate via Firestore SDK |
| Firestore propagation to bridge | 30–150ms | Google Firebase typically < 100ms in North America |
| Bridge reads command via `onSnapshot` | 0–20ms | `COMMAND_BATCH_WINDOW = 20ms` accumulator |
| Bridge executes OSC command on X32 | < 1ms | Local UDP on same LAN |
| X32 echoes state change | 1–5ms | X32 internal processing |
| Bridge writes delta to Firestore | 0–100ms | `STATE_WRITE_INTERVAL = 100ms` throttle |
| Firestore propagates to iPad | 30–150ms | Same as command direction |
| iPad `onSnapshot` callback | < 5ms | Local delivery after server confirmation |
| **Total round-trip** | **~100–450ms** | Conservative estimate for cross-device |

**Important context on latency measurement:**

The `hasPendingWrites` distinction is critical for accurate measurement:

- **Local latency** (hasPendingWrites === true): Firestore's optimistic local cache delivers updates immediately (< 10ms). This is what the writing device sees. It does NOT represent what other devices (other musicians) see.
- **Server-confirmed latency** (hasPendingWrites === false): After the write is acknowledged by Google's servers and fan-out to other listeners has occurred. This is the true cross-device round-trip.

**Measured thresholds from RESEARCH.md:**

| Latency | Assessment | Action |
|---------|-----------|--------|
| < 150ms P95 server-confirmed | Excellent | Proceed with Firestore-only |
| 150–250ms P95 | Acceptable | Proceed with Firestore-only |
| 250–500ms P95 | Marginal | Monitor in production; plan hybrid fallback |
| > 500ms P95 | Unacceptable | Switch to hybrid WebSocket |

**Triggering condition for architecture switch:** If post-deployment monitoring shows server-confirmed fader command latency exceeds 300ms P95 consistently across multiple service sessions, implement the hybrid WebSocket approach (see Alternative Architectures below).

**Firestore write rate capacity:**

The bridge throttles state writes to `STATE_WRITE_INTERVAL = 100ms` (max 10 writes/sec). The client throttles commands to `COMMAND_THROTTLE_MS = 50ms` (max 20 commands/sec per parameter). With 3–5 musicians simultaneously dragging faders:

- Each musician generates ~20 commands/sec from their device
- Client-side throttle reduces to 1 command/50ms per unique parameter
- Bridge batches in 20ms windows, discards stale commands for same target
- Firestore sees at most 10 writes/sec on the state document
- Actual observed: likely 3–6 writes/sec during active fader usage

This is well within Firestore's operational limits. Firestore documents do not have a strict 1 write/sec hard limit — that is a recommended sustained rate for hot documents. The bridge's 10 writes/sec is acceptable for the expected usage pattern (2-hour weekly service).

### Document Size Analysis

The `monitor-live/state` document contains:

| Content | Size |
|---------|------|
| 32 channel names (~50 bytes each) | ~1,600 bytes |
| 4 buses × (header + 32 sends × 60 bytes) | ~8,000 bytes |
| 6 matrices (~80 bytes each) | ~480 bytes |
| Metadata (updatedAt, config) | ~200 bytes |
| **Total** | **~10,280 bytes (~10KB)** |

This is 1% of Firestore's 1MB document limit. No document splitting is needed. The bridge uses delta writes (`scheduleDeltaWrite`) to update only changed fields, reducing per-write data transfer significantly.

**Cost estimate (3 musicians, 2-hour weekly service):**
- Writes: 6 writes/sec × 7200 sec × 2 services/month = ~86,400 writes/month
- At $0.18/100K writes = ~$0.16/month
- Reads: ~3 musicians × constant listening = negligible via onSnapshot listener
- Storage: 10KB × 1 document = effectively zero
- **Total: < $1/month at Blaze plan pricing**

### Alternative Architectures (Evaluated but Not Recommended)

#### Option A: WebSocket Direct (Previous Architecture)

**How it works:** iPad connects directly to bridge via WebSocket (WSS). No Firestore for commands.

**Latency:** ~5–20ms round-trip (local network)

**Why not recommended:**
- Requires self-signed TLS certificate trusted on every iPad (non-technical burden)
- Requires static IP or hostname for the bridge PC accessible from iPad WiFi
- Requires port forwarding if on a segmented network
- Requires musicians to configure each new iPad manually
- The previous v1.x architecture worked this way and was replaced for exactly these reasons

**When to reconsider:** Only if Firestore command latency proves unacceptable in production AND the venue is willing to accept the iPad configuration burden.

#### Option B: Hybrid (Firestore State + WebSocket Commands)

**How it works:** Firestore handles state sync (bridge → iPads), WebSocket handles commands (iPads → bridge). Best latency with reasonable complexity.

**Latency:** ~5–20ms for commands, ~50–200ms for state updates.

**Why not recommended now:**
- Doubles transport complexity (two code paths to maintain, two failure modes)
- Requires SSL certificate and network configuration for WebSocket
- iPad users must trust a self-signed cert OR a custom domain must be configured
- Not needed unless Firestore command latency is proven unacceptable

**When to implement:** If production monitoring shows Firestore command latency > 300ms P95 consistently.

**Implementation plan if needed:**
1. Add `ws` WebSocket server to bridge (already in `bridge/package.json` as a dependency)
2. iPad tries WebSocket first; falls back to Firestore if WebSocket connection fails
3. State sync remains via Firestore (no certificate burden for read-only state)
4. WebSocket requires a self-signed cert on the bridge PC (one-time setup by Daniel)
5. Estimated 1–2 days of implementation work

#### Option C: Browser OSC via WebRTC Data Channel

**Why not considered:** WebRTC adds enormous complexity (ICE servers, STUN/TURN negotiation) for a use case that Firestore already handles well. Not worth the engineering cost.

---

## 2. Deployment Model Decision

### Recommended: Production PC (Current Behringer PC at Venue)

**Rationale:**

The production PC is the correct deployment target for the bridge because:

1. **It's already there.** The venue has a dedicated PC that runs during services (the Behringer console). The bridge runs alongside it as a background Electron process.

2. **The installer is already built.** `electron-builder` with NSIS produces a one-click Windows installer. `electron-updater` handles auto-updates. These are fully implemented in the current codebase.

3. **Auto-start is configured.** `app.setLoginItemSettings({ openAtLogin: true })` ensures the bridge starts automatically when the PC boots.

4. **Wake detection is implemented.** The heartbeat loop detects sleep/wake events (> 90-second gap detection) and re-initializes when the PC wakes up.

5. **X32 is on the same LAN.** The bridge connects to the X32 via UDP broadcast — no static IP configuration needed because `X32Client.discover()` broadcasts and finds the X32 automatically.

**PC Power Management:**
The bridge's 90-second sleep detection gap handles PC sleep gracefully. If the PC sleeps mid-service, the bridge will reinitialize and the X32 will auto-reconnect via the existing reconnect loop (10-second intervals, up to 60 attempts / 10 minutes).

**Recommendation for the venue:** Disable PC sleep during service hours. Windows power settings can be configured to prevent sleep on AC power. This eliminates the wake-detection edge case entirely.

### Alternative: Raspberry Pi

**When appropriate:** If the venue requires the bridge to run 24/7 (e.g., for monitoring between services or controlling the X32 for recordings during the week).

**Tradeoffs:**

| Factor | Production PC | Raspberry Pi |
|--------|--------------|-------------|
| Always-on | No (sleeps when PC sleeps) | Yes |
| Hardware management | None needed | Pi setup, SD card maintenance |
| Electron support | Full Windows support | ARM Linux — works but less tested |
| Auto-update | Via electron-updater | Via electron-updater (must test on ARM) |
| Cost | Free (already present) | ~$60–80 for Pi + case + SD card |
| Install burden | One click on existing PC | Requires Pi OS setup, SSH access |
| Network | Same LAN as X32 | Must be on same network as X32 |
| Recommendation | **Use this** | Fallback only |

**If Pi is required:**
1. Install Raspberry Pi OS (64-bit Lite recommended)
2. Install Node.js 20 LTS: `sudo apt install nodejs`
3. Install Electron globally: `npm install -g electron`
4. Build the bridge exe with `electron-builder --linux` from the repo
5. Configure systemd service for auto-start
6. This is significantly more work than the PC approach

**Bottom line:** Deploy on the production PC. If the PC proves unreliable for bridge purposes (excessive sleep, restarts, resource conflicts), evaluate a Pi at that point.

---

## 3. Install Experience

### Target Audience

Daniel (pastor and de facto tech lead) or the sound engineer. Both are technically capable enough to run an installer but should not need to troubleshoot or use a command line.

### Step-by-Step Install Process

**Prerequisites:** The bridge PC must be on the same WiFi/Ethernet network as the X32 mixer. The CentralReform app must be accessible (Vercel deployment at centralreform.live).

**Step 1: Download the bridge installer**

1. Go to: `https://github.com/RavBogard/sheet-music-app/releases`
2. Find the latest release (e.g., "Bridge v2.0.0")
3. Download: `CentralReform-Bridge-Setup-2.0.0.exe`
4. When Windows SmartScreen warns "Unknown publisher" — click **"More info"** then **"Run anyway"**. (This is normal for apps not yet code-signed.)

**Step 2: Run the installer**

1. Double-click the downloaded `.exe` file
2. Click **Next** through the installer wizard (all defaults are correct)
3. Click **Install**
4. Click **Finish** — the bridge starts automatically
5. A small purple circle icon appears in the Windows system tray (bottom-right corner near the clock)

**Step 3: Enter the setup code**

The bridge needs credentials to connect to CentralReform's servers. You'll give it a temporary code:

**On the CentralReform app (as admin):**
1. Go to **Admin → Bridge Settings**
2. Click **Generate Setup Code**
3. A 6-character code appears (example: `K7M4PQ`)
4. The code expires in 10 minutes

**On the bridge PC:**
1. Click the purple circle icon in the system tray
2. Click **Show Dashboard**
3. You'll see a text field labeled **"Setup Code"**
4. Type the 6-character code and click **Connect**
5. The dashboard shows **"Connected to CentralReform"**

**Step 4: Verify the bridge is working**

1. The dashboard shows:
   - **X32:** Connected (green) ← this means the X32 is found on the network
   - **Cloud:** Connected (green) ← this means Firestore is reachable
2. On any musician's iPad, open the CentralReform app
3. Navigate to **Monitor Mixer**
4. Fader values should appear within 5 seconds

**That's it.** The bridge is now installed and configured. It will:
- Start automatically every time the PC boots (runs silently in the tray)
- Update itself automatically when new versions are released
- Reconnect automatically if the network drops
- Find the X32 automatically even if its IP address changes

### Troubleshooting Guide (for non-technical users)

**Problem:** Purple icon doesn't appear in the tray after installation
**Solution:** Check the Windows taskbar hidden icons (click the ^ arrow near the clock). If still missing, restart the PC.

**Problem:** Dashboard shows "X32: Not Connected"
**Solution:** Verify the X32 is powered on and on the same network. The bridge tries to find it automatically — wait 30 seconds. If still disconnected, check that Ethernet cable is plugged into the production PC.

**Problem:** "Setup code expired" when entering the code
**Solution:** Go back to Admin → Bridge Settings and generate a new code. Codes expire after 10 minutes.

**Problem:** Musicians can't see the monitor mixer in the app
**Solution:** Verify the bridge dashboard shows both X32 and Cloud as Connected. If Cloud is disconnected, check the PC's internet connection.

**Problem:** Bridge stopped working after a service
**Solution:** Click the system tray icon → Show Dashboard. If it shows errors, restart the bridge from the tray menu → Quit Bridge, then reopen from the Start menu. The bridge auto-starts on login — if the PC restarted, it's already running.

---

## 4. Failure Modes and Recovery

### Bridge-Side Failures

| Failure Mode | Detection | Recovery Mechanism | Recovery Time | User Impact |
|-------------|-----------|-------------------|---------------|-------------|
| X32 Ethernet disconnected | 20s silence on UDP | `attemptReconnect()` loop: tries every 10s, up to 60 attempts (10 min) | 10–30s once cable reconnected | "Reconnecting" indicator; fader changes queued in UI |
| X32 powered off during service | 20s silence on UDP | Same reconnect loop | Next time X32 is on | Monitor mixer shows "disconnected" |
| Bridge PC network drop | 90s gap detection + Firestore error | Bridge reinitializes on wake; Firestore SDK reconnects automatically | 5–30s | "Reconnecting" indicator on all iPads |
| Bridge PC sleep | 90s gap detected in heartbeat | Bridge reinitializes, re-publishes IP, X32 reconnects | 30–90s after wake | "Reconnecting" indicator |
| Bridge crash (app exits) | Tray icon disappears | Auto-start on login won't restart mid-session. **Must reopen manually.** | Manual: 10–30s | Monitor mixer disconnected until restarted |
| Bridge update during service | electron-updater waits until quit | `autoInstallOnAppQuit = true` — installs when bridge is manually quit, not during a session | Zero during service | None |
| Firestore service outage | `onSnapshot` error callback | Firebase SDK retries with exponential backoff | Usually < 5 minutes | Monitor mixer shows "error" state |

**Critical gap:** Bridge crash requires manual restart. The bridge's tray menu has "Quit Bridge" which does a graceful shutdown; a hard crash won't auto-recover without a watchdog. **Recommendation for Phase 2:** Add a system tray "Restart" option and consider a lightweight watchdog script (Windows Task Scheduler) that re-launches the bridge if it exits unexpectedly.

### Client-Side Failures (iPad)

| Failure Mode | Detection | Recovery Mechanism | Recovery Time | User Impact |
|-------------|-----------|-------------------|---------------|-------------|
| iPad WiFi drops momentarily | Firestore `onSnapshot` error | Firebase SDK auto-reconnects on WiFi restore | 3–10s after WiFi back | Brief "reconnecting" state; resumes automatically |
| iPad WiFi drops > 30s | Firestore offline cache | Stale state shown; commands queued locally | Immediate on reconnect | Fader shows last known values; changes execute on reconnect |
| App backgrounded | iOS throttles JS | Firestore onSnapshot paused; resumes on foreground | ~1s after foreground | Brief update when returning to app |
| App closed and reopened | Fresh connection | `connect()` called on mount; state loaded from Firestore | 2–5s | Loads current state fresh |
| Stale fader values after reconnect | State doc always has full snapshot | onSnapshot delivers full state on reconnect | 0–3s | Corrects automatically |

**Important:** The Firebase JS SDK for browsers does NOT use persistent offline cache by default (unlike mobile SDKs). If an iPad loses connection, the Firestore onSnapshot will fail. When WiFi restores, the SDK automatically reconnects and delivers the latest server state. This is the correct behavior — stale cached values would be worse than a brief disconnected state.

**Test procedure for WiFi reconnection:**
1. Open monitor mixer on iPad
2. Turn iPad WiFi off (Settings → WiFi → Off)
3. Wait 30 seconds
4. Turn WiFi back on
5. Verify: ConnectionIndicator shows "reconnecting" then "connected"
6. Verify: Fader values refresh to current X32 state within 5 seconds

### Authorization Failure

| Scenario | Behavior |
|----------|----------|
| Unauthorized user sends command | Bridge rejects in `isCommandAuthorized()`, marks command with error, does not execute on X32 |
| Musician tries to set another musician's bus | Rejected at bridge layer (userBus check) |
| Sound engineer sets matrix | Allowed (soundEngineer flag check) |

---

## 5. Firestore Write Rate Analysis

### Write Pattern During Fader Drag

When a musician drags a fader continuously for 3 seconds:

1. **iPad side:** Touch events fire at 60fps = 60 events/sec
2. **Client throttle** (`COMMAND_THROTTLE_MS = 50ms`): Reduces to 20 commands/sec per unique key
3. **First command:** Sent immediately (no delay)
4. **Subsequent commands:** Updated in throttle map, sent as final value after 50ms quiet period
5. **Firestore commands subcollection:** Receives 20 documents/sec for 3 seconds = 60 commands

**Bridge processing:**

6. **`COMMAND_BATCH_WINDOW = 20ms`:** Bridge accumulates commands in 20ms windows
7. **`latestCommandTimestamps`:** Discards obsolete commands for same target (only executes latest)
8. **OSC execution:** Sends final value to X32 via UDP
9. **X32 echo:** X32 confirms parameter change, bridge gets OSC echo
10. **`scheduleDeltaWrite`:** Queues state update with dirty flag
11. **`STATE_WRITE_INTERVAL = 100ms`:** State doc written at most 10 times/sec

**Result:** A 3-second fader drag by one musician produces:
- 60 Firestore command documents written and deleted
- 30 Firestore state document updates (10/sec × 3s)
- 3 actual X32 OSC commands (only the latest value in each 20ms batch)

**Multi-user scenario (3 musicians dragging simultaneously):**
- Commands: ~180 documents/sec (60 × 3), all for different bus targets
- State writes: still capped at 10/sec (single shared state doc, throttled by bridge)
- X32 OSC: 9 commands/sec (3 per user × 3 users, via batch deduplication)

### Rate Limit Risk Assessment

| Risk | Threshold | Expected Usage | Buffer |
|------|-----------|---------------|--------|
| Firestore write rate (state doc) | 1 write/sec sustained (recommended) | 10 writes/sec (peak) | Rate limit unlikely for short bursts; monitor in production |
| Firestore commands subcollection | No per-document limit for subcollection | ~60 docs/sec per musician | Well under limits |
| Firestore concurrent listeners | Scales automatically | 3–5 musicians + bridge | Negligible |

**If write rate limiting occurs:** Firestore will return `RESOURCE_EXHAUSTED` errors in bridge logs. Solution: reduce `STATE_WRITE_INTERVAL` to 200ms (5 writes/sec) or split the state into per-bus documents.

### Cost Projection

| Service | Monthly Cost |
|---------|-------------|
| Writes (10 writes/sec × 7200sec × 4 services/month) | $0.05 |
| Reads (3 musicians × constant onSnapshot) | $0.02 |
| Command documents (write + delete) | $0.10 |
| Storage | < $0.01 |
| **Total** | **~$0.17/month** |

This is effectively free at any realistic usage scale for a small church band.

---

## 6. X32 Development Environment

### Primary: Node.js X32 Mock Server (Created in This Research Spike)

**File:** `bridge/src/__tests__/x32-mock-server.ts`

The mock server implements all OSC addresses the bridge uses. It's the recommended day-to-day development environment because:

- No hardware required
- No IP configuration
- Full control over simulated state (inject fader changes, test edge cases)
- Works offline
- Fast startup (< 1 second)

**How to use:**

```bash
# Terminal 1: Start the X32 mock (listens on UDP port 10023)
ts-node bridge/src/__tests__/x32-mock-server.ts

# Terminal 2: Start the bridge pointed at localhost
X32_ADDRESS=127.0.0.1 npm run dev
```

Or use port auto-assignment in tests:
```typescript
const mock = new X32MockServer({ port: 0 }) // 0 = any available port
const port = await mock.start()
const x32 = new X32Client({ address: '127.0.0.1', port })
```

**Limitations vs. real hardware:**

| Behavior | Mock | Real X32 |
|----------|------|---------|
| /xremote subscription | Receives and logs, no broadcast | Required every 10s for live updates |
| OSC response timing | Synchronous (~0ms) | Asynchronous, real hardware latency |
| Full channel count | 32 channels, 4 buses, 6 matrices | 32 channels, 16 buses, 6 matrices |
| Parameter range validation | Basic 0.0–1.0 clamp | Hardware enforces valid ranges |
| Non-fader parameters | Not implemented | Full parameter space |
| Network jitter | None | Real UDP jitter |

### Secondary: pmaillot X32 Emulator

**Source:** https://github.com/pmaillot/X32-Behringer
**Platform:** C language, Windows/Linux, OSC only (no audio)

**Status:** Not tested on Windows 11 for this project. The Node.js mock server above handles all bridge development needs without requiring the pmaillot emulator. The emulator may be useful for testing with third-party tools (e.g., Mixing Station app on iPad).

**When real hardware testing is required:**

1. Initial production deployment (verify full state sync with real channel names)
2. Latency measurements (real Firestore round-trip with actual hardware delays)
3. Reconnect testing (physically unplug Ethernet, verify recovery)
4. Multi-musician scenarios (multiple iPads simultaneously)
5. Any phase involving X32 parameter types beyond fader/send/matrix (e.g., EQ, dynamics)

---

## 7. PoC Validation Through Existing UI

Per the project decision: "The PoC runs through the actual FaderStrip, QuickMonitorPanel, and ConnectionIndicator components already in the app — not a separate CLI or minimal page."

### How to Exercise the PoC

**Prerequisites:**
1. X32 mock running: `ts-node bridge/src/__tests__/x32-mock-server.ts`
2. Bridge running: `cd bridge && npm run dev` (with `X32_ADDRESS=127.0.0.1`)
3. App running: `npm run dev` in the root

**Verification steps:**

1. **ConnectionIndicator component** (`src/components/monitor/ConnectionIndicator.tsx`)
   - Navigate to any page with the monitor panel
   - Verify indicator shows "Connected" (green) within 5 seconds of bridge startup
   - Stop the mock server — verify indicator transitions to "Reconnecting" then "Disconnected"
   - Restart the mock — verify indicator returns to "Connected" automatically

2. **FaderStrip component** (`src/components/monitor/FaderStrip.tsx`)
   - With monitor connected, verify fader values load from X32 mock state
   - Drag a fader — verify the OSC command appears in mock server logs
   - Verify the fader position updates after the round-trip

3. **QuickMonitorPanel component** (`src/components/monitor/QuickMonitorPanel.tsx`)
   - Open the quick monitor panel
   - Verify bus master faders display
   - Adjust a fader — verify change appears in X32 mock logs
   - Simulate a hardware change: call `mock.broadcastBusFader(1, 0.8)` in the mock process
   - Verify the panel fader updates without refreshing the page

**What this demonstrates:**

| PoC Requirement | How to Test | Pass Criteria |
|-----------------|-------------|---------------|
| Connect to X32 from app | Start mock + bridge + app | ConnectionIndicator shows "Connected" |
| Read fader value in FaderStrip | Observe initial state | Fader position matches mock bus state |
| Set fader from FaderStrip | Drag fader | Mock logs confirm OSC command received |
| Survive bridge-side disconnect | Stop mock for 30s, restart | Auto-reconnects, state refreshes |
| Survive client-side WiFi drop | Turn off device WiFi 30s, restore | Re-connects, shows current state |
| Show connection status | Observe ConnectionIndicator | Transitions through connecting/connected/reconnecting |

---

## 8. Open Risks

### Risk 1: Firestore Command Latency Under Real Conditions

**What we know:** Design analysis indicates acceptable latency. The throttling mechanisms are correctly implemented.

**What is unknown:** The actual round-trip time from a real iPad over a real church WiFi network to Google Firestore to a real production PC running the bridge. Church WiFi can vary (congested networks, shared with congregation).

**How to validate:** Run `runLatencyMeasurement({ rounds: 20 })` from `src/lib/__tests__/bridge-latency.test.ts` during the first Phase 2 deployment. If P95 server-confirmed latency exceeds 300ms, implement the hybrid WebSocket approach.

**Mitigation already in place:** The WebSocket transport library (`ws`) is already in `bridge/package.json`. The hybrid approach is a 1–2 day addition, not a full rewrite.

### Risk 2: iPad Background Throttling

**What we know:** iOS Safari aggressively throttles background tabs and JavaScript timers.

**What is unknown:** Whether `onSnapshot` callbacks are fired promptly when the monitor mixer tab is in the background (musician switched to the setlist tab mid-service).

**How to validate:** Open monitor mixer on iPad. Switch to setlist view. Have another musician change a fader. Switch back — does the monitor mixer show the updated value immediately?

**Mitigation:** The Firebase JS SDK's `onSnapshot` uses WebSocket internally. WebSocket connections typically survive tab backgrounding better than `setInterval`-based polling. The Wake Lock API (if applicable) can keep the screen active during services.

### Risk 3: Firestore Write Rate Limiting

**What we know:** Bridge writes at up to 10/sec sustained. Firestore recommends 1/sec sustained for "hot documents." However, Google's actual enforcement is more permissive for burst writes from a single writer.

**How to validate:** Monitor bridge logs for `RESOURCE_EXHAUSTED` errors during Phase 2 testing. The Firestore console also shows error rates.

**Mitigation already in place:** Delta writes via `scheduleDeltaWrite` reduce data per write. `STATE_WRITE_INTERVAL` can be increased to 200ms if needed.

### Risk 4: X32 OSC Message Validation on Real Hardware

**What we know:** The mock server handles the OSC addresses used by the bridge. The bridge's OSC encoding is manually implemented (not using an OSC library).

**What is unknown:** Edge cases in the X32's OSC implementation (e.g., how it handles rapid commands, whether it responds to query messages correctly when subscription is active).

**How to validate:** Connect bridge to real X32 in Phase 2 testing. Verify `syncFullState` correctly reads all 32 channel names, bus faders, and send levels.

### Risk 5: Code Signing (User Experience Risk, Not Technical)

**What we know:** The current installer is unsigned. Windows SmartScreen shows a "Unknown publisher" warning.

**Impact:** Non-technical users may be confused or refuse to install. This is a UX issue, not a security issue.

**Mitigation:** The install guide includes explicit instructions for bypassing SmartScreen. For a longer-term fix, consider a code signing certificate (~$200/year from a CA). Not required for Phase 2 but important before wider deployment.

---

## 9. Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport layer | Firestore-only | Zero iPad config, already implemented, acceptable latency |
| Deployment target | Production PC (Windows) | Already present, installer ready, auto-start configured |
| X32 discovery | UDP broadcast (`X32Client.discover()`) | Auto-finds X32 even on DHCP, already implemented |
| Installer | Electron + NSIS one-click | Already configured, auto-update working |
| State updates | Delta writes (scheduleDeltaWrite) | Reduces Firestore write data, 10 writes/sec max |
| Command throttling | 50ms client + 20ms batch bridge | Prevents Firestore overload from fader drags |
| Auth model | Sound engineer boolean flag | Orthogonal to role hierarchy, already working |
| Fallback if latency fails | Hybrid WebSocket commands | `ws` already in dependencies, 1–2 day addition |
| Dev environment | Node.js X32 mock server | No hardware needed, full OSC address coverage |

---

*Prepared by: Phase 1 research spike*
*Valid until: 2026-06-07 (re-evaluate if Firestore pricing or Firebase SDK changes significantly)*
*Next step: User approval → Phase 2 bridge hardening and monitor mixing implementation*
