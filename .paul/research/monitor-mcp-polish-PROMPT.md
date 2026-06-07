# Lane: monitor-mcp-polish — Tier 1, APP-SIDE ONLY (no bridge)

## Context
A Claude-cowork stress-test audited the monitor/mixer MCP surface (the X32 control tools) on
2026-05-21. Full report:
`C:\Users\dsbog\AppData\Roaming\Claude\local-agent-mode-sessions\3402438a-2072-4bc9-b8ed-e0a87f93d157\1195fb50-a2f4-47bb-a77a-be8d4984036c\local_8ea5ad8b-e7d2-41e1-870a-727a1109797d\outputs\crc_music_mcp_audit_for_claude_code.md`
Read it for the FINDINGS + REPRO blocks (use the REPRO blocks verbatim as your test fixtures).

This lane is the **app-side, no-bridge, no-live-X32-dependency subset** — the findings that are
unambiguously correct to fix in `src/lib/mcp/tools/monitor.ts` no matter what the X32 was doing.
The audit praised the existing error-envelope shape + isPrivileged/myAssignedBuses context (S-1/S-2)
and the honest fire-and-forget tool descriptions (S-4) — **do not regress those.**

## Tool surface (confirmed by the audit's live calls)
`monitor.ts` ships 8 gated tools: `list_monitor_buses`, `get_mix`, `get_matrix`,
`set_send_level`, `set_send_mute`, `set_bus_fader`, `set_matrix_fader`, `set_matrix_mute`.
**Read the file before editing.** Preserve every existing role gate (musician / band_leader /
sound-engineer / admin behavior — the audit ran as admin). All edits below are additive or
error-shape/schema only; **no auth changes, no behavior change to a valid write's effect.**

## IN SCOPE
1. **F-3 (R-12) — `set_send_level` invalid channel 500→400.** `invalid_channel_index` currently
   throws → HTTP 500; `invalid_bus_index` on `set_send_mute` correctly returns 400. Make the
   channel path symmetric. **Use the SAME errorCode-override pattern already shipped for C9I4-007**
   (get_mix no-bus 500→400). REPRO: `set_send_level(busIndex=3, channelIndex=999, level=0.5)` → 400.
2. **F-4 (R-13) — schema bounds.** `busIndex` + `channelIndex` Zod max is currently
   `9007199254740991` (effectively unbounded). Cap `channelIndex` ≤ 32 (X32 input bank) and
   `busIndex` ≤ 5 (or derive from the dynamic `validBusIndices` already in the error hints —
   buses are [1..5]). Client-side validation should reject out-of-range in 0ms. REPRO F4 asserts
   `busIndex.maximum < 1000` and `channelIndex.maximum == 32`.
3. **F-6 (R-11) — mute inversion.** Reads expose `on` (true=unmuted); writes take `muted`
   (true=muted) → round-trip code must invert, and LLM callers get it wrong. **Additively** return
   `muted` (= `!on`) on `get_mix.sends[i]` AND `get_matrix.matrices[i]`. Keep `on` (additive only —
   the iPad `/monitor` WebSocket clients + `useMonitorStore` read `on`; do NOT remove or rename it).
   REPRO F6 asserts both `on` and `muted` present.
4. **F-7 (R-14) — bus state ambiguity.** A pulled-down bus is indistinguishable from an unused one
   (bus 4 "Andrea Wedge" = fader 0, all sends 0/off). Add an additive `active` (or `configured`)
   boolean on `list_monitor_buses.buses[i]`. Define "active" deterministically (e.g. has a name set
   OR fader>0 OR any send on) and document the rule in the tool description.
5. **F-5 — dynamic channel hint.** The `invalid_channel_index` hint lists all `[1..32]`
   unconditionally, while `validBusIndices` is already dynamic ([1..5]). Make the channel hint
   informative: either restrict to channels that are named/active on the target bus, OR annotate
   each as `{index, name, active}` so the LLM can choose. (If the bridge data needed for "active"
   isn't available app-side, annotate with name only + flag the gap in your SHIP-NOTICE.)
6. **R-2 (partial F-2) — honest write-receipt field.** Add `confidence: "queued"` to every write
   tool's success response. **Only ever "queued"** in this lane — NOT "applied" (we cannot confirm
   an X32 OSC ack from the app side; that's the held bridge lane). This carries the fire-and-forget
   honesty the audit's S-4 praised INTO the payload, so a caller knows the response means "accepted
   for send," not "confirmed on the desk." Keep the existing tool-description warning.

## OUT OF SCOPE — do NOT touch (held / different lane)
- **F-1 propagation root-cause** (does the OSC reach the desk) — bridge-side + premise unconfirmed
  (pending Daniel's live-X32 write probe). NOT this lane.
- **F-2/F-9 `get_command_status` / `list_pending_commands` / drop counter** — needs bridge-side
  command tracking. Bridge lane (another release). NOT this lane.
- **R-3 `x32LastAckedIso` / `x32StaleSeconds` / ack-derived `x32Connected`** — bridge `config.ts`
  heartbeat. NOT this lane.
- **P2/P3 features:** snapshot/restore_mixer, apply_changes, scenes, nudge_*, to_db/from_db,
  list_channels, wait_for_mixer_change — backlog, scoped after the F-1 question resolves.
- **`bridge/**` — DO NOT EDIT.** App-side `src/lib/mcp/tools/monitor.ts` (+ its tests) only.

## Hard rules
- App-side only. Claim `src/lib/mcp/tools/monitor.ts` in `shared/claims.md` (no other lane touches
  it now, but claim per protocol). If you add an MCP-registration/desc change in `index.ts`, claim it.
- **Additive read fields only** — `on` stays; iPad monitor WebSocket consumers must not break.
- Preserve all role gates + the existing rich error envelope shape (S-1) + isPrivileged/myAssignedBuses (S-2).
- Tests: reproduce EACH finding (F-3/4/5/6/7 + R-2) from the REPRO blocks → red→green. unit +
  emulator + `next build --webpack`. Deployed `tools/list` + call REPRO post-deploy → SHIP-NOTICE.
- Cut worktree off fresh origin/master (`git fetch`; shallow — confirm). Narrow-lane cherry-pick FF.

## Deliverable
`monitor.ts` (+ tests, + any index.ts desc tweaks) closing F-3/F-4/F-5/F-6/F-7 + R-2 queued field.
SHIP-NOTICE to auditor (Tier 1) with per-finding REPRO. Auditor verifies deployed surface.
