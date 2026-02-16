# CentralReform 2.5 — Release Plan

## Vision

**2.0 was "make it solid." 2.5 is "make it live."**

The marquee feature: musicians control their own monitor mixes from the same iPads they're already reading charts on. No more yelling "more guitar in my wedge" across the stage. This is tightly integrated with the X32 over OSC via a bridge server running on the production PC.

---

## Feature 1: Personal Monitor Mixer

### User Stories

1. **As a musician**, I open CentralReform on my iPad during rehearsal, tap the "Monitor" tab, and see named faders for every channel in my wedge (Daniel Guitar, Karen Vocal, Drums, etc.). I drag "more me" and hear it change instantly.

2. **As the sound engineer**, I open the admin panel before service, assign Bus 1 → Daniel, Bus 2 → Karen, Bus 3 → Noa, Bus 4 → Guest Drummer. I mark buses 5-6 as "not monitors" so they don't show up.

3. **As a musician**, I self-select my bus from a dropdown if the engineer hasn't pre-assigned me. Only available (unassigned) monitor buses appear.

4. **As the engineer**, I adjust Daniel's monitor from Mixing Station on my tablet. Daniel's iPad updates in real-time to show the new fader position.

5. **As an admin**, I configure the bridge server IP address in Settings. I toggle which users have access to the monitor feature.

---

### Architecture

```
┌─────────────┐     WiFi      ┌──────────────────┐    WebSocket    ┌─────────────┐
│  iPad        │ ◄──────────► │  CentralReform    │ ◄────────────► │  Bridge      │
│  (Browser)   │              │  (Vercel)         │                │  Server      │
│              │              │                   │                │  (Prod PC)   │
└─────────────┘              └──────────────────┘                └──────┬──────┘
                                                                        │ OSC (UDP)
                                                                        │ Wired LAN
                                                                  ┌─────▼──────┐
                                                                  │  Behringer  │
                                                                  │  X32        │
                                                                  └────────────┘
```

**Key insight**: The iPad browser connects directly to the bridge server via WebSocket over the local network — NOT through Vercel. The bridge server IP is stored in Firestore and served to authorized clients. Fader data never leaves the local network.

### Bridge Server (Node.js on Production PC)

**Responsibilities:**
- Connect to X32 via OSC (UDP port 10023)
- On startup: read all channel names, bus names, bus configs, current fader positions
- Maintain real-time sync: subscribe to X32 parameter changes (`/xremote` renewal)
- Accept WebSocket connections from iPads
- Authenticate connections (verify Firebase auth token)
- Push fader state to connected clients
- Receive fader changes from clients, translate to OSC, send to X32
- Expose REST endpoints for configuration

**OSC Commands Used:**

| Action | OSC Address | Notes |
|--------|-------------|-------|
| Read channel name | `/ch/{ch}/config/name` | 1-indexed, 01-32 |
| Read bus name | `/bus/{bus}/config/name` | 01-16 |
| Read bus master level | `/bus/{bus}/mix/fader` | 0.0 – 1.0 float |
| Read channel→bus send level | `/ch/{ch}/mix/{bus}/level` | 0.0 – 1.0 float |
| Read channel→bus send on/off | `/ch/{ch}/mix/{bus}/on` | 0 or 1 |
| Set bus master level | `/bus/{bus}/mix/fader` | 0.0 – 1.0 float |
| Set channel→bus send level | `/ch/{ch}/mix/{bus}/level` | 0.0 – 1.0 float |
| Subscribe to changes | `/xremote` | Must renew every 10s |
| Request all state | `/xinfo`, `/-snap/name` | Startup sync |

**Tech stack:**
- `node-osc` or raw UDP for OSC communication
- `ws` for WebSocket server
- `firebase-admin` for auth token verification
- Runs as a Windows service or persistent process (pm2 / node-windows)

