# Phase 1: Monitor Research Spike + Code Audit - Research

**Researched:** 2026-03-07
**Domain:** X32 OSC bridge architecture, Firestore transport, codebase audit, musician profiles
**Confidence:** HIGH

## Summary

Phase 1 is a research-and-cleanup phase with three distinct workstreams: (1) validating the X32 bridge architecture through measured testing and a working proof-of-concept, (2) auditing and cleaning the existing codebase, and (3) building musician profiles with instrument/transposition preferences. The codebase already has a substantial implementation of the Firestore-based bridge transport layer, an Electron desktop app with NSIS one-click installer and auto-updates, and a musician profile system with instrument presets. The research work is about validating and hardening what exists, not building from scratch.

The bridge is an Electron app (`bridge/` directory in this repo) that communicates with the Behringer X32 via raw OSC over UDP and relays state through Firestore documents. The app reads mixer state from `monitor-live/state` via `onSnapshot` and writes commands to `monitor-live/commands/pending`. This architecture already eliminates the iPad configuration pain point (no certificates, no IP addresses, no port forwarding). The primary research question is whether Firestore's latency is acceptable for fader control, or whether a hybrid approach (Firestore for state, WebSocket for commands) would be needed.

The code audit scope is well-defined: the legacy `setlist-store.ts` is imported in 3 files but superseded by `setlist-firebase.ts`, the `/tasks` page (290 lines), tasks API route, and TaskSheet component are cut from scope, the `UsageAnalyticsSection` component (377 lines) is cut from scope, and the `/leader` route already redirects to `/manage`. The 8 Zustand stores need architectural planning (not refactoring in this phase). The musician profile system already has `INSTRUMENT_PRESETS` with 17 instruments, `saveMusicianProfile()`, `subscribeToMusicianProfile()`, and a Zod schema -- it needs the UI integration and the "sound engineer" role formalization for AUTH-04.

**Primary recommendation:** Focus the PoC on measuring Firestore round-trip latency under realistic conditions (fader drag = many rapid writes). If latency exceeds 200ms consistently, design a hybrid WebSocket fallback. The existing bridge code is architecturally sound and should be hardened, not replaced.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bridge Research:**
- Current state: A Firestore-based transport layer exists (bridge executable <-> Firestore <-> iPad). Never battle-tested in a real service. Latency characteristics unknown.
- Research scope: Evaluate alternatives (WebSocket, direct browser OSC, hybrid) alongside hardening the Firestore approach. Don't assume the current architecture is the answer -- pick the best one.
- Hardware target: Open -- research should recommend (production PC, Raspberry Pi, or other). Evaluate tradeoffs.
- Install experience: One-click installer. Download an .exe or .app, run it, done. No command line, no config files, no port forwarding.
- Initial setup: Setup code flow (admin generates 6-char code, bridge redeems for credentials) is acceptable as a one-time step.
- Maintainer: Either Daniel or the sound engineer -- both technically capable enough to install, neither should need to troubleshoot.
- Failure recovery: Auto-recover silently. Bridge must reconnect on its own within seconds. Musicians see a brief "reconnecting" indicator at most. Zero manual intervention mid-service.
- Bus layout: 3-4 shared wedge monitor buses. Some musicians share a bus.

**Code Audit:**
- Scope: Document + quick wins. Produce a detailed audit document AND delete obviously dead code (unused pages, deprecated routes, orphaned components). Save bigger refactors for later phases.
- Store consolidation: Plan now, execute later. Define the ideal Zustand store architecture in the audit doc. Actual refactoring happens during the phases that build features on those stores.
- Aggressiveness: Aggressive. If code is clearly unused or half-baked, recommend removing it. No users yet -- no risk. Flag and recommend cuts.
- Admin included: Yes. Audit should identify which admin features are duct tape vs. essential. Recommend what to keep, cut, and simplify (feeds Phase 5).

