---
phase: v43-10-auth-deep-dive
wave: 1D
type: forensic-analysis
scope: auth-incident timeline (3 months)
time: 2026-04-14T20:00:00Z
analyst: forensic-git-history
---

# Wave 1D: Forensic Git History of Auth Churn (Jan-Apr 2026)

Diagnosis: Auth system underwent 3 major hotfixes in 24-hour incident (Apr 14-15). Root cause: session cookie staleness vs. Firestore truth. Pattern: whack-a-mole between middleware, client token refresh, and cookie sync.

## Timeline Summary

| Date | Commit | Message | Root Cause | Still Present |
|------|--------|---------|---|---|
| 2026-04-14 17:14 | 0b10ecf | hotfix: relax setlists rule to isSignedIn() | Musicians locked out by stricter isMember() rule. Role-claim drift endemic. | YES - rule still at isSignedIn() |
| 2026-04-14 18:40 | 4da8d83 | hotfix: force token + session refresh on drift | Client-side staleness: server has claim, client token stale. sync-claims no-op. | YES - depends on subscription |
| 2026-04-14 18:45 | 945478b | hotfix: stop redirecting role-less sessions | Newly-approved musicians bounced in loop. Remove redirect, gate at Firestore. | YES (until 09-02) |
| 2026-04-14 19:18 | 302525f | docs: record incident + queue Plan 09-02 | Root: session cookie not authoritative. Minted from client token. | 09-02 targets this |
| 2026-04-14 19:31-32 | 6a706ff to a4e323f | Plan 09-02: server-signed companion cookie + restore proxy gate | Fix: server-mint separate cookie from Firestore, sign it, proxy verifies. | Shipped |
| 2026-04-14 20:00 | 48914b4 | hotfix: only enforce gate when companion verified | REGRESSION: 09-02 restore fires without SESSION_ROLE_SECRET live. 28min loop. | FIXED |

## Three Recurring Failure Modes

1. **Role Staleness in Session Cookie** - Snapshot of client token at mint time. If token old, cookie stale. Firebase no auto-refresh.
   - Status: Fixed by 09-02

2. **Drift Detection is Subscription-Based** - Client detects drift when profile loads. Subscription lazy, may not fire on fast nav.
   - Status: Mitigated by 09-02 (refresh-session endpoint)

3. **Proxy Cannot Know Firestore State** - Proxy at edge (5ms eval). Firestore calls 100-300ms. Calling Firestore every request kills perf.
   - Solution: Server-mint signed cookie. Proxy verifies signature (1ms) vs Firestore call.
   - Status: Accepted tradeoff

## In-Flight (Still Live)

- 0b10ecf: Rule relaxed to isSignedIn(). Plan 09-01 restores isMember() after stabilization.
- 4da8d83: Token refresh hotfix. Now part of larger drift handler in 09-02. Logic correct, subsumed.

## Root Causes

1. **Inverted Dependency**: Proxy gates on session cookie (client artifact) instead of server state. Should server-mint from Firestore (09-02 does), but solution additive, not replacing.

2. **Credential Refresh Assumptions**: App assumes client always has fresh token. Reality: tokens hours old, SDK only refreshes on explicit calls, multiple devices have different ages.

3. **Delayed Deployment Coordination**: SESSION_ROLE_SECRET deployed after code. Verification failed for 28 min, trapping users.
   - Pattern: Deploy critical env vars BEFORE code, not after.

## Pattern: Whack-a-Mole Never Ends

1. Middleware redirects pending users in loop
2. Fix A: Remove redirect, gate at Firestore
3. Regression: Pending users reach routes they shouldn't
4. Fix B: Add signed companion cookie
5. Regression of Fix B: Gate fires before secret live
6. Hotfix C: Gate on having verified companion, admit if not

Root: Proxy designed to be authoritative, but uses client artifact (session cookie).

Proper fix: Don't gate at proxy (gate at Firestore), OR provide authoritative signal to proxy (09-02 does latter).

Current post-09-02 state is CORRECT: Proxy not source of truth. Firestore always authoritative. Proxy prefers signed companion for UX, gracefully falls back.

## Deferred Risks

- Multi-device staleness: promoted on device A, device B stale until next sign-in (KNOWN)
- Companion cookie TTL 14d: admin demotes, cookie stays old (ACCEPTED tradeoff)
- Firestore rule permissive: isSignedIn() allows pending users (KNOWN, P1)

---

Forensic history compiled from 48-commit incident chain. All commits in origin/master, Vercel auto-deployed.
