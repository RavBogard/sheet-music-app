# Monitor Overhaul — Phase 0 Wave 1 — Consumer Audit (iPad / MCP / rules)

**Lane:** P0-A2 (consumer audit) · **Owner:** coder-5 · **Tier 0, READ-ONLY**
**Base:** `origin/master` @ `70357f47f` (read in a master-pinned worktree; canonical cwd is on a stale WIP branch — not trusted)
**Companion:** coder-1 Lane P0-A1 bridge + data-model audit (`AUDIT-bridge.md`) — owns the bridge plane + the target state-contract proposal; this doc owns the consumer plane (how each reader/writer depends on the contract + what breaks).
**North Star (PROGRAM-SPEC §2):** a musician moves a fader on their iPad → it reaches the X32 **and** their screen shows accurate live state (own move confirmed, others' moves reflected, survives idle/reconnect/WiFi, multiple musicians concurrently).

---

## 0. TL;DR — the consumer-plane verdict

The **command path is healthy** on every consumer (iPad + MCP both append to `monitor-live/commands/pending`, the path the live-desk probe proved works — `b95715f13`). The **display/read path is structurally broken** by the three bridge state-write bugs, and the consumers **amplify** the breakage three different ways because there is **no shared, consistent contract for reading `monitor-live/state`**:

- **iPad** coerces a corrupted (array→map) `buses` with `Object.values` (`toArray`) → keeps surviving buses, silently **loses dropped ones**.
- **MCP `list_monitor_buses` / `get_matrix`** coerce with `safeArray` → a non-array becomes `[]` → **loses ALL buses/matrices**.
- **MCP `get_mix`** does **neither** → `state.buses.find` **THROWS** `i.buses.find is not a function` (the auditor BLOCK still live at `70357f47f`).

On top of that the consumer plane carries **one NEW high-severity bug the prior audits missed**: the **server-side `/monitor` access gate keys `busAssignments` by `user.uid` instead of by bus index** (`page.tsx:27`) → a plain musician assigned to their own IEM bus is **denied at the server and never even loads the mixer UI**. That is the North Star user, blocked before the bridge bugs ever matter.

Headline consumer findings: **C-1** (server-gate uid-key bug, HIGH, NEW), **C-2** (own-move never confirmed from authoritative state — the read-of-own-write UX manifestation, HIGH), **C-4** (3 inconsistent corrupted-state coercions incl. the live `get_mix` throw, HIGH), **C-6** (idle-staleness surfaced inconsistently across 3 thresholds; bridge-health prop unfed on the main route, MED).

---

## 1. Consumer inventory + contract-dependency map

The **state contract** every consumer depends on:
- **`config/monitor`** (doc): `{ busAssignments: Record<busIndexStr, BusAssignment|BusAssignment[]|null>, monitorBuses: number[], defaultChannels?: number[], bridge?: BridgeStatus }` — assignments + heartbeat. (`src/types/monitor.ts:10-27`)
- **`monitor-live/state`** (doc): `{ channels[], buses[], matrices[], config }` + an off-type `updatedAt`. The bridge writes it; **everyone reads fader/mute/name values from here.** (`src/types/monitor.ts:61-66`)
- **`monitor-live/commands/pending`** (collection): write-only command queue `{type, busIndex?, channelIndex?, matrixIndex?, value, uid, createdAt}`. (`src/types/monitor.ts:71-78`)

| Consumer | File | Reads | Writes | Contract dependency |
|---|---|---|---|---|
| iPad transport client | `src/lib/firestore-monitor-client.ts` | `monitor-live/state` (onSnapshot) | `commands/pending` (addDoc) | `state.{channels,buses[].sends,matrices}` must be arrays; `state.updatedAt` ignored |
| iPad store | `src/lib/monitor-store.ts` | (fed by client + config listener) | — | `buses[].index`, `buses[].sends[]`, `matrices[].index`, `config.busAssignments` |
| Connection mgr | `src/hooks/use-monitor-connection.ts` | `config/monitor` (onSnapshot) | — | `config.busAssignments`, `config.defaultChannels` |
| Access hook | `src/hooks/use-monitor-access.ts` | `config/monitor` | — | `config.busAssignments` (value-iterating, array-aware ✓) |
| **Server route gate** | `src/app/(main)/monitor/page.tsx` | `config/monitor` (admin SDK) | — | **`config.busAssignments` — keyed WRONG (C-1)** |
| Main mixer UI | `MonitorClient.tsx` + `MonitorTabs.tsx` | store | `commands/pending` (via client) | `buses.find(index===myBusIndex)`, `myBus.sends`, `matrices` |
| Fader widgets | `FaderStrip.tsx` / `VerticalFaderStrip.tsx` | `value` prop (authoritative) | `onChange` → command | own-move confirmation depends on `value` catching up |
| Perform-toolbar mixer | `QuickMonitorPanel.tsx` | store + `config.bridge` | `commands/pending` | only consumer wired to `config.bridge` health |
| Connection indicator | `ConnectionIndicator.tsx` | `status` + optional `bridgeStatus` | — | `bridge.lastSeen` 120s staleness |
| Health badge | `MonitorTabs.tsx` `HealthIndicator` | `store.lastSnapshotAt` | — | local 10s snapshot staleness |
| Bus-assign panel | `BusAssignmentPanel.tsx` | store.buses (names) + config | `config/monitor.busAssignments` (array form) | producer of the array shape the bridge can't read (F2) |
| Default-channel picker | `DefaultChannelPicker.tsx` | `config/monitor` | `config/monitor.defaultChannels` | — |
| MCP read tools | `src/lib/mcp/tools/monitor.ts` + `server-monitor.ts` | `config/monitor` + `monitor-live/state` | — | `state.buses`/`channels`/`matrices` array shape; `state.updatedAt` |
| MCP write tools | same | `config/monitor` + `monitor-live/state` (validation) | `commands/pending` (admin SDK) | validation coupled to `state.buses` (C-5) |
| Rules | `firestore.rules` | — | gate `commands/pending` create + `state`/`config` read | command **shape** only; models nothing about `state` array shape |

---

## 2. What breaks under each bridge bug (per consumer)

The three root bugs (PROGRAM-SPEC §1; coder-1 owns the bridge-side proof): **(A) read-of-own-write** (bridge never reflects a client/MCP write back into `monitor-live/state`), **(B) BR-02 idle-freeze** (no state heartbeat → idle state goes + stays stale), **(C) array→map delta corruption** (`update({"buses.N.fader":v})` turns the `buses` ARRAY into a MAP, dropping siblings).

### Bug A — read-of-own-write → the North Star failure (C-2)

The fader widgets seek confirmation from the authoritative `value` prop, which never arrives:

- `FaderStrip.tsx:36-41` / `VerticalFaderStrip.tsx:42-47`: clears `isPending` only when `|value − pendingValue| < 0.01` — i.e. when authoritative state catches up to the user's move. Under bug A it **never** does.
- `FaderStrip.tsx:44-52` / `VerticalFaderStrip.tsx:50-58`: a **2s safety timeout** then fires `setIsPending(false)` + `setDisplayValue(value)` — **snaps the fader back to the pre-move authoritative value**.
- **But** the consumers also apply an **optimistic store write** alongside the command (`MonitorClient.tsx:90-106`, `QuickMonitorPanel.tsx:59-75` call `updateBusFader`/`updateSendLevel` AND `client.setX`). The store optimistic update (`monitor-store.ts:159-198`) re-renders `myBus.fader = newVal` → the `value` prop equals `pendingValue` → the pending-clear (`FaderStrip.tsx:37`) fires immediately and the snap-back never triggers — **as long as no real snapshot arrives.**
- The trap: the **next** authoritative `monitor-live/state` snapshot (someone else's move, or any resync) flows through `setSnapshot` (`monitor-store.ts:148-156`) and **overwrites `buses` wholesale** with the bridge's state, which — under bug A — **does not contain the user's own move**. `value` reverts → `FaderStrip.tsx:29-33` (`!dragging && !pending`) → `setDisplayValue(value)` → **the user's own fader jumps back to where it was.** `shallowEqualArray` (`monitor-store.ts:136-146`) does not save it: the optimistic array differs from the reverted bridge array, so the store updates.

**Net North-Star defect:** own moves are a **local fiction** that survives only until the next snapshot, then revert — never **confirmed from authoritative state**. On an idle desk (no snapshots, bug B) the fiction persists and looks fine until reconnect; on an active desk it gets clobbered. Either way the iPad display is not trustworthy. This is the consumer face of read-of-own-write and is the single most important thing Phase 1's **query-after-command confirmation** must fix (so the bridge writes back the confirmed value and `value` legitimately catches up).

### Bug B — idle-freeze → stale display shown as healthy (C-6)

When the bridge stops writing state, **no snapshot arrives**, so `firestore-monitor-client` never fires `onStateUpdate`:
- `store.lastSnapshotAt` freezes → `MonitorTabs` `HealthIndicator` (`MonitorTabs.tsx:36-70`) flips to **"Stale"** after **10s**. ✓ (this one is honest, main route only).
- `ConnectionIndicator` (`MonitorClient.tsx:150/158/172/225`, `MonitorTabs.tsx:104`) is passed **`status` + `error` only — never `bridgeStatus`** → its bridge-offline / mixer-disconnected branches (`ConnectionIndicator.tsx:68-75`) are **dead on the main route**; it shows green **"Connected"** as long as the Firestore listener is alive, regardless of whether the desk is frozen.
- The fader values themselves are **shown without any staleness affordance** — `FaderStrip` renders the frozen `value` as if live. A musician sees a plausible, wrong level.
- MCP read tools DO surface it: `stateAgeSeconds` / `stateStale` on the `bridge` block (`monitor.ts:104-118`, threshold 90s `server-monitor.ts:90`) — shipped `70357f47f`. **But the iPad never consumes `stateStale`.**

→ **Three different staleness thresholds across the surface** (HealthIndicator **10s** local-snapshot · MCP **90s** state.updatedAt · ConnectionIndicator **120s** config heartbeat) from **three different sources**, and the richest signal (state.updatedAt age) is **MCP-only**. The iPad fader UI itself has no per-value staleness cue.

### Bug C — array→map corruption → three inconsistent failures (C-4)

The same corrupted `monitor-live/state.buses` (a MAP like `{ "5": {…} }` after a dot-path delta) is handled three different ways:

1. **iPad** — `firestore-monitor-client.ts:98-106` `toArray` = `Array.isArray ? v : Object.values(v)` → returns the **surviving** buses (e.g. just bus 5), **silently dropping** the rest. Downstream:
   - `MonitorClient.tsx:195` `buses.find(b => b.index === myBusIndex)`. If the user's bus survived → they see their bus but the engineer view + matrices lose the dropped ones. If the user's bus was **dropped** → `myBus` undefined → `MonitorClient.tsx:196-211`: `buses.length > 0` so it renders an **infinite spinner** ("Bus index mismatch") that never recovers under bug B (no resync coming).
2. **MCP `list_monitor_buses` / `get_matrix`** — `monitor.ts:150-155` / `354-359` `safeArray` = `Array.isArray ? x : []` → a corrupted MAP yields **`[]`** → returns **zero buses/matrices** (loses everything, unlike the iPad which keeps survivors).
3. **MCP `get_mix`** — `monitor.ts:266` `state.buses.find(...)` is **raw, un-guarded** → on a non-array it **THROWS** `i.buses.find is not a function`, surfaced as an uncaught 500. `get_mix:273` (`state.buses.map`), `:279` (`for…of state.channels`), `:285` (`bus.sends.map`) are likewise raw. **This is the live auditor BLOCK on `monitor-state-staleness-guard` and is STILL OPEN at `70357f47f`** (PROGRAM-SPEC §8; coder-4 down-payment pending).

→ There is **no shared coercion/validation of the corrupted shape** — `toArray` (keep survivors) vs `safeArray` (drop all) vs raw (throw). Phase 1's full-state-write contract removes the corruption at the source, but the consumer plane should converge on **one** defensive read helper so a future bad write degrades identically everywhere.

---

## 3. MCP defects (with evidence)

- **MCP-D1 [HIGH, OPEN] `get_mix` throws on corrupted/non-array state.** `monitor.ts:266` `state.buses.find` (+ `:273`, `:279`, `:285`) bypass the `safeArray` guard the sibling tools use. On the live corrupted shape → `i.buses.find is not a function` → uncaught 500. Auditor BLOCK on `70357f47f`; the get_mix path was the one place the staleness-guard lane forgot to wrap. **Fix (PROGRAM-SPEC §8 down-payment):** `safeArray` before `.find`/`.map`, plus a regression test that feeds the **non-array** `buses` shape (the emulator's fresh-array fixture missed it — see `mcp-monitor-defensive.test.ts`, which covers list/matrix but not the get_mix bus path).
- **MCP-D2 [HIGH, OPEN] write/read validation coupled to corrupted live-state, not owned-buses/config.** `preflightBusWrite` (`monitor.ts:426-445`) reads `state.buses` and rejects with `invalid_bus_index` / `validBusIndices:[…]` if the index isn't present **in the live snapshot**. Under bug C the snapshot dropped the user's owned bus → `safeArray` makes `validBusIndices` empty (or partial) → the user **owns bus 3 per `config/monitor` but is told it's "not active"** and the write is refused, even though the command path itself works. Same coupling in `get_mix` (`monitor.ts:266-276` requires the bus present in state). **Fix (PROGRAM-SPEC §4):** validate against `getOwnedBuses(config)` / `config.monitorBuses` (the authoritative assignment source — `server-monitor.ts:158-170`), reserving live-state checks for a soft "not currently visible on the desk" warning, not a hard refuse.
- **MCP-D3 [MED, OPEN] no readable command result → both AI and UI are blind to rejection.** `enqueueCommand` returns `{id}`; every write returns `{ok:true, commandId, confidence:"queued"}` (`monitor.ts:568,604,633,…`) — honest about "queued ≠ applied" (R-2, shipped `62a287f06`), but **nothing reads the outcome**; rules forbid client reads of `pending` (`firestore.rules:408`). So a bridge-rejected command (e.g. the F2 array case) still returns `ok:true`, and the iPad's only failure signal is the 2s snap-back. **= lane2 F4** (dedupe). Phase 2's `get_command_status` (R-1) + a uid-scoped result doc closes it.
- **MCP-D4 [LOW, OPEN] no `assign_monitor_bus` / `unassign_monitor_bus`.** v1 scope (decisions.md 2026-05-18) named bus-assignment writes; the UI (`BusAssignmentPanel`) can, the MCP can't. **= lane2 F5** (dedupe).
- **MCP-S (positive, keep):** rich error envelope + `isPrivileged`/`myAssignedBuses` context (lane2 S-1/S-2), `get_mix` name-joined sends (S-3), honest fire-and-forget descriptions (S-4), `stateAgeSeconds`/`stateStale` (`70357f47f`). Do not regress.

---

## 4. Rules dependency (firestore.rules monitor blocks)

- `config/monitor` (`firestore.rules:216-220`): read `isSignedIn`, write `isAdmin() || isSoundEngineer()`. Bridge heartbeat writes via admin SDK (rules bypassed).
- `monitor-live/state` (`firestore.rules:385-388`): read `isSignedIn`, write `false` (bridge admin SDK only). Rules model **nothing** about the array shape of `state.buses` — they cannot prevent the array→map corruption (it's an admin-SDK write); the contract integrity must live in the bridge writer + consumer defense. **= lane2 F6** (`state` readable by no-access roles — LOW, dedupe).
- `monitor-live/commands/pending` create (`firestore.rules:407-430`): post-F1 (`c0b2342a2`) requires `isMember() || isSoundEngineer()` + self-attribution (`uid == auth.uid`) + the `type` allowlist + matrix gate (`set_matrix_* ⇒ isAdmin()||isSoundEngineer()`) + `hasOnly([...])` closed field set + per-field type checks. **This is the consumer-facing half of authZ; per-bus ownership stays at the bridge** (the authoritative gate — lane2 F1, monitor-audit-2 `22b5e1f1b`). Rules are authN + attribution + shape; **not** an authZ layer for per-bus ownership. F1/F7 from lane2 are **FIXED** here (`c0b2342a2`).
- **Consumer consequence:** because the rules enforce `isMember()`, the iPad command path requires a real role — consistent with `useMonitorAccess`. No new rules defect found in this lane beyond the already-shipped F1 hardening.

---

## 5. Findings register (consumer plane)

| ID | Sev | Status | Title | Evidence |
|---|---|---|---|---|
| **C-1** | **HIGH** | **OPEN (NEW)** | Server `/monitor` gate keys `busAssignments` by `user.uid`, not bus index → musician with an assigned bus **denied at the server, never loads UI** | `page.tsx:27` `config.busAssignments?.[user.uid]` — map is keyed by bus index string; uid never matches → `hasAccess` stays false → "Monitor Access Denied" (`page.tsx:34-44`). Client `useMonitorAccess:59-67` does it correctly (value-iterating), so the perform-toolbar `QuickMonitorPanel` lets the same user in — **inconsistent gating**. Blocks the North Star user pre-bridge. |
| **C-2** | **HIGH** | OPEN (Phase 1 target) | Own fader move never confirmed from authoritative state; reverts on next snapshot (read-of-own-write UX) | `FaderStrip.tsx:29-52`, `VerticalFaderStrip.tsx:34-58`, `monitor-store.ts:148-156`, `MonitorClient.tsx:90-106` — see §2 Bug A |
| **C-3** | MED | OPEN | 2s safety snap-back fights optimistic UI; on a slow round-trip the fader visibly reverts then re-applies | `FaderStrip.tsx:44-52` / `VerticalFaderStrip.tsx:50-58` (fixed 2000ms, no awareness of `stateStale`) |
| **C-4** | **HIGH** | partly OPEN | 3 inconsistent corrupted-`buses` coercions: iPad `toArray` keeps survivors, MCP `safeArray` drops all, `get_mix` raw **throws** | `firestore-monitor-client.ts:98-106`; `monitor.ts:150-155/354-359` vs `monitor.ts:266`; downstream infinite spinner `MonitorClient.tsx:196-211`. **get_mix throw = live auditor BLOCK, OPEN @ 70357f47f** |
| **C-5** | HIGH | OPEN (Phase 1 target) | MCP validation refuses writes/reads to an owned bus when corruption drops it from live-state | `monitor.ts:426-445` (`preflightBusWrite` → `invalid_bus_index`), `monitor.ts:266-276` (`get_mix`). Should validate vs `getOwnedBuses`/`config.monitorBuses` (`server-monitor.ts:158-170`) |
| **C-6** | MED | partly OPEN | Idle-staleness surfaced inconsistently (10s/90s/120s, 3 sources); `ConnectionIndicator` bridge-health prop **unfed on the main route**; faders show frozen values with no cue | `MonitorTabs.tsx:36-70` (10s) vs `monitor.ts:90` (90s) vs `ConnectionIndicator.tsx:14-30` (120s); `MonitorClient.tsx:150/172/225` + `MonitorTabs.tsx:104` pass no `bridgeStatus`. MCP `stateStale` shipped `70357f47f` but iPad ignores it |
| **C-7** | MED | OPEN | Dual `myBusIndex` derivation race: `setSnapshot` (from `state.config.busAssignments`) vs `setConfig` (from `config/monitor`) can disagree | `monitor-store.ts:124-126` vs `:222-230`. Bridge-embedded `state.config` may be stale/missing (client note `firestore-monitor-client.ts:137-140` already excludes it for defaultChannels) → snapshot can null/flip a correct bus |
| **C-8** | LOW | OPEN (by design, masks) | Stale-while-revalidate freezes last-good on empty snapshot — resilience, but masks corruption (combines with C-4) | `monitor-store.ts:113-122` |
| **C-9** | LOW | OPEN | `_lastCommandError` captured but never surfaced; no UI "command failed" affordance | `firestore-monitor-client.ts:303-311` (`_lastCommandError` getter unused by any component) |
| **C-10** | — | DEDUPE | F2 producer side confirmed: `BusAssignmentPanel.saveAssignments` always writes the **array** form (`:67-69`) the bridge `getUserBus` can't read | cross-ref lane2 F2 / monitor-audit-1 BR-04 — bridge fix shipped `a5d35f47f`; verify consumer/bridge now agree |
| C-11 | LOW | DEDUPE (lane2 F8) | `if (!myBusIndex) return` treats bus index 0 as "no bus" | `MonitorClient.tsx:91/97/103`, `QuickMonitorPanel.tsx:60/66/72/124` |
| C-12 | NOTE | DEDUPE (lane2 F9) | No "user is dragging" suppression on snapshot apply → cross-device push can yank an in-flight drag | `monitor-store.ts:148-156`; mitigated locally by C-2's optimistic path |

---

## 6. iPad UX gaps vs the North Star

1. **Own-move confirmation (C-2):** the keystone gap. Today: optimistic-only, reverts on next snapshot, no "confirmed" state. Need: bridge query-after-command (Phase 1) **and** a fader state machine that distinguishes optimistic → confirmed → reverted (the widget already has `isPending`; it needs a real "confirmed" signal instead of the 2s timeout).
2. **Others'-change reflection:** works mechanically (snapshot → `setSnapshot` → re-render) **when** the bridge writes state; dead under bug B (idle-freeze) — another musician's change won't show until a snapshot arrives. Depends on Phase 1's state heartbeat.
3. **Staleness / offline / reconnect UX (C-6):** main route has a 10s "Stale" badge (good) but the **faders still render frozen values with no per-control cue**, and bridge-offline/mixer-disconnected is invisible on the main route (prop unfed). `DisconnectedOverlay` ("Mixer offline — last known levels", `ConnectionIndicator.tsx:115-132`) **exists but has no caller** — a ready-made affordance that's never mounted. Reconnect itself is solid: `use-monitor-connection.ts` ref-counted singleton + 3s auth-null debounce (`:139-161`) + 5s unmount debounce (`:227-233`) + `visibilitychange` reconnect (`:170-175`) — genuinely well-built for iPad tab suspension (lane2 §3.3 corroborated).
4. **Multi-musician concurrency:** each iPad only writes its owned bus (gated by `myBusIndex` + rules `isMember` + bridge ownership). No client-side cross-talk risk found; the risk is **state correctness** under concurrent writes (read-of-own-write means iPad A never sees iPad B's confirmed value until a snapshot, and the snapshot may be frozen). Concurrency correctness is gated on Phase 1 + Phase 2.
5. **Latency feel:** optimistic write makes the local case feel instant (`~100ms` widget throttle `FaderStrip.tsx:55-73`, `50ms` client command throttle `firestore-monitor-client.ts:35`, `150ms` snapshot debounce `:39`). The bite is cross-device + the revert. **No measured baseline exists** — Phase 0 should capture command-enqueue→state-reflect round-trip latency once Phase 1 makes readback real (PROGRAM-SPEC §6 latency targets are deferred to measured baselines).
6. **Single-bus UI (C-11):** a multi-bus owner sees only their first bus (`myBusIndex` is scalar); fine for the band today, latent for shared/co-owned wedges.

---

## 7. Dedupe against prior audits (SHAs cited; fixed vs open)

| Prior finding | Source | Status @ `70357f47f` |
|---|---|---|
| Firestore-as-bus is the right transport for ≤6 iPads | monitor-audit-1 `c2c45b6f4`, monitor-audit-2 `22b5e1f1b` §3.7 | **Affirmed** — consumer plane corroborates; keep (PROGRAM-SPEC §4 hybrid keeps it) |
| F1 — authZ only at bridge; rules non-authoritative | lane2 `22b5e1f1b` F1 | **FIXED** (rules hardened `c0b2342a2`: `isMember()` + matrix gate + `hasOnly`; bridge comment corrected). Bridge remains the per-bus authoritative gate (by design) |
| F2 — `busAssignments` array shape bridge can't read → musician's fader silently rejected | lane2 F2 / monitor-audit-1 BR-04 | **FIXED bridge-side** `a5d35f47f` (getUserBus array-aware + check:types CI). Consumer producer still writes array (`BusAssignmentPanel:67-69`) — now compatible. **Verify** C-1 doesn't re-block the same user at the server gate (independent bug) |
| F3 — unbounded command-queue growth + restart replay | lane2 F3 | **OPEN** (bridge-side; Phase 2) |
| F4 — no readable command ack / result | lane2 F4 | **OPEN** = MCP-D3 (Phase 2 `get_command_status` R-1) |
| F5 — no `assign_monitor_bus` MCP tool | lane2 F5 | **OPEN** = MCP-D4 |
| F6 — `monitor-live/state` readable by no-access roles | lane2 F6 | **OPEN** (LOW, accepted; tighten to `isMember()` if roster exposure matters) |
| F7 — loose command-create rule (no hasOnly/per-type) | lane2 F7 | **FIXED** `c0b2342a2` (`hasOnly` + type checks) |
| F8 — `!myBusIndex` treats bus 0 as "no bus" | lane2 F8 | **OPEN** = C-11 |
| F9 — snapshot apply yanks in-flight drag | lane2 F9 | **OPEN** = C-12 |
| F-1 write-drop is real = read-of-own-write + idle-freeze + array→map | monitor-f1-probe `b95715f13` | **Confirmed root**; consumer manifestations = C-2/C-4/C-6 |
| Cowork F-3 (R-12) invalid_channel 500→400 | mixer-MCP cowork audit → `62a287f06` | **FIXED** (`monitor.ts:482-492`) |
| Cowork F-4 (R-13) schema bounds (busIndex≤5, channelIndex≤32) | cowork → `62a287f06` | **FIXED** |
| Cowork F-5 dynamic channel hint `{index,name,active}` | cowork → `62a287f06` | **FIXED** (defensive; `monitor.ts:467-476`) |
| Cowork F-6 (R-11) additive `muted` on get_mix/get_matrix | cowork → `62a287f06` | **FIXED** (`monitor.ts:290,364`; `on` KEPT for iPad) |
| Cowork F-7 (R-14) `active` on list_monitor_buses | cowork → `62a287f06` | **FIXED** (`monitor.ts:48-59,159`) |
| Cowork R-2 `confidence:"queued"` on writes | cowork → `62a287f06` | **FIXED** |
| Cowork R-3 ack-derived x32Connected + stateAge | cowork / f1-probe rec 3 | **PARTIAL** — app-side `stateAgeSeconds`/`stateStale` shipped `70357f47f` (MCP only); ack-derived `x32Connected` is bridge-side OPEN (Phase 2). **iPad does not consume `stateStale` (C-6)** |
| get_mix throw on corrupted state | auditor BLOCK on `70357f47f` | **OPEN** = MCP-D1/C-4 (coder-4 down-payment pending) |

---

## 8. Implications for the Phase-1 target state-contract (consumer requirements)

Consumer-plane requirements the contract (coder-1 proposes the bridge-side shape) must satisfy:

1. **`buses`/`channels`/`matrices` stay well-typed arrays, written whole** (full-state writes, PROGRAM-SPEC §4) → eliminates C-4 at the source; consumers can then drop the divergent `toArray`/`safeArray`/raw handling for **one** shared guard.
2. **Query-after-command confirmation** so `monitor-live/state` reflects MCP/iPad-driven moves → makes the fader `value` legitimately catch up → C-2 + C-3 resolve; the widget's `isPending`→confirmed transition becomes real instead of a 2s guess.
3. **State heartbeat** (periodic full resync) → idle never freezes → others'-change reflection + C-6 honest; consumers should then **consume `stateStale`** uniformly (iPad ConnectionIndicator + fader cue), collapsing the 10s/90s/120s thresholds toward one source (`state.updatedAt`).
4. **MCP validation against owned-buses/config, not live-state** (C-5/MCP-D2) — independent of the bridge change, can land with Phase 1.
5. **C-1 is a standalone consumer fix** (server gate key) and should be fixed early — it blocks the North Star user regardless of the contract.
6. **A readable command result** (uid-scoped) for MCP-D3/F4 — Phase 2, but the contract should reserve the doc shape now.

---

## 9. FACTS vs INFERENCES

**FACTS** (read at `70357f47f` in the master-pinned worktree):
- All `file:line` evidence above (iPad client/store/hooks/components, route `page.tsx`, MCP `monitor.ts`/`server-monitor.ts`, `firestore.rules`, `types/monitor.ts`).
- `page.tsx:27` indexes `config.busAssignments` by `user.uid`; the type + every other reader key it by bus-index string (C-1).
- `get_mix` (`monitor.ts:266`) uses raw `state.buses.find`; `list_monitor_buses`/`get_matrix` use `safeArray`; the iPad uses `toArray` (Object.values) (C-4).
- `MonitorClient`/`MonitorTabs` pass `ConnectionIndicator` only `status`+`error`, never `bridgeStatus` (C-6); `DisconnectedOverlay` has no caller.
- Rules F1/F7 are fixed (`c0b2342a2`); cowork F-3..F-7/R-2 are fixed (`62a287f06`); staleness guard fields are present (`70357f47f`).

**INFERENCES (need the live desk / coder-1 bridge confirmation):**
- That C-1 actually denies a *prod* musician hinges on a plain musician (non-admin, non-SE) being assigned a bus via the panel; per `[[project_band_ipad_hardware]]` the band isn't onboarded, so C-1 is **latent-but-blocking for the IEM rollout** (like F2) — but it is a definite code bug, not a maybe.
- The exact runtime shape of prod `monitor-live/state.buses` under the current frozen bridge (array vs map) determines whether C-4's get_mix throw is firing *right now* — f1-probe (`b95715f13`) read `get_mix(5)` successfully at probe time, so the live `buses` was an array then; the throw reproduces on the **corrupted** shape, which a dot-path delta produces (coder-1 confirms the bridge write path).
- Latency baselines (PROGRAM-SPEC §6) are unmeasured; deferred to Phase 0 harness (coder-5 Lane P0-B2) once readback is real.
- Bridge-side mechanics of read-of-own-write / idle-freeze / corruption are coder-1's plane (`AUDIT-bridge.md`); this doc consumes them as inputs.