**Proof-of-Concept:**
- Format: Use existing UI. The PoC runs through the actual FaderStrip, QuickMonitorPanel, and ConnectionIndicator components already in the app. Not a separate CLI or minimal page.
- Test environment: Both venue access (actual X32) AND a simulator/mock for day-to-day development. Research must identify or create an X32 simulator.
- Install test: Document install process to non-technical standard. Don't need actual user testing in Phase 1 -- install UX gets polished in Phase 2.
- Resilience testing: Test BOTH bridge-side (ethernet disconnect) and client-side (WiFi drop on iPad) network interruptions. Both must auto-recover within seconds.

**Musician Profiles:**
- Instruments per musician: One primary instrument. Rare exceptions handled via manual override -- no need for multi-instrument selector in profile.
- Transposition model: Standard instrument transposition as default (Bb trumpet = +2 semitones, Eb alto sax = -3, etc.). Profile stores instrument choice, app calculates interval. Musicians can override with a custom offset if their preference differs.
- Where applied: Everywhere. Musician sees their transposed key in the setlist overview (Phase 3) AND in the PDF chord overlays (existing transposition engine). Consistent experience.
- Band instruments: Mixed -- includes transposing instruments (trumpet, sax, clarinet) alongside concert pitch instruments (guitar, keys, bass, vocals). Need to support the full standard range of orchestral transpositions.
- Profile Data Model: `instrument` (string from predefined list), `transpositionOverride` (number | null), `displayName` (string).

### Claude's Discretion
None specified -- all major decisions are locked.

### Deferred Ideas (OUT OF SCOPE)
- Mix presets (save/recall personal mixes) -- v2 feature
- Live follow mode (leader advances all views) -- v2 feature
- Multi-instrument profile switching -- not needed for launch
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MIX-12 | Bridge architecture validated through research spike before any implementation code is written | Core research deliverable: architecture decision document, PoC with measured latency, tested failure modes |
| CODE-01 | Codebase audit -- identify and remove dead code, unused components, abandoned features | Dead code inventory complete: setlist-store.ts, /tasks page + API, UsageAnalyticsSection, /leader route, task types in models.ts |
| CODE-02 | Consolidate Zustand stores from 8 fragmented stores to a focused architecture | Store inventory documented with 8 stores; architecture plan defines target state (actual refactoring deferred to later phases) |
| AUTH-04 | Role-based access: admin, band leader, musician, sound engineer | Sound engineer role already implemented as a boolean flag on UserProfile; roles.ts has hierarchy; needs verification that all monitor access checks work correctly |
| PROF-01 | Musician profile includes name, instrument(s), transposition preferences | MusicianProfile type exists with instrument, defaultTransposition, preferCapo, preferFlats; INSTRUMENT_PRESETS has 17 instruments; needs UI for profile editing |
| PROF-02 | Profile settings (instrument, transposition) are applied automatically across the entire app | Transposition engine (music-math.ts, chord-utils.ts) is complete with 100% test coverage; needs wiring to read from profile and apply globally |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.4 | App framework | Already the project framework |
| Firebase/Firestore | 12.9.0 | Real-time transport, auth, data | Already the project database; Firestore onSnapshot is the bridge transport |
| firebase-admin | 13.6.0 | Server-side Firebase (bridge + API routes) | Already used in bridge and API routes |
| Zustand | 5.0.10 | Client state management | Already used for 8 stores including monitor-store |
| Zod | 4.3.6 | Schema validation | Already used for all Firestore data converters |
| Electron | 40.6.0 | Bridge desktop app | Already the bridge runtime with system tray, auto-update |
| electron-builder | 26.8.1 | Bridge packaging + NSIS installer | Already configured for one-click Windows installer |
| electron-updater | 6.3.9 | Auto-update from GitHub releases | Already integrated in bridge main.ts |
| Vitest | 3.2.1 | Unit testing | Already configured with path aliases |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ws | 8.19.0 | WebSocket library (in bridge) | If hybrid WebSocket approach is needed |
| dgram (Node built-in) | N/A | UDP socket for OSC | X32 communication (already implemented) |
| Playwright | 1.58.2 | E2E testing | Smoke tests for PoC validation |

