---
phase: v43-10-auth-deep-dive
plan: 06
subsystem: auth
tags: [cross-tab, broadcastchannel, sign-out]
duration: ~5min
completed: 2026-04-15T05:10:00Z
---

# P10-06: Cross-tab sign-out via BroadcastChannel

`signOut()` posts on a shared 'auth-signout' BroadcastChannel; a matching listener in AuthProvider reloads sibling tabs so they don't sit on stale authenticated UI after one tab signs out.

## Shipped
- commit `a961b35`
- Graceful no-op on unsupported browsers (old Safari/Firefox)

## Verified
- tsc clean
- Full suite 1270/1270

## Closes
Phase v43-10 auth-deep-dive — all six planned plans (10-01 through 10-06) now shipped to prod.
