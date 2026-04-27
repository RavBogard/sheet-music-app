---
phase: v5h-01-track-edit-save-loss
plan: 03
status: APPLY COMPLETE; HUMAN-VERIFY pending
loop: PLAN ✓ → APPLY ◐ → UNIFY ○
---

# v5h-01-03 SUMMARY — Perf-view Bridge Fix (hydrated-trust + resubscribe-once)

## What Shipped

Two coupled fixes to `useSetlistPerformance` closing the perf-view side of the v5.0 save-loss bug Daniel surfaced in v5h-01-02 UAT.

### Hydrated-trust dual-read
- `src/hooks/use-setlist-performance.ts:131-135` — when `setlistData?.hydrated === true`, ALWAYS use `topLevelTracks` (no fallback to legacy embedded). For unhydrated setlists, the v50-07-03 dual-read with embedded fallback is preserved.
- Closes the "edit lands in editor but perf-view shows stale embedded" failure mode for migrated setlists.

### onSnapshot resubscribe-once
- `src/hooks/use-setlist-performance.ts:62-127` — restructured `useEffect` to support a single retry. On `onSnapshot` error: log + clear `topLevelTracks` + schedule a 1-second `setTimeout` for ONE resubscribe attempt. Cleanup cancels the timer + active subscription.
- Closes the "tab opened before rules deployed → permanent permission-denied" failure mode (Daniel's exact UAT scenario for v5h-01-02 deploy race).

### Type model alignment
- `src/types/models.ts:67-91` — added `hydrated?: boolean` to `Setlist` interface (mirrors `LocalSetlist.hydrated` from v50-07-03; was missing from the Firestore-shaped model so tsc rejected the dual-read predicate).

### Test coverage
- `src/hooks/__tests__/use-setlist-performance.test.ts` — 13 → 16 tests (+3):
  - `prefers top-level over embedded when setlist is hydrated`
  - `falls back to embedded when setlist is NOT hydrated and top-level is empty`
  - `resubscribes once with a 1s delay when onSnapshot errors, then succeeds`
- Mock scaffolding extended to capture `onError` callback alongside `onNext`.

### Files modified
- `src/hooks/use-setlist-performance.ts`
- `src/hooks/__tests__/use-setlist-performance.test.ts`
- `src/types/models.ts` (additive `hydrated?: boolean` field)

## Acceptance Criteria Results

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 (prefer top-level when hydrated) | ✅ PASS | New test green; dual-read predicate verified. |
| AC-2 (fallback to embedded when not hydrated) | ✅ PASS | New test green; legacy fallback preserved. |
| AC-3 (resubscribe-once on onSnapshot error) | ✅ PASS | New test green; 2nd subscription on retry; 3rd attempt blocked (budget exhausted). |
| AC-4 (Daniel UAT scenario 1 — perf-view) | ⏳ PENDING | Awaiting Daniel HUMAN-VERIFY against production. |
| AC-5 (suite + tsc + build green) | ✅ PASS | vitest 1482/1482 (+3); tsc clean; `npm run build` clean (pre-existing Sentry warning unrelated). |

## Decisions Made

### In-task model adjustment
**Resolved:** Added `hydrated?: boolean` to `Setlist` interface in `src/types/models.ts`.
- Reason: tsc rejected the dual-read predicate `setlistData?.hydrated === true` because the Firestore-shaped `Setlist` type didn't carry the field (it was added to `LocalSetlist` in v50-07-03 but never mirrored on the Firestore type). Additive field; no consumer breakage.
- Plan boundaries did not list `src/types/models.ts` as DO NOT CHANGE; this is a tightly-scoped type-system fix to make the predicate type-check.

## Verification Results

```
$ npx vitest run src/hooks/__tests__/use-setlist-performance.test.ts
Test Files  1 passed (1)
     Tests  16 passed (16)
  Duration  1.00s

$ npx vitest run
Test Files  137 passed (137)
     Tests  1482 passed (1482)
  Duration  37.39s

$ npx tsc --noEmit
(no output — clean)

$ npm run build
✓ Compiled successfully in 15.7s
(only pre-existing @sentry/nextjs onRequestError warning, unrelated)
```

Suite delta: 1479 → 1482 (+3 from new perf-hook tests).

## Deviations

1. **Added `hydrated?: boolean` to `Setlist` model.** See Decisions above. Out of plan's literal `files_modified` list but inside scope (the predicate doesn't compile without it).

