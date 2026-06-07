# LANE 3 — End-to-end contract + prior-art + live forensic data (coder-3)

**Read `PARENT.md` in this directory FIRST.** Tier-0 READ-ONLY (code) +
READ-ONLY live Firestore reads allowed (no writes). Board is OFF, but the
Firestore docs from today's service persist.

## Questions to answer
1. **Confirm/break the "contract is clean" claim.** Independently reconcile the
   EXACT `set_send_level` / `set_send_on` command doc shape across all three
   writers/readers — client (`firestore-monitor-client.ts`), MCP
   (`server-monitor.ts` + `tools/monitor.ts` `setSendLevel`/`setSendMute`), and
   the bridge consumer (`firestore-transport.ts`). Field names, types, required-ness.
   Does the MCP tool emit the same shape as the iPad client? (Note the client uses
   `set_send_on` but the MCP tool name is `setSendMute` — confirm the on/off
   polarity + field both ultimately produce the bridge's `set_send_on`.)
2. **channelIndex semantic contract — definitive.** Across the whole stack, is
   `channelIndex` documented/assumed to be the X32 absolute channel (1–32)? Where is
   that contract established, and does any layer translate it? (Pairs with Lane 2's
   trace; you own the cross-layer truth.)
3. **Was the SEND write-path ever verified live?** Audit the monitor-overhaul
   record (`PROGRAM-SPEC.md`, `DEFECT-REGISTER.md`, `PHASE-*-PLAN.md`, P0-B2
   `scripts/monitor-live-probe.mjs`, P1-B tests). Phase 0/1 drove `set_bus_fader`
   and tested `get_mix`/`list_monitor_buses` — did ANY test or live probe ever
   drive a per-channel `set_send_level` THROUGH to the X32 and confirm it landed?
   If not, state plainly that sends are an **unverified write-path** (likely the
   reason this only surfaced in real multi-channel service use).
4. **Live forensic data (READ-ONLY).** Read, via Firebase MCP / read-only:
   - `monitor-live/state` — the `buses[]` shape and whether bus 5 carries a
     `sends[]` array (and its channelIndex labeling). Note staleness
     (`updatedAt` may be frozen — the desk is off).
   - `monitor-live/commands/pending` — any leftover/undrained commands from
     today's service (evidence of what the app actually wrote, incl. any
     `set_send_level` docs + their `channelIndex` values + `error`/`processedAt`
     fields the bridge may have stamped on drop).
   - `config/monitor` — bus 5 ownership + `monitorBuses` + any channel config.
   Report exact values; do NOT write anything.

## Deliverable
`MONITOR-SENDS-contract-FINDINGS.md`: the reconciled cross-layer contract, the
definitive channelIndex semantics, the "was it ever verified" verdict, and the
live forensic evidence (what the app wrote during service + what the bridge did
with it). Flag any contradiction with the supervisor pre-probe.

SHIP-NOTICE (Tier-0) → `inbox/supervisor.md`.
