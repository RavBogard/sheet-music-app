---
phase: v50-01-architecture
plan: 01
subsystem: architecture
tags: [local-first, dexie, tanstack-table, dnd-kit, radix, cmdk, sync-engine, lww, sticky-memory, idb]

requires:
  - phase: v45-01
    provides: save-path observability (request-ID telemetry baseline; informs §3 sync state machine)
  - phase: v4.4-Phase5
    provides: AsyncLocalStorage request-ID propagation (referenced by §6.8 sync indicator tooltip)

provides:
  - Locked architectural decisions for v5.0 editor rewrite
  - Stack choices (Dexie + outbox; TanStack Table v8 + @dnd-kit + Radix + cmdk)
  - Doc-in-IDB model (normalized rows + LWW per-document)
  - Sync engine state machine (6 states, retry policy, cross-tab coordination)
  - Song catalog schema with sticky memory (per-song global granularity)
  - Migration approach (one-shot in-place + dry-run + rollback snapshots)
  - Spreadsheet editor UX wireframes (desktop + iPad + phone + a11y)
  - Amputation scope (AI chat + live-swap UI deletion plan)

affects:
  - v50-02 (Dead-code amputation) — ARCHITECTURE.md §7 is the inventory
  - v50-03 (Sync engine) — ARCHITECTURE.md §1, §2, §3 binding
  - v50-04 (Song catalog) — ARCHITECTURE.md §4 binding
  - v50-05 (Editor UI) — ARCHITECTURE.md §1 (editor stack), §6 (wireframes) binding
  - v50-06 (Concurrent-edit safety) — ARCHITECTURE.md §3 (Conflict state) + §6.9 (modal) binding
  - v50-07 (Migration & cutover) — ARCHITECTURE.md §5 binding

tech-stack:
  added: []   # No code shipped this phase; libraries chosen, install in v50-03+
  patterns:
    - "Local-first writes: every edit commits to IDB synchronously; sync engine pushes async"
    - "Outbox pattern: every mutation enqueues an outbox row in the same Dexie transaction"
    - "Sticky memory: per-song global defaults seed at add-time; per-track override preserved"
    - "Spreadsheet UX: cell selection vs. cell edit modes with explicit transitions"

key-files:
  created:
    - .paul/phases/v50-01-architecture/ARCHITECTURE.md
  modified:
    - .paul/ROADMAP.md (v5.0 expanded to 7 phases)
    - .paul/STATE.md (phase position, decisions table)

key-decisions:
  - "Local-first stack: Dexie 4.x + hand-rolled outbox (rejected LiveStore/RxDB/TanStack-Persister)"
  - "Editor stack: TanStack Table v8 headless + @dnd-kit + Radix + cmdk (rejected AG Grid Community / pure hand-rolled)"
  - "Doc-in-IDB: normalized rows + LWW per-document (rejected JSON-blob, rejected CRDT)"
  - "Sticky memory granularity: per-song global (rejected per-leadMusician, per-rabbi)"
  - "Migration: one-shot in-place + idempotent + dry-run + rollback snapshots (band not in production allows downtime)"
  - "Scope expansion: amputate AI chat + live-swap UI as new Phase v50-02 before sync engine work"

patterns-established:
  - "IDB schema: separate stores for setlists / tracks / songs / outbox / meta; compound indexes for hot paths"
  - "Sync state machine: Idle / Dirty / Saving / Conflict / Failed / Offline with explicit transitions"
  - "Truthful sync indicator: state mapped to user-visible label using both color + icon shape"
  - "Reconciliation = blocking modal with per-field keep-mine/take-theirs (not silent merge, not banner)"

duration: ~3h (single session: discuss-milestone → milestone → plan → apply → unify)
started: 2026-04-26
completed: 2026-04-26
---

# Phase v50-01 Plan 01: Architecture & design — Summary

