# Monitor-mix control — App / MCP API / Authz control-plane audit (Lane monitor-audit-2)

**Author:** coder-2 · **Base:** `origin/master` @ `b7b5bb4d8` · **Date:** 2026-05-21
**Scope:** cloud/client plane only — MCP tool surface, iPad `/monitor` UI, command/state
contract, and the cross-layer **security/authz model**. Bridge transport mechanics + X32 layer +
latency budget are **Lane 1 (coder-1)**'s; I reference the bridge as an input and own the
cross-layer verdict. READ-ONLY: zero code changes; recommendations only.

---

## TL;DR

**Authz verdict — the bridge is the SOLE authoritative authorization gate.** `firestore.rules`
authenticates the writer and pins command attribution (`uid == auth.uid`) and the command *shape*,
but it performs **no ownership and no privilege check**. Any signed-in user — including a brand-new
`pending`/`member` account with no monitor access — can write *any* command for *any* bus or matrix
output straight to `monitor-live/commands/pending` via the already-initialized Firebase Web SDK,
fully bypassing the MCP layer's `assertMonitorAccess`/`canControlBus`. The only thing standing
between that write and the X32 is the bridge's `isCommandAuthorized`. The model is coherent **only
because** the bridge re-checks — and the bridge's own comment (`firestore-transport.ts:321-323`)
*inverts* this reality, calling itself "defense-in-depth" and claiming "we trust that the Firestore
security rules enforce this." They don't. This is a fragile single-point design and a dangerous
mislabel, but **not** an active privilege-escalation today (the bridge rejects the dangerous cases).

**The 3 biggest issues:**

1. **[HIGH · security] Authz lives only in the bridge** — rules don't enforce ownership/privilege;
   MCP enforcement is bypassable by direct SDK write. (F1)
2. **[HIGH · contract/correctness] `busAssignments` schema has diverged** between the canonical
   app/MCP type (array-capable) and the bridge type (single-only). The shipped in-app assignment
   UI **always** writes the array form, which the bridge's `getUserBus` cannot read — so a plain
   musician assigned to their own IEM bus is silently **rejected by the bridge** (`Unauthorized`),
   with the error written to a doc the client is forbidden to read. This is the user-felt "my
   fader does nothing" bug waiting for the IEM rollout. (F2)
3. **[MED · security/availability] Unbounded command-queue growth + restart-replay** — rejected and
   timed-out commands are error-marked but **never deleted**, and there is no rate-limit on creates;
   on bridge restart the whole backlog replays. (F3)

---

## §3.1 Authz model — the three-layer trace (headline)

Tracing one write command — `set_bus_master` for `busIndex: 2` — across all three layers.

### Layer 1 — MCP (`src/lib/mcp/tools/monitor.ts` + `server-monitor.ts`)

`setBusFader` → `preflightBusWrite` (monitor.ts:469-484, 301-361):
- `assertMonitorAccess` (server-monitor.ts:82-108): grants if `isPrivilegedMonitor` (role==admin OR
  `soundEngineer===true`) **OR** `getOwnedBuses(config, uid).length > 0`.
- `canControlBus` (server-monitor.ts:116-122): `isPrivilegedMonitor || ownedBuses.includes(busIndex)`.
- F-018 live-index validation (monitor.ts:322-346) → `enqueueCommand` writes
  `{type, busIndex, value, uid, createdAt}` to `monitor-live/commands/pending` (server-monitor.ts:145-160).

**Verdict at L1:** ownership + privilege are enforced **correctly and completely** here.
`getOwnedBuses` (server-monitor.ts:58-70) correctly handles both single-object and array
(co-owned) assignment forms. This is the well-built layer.

### Layer 2 — Firestore rules (the bypass surface)

`match /monitor-live/commands/pending/{commandId}` create rule (`firestore.rules:392-410`):

```
allow create: if isSignedIn()
              && request.resource.data.uid == request.auth.uid
              && request.resource.data.createdAt is number
              && request.resource.data.type in ['set_bus_master','set_send_level',
                   'set_send_on','set_matrix_fader','set_matrix_on']
              && (!('busIndex' in ...)     || ...busIndex is int)
              && (!('channelIndex' in ...) || ...channelIndex is int)
              && (!('matrixIndex' in ...)  || ...matrixIndex is int)
              && (!('value' in ...)        || ...value is number || ...value is bool);
```