### For Research Phase Only
| Tool | Purpose | Where to Get |
|------|---------|--------------|
| pmaillot X32 Emulator | Software X32 simulator for dev without hardware | https://github.com/pmaillot/X32-Behringer |
| Chrome DevTools Network tab | Measure Firestore round-trip latency | Built into browser |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Firestore transport | Direct WebSocket to bridge | Lower latency (~5ms vs ~50-200ms), but requires iPad users to trust self-signed certs or set up port forwarding. Firestore "just works" with zero iPad config. |
| Firestore transport | Hybrid (Firestore state + WebSocket commands) | Best of both worlds but doubles complexity. Only worth it if Firestore command latency is unacceptable (>300ms). |
| Electron bridge | Node.js CLI service | Simpler to build but no system tray, no GUI dashboard, harder for non-technical install. Electron already works. |
| Raspberry Pi deployment | Production PC deployment | Pi is always-on and cheap, but PC is already running at venue and Electron auto-start is already configured. Pi adds hardware management. |

**No new packages needed for Phase 1.** All required libraries are already installed.

## Architecture Patterns

### Existing Bridge Architecture (Firestore Transport)
```
iPad Browser                    Firestore                      Bridge (Electron)           X32 Mixer
    |                               |                               |                        |
    |-- onSnapshot(state) --------->|<---- set(state) --------------|<---- OSC/UDP ----------|
    |                               |                               |                        |
    |-- addDoc(commands/pending) --->|---- onSnapshot(commands) ---->|---- OSC/UDP --------->|
    |                               |     (delete after execute)    |                        |
```

### Pattern 1: Firestore as Message Bus
**What:** Bridge writes mixer state to `monitor-live/state` doc. iPads read via `onSnapshot`. iPad commands go to `monitor-live/commands/pending` subcollection. Bridge reads, executes on X32, deletes.
**When to use:** This is the current and likely final architecture unless latency testing reveals issues.
**Why it works:**
- Zero configuration on iPads (uses existing authenticated Firestore connection)
- No certificates, no IP addresses, no port forwarding
- Works through firewalls and NAT
- Built-in offline resilience (Firestore SDK handles reconnection)

**Existing implementation:**
- `bridge/src/firestore-transport.ts` (457 lines) - Bridge side: state writes, command processing, throttling, batch cleanup
- `src/lib/firestore-monitor-client.ts` (213 lines) - App side: state reading, command sending, throttling
- `src/lib/monitor-store.ts` (162 lines) - Zustand store for UI state
- `src/hooks/use-monitor-connection.ts` (123 lines) - Singleton connection manager with ref-counting

### Pattern 2: OSC over UDP with Auto-Discovery
**What:** Bridge broadcasts `/xinfo` on UDP to subnet broadcast addresses to find the X32 automatically. Falls back to configured IP.
**When to use:** Always. Already implemented in `X32Client.discover()`.
**Key behaviors:**
- X32 requires `/xremote` renewal every 10s (bridge sends every 8s)
- Health check: if no response in 20s, mark disconnected and start reconnect loop
- Reconnect tries every 10s for up to 10 minutes (60 attempts)

### Pattern 3: Bridge Setup Code Flow
**What:** Admin generates a 6-char alphanumeric code in the app. Bridge exe enters the code, redeems it for Firebase service account credentials via API. Credentials saved locally.
**When to use:** One-time bridge setup.
**Already implemented:**
- `src/app/api/bridge/setup-code/route.ts` - Server-side code generation and redemption
- `bridge/src/main.ts` - IPC handler for `submit-setup-code`
- Code expires in 10 minutes, uses unambiguous characters (no 0/O/1/I)
- Transaction-based redemption prevents race conditions

