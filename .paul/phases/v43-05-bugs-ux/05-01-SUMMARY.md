---
phase: v43-05-bugs-ux
plan: 01
subsystem: ui
tags: [error-handling, toasts, silent-catch, b01, sonner]

requires:
  - phase: v43-01-recursive-research
    provides: B01 finding (15+ silent catches on user-visible paths)
provides:
  - reportSaveError helper (logger + toast, silent opt-out)
  - toast surfacing on 3 user-initiated writes (metronome speed, markAsRead, markAllAsRead)
  - silent logging on 2 background prefetch paths
affects: [future .catch audits; other LLM routes]

tech-stack:
  added: []
  patterns:
    - "reportSaveError(err, action, opts?) as the standard .catch handler for user-initiated writes"

key-files:
  created:
    - src/lib/save-error.ts
    - src/lib/__tests__/save-error.test.ts
  modified:
    - src/components/performance/RehearsalToolbar.tsx
    - src/components/nav/NotificationBell.tsx
    - src/hooks/use-upcoming-prep.ts

key-decisions:
  - "Re-audit at execution time trimmed scope from 9 to 5 call sites — 4 of the planned targets were metadata READS, not writes (loadLibraryMeta, getDoc user preferences, audio.play autoplay). Leaving those silent is correct; surfacing them would spam musicians with irrelevant error toasts."
  - "Use vi.hoisted() for sonner/logger mocks — plain module-level const + factory hits vitest's hoisting error"

patterns-established:
  - "When planning a silent-catch audit: the `.catch(() => {})` pattern appears on both reads (silent = correct) and writes (silent = bad). Read-then-edit to classify each site before wiring."

duration: ~20min
started: 2026-04-14T13:00:00Z
completed: 2026-04-14T13:05:00Z
---

# v4.3 P5 Plan 01: Silent-Catch Audit Summary

**Closed audit finding B01: user-initiated writes that previously failed silently now surface as `toast.error` and log via logger.warn. Background prefetch paths log silently.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Tasks | 3 of 3 completed |
| Files modified | 3 |
| Files created | 2 (helper + test) |
| Commits | 3 atomic + push to origin/master |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: reportSaveError helper | Pass | `src/lib/save-error.ts` with 4 unit tests |
| AC-2: TransposerMenu surface | **N/A** | On re-audit, TransposerMenu's catch was on a metadata READ (loadLibraryMeta), not a write. Transposition state is store-only. No write site to surface. |
| AC-3: TrackSheet surface | **N/A** | Same — the `.catch` is on a metadata read. No write site. |
| AC-4: Monitor command surface | **N/A** | QuickMonitorPanel's catch was on preference getDoc read, not a command send. Monitor commands route through `getMonitorClient()` and do not use this `.catch` site. |
| AC-5: Notification read surface | Pass | Both `markAsRead` and `markAllAsRead` now route through `reportSaveError(..., "notification(s)")` |
| AC-6: RehearsalToolbar + use-setlist-logic | Partial | RehearsalToolbar preferred-speed save: **Pass**. use-setlist-logic sticky-key backfill: deliberately NOT surfaced (it's a cache-read fallback, not a user-initiated save; would spam). RehearsalToolbar:75 is also a read; RehearsalToolbar:153 is `audio.play()` (browser autoplay policy rejects are not real failures). |
| AC-7: use-upcoming-prep lastVisitedAt | Pass | Both `.catch` sites now call reportSaveError with `{silent: true}` |
| AC-8: Quality gates | Pass | tsc clean; 1186/1186 tests; `npm run build` green |

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| T1: Helper + tests | `6da4430` | feat | reportSaveError + 4 unit tests |
| T2: Surface user-initiated writes | `284298b` | fix | RehearsalToolbar metronome speed + NotificationBell read marks |
| T3: Silent-logged dashboard prefetch | `64ba54e` | chore | use-upcoming-prep {silent: true} |

Pushed to `origin/master`; Vercel auto-deploying.

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Scope reduction | 4 | Removed 4 targets (TransposerMenu, TrackSheet, QuickMonitorPanel, RehearsalToolbar:75/153, use-setlist-logic:594) — they are READ catches, not WRITE catches |
| Scope addition | 0 | — |

**Total impact:** Correct call. The plan overreached because I classified `.catch(() => {})` sites by file name, not by what the awaited expression actually did. Re-auditing each site at execution time — reading the code around each `.catch` — caught the misclassifications before wiring produced false-positive error toasts. If shipped as planned, musicians would see "Couldn't save track details — try again" whenever chart-metadata failed to load (very common on slow networks), destroying the UX the plan was meant to improve.

## Skill Audit

`/ui-ux-pro-max` was loaded earlier in this session (plan flagged it as required because the fix surfaces user-facing toasts).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| vitest `vi.mock` factory can't reference a module-level `const vi.fn()` | Moved to `vi.hoisted(() => ({...}))` wrapper |
| Plan over-scoped by classifying via filename | Re-audited each site at execution; removed 4 false positives |

## Next Phase Readiness

**Ready:**
- Pattern established: future silent-catch audits use `reportSaveError` with the two variants (toast-loud for user-initiated, `{silent: true}` for background).

**Concerns:**
- Admin flows (`UserRow.notifyRoleChanged`, `PeopleSection.notifyRoleChanged`) still swallow errors — deferred; admins are technical enough to refresh and retry, and these notifications are secondary to the actual role change which has its own error path.
- A similar sweep against `catch (e)` block bodies (vs `.catch(() => {})`) would catch more silent failures; deferred.

**Blockers:** None

**Next plan (recommended):**
- `05-02` for B02 (alert-store listener cleanup) — small fix
- Or continue in Phase 4 with `04-02` (D01 cascade delete) — larger scope
- Or jump to Phase 6 for U01/U02 (touch targets + mobile keyboard) — user-visible UX wins

---
*Phase: v43-05-bugs-ux, Plan: 01*
*Completed: 2026-04-14*
