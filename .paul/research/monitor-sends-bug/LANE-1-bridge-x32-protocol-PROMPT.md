# LANE 1 — Bridge + X32 protocol + desk-on verification protocol (coder-1)

**Read `PARENT.md` in this directory FIRST.** Tier-0 READ-ONLY, `bridge/src/**`
focus. You are the bridge expert. Board is OFF — no live OSC.

## Questions to answer (root-cause the SEND path on the bridge side)
1. **OSC correctness.** Confirm `setSendLevel`/`setSendOn` build the correct X32
   OSC for a channel→mix-bus send. Verify against the real X32 OSC spec:
   - Is `/ch/<CH>/mix/<BUS>/level` the correct address, and what numbering does
     X32 expect — channel **1–32 absolute**, bus **1–16**? Are mono vs stereo /
     aux / bus-as-monitor nuances relevant for CRC's bus 5?
   - Does the float scaling match (`Math.max(0,min(1,v))` linear vs X32's level
     taper)? Could a "valid but tiny/wrong-curve" value read as "nothing"?
2. **The bus-mute mystery.** There is NO `set_bus_mute`/`set_bus_on` case in
   `firestore-transport.ts` and no `setBusMute` in the client — yet Daniel's bus
   mute WORKS. Determine the actual mechanism (likely `set_bus_master` → 0 and
   restore). Confirm what "works" really exercises, so we know the working path
   for comparison.
3. **Authorization parity.** Read `firestore-transport.ts isCommandAuthorized` +
   `config.getUserBus`. Does a `set_send_level` command pass the SAME auth check as
   `set_bus_master` for a `band_leader` who owns bus 5? Could sends be silently
   rejected/skipped where master isn't?
4. **Silent drops.** The per-case field guards have no `else`, and the switch
   default only `console.warn`s. Enumerate every way a send command can be
   accepted-then-dropped (missing field, type coercion, obsolete-timestamp
   discard at `:264`, batch-delete-before-execute ordering).
5. **State reflection.** After a send OSC, does the bridge ever write the new send
   value back into `monitor-live/state` buses[].sends? If not, the app fader would
   "snap back" (FaderStrip 2s pending timeout) even if the X32 changed — a UX
   "nothing happened" that differs from a true write-drop. Distinguish.

## Deliverable
- `MONITOR-SENDS-bridge-FINDINGS.md`: per-question verdict (with file:line), the
  bridge-side root-cause hypothesis (or exoneration), AND
- **The desk-on verification protocol**: a concrete, minimal step list (extend
  `scripts/monitor-live-probe.mjs` *in the plan only, do not commit*) to, when the
  board is on: snapshot bus-5 sends → drive ONE `set_send_level(bus5, chN, v)` via
  the iPad command-queue path AND via MCP → observe whether the X32 changed and
  whether `monitor-live/state` reflects it → restore. Service-time-guard ON;
  monitor-buses-only; restore byte-identical. This is what we run in ~5 min once
  the desk is up to confirm the fix.

SHIP-NOTICE (Tier-0) → `inbox/supervisor.md`.
