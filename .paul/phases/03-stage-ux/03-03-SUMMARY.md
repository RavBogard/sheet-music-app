---
phase: 03-stage-ux
plan: 03
subsystem: api, ui
tags: [firebase-admin, firestore, notifications, sonner, rate-limit]

requires:
  - phase: 01_1-concurrent-edit-safety
    provides: subscribeToSetlist pattern the performance view already consumes
  - phase: 02-weekly-workflow-polish
    provides: createApiHandler + shared `api` rate-limit tier reused here

provides:
  - Server-side broadcast route POST /api/setlists/notify-updated
  - Musician-facing in-app toast for live setlist swaps
  - Multiset-diff swap detection that ignores reorders and re-links
affects: 03-04 (performance view polish — reuses SwapChangeToast placement)

tech-stack:
  added: []
  patterns:
    - Thin client wrapper delegating privileged fan-out writes to Admin SDK route
    - Multiset-diff (add/remove count deltas) for detecting genuine swaps vs reorders
    - Single-id Sonner toast to collapse rapid updates instead of stacking

key-files:
  created:
    - src/app/api/setlists/notify-updated/route.ts
    - src/app/api/setlists/notify-updated/route.test.ts
    - src/components/performance/__tests__/SwapChangeToast.test.tsx
  modified:
    - src/lib/notification-store.ts
    - src/components/performance/SwapChangeToast.tsx

key-decisions:
  - "Move fan-out broadcast server-side (Admin SDK) instead of relaxing Firestore rules"
  - "Multiset-diff on titles (not index-based) so reorders and re-links don't false-trigger"
  - "Single Sonner toast id ('setlist-swap-update') to replace rather than stack on rapid swaps"

patterns-established:
  - "Privileged client notification helpers become thin apiFetch wrappers to a createApiHandler route"
  - "Live-view change-detection components own their own multiset diff + own-action suppression"

duration: ~45min
started: 2026-04-14T07:30:00Z
completed: 2026-04-14T07:40:00Z
---

# Phase 03 Plan 03: Setlist-updated Notification Summary

**Moved the "Setlist updated" broadcast server-side via Admin SDK (unblocking non-privileged `users` reads from the client) and turned the stage-view SwapChangeToast into a true multiset-diff that fires only on real swaps.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45min |
| Tasks | 3 auto + 1 human-verify checkpoint |
| Files modified | 5 |
| Tests added | 13 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Server-side broadcast replaces client users-query | Pass | `notifySetlistUpdated` now POSTs to the new route; Admin SDK fans out. Verified by grepping `collection(db, 'users')` — only hits `getActiveMemberUids` used by `notifySetlistPublished`. |
| AC-2: Route is authenticated + rate-limited | Pass | 6 route tests cover 401 unauth, 403 non-privileged role, 429 rate-limited, 400 validation, 200 happy path with self-exclusion, 200 with zero recipients. |
| AC-3: Musician sees toast on swap, editor does not | Pass | Toast fires with canonical copy `'Setlist updated — "A" → "B"'`. Own-swap suppression honoured via existing `lastOwnSwapRef`. Single toast id collapses rapid swaps. |
| AC-4: Diff detection is title-based, not index-based | Pass | Reorders (identical multiset), header changes, and same-title re-links all verified non-firing in tests. |

## Accomplishments

- `/api/setlists/notify-updated` route delivers AC-1 + AC-2 — client `notifySetlistUpdated` is now a 5-line fetch wrapper.
- `SwapChangeToast` upgraded from naive index-diff to proper multiset-diff with own-swap suppression and toast-id dedupe.
- 13 new tests pinning the behaviour; full suite 1120/1120 (one pre-existing unrelated env-vars failure in `song-charts-library.test.tsx` left untouched).
- TypeScript clean.

## Task Commits

Single atomic commit (matching prior plan conventions in this phase):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + tests | _see git log_ | feat | P3-03 server-side broadcast + swap toast upgrade |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlists/notify-updated/route.ts` | Created | Admin SDK fan-out broadcast, band_leader+ gate, `api` rate-limit tier |
| `src/app/api/setlists/notify-updated/route.test.ts` | Created | 401 / 403 / 429 / 400 / 200 coverage |
| `src/lib/notification-store.ts` | Modified | `notifySetlistUpdated` becomes thin apiFetch wrapper (zero client users read) |
| `src/components/performance/SwapChangeToast.tsx` | Modified | Multiset-diff, header-skip, toast-id dedupe, canonical copy |
| `src/components/performance/__tests__/SwapChangeToast.test.tsx` | Created | 7 tests pinning diff + copy behaviour |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Server-side broadcast route (Admin SDK) over Firestore rules relaxation | Rules stay tight (`users` read still gated to admin/band_leader/self); fan-out privilege lives in one code path with a role check | Future broadcast helpers follow the same shape — client wraps an Admin SDK route |
| Multiset-diff over index-diff | Reorders and re-links must not false-trigger per AC-4; index-diff fails both cases | Pattern available for any future "detect genuine changes" view |
| Single Sonner toast id `'setlist-swap-update'` | Rapid leader swaps would otherwise stack and drown the stage view | Readable under quick-swap conditions; replaces in-place |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor — vitest mock typing |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written. The `SwapChangeToast` component already existed from an earlier phase and just needed upgrading in place rather than creating a fresh diff-effect inside `page.tsx` — cleaner than the plan's Task 2 suggestion, no behaviour change.

### Auto-fixed Issues

**1. [Test] vitest mock type signature for `checkRateLimit`**
- **Found during:** Task 1 verification (`tsc --noEmit`)
- **Issue:** `vi.fn(() => null as unknown)` inferred 0-arg signature; test call-site passed `(req, tier)`.
- **Fix:** Typed `vi.fn<(req: unknown, tier: unknown) => unknown>(() => null)`.
- **Files:** `src/app/api/setlists/notify-updated/route.test.ts`
- **Verification:** `npx tsc --noEmit` clean.

### Deferred Items

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `song-charts-library.test.tsx` fails to collect due to `@t3-oss/env-nextjs` validation | Confirmed pre-existing by stashing changes and re-running — not caused by this plan. Left for a separate cleanup plan. |

## Next Phase Readiness

**Ready:**
- 03-04 (Performance view polish) can build on the current `SwapChangeToast` placement — no further changes needed there.
- Pattern (client wrapper → Admin SDK route) available for any future privileged fan-out notification.

**Concerns:**
- Two-device smoke test confirmed by user on prod; if any regression surfaces, the toast is a single file and the broadcast is a single route — both easy to roll back.

**Blockers:**
- None.

**Skill audit:** /ui-ux-pro-max required and invoked ✓

---
*Phase: 03-stage-ux, Plan: 03*
*Completed: 2026-04-14*