**Locked the v5.0 architecture: Dexie + hand-rolled outbox for local-first storage, TanStack Table v8 + @dnd-kit + Radix + cmdk for the spreadsheet editor, normalized rows with LWW, per-song global sticky memory, and a 6-state sync FSM. Amputation scope (AI chat + live-swap UI) added mid-phase as new Phase v50-02.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~3h (single session) |
| Started | 2026-04-26 |
| Completed | 2026-04-26 |
| Tasks | 3 auto + 1 checkpoint, all complete |
| Files modified | 4 (ARCHITECTURE.md created; ROADMAP, STATE, MILESTONE-CONTEXT lifecycle) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Stack decisions documented with rationale | ✅ Pass | §1: matrices for local-first (4 candidates) + editor (3 candidates); chosen + rejected-because for each |
| AC-2: Data model, state machine, schemas, migration | ✅ Pass | §2 doc-in-IDB; §3 sync FSM (6 states + retry); §4 song catalog; §5 migration approach |
| AC-3: Spreadsheet editor UX wireframes | ✅ Pass | §6 covers desktop + cell-edit table + drag-reorder (3 modalities) + add/delete/multi-select + iPad + sync indicator + reconciliation modal + empty state + mobile + a11y checklist |
| AC-4: User signs off on ARCHITECTURE.md | ✅ Pass | Approved 2026-04-26 after one round of revisions (scope expansion to add §7 amputation) |

## Accomplishments

- **Architectural foundation locked.** Six interlocking decisions (storage, editor, doc model, sync FSM, sticky memory, migration) committed to ARCHITECTURE.md with full rationale and rejected alternatives. Subsequent phases execute against this without re-litigating.
- **Mid-phase scope expansion handled cleanly.** User opted to amputate AI chat + live-swap UI; new Phase v50-02 inserted, all subsequent phases renumbered v50-02 → v50-03..v50-07, ROADMAP and STATE updated coherently.
- **/ui-ux-pro-max applied to Task 3.** Wireframes incorporate WCAG AA contrast, 44×44px touch targets, focus rings, both color + icon-shape state encoding, and `prefers-reduced-motion` handling per the skill's guidance.

## Task Commits

Phase v50-01 produced one artifact (a sign-off doc); no code shipped, no atomic per-task commits. A single phase-level commit will land at transition (pending user approval).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Stack research & decision matrix | (pending phase commit) | docs | §1 written |
| Task 2: Data model, state machine, schemas, migration | (pending phase commit) | docs | §2-5 written |
| Task 3: Spreadsheet editor UX wireframes | (pending phase commit) | docs | §6 written |
| Task 4: Sign-off checkpoint | (pending phase commit) | docs | §7 added per user expansion; sign-off granted |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `sheet-music-app/.paul/phases/v50-01-architecture/ARCHITECTURE.md` | Created | Sign-off doc (~21 KB, 7 sections) — binding architecture for v50-02..v50-07 |
| `sheet-music-app/.paul/phases/v50-01-architecture/v50-01-PLAN.md` | Created (during /paul:plan) | The plan that produced this phase |
| `sheet-music-app/.paul/phases/v50-01-architecture/v50-01-SUMMARY.md` | Created (this file) | Loop-closure record |
| `sheet-music-app/.paul/ROADMAP.md` | Modified | v4.5 marked superseded; v5.0 added (now 7 phases) |
| `sheet-music-app/.paul/STATE.md` | Modified | Position, loop, decisions, session continuity |
| `sheet-music-app/.paul/MILESTONE-CONTEXT.md` | Created → Deleted | Handoff file from /paul:discuss-milestone, removed by /paul:milestone after consumption |
| `sheet-music-app/.paul/phases/v50-02-amputation/` | Created | Empty dir; populated when v50-02 plan lands |
| `sheet-music-app/.paul/phases/v50-{03..07}-*/` | Renamed | Phase dirs renumbered to accommodate inserted v50-02 |

