---
phase: v52-03-sync-indicator-ux-overhaul
plan: 01
subsystem: ui
tags: [sync, outbox, dexie, react, tailwind, auth, recovery, ux]

requires:
  - phase: v52-01-recursive-research
    provides: Track B Issue 1+4 root-cause diagnosis + Q1/Q2/Q3 firming
  - phase: v50-03-sync-engine
    provides: outbox table + 'failed' terminal FSM state
  - phase: v50-06-02
    provides: useReconciliationModalOptional fallback pattern (mirror)
  - phase: v51-h01
    provides: inline lastError display below SyncIndicator (the visible-but-unactionable signal that needed a recovery affordance)
provides:
  - clearFailedOutboxRows() outbox cleanup primitive
  - SyncIndicator default onRetryFailed fallback (production-enabled)
  - auth-staleness sign-out affordance gated on lastError keyword regex
  - SetlistGridTopBar trailing-action simplification (kebab removed)
affects: [v52-04, v52-05, milestone-v5.0-audit]

tech-stack:
  added: []
  patterns:
    - "Cleanup primitive + indicator default-fallback (mirror of v50-06-02 reconciliation pattern)"
    - "Inline error pill + neutral-toned recovery action below severity-colored description"

key-files:
  created:
    - src/lib/sync/cleanup.ts
    - src/lib/sync/__tests__/cleanup.test.ts
  modified:
    - src/components/setlist/grid/SetlistGridTopBar.tsx
    - src/components/setlist/grid/SyncIndicator.tsx
    - src/components/setlist/grid/__tests__/SyncIndicator.test.tsx

key-decisions:
  - "No confirm dialog before clearFailedOutboxRows (failed = dead-letter, deletion is loss-of-no-progress)"
  - "Sign-out link gated on /permission|auth|denied|unauthenticated|unauthorized/i regex (avoids cargo-cult sign-out for unrelated errors)"
  - "Sign-out link uses neutral text-zinc-300 (not red-300) so action reads as distinct from red error description"
  - "Cleanup helper does NOT call engine.pump() — engine's interval-based drain observes the now-clean outbox naturally (loose coupling, mirrors v50-06-03 pattern)"
  - "Test seam: clearFailedOutboxRows takes optional db parameter; production path uses getDb() default"

patterns-established:
  - "Outbox cleanup primitives live in src/lib/sync/cleanup.ts (additive, write-only-to-Dexie, no engine coupling)"
  - "Indicator default-handler fallback wires recovery affordances when parent doesn't pass explicit onRetryFailed (analogous to v50-06-02's useReconciliationModalOptional fallback for onResolveConflict)"

duration: ~25min
started: 2026-04-30T19:30:00Z
completed: 2026-04-30T19:45:00Z
---

# Phase v52-03 Plan 01: SyncIndicator failure-state recovery + dead-kebab removal

