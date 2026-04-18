# Phase 1 Context: Monitor Research Spike + Code Audit

**Created:** 2026-03-07
**Phase Goal:** Answer every open question about X32 bridge architecture and identify all code cleanup work across the codebase. Build musician profiles as foundation for Phase 3 auto-transposition.

## 1. Bridge Research Direction

### Decisions
- **Current state:** A Firestore-based transport layer exists (bridge executable ↔ Firestore ↔ iPad). Never battle-tested in a real service. Latency characteristics unknown.
- **Research scope:** Evaluate alternatives (WebSocket, direct browser OSC, hybrid) alongside hardening the Firestore approach. Don't assume the current architecture is the answer — pick the best one.
- **Hardware target:** Open — research should recommend (production PC, Raspberry Pi, or other). Evaluate tradeoffs.
- **Install experience:** One-click installer. Download an .exe or .app, run it, done. No command line, no config files, no port forwarding.
- **Initial setup:** Setup code flow (admin generates 6-char code, bridge redeems for credentials) is acceptable as a one-time step.
- **Maintainer:** Either Daniel or the sound engineer — both technically capable enough to install, neither should need to troubleshoot.
- **Failure recovery:** Auto-recover silently. Bridge must reconnect on its own within seconds. Musicians see a brief "reconnecting" indicator at most. Zero manual intervention mid-service.
- **Bus layout:** 3-4 shared wedge monitor buses. Some musicians share a bus.

### Research Must Answer
1. What transport architecture (Firestore, WebSocket, hybrid, other)?
2. What deployment model (production PC, Raspberry Pi, other)?
3. What is the measured latency of each approach?
4. What is the install experience for each approach?
5. What failure modes exist and how does each approach auto-recover?
6. How does the bridge discover the X32 on the network?
7. What does the one-click installer look like technically?

## 2. Code Audit Depth

### Decisions
- **Scope:** Document + quick wins. Produce a detailed audit document AND delete obviously dead code (unused pages, deprecated routes, orphaned components). Save bigger refactors for later phases.
- **Store consolidation:** Plan now, execute later. Define the ideal Zustand store architecture in the audit doc. Actual refactoring happens during the phases that build features on those stores.
- **Aggressiveness:** Aggressive. If code is clearly unused or half-baked, recommend removing it. No users yet — no risk. Flag and recommend cuts.
- **Admin included:** Yes. Audit should identify which admin features are duct tape vs. essential. Recommend what to keep, cut, and simplify (feeds Phase 5).

### Current Store Inventory (for audit reference)
1. `store.ts` — Music player, file loading, transposition, zoom, AI chord scanner (279 lines)
2. `monitor-store.ts` — Mixer state, channels, buses, connection status (162 lines)
3. `library-store.ts` — File library search/filtering (90 lines)
4. `annotation-store.ts` — Per-file drawing annotations (131 lines)
5. `chat-store.ts` — AI chat window state (89 lines)
6. `alert-store.ts` — Global system alert/banner (45 lines)
7. `congregation-store.ts` — Org config and feature flags (97 lines)
8. `setlist-store.ts` — Legacy setlist state in localStorage (63 lines)

### Known Dead Code Candidates
- `/leader` route (deprecated, redirects to `/manage`)
- `/audio` page (minimal implementation)
- `/tasks` page (cut from v2 scope)
- `setlist-store.ts` (legacy, replaced by `setlist-firebase.ts`)
- Analytics admin components (cut from v2 scope)

## 3. Proof-of-Concept Bar

### Decisions
- **Format:** Use existing UI. The PoC runs through the actual FaderStrip, QuickMonitorPanel, and ConnectionIndicator components already in the app. Not a separate CLI or minimal page.
- **Test environment:** Both venue access (actual X32) AND a simulator/mock for day-to-day development. Research must identify or create an X32 simulator.
- **Install test:** Document install process to non-technical standard. Don't need actual user testing in Phase 1 — install UX gets polished in Phase 2.
- **Resilience testing:** Test BOTH bridge-side (ethernet disconnect) and client-side (WiFi drop on iPad) network interruptions. Both must auto-recover within seconds.

### PoC Must Demonstrate
1. Connect to X32 from the app via the chosen bridge architecture
2. Read a fader value and display it in FaderStrip
3. Set a fader value from FaderStrip and hear the change in the wedge
4. Survive a 30-second bridge-side network interruption (auto-recover)
5. Survive a 30-second client-side WiFi drop (auto-recover)
6. Show clear connection status via ConnectionIndicator throughout

## 4. Musician Profiles

### Decisions
- **Instruments per musician:** One primary instrument. Rare exceptions handled via manual override — no need for multi-instrument selector in profile.
- **Transposition model:** Standard instrument transposition as default (Bb trumpet = +2 semitones, Eb alto sax = +9, etc.). Profile stores instrument choice, app calculates interval. Musicians can override with a custom offset if their preference differs.
- **Where applied:** Everywhere. Musician sees their transposed key in the setlist overview (Phase 3) AND in the PDF chord overlays (existing transposition engine). Consistent experience.
- **Band instruments:** Mixed — includes transposing instruments (trumpet, sax, clarinet) alongside concert pitch instruments (guitar, keys, bass, vocals). Need to support the full standard range of orchestral transpositions.

### Profile Data Model (Phase 1 builds this)
- `instrument`: string (from predefined list with known transposition intervals)
- `transpositionOverride`: number | null (semitones, overrides instrument default if set)
- `displayName`: string
- Applied automatically via `PROF-02` — all views read from profile, no manual per-song transposition needed

## Code Context (from codebase scout)

### Existing Assets to Build On
- `src/types/monitor.ts` — Canonical monitor types (shared with bridge)
- `src/lib/firestore-monitor-client.ts` — Firestore transport layer (may be replaced or hardened)
- `src/lib/monitor-store.ts` — Zustand store for mixer UI state
- `src/hooks/use-monitor-connection.ts` — Singleton connection manager
- `src/hooks/use-monitor-access.ts` — Role-based monitor access control
- `src/components/monitor/` — 5 UI components (FaderStrip, MatrixPanel, QuickMonitorPanel, BusAssignmentPanel, ConnectionIndicator)
- `src/lib/auth-context.tsx` — Firebase auth with role derivation
- `src/lib/roles.ts` — Role hierarchy (admin > band_leader > musician > member > pending)
- `src/lib/music-math.ts` + `src/lib/chord-utils.ts` — Transposition engine (100% test coverage)

### Integration Points
- `src/lib/congregation-store.ts` — Feature flag `monitor: true` enables monitor mixer
- `src/app/api/bridge/setup-code/route.ts` — Bridge auth flow
- `src/lib/users-firebase.ts` — User profile CRUD (needs instrument/transposition fields)
- Bridge executable is a separate repo — type sync via `npm run check:types`

### Project Stats
- 155 React components
- 69 API routes
- 8 Zustand stores
- 18 custom hooks
- 90+ lib files

## Deferred Ideas
- Mix presets (save/recall personal mixes) — v2 feature
- Live follow mode (leader advances all views) — v2 feature
- Multi-instrument profile switching — not needed for launch

---
*Context captured: 2026-03-07*
