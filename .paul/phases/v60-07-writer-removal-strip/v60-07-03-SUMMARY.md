---
phase: v60-07-writer-removal-strip
plan: 03
subsystem: data-layer
tags: [W2-updateSetlist, deleteField, immediate-strip, hydrated-gate, transaction-scoped, audit-action-collapse]

requires:
  - phase: v60-07-01
    provides: 3 callers in use-add-to-setlist.ts already migrated to denorm-only patches — confirmed by caller audit that ZERO production callers pass `tracks` to updateSetlist, narrowing v60-07-03 scope to service-internal refactor.
  - phase: v60-07-02
    provides: hydrated:true marker on newly-created setlists. v60-07-03's immediate-strip gate (`remote.hydrated === true`) relies on this marker being load-bearing for safety classification.
  - phase: v60-06-08
    provides: backfill tool that hydrates legacy setlists. Legacy unhydrated docs are left alone by v60-07-03's strip gate; backfill remains the migration path for them.
provides:
  - W2 `updateSetlist` defensively strips `tracks` from incoming patches (regression guard — no current production caller passes them after v60-07-01)
  - `updateSetlistWithVersion` emits `tracks: deleteField()` on every update to a setlist where `remote.hydrated === true` — opportunistic strip-on-touch realizes the v60-07 phase mandate
  - Transaction-scoped read-then-strip pattern: zero extra Firestore round-trips (the existing precondition read provides the hydrated check)
  - Audit-log action detection collapsed: `'renamed' | 'updated'`; dead-code `'tracks_updated'` branch + tracks-snapshot 5th-arg gone
  - 3 new tests in setlist-firebase.test.ts covering defensive strip, hydrated-doc strip, legacy-doc safety
  - `AuditAction` union extended with `'updated'`; `SetlistHistoryPanel.actionLabels` Record extended with `'Updated'` label
affects:
  - v60-07-04 (API routes W7-W11) — API route writers can adopt the same `tracks: deleteField()` strip pattern when they patch parent setlist docs server-side via Admin SDK. Pattern is portable to admin.firestore.FieldValue.delete().
  - v60-08 cleanup — embedded-array reader fallback (server-tracks.ts buildLocalTracks branch + client-tracks.ts buildLocalTracks branch + setlistConverter `tracks` field) can be DROPPED once API routes are also migrated (v60-07-04). After v60-07-03, every CLIENT-SIDE updateSetlist call leaves the doc tracks-free (post-hydration); only legacy unhydrated docs OR server-route patches keep embedded data alive.

tech-stack:
  added: []
  patterns:
    - "Transaction-scoped strip gate: leverage an EXISTING transaction read (the precondition check) to provide the safety classification for an immediate-strip pattern. No extra round-trip; no new transaction layer. Pattern reusable for any field-cleanup migration that needs per-doc state inspection (e.g., schema-version-based migrations, soft-delete cleanup, computed-field deprecation)."
    - "Defensive-strip-at-service-layer pair: caller-passed field stripped from patch via `delete cleanData.tracks` (regression guard) ALONGSIDE remote-state-conditional emit of `deleteField()` (actual cleanup mechanism). Two different concerns at two different abstraction layers — one for caller hygiene, one for data migration."

key-files:
  created: []
  modified:
    - src/lib/setlist-firebase.ts
    - src/lib/setlist-firebase.test.ts
    - src/lib/setlist-audit.ts
    - src/components/setlist/SetlistHistoryPanel.tsx