**Failed-state SyncIndicator becomes self-healing without DevTools: tap-to-clear-failed-outbox-rows is now the production default; auth-keyword errors surface a sign-out-and-back-in affordance; the always-disabled kebab "red line" is gone from SetlistGridTopBar.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min |
| Started | 2026-04-30T19:30:00Z |
| Completed | 2026-04-30T19:45:00Z |
| Tasks | 4 of 4 (Task 4 = HUMAN-VERIFY checkpoint approved sight-unseen, see Deviations) |
| Files modified | 5 (3 modified + 2 new) |
| Commits | 1 (vertical-slice; v52-02 precedent) |
| LOC delta | +261 / −20 net (well within Track B's 75–120 source LOC estimate; bulk of insertions are tests) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Issue 4 — kebab removed everywhere | Pass | `MoreVertical` import + `onOverflow?` prop + kebab `<button>` block all removed; SetlistGrid caller never passed `onOverflow` so prop removal is non-breaking. Boundary diff confirms only SetlistGridTopBar.tsx changed. |
| AC-2: clearFailedOutboxRows deletes only failed rows | Pass | New `src/lib/sync/cleanup.ts`. Cleanup snapshots `where('status').equals('failed')` then `db.outbox.delete(localId)` per row. Pending/sending preserved. Returns `{ removed: number }`. Does NOT call engine.pump() — engine's interval-based drain observes the now-clean outbox on next tick. Verified by 4 unit cases (deletes-only-failed / preserves-pending-and-sending / idempotent-empty / concurrent-pending-insert-preserved). |
| AC-3: SyncIndicator wires onRetryFailed when undefined | Pass | `defaultRetryFailed` async fallback added. `retryFailedHandler = onRetryFailed ?? defaultRetryFailed` ensures production path always has a real handler. `disabled={isAction ? !onClick : undefined}` now evaluates to `disabled={false}` for failed state. Conflict-state branch unchanged (still gates on reconciliation modal handler). Verified by 3 SyncIndicator test cases. |
| AC-4: Sign-out pairing for auth-staleness errors | Pass | Inline `<button>` rendered conditionally on `showInlineError && AUTH_ERROR_PATTERN.test(lastError ?? '')`. Regex `/permission\|auth\|denied\|unauthenticated\|unauthorized/i`. Calls `useAuth().signOut()`. ≥44px tap target on coarse pointer via `[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2`. Verified by 3 SyncIndicator test cases. |
| AC-5: Suite + build clean; no regression | Pass with note | 1518 → 1528 (+10 cases, exceeds plan estimate of +6–8). tsc clean (exit 0). next build clean (exit 0). Boundary diff confirms changes ONLY under files_modified. **Note:** 1 pre-existing parallel-suite test isolation flake rotates between `route-auth.test.ts` and `SetlistGridHydrator.test.tsx` — both pass 23/23 in isolation; flake unrelated to v52-03-01. |
| AC-6: Daniel-loop UAT confirms both fixes on real iPad | Deferred | User approved sight-unseen at HUMAN-VERIFY checkpoint with "do it" before Vercel deploy completed. UAT to follow as part of standing Daniel-loop discipline; failures route to follow-up plan in same phase per v51-04 UAT-failure rule. See Deviations. |

## Accomplishments

- **Failed-state SyncIndicator is now self-healing in production.** The terminal `failed` FSM state finally has a real recovery affordance — tap the indicator → cleanup helper deletes failed outbox rows → engine's pump observes clean outbox on next tick → FSM derives back to `idle` (or `offline` if still offline). No DevTools intervention needed for the iPad red-Failed loop that was the long-standing pain point.
- **Auth-staleness recovery affordance shipped** — when `lastError` matches permission/auth keywords, an inline "Sign out and back in" link surfaces below the error pill. Closes the v51-h01-revealed pattern where Daniel could see the SDK error inline but had no in-app path to recover from auth-claim staleness (per Track B Q2: the plausible co-factor with phantom-row blocking on iPad).
- **Visual debt removed** — the always-disabled kebab placeholder that confused Daniel into thinking it should do something is gone; SyncIndicator is now the only trailing action in SetlistGridTopBar.
- **Tests +10** without regressions (1518 → 1528). Cleanup helper has 4 unit cases covering the contract; SyncIndicator gains 6 cases covering the v52-03 wiring + sign-out gating.

## Task Commits

Single vertical-slice commit (v52-02 precedent):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Remove dead kebab | `e69e23a` | feat | SetlistGridTopBar.tsx: kebab + onOverflow + MoreVertical removed |
| Task 2: Cleanup helper + SyncIndicator wiring + sign-out pairing | `e69e23a` | feat | New cleanup.ts; SyncIndicator wires default onRetryFailed fallback + sign-out link |
| Task 3: Tests + tsc + next build | `e69e23a` | feat (tests bundled) | New cleanup.test.ts (4 cases); SyncIndicator.test.tsx (+6 cases) |
| Task 4: HUMAN-VERIFY (deploy + UAT) | `e69e23a` (push) | n/a | Pushed to origin master; Daniel approved sight-unseen pending real-iPad UAT |

Plan metadata commit (already in tree before APPLY): `b32adf9` (docs: plan v52-03 SyncIndicator UX overhaul)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/SetlistGridTopBar.tsx` | Modified | Remove dead kebab + onOverflow prop + MoreVertical import |
| `src/components/setlist/grid/SyncIndicator.tsx` | Modified | Wire defaultRetryFailed fallback (cleanup helper); add sign-out link gated on auth-keyword regex |
| `src/lib/sync/cleanup.ts` | Created | `clearFailedOutboxRows({ db? })` outbox cleanup primitive |
| `src/lib/sync/__tests__/cleanup.test.ts` | Created | 4 unit cases for cleanup helper |
| `src/components/setlist/grid/__tests__/SyncIndicator.test.tsx` | Modified | +6 v52-03-01 cases (default cleanup wired; explicit prop wins; sign-out gating) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| No confirm dialog before clearFailedOutboxRows | Failed rows are dead-letter (engine has already given up); deletion is loss-of-no-progress, not destructive of in-flight work. /ui-ux-pro-max "Confirm Destructive Actions" rule is for losing valuable work; doesn't fit this semantic. Extra modal would harm tablet recovery flow. | Single-tap recovery on iPad; no friction. |
| Sign-out link in neutral zinc-300 (not red-300 from plan draft) | Red-on-red blends action into severity description, weakening hierarchy. Neutral zinc reads as a distinct action while preserving semantic red for the error pill. | Clearer affordance hierarchy under the error pill. |
| `mt-1.5` spacing between error pill and sign-out link (plan draft was `mt-0.5`) | /ui-ux-pro-max Touch Spacing rule (≥8px between adjacent visual/tappable elements). | Better breathing room; coarse-pointer min-h-[44px] floor preserved. |
| Cleanup helper does NOT call `engine.pump()` | Engine's existing interval-based drain observes Dexie state changes naturally. Direct pump call would tightly couple cleanup to engine internals. Mirrors v50-06-03's "write to Dexie, let pump observe" pattern. | Cleanup is a pure Dexie primitive; engine boundaries preserved per plan. |
| `useAuth()` called unconditionally in SyncIndicator (not inside conditional render) | Hooks must be called in stable order; conditional `useAuth()` would violate the rules-of-hooks. AuthContext default value provides no-op `signOut: async () => {}` so existing tests without an AuthProvider keep working without modification. | Production-safe; pre-existing 7 SyncIndicator tests still green; no test-fixture changes needed beyond the new v52-03 cases. |
| `import { getDb } from '@/lib/local/schema'` (NOT `import { db } from '@/lib/local/db'` per plan) | Codebase pattern — `db` is not exported as a constant; `getDb()` is the actual accessor (lazily instantiates LocalDb). Plan's import was a draft assumption. | Matches existing conventions across SetlistGrid + Hydrator + ReconciliationProvider. |
| Single vertical-slice commit (Tasks 1+2+3) | v51-04 + v52-02-01 precedent: cohesive feature change ships as one atomic commit when source + tests are inseparable. | Atomic git history; easy revert if UAT surfaces a regression. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Plan-time draft import path was wrong; fixed at APPLY entry. |
| Scope additions | 0 | Plan executed within boundaries. |
| Deferred | 1 | HUMAN-VERIFY UAT deferred to standing Daniel-loop discipline (v51-04 codified) — UAT failures route to follow-up plan in same phase. |

### Auto-fixed Issues

**1. [Imports] cleanup.ts import path corrected**
- **Found during:** Task 2 (cleanup.ts creation)
- **Issue:** Plan draft said `import { db, type LocalDb } from '@/lib/local/db'`. The codebase has no `db` constant exported; the accessor is `getDb()` from `@/lib/local/schema`.
- **Fix:** Used `import { getDb } from '@/lib/local/schema'` + `import type { LocalDb } from '@/lib/local/schema'`. The cleanup helper now calls `options.db ?? getDb()`.
- **Files:** `src/lib/sync/cleanup.ts`
- **Verification:** tsc clean; cleanup.test.ts 4/4 pass
- **Commit:** `e69e23a`

### Deferred Items

- **AC-6 (Daniel-loop UAT on real iPad):** User approved with "do it" sight-unseen before Vercel deploy completed. UAT to follow as part of standing Daniel-loop discipline. Surfaces to verify on resume:
  - Issue 4: kebab gone from header on iPad
  - Issue 1: tap red Failed → returns to green Saved
  - Sign-out link: appears for auth-keyword errors only; tap → routes to sign-in
  - v51-01 + v52-02 contracts preserved (Key/Type no keyboard; Vocal Lead/ChartBind keyboard pops; TextCell single-tap-to-edit)
  - Conflict regression: ReconciliationProvider modal still opens on conflict-state tap (v50-06-02)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 1 pre-existing parallel-suite test flake (rotates between `route-auth.test.ts` and `SetlistGridHydrator.test.tsx`) | Both pass 23/23 in isolation. Confirmed unrelated to v52-03-01 (flake touches Dexie shared-state across workers / route auth, neither in this plan's surface area). Flagged for transparency; not a blocker. Could be addressed via Vitest `pool` config tightening in a future infra plan. |
| Bash cwd drift mid-session (`cd sheet-music-app` left subsequent relative paths resolving to a nested stub directory) | Cleaned up; switched to absolute paths for the rest of session. Stale handoffs (`HANDOFF-2026-04-27-v51-03-01-pickup.md`, `HANDOFF-2026-04-28-v51-hotfix-pickup.md`) eventually reached `.paul/handoffs/archive/` correctly. |

## Skill Audit

| Skill | Required | Invoked | Notes |
|-------|----------|---------|-------|
| /ui-ux-pro-max | ✓ | ✓ | Loaded at APPLY entry; queried for destructive-action-confirmation + touch-target + error-recovery patterns. Drove two refinements: zinc-300 (not red-300) link color; mt-1.5 spacing (not mt-0.5). |

## Next Phase Readiness

**Ready:**
- v52-03 phase complete (single-plan phase). Phase-close commit + handoff archive cleanup land at transition.
- v5.2 milestone progress: 3 of 5 phases complete (v52-01 research, v52-02 iPad focus + cmdk, v52-03 SyncIndicator UX).
- Wave 1 parallel-eligible plans for v52-04 + v52-05 unblocked.
- `clearFailedOutboxRows` primitive available for future consumers (e.g., a future settings-page "clear stuck items" affordance, or a v52-h hotfix postmortem follow-up if AC-6 surfaces issues).

**Concerns:**
- Daniel UAT on AC-6 not yet executed; if UAT surfaces a regression, route to v52-03-02 follow-up plan in same phase per v51-04 rule.
- 1 pre-existing parallel-suite test flake remains; not caused by v52-03 but worth tracking if it shows up more frequently.
- The `useAuth()` default no-op `signOut` means SyncIndicator renders the sign-out button even outside an AuthProvider; the click is safe (no-op) but the affordance appears anyway. In production this never matters (AuthProvider wraps the whole tree at root); in tests it's mockable. Worth noting if future contexts ever need to suppress the link without an AuthProvider.

**Blockers:**
- None.

---
*Phase: v52-03-sync-indicator-ux-overhaul, Plan: 01*
*Completed: 2026-04-30*
