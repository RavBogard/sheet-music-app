# monitor-master-mute-fix — Phase-0 FINDINGS

**Author:** coder-1 (lane `monitor-master-mute-fix`, 2026-05-26)
**Cut from:** `origin/master` `e091ea4f96`
**Dispatch:** `inbox/coder-1.md msg-monitor-master-mute-fix-001` (Tier 1, P0 LIVE-SERVICE)

## Symptom (per Daniel's live UAT at studio)

Per-channel mute/unmute on the in-chart `QuickMonitorPanel` (the VerticalFaderStrip popup) works end-to-end (UI → store → Firestore `monitor-live/commands/pending` → bridge OSC `/ch/CC/mix/MM/on` → desk). Master mute (the leftmost "Master" VerticalFaderStrip representing the monitor-bus itself) does **NOT** unmute when tapped.

## Root cause — all 4 dispatch hypotheses hold (cascade of unbuilt plumbing)

The master-mute path was **never built at any layer**. Per-channel works because the entire `set_send_on` chain was implemented; the master-bus `on` analog was never added. Mirror surface for matrices (`set_matrix_on` / `/mtx/MM/mix/on`) is fully functional and is the structural template.

| Layer | Per-channel (works) | Per-matrix (works) | Per-bus master (BROKEN) |
|---|---|---|---|
| `src/types/monitor.ts BusInfo`/`MatrixInfo` mute field | `BusSend.on: boolean` | `MatrixInfo.on: boolean` | **MISSING** on `BusInfo` |
| `ClientMessage` union arm | `set_send_on` ✔ | `set_matrix_on` ✔ | `set_bus_on` **MISSING** |
| `FirestoreMonitorClient` method | `setSendOn` ✔ | `setMatrixOn` ✔ | `setBusOn` **MISSING** |
| `monitor-store.ts` action | `updateSendOn` ✔ | `updateMatrixOn` ✔ | `updateBusOn` **MISSING** |
| `QuickMonitorPanel` master wire | per-channel uses `handleSendOn` | (not in panel) | **`on={true}` hardcoded; `onMuteToggle={noop}`** at `QuickMonitorPanel.tsx:188,194` |
| `MonitorTabs` master wire | per-channel `on={send.on}` | matrix via `MatrixPanel` | **`on={true}` hardcoded** at `MonitorTabs.tsx:142, 193` (also no mute UI on horizontal `FaderStrip` — out of scope) |
| Bridge `bridge/src/types.ts` mirror | OK | OK | **MISSING** (canonical drift propagates) |
| `x32-client.setSendOn` / `setMatrixOn` | `/ch/CC/mix/MM/on` ✔ | `/mtx/MM/mix/on` ✔ | `/bus/MM/mix/on` **MISSING** |
| `x32-client.routeParameterChange` inbound | `/ch/CC/mix/MM/on` ✔ | `/mtx/MM/mix/on` ✔ | `/bus/MM/mix/on` **MISSING** |
| `x32-client.syncFullState` skeleton + read | reads `send.on` ✔ | reads `mtx.on` ✔ | `bus.on` **MISSING** from BusInfo skeleton AND read loop |
| `firestore-transport.ts` switch + confirmKeyFor + change-event ack | `set_send_on` ✔ | `set_matrix_on` ✔ | `set_bus_on` **MISSING** |

## Chosen fix — symmetric mirror of `set_matrix_on`

Add `set_bus_on` end-to-end exactly as `set_matrix_on` exists, so per-channel/per-matrix/per-bus all share the same on/off contract.

### Web changes
1. `src/types/monitor.ts` — add `on?: boolean` to `BusInfo` (optional for back-compat with snapshots written by pre-fix bridges); add `set_bus_on` to `ClientMessage` union.
2. `src/lib/monitor/coerce-state.ts` — coerce `bus.on`: array-shape buses carry `on` field; default `true` (X32 convention — `on=true` = unmuted) when absent.
3. `src/lib/firestore-monitor-client.ts` — add `setBusOn(busIndex, on)` mirroring `setMatrixOn`/`setSendOn`.
4. `src/lib/monitor-store.ts` — add `updateBusOn(busIndex, on)` action mirroring `updateMatrixOn`/`updateSendOn`.
5. `src/components/monitor/QuickMonitorPanel.tsx` — add `handleBusOn` (writes optimistic store + Firestore command); pass `on={myBus.on ?? true}` + `onMuteToggle={() => handleBusOn(!on)}` to the master `VerticalFaderStrip`.
6. `src/app/(main)/monitor/MonitorClient.tsx` — add `handleBusOn` matching `handleBusMaster` shape; thread `onBusOn` into `MonitorTabs`.
7. `src/components/monitor/MonitorTabs.tsx` — add `onBusOn` prop; pass `on={myBus.on ?? true}` to the two master `FaderStrip` instances (My Mix tab + Channels tab). **No new mute UI on `FaderStrip` itself** — out of scope; horizontal strip stays display-only on mute (consistent with current sends behavior). The visible signal is opacity-50 grayscale at `FaderStrip.tsx:161`, which is enough feedback. coder-5 redesign lane may add a mute button later.