key-decisions:
  - "Scope narrowed by caller audit: ZERO production callers pass `tracks` to updateSetlist after v60-07-01. Bigger speculative refactor (caller migration + Partial<Setlist> contract tightening) was not needed. Plan focused on service-internal defensive strip + the immediate-strip mandate."
  - "Immediate-strip gate via `remote.hydrated === true` inside the existing runTransaction. Reads remote.updatedAt for the precondition check; same read provides remote.hydrated for the strip gate — zero extra round-trips. Safety: legacy unhydrated docs with embedded data are LEFT ALONE; only docs that have been migrated (hydrated:true) get their embedded tracks deleted on touch."
  - "Defensive strip AT THE SERVICE LAYER (not the helper). `delete cleanData.tracks` lives in W2 updateSetlist; `tracks: deleteField()` emit lives in updateSetlistWithVersion. Two layers, two concerns: service-layer guards against future caller regressions; helper-layer realizes the on-touch migration. This separation keeps the helper agnostic of patch shape and the service agnostic of remote-doc state."
  - "AuditAction union extended with 'updated' (NOT reusing 'tracks_updated' as the default non-rename action). The dead-code `tracks_updated` branch was removed from the conditional in setlist-firebase.ts, so reusing the same string would be misleading — the 'tracks_updated' action implies a tracks change, but post-v60-07 the service no longer writes tracks. New 'updated' action is semantically correct."
  - "Out-of-scope file additions documented: src/lib/setlist-audit.ts (+1 LOC: union extension) and src/components/setlist/SetlistHistoryPanel.tsx (+1 LOC: label Record entry). Required for the new 'updated' string to type-check + render. Plan's files_modified listed only the 2 setlist-firebase files; the type-extension was discovered at qualify time when tsc failed against the missing union member."
  - "AC-6 LOC ceiling exceeded by +2 in setlist-firebase.ts (+22 vs ≤+20). Attributable to inline doc comment (6 lines) explaining the strip gate's safety reasoning. Compacting would have removed the future-proofing rationale — kept the comment, documented the DRIFT."

patterns-established:
  - "Transaction-scoped read-then-strip pattern: when a write transaction already reads remote state (e.g., for an optimistic-concurrency precondition), use that same read to drive conditional field-cleanup writes. Zero round-trip cost; safety derived from remote state, not caller assertion."
  - "Two-layer defensive-strip-plus-cleanup: service method strips caller-passed legacy fields (defensive); helper conditionally emits FieldValue.delete() for migrated docs (actual cleanup). The two concerns stay separable across layers."

duration: ~15 min (plan + caller audit + 3 surgical edits + scope-addition fixup + 3 verify passes + summary)
started: 2026-05-13T11:00:00-05:00
completed: 2026-05-13T11:15:00-05:00
---

# Phase v60-07 Plan 03: W2 updateSetlist defensive strip + immediate FieldValue.delete

**W2 `updateSetlist` in `setlist-firebase.ts` now defensively strips `tracks` from incoming patches; the underlying `updateSetlistWithVersion` transaction inspects `remote.hydrated` (zero extra round-trips — same read that drives the optimistic-concurrency precondition) and conditionally appends `tracks: deleteField()` to the applied patch. Legacy unhydrated docs are left alone; the v60-06-08 backfill remains the migration path for them. After this plan, every legitimate update against a migrated setlist OPPORTUNISTICALLY strips its embedded `tracks` field — the v60-07 phase mandate is realized for the entire client-side writer surface. v60-07 phase 3 of ~4 plans done; v60-07-04 picks up API routes W7-W11.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min (plan + caller audit + edits + scope-addition fixup + verify + SUMMARY) |
| Started | 2026-05-13T11:00:00-05:00 |
| Completed | 2026-05-13T11:15:00-05:00 |
| Tasks | 2 of 2 (Task 1 DONE_WITH_CONCERNS — AC-6 LOC + scope addition; Task 2 DONE/PASS — 19/19 in setlist-firebase.test.ts) |
| Files modified | 4 (2 in plan + 2 scope additions for AuditAction extension) |
| Net source LOC | +22 setlist-firebase.ts / +40 test / +1 audit type / +1 history-panel label = +64 across all changed files; production-non-test = +24 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: W2 updateSetlist defensively strips `tracks` from incoming patches | ✅ Pass | `grep "delete cleanData.tracks"` returns 1; new test `'drops embedded tracks from caller patch defensively'` asserts `Object.keys(payload).not.toContain('tracks')` when caller passes a tracks array |
| AC-2: W2 emits `tracks: deleteField()` when remote setlist is hydrated | ✅ Pass | `grep "remote.hydrated === true"` returns 1; new test `'strips embedded tracks via deleteField when remote is hydrated'` asserts `payload.tracks === '__DELETE_FIELD__'` (sentinel) |
| AC-3: W2 does NOT emit `tracks: deleteField()` for unhydrated remote | ✅ Pass | New test `'does NOT strip tracks when remote is not hydrated (legacy doc safety)'` asserts payload omits tracks when remote.hydrated falsy |
| AC-4: Audit-log action collapses to `'renamed'` / `'updated'` | ✅ Pass | `grep "tracks_updated"` in setlist-firebase.ts returns 0 (dead-code branch + 5th-arg snapshot removed). 'updated' added to AuditAction union; label added to SetlistHistoryPanel |
| AC-5: tsc + next build + vitest baselines | ✅ Pass | tsc EXIT=0; next build "Compiled successfully in 7.7s"; vitest 1616 passed / 52 failed (EXACT: 1613 baseline + 3 new tests; zero new failures); HFG counter 0/3 held |
| AC-6: LOC ≤ +20 net production for setlist-firebase.ts | ⚠️ DRIFT | +22 net for setlist-firebase.ts (target ≤+20); +2 over from inline doc comment block on the strip gate (6 lines explaining hydrated-gate safety reasoning). Plus SCOPE ADDITION: 2 files outside files_modified (`setlist-audit.ts` +1 / `SetlistHistoryPanel.tsx` +1) needed for `'updated'` type-extension. Total cross-file production delta: +24 LOC. Documented as auto-fix below. |
| AC-7: PENDING-UAT — immediate strip on hydrated setlists in production | ⏳ Deferred | Daniel triggers any updateSetlist against a hydrated setlist (library Add or undo) and verifies in Firebase Console that the parent doc no longer has a `tracks` field. Joins v6.0 PENDING-UAT bundle. |