### Pattern 4: Throttled Command Processing
**What:** Both client and bridge throttle rapid commands (fader drags produce many events).
**Client-side:** `COMMAND_THROTTLE_MS = 50` - coalesces rapid fader changes, sends immediately then throttles.
**Bridge-side:** `COMMAND_BATCH_WINDOW = 20ms` - batches incoming commands, `STATE_WRITE_INTERVAL = 100ms` - max 10 Firestore writes/sec.
**Why:** Prevents Firestore write rate limits and reduces costs.

### Pattern 5: Musician Profile with Instrument Presets
**What:** `INSTRUMENT_PRESETS` maps instrument IDs to transposition offsets. `MusicianProfile` stored as a field on the user document.
**Already implemented:**
- 17 instrument presets in `src/lib/musician-profile.ts`
- `MusicianProfile` type in `src/types/models.ts` with instrument, defaultTransposition, preferCapo, preferFlats
- `musicianProfileSchema` in `src/types/schemas.ts` with Zod validation
- `saveMusicianProfile()` and `subscribeToMusicianProfile()` functions
- Test suite validates all presets, transposition ranges, CRC ensemble coverage

### Recommended PoC Testing Structure
```
docs/
  bridge-architecture-decision.md    # Research findings + architecture recommendation
  codebase-audit.md                  # Dead code inventory + store consolidation plan
tests/
  bridge-latency/                    # Latency measurement scripts (manual)
    measure-firestore-roundtrip.ts   # Timestamp command -> measure state update delay
```

### Anti-Patterns to Avoid
- **Rebuilding the bridge from scratch:** The Electron app with Firestore transport, auto-update, NSIS installer, and setup code flow is already substantial (~70KB of source). Harden and validate, don't rewrite.
- **Premature WebSocket optimization:** Don't add WebSocket complexity until Firestore latency is measured and proven insufficient. The zero-config iPad experience is the primary value.
- **Refactoring stores during audit:** The audit should DOCUMENT the ideal store architecture, not implement it. Store refactoring happens in later phases when those features are being built.
- **Testing with only the emulator:** The pmaillot X32 emulator handles OSC but not real network conditions. Must also test with actual hardware at the venue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OSC protocol encoding/decoding | Custom OSC parser | Existing `x32-client.ts` implementation | Already written, handles all X32 message types, tested |
| X32 auto-discovery | Manual IP configuration | `X32Client.discover()` broadcast method | Already handles subnet broadcast, multiple interfaces |
| Desktop app packaging | Custom installer scripts | electron-builder + NSIS | One-click installer already configured, auto-update working |
| Firebase credential distribution | Manual key copying | Setup code flow (`/api/bridge/setup-code`) | Already implemented with expiry, rate limiting, transaction safety |
| Instrument transposition data | Hardcoded offsets per song | `INSTRUMENT_PRESETS` + `transposeChord()` | 17 presets already defined, transposition engine has 100% test coverage |
| Firestore offline resilience | Custom retry/reconnect logic | Firebase SDK built-in offline persistence | SDK handles reconnection, local cache, optimistic updates automatically |
| Real-time state sync | Polling or custom WebSocket | Firestore `onSnapshot` | Sub-second delivery, automatic reconnection, built into existing app auth |

**Key insight:** The biggest risk in this phase is over-engineering. The bridge, transport layer, installer, and profile system already exist. The research is about validation and measurement, not greenfield development.

## Common Pitfalls

### Pitfall 1: Measuring Latency Wrong
**What goes wrong:** Measuring Firestore latency by looking at wall-clock time between write and `onSnapshot` callback, but not accounting for local latency compensation or server-side fan-out delays.
**Why it happens:** Firestore's `onSnapshot` fires immediately for local writes (latency compensation), masking the true round-trip time.
**How to avoid:** Measure cross-device latency: write from device A (iPad), measure time until device B (another browser) sees the change. Use `metadata.hasPendingWrites` to distinguish local vs. server-confirmed updates. Also measure the full round trip: iPad sends command -> bridge receives -> executes on X32 -> X32 state echoes back -> bridge writes state -> iPad sees update.
**Warning signs:** Latency measurements under 10ms are likely measuring local cache, not network round-trip.

