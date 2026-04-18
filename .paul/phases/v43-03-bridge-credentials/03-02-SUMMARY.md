---
phase: v43-03-bridge-credentials
plan: 02
subsystem: security
tags: [s02, bridge, audit-log, resend, firestore-rules]

requires:
  - phase: v43-03-bridge-credentials
    provides: DECISION 03-01 selecting Option A (audit + admin email)
  - phase: v43-01-recursive-research
    provides: S02 finding

provides:
  - Per-redemption audit trail in bridge-redemptions/
  - Admin email alert on every successful bridge setup-code redemption
  - sendBridgeRedemptionAlert() helper + BRIDGE_ALERT_EMAIL env var
  - Firestore rule locking bridge-redemptions/ server-only

affects: future bridge ops, admin-panel "recent redemptions" surface (if ever built)

tech-stack:
  added: []
  patterns:
    - "Fire-and-forget side effects on successful auth redemption: audit doc written inline, email dispatched with .then/.catch so response returns without blocking"
    - "Graceful email degradation: returns {ok:false, reason} instead of throwing — callers can ignore the result"

key-files:
  created:
    - src/app/api/bridge/__tests__/setup-code.test.ts
  modified:
    - src/app/api/bridge/setup-code/route.ts
    - src/lib/email.ts
    - src/env.mjs
    - firestore.rules

key-decisions:
  - "Audit write is awaited (.catch-only), email is fire-and-forget (.then/.catch). Audit is the source of truth; email is convenience."
  - "Failed redemptions (400/404/410) write NO audit doc — keeps the collection clean as a 'successful hand-offs' log"
  - "BRIDGE_ALERT_EMAIL is optional; missing config returns {ok:false, reason:'no_recipient'} without logging at error severity"

patterns-established:
  - "S02-class flows: audit first, notify second, degrade gracefully on notification failures"

duration: ~45min
started: 2026-04-14T21:40:00Z
completed: 2026-04-14T22:25:00Z
---

# Phase 3 Plan 02: S02 Bridge Audit-Log + Admin Email Summary

**Every successful bridge setup-code redemption now writes a Firestore audit doc and fires an admin alert email; failed redemptions stay silent.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45 min |
| Tasks | 4 auto + 1 human-verify — all complete |
| Files modified | 5 (4 source, 1 new test) |
| New tests | 7 |
| Total suite | 1219 pass (+7) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Successful redemption writes audit doc | PASS | Test 5 verifies all fields (code, createdBy, redeemedAt, redeemerIp, redeemerUserAgent, success) |
| AC-2: Successful redemption triggers admin email | PASS | Test 5 verifies sendBridgeRedemptionAlert called with matching params |
| AC-3: Email failure must not fail redemption | PASS | Tests 6 + 7 (throw + graceful no-config): 200 + audit doc still written |
| AC-4: Failed redemptions write NO audit, NO email | PASS | Tests 1-4 cover 400/404/410 paths; collection + email spies untouched |
| AC-5: Firestore rules deny client access | PASS | `bridge-redemptions/{id}` added with `allow read, write: if false` |

## Accomplishments

- S02 closed: 9/10 v4.3 P0s resolved
- Blast-radius window shrunk from "unbounded until manual key rotation" → "detectable within minutes of redemption"
- Zero changes to bridge exe contract (credential JSON shape unchanged)
- Audit collection is additive — future admin-panel surface can consume it without refactors

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1-3: helper + env + route + rules | `b0136c2` | fix(s02) | sendBridgeRedemptionAlert + BRIDGE_ALERT_EMAIL + GET wiring + rule |
| Task 4: test matrix + PLAN doc | `c1d09bb` | test(s02) | 7 tests; PLAN 03-02 committed alongside |

All on `origin/master`, Vercel auto-deployed.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/email.ts` | Modified | +`sendBridgeRedemptionAlert()` with graceful degradation |
| `src/env.mjs` | Modified | +`BRIDGE_ALERT_EMAIL` (optional) |
| `src/app/api/bridge/setup-code/route.ts` | Modified | Audit doc write + fire-and-forget email after successful tx |
| `firestore.rules` | Modified | +`bridge-redemptions/{id}` server-only rule |
| `src/app/api/bridge/__tests__/setup-code.test.ts` | Created | 7-case test matrix |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Audit `await`-ed (.catch-only); email fire-and-forget | Audit is source of truth — must happen before response returns. Email is convenience — best-effort | ~5-10ms extra latency on successful redemption for the Firestore write; email adds 0ms |
| No `redeemedAt` server-generated Timestamp | Using `new Date()` on the server side is fine; we don't need clock-skew guarantees for an audit trail | Simpler code; equivalent for our needs |
| Failed redemptions write no audit | Keeps the collection a clean list of actual hand-offs, not a "bruteforce log" (rate-limiter already handles noisy failures) | If we ever want to detect bruteforce, rate-limit telemetry is the right source |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

Plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing env-vars test suite still red | Unchanged; `BRIDGE_ALERT_EMAIL` addition doesn't affect the existing failure |

## Operational Follow-up

- **`BRIDGE_ALERT_EMAIL` set on Vercel production** (handled by user before human-verify)
- **`firestore.rules` deployed** — user must run `firebase deploy --only firestore:rules` to push the new `bridge-redemptions` rule to production. Until deployed, the collection is writable by default rules (but Admin SDK writes succeed regardless; the risk is that the deny-by-default is not yet in effect from the client side).

## Next Phase Readiness

**Ready:**
- 9/10 v4.3 P0s closed. Remaining: **D01** (cascade delete) in Phase 4.
- Phase 3 (Bridge Credentials Design) now 2/2 plans complete → phase ✅ complete.

**Concerns:**
- `firestore.rules` deploy is a manual step (see Operational Follow-up). Should be part of the next `firebase deploy` cycle anyway.

**Blockers:** None.

---
*Phase: v43-03-bridge-credentials, Plan: 02*
*Completed: 2026-04-14*
