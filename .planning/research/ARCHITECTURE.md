# Architecture Research

**Domain:** Worship music setlist management platform with real-time mixer control
**Researched:** 2026-03-07
**Confidence:** HIGH (core web architecture), MEDIUM (X32 bridge options), HIGH (PWA patterns)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (PWA)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Setlist     │  │  Sheet Music │  │  Monitor Mix │               │
│  │  Feature     │  │  Feature     │  │  Feature     │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                  │                       │
│  ┌──────┴─────────────────┴──────────────────┴───────┐               │
│  │              Shared UI Components                  │               │
│  │  (primitives: Button, Card, Sheet, Drawer, etc.)  │               │
│  └───────────────────────────────────────────────────┘               │
│  ┌──────────────────────────────────────────────────┐                │
│  │               State Layer (Zustand)               │                │
│  │  useAppStore (auth, user)  |  useSetlistStore     │                │
│  │  useMixerStore (X32 state) |  (songs, setlist UI) │                │
│  └───────────────────────────────────────────────────┘               │
│  ┌───────────────────────────────────────────────────┐               │
│  │            Offline Cache (IndexedDB)               │               │
│  │   setlists | songs | charts | user prefs           │               │
│  └───────────────────────────────────────────────────┘               │
│  ┌───────────────────────────────────────────────────┐               │
│  │            Service Worker (Serwist)                │               │
│  │   asset caching | NetworkFirst API | push notif    │               │
│  └───────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌──────────────────────────────────────┐
│   NEXT.JS API LAYER  │    │     X32 BRIDGE (local network)       │
│   (Vercel serverless)│    │  ┌────────────────────────────────┐  │
│                      │    │  │  Node.js process (LAN machine) │  │
│  /api/setlists       │    │  │  osc-js BridgePlugin            │  │
│  /api/songs          │    │  │  WS Server (port 8080)          │  │
│  /api/sync           │    │  │  UDP Client (X32 port 10023)    │  │
│  /api/notifications  │    │  │  /xremote keepalive (9s timer)  │  │
│  /api/cron/drive     │    │  └────────────────────────────────┘  │
└──────────┬──────────┘    └──────────────────┬───────────────────┘
           │                                   │
           ▼                                   ▼
┌─────────────────────┐              ┌─────────────────────┐
│   FIREBASE BACKEND   │              │  BEHRINGER X32       │
│                      │              │                      │
│  Firestore           │              │  OSC/UDP port 10023  │
│  Firebase Auth       │              │  Monitor mixes       │
│  Google Drive sync   │              │  Channel faders      │
└─────────────────────┘              └─────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Setlist Feature | Service flow display, song ordering, live performance view | Server Components + Client for swipe/gestures |
| Sheet Music Feature | PDF viewer with chord overlays, transposition | Client Component (requires DOM/canvas) |
| Monitor Mix Feature | Per-musician fader controls, mix presets | Client Component (WebSocket to X32 bridge) |
| Shared UI | Reusable primitives: Button, Card, Sheet, Drawer, Badge | shadcn/ui + Tailwind CSS |
| useAppStore | Auth state, current user, role, instrument profile | Zustand, persisted to localStorage |
| useSetlistStore | Active setlist, songs, song order, current position | Zustand + Firestore real-time listener |
| useMixerStore | X32 connection state, channel levels, mute state | Zustand + WebSocket |
| IndexedDB Cache | Setlists, songs, chart PDFs, user prefs for offline | idb library over raw IndexedDB |
| Service Worker | Asset caching, offline fallback, push notifications | Serwist (official Next.js recommendation) |
| Next.js API Routes | Firestore CRUD, Drive sync cron, push notification delivery | Vercel serverless functions |
| X32 Bridge | UDP-to-WebSocket proxy, /xremote keepalive | osc-js BridgePlugin or x32-proxy (npm) |

---

## Recommended Project Structure

