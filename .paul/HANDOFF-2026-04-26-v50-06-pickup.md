# PAUL Handoff

**Date:** 2026-04-26 (after Phase v50-05 close + transition)
**Status:** paused — clean checkpoint at phase boundary (v50-05 closed; v50-06 ready to plan)

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** sheet-music-app (CentralReform.live) — worship band setlist/chart app for Central Reform Congregation.
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

---

## Current State

**Milestone:** v5.0 — Bulletproof Editor (Local-First Rewrite) — **5 of 7 phases complete (~85%)**
**Phase to plan next:** v50-06 — Concurrent-edit safety + offline + cross-tab
**Last phase shipped:** v50-05 — Spreadsheet editor UI cutover (5 plans, end-to-end)

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Phase v50-05 closed; ready to plan v50-06]

v50-01 ✓✓✓   v50-02 ✓✓✓   v50-03 ✓✓✓   v50-04 ✓✓✓   v50-05 ✓✓✓ (5/5 plans)
v50-06: ○ ──▶ ○ ──▶ ○     [Plan: concurrent-edit safety + offline + cross-tab]
v50-07: ○ ──▶ ○ ──▶ ○     [Plan: migration + kitchen-sink Playwright + cutover]
```

**Working tree:** clean. **Branch:** master, in sync with origin/master after phase close.

---

## What Was Done (this session)

Shipped Phase v50-05 (Spreadsheet editor UI cutover) end-to-end across 5 plans. Production /setlists/[id] now serves desktop + iPad + phone audiences with full feature parity, accessibility-clean by jest-axe, with Cmd-Z undo end-to-end.

### v50-05-04 (iPad/touch + ContextMenu) — closed earlier this session
Commits `a18736b..1a8ea53`:
- TouchOrPopover wrapper (Popover↔Sheet via useMediaQuery('(pointer: coarse)')) across 6 dropdown sites
- 44px-min touch targets via `[@media(pointer:coarse)]:` Tailwind classes
- ChartBindPopover lifted to controllable open state
- Radix ContextMenu on rows (Edit/Bind chart/Duplicate/Delete) with selection-aware action targeting
- 500ms long-press for touch via synthetic contextmenu MouseEvent dispatch
- Global window.matchMedia stub via vitest setupFiles

### v50-05-05 (mobile + Undo + WCAG AA) — closed this session
Commits `b23fae1..7bdcabf`:
- **Task 1 (3e19bf0):** Mobile parallel render path keyed on `(max-width: 767px)` — MobileCardList + MobileRowCard + MobileEditSheet (full-screen Radix Sheet form). Long-press 500ms on cards opens ContextMenu mirroring desktop. Mobile reorder via swap-orders applyEdit pair in edit Sheet.
- **Task 2 (2260a21):** Cmd/Ctrl-Z undo via PLAIN zustand store (NOT zundo — temporal middleware was wrong granularity for per-cell-blur snapshots). New `src/lib/local/undo-store.ts` with manual pushEntry / popUndo / popRedo + per-key burst coalescing (UNDO_BURST_MS=500ms; first-prev wins, latest-new wins) + cap 50 + ephemeral. applyEdit augmented with `ApplyEditOptions` (withoutUndo + undoKey); composite-undo entries for bulk-set / bulk-delete / drag-end / Duplicate row (one user gesture = one undo step); INPUT/TEXTAREA/SELECT/contenteditable skip per v4.2 P2-04 precedent.
- **Task 3 (e2f1daa):** WCAG AA audit via jest-axe + axe-core devDeps. 7 axe scan cases + 1 keyboard Tab-order case → ZERO violations on first run. Design system internalized correctly across v50-05-01..05; no in-place fixes needed.
- **Phase close (7bdcabf):** SUMMARY + STATE + ROADMAP + PROJECT sync.

### Net phase delivery
- ~+13,000 / −6,300 LOC across v50-05
- +159 vitest cases (1218 → 1410); cross-tab-lock pre-existing flake passed in latest run
- jest-axe ZERO a11y violations across 7 mounted-and-interactive states
- zero production regressions
- /ui-ux-pro-max invoked at every APPLY per SPECIAL-FLOWS.md mandate
- New devDeps added in v50-05-05: jest-axe ^10.0.0 + @types/jest-axe ^3.5.9 + axe-core ^4.11.3 (zundo NOT added — plain zustand was right shape)

---

## What's In Progress

Nothing — v50-05 fully closed at a clean phase boundary. Working tree clean. origin/master in sync. Phase close commit `7bdcabf` pushed.

**Deferred carryover (NOT blocking v50-06):**
- Production smoke human-verify of v50-05-02 + v50-05-03 + v50-05-04 + v50-05-05 (deferred-smokes #4-#7 in STATE.md). User pattern: "I'll look at it later"; not blocking forward planning.

---

## What's Next: Plan v50-06 (Concurrent-edit safety + offline + cross-tab)

### Scope (per ARCHITECTURE.md §6.9 + v50-05 deferrals)

- **§6.9 "Remote changed — keep mine / take theirs" reconciliation banner** via local-first IDB diff. Two-tab edit scenarios pass.
- **expectedUpdatedAt tracking on track updates** — deferred from v50-05-01. Honest LWW precondition: editor maintains last-server-confirmed updatedAt per row; on remote-update detection, surface the conflict to the user.
- **Cross-tab-lock test flake fix** — substrate for concurrent-edit safety. Same lock primitive that the reconciliation modal needs to coordinate. Historically intermittent (1410/1410 passed in latest run, but root cause is open).
- **Cross-leader live-edit visibility** — real-time setlist sync. Replacement for the deleted v50-02 live-swap UI. Verify leader edits during a service propagate to musicians' performance views without staleness.
- **Airplane-mode test scenarios** — verify the v50-03 sync engine handles offline gracefully + resumes correctly on reconnect.
- **Performance view audit** — read-only on the new doc shape; verify real-time setlist sync works correctly when leader edits during a service.

### Reusable from v50-05

- **`undo-store` pushEntry pattern** — each conflict resolution can be its own undo unit (use `applyEdit({withoutUndo: false})` for resolution writes; user's resolution choice becomes undoable).
- **`applyEdit`'s `withoutUndo` flag** — for any reconciliation-internal writes that shouldn't pollute the undo stack.
- **Composite-undo fan-out pattern** — for any multi-doc resolution that should undo as one step.
- **`flushAllBursts` pattern** — synchronous flush before a state read. Useful for showing the diff: flush pending edits first, then compute the diff against the remote state.
- **`<TouchOrPopover>` wrapper, `useGridSelection`, `<DeleteConfirmProvider>`, `<ChartBindPopover>` controllable open** — all carry forward.
- **jest-axe + axe-core** test infrastructure — any new modal (e.g. reconciliation banner) can add an axe scan case to `SetlistGrid.a11y.test.tsx`.
- **Real timers (NOT vi.useFakeTimers)** for any timer-driven tests — fake timers conflict with fake-indexeddb microtask scheduling and Dexie live-query teardown.

### Blocking concerns

- **Cross-tab-lock test flake** MUST be root-caused before shipping concurrent-edit safety. Same lock primitive is the substrate for the reconciliation modal's coordination. Latest run passed (1410/1410), but historically intermittent.

### Required skill

**`/ui-ux-pro-max` is BLOCKING for APPLY** per `.paul/SPECIAL-FLOWS.md`. Frontend changes expected (reconciliation banner / modal). Load before APPLY (not before PLAN).

---

## Key Files (for v50-06 to read/extend)

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | v5.0 phase overview (5 of 7 phases done; v50-06 + v50-07 remain) |
| `.paul/PROJECT.md` | Project facts + decisions table (extensive — 290+ rows) |
| `.paul/SPECIAL-FLOWS.md` | Required-skill registry (`/ui-ux-pro-max`) |
| `.paul/phases/v50-01-architecture/ARCHITECTURE.md` | §6.9 (reconciliation banner) is the binding scope source |
| `.paul/phases/v50-05-spreadsheet-editor/v50-05-05-SUMMARY.md` | What just shipped (mobile + Undo + WCAG) — patterns reusable for v50-06 |
| `src/lib/local/sync-engine/*` | Sync engine (locked since v50-03); reconciliation observes its state, doesn't reach inside |
| `src/lib/local/write.ts` | applyEdit + ApplyEditOptions (withoutUndo + undoKey) |
| `src/lib/local/undo-store.ts` | undo-store pattern reusable for conflict resolutions |
| `src/lib/local/cross-tab-lock.ts` | Cross-tab single-leader lock (substrate; flake here = blocker) |
| `src/components/setlist/grid/SetlistGrid.tsx` | Editor host — reconciliation banner mounts inside |
| `src/components/setlist/grid/DeleteConfirmProvider.tsx` | Provider/dialog pattern reusable for reconciliation modal |

---

## Key Context (don't relearn)

- **Band is NOT in production right now.** Broken-for-band periods during v50-06/07 are acceptable (per milestone constraint).
- **Push to `origin master`** (not `master:main`). Deploy straight to production on Vercel; no preview branches.
- **User works from multiple computers** — pull before starting any session.
- **No feature branches in v50** — hard cutover convention.
- **Production migrate-v50.ts apply** still deferred to v50-07 — split-brain (legacy embedded `setlists/{id}.tracks[]` + new top-level `tracks/{id}` docs) becomes more pronounced as v50-06 ships more concurrent writes per session. Not blocking v50-06; remains v50-07 imperative.
- **Pre-existing Sentry deprecation warning** during `next build` (`onRequestError` hook) carries over from v50-05; cosmetic; not a regression. Folded into a future dep-cleanup pass.
- **`useGridSelection.pruneTo`** pattern (surgical stale-row cleanup with anchor preservation) applicable to v50-06 reconciliation if local selection state needs to survive remote mutations.
- **dnd-kit ARIA override placement rule** — any future drag-kit-wrapped element with custom aria semantics MUST place `aria-pressed` / `aria-label` AFTER the `{...attributes}` spread.
- **REAL timers > fake timers** for any timer-driven test in this codebase (Dexie + fake-indexeddb microtask race).

---

## Outstanding (carryover, not blocking v50-06)

- **Cross-tab-lock test flake** — substrate for v50-06; ROOT-CAUSE before shipping concurrent-edit safety.
- **Production `migrate-v50.ts` apply** — deferred to v50-07.
- **`openai` npm dep + `template-parser.ts`** orphans from v50-02 — safe to delete in a future dep-cleanup pass.
- **`useBatchSelection` hook** — orphaned from v50-05-02 amputation (no consumers; different model from `useGridSelection`).
- **Sentry deprecation** — `sentry.client.config.ts` → `instrumentation-client.ts` rename. Cosmetic.
- **Production smoke verification of v50-05-02 + v50-05-03 + v50-05-04 + v50-05-05** — deferred-smokes #4 + #5 + #6 + #7. User backlog.
- **Manual Lighthouse audit on prod /setlists/[id]** — added to deferred-smokes #7. jest-axe is the automated proxy; Lighthouse covers things axe doesn't (color contrast at runtime with real CSS, focus order across keyboard navigation, runtime aria-live timing).

---

## Resume Instructions

1. `git pull origin master` (multi-computer workflow).
2. `/paul:resume` — will load STATE, archive this handoff, and route to `/paul:plan` for v50-06.
3. **Before writing the v50-06 plan:** read `.paul/phases/v50-05-spreadsheet-editor/v50-05-05-SUMMARY.md` for the patterns v50-06 extends (undo-store pushEntry, applyEdit's withoutUndo escape hatch, composite-undo fan-out, flushAllBursts, jest-axe test infrastructure).
4. **Plan size guidance:** v50-06 likely splits into 2-3 plans by concern. Suggested:
   - Plan 01 — Cross-tab-lock test flake fix + expectedUpdatedAt tracking (substrate stabilization).
   - Plan 02 — Reconciliation modal (§6.9) — Remote changed → Keep mine / Take theirs flow with two-tab integration tests.
   - Plan 03 — Real-time setlist sync verification (cross-leader live-edit visibility) + airplane-mode scenarios + performance view audit.
   - Final structure to be decided at `/paul:plan` time based on scope reading.
5. **Before APPLY:** invoke `/ui-ux-pro-max` per SPECIAL-FLOWS.md (BLOCKING).

---

*Handoff created: 2026-04-26 (after phase v50-05 close at commit `7bdcabf`)*
*Pause reason: phase boundary clean checkpoint — context budget at 84%; v50-06 deserves a fresh session with full headroom for the reconciliation-modal architecture decisions*
