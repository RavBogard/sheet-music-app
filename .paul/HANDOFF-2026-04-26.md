# PAUL Handoff

**Date:** 2026-04-26 (later session)
**Status:** paused — clean checkpoint between phases (context-budget pause before tackling the biggest phase of the milestone)

---

## READ THIS FIRST

You have no prior context. This document tells you everything.

**Project:** sheet-music-app (CentralReform.live) — worship band setlist/chart app
**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.

---

## Current State

**Milestone:** v5.0 — Bulletproof Editor (Local-First Rewrite) — **4 of 7 phases complete (57%)**
**Phase:** v50-05 of 7 — Spreadsheet editor UI cutover — **Ready to plan**
**Plan:** None yet

**Loop Position:**
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Loop reset — ready for v50-05 PLAN]

v50-01:  ✓ ──▶ ✓ ──▶ ✓     [Architecture & design — complete]
v50-02:  ✓ ──▶ ✓ ──▶ ✓     [Dead-code amputation — complete]
v50-03:  ✓ ──▶ ✓ ──▶ ✓     [Local-first sync engine — complete]
v50-04:  ✓ ──▶ ✓ ──▶ ✓     [Song catalog & sticky memory — complete]
```

**Working tree:** clean. **Branch:** master, up to date with origin/master.

---

## What Was Done (this session)

Shipped phase **v50-04 Song catalog & sticky memory** end-to-end (PLAN → APPLY → UNIFY) in one session.

- **Dexie v→2 schema bump** — `LocalSong` extended with optional `defaults: { key, lead, bpm }` + `recent: SongRecentEntry[]`. Stores re-declared verbatim in `version(2)` — additive non-indexed; v1→v2 upgrade non-destructive (verified by test).
- **`src/lib/songs/defaults.ts` helper module** — pure data-layer, no UI imports:
  - `seedTrackFromSong(songId)` → reads Dexie songs/{id}.defaults; returns `{}` for missing songs (never throws); coerces unknown fields out
  - `propagateTrackEditToSong(songId, patch, setlistId, opts?)` → 1s debounced (overridable), per-song independent timers, FIFO cap-5 `recent[]`, routes through `applyEdit('update', 'songs', ...)` so the v50-03 sync engine carries the change to Firestore
  - `flushPendingPropagations()` + `__resetForTests()` for tests/teardown
- **`scripts/migrate-v50.ts` Firestore one-shot backfill** — CLI flags `--dry-run` / apply / `--force` / `--rollback` / `--help`:
  - Abstract `MigrationFirestore` interface keeps tests admin-SDK-free
  - `FIELD_DELETE_SENTINEL` Symbol maps to `FieldValue.delete()` in CLI adapter
  - Setlist-invariance sha256 hash check is the regression guard against accidental setlist mutation (deliberate-mutation test confirms abort)
  - Per-song snapshots in `migrations/v50/snapshot/{songId}` enable rollback
  - `system/migrations/v50` marker enforces idempotency
  - Orphan-track filter applied to BOTH dry-run and apply paths for honest counts
  - Production migration apply itself **deferred to v50-07 cutover**
- **inngest CVE bump** — `3.52.3 → 3.54.0` shipped as standalone `chore(deps)` commit (Vercel scanner flagged 3.52.3; clean blame separate from v50-04 features).
- **25 new tests** all green (3 schema + 9 helper + 13 migration). Total **1344/1345**. tsc clean. next build clean (77 routes).
- **6 commits on origin/master**: `695bd1f` (handoff archive) + `58d2725` (Dexie v2) + `d73e891` (helpers) + `d13da61` (migration script) + `12bb330` (inngest CVE) + `a58bdb8` (phase close + SUMMARY + PROJECT/ROADMAP/STATE evolution).

**1 pre-existing flake** in `src/lib/sync/__tests__/cross-tab-lock.test.ts` ("exactly one of two instances acquires the lock") — non-deterministic tabId tie-break, ~50% failure when run in isolation. Out of scope for v50-04 (`src/lib/sync/*` is in DO NOT CHANGE boundary). **Folded into v50-06 plan.**

---

## What's In Progress

Nothing — v50-04 fully closed at a clean checkpoint. Working tree clean. origin/master in sync.

---

## What's Next

**Immediate:** `/paul:plan` for **v50-05 Spreadsheet editor UI (cutover)**.

**This is the biggest phase of v5.0.** Estimated net **−8,400 LOC of legacy editor surface** replaced by a brand-new app-native spreadsheet:

### What gets DELETED (legacy editor surface)
- `src/hooks/use-setlist-logic.ts` (~901 LOC — the silent-fail save engine)
- `src/lib/setlist-flush.ts` (unload-flush keepalive)
- `src/lib/setlist-draft.ts` (drafts/optimistic state)
- `src/components/SetlistEditorV2.tsx` + all its sub-component modals
- Mutation API routes that the new editor's sync engine replaces (any `/api/setlist/*` write paths superseded by the Dexie-rooted flow — to inventory carefully; some like /api/setlist/flush may stay if non-editor surfaces still call it)
- BroadcastChannel-based merge code in the old save loop
- `src/lib/setlist-firebase.ts` *if* zero callers outside the editor surface (verify — print/email/transfer routes may still use it)

### What gets BUILT (new editor)
- App-native spreadsheet on **TanStack Table v8 (headless) + @dnd-kit + Radix Popover + cmdk** (stack locked in v50-01)
- Click-cell inline editing; type-to-filter dropdowns on Key/Lead/Type; tab/enter navigation; drag-handle reorder
- Add-row at bottom auto-focuses
- Wired to v50-03 sync engine — every cell commit goes through `applyEdit('update', 'tracks', ...)` etc.
- Wired to v50-04 helpers — add-song calls `seedTrackFromSong(songId)` to pre-populate; cell commits on key/lead/bpm call `propagateTrackEditToSong(songId, patch, setlistId)`
- Sync indicator (top bar) reflecting v50-03's 6-state FSM
- Empty state for new setlists with zero rows
- iPad/touch variant + mobile (one-handed phone) variant
- WCAG AA accessibility checklist from §6.13

### Binding spec
**ARCHITECTURE.md §6** at `.paul/phases/v50-01-architecture/ARCHITECTURE.md`. Read in full before planning. Key sub-sections:
- §6.1 Design tokens (project-locked, applied here)
- §6.2 Default desktop view
- §6.3 Cell-edit interactions
- §6.4 Row reorder (drag-and-drop)
- §6.5 Add-row / delete-row
- §6.6 Multi-select / batch edit
- §6.7 Touch / iPad variant
- §6.8 Sync indicator (top bar)
- §6.9 "Remote changed" reconciliation banner — **defer to v50-06** (concurrent-edit safety phase)
- §6.10 Empty state
- §6.11 Mobile-only flow (one-handed phone)
- §6.12 Concessions called out
- §6.13 Accessibility checklist (binding)

### REQUIRED SKILL — BLOCKING
**`/ui-ux-pro-max` is mandatory** per `.paul/SPECIAL-FLOWS.md` for any phase touching frontend UI/UX. APPLY will be **blocked** until this skill is invoked. Load it before APPLY.

### Cutover constraint
App will be **intentionally broken-for-band during this phase** (acceptable per v5.0 milestone constraint — band is not in production right now, waiting on dependability). No parallel-editor scaffolding, no feature flags, hard cutover. This is the phase the user signed up for.

**After v50-05:** v50-06 (Concurrent-edit safety + offline + cross-tab) — also includes the cross-tab-lock test flake fix flagged above. Then v50-07 (Migration, kitchen-sink, cutover) — runs migrate-v50.ts on prod for real, Playwright kitchen-sink suite, ship to band.

---

## Key Files

| File | Purpose |
|------|---------|
| `.paul/STATE.md` | Live project state |
| `.paul/ROADMAP.md` | v5.0 phase overview (4/7 complete) |
| `.paul/PROJECT.md` | Project facts + decisions table |
| `.paul/SPECIAL-FLOWS.md` | Required-skill registry (`/ui-ux-pro-max`) |
| `.paul/phases/v50-01-architecture/ARCHITECTURE.md` | Binding architecture (§6 = spreadsheet editor spec — REQUIRED READING for v50-05) |
| `.paul/phases/v50-04-song-catalog/v50-04-01-SUMMARY.md` | What just shipped (helpers + migration script) |
| `src/lib/songs/defaults.ts` | Sticky-memory helpers — v50-05 imports both functions from `@/lib/songs/defaults` |
| `src/lib/local/{schema,types,write}.ts` | Dexie foundation (v2 schema + applyEdit) |
| `src/lib/sync/engine.ts` | Sync engine — already drives applyEdit through to Firestore |
| `src/hooks/use-setlist-logic.ts` | LEGACY (901 LOC) — to be deleted in v50-05 |
| `src/components/SetlistEditorV2.tsx` | LEGACY — to be deleted in v50-05 |
| `src/lib/setlist-firebase.ts` | LEGACY — verify all callers before deletion |
| `scripts/migrate-v50.ts` | Production migration script (apply deferred to v50-07) |

---

## Key Context (don't relearn)

- **Band is NOT in production right now** (waiting on dependability). Broken-for-band periods during the rewrite are acceptable. No parallel-editor scaffolding, no feature flags, hard cutover.
- **Push to `origin master`** (not `master:main`). Deploy straight to production on Vercel; no preview branches.
- **User works from multiple computers** — pull before starting any session.
- **Test pattern locked in:** Dexie-touching tests use FakeClock injection (NOT `vi.useFakeTimers` — races with fake-indexeddb microtask scheduling). Use macrotask flush helper from `engine.test.ts`.
- **Per-doc ordering invariant** is part of the engine contract from v50-03. Any change to drainOnce() must preserve "only oldest pending row per (collection, docId) drains; sending/failed rows block later same-doc rows."
- **Schema bumps to v(2) are additive non-indexed only** (v50-04 lesson). New indexed fields → v(3).
- **Sticky-memory debounce default = 1000ms** in `propagateTrackEditToSong`; v50-05 editor should pass through to that default unless the editor's own UX needs override.
- **Migration script abstraction pattern:** core takes `MigrationFirestore` interface; CLI adapter wires firebase-admin. Reusable for future migrations.
- **Vercel build advisories** (informational, non-blocking): Sentry recommends renaming `sentry.client.config.ts` → `instrumentation-client.ts` (deferred); `update-build-info.js` git-tag warning is cosmetic (Vercel shallow clone has no tags).

---

## Outstanding (carryover, not blocking v50-05)

- **Cross-tab-lock test flake** (`src/lib/sync/__tests__/cross-tab-lock.test.ts`) — non-deterministic tabId tie-break. Fold into v50-06 plan when it touches cross-tab logic.
- **Production `migrate-v50.ts` apply** — deferred to v50-07 cutover. Script is shipped + dry-run-tested today.
- **`openai` npm dep + `template-parser.ts`** orphans from v50-02 amputation — safe to delete in a future dep-cleanup pass; not blocking.
- **Sentry deprecation** — `sentry.client.config.ts` → `instrumentation-client.ts` rename. Cosmetic; deferred.
- **Property test `numRuns = 20`** in v50-03 harness; crank to 100+ in monthly soak runs (separate concern).

---

## Resume Instructions

1. `git pull origin master` (multi-computer workflow)
2. `/paul:resume` — will load STATE, archive this handoff, and route to v50-05 PLAN
3. **Before APPLY (not before PLAN):** invoke `/ui-ux-pro-max` — required by SPECIAL-FLOWS.md
4. Read `.paul/phases/v50-01-architecture/ARCHITECTURE.md` §6 in full before drafting the v50-05 plan
5. Inventory the legacy editor surface (grep for callers of `setlist-firebase.ts`, `use-setlist-logic.ts`, `SetlistEditorV2`) before declaring delete scope
6. The plan should split into multiple plans if it exceeds 3 tasks; vertical slices preferred (per plan-format.md guidance)

---

*Handoff created: 2026-04-26*
*Pause reason: context-budget — v50-05 is the largest phase of the milestone and deserves a fresh session*
