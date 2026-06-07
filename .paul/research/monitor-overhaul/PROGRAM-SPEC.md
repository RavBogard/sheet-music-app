# Monitor Control System Overhaul — Program Spec

**Status:** APPROVED (Daniel, 2026-05-21) — design ratified; Phase 0 to be spec'd + planned next.
**Author:** supervisor. **Owner cadence:** multi-wave, multi-coder; auditor + self-test harness gate each wave.
**Supersedes:** coder-2's open "F-1 write-drop vs state-sync — unresolved." Root cause is now KNOWN (below).

---

## 1. Why (confirmed root cause — live-desk verified 2026-05-21)

With a human (Kim) at the X32 + the supervisor watching Firestore, we proved:

- **Control WORKS.** An MCP/queue command (`set_bus_fader bus 5 → 0.15`) physically moved the desk fader. Writes reach + apply on the X32.
- **The "silent write-drop" (F-1) was a READBACK illusion**, caused by three interlocking bugs in the **bridge's state-write model**:
  1. **Read-of-own-write gap.** The X32 does NOT echo a client's own writes back to that client, and the bridge does NOT update its own cached state on send → `monitor-live/state` never reflects MCP/iPad-driven changes → readback looks frozen. (A *manual* desk move DOES echo — which is why Kim's move updated state but the command didn't.)
  2. **BR-02 idle-freeze.** BR-02's `/xinfo` keepalive fixed a false-disconnect that had been (accidentally) the only thing forcing a periodic full resync (~20s) on an idle desk. Post-BR-02 there is no mixer-state heartbeat → idle state goes + stays stale.
  3. **Array→map corruption.** Delta writes (`update({"buses.N.fader": v})`, dot-notation) convert the `buses` ARRAY into a MAP, dropping the other buses; unhealed by full-resync this breaks `get_mix`/`list_monitor_buses` reads AND blocks `set_bus_fader` MCP validation (`invalid_bus_index`, `validBusIndices:[]`). (This is why the MCP write had to be sent via the raw iPad command-queue path.)

**Consuming-surface impact (priority order):**
- **iPad `/monitor` (THE North Star).** Command path works (writes straight to `monitor-live/commands/pending`, bypasses the MCP bug). Display path is broken: corruption loses buses, own-moves aren't confirmed from authoritative state, idle goes stale.
- **MCP/Claude control.** Reads + write-validation broken by the corruption (the get_mix throw + invalid_bus_index).
- **App-side staleness guard** (shipped @ `70357f47f`) correctly FLAGS stale state — defense-in-depth, keep it.

## 2. North Star + scope

