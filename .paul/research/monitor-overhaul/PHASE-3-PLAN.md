# Monitor Overhaul — Phase 3 Plan (iPad UX end-to-end — the North Star surface)

> **Parent:** `PROGRAM-SPEC.md` §2,§5,§6 · `DEFECT-REGISTER.md` §5 (Phase-3 map) + C-2/C-3/C-6/C-8/C-11/C-12.
> **Gated on:** Phase 1 LIVE ✅ — P1-A's query-after-command confirmed-value signal is running in prod (v10.0.1, confirmed 2026-05-22: `monitor-live/state` self-advances + reflects confirmed values; Daniel's iPad round-trip works). That was C-2's blocker; it's cleared.
> **Status:** DRAFT for Daniel ratify. Dispatch after ratify.
> **Note on sequencing:** doing Phase 3 BEFORE Phase 2 is intentional + sound — the confirm/revert UX rides the now-live `monitor-live/state` reflection, NOT the Phase-2 ack surface. Only C-9 (per-command rejection-reason UX) needs Phase-2 acks → deferred.

**Goal:** make the iPad fader *feel* correct and trustworthy — a musician's own move shows **optimistic → confirmed from authoritative state → (or) reconciled** without the jarring revert-then-reapply, an incoming snapshot never yanks a fader they're actively dragging, others' moves reflect cleanly, and staleness/offline is honest on every monitor surface. This is the North Star UX layer on top of Phase 1's now-correct round-trip.

**Executable acceptance:**
- **Unit:** the fader state machine extracted as PURE, testable logic (mirror P1-C's `is-mixer-offline`/`fader-strip-stale` pattern) — covering optimistic-pending, confirm-on-reflect, revert-on-timeout/disagreement, drag-suppression, and bus-index-0. Plus monitor unit suite stays green.
- **Build/lint/types:** `next build --webpack` exit 0 · eslint clean · `check:types` in sync.
- **Real-hardware pass (the North Star):** a manual smoke on an 11" iPad (820×1180, [[project_band_ipad_hardware]]) — drag a fader: it moves smoothly, settles confirmed (no snap-back flicker), and a concurrent change from another source doesn't fight the drag. (Daniel/Kim or an iPad emulation pass; full multi-iPad soak is Phase 4.)

**Closes:** C-2 (fader confirmation state machine), C-3 (replace 2s safety snap-back), C-12 (drag-suppression on snapshot apply), C-11 (bus-index-0 treated as "no bus"), C-8 (empty-snapshot stale-while-revalidate masking), C-6 remainder (staleness cues on `VerticalFaderStrip`/`QuickMonitorPanel` perform-toolbar surfaces P1-C left untouched).
**Deferred (needs Phase 2 ack surface):** C-9 (precise "your command was rejected because X" UI) — the ack doc `monitor-live/acks/{commandId}` is Phase 2; Phase 3 ships the optimistic/confirm/revert machine that rides state reflection, and C-9 layers richer failure reasons on top later.

---

## Scope = ONE lane (do NOT fragment the iPad consumer plane)

The fader state machine touches a tightly-coupled cluster — `FaderStrip.tsx` / `VerticalFaderStrip.tsx` / `monitor-store.ts` / `MonitorClient.tsx` — the same files P1-C just shipped. Splitting these across coders would re-trigger the shared-worktree race ([[feedback_shared_worktree_race]], [[feedback_agent_count_quality_over_quantity]] "don't fragment MonitorClient.tsx"). **Phase 3 = a single lane, single owner.** Recommended owner: **coder-5** (shipped P1-C; owns this code's current shape).

### Lane P3-A — iPad fader confirmation UX — coder-5, web/iPad consumer, Tier 2
**Surface:** `src/components/monitor/{FaderStrip,VerticalFaderStrip}.tsx`, `src/lib/monitor-store.ts`, `src/app/(main)/monitor/MonitorClient.tsx`, perform-toolbar `QuickMonitorPanel`, + NEW pure helper(s) for the state machine. (Verify exact file:lines against CURRENT post-P1-C source — P1-C moved things; the DEFECT-REGISTER line numbers predate it. [[feedback_cowork_prompt_verify_before_write]].)

**Build — the fader state machine (C-2/C-3/C-12):**
- Per-fader UI state: `idle` → `dragging` (user touching) → `pending` (optimistic local value + sentAt) → `confirmed` (authoritative `monitor-live/state` reflects ≈ sent value within tolerance) or `reverted` (timeout elapsed OR state settled on a different value → animate to authoritative, no hard snap).
- **Drag-suppression (C-12):** while `dragging`, incoming snapshots do NOT override the fader position (queue/ignore until release) — a cross-device push must never yank an active drag.
- **Replace the crude 2s safety snap-back (C-3)** with the pending→confirmed/reverted reconciliation against `state.updatedAt`-fresh authoritative values (now real, post-P1-A). Tolerance band + timeout tunable (start ~ matched to the P1-A 300ms confirm + a small margin).
- **C-11:** treat bus index 0 as a VALID bus (fix `!myBusIndex` truthiness — use `== null`/explicit checks).
- **C-8:** empty-snapshot handling shouldn't silently freeze last-good in a way that masks a real problem — surface via the existing staleness cue rather than pretending live.
- **C-6 remainder:** carry P1-C's staleness/offline cues onto `VerticalFaderStrip` + `QuickMonitorPanel` (perform-toolbar) so every fader surface is honest, not just the main `/monitor` route.

**Reuse, don't rebuild:** P1-C already shipped `coerce-state.ts` (shared read guard, C-4), `state-freshness.ts`/`useMonitorStaleness` (C-6), `DisconnectedOverlay` mount, `deriveMyBusIndex` (C-7). Build the state machine ON these; do not duplicate them.

**/ui-ux-pro-max is MANDATORY** for this lane ([[feedback_ui_ux_skill]]) — fader affordances, confirm/revert motion (respect `motion-reduce`), color-not-alone cues, 11" iPad touch ergonomics.

**Verify:** pure state-machine unit tests (the acceptance above) + monitor suite green + build/lint/types + the real-iPad manual pass. Tier 2 → SHIP-NOTICE to auditor; deployed-surface note: needs an authed `/monitor` session with an owned bus (Daniel/David own buses 5/4 — a real session IS now possible, unlike the no-band-onboarded C-1/P1-C constraint).

---

## Open forks for Daniel (at ratify)
1. **Owner:** coder-5 (P1-C author, knows the code) — recommended — or a fresh coder? (Single lane either way.)
2. **Parallelism:** run Phase 3 solo, OR start **Phase 2 bridge observability** (coder-1, disjoint bridge plane) in parallel to unblock C-9's ack surface sooner? Recommend **Phase 3 solo** for now (you asked for Phase 3; Phase 2 can follow) — but the planes are disjoint if you want both running.
3. **Real-hardware verification:** is a Daniel/Kim manual iPad pass the Phase-3 acceptance, or do you want an automated UI probe (heavier; more naturally Phase 4 soak)? Recommend manual pass now + defer automated multi-iPad to Phase 4.
4. **C-9 deferral:** confirm OK to defer per-command rejection-reason UI to post-Phase-2 (recommended), shipping the confirm/revert machine on state-reflection now.
