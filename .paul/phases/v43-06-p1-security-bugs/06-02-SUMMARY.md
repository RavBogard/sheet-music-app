---
phase: v43-06-p1-security-bugs
plan: 02
subsystem: bugs+security
tags: [race-conditions, defensive-coding, qr-auth]
duration: ~20min
completed: 2026-04-15T05:30:00Z
---

# P6-02: B03/B06 defensive fixes + S04 QR role gate

## Shipped
- **B03** `firestore-monitor-client.ts`: new `_disconnected` flag; `forwardSnapshot()` and debounce-timer callback early-return post-teardown. Firestore's async unsubscription was letting stale snapshots reach the store.
- **B06** `setlist-firebase.ts`: `swapTrack` transaction guards `Array.isArray(remote.tracks)` before indexing. Corrupted docs (non-array `tracks`) no longer crash in `.length`.
- **S04** `api/auth/qr/route.ts`: QR approval (PUT) now requires an approver with `member`/`musician`/`band_leader`/`admin` claim. Pending accounts can't mint custom tokens for a shared iPad.
- commit `634e7c8` (B03+B06), `62d4e2d` (S04)

## Deviations: B04 + B05 re-reviewed, found not to be bugs
- **B04** `use-setlist-logic.loadLibraryMeta` — `for..of` uses `const file` so the closure is stable; match is by `fileId` not index; updates gated on `!t.key`. The audit finding was defensive but the code is correct.
- **B05** `DashboardClient` subscription cleanup — effect only registers an unsub when `setlistService` was truthy at run time. React's effect semantics handle the unsub correctly on re-run / unmount.

Both documented here rather than changed.

## Verified
- tsc clean
- Full suite 1270/1270 green

## Next
All P0 + P1 audit items now closed. Ready to pivot to v4.3 milestone completion or start v4.4 planning.