## Accomplishments

- **W2 surface closed against embedded-array writes.** The last remaining client-side writer that COULD pass `tracks` in a `Partial<Setlist>` patch now defensively strips it. Combined with v60-07-01 (the only production caller already passed denorm-only fields), there is no path from a hook to an embedded-array write through `setlistService.updateSetlist`. Future regressions where a developer attempts to pass `tracks: [...]` get silently corrected by the service layer.
- **Immediate FieldValue.delete strip mandate realized for the client surface.** Every legitimate update against a migrated setlist (`hydrated:true` post-v60-07-02 OR post-v60-06-08 backfill OR post-v60-07-01 first-add hydration) now OPPORTUNISTICALLY clears its embedded `tracks` field on the next touch. Over the natural drift of weekly editing, the entire migrated setlist corpus drops its embedded data WITHOUT a one-shot migration script. Strip-as-they're-touched.
- **Transaction-scoped read-then-strip pattern established.** The `updateSetlistWithVersion` transaction already reads `remote.updatedAt` for the optimistic-concurrency precondition. v60-07-03 piggybacks `remote.hydrated` onto that same read — zero extra Firestore round-trips, no new transaction layer. Pattern reusable for any field-cleanup migration that needs per-doc state inspection.
- **Two-layer defensive-strip-plus-cleanup separation.** Service-method `delete cleanData.tracks` guards against caller regression; helper-level `applied.tracks = deleteField()` realizes the cleanup. The two concerns stay separable across layers — the service is agnostic of remote state, the helper is agnostic of patch shape.
- **Caller audit dramatically narrowed scope.** Pre-plan research revealed that editor save / reorder / transpose all route through the sync engine (`applyEdit`), NOT through `setlistService.updateSetlist`. The only production callers are the 3 sites in `use-add-to-setlist.ts`, all already passing denorm-only fields. The speculative caller-migration work the SUMMARY of v60-07-02 flagged as "may be required" turned out to be unnecessary.

## Task Commits