What it enforces: **authentication** (`isSignedIn()` = `request.auth != null`, firestore.rules:7-9 —
*any* role, including `pending`/`denied`/`member`), **attribution** (you can't forge another user's
`uid`), and a **type/shape allowlist**.

What it does **NOT** enforce: bus **ownership**, matrix **privilege**, or even minimum role. It does
not consult `config/monitor.busAssignments` at all. So a signed-in non-privileged user can create:

```js
// devtools on any authenticated app page — db/auth already initialized
addDoc(collection(db, "monitor-live", "commands", "pending"), {
  type: "set_matrix_fader",          // FOH-only via MCP; FOH-only at the bridge
  matrixIndex: 1, value: 0,
  uid: auth.currentUser.uid, createdAt: Date.now(),
})
```

This passes the rules. MCP's `assertMonitorAccess`/`isPrivilegedMonitor` were never invoked.

### Layer 3 — Bridge (`bridge/src/firestore-transport.ts:320-349` — Lane 1's plane, referenced)

`isCommandAuthorized`: fetches the user doc, sets `isEngineer = role==admin || soundEngineer===true`;
then `set_matrix_*` → `return isEngineer`; bus commands (`busIndex !== undefined`) →
`return isEngineer || userBus === cmd.busIndex`; else `return false`. Unauthorized →
`batch.update(ref, {error:"Unauthorized"})` and **no execution** (transport:242-245).

**This is the authoritative ownership/privilege gate.** The example matrix write above is rejected
here (`isEngineer` false) → X32 untouched. So no escalation in practice.

### The authoritative-gate verdict

| Property                       | MCP | Firestore rules | Bridge |
|--------------------------------|:---:|:---------------:|:------:|
| Authentication                 |  ✓ (bearer) | ✓ | ✓ (user doc) |
| Attribution (`uid` = caller)   |  ✓  | ✓ | — |
| Command shape / type allowlist |  ✓ (Zod) | ✓ (loose) | partial |
| **Bus ownership**              |  ✓  | **✗** | ✓ (auth. gate) |
| **Matrix privilege**           |  ✓  | **✗** | ✓ (auth. gate) |
| Live-index validity (F-018)    |  ✓  | ✗ | ✗ |

**The bridge is the single authoritative authorization gate. `firestore.rules` is authN + attribution +
schema only — it is *not* an authZ layer for monitor commands, despite the bridge comment implying it
is.** The MCP layer enforces authZ correctly but is one of several producers and is bypassable. This
is internally *coherent* (the dangerous paths are caught), but it is **fragile** (one un-unit-tested
bridge function is the whole gate) and **mislabeled** (the bridge thinks it's redundant when it's
primary). See F1.

**Is `allow read: if isSignedIn()` on `monitor-live/state` acceptable?** (firestore.rules:385-388.)
Low-sensitivity, band-internal data (channel/bus names, fader values, who-is-on-which-bus). It is
broadly in line with the existing soft-public chart-access posture. The only sharp edge: `pending`,
`denied`, and `member` users — who have *no* monitor access anywhere else — can still read the full
mixer snapshot + assignments. Acceptable for now; tighten to `isMember()` if assignment-roster
exposure is ever a concern (F6).

---

## Findings

### F1 — [HIGH · security] Monitor authZ exists only at the bridge; rules + MCP are bypassable/non-authoritative
`firestore.rules:392-410` does no ownership/privilege check; MCP enforcement (`monitor.ts`/
`server-monitor.ts`) is correct but bypassable via direct SDK write. The bridge
(`firestore-transport.ts:320-349`) is the only real gate, yet its comment (321-323) says the rules
enforce ownership and frames itself as "defense-in-depth." **Risk:** if anyone trusts that comment
and trims the bridge check, the system is wide open; today the risk is the fragility + the
DoS/cost surface (F3) rather than active escalation.
**Recommend (fix-now):** move the *cheap, high-value* half of authZ into the rules so the bridge is
genuinely defense-in-depth, not the sole gate: (a) require `isMember()` (real role, not just
`isSignedIn()`); (b) restrict `set_matrix_*` to `isAdmin() || isSoundEngineer()` *in the rule*
(matrix is the most dangerous primitive and needs no per-bus data lookup). Per-bus ownership in
rules is harder (needs `get(/config/monitor)` + array membership, which CEL handles awkwardly) —
keep that at the bridge but **fix the comment** to state the bridge is the authoritative bus gate.
Effort: M. Impact: HIGH.