### Pitfall 2: Firestore Write Rate Limits
**What goes wrong:** Fader drags generate dozens of events per second. Without throttling, this hits Firestore's 1 write/sec/doc limit for `monitor-live/state`.
**Why it happens:** Each fader position change triggers a state write.
**How to avoid:** The bridge already throttles to 10 writes/sec (`STATE_WRITE_INTERVAL = 100ms`). The client throttles commands to 1 per 50ms per parameter. Verify these throttle rates are sufficient during PoC testing. If the Firestore document update rate exceeds limits, consider splitting state across multiple documents (one per bus).
**Warning signs:** Firestore console showing write errors or `RESOURCE_EXHAUSTED` errors in bridge logs.

### Pitfall 3: Not Testing WiFi Reconnection on iPad
**What goes wrong:** Bridge reconnection is tested (ethernet disconnect) but client-side reconnection (iPad WiFi drop) is forgotten. Musicians walk between rooms, WiFi drops briefly.
**Why it happens:** Developer tests on stable desktop connection.
**How to avoid:** PoC must explicitly test: turn off iPad WiFi for 30 seconds, turn it back on, verify Firestore `onSnapshot` reconnects automatically and state updates resume. The Firebase SDK should handle this, but verify.
**Warning signs:** After WiFi reconnection, FaderStrip shows stale values until page refresh.

### Pitfall 4: Confusing Firestore Document Size with Write Performance
**What goes wrong:** The `monitor-live/state` document contains ALL channel names (32), ALL bus states with ALL send levels (32 channels x 4 buses = 128 send entries), and ALL matrix outputs (6). As the document grows, write and read performance degrades.
**Why it happens:** Firestore charges per document read/write, and larger documents take longer to transfer.
**How to avoid:** Calculate the document size. Each channel: ~50 bytes. Each bus with 32 sends: ~500 bytes. Total: ~32*50 + 4*500 + 6*50 = ~3900 bytes. This is well under Firestore's 1MB limit and should be fine for real-time performance. Monitor in PoC.
**Warning signs:** Document size exceeding 10KB or Firestore console showing slow reads.

### Pitfall 5: Deleting Code That Has Hidden Dependents
**What goes wrong:** Removing "dead" code that is actually imported somewhere unexpected, breaking the build.
**Why it happens:** Import chains in a 155-component app can be non-obvious.
**How to avoid:** Before deleting any file: (1) grep for all imports/references, (2) run `npm run build` after each deletion, (3) run `vitest run` to catch test breakage. Use TypeScript compiler as the safety net -- unused imports will be caught.
**Warning signs:** Build failures after deletions. Always delete one file/group at a time, verify build, then continue.

### Pitfall 6: Store Consolidation Scope Creep
**What goes wrong:** Audit turns into a refactoring project. Someone starts merging stores and breaks existing functionality.
**Why it happens:** It's tempting to "fix it while we're here."
**How to avoid:** The CONTEXT.md is explicit: "Plan now, execute later." The audit document DESCRIBES the target store architecture. No store code changes in Phase 1 beyond deleting the clearly dead `setlist-store.ts`.
**Warning signs:** Pull requests that modify store.ts, library-store.ts, or other active stores during Phase 1.

## Code Examples

### Existing: Reading Mixer State on iPad (src/lib/firestore-monitor-client.ts)
```typescript
// Source: Existing codebase - src/lib/firestore-monitor-client.ts
connect(): void {
    this.options.onStatusChange("connecting")
    this.stateUnsub = onSnapshot(
        doc(db, "monitor-live", "state"),
        (snap) => {
            if (!snap.exists()) {
                if (!this._connected) {
                    this.options.onStatusChange("connecting")
                }
                return
            }
            const data = snap.data() as MixerSnapshot & { updatedAt?: unknown }
            if (!this._connected) {
                this._connected = true
                this.options.onStatusChange("connected")
            }
            this.options.onStateUpdate({
                channels: data.channels || [],
                buses: data.buses || [],
                matrices: data.matrices || [],
                config: data.config,
            })
        },
        (err) => {
            this._connected = false
            this.options.onStatusChange("error", err.message)
        }
    )
}
```

