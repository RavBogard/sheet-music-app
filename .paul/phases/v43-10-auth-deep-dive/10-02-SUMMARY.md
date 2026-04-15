---
phase: v43-10-auth-deep-dive
plan: 02
subsystem: auth
tags: [nextjs-router, react-effects, firebase-auth, cold-load, middleware]

requires:
  - phase: v43-10-auth-deep-dive/01
    provides: fail-fast env, guarded initAdmin, armed bounce-counter
  - phase: v43-09-role-claim-sync/02
    provides: __session_role companion cookie + drift handler

provides:
  - router.refresh after cookie sync so middleware re-evaluates in-place
  - mount-time session refresh that bypasses the 24h throttle
  - login-page button disabled during loading + concrete error surface

affects:
  - any future change touching onAuthStateChanged or the drift chain
  - Plan 10-05 Playwright smoke scenarios

tech-stack:
  added: []
  patterns:
    - "router.refresh() after any cookie-mutating call — forces middleware re-eval without a full page load"
    - "Mount-refresh != throttled-refresh: cold-load always refreshes, visibilitychange still throttled"

key-files:
  created: []
  modified:
    - src/lib/auth-context.tsx
    - src/app/login/page.tsx

key-decisions:
  - "router.refresh() is called on success only — a failed POST shouldn't cause a proxy re-eval that would just bounce again"
  - "Accept a small ~150ms double-POST on cold mount (onAuthStateChanged + mount-refresh both fire syncSessionCookie) in exchange for defensive coverage of edge cases"
  - "Skipped the optional unit test — mocking Firebase Auth + Firestore + router surface was >30min scaffolding; P10-05 Playwright covers it end-to-end"

duration: ~25min
started: 2026-04-15T03:40:00Z
completed: 2026-04-15T04:05:00Z
---

# Phase v43-10 Plan 02: Kill the cold-load race

**`router.refresh()` after every successful session-cookie mint + cold-load refresh bypasses the 24h throttle + login button can't be re-clicked mid-sync. The `/setlists ↔ /login` bounce class is gone.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Tasks | 3 auto (Task 4 skipped per plan allowance) + 1 human-verify |
| Files modified | 2 |
| Commits | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Sign-in lands on destination without looping | Pass | Human-verified on prod |
| AC-2: Cold load self-heals when Firebase persistence valid | Pass | Human-verified on prod |
| AC-3: Cold-load refresh bypasses throttle | Pass | refreshOnMount() no longer reads crc_session_refreshed_at |
| AC-4: Button disabled during loading (no double-click) | Pass | `disabled={signInState !== "idle" || loading}` |
| AC-5: Session POST failure surfaces error, not loop | Pass | Inline error paragraph + retry guidance |
| AC-6: No regressions on warm happy path | Pass | 1264/1264 tests; user confirmed "approved" |

## Accomplishments

- **Cold-load + sign-in race is structurally eliminated.** Every successful `/api/auth/session` POST now triggers `router.refresh()`, which re-runs the proxy middleware against the current route with the fresh cookie. Users who'd been bounced to `/login` while the cookie was in flight now self-heal in a single additional tick.
- **Mount refresh actually runs.** The 24h throttle used to suppress the cold-load refresh if localStorage had a recent timestamp, which is exactly wrong when the cookie itself was missing. Split into `refreshOnMount` (unthrottled, runs once per app load) vs `maybeRefreshOnVisibility` (throttled, original anti-spam logic).
- **Login page no longer traps the user.** Button is disabled while any sync is in flight; a failed session POST produces a concrete error with clear retry guidance instead of a silent infinite loop.

## Task Commits

| Commit | Type | Description |
|--------|------|-------------|
| `65e9a98` | fix | router.refresh after cookie sync (initial + drift); mount bypasses throttle |
| `2f960a1` | fix | login page: disable button during loading; error surface; removed racy setTimeout |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/auth-context.tsx` | Modified | useRouter import; two `router.refresh()` insertions; split mount vs visibility refresh |
| `src/app/login/page.tsx` | Modified | Error state; effect-based signInState reset; broader disable condition |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| router.refresh() on success only | Refresh on failure would bounce again; user intent is clearer with an error message | Clean failure UX |
| Accept cold-mount double POST (~150ms) | Defensive coverage of edge cases (cleared cookie, private browsing) outweighs the cost | Non-user-visible extra work |
| Skip unit test for auth-context | Scaffolding cost >30min; covered by P10-05 | Unblocks ship |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 1 | Task 4 unit test skipped (plan allowed) |

### Deferred Items

- Auth-context regression test. Scaffolding Firebase Auth + Firestore listener + router surface was impractical in scope. P10-05's Playwright smoke will cover this class of race end-to-end in a real browser.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Mount-refresh now runs alongside onAuthStateChanged's sync — double POST | Accepted; acknowledged in commit message and plan |

## Next Phase Readiness

**Ready:**
- User's `/setlists ↔ /login` symptom should be non-reproducible from this point.
- P10-03 (drift chain awaited + retries + telemetry) can build on this foundation without interfering.

**Concerns:**
- Double POST on cold mount (150ms) — minor, can dedupe if it ever shows up as a hot spot.

**Blockers:** None.

---
*Phase: v43-10-auth-deep-dive, Plan: 02*
*Completed: 2026-04-15*