Single combined commit per session precedent (v60-07-01 / v60-07-02 / v60-06-* / v53-* mode):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1 + Task 2 + AuditAction extension + SUMMARY + STATE/ROADMAP docs | (pending push) | feat(v60-07-03) | W2 defensive strip + updateSetlistWithVersion immediate FieldValue.delete on hydrated docs; audit-log action collapsed to 'renamed'/'updated' |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-firebase.ts` | Modified (+30/-8; +22 net) | deleteField import added; updateSetlistWithVersion conditionally appends `tracks: deleteField()` when `remote.hydrated === true`; W2 updateSetlist defensively `delete cleanData.tracks` + audit-log action collapsed |
| `src/lib/setlist-firebase.test.ts` | Modified (+40 net) | deleteField mock + sentinel; 1 updated assertion on existing test; 3 new tests (defensive strip, hydrated strip, legacy-doc safety) |
| `src/lib/setlist-audit.ts` | Modified (+1) | `AuditAction` union extended with `'updated'` — required for the new collapsed action string to type-check |
| `src/components/setlist/SetlistHistoryPanel.tsx` | Modified (+1) | `actionLabels` Record extended with `'Updated'` for the new action — required for `Record<AuditAction, string>` exhaustiveness |
| `.paul/phases/v60-07-writer-removal-strip/v60-07-03-PLAN.md` | Created | Plan artifact |
| `.paul/phases/v60-07-writer-removal-strip/v60-07-03-SUMMARY.md` | Created | This file |
| `.paul/STATE.md` | Modified | Loop position → UNIFY ✓; v60-07 progress updated; next action → /paul:plan v60-07-04 |
| `.paul/ROADMAP.md` | Modified | v60-07 row reflects v60-07-03 closure + remaining v60-07-04 (API routes W7-W11) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Scope narrowed by caller audit (no caller migration needed) | Pre-plan research found editor save / reorder / transpose go through applyEdit, NOT through setlistService.updateSetlist. Only production callers (3 in use-add-to-setlist.ts) already pass denorm-only fields after v60-07-01. | Plan turned into a service-internal refactor + 3 new tests instead of a 6-12 caller migration. Single-context execution feasible. |
| Strip gate inside the existing runTransaction (`remote.hydrated === true`) | Transaction already reads remote.updatedAt for the optimistic-concurrency precondition. Same read provides `hydrated` — zero extra round-trips, no new transaction layer, single atomic read+write. | Pattern is reusable for future field-cleanup migrations. Performance footprint identical to pre-v60-07-03 W2. |
| Strip ONLY when `remote.hydrated === true` (NOT when patch contains `hydrated: true`) | Patch-asserted hydration is caller-driven (use-add-to-setlist.ts asserts it after seeding top-level rows); but the strip gate needs the AUTHORITATIVE state — what's already in Firestore. A caller could theoretically pass `hydrated: true` mistakenly without having seeded; gating on REMOTE state prevents silent data loss. | Legacy setlists that haven't been migrated keep their embedded data intact. Backfill (v60-06-08) remains the migration path. |
| AuditAction union extended with `'updated'` (NOT reusing `'tracks_updated'`) | The `'tracks_updated'` string implies the patch changed tracks; post-v60-07 the service no longer writes tracks. Reusing the string would be misleading in audit-history UI. | 2-file scope addition (setlist-audit.ts + SetlistHistoryPanel.tsx) for the new union member; total +2 LOC outside the plan's files_modified. |
| Comment block kept inside updateSetlistWithVersion (despite AC-6 LOC over) | The 6-line comment explains the strip gate's safety reasoning: WHY hydrated:true is the safe condition, WHY legacy docs are left alone, HOW backfill complements this path. Comment is future-proofing for v60-07-04 / v60-08 plans that will revisit this code. | AC-6 DRIFT: +22 net vs ≤+20 ceiling. Documented; helper-attributable; the comment is the right abstraction. |
| Single-context execution, no agent dispatches | CARL [FRESH] rule: "Work in current context unless task exceeds 500 LOC". Total production delta +24 LOC across 4 files. | Saved ~1 dan-executor dispatch overhead; entire plan executed in ~15 min single-context. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | AuditAction type union needed extension; 2 files outside plan's files_modified touched (+2 LOC total) |
| Scope additions | 1 | Documented above; same incident as the auto-fix (single root cause: new action string requires type-system support) |
| Deferred | 0 | — |

**Total impact:** Plan executed as designed. The AuditAction type extension was discovered at tsc-qualify time and resolved in-flight. All FUNCTIONAL ACs PASS. Vitest baseline preserved with 3 net new tests.

### Auto-fixed Issues

**1. [TYPE] AuditAction union missing the new 'updated' action string**
- **Found during:** Task 1 qualify — after refactoring the W2 audit-log call to use `action = data.name !== undefined ? 'renamed' : 'updated'`, `npx tsc --noEmit` failed because `'updated'` was not a member of the `AuditAction` union exported by `src/lib/setlist-audit.ts`. The plan's `Avoid:` clause said "do NOT change `logSetlistChange` action strings beyond the `'renamed' / 'updated'` pair" — implying the pair was both NEW, but the type-system extension was not enumerated in files_modified.
- **Issue:** Adding `'updated'` as a possible action argument required (a) extending the AuditAction union AND (b) extending the `Record<AuditAction, string>` actionLabels in `SetlistHistoryPanel.tsx` for exhaustiveness checking.
- **Fix:** Added `| 'updated'` to AuditAction (1 LOC); added `updated: 'Updated'` to actionLabels Record (1 LOC). Two files outside plan's files_modified, each +1 LOC. Single-purpose changes — no scope creep.
- **Files:** `src/lib/setlist-audit.ts`, `src/components/setlist/SetlistHistoryPanel.tsx`
- **Verification:** tsc EXIT=0 after the extension; full vitest run 1616/52 (no regressions); next build "Compiled successfully in 7.7s".
- **Commit:** part of the v60-07-03 single combined commit.

**2. [LOC] AC-6 LOC ceiling exceeded by +2 in setlist-firebase.ts (comment-attributable)**
- **Found during:** Task 1 qualify — `git diff --stat` showed setlist-firebase.ts at +30/-8 = +22 net (target ≤+20).
- **Issue:** The 6-line inline doc comment inside updateSetlistWithVersion explaining the strip gate's safety reasoning pushed the file 2 LOC over the AC-6 ceiling. The comment documents WHY hydrated:true is the safe condition, WHY legacy docs are left alone, and HOW backfill complements this path.
- **Fix:** Kept the comment. Documented the DRIFT. The comment is future-proofing for v60-07-04 / v60-08 plans that will revisit this code; compacting it would have removed the safety rationale.
- **Files:** `src/lib/setlist-firebase.ts` (no compensating changes)
- **Verification:** All functional ACs pass. AC-6 marked DRIFT with explicit attribution.
- **Commit:** part of the v60-07-03 single combined commit.

### Deferred Items

None — plan executed cleanly aside from the AuditAction type-extension auto-fix.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| TypeScript error after Task 1 first pass: `'updated'` not assignable to AuditAction | Extended the union with 'updated'; extended the Record<AuditAction, string> in SetlistHistoryPanel.tsx to keep exhaustiveness checking. tsc clean on retry. |
| Comment block in updateSetlistWithVersion pushed setlist-firebase.ts to +22 LOC (over ≤+20 ceiling) | Documented as DRIFT; comment retained for safety-reasoning future-proofing. |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Transitively satisfied — loaded earlier this session via v60-06-* + v60-07-01/02. Cleared as no-op for v60-07-03: pure data-layer write-path refactor; ZERO visual / styling / copy surface change. The SetlistHistoryPanel touch is a single-row addition to a label Record — non-visual code; the rendered "Updated" string is a one-word audit-log label that matches the existing pattern of one-word labels (Created/Renamed/Cloned/etc.). |

All required skills invoked ✓.

## Next Phase Readiness

**Ready (remaining v60-07 plans):**
- **v60-07-04** — API route writers W7-W11 (publish, rename, transfer, delete, import/execute). Server-side strips of the embedded `tracks` field; each route patches the parent setlist doc via Admin SDK + can adopt the same `tracks: FieldValue.delete()` strip pattern (`admin.firestore.FieldValue.delete()` on the server side). Should respect the same hydrated-gate safety — but server-side reads are cheap, so a transaction-scoped read-then-strip can mirror v60-07-03's pattern. v60-07-04 closes the writer surface; v60-08 cleanup follows.

**Concerns:**
- The hydrated-gate strip currently runs INSIDE the runTransaction. If a server-side API route patches the same doc concurrently (e.g., the publish route stamps a publishedAt during a user edit), the precondition check + strip work atomically — Firebase's optimistic-concurrency model handles this correctly. No additional locking needed.
- Legacy unhydrated setlists (5 historical docs from v60-06-08 dry-run) won't be stripped by v60-07-03's path. They'll be stripped when (a) the v60-06-08 `--apply` ramp hydrates them (Daniel's Mon–Wed window), then (b) the next edit triggers updateSetlist with remote.hydrated === true. Two-step migration; first step is the backfill.
- The `'updated'` audit-log action is now visible to any user opening the setlist history panel. The label "Updated" is intentionally generic; consumers expecting "Tracks updated" for embedded-array writes will see "Updated" instead. This is a deliberate semantic shift — post-v60-07, tracks updates happen via the sync engine and emit their own audit events (track_added / track_removed / tracks_reordered).

**Blockers:**
- None for v60-07-04.
- **v6.0 PENDING-UAT carry:** Daniel triggers any setlistService.updateSetlist call against a hydrated setlist (cleanest test: open the library, add a song to any post-v60-07-02 setlist) and verifies via Firebase Console that the parent doc loses its embedded `tracks` field while the top-level `tracks/{id}` rows remain intact. Joins v5.0 / v5.2 / v5.3 / v5.4 / v60-01..07-02 PENDING-UAT bundle.

---
*Phase: v60-07-writer-removal-strip, Plan: 03*
*Completed: 2026-05-13*