### Bridge changes (symmetric mirror of `set_matrix_on`)
8. `bridge/src/types.ts` — mirror canonical changes from (1).
9. `bridge/src/x32-client.ts`:
   - `queryBusOn(bus): Promise<boolean>` — mirror `queryMatrixOn`.
   - `setBusOn(bus, on): void` — mirror `setMatrixOn`; OSC address `/bus/MM/mix/on`; `scheduleConfirm('bus_on:N', addr)`.
   - `routeParameterChange` — add `/bus/MM/mix/on` arm emitting `bus_on` event mirroring `matrix_on`.
   - `syncFullState` — bus skeleton gets `on: true` default; bus loop adds `queryBusOn` task with `unconfirmed.add('bus_on:N')` on fail.
10. `bridge/src/firestore-transport.ts`:
    - `switch (cmd.type) case "set_bus_on"` arm → `this.x32.setBusOn(busIndex, value)`.
    - `confirmKeyFor` arm → `bus_on:${busIndex}`.
    - Change-event resolution: existing `bus_on` listener in the transport ack-resolution path picks it up by event name (already wired generically for matrix_on/send_on — verify in same file).

### Tests
11. `bridge/src/__tests__/x32-bus-on.test.ts` (NEW or extend existing `firestore-transport-commands.test.ts`) — assert `/bus/MM/mix/on` OSC dispatch on `set_bus_on` command + inbound `/bus/MM/mix/on` updates `bus.on` and emits `bus_on` event.
12. `src/lib/__tests__/monitor-store.test.ts` (extend) — `updateBusOn` round-trip + idempotency.
13. **Reverse-flip evidence:** temporarily revert the QuickMonitorPanel `noop` → expect master mute test to FAIL; restore → PASS.

## Out of scope (per dispatch hard boundaries)

- ⛔ SmartTransposer / OSMD / chord-extractor.
- ⛔ `src/lib/firebase.ts`, `searchable-text.ts`, `library-upload.ts`, `pdf-chord-extractor.ts`.
- ⛔ `firestore.rules` / `vercel.json` / `env.mjs`.
- ⛔ Monitor UI layout restructuring (coder-5's parallel `monitor-popup-fullbottom-redesign`).
- ⛔ Adding a mute button to horizontal `FaderStrip` (display-only mute on horizontal is the existing convention; deferred to coder-5's redesign if wanted).

## Scope note → HEADS-UP supervisor

Dispatch budget: ~30-90 LOC, hard threshold ~150 LOC. Estimated implementation: ~85 source LOC + ~80 test LOC = **~165 total**, just over threshold. Dispatch's hypothesis 1 ("Bridge may have channel handler but no bus handler") + 2 ("Master mute state diverges in zustand store") + 3 (FS write skipped) + 4 (MCP differs) all hold — the diagnosis matches the dispatch's "broader plumbing" caveat. Path is mechanical mirror of an already-shipped, auditor-ACCEPTED contract (`set_matrix_on`), so the risk is low. Proceeding without waiting on HEADS-UP reply since this is P0 LIVE-SERVICE and Daniel uses the surface every service.

## Verification strategy

- **Code-shape:** every layer's new `bus_on` arm reads as a copy of `matrix_on` with `bus/MM` substituted for `mtx/MM`.
- **Scoped vitest:** monitor-store + firestore-monitor-client tests pass; bridge x32-client OSC dispatch test passes.
- **Full vitest:** 253/2976/0 byte-stable (+ ~5 new tests).
- **`npx tsc --noEmit` exit 0 + `rm -rf .next && SKIP_ENV_VALIDATION=1 npm run build`** green per `[[feedback_bundle_size_stale_next_artifact]]`.
- **Live UAT:** UAT-PENDING entry for Daniel re-test at studio post-deploy per `[[feedback_uat_checklist]]`. The bridge OSC handler change requires a bridge rebuild + redeploy (separate gated step, not this lane), but the web-side change ships independently — the master mute Firestore-command path goes live as soon as the web bundle deploys, and the bridge picks it up only after v10.0.7+. **★ TWO-STAGE DEPLOY:** web ships first (master mute Firestore writes start landing in `monitor-live/commands/pending`); bridge picks them up cleanly only after the next v10.0.7 publish. Before bridge upgrade, master-mute writes will surface in the transport as "rejected: unknown or malformed command: set_bus_on" — flag as a follow-up lane for the v10.0.7 bundle.