### F2 — [HIGH · contract/correctness] `busAssignments` schema diverged; bridge can't authorize the array form the UI writes
- Canonical type: `src/types/monitor.ts:15` → `Record<string, BusAssignment | BusAssignment[] | null>`.
- Bridge mirror: `bridge/src/types.ts:15` → `Record<string, BusAssignment | null>` (**no array**).
- The canonical file header (`src/types/monitor.ts:1-6`) claims the bridge file "mirrors this file"
  and is verified by `npm run check:types` — **the invariant is broken; the two have drifted.**
- The shipped in-app assignment UI **always** writes the array form: `BusAssignmentPanel.tsx:67-69`
  (`newAssignments[busIdx] = assignments.length > 0 ? assignments : null`), even for a single user.
- The bridge's `getUserBus` (`bridge/src/config.ts:117-122`) reads `assignment.userId` directly off
  the value; for an array that is `undefined` → the bus is skipped → returns `null`.
- Net: a non-engineer musician assigned via the current UI gets `userBus = null` →
  `isCommandAuthorized` returns `false` for their *own* bus → command `Unauthorized`, never executed.
  The error is written onto the pending doc which the client is forbidden to read
  (`firestore.rules:393` `allow read: if false`) → **silent failure**.
- The client (`monitor-store.ts:34-43 findUserBus`), the access hook
  (`use-monitor-access.ts:61-67`), and MCP (`getOwnedBuses`) all handle the array form — only the
  bridge does not. So the iPad shows the fader, the user drags it, optimistic UI moves, and the X32
  never responds. This is the headline user-felt bug for the IEM rollout.
**Repro (needs prod-PC / Lane 1 to confirm at the running bridge):** assign a plain musician to a bus
via `/monitor` BusAssignmentPanel → that musician opens `/monitor`, drags their bus fader → X32
unchanged; bridge logs `Unauthorized command from <uid>`; pending doc carries `error:"Unauthorized"`.
**Recommend (fix-now, mechanics = Lane 1):** make `getUserBus`/`isAuthorized` array-aware (mirror
`getOwnedBuses`), update `bridge/src/types.ts` to the array-capable type, and **run `npm run
check:types`** — it should currently be failing. Flip the emulator seed to the array form (F10) so
this can't regress. Effort: S. Impact: HIGH.

### F3 — [MED · security/availability] Unbounded queue growth + restart-replay; no create rate-limit
- Unauthorized (`transport:242-245`) and timed-out (`transport:248-251`) commands are
  `batch.update`-marked with `error` and **never deleted** — only authorized-executed (310) and
  obsolete (266) commands are deleted.