```
src/
├── app/                         # Next.js App Router
│   ├── (auth)/                  # Route group: unauthenticated
│   │   └── login/page.tsx       # Google OAuth login
│   ├── (app)/                   # Route group: authenticated shell
│   │   ├── layout.tsx           # Root app shell, nav, auth guard
│   │   ├── setlist/             # Setlist feature routes
│   │   │   ├── page.tsx         # Setlist list / service selector
│   │   │   └── [id]/            # Active setlist
│   │   │       ├── page.tsx     # Live performance view (setlist-at-a-glance)
│   │   │       └── edit/page.tsx # Setlist builder (drag-drop)
│   │   ├── library/             # Song library
│   │   │   ├── page.tsx         # Song list
│   │   │   └── [songId]/page.tsx # Song detail / sheet music
│   │   ├── monitor/             # X32 monitor mixing
│   │   │   └── page.tsx         # Per-musician fader view
│   │   └── schedule/            # Who's playing this week
│   │       └── page.tsx
│   ├── api/                     # API routes
│   │   ├── setlists/route.ts
│   │   ├── songs/route.ts
│   │   ├── sync/drive/route.ts  # Google Drive sync endpoint
│   │   └── notifications/route.ts
│   ├── manifest.ts              # PWA manifest (Next.js built-in)
│   └── sw.js                    # Service worker (Serwist)
│
├── features/                    # Feature modules (co-located logic)
│   ├── setlist/
│   │   ├── components/          # SetlistCard, SongRow, ServiceFlowEditor
│   │   ├── hooks/               # useSetlist, useSetlistDrag
│   │   ├── actions.ts           # Server Actions for CRUD
│   │   └── index.ts             # Public API
│   ├── sheet-music/
│   │   ├── components/          # PDFViewer, ChordOverlay, TransposedView
│   │   ├── hooks/               # usePDF, useTransposition
│   │   └── index.ts
│   ├── monitor/
│   │   ├── components/          # FaderControl, ChannelStrip, MixPreset
│   │   ├── hooks/               # useX32Bridge, useMixerState
│   │   ├── bridge/              # X32 connection logic
│   │   │   ├── x32-client.ts    # WebSocket → X32 OSC abstraction
│   │   │   └── osc-messages.ts  # X32 OSC address constants
│   │   └── index.ts
│   └── scheduling/
│       ├── components/          # ServiceCard, MusicianAvailability
│       ├── hooks/               # useSchedule
│       └── index.ts
│
├── components/                  # Shared, feature-agnostic UI
│   ├── ui/                      # shadcn/ui primitives (never feature-aware)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── sheet.tsx            # Bottom sheet / drawer
│   │   └── ...
│   └── shared/                  # Composed but still feature-agnostic
│       ├── AppShell.tsx
│       ├── NavBar.tsx
│       └── OfflineBanner.tsx
│
├── store/                       # Zustand stores
│   ├── app-store.ts             # Auth, user profile, role
│   ├── setlist-store.ts         # Setlist data, current song, position
│   └── mixer-store.ts           # X32 connection, channel state
│
├── lib/                         # Core utilities, shared services
│   ├── firebase/                # Firebase client config + helpers
│   ├── drive/                   # Google Drive sync engine
│   ├── music/                   # Transposition engine (existing, keep)
│   ├── offline/                 # IndexedDB access layer (idb)
│   └── utils.ts
│
└── types/                       # Global TypeScript interfaces
    ├── setlist.ts
    ├── song.ts
    ├── user.ts
    └── mixer.ts
```

### Structure Rationale

- **features/:** Co-locates all code for a feature. A feature's `index.ts` is its public API — other features import only from there, never from internals. This enforces boundaries.
- **components/ui/:** shadcn/ui primitives live here. They are never feature-aware. Features can use them freely.
- **store/:** Three stores maximum. No inter-store dependencies — each store is self-contained.
- **lib/:** Pure utilities with no React dependencies. Importable in both server and client contexts.
- **app/:** Only Next.js routing and layouts. Business logic lives in `features/` and `lib/`, not in page components.