### Existing: Sending Commands from iPad (src/lib/firestore-monitor-client.ts)
```typescript
// Source: Existing codebase - src/lib/firestore-monitor-client.ts
private async sendCommandImmediate(data: Record<string, unknown>): Promise<void> {
    const user = auth.currentUser
    if (!user) return
    try {
        await addDoc(collection(db, "monitor-live", "commands", "pending"), {
            ...data,
            uid: user.uid,
            createdAt: Date.now(),
        })
    } catch (err) {
        logger.error("[MonitorFS] Command send failed:", (err as Error).message)
    }
}
```

### Existing: Instrument Presets (src/lib/musician-profile.ts)
```typescript
// Source: Existing codebase - src/lib/musician-profile.ts
export const INSTRUMENT_PRESETS: Record<string, {
    label: string; transposition: number; description: string; suggestCapo?: boolean
}> = {
    'acoustic_guitar': { label: 'Acoustic Guitar', transposition: 0, description: 'Concert pitch', suggestCapo: true },
    'bb_trumpet': { label: 'Bb Trumpet', transposition: 2, description: 'Sounds a whole step lower' },
    'eb_alto_sax': { label: 'Eb Alto Sax', transposition: -3, description: 'Sounds a major 6th lower' },
    'f_horn': { label: 'French Horn (F)', transposition: 7, description: 'Sounds a 5th lower' },
    // ... 13 more instruments
}
```

### Existing: Sound Engineer Role Check (src/hooks/use-monitor-access.ts)
```typescript
// Source: Existing codebase - src/hooks/use-monitor-access.ts
export function useMonitorAccess() {
    const { user, isAdmin, isSoundEngineer } = useAuth()
    // ...
    const hasAccess = isAdmin || isSoundEngineer || hasBusAssigned
    return { hasAccess, isAdmin, isSoundEngineer, hasBusAssigned, loading }
}
```