**Configuration stored in Firestore** (read by bridge on startup + live updates):
```typescript
// Firestore: config/monitor
{
  bridgeUrl: "ws://192.168.1.50:9000",  // LAN IP of production PC
  x32Address: "192.168.1.100",           // X32 IP
  x32Port: 10023,                        // Default OSC port
  monitorBuses: [1, 2, 3, 4],           // Which buses are monitor sends
  busAssignments: {                      // Bus → user mapping
    "1": { userId: "abc123", userName: "Daniel" },
    "2": { userId: "def456", userName: "Karen" },
    "3": null,                           // Available for self-select
    "4": null,
  },
  authorizedUsers: ["abc123", "def456", "ghi789", ...],
}
```

### Web App — Musician View (`/monitor`)

**Access control:** Only visible to users listed in `authorizedUsers`. The Monitor tab appears in the mobile tab bar and desktop nav only for authorized users.

**UI Layout (mobile-optimized for iPad):**

```
┌─────────────────────────────────┐
│  My Monitor — Bus 1 (Wedge L)  │
│  ┌─────────────────────────┐   │
│  │  🔊 Master    ████████░░│   │  ← Overall bus level
│  └─────────────────────────┘   │
│                                 │
│  Channels                       │
│  ┌─────────────────────────┐   │
│  │  🎸 Daniel Guitar ████░░│   │  ← Channel send levels
│  ├─────────────────────────┤   │
│  │  🎤 Karen Vocal  ██████░│   │
│  ├─────────────────────────┤   │
│  │  🥁 Drums        ███░░░░│   │
│  ├─────────────────────────┤   │
│  │  🎹 Keys         █████░░│   │
│  ├─────────────────────────┤   │
│  │  🎸 Bass         ████░░░│   │
│  └─────────────────────────┘   │
│                                 │
│  ● Connected                    │
└─────────────────────────────────┘
```

**Interaction:**
- Horizontal sliders (touch-friendly, large hit targets)
- Real-time: drag fader → WebSocket → bridge → OSC → X32 (< 50ms latency goal)
- Bi-directional: engineer changes a level → X32 → bridge → WebSocket → iPad updates
- Connection status indicator (green dot = connected, yellow = reconnecting, red = disconnected)
- Auto-reconnect with exponential backoff (silent, no disruptive UI)

**Self-select flow:**
- If no bus is assigned to this user, show a dropdown: "Select your monitor bus"
- Only unassigned monitor buses appear
- Selecting a bus writes the assignment to Firestore (which the bridge picks up)

### Web App — Admin/Engineer View (`/monitor/admin`)

**Two sections:**