**North Star:** a musician moves a fader on their iPad → it reliably reaches the X32 **and** their screen shows accurate live state (own moves confirmed, others' moves reflected, survives idle / reconnect / WiFi blips, multiple musicians concurrently). FOH/engineer + MCP/Claude control ride the same substrate as secondary beneficiaries.

**In scope:** bridge (OSC client, transport, config, reconnect, state-write contract), web MCP monitor tools + `server-monitor.ts`, iPad `/monitor` client + store + components, `firestore.rules` monitor blocks, the `config/monitor` + `monitor-live/{state,commands}` data model, and the self-test harness.

**Out of scope:** non-monitor app surfaces; the bridge release/credential path except where a release is required to ship a bridge fix (single-owner, Daniel-gated, per bridge policy).

## 3. Self-test architecture (foundation — makes the program autonomous; no human in the booth)

**Oracle principle:** the X32's own **query/response** is ground truth — not the echo, not `monitor-live/state`, not a human eye. Every fix is validated by "did the desk actually change, per the desk itself."

- **Tier 1 — Faithful X32 mock (CI, every commit).** Upgrade `bridge/src/__tests__/x32-mock-server.ts` to model the REAL quirks: (a) own-writes are NOT echoed to the sender, (b) query/response returns current values, (c) `/xremote` subscribe + renewal, (d) external changes echo to subscribers. Catches read-of-own-write + echo-behavior bug classes headlessly.
- **Tier 2 — Live query-after-write probe (continuous; studio desk is "always on, poke freely" per Daniel).** Autonomous harness: snapshot a safe monitor bus via X32 query → write via the iPad command-queue path AND the MCP path → query the desk back to confirm it applied → confirm `monitor-live/state` reflects it (full round-trip) → restore. Runs on-demand per lane + scheduled. Safe targets = monitor/IEM buses, never during a service ([[project_shul_cadence]]: Fri eve + Shabbat morning).

## 4. Hybrid root-fix architecture (the core change)

Single root = the **bridge's state-write contract**. Redesign only that:
- **Authoritative full-state writes** — no dot-path deltas that corrupt arrays→maps. Bridge writes the complete, well-typed snapshot (full-on-throttle is cheap at this scale; the audit confirms full-vs-shape-preserving-delta).
- **Query-after-command confirmation** — after processing a command (which the X32 won't echo back), the bridge QUERIES the affected parameter and writes the confirmed value. Closes read-of-own-write at the source for iPad AND MCP (shared queue).
- **State heartbeat** — periodic full resync independent of desk activity; idle never freezes.
- Consumers minimally changed: iPad client already tolerant; staleness guard stays; MCP validation patched to validate against owned-buses/config, not corrupted live-state.

## 5. Phase decomposition (each phase = wave(s) of parallel disjoint coder lanes; auditor + harness gate advancement)

- **Phase 0 — Audit + Self-Test Harness (load-bearing).**
  - *0a Audit:* exhaustive enumeration across bridge / MCP+server-monitor / iPad client+store+components / rules / data model; fold in monitor-audit-1 (`c2c45b6f4`), monitor-audit-2 (`22b5e1f1b`), the 2026-05-21 mixer-MCP cowork audit, monitor-mcp-polish + this session's findings. Output: defect+gap register + the target state-contract spec.
  - *0b Harness:* faithful mock + live query-after-write probe + CI wiring.
- **Phase 1 — Core control loop (hybrid root-fix).** Bridge state-write redesign (full-state, query-after-command confirm, heartbeat) + MCP validation fix. Bridge work single-owner (coder-1). Where the iPad round-trip becomes correct.
- **Phase 2 — Robustness & observability.** Reconnect re-arms `/xremote`; liveness derived from real state-freshness (not a flag that survives a dead sync); `get_command_status` (R-1); drop counter (R-9); command ordering/idempotency; multi-musician concurrency.
- **Phase 3 — iPad UX end-to-end (North Star surface).** Own-move confirmation UX, others'-change reflection, staleness/offline/reconnect UX, latency feel, concurrent musicians; FOH + MCP parity on the same substrate.
- **Phase 4 — Hardening + green.** Multi-iPad soak/load, WiFi-blip resilience, performance, edge cases, runbook, standing live-regression suite, green declaration vs §6.

## 6. "Phenomenal" acceptance (all certified by the autonomous harness — no human)
- iPad move → desk applies, confirmed via live query-after-write probe, within target latency.
- iPad shows own move **confirmed from authoritative state** (not just local optimistic) within target.
- A change from any source reflects on all iPads within target.
- Survives idle (no freeze), bridge reconnect, WiFi drop/restore, app backgrounding.
- N concurrent musicians each control only their assigned bus; zero cross-talk; no lost/corrupted state.
- (Latency targets to be set in Phase 0 from measured baselines.)

## 7. Constraints / standing policies
- **Self-test is mandatory** — no fix ACCEPTed without mock + live-probe evidence (the oracle).
- **Bridge/** single-owner** (coder-1 expert), Daniel-gated; a bridge release is outward-facing + single-owner.
- **Live desk is the autonomous gate** ("always on, poke freely"); only monitor/IEM buses, never during service.
- iPad flow is the priority for sequencing + acceptance.

## 8. Known live regression to clear immediately (not blocking the program)
`get_mix` THROWS at the deployed surface (`i.buses.find is not a function`) on the corrupted state shape — auditor BLOCK on `monitor-state-staleness-guard` @ `70357f47f`. Quick fix (coder-4): `safeArray` guard before `.find` in the get_mix path + a regression test feeding the LIVE-stale/non-array `buses` shape (the gap the emulator's fresh-array fixture missed). This is a down-payment on Phase 1's corruption fix; clear it now to un-break prod get_mix + release the staleness lane.

## 9. Deferred to Phase 0 audit
Full-state vs shape-preserving-delta decision; exact latency targets; whether the `monitor-live/state` schema needs versioning; iPad store/component inventory; firestore.rules tightening opportunities.