### PoC Latency Measurement Pattern (to be created)
```typescript
// Pattern for measuring end-to-end Firestore command latency
// Write this as a dev-only utility during the PoC
async function measureCommandLatency(client: FirestoreMonitorClient) {
    const startTime = performance.now()
    const targetBusIndex = 1
    const testValue = Math.random()

    // Send a command
    client.setBusMaster(targetBusIndex, testValue)

    // Wait for the state update that reflects our change
    return new Promise<number>((resolve) => {
        const unsub = onSnapshot(doc(db, "monitor-live", "state"), (snap) => {
            if (!snap.exists()) return
            const data = snap.data()
            // Check if our value is reflected (with tolerance for float precision)
            const bus = data.buses?.find((b: any) => b.index === targetBusIndex)
            if (bus && Math.abs(bus.fader - testValue) < 0.001) {
                const latency = performance.now() - startTime
                unsub()
                resolve(latency)
            }
        })
    })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket bridge (WSS) | Firestore transport | bridge v2.0 (current) | Eliminated need for self-signed certs on iPads, zero config |
| Manual IP config for X32 | Auto-discovery via broadcast | bridge v2.0 (current) | Bridge finds X32 automatically on LAN |
| Manual service account key distribution | Setup code flow (6-char code) | bridge v2.0 (current) | Non-technical install: enter code instead of copying JSON files |
| Per-user setlist store (localStorage) | Firebase setlist system (setlist-firebase.ts) | v1.x | setlist-store.ts is now dead code |
| Separate leader/musician views | Unified /manage route | v1.x | /leader is now a redirect |

**Deprecated/outdated in this codebase:**
- `setlist-store.ts`: Legacy localStorage-based setlist. Replaced by `setlist-firebase.ts`. Still imported by 3 files (SetlistEditorV2, SongChartsLibrary, LibraryFileRow) -- likely unused code paths within those files.
- `/leader` route: Redirects to `/manage`. The redirect page exists at `src/app/(main)/leader/page.tsx`.
- `/tasks` page: 290-line implementation cut from v2 scope. Has API route at `src/app/api/tasks/update/route.ts` and component at `src/components/setlist/tasks/TaskSheet.tsx`.
- `UsageAnalyticsSection.tsx`: 377-line admin component cut from v2 scope.
- Task types in `models.ts`: `TaskStatus`, `SetlistTask` types are only used by task-related files.

## Dead Code Inventory

### Confirmed Dead (Safe to Delete)
| File/Route | Lines | Reason | Imports to Check |
|------------|-------|--------|------------------|
| `src/lib/setlist-store.ts` | 63 | Replaced by setlist-firebase.ts | 3 files import it -- verify those code paths are unused |
| `src/app/(main)/leader/page.tsx` | ~15 | Redirect to /manage | middleware.ts references '/leader' -- update |
| `src/app/(main)/tasks/page.tsx` | 290 | Cut from v2 scope | None external |
| `src/app/api/tasks/update/route.ts` | ~50 | Cut from v2 scope | tasks page only |
| `src/components/setlist/tasks/TaskSheet.tsx` | ~200 | Cut from v2 scope | tasks page, possibly setlist editor |
| `src/components/admin/UsageAnalyticsSection.tsx` | 377 | Cut from v2 scope | Admin page imports |
| Task types in `src/types/models.ts` | ~25 | `TaskStatus`, `SetlistTask` only used by task code | Remove types only |

### Needs Investigation (Audit Phase)
| Area | Files | Question |
|------|-------|----------|
| `setlist-store.ts` imports | SetlistEditorV2, SongChartsLibrary, LibraryFileRow | Are these import paths actually exercised? |
| `/audio` page | Not found in current app tree | May have already been removed |
| Middleware `/leader` check | `src/middleware.ts` line 39, 66 | Remove leader from route checks after page deletion |
| `useSetlistStore` usage | 4 files | Can the hook be removed from all 4 files? |

### Zustand Store Architecture (Document Only -- Do Not Refactor)
| Store | Lines | Status | Phase to Refactor |
|-------|-------|--------|--------------------|
| `store.ts` | 279 | Active -- music player, transposition, zoom, AI chord scanner | Phase 3 (setlist view) |
| `monitor-store.ts` | 162 | Active -- mixer state | Phase 2 (monitor production) |
| `library-store.ts` | 90 | Active -- file library search/filtering | Phase 5 (library) |
| `annotation-store.ts` | 131 | Active -- per-file drawing annotations | No change planned |
| `chat-store.ts` | 89 | Active -- AI chat window state | No change planned |
| `alert-store.ts` | 45 | Active -- global system alert/banner | No change planned |
| `congregation-store.ts` | 97 | Active -- org config and feature flags | No change planned |
| `setlist-store.ts` | 63 | **DEAD** -- legacy, replaced by setlist-firebase.ts | Phase 1 (delete) |

## Open Questions

1. **Firestore Command Latency Under Load**
   - What we know: Firestore onSnapshot delivers updates "within milliseconds" per docs. Local writes benefit from latency compensation. The bridge throttles state writes to 10/sec.
   - What's unclear: The full round-trip time for a command (iPad -> Firestore -> bridge -> X32 -> bridge -> Firestore -> iPad) under realistic fader-drag load (20+ events/sec per user, multiple users).
   - Recommendation: Measure during PoC with actual Firestore project and X32 (or emulator). Define acceptable threshold: <200ms is imperceptible for fader control, >500ms is unusable. Document actual measurements.

2. **X32 Emulator for Day-to-Day Development**
   - What we know: The pmaillot X32 emulator (C language, handles OSC only, no audio) is the standard tool. Available at https://github.com/pmaillot/X32-Behringer, last updated 2024.
   - What's unclear: Whether it runs on Windows 11 without issues, whether it faithfully emulates the /xremote subscription model and /xinfo discovery broadcast.
   - Recommendation: Download and test as the first PoC task. If it doesn't work, write a minimal Node.js X32 mock that responds to the specific OSC addresses the bridge uses.

3. **Production PC vs. Raspberry Pi for Bridge Deployment**
   - What we know: Bridge is currently an Electron app targeting Windows. The production PC at the venue runs during services. A Pi would be always-on but requires separate hardware management.
   - What's unclear: Whether the production PC is reliable (does it sleep? restart?). Whether Electron's resource usage is acceptable on a Pi.
   - Recommendation: Default to production PC (Electron already configured). Document Pi as a fallback in the architecture decision doc. The bridge already handles wake detection (90s gap detection in heartbeat loop).

4. **Firestore Document Write Limits for State Updates**
   - What we know: Firestore recommends max 1 write/sec/doc for sustained workloads. Bridge writes state at 10/sec max (100ms throttle). The document holds full mixer state (~4KB).
   - What's unclear: Whether 10 writes/sec to a single document triggers rate limiting or cost concerns in practice.
   - Recommendation: Monitor Firestore console during PoC testing. If rate limiting occurs, the solution is delta-only writes (bridge already implements this via `scheduleDeltaWrite`). Could also split into one doc per bus if needed.

5. **sound_engineer Role Formalization for AUTH-04**
   - What we know: `soundEngineer` is a boolean flag on UserProfile, not a role in the hierarchy. The role hierarchy is admin > band_leader > musician > member > pending. Sound engineers get special access to matrix controls and bus assignments via `useMonitorAccess()`.
   - What's unclear: Whether AUTH-04 requires "sound engineer" to be a formal role in the hierarchy or if the current boolean flag approach is sufficient.
   - Recommendation: Keep the boolean flag approach. It's orthogonal to the role hierarchy (a musician can also be a sound engineer). The existing implementation in `useMonitorAccess()` and `auth-context.tsx` already handles this correctly. Document this as the design decision.

## Sources

### Primary (HIGH confidence)
- Existing codebase (`bridge/src/`, `src/lib/`, `src/types/`, `src/hooks/`) - Full source code review of all relevant files
- `src/lib/musician-profile.ts` and `src/lib/musician-profile.test.ts` - Instrument presets with full test coverage
- `bridge/package.json` - Electron 40.6.0, electron-builder 26.8.1, electron-updater 6.3.9

### Secondary (MEDIUM confidence)
- [Firebase Firestore real-time documentation](https://firebase.google.com/docs/firestore/query-data/listen) - onSnapshot latency characteristics
- [Firebase latency resolution guide](https://cloud.google.com/firestore/native/docs/resolve-latency) - Write rate best practices
- [electron-builder NSIS docs](https://www.electron.build/nsis.html) - One-click installer configuration
- [electron-updater auto-update docs](https://www.electron.build/auto-update.html) - Auto-update behavior

### Tertiary (LOW confidence -- needs validation during PoC)
- [pmaillot X32 Emulator](https://github.com/pmaillot/X32-Behringer) - X32 OSC simulator for development testing. Reported working as of 2024-2025, needs verification on Windows 11.
- Firestore write rate of 10/sec to single document - Needs load testing in PoC to confirm no throttling or cost issues

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are already in the project and working. No new dependencies needed.
- Architecture: HIGH - Bridge architecture, transport layer, and profile system are already implemented. Research is validation, not design.
- Pitfalls: HIGH - Most pitfalls are derived from direct code reading and known Firestore characteristics.
- Dead code inventory: HIGH - Direct grep/file analysis confirms import chains and usage.
- Latency characteristics: MEDIUM - Firestore docs confirm low-latency design, but actual measurements under this specific workload are needed (that's the point of the PoC).
- X32 emulator: LOW - Referenced as standard community tool but not yet tested in this project's environment.

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (30 days -- stable domain, no fast-moving dependencies)
