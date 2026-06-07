# Lane P3-A — iPad fader confirmation UX (coder-5) — Tier 2

Read `.paul/research/monitor-overhaul/PHASE-3-PLAN.md` (Lane P3-A) end-to-end first — it has the full design. You own the iPad consumer plane (you shipped P1-C). Build ON TOP of P1-C; do NOT redo it.

## Context
Phase 1 is LIVE (v10.0.1): the data round-trip is correct + `monitor-live/state` reflects confirmed values + self-advances. That cleared C-2's blocker. Now make the fader *feel* right.

## Scope (iPad consumer plane only — disjoint from P2-A bridge + P2-B MCP; VERIFY file:lines against CURRENT post-P1-C source — [[feedback_cowork_prompt_verify_before_write]])
`src/components/monitor/{FaderStrip,VerticalFaderStrip}.tsx`, `src/lib/monitor-store.ts`, `src/app/(main)/monitor/MonitorClient.tsx`, perform-toolbar `QuickMonitorPanel`, + NEW pure helper(s) for the state machine.

**Build the fader confirmation state machine:**
- **C-2/C-3:** per-fader state `idle → dragging → pending(optimistic value+sentAt) → confirmed` (authoritative `monitor-live/state` reflects ≈ sent value within tolerance) **or** `reverted` (timeout OR state settled different → ease to authoritative, NO hard snap). **Replace the crude 2s safety snap-back** with this reconciliation (the authoritative value is real now, post-P1-A; tolerance + timeout tunable, start ~ P1-A's 300ms confirm + margin).
- **C-12 — drag-suppression:** while `dragging`, incoming snapshots do NOT move the fader (queue/ignore until release) — never yank an active drag.
- **C-11:** bus index 0 is a VALID bus — fix `!myBusIndex` truthiness (use `== null`/explicit).
- **C-8:** empty-snapshot handling must not silently freeze last-good masking a real problem — surface via the existing staleness cue.
- **C-6 remainder:** carry P1-C's staleness/offline cues onto `VerticalFaderStrip` + `QuickMonitorPanel` so EVERY fader surface is honest, not just the main route.

**Reuse P1-C, don't rebuild:** `coerce-state.ts` (C-4 shared guard), `state-freshness.ts`/`useMonitorStaleness` (C-6), `DisconnectedOverlay`, `deriveMyBusIndex` (C-7) all exist — build the state machine on them.

**EXCLUDE C-9** (per-command "rejected because X" UI) → it needs Phase-2's ack surface (`monitor-live/acks/{commandId}`), which isn't live until the next bridge release. Ship the confirm/revert machine on state-reflection now; C-9 is a follow-up.

## /ui-ux-pro-max is MANDATORY ([[feedback_ui_ux_skill]])
Fader affordances, confirm/revert motion (respect `motion-reduce`), color-not-alone cues, 11" iPad (820×1180) touch ergonomics ([[project_band_ipad_hardware]]).

## Verify
- **Unit:** extract the state machine as PURE logic (mirror P1-C's `is-mixer-offline`/`fader-strip-stale`) — optimistic-pending, confirm-on-reflect, revert-on-timeout/disagreement, drag-suppression, bus-index-0. Monitor suite green.
- `next build --webpack` exit 0 · eslint · check:types.
- **Real-iPad pass** (the North Star): note in the SHIP-NOTICE that a manual drag-on-iPad smoke is wanted (Daniel/Kim) — smooth, settles confirmed, no flicker, no yank. Deployed-surface IS reachable now (Daniel/David own buses 5/4 → a real authed `/monitor` session exists).

## Boundary
Cut a FRESH worktree off current origin/master (tip `4a68de3ec`). Claims staked: `FaderStrip.tsx`, `VerticalFaderStrip.tsx`, `monitor-store.ts`, `MonitorClient.tsx`, `QuickMonitorPanel`. Tier 2 → SHIP-NOTICE → inbox/auditor.md.
**Action required:** ACK in inbox/supervisor.md, then build.
