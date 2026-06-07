# Cycle-9 Sweep — Instance 4: Roster / scheduling + /monitor IEM mixing

**Read `cycle-9-sweep-PARENT.md` first.** Sign `from cycle-9-instance-4`.
uidPrefix: `c9i4`. Bearer: pool row `ASSIGNMENT=cycle-9-instance-4`.

## Why this axis

Two under-probed subsystems: (a) roster/scheduling — "who's playing tonight",
band suggestions, swap-ins; and (b) the shipped `/monitor` route (personal-IEM
WebSocket mixing). Both are real but lightly tested. Map what works, what's a
known gap, and what's broken.

## Surface

- **Roster MCP:** `suggest_band` (just fixed — verify), `list_pending_assignments`,
  `list_musicians_on_date`, scheduling_assignments reads. `set_unavailability`
  is DEFERRED to a c1.5 phase (`[[C8I2-011]]`) — confirm it's absent; don't
  probe a phantom (PARENT §3). Roster/scheduling MCP visibility is a KNOWN GAP
  (memory: "who's playing tonight", swap-ins) — characterize the gap precisely.
- **/monitor route:** WebSocket personal-IEM mixing — `FaderStrip`,
  `MatrixPanel`, `BusAssignmentPanel`, `useMonitorAccess` auth gate
  (`[[project_mixer_feature]]`). MCP monitor-control is a DEFERRED feature
  (NOT built) — do NOT probe nonexistent `set_bus_fader` etc.; note the gap.

## Probes

1. **suggest_band post-fix.** Against a real setlist, returns a ranked candidate
   list (was 500 / FAILED_PRECONDITION — C8I2-002 / C7I1-004). Confirm the index
   fix landed. Inspect the ranking logic output for sanity (Vocal Lead +
   instrument coverage — terminology per PARENT §4).
2. **Scheduling reads.** `list_pending_assignments`, `list_musicians_on_date`
   for an upcoming Friday/Shabbat — no FAILED_PRECONDITION, sensible shapes.
3. **Roster gap characterization.** What CAN'T a band_leader answer about
   tonight's roster through the current tools? ("Who's confirmed?", "swap X for
   Y", "notify the sub"). Write it up as a concrete gap spec (this directly
   informs a future roster-MCP phase).
4. **/monitor UI.** Via the harness (`cycle-4/harness/`), load `/monitor` with a
   gated user; does `useMonitorAccess` gate correctly? Do FaderStrip /
   MatrixPanel / BusAssignmentPanel render + respond? WebSocket connect/
   reconnect behavior on a flaky connection? (Hardware coupling via `bridge/` is
   out of scope — PARENT §4 — observe the UI/WS layer only.)
5. **Edges:** monitor access for each role; a musician with no IEM assignment;
   concurrent fader moves; what happens if the WS server is unreachable.

Cleanup: `cleanup_all_test_data({prefix:"c9i4"})`. Deliverables per PARENT §6.
Note any monitor finding that would need `bridge/` to fix as `kind:"deferred-bridge"`.