---

## Architectural Patterns

### Pattern 1: Setlist-First Page Hierarchy

**What:** The live performance setlist view is the root route (`/setlist/[id]`), not a PDF viewer or library. Navigation goes: Home → Active Setlist → (optionally) Sheet Music for a song. Not the reverse.

**When to use:** Always — this is the core UX inversion from v1.

**Trade-offs:** Sheet music is still accessible, but it's a drill-down from the setlist, not the primary view. This matches how musicians actually use the app during a service.

**Example:**
```typescript
// app/(app)/setlist/[id]/page.tsx — Server Component, fetches setlist server-side
export default async function SetlistPage({ params }: { params: { id: string } }) {
  const setlist = await getSetlist(params.id) // Server Action
  return (
    <SetlistAtAGlance setlist={setlist} />  // Client Component for swipe gestures
  )
}

// Drill into sheet music only when needed
// app/(app)/library/[songId]/page.tsx
```

### Pattern 2: Server Components for Data, Client Components for Interaction

**What:** Default every component to a React Server Component. Add `'use client'` only when the component needs: event handlers, browser APIs, useState/useEffect, or WebSocket connections.

**When to use:** Always, from the start. Retrofit is painful.

**Trade-offs:** Some prop drilling at boundaries. Use React `context` or Zustand only for genuinely client-side interactive state. Server Components cannot be rendered inside Client Components (but can be passed as `children`).

**Example:**
```typescript
// Server Component — no 'use client', no useState
// Renders the static setlist frame server-side
export default async function SetlistShell({ id }: { id: string }) {
  const setlist = await fetchSetlistFromFirestore(id)
  return (
    <div>
      <SetlistHeader title={setlist.name} date={setlist.date} />
      {/* Client Component for swipe-to-next behavior */}
      <SetlistPerformanceView songs={setlist.songs} />
    </div>
  )
}

// Client Component — 'use client', handles gestures
'use client'
export function SetlistPerformanceView({ songs }: { songs: Song[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // swipe gesture handling here
}
```

### Pattern 3: Feature Public API via index.ts

**What:** Each `features/[name]/index.ts` exports only what other features need. Internal components, hooks, and utilities are not exported.

**When to use:** Always. Prevents cross-feature coupling.

**Trade-offs:** Slightly more boilerplate in index.ts files. Worth it — prevents the 157-component tangle by enforcing explicit boundaries.

**Example:**
```typescript
// features/setlist/index.ts
export { SetlistAtAGlance } from './components/SetlistAtAGlance'
export { SetlistEditor } from './components/SetlistEditor'
export { useSetlist } from './hooks/useSetlist'
export type { Setlist, SetlistSong } from '../../types/setlist'
// Internal components NOT exported: SongRowInternal, DragHandle, etc.
```

### Pattern 4: Zustand Slice Pattern (3 Stores)

**What:** Three focused, domain-aligned Zustand stores replace the current 8. Each uses the slice pattern internally for modularity. No inter-store dependencies.

**When to use:** For all global client state. Local component state stays in `useState`.

