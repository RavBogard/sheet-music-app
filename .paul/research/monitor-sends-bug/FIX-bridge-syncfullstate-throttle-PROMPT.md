# FIX LANE — bridge `syncFullState` OSC query-throttle (monitor sends) — coder-1

**Tier 2, `bridge/src/**` single-owner (you). Board + studio PC are OFF.** Read the
synthesis first: `.paul/research/monitor-sends-bug/MONITOR-SENDS-SYNTHESIS.md` (+ your
own `MONITOR-SENDS-bridge-FINDINGS.md` and Lane 3's `MONITOR-SENDS-contract-FINDINGS.md`).

## The defect (Lane 3 forensics, confirmed in live `monitor-live/state`)
`syncFullState` (`bridge/src/x32-client.ts:624-648`) fires **~320 OSC queries
concurrently** (32 ch × 5 buses × {level, on}). The X32 drops most of them for the
later buses → each `query()` times out (2 s) → the values land in `state.unconfirmed[]`
and the bridge publishes **fabricated `on:false` / `level:0` fallbacks** (B11). Live
proof: bus *faders* confirmed for all 5 buses, but per-channel *sends* for buses 2–5
almost entirely unconfirmed; the one bus-5 send the desk *did* answer (ch6=0.34) proves
the address family is valid → this is a **drop-under-flood**, not a wrong-address bug.

Impact: Daniel saw a **fabricated zeroed mix** for bus 5, and with no working send
read-back his writes couldn't be confirmed → the FaderStrip eased each knob back to the
fake 0 → "changing channels does nothing." (The separate desk-config question — bus 5
subgroup / sends physically off — is settled by the desk-on protocol, NOT this lane.)

## The fix (this lane — CODE only, build + unit-test NOW)
In `bridge/src/x32-client.ts` `syncFullState` (and any sibling that bulk-queries):
- **Throttle the send queries:** replace the concurrent burst with **serialized/chunked
  queries with a small concurrency cap** (tune a sane default, e.g. ≤8–16 in flight) so
  the X32 isn't flooded. Per-bus or per-N batching, awaited.
- **Retry timed-out reads** a bounded number of times before giving up to
  `unconfirmed[]` (a transient drop shouldn't fabricate a value).
- Consider raising the per-`query()` timeout for sends and/or a small inter-batch delay;
  keep total sync time reasonable (don't serialize all 320 one-at-a-time if a capped
  pool is enough). Preserve the B9 per-address FIFO `pendingCallbacks` behavior.
- Goal: on a healthy desk, **all 5 buses' send level/on reads resolve confirmed** (no
  fabricated `on:false`), so write-readback can confirm.
- Keep it minimal + bridge-only. Do NOT change the dispatch/OSC/auth paths (all
  exonerated). Do NOT touch `src/**`.

## Verification tooling (also this lane — Tier-1 harness, build now)
Extend `scripts/monitor-live-probe.mjs` (currently drives **only** `set_bus_master`) with
a **`set_send_on` + `set_send_level` tier** on a bus, mirroring the existing master tier
(snapshot → enqueue both paths → drain → read-back `state.buses[B].sends[CH]` → restore
byte-identical; service-time guard + restore-or-refuse intact). This is the oracle that
proves the fix when the desk is on (synthesis §B / Lane-3 step 2). PLAN/implement it, but
its live RUN is the desk-on step, not now.

## Gates + ship + ★ release gating
- Unit-test the throttle against the X32 mock (`bridge/src/__tests__/x32-mock-server.ts`):
  model/assert that send queries are chunked (no >cap concurrent), that a simulated
  timeout is retried, and that a healthy mock yields confirmed (not unconfirmed) sends for
  all buses. Bridge suite green + check:types. Run via a worktree with a complete install
  ([[project_worktree_test_harness_node_modules]]).
- **Ship the CODE fix to master** (FF-push, Tier 2 bridge single-owner); SHIP-NOTICE →
  `inbox/auditor.md`. Cut a FRESH worktree off `origin/master`.
- ★ **NO electron release in this lane.** The bridge RELEASE (v10.0.3) + the live desk
  verification are a SEPARATE Daniel-gated step, AFTER v10.0.2 is confirmed installed on
  the desk (don't stack releases — [[project_bridge_update_ops]]). The live confirmation =
  restart bridge, read `monitor-live/state`, assert buses 2–5 sends now resolve confirmed +
  run the new probe send-tier. STOP + surface if tempted to touch the version/release path.
**Action required:** ACK in inbox/supervisor.md (`from coder-1`), then build.