No other deviations. All other boundaries respected.

## Boundary Log

Confirmed UNTOUCHED per plan boundaries:
- ✅ `src/lib/sync/engine.ts` — engine FSM unchanged.
- ✅ `src/lib/sync/snapshot-listener.ts` — listener LWW guard from v5h-01-02 unchanged.
- ✅ `src/lib/sync/firestore-adapter.ts` — adapter contract unchanged.
- ✅ `src/lib/sync/init.ts` — adapter singleton unchanged.
- ✅ `src/lib/local/schema.ts` — Dexie schema unchanged.
- ✅ `src/components/setlist/grid/SetlistGridHydrator.tsx` — outbox-pending guard from v5h-01-02 + lazy-hydration cascade unchanged.
- ✅ `firestore.rules` — tracks/songs rules from v5h-01-02 unchanged.
- ✅ `src/hooks/use-safe-firestore-sync.ts` — setlist subscription path unchanged.
- ✅ `src/app/perform/setlist/[id]/page.tsx` — page wrapper unchanged.
- ✅ `src/components/performance/SetlistView.tsx` + `PDFOverlay.tsx` — perf-view rendering unchanged.

## Hand-off to v5h-01-04 (Postmortem)

Next plan should cover:

1. **Kitchen-sink security-rules + perf-view-coverage gap.** v50-07-04 fast-check property harness has TWO blind spots that shipped the v5.0 save-loss bug: (a) no security-rules layer, missed the missing tracks/songs rules; (b) no perf-view path coverage, missed the dual-read fallback + dead-subscription bugs. Lesson: integration-shaped test surfaces (e.g., a thin Playwright spec or RTL test running both the editor cell-commit AND the perf-view subscription against a shared in-memory Firestore) would have caught both.

2. **Cutover-plan rules-audit gate** (carried from v5h-01-02). v50-05-02 introduced `tracks/{id}` and `songs/{id}` collections without `firestore.rules` updates. Add to PAUL/CARL: any plan that adds top-level Firestore collections must include a `firestore.rules` audit task.

3. **Production capture should precede harness work** (carried from v5h-01-02). v5h-01-01 wrote a kitchen-sink hypothesis FIRST (LWW underflow), then production capture flipped it (rules-denied). Future v5h plans: HUMAN-ACTION DevTools dump first, harness second.

4. **Daniel-loop UAT cadence.** v5h-01-02 + v5h-01-03 each added a UAT cycle with Daniel between fix and milestone close. Establish this as the v5.x norm: fix → ship → Daniel UAT → repeat until clean → close. Surface this in v5.1 plan template.

5. **Issue 2 — iPad key-picker UI bad** (raised in v5h-01-02 UAT). Routed to v5.1 UX overhaul OR v50-05-04 regression follow-up depending on Daniel's symptom description (still pending). v5h-01-04 postmortem should note this as a feedback-loop discovery from UAT, validating the Daniel-loop cadence.

6. **Persistent permission-denied is a real failure**, not papered over by the resubscribe-once budget. After this ships, monitor Sentry's `feature:snapshot-listener` tag for any sustained `permission-denied` events — would indicate a rules drift or a role-claim sync problem that v4.3 P10 thought it had closed.

## Resume / Next Action

After Daniel completes UAT scenario 1 (perf-view check) — HUMAN-VERIFY in this plan:
- If PASS → run `/paul:unify .paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-PLAN.md` AND `/paul:unify .paul/phases/v5h-01-track-edit-save-loss/v5h-01-03-PLAN.md` to close both loops, then `/paul:plan` for v5h-01-04 (postmortem).
- If FAIL → diagnose specific failure mode (hydrated flag missing on prod setlist? subscription error path differs? dual-read predicate not engaging?) and route to amendment or follow-up plan.