**1. Bridge Configuration**
- Bridge server URL (ws://IP:port)
- X32 IP address
- Connection status (bridge ↔ X32 health check)
- "Refresh from X32" button — re-reads all channel/bus names

**2. Bus Assignment Grid**

```
┌──────────────────────────────────────────┐
│  Monitor Bus Assignments                  │
│                                          │
│  Bus 1 (Wedge L)    [Daniel        ▼]   │
│  Bus 2 (Wedge R)    [Karen         ▼]   │
│  Bus 3 (Floor Mon)  [Unassigned    ▼]   │
│  Bus 4 (Drum Mon)   [Unassigned    ▼]   │
│  ─────────────────────────────────────   │
│  Bus 5 (FX Send)    [Not a monitor]     │
│  Bus 6 (Broadcast)  [Not a monitor]     │
│                                          │
│  ☑ Bus 1  ☑ Bus 2  ☑ Bus 3  ☑ Bus 4    │  ← Toggle which buses are monitors
│  ☐ Bus 5  ☐ Bus 6  ☐ Bus 7  ☐ Bus 8    │
│                                          │
│  Authorized Users                        │
│  ☑ Daniel Bogard                         │
│  ☑ Karen Kriger Bogard                   │
│  ☑ Guest Musician                        │
│  ☐ New Member (pending)                  │
└──────────────────────────────────────────┘
```

**Live-configurable:** All changes take effect immediately. Engineer can reassign a bus mid-service without restarting anything.

---

## Feature 2: X32 Tuner (Deferred to 2.6)

With Dante Virtual Soundcard on the production PC, the bridge server could capture audio from any X32 channel and run pitch detection server-side, streaming tuning data to the iPad. Replaces the iPad mic tuner with a direct-input tuner — no room noise, works silently, more accurate.

**Requirements:** Dante Virtual Soundcard license ($30), Dante Controller for routing.

---

## Technical Plan

### Bridge Server Package

```
centralreform-bridge/
├── package.json
├── .env.example          # X32_IP, PORT, FIREBASE_SA_KEY path
├── src/
│   ├── index.ts          # Entry point
│   ├── x32-client.ts     # OSC connection, state sync, command sending
│   ├── ws-server.ts      # WebSocket server, auth, client management
│   ├── auth.ts           # Firebase Admin token verification
│   ├── config.ts         # Reads config from Firestore, watches for changes
│   └── types.ts          # Shared types
├── install-service.js    # Registers as Windows service
└── README.md
```

### Web App Changes

```
New files:
  src/app/(main)/monitor/page.tsx           # Musician monitor view
  src/app/(main)/monitor/admin/page.tsx     # Admin config + bus assignment
  src/lib/monitor-store.ts                  # Zustand store for monitor state
  src/lib/x32-ws-client.ts                  # WebSocket client for bridge
  src/components/monitor/FaderStrip.tsx      # Individual channel fader
  src/components/monitor/BusSelector.tsx     # Self-select dropdown
  src/components/monitor/ConnectionStatus.tsx
  src/components/monitor/AdminBusGrid.tsx    # Bus assignment grid
  src/components/monitor/AdminUserAccess.tsx # Authorized user toggles

Modified files:
  src/components/nav/MobileTabBar.tsx        # Add Monitor tab (conditional)
  src/components/nav/DesktopHeader.tsx        # Add Monitor link (conditional)
  src/types/models.ts                        # MonitorConfig type
  firestore.rules                            # Monitor config access rules
```

### Firestore Rules Addition

```
// Monitor configuration — admin read/write, authorized users read
match /config/monitor {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}
```

---

## Milestones

### M1: Bridge Server MVP ✅ DONE
- X32 OSC connection + state sync (x32-client.ts)
- WebSocket server with Firebase auth (ws-server.ts)
- Firestore config reading + live watching (config.ts)
- Windows service installer

### M2: Musician Monitor UI ✅ DONE
- /monitor page with fader strips
- Real-time bi-directional sync
- Connection status + auto-reconnect
- Self-select bus flow
- Loading skeleton

### M3: Admin UI + Bus Assignment ✅ DONE
- /monitor/admin page
- Bridge URL + X32 IP config
- Bus assignment grid with musician dropdown
- User authorization checkboxes
- Nav integration (conditional Monitor tab in mobile + desktop)
- Monitor Admin card in Settings (admin only)
- Firestore rules for config/monitor

### M4: Plug-in + Testing (when you're back)
- Install bridge server on production PC
- Run `npm install && npm run dev` in bridge/
- Open /monitor/admin → enter X32 IP, bridge URL, bus numbers
- Assign buses to musicians
- Real-world testing during rehearsal
- Edge cases (X32 reboot, network drop, multiple admins)
- Version bump to 2.5

**Estimated: 1 focused session to plug in and test**

---

## Success Criteria

CentralReform 2.5 ships when:

1. ☐ A musician opens their iPad, taps Monitor, and adjusts their wedge mix in under 3 seconds
2. ☐ Fader changes reach the X32 in < 100ms
3. ☐ Engineer changes on Mixing Station reflect on the musician's iPad in < 200ms
4. ☐ Bus assignments can be changed mid-service without restarting anything
5. ☐ Bridge server survives network hiccups and auto-recovers
6. ☐ Only authorized users see the Monitor tab
7. ☐ The whole system works during a real Friday night service