**Trade-offs:** Consolidating 8→3 stores requires migration work. Some state may be co-owned by two domains (e.g., current user's instrument affects both setlist display and monitor mix). Solve by storing in `appStore` and reading from it via selectors in other components.

**Example:**
```typescript
// store/app-store.ts
interface AppStore {
  // Auth
  user: User | null
  role: 'admin' | 'leader' | 'member' | null
  // User profile
  instrument: Instrument
  transpositionOffset: number
  // Actions
  setUser: (user: User | null) => void
  setInstrument: (instrument: Instrument) => void
}
export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      instrument: 'concert',
      transpositionOffset: 0,
      setUser: (user) => set({ user }),
      setInstrument: (instrument) => set({ instrument }),
    }),
    { name: 'app-store' }
  )
)

// store/setlist-store.ts — Firestore listener drives this store
interface SetlistStore {
  activeSetlist: Setlist | null
  currentSongIndex: number
  isPerformanceMode: boolean
  setActiveSetlist: (setlist: Setlist) => void
  advanceSong: () => void
  setPerformanceMode: (mode: boolean) => void
}

// store/mixer-store.ts — WebSocket to X32 bridge drives this store
interface MixerStore {
  bridgeUrl: string | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  channels: Record<number, ChannelState>
  setBridgeUrl: (url: string) => void
  setChannelFader: (channel: number, value: number) => void
  setChannelMute: (channel: number, muted: boolean) => void
}
```

### Pattern 5: Offline-First with IndexedDB

**What:** All setlist and song data is written to IndexedDB on fetch and read from IndexedDB first. The service worker handles asset caching. Firestore listeners sync when online.

**When to use:** Always — this is the "equal to paper" offline requirement.

**Trade-offs:** Adds complexity to data access layer. Use `idb` library (a thin typed wrapper over IndexedDB) to avoid raw IndexedDB complexity.

**Example:**
```typescript
// lib/offline/setlist-cache.ts
import { openDB } from 'idb'

export async function cacheSetlist(setlist: Setlist): Promise<void> {
  const db = await getDB()
  await db.put('setlists', setlist, setlist.id)
}

export async function getCachedSetlist(id: string): Promise<Setlist | undefined> {
  const db = await getDB()
  return db.get('setlists', id)
}

// In a Firestore listener:
onSnapshot(setlistDoc, async (snap) => {
  const setlist = snap.data() as Setlist
  await cacheSetlist(setlist)          // Write to IndexedDB
  useSetlistStore.getState().setActiveSetlist(setlist)  // Update store
})
```

---

## X32 Monitor Bridge Architecture

This is the critical unsolved problem. The X32 speaks OSC over raw UDP. Browsers cannot open raw UDP sockets. The v1 Electron bridge never worked reliably. Here is the complete analysis.

### Why Electron Failed (Root Cause)

Electron was the wrong tool: it requires installation on a specific machine, has complex auto-update mechanics, and creates a binary dependency that musicians can't easily run. The WebSocket bridge within Electron was additionally fragile because Electron's main process and renderer process communicate over IPC, adding latency and failure modes.

The fundamental problem is not Electron — it is the deployment model. Electron requires someone to install and maintain a desktop app on a specific machine that must be left running during services.

### X32 Protocol Constraints

- Communicates over UDP port 10023 (confirmed, HIGH confidence — official Behringer OSC protocol documentation)
- `/xremote` command subscribes to change notifications for 10 seconds
- Client must re-send `/xremote` every 9 seconds to maintain subscription (keepalive loop)
- No authentication whatsoever — security model is "LAN only"
- Bidirectional: client sends commands, X32 broadcasts state changes back

### Option A: Node.js Bridge on Dedicated Hardware (RECOMMENDED)

**Architecture:**
```
Phone Browser
    │
    │ WebSocket (ws://bridge-ip:8080)
    ▼
Node.js Bridge Process          osc-js BridgePlugin
(Raspberry Pi / Mac Mini)    ┌──────────────────────┐
    │                        │  WS Server port 8080  │
    │ <──────────────────>   │  UDP Client port 10023│
    │                        │  /xremote keepalive   │
    ▼                        └──────────────────────┘
Behringer X32
UDP port 10023
```

**How it works:**
1. A Node.js process runs `osc-js` with `BridgePlugin` (or `x32-proxy` npm package)
2. The bridge runs on a machine permanently on the church LAN (Raspberry Pi, a Mac Mini in the rack, or the sound engineer's laptop)
3. Browser clients connect via WebSocket: `new WebSocket('ws://192.168.1.X:8080')`
4. The bridge translates WebSocket binary frames → UDP OSC packets sent to X32
5. The bridge handles `/xremote` keepalive internally (9-second interval setInterval)
6. X32 responses come back via UDP → bridge relays to all connected WebSocket clients

**Implementation with `x32-proxy` (npm package by audiopump):**
```bash
npm install -g x32-proxy
x32-proxy --mixer 192.168.1.X --port 8080
```
This is a production-quality proxy that handles subscription pooling (one `/xremote` for all connected clients).

**Implementation with `osc-js` (DIY, more control):**
```javascript
const OSC = require('osc-js')
const osc = new OSC({
  plugin: new OSC.BridgePlugin({
    udpClient: { host: '192.168.1.X', port: 10023 },  // X32 IP
    udpServer: { host: '0.0.0.0', port: 10024 },       // receive X32 replies
    wsServer:  { host: '0.0.0.0', port: 8080 }         // browser connects here
  })
})
osc.open()

// Keepalive: re-send /xremote every 9 seconds
setInterval(() => {
  osc.send(new OSC.Message('/xremote'), { receiver: 'udp' })
}, 9000)
```

**Deployment options (ranked by reliability):**
1. Raspberry Pi 4 permanently mounted in the audio rack — always on, always on LAN, zero maintenance
2. Mac Mini or NUC in the rack — same idea, more powerful
3. Sound engineer's laptop — requires laptop to be on and running; fragile
4. Any machine on the LAN — works but requires someone to start it

**Pros:**
- Reliable (no Electron IPC complexity)
- Any browser connects without installation
- Multiple musicians can connect simultaneously
- `x32-proxy` handles subscription pooling, reducing X32 load

**Cons:**
- Requires a dedicated machine on the LAN
- Bridge must be started before service (can be auto-started via systemd/launchd)
- If bridge machine is not on LAN, feature is unavailable (acceptable — it's LAN-only anyway)

### Option B: Direct X32 WebSocket (No Bridge)

**Architecture:**
```
Phone Browser
    │ WebSocket
    ▼
X32 itself? — NO. The X32 does not have a WebSocket server.
The X32 only speaks OSC/UDP.
```

**Verdict:** Not feasible. The X32 firmware does not provide a WebSocket interface. This was verified against the official Behringer OSC Remote Protocol documentation. The X32's network interface is UDP-only.

### Option C: Cloud Relay (NOT RECOMMENDED)

**Architecture:**
```
Phone → Cloud WebSocket relay → Bridge on LAN → X32
```

**Why not:** Adds latency (50-200ms round-trip via cloud vs 1-5ms on LAN), adds complexity, adds cost, and the X32 must still be on LAN. The bridge-on-LAN requirement already exists — skip the cloud relay.

### Option D: TouchOSC / Third-Party App (Workaround, Not Integration)

TouchOSC mk2 supports X32 directly via `/xremote` subscription. Musicians could use TouchOSC for monitor mixing separately from the web app. This abandons the integrated experience goal but works today, zero development effort. Keep as fallback if bridge proves too operationally complex.

### Recommended X32 Bridge Decision

**Use Option A (Node.js bridge on Raspberry Pi).** The x32-proxy npm package is purpose-built for exactly this use case, is actively maintained, and handles the complex subscription pooling correctly. The deployment model (Pi in the rack) is reliable and low-maintenance.

**Browser-side client pattern:**
```typescript
// features/monitor/bridge/x32-client.ts
export class X32Client {
  private ws: WebSocket

  constructor(bridgeUrl: string) {
    this.ws = new WebSocket(bridgeUrl)
    this.ws.binaryType = 'arraybuffer'
  }

  setFader(channel: number, value: number): void {
    // value: 0.0 - 1.0
    const oscAddress = `/ch/${String(channel).padStart(2, '0')}/mix/fader`
    const msg = encodeOSCMessage(oscAddress, value)
    this.ws.send(msg)
  }

  muteChannel(channel: number, muted: boolean): void {
    const oscAddress = `/ch/${String(channel).padStart(2, '0')}/mix/on`
    const msg = encodeOSCMessage(oscAddress, muted ? 0 : 1)
    this.ws.send(msg)
  }
}
```

**Bridge URL discovery:** Since the bridge IP is fixed (rack-mounted Pi), store it in app config. Let the sound engineer set the bridge URL in admin settings once. If the WebSocket fails to connect, the monitor mixing feature gracefully disables itself — other features are unaffected.

---

## Data Flow

### Setlist Live Performance Flow

```
[Firestore setlist document]
    │
    │ onSnapshot() real-time listener (online)
    ▼
[useSetlistStore.setActiveSetlist()]
    │
    ├── [IndexedDB: cacheSetlist()]  (offline fallback write)
    │
    ▼
[SetlistAtAGlance page]
    │
    ├── currentSong: song[currentIndex]
    ├── nextSong: song[currentIndex + 1]
    ├── musician's transposedKey = transpose(song.key, userProfile.offset)
    └── [Swipe right / tap "Next"] → useSetlistStore.advanceSong()
```

### Monitor Mix Flow

```
[Musician swipes fader on phone]
    │
    ▼
[FaderControl component (Client Component)]
    │ useMixerStore.setChannelFader(ch, value)
    │
    ▼
[useMixerStore action]
    │ optimistic update (local state)
    │ x32Client.setFader(ch, value)
    │
    ▼
[WebSocket → Node.js Bridge (LAN)]
    │
    ▼
[osc-js BridgePlugin → UDP → X32 port 10023]
    │
    ▼
[X32 updates hardware]
    │
    │ X32 broadcasts state change via /xremote subscription
    ▼
[UDP → Bridge → WebSocket → all connected clients]
    │
    ▼
[useMixerStore: update confirmed state from X32]
```

### Offline Fallback Flow

```
[User opens app — no network]
    │
    ▼
[Service Worker intercepts fetch]
    │ cache-first for assets
    │ NetworkFirst → fallback to cache for API routes
    │
    ▼
[Firestore listener fails — user offline]
    │
    ▼
[getCachedSetlist(id) from IndexedDB]
    │
    ▼
[useSetlistStore.setActiveSetlist() with cached data]
    │
    ▼
[App renders normally — musician performs service]
    │
    │ (when network returns)
    ▼
[Firestore listener reconnects, updates IndexedDB and store]
```

### Google Drive Sync Flow

```
[Vercel Cron Job (hourly) OR manual trigger]
    │
    ▼
[/api/sync/drive route]
    │ Lists Google Drive folder
    │ Compares against Firestore index
    ▼
[New/modified files → Gemini Flash OCR → chord extraction]
    │
    ▼
[Firestore song document updated]
    │
    ▼
[Firestore real-time listener → client stores updated]
    │
    ▼
[IndexedDB cache updated for offline]
```

---

## Anti-Patterns

### Anti-Pattern 1: Feature Logic in Page Files

**What people do:** Put data fetching, business logic, and state management directly inside `app/(app)/setlist/[id]/page.tsx`.

**Why it's wrong:** Pages become untestable, logic cannot be reused, and the page file grows to 300+ lines. This is exactly how v1's 157 components got entangled.

**Do this instead:** Pages are thin shells. They import from `features/` and pass props down. All logic lives in feature modules.

### Anti-Pattern 2: 8 Zustand Stores for 8 Domains

**What people do:** Create a store for every data type (auth, songs, setlists, users, PDFs, mixer, notifications, schedule).

**Why it's wrong:** Stores become interdependent. Actions in one store need to trigger updates in three others. Debugging becomes a maze of subscriptions.

**Do this instead:** Group by usage pattern, not data type. Three stores: AppStore (session/user identity), SetlistStore (what's happening in the service), MixerStore (X32 connection state). Data that is server-fetched and cached lives in IndexedDB, not Zustand.

### Anti-Pattern 3: Bridge Inside the Web App Process

**What people do (v1 mistake):** Run the OSC bridge as an Electron main process tightly coupled to the renderer. Or try to put bridge logic in a Next.js API route.

**Why it's wrong:** Electron IPC adds complexity and failure modes. Vercel serverless functions cannot maintain a persistent WebSocket server or UDP socket (functions are stateless and short-lived).

**Do this instead:** The bridge is a separate, independently deployed Node.js process on a LAN machine. The web app is a WebSocket *client* to the bridge. The bridge is infrastructure, not part of the app.

### Anti-Pattern 4: PDF-First Navigation

**What people do (v1 behavior):** Open song → see PDF → setlist is a sidebar or secondary view.

**Why it's wrong:** Musicians during a service are not studying sheet music. They are following the service flow. Requiring them to navigate to a PDF viewer as the primary experience means the app fights their workflow.

**Do this instead:** Default route for authenticated users = active setlist. Sheet music is a drill-down from within the setlist, available on demand for a specific song.

### Anti-Pattern 5: Polling for X32 State

**What people do:** Send repeated GET requests to check X32 fader levels.

**Why it's wrong:** The X32's `/xremote` subscription model already pushes changes to clients. Polling duplicates this work and creates race conditions (your poll response may be older than the /xremote update already received).

**Do this instead:** Rely on `/xremote` subscription via the bridge. The bridge sends all X32 state changes to connected WebSocket clients. The mixer store updates reactively.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Firebase Auth | Server-side session tokens via Firebase Admin SDK in API routes, client-side `onAuthStateChanged` | Keep existing implementation |
| Firestore | Client-side real-time listeners in feature hooks + Server Actions for mutations | Real-time listeners drive Zustand store + IndexedDB cache simultaneously |
| Google Drive | Server-side only, via Drive API in cron `/api/sync/drive` route | Keep existing sync engine; harden retry logic |
| Gemini Flash (OCR) | Server-side only, invoked during Drive sync pipeline | Keep existing three-layer pipeline |
| X32 Bridge | Client-side WebSocket from `features/monitor/bridge/x32-client.ts` | Bridge URL stored in admin config; graceful degradation if bridge offline |
| Vercel Cron | Hits `/api/sync/drive` on schedule | Webhook-triggered alternative: Drive push notifications (reduce to event-driven) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| features/setlist ↔ features/sheet-music | Setlist passes songId to sheet music route (URL param), no direct import | Sheet music is a child route, not a sibling feature import |
| features/monitor ↔ store/mixer-store | Monitor components read from mixer-store, write via X32Client | Store is the single source of truth for mixer state |
| lib/music ↔ features/setlist | Setlist uses transposition utilities from lib/music (pure functions) | lib/music has no React dependencies — importable anywhere |
| store/ ↔ lib/offline | Firestore listeners in store write to IndexedDB via lib/offline functions | Store is not aware of IndexedDB directly; offline layer is abstracted |
| app/ routes ↔ features/ | Pages import from features/[name]/index.ts only | No direct imports into feature internals from pages |

---

## Build Order (Phase Dependencies)

The architecture has clear dependency chains that should drive phase ordering:

**Phase 1 — Foundation (enables everything else)**
1. Project scaffold: Next.js App Router, Tailwind, shadcn/ui primitives, TypeScript config
2. Three Zustand stores with TypeScript types
3. Firebase Auth integration (Google OAuth)
4. IndexedDB cache layer (`lib/offline/`)
5. Service worker with Serwist (PWA manifest, offline asset caching)

**Phase 2 — Setlist Core (primary user value)**
Depends on: Phase 1
1. Firestore real-time listener → SetlistStore
2. Setlist list page (which services exist)
3. Live performance view (`/setlist/[id]`) — setlist at a glance, swipe-to-next
4. Per-musician auto-transposition (reads instrument from AppStore, applies to song display)
5. Offline proactive caching of active setlist to IndexedDB

**Phase 3 — Setlist Creation (admin/leader value)**
Depends on: Phase 2 (needs Firestore model validated)
1. Setlist builder with drag-drop song ordering
2. Service flow items (prayers, readings, transitions)
3. Musician assignment per song

**Phase 4 — Sheet Music (secondary feature)**
Depends on: Phase 1 (PDF rendering), Phase 2 (setlist integration)
1. PDF viewer with existing Drive sync pipeline
2. Chord overlay with transposition
3. Drill-down from setlist song → sheet music

**Phase 5 — X32 Monitor Mixing (specialized, isolated)**
Depends on: Phase 1 only (bridge is independent from setlist)
1. Node.js bridge server (x32-proxy on Raspberry Pi)
2. MixerStore with WebSocket connection management
3. Channel strip UI (faders, mutes)
4. Graceful degradation when bridge is offline
5. Connection URL configuration in admin settings

**Phase 6 — Scheduling and Notifications (low priority)**
Depends on: Phase 2 (needs user model and setlist model)
1. Schedule page (who's playing this week)
2. Push notifications (setlist published, upcoming service reminder)

---

## Scaling Considerations

This app has ~15 users. Scale is not a concern. However, the architecture should not be designed in ways that create unnecessary costs at even this small scale.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 users (current) | Current approach: serverless Vercel, Firestore, free tier everything. No changes needed. |
| 50-500 users (hypothetical multi-congregation) | Firestore handles this trivially. Add multi-tenancy data model (congregationId on all documents). Vercel free tier handles this. |
| 500+ users | Firestore costs emerge. Evaluate whether Drive sync cron should move to event-driven (Drive webhooks). Consider CDN for PDF serving. |

### Scaling Priorities (if they ever arise)

1. **First bottleneck:** Google Drive API quota (100 calls/100 seconds per user per project). Mitigate with webhook-triggered sync instead of polling.
2. **Second bottleneck:** Gemini Flash API costs per OCR call. Mitigate with deduplication (hash-based skip if file unchanged).
3. **Third bottleneck:** Firestore read costs from multiple real-time listeners. Mitigate with selective subscription (only subscribe to active setlist, not all setlists).

---

## Sources

- Behringer X32 OSC Remote Protocol (official): https://behringerwiki.musictribe.com/index.php?title=OSC_Remote_Protocol
- X32 OSC Protocol PDF (unofficial, comprehensive): https://wiki.munichmakerlab.de/images/1/17/UNOFFICIAL_X32_OSC_REMOTE_PROTOCOL_(1).pdf
- x32-proxy npm package (audiopump): https://github.com/audiopump/x32-proxy — MEDIUM confidence (community-maintained, purpose-built)
- osc-js BridgePlugin documentation: https://adzialocha.github.io/osc-js/ — MEDIUM confidence
- osc-js GitHub wiki, Bridge Plugin: https://github.com/adzialocha/osc-js/wiki/Bridge-Plugin — MEDIUM confidence
- Next.js official PWA guide (App Router, Serwist): https://nextjs.org/docs/app/guides/progressive-web-apps — HIGH confidence (official docs, last updated 2026-02-27)
- Next.js App Router architecture guide: https://nextjs.org/docs/app — HIGH confidence
- Feature-Sliced Design for Next.js App Router: https://feature-sliced.design/blog/nextjs-app-router-guide — MEDIUM confidence
- Zustand discussion: when to use multiple stores vs slices: https://github.com/pmndrs/zustand/discussions/2496 — HIGH confidence (official repo discussion)
- MDN PWA offline and background operation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation — HIGH confidence
- Offline-first frontend apps 2025 (LogRocket): https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/ — MEDIUM confidence
- React 19 release notes: https://react.dev/blog/2024/12/05/react-19 — HIGH confidence

---

*Architecture research for: CRC Music v2.0 — worship setlist platform with X32 monitor mixing*
*Researched: 2026-03-07*