- The listener only acts on `change.type === "added"` (transport:178), but a fresh listener on
  restart fires the *initial* snapshot with every existing doc as `added`
  (`.orderBy("createdAt").onSnapshot`, transport:173-181) → the entire never-deleted backlog
  re-queues and re-processes on every bridge restart (re-auth + re-staleness, cost only — stale
  ones don't re-execute, so no safety break, but the docs stay forever).
- `firestore.rules:394` permits unlimited creates per signed-in user → a buggy or hostile client
  floods `monitor-live/commands/pending`; combined with the no-delete behavior the collection grows
  without bound and replays on restart.
**Recommend:** bridge should `delete` (not just error-mark) unauthorized/timeout docs; add a
Firestore **TTL policy** on `monitor-live/commands/pending`; consider a coarse per-uid create
throttle (bridge-side counter, or a `createdAt`-window guard) since CEL rules can't rate-limit
cleanly. Effort: S-M. Impact: MED.

### F4 — [MED · contract] Fire-and-forget with no readable ack / no commandId→result correlation
`enqueueCommand` returns `{id}` (server-monitor.ts:145-160) and the MCP set* tools return
`{ok:true, commandId}` *immediately* (monitor.ts:428, 459, 483, …) — but nothing ever reads the
command's outcome. The bridge writes `error`/`processedAt` onto the doc (transport:244, 313) yet
`firestore.rules:393` forbids client reads of `pending`. So: (a) an MCP write returns `ok:true` even
when the bridge will reject it (the F2 array case is exactly this false-success), and (b) the iPad
has no failure signal at all. The MCP tool *descriptions* document fire-and-forget honestly and tell
the AI to re-read with `get_mix` (monitor.ts registration, index.ts:1917, 1940, 1959) — a good
mitigation for the AI surface, none for the UI.
**Recommend:** give commands a *readable* result — e.g. the bridge writes a
`monitor-live/commands/results/{commandId}` (or a per-user last-error doc) with
`allow read: if request.auth.uid == resource.data.uid`; MCP set* tools optionally poll it briefly,
or at minimum the UI surfaces "command rejected." Effort: M. Impact: MED.

### F5 — [MED · scope-gap] No bus-assignment write tool (ratified v1 = faders + mutes + **bus assignments**)
Shipped: `list_monitor_buses, get_mix, get_matrix, set_send_level, set_send_mute, set_bus_fader,
set_matrix_fader, set_matrix_mute` (index.ts:1863-2010). The 2026-05-18 ratification
(`decisions.md`) and `[[project_mixer_feature]]` both name **bus assignments** as v1 scope (and list
`set_bus_assignment`). There is no assign/unassign tool — an AI cannot "assign David to bus 3" or
"clear bus 2," even though the BusAssignmentPanel UI can. See §3.5.
**Recommend:** add `assign_monitor_bus(busIndex, uid)` / `unassign_monitor_bus(busIndex, uid)`
(or a single `set_bus_assignment`) writing `config/monitor.busAssignments` via Admin SDK,
admin/SE-gated, mirroring `BusAssignmentPanel.saveAssignments` array semantics (and fixing F2 first
so the written shape is universally readable). Effort: S-M. Impact: MED.

### F6 — [LOW · security] `monitor-live/state` readable by every signed-in user incl. no-access roles
`firestore.rules:385-388`. Exposes full mixer state + assignment roster to `pending`/`denied`/
`member` users who have no monitor access otherwise. Low sensitivity; flagged for completeness.
**Recommend:** gate to `isMember()` (or monitor-access) if roster exposure ever matters. Effort: S.

### F7 — [LOW · contract/schema] Command create rule is loose (no `hasOnly`, no per-type required fields)
`firestore.rules:397-408` allows extra fields, a missing `busIndex`/`value`, and `value` as a
*number* for boolean commands (`value is number || value is bool`). The bridge guards with
`!== undefined` checks (transport:274-307) so it's safe, but e.g. `{type:'set_bus_master', uid,
createdAt}` (no busIndex/value) is accepted and silently no-ops.
**Recommend:** per-type required-field validation + `hasOnly([...])` in the rule. Effort: S.

### F8 — [LOW · UX/correctness] Single-bus UI; `if (!myBusIndex) return` treats bus index 0 as "no bus"
`MonitorClient.tsx:91, 97, 103` guard with `!myBusIndex`; `monitor-store.ts:124` keeps a single
`myBusIndex`. X32 buses are 1-based so index 0 is unlikely, but the falsy guard is latent. Also the
UI surfaces only the user's *first* bus even though MCP/config support multi-bus ownership.
**Recommend:** `myBusIndex !== null` guard; consider a multi-bus picker later. Effort: S.

### F9 — [NOTE · UX] Fader conflict (X32 vs iPad) is last-writer-wins; in-flight drag can be yanked
`monitor-store.ts:148-156 setSnapshot` overwrites `buses` wholesale with no "user is dragging"
suppression, so a bridge state push for the same bus can snap the on-screen fader back mid-drag. The
optimistic local update (`MonitorClient.tsx:92-93`) makes the user's *own* move feel instant; the
150ms snapshot debounce + 100ms bridge throttle soften cross-device collisions. Measured latency is
Lane 1's budget.
**Recommend:** suppress snapshot apply for the control under active drag (short grace window).
Effort: M. Impact: LOW.

### F10 — [NOTE · test-gap] The exact risks above are untested; the emulator seed masks F2
- No firestore.rules test touches `monitor-live` at all (repo grep: none) → the L2 authZ gap (F1) is
  unverified.
- `mcp-monitor.emulator.test.ts:97-101` seeds the **single-object** assignment form — the one shape
  the bridge *can* read — so producer/consumer drift (F2) is invisible. The array form is exercised
  only at the MCP layer (test:473-494), which handles it; the bridge path is never run.
- `mcp-monitor-defensive.test.ts` covers non-array `state.buses`/`matrices` corruption + handler
  throw → rich envelope (good), but not authZ bypass.
**Recommend:** add a rules unit test for `monitor-live/commands/pending` (documents what the rule
does/doesn't enforce), a bridge `getUserBus` array test (Lane 1), and flip the emulator seed to the
array form. Effort: M. Impact: MED (this is *why* F2 shipped undetected).

---

## §3.2 Contract / API design

- **Command schema:** sound at the MCP layer (Zod `int`/`min`/`max`, monitor.ts registration);
  loose at the rules layer (F7). Wire schema (`ClientMessage`, types/monitor.ts:71-78) is mirrored
  by `enqueueCommand`/`firestore-monitor-client` consistently.
- **Polarity flip** (`set_send_on`/`set_matrix_on` write `value: !muted`): consistent across MCP
  (monitor.ts:457, 530), the iPad client, the bridge, and tests (emulator:312-325, 466-468); clearly
  documented. Sound — no action.
- **F-018 index validation:** present + tested (emulator:352-394). Good — prevents the old
  silent-drop-at-bridge class.
- **Idempotency / ordering:** per-target latest-timestamp dedup (transport:255-271) + 10s staleness
  drop handle Firestore reordering; commands are last-value-wins, so effectively idempotent. Sound.
- **Read-back correlation:** missing (F4) — the one real contract weakness.

## §3.3 Client UX / flow (iPad)

- **Optimistic UI:** handlers apply a local store update *and* enqueue (`MonitorClient.tsx:90-117`),
  so the user's own move is instant; authoritative value returns via the state snapshot.
- **Connection management** (`use-monitor-connection.ts`): persistent ref-counted singleton with
  3s auth-null debounce + 5s unmount debounce + `visibilitychange` reconnect — genuinely well-built
  for iPad tab suspension and token-refresh blips.
- **Stale-while-revalidate** (`monitor-store.ts:117-122`): freezes last-good state on an empty
  snapshot. Good resilience.
- **Conflict** = F9. **Perceived latency:** local optimistic write covers the common case; the
  round-trip only bites on cross-device contention. Defer measurement to Lane 1.

## §3.4 MCP surface design (AI ergonomics)

- 8 tools; **excellent descriptions** — `get_mix` joins live channel *names* into the sends rows so
  "turn up my guitar" maps to a channelIndex in one call (index.ts:1879); fire-and-forget +
  `x32Connected` stale-hint caveats are stated on every write tool; `bridge.clients` semantics for
  MCP-vs-iPad are explained (index.ts:1868).
- **"Turn down David's IEM by 3 dB"** = `list_monitor_buses` (find David's bus) → `get_mix` →
  `set_bus_fader`. Doable, but levels are normalized 0.0–1.0, **not dB** — the descriptions correctly
  flag this; a dB→normalized helper is a possible future ergonomic.
- **Read-back fidelity:** `get_mix`/`get_matrix` reflect the bridge-written state doc faithfully.
- **Gaps:** assignment writes (F5); no command-result read (F4).

## §3.5 v1 scope-gap map

| Ratified v1 primitive | Shipped tool(s) | Status |
|---|---|---|
| Per-channel send level (fader) | `set_send_level` | ✅ |
| Per-channel mute | `set_send_mute` | ✅ |
| Bus master fader | `set_bus_fader` | ✅ |
| Matrix fader | `set_matrix_fader` | ✅ |
| Matrix mute | `set_matrix_mute` | ✅ |
| Read mix / matrix / bus list | `get_mix`, `get_matrix`, `list_monitor_buses` | ✅ |
| **Bus assignment (assign user→bus)** | — | ❌ **gap (F5)** |
| **Bus assignment (unassign / clear)** | — | ❌ **gap (F5)** |

Close the gap with admin/SE-gated `assign_monitor_bus`/`unassign_monitor_bus` writing
`config/monitor.busAssignments` via Admin SDK (array semantics, after F2). Reads of assignments are
already covered by `list_monitor_buses.assignedTo`.

## §3.7 Architecture verdict (producer/app vantage)

**"Firestore as the cloud→device RPC bus" is a defensible call from the API/UX side.** It eliminates
the original WSS pain (TLS cert trust on every iPad), reuses the already-authenticated Firestore
connection (zero iPad config), and survives bridge restarts via the persisted state doc + replayed
command listener. The structural costs are real but bounded and fixable without abandoning the model:
authZ cannot live *in* the transport (rules too weak → bridge-only gate, F1); no native ack
(F4); an unbounded-collection failure mode (F3); per-tick Firestore write cost (throttled to ~20/s
client, ~10/s state — acceptable for ≤6 iPads). For a band-internal, ≤6-device tool the tradeoff is
sound. I'd only **dissent** if hard sub-50ms fader response were required (a Firestore round-trip
won't hit it) — but optimistic UI covers the local case and IEM tweaks aren't sample-accurate, so
I **corroborate** keeping the Firestore transport. Final transport/latency call defers to Lane 1.

---

## Recommendations (prioritized, security-first)

**Fix now**
1. **F2** — make the bridge `getUserBus`/`isAuthorized` array-aware + sync `bridge/src/types.ts` +
   run `npm run check:types` (mechanics: Lane 1). *The IEM feature is broken without this.* S / HIGH.
2. **F1** — add `isMember()` + matrix-privilege checks to `firestore.rules:392-410`; fix the
   inverted bridge comment so the authoritative gate is honestly documented. M / HIGH.
3. **F3** — bridge deletes (not error-marks) rejected/timeout docs + Firestore TTL on `pending`. S-M / MED.

**Consider**
4. **F4** — readable per-command result/last-error doc (uid-scoped) for true ack. M / MED.
5. **F5** — `assign_monitor_bus`/`unassign_monitor_bus` MCP tools (after F2). S-M / MED.
6. **F10** — rules test + bridge array test + flip emulator seed to array form. M / MED.

**Polish**
7. **F7** per-type/`hasOnly` rule tightening · **F6** gate `state` read to `isMember()` ·
   **F8** `!== null` bus guard + multi-bus UI · **F9** drag-suppression on snapshot apply.

---

## FACTS vs INFERENCES

**FACTS** (read at `b7b5bb4d8` in this worktree):
- All `file:line` evidence above — rules (firestore.rules:382-410, 7-42), MCP
  (monitor.ts/server-monitor.ts/index.ts:1863-2010), client (MonitorClient/firestore-monitor-client/
  use-monitor-connection/monitor-store/use-monitor-access/BusAssignmentPanel), bridge
  (firestore-transport.ts:200-349, config.ts:108-122, types.ts:15), tests (mcp-monitor.emulator,
  mcp-monitor-defensive).
- `src/types/monitor.ts:15` is array-capable; `bridge/src/types.ts:15` is single-only; BusAssignmentPanel
  always writes the array form; bridge `getUserBus` reads `.userId` off the value.
- `isSignedIn()` admits any authenticated user regardless of role.

**INFERENCES (need the prod-PC live probe / Lane 1 confirmation):**
- That the *deployed* bridge actually returns `null` from `getUserBus` for array-form assignments
  at runtime (I read source at a SHA, not a running daemon). Lane 1 / prod-PC should confirm and
  state whether `npm run check:types` currently fails. **(F2 runtime confirmation.)**
- The *current shape* of prod `config/monitor.busAssignments` (array vs legacy single) — depends on
  whether live assignments were made via the panel (array) or seeded (single). Determines whether
  F2 is already biting today or only latent.
- Real-world F2 impact is gated on a non-engineer musician actually being assigned + using IEM
  control; per `[[project_band_ipad_hardware]]` the band isn't onboarded yet, so F2 is
  **latent-but-blocking for the IEM rollout**, not an active outage.
- Actual `monitor-live/commands/pending` collection size in prod (F3 severity) — needs a prod read.
- Latency/transport corroboration is Lane 1's measured budget + prod-PC probe.