No source code (`src/**`), tests, or `package.json` modified. Plan boundary respected.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Local-first via Dexie + hand-rolled outbox | BYO sync needed (Firestore is the backend, not Dexie's choice); smallest bundle (~31 KB); best iPad-Safari maturity; zero licensing risk | v50-03 sync engine builds directly on Dexie 4.x with `hooks.creating/updating` for outbox enqueue inside transactions |
| Editor on TanStack Table v8 headless | Tailwind/shadcn aesthetic preserved; ~30 KB total stack vs. 180–300 KB AG Grid; AG Grid's rich-select + multi-drag are Enterprise-paid anyway | v50-05 editor implementer wires custom cells (Radix Popover + cmdk for type-to-filter dropdowns; @dnd-kit/core 6.3.x for drag-reorder) |
| Normalized rows + LWW per-document (no JSON blob, no CRDT) | Single-leader workflow makes CRDT overkill (+50 KB, migration complexity); normalized rows enable indexed queries (library picker fuzzy search) | v50-03 IDB schema: `setlists / tracks / songs / outbox / meta` Dexie stores |
| Per-song global sticky memory (not per-lead, not per-rabbi) | Matches user's stated mental model ("key/lead/BPM should move with the track everywhere"); simpler propagation rules | v50-04 promotes `songs/{id}` with `defaults` + `recent[]`; backfills from existing setlist data |
| One-shot in-place migration + dry-run + rollback snapshots | Band not in production → downtime allowed; cheaper than parallel-collection or lazy strategies for live users | v50-07 ships a single `migrate-v50.ts` script with `--dry-run` and `--rollback`; verifies setlist invariance + song-default backfill |
| Scope expansion: amputate AI chat + live-swap UI | User doesn't use the AI chat; live-swap UI is over-engineered (replacement = real-time setlist sync from new sync engine, no special swap surface needed) | New Phase v50-02 inserted; ~3,000 LOC net deletion ahead of any new code |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Major: ~3,000 LOC deletion + 1 new phase |
| Deferred | 0 | — |

**Total impact:** One material scope expansion, surfaced and approved at the sign-off checkpoint exactly as designed. The plan's checkpoint mechanism worked.

### Scope additions

**1. Amputation of AI chat + live-swap UI (new Phase v50-02)**
- **Found during:** Sign-off checkpoint discussion ("are there other directions or options we should consider instead?")
- **Issue:** Plan scoped only to editor rewrite. Pressure-testing revealed dead surfaces (AI chat user doesn't recognize; live-swap system over-engineered relative to "edits propagate via real-time sync" replacement that the new sync engine provides for free).
- **Fix:** Added §7 Amputation Scope to ARCHITECTURE.md; inserted Phase v50-02 (Dead-code amputation) ahead of sync engine work; renumbered v50-02..v50-06 → v50-03..v50-07; updated ROADMAP, STATE, phase directories accordingly.
- **Files:** `ARCHITECTURE.md` (+§7), `ROADMAP.md` (table + intro), `STATE.md` (decisions table), phase directories (renamed via `mv`)
- **Verification:** Phase number references inside ARCHITECTURE.md verified consistent across all 21 occurrences via grep
- **Commit:** (pending phase commit)

### Deferred items

None — the plan executed exactly as written, plus the one scoped expansion above.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Initial bulk-rename of phase numbers (replace_all `v50-02` → `v50-03`) conflated old-v50-02 (sync) and old-v50-03 (catalog) references | Followed up with targeted Edit calls per remaining reference; verified via `grep -n 'v50-' ARCHITECTURE.md` that all references are now correct |

## Next Phase Readiness

**Ready:**
- ARCHITECTURE.md is binding; v50-02 has §7 inventory, v50-03 has §§1-3, v50-04 has §4, v50-05 has §§1+6, v50-07 has §5 — every phase knows what to build before it starts.
- Phase directories scaffolded for v50-02..v50-07.
- ROADMAP and STATE consistent with the 7-phase shape.

**Concerns:**
- Dexie bus-factor 1 (single maintainer). Mitigated by Apache-2.0 + small surface area; flagged in §1.1.
- TanStack Table v8 → v9 migration looms (v9 still alpha as of late 2025); flagged in §1.2.
- iOS Safari can evict IDB after 7 days for non-PWA-installed users; mitigation = "Add to Home Screen" prompt in onboarding (deferred to v50-05+ UX work).
- Hand-rolled cells + drag handlers = ~1,200 LOC of new code; v50-05 is the largest phase and the most likely schedule slip.

**Blockers:**
- None.

---
*Phase: v50-01-architecture, Plan: 01*
*Completed: 2026-04-26*
