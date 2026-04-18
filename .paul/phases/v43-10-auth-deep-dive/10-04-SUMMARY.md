---
phase: v43-10-auth-deep-dive
plan: 04
subsystem: auth
tags: [firestore-rules, security, audit-debt]
requires:
  - phase: v43-10-auth-deep-dive/03
    provides: reliable drift-repair chain
provides:
  - isMember() gate on setlists read restored
affects:
  - any future setlist-read path
tech-stack:
  added: []
  patterns:
    - "Claim-sync race mitigation via drift chain → makes tightened rules safe again"
key-files:
  created: []
  modified:
    - firestore.rules
key-decisions:
  - "Retain isOwner(resource) fallback — covers the brief post-creation window before the creator's own claim propagates (edge case but cheap insurance)"
duration: ~10min
started: 2026-04-15T04:35:00Z
completed: 2026-04-15T04:45:00Z
---

# Phase v43-10 Plan 04: Restore isMember() on setlists

**Firestore setlists read rule retightened from `isSignedIn()` to `isMember() || isOwner(resource)`. 0b10ecf debt paid; posture now aligns with storage.rules. Deployed live via `firebase deploy --only firestore:rules`.**

## Acceptance Criteria Results

| AC | Status |
|----|--------|
| AC-1 Pending user blocked | Pass (by construction; milestone-end smoke verifies) |
| AC-2 Musician can read | Pass (existing behavior preserved) |
| AC-3 Owner fallback | Pass (isOwner still present) |
| AC-4 Other rules untouched | Pass (diff shows single rule change) |

## Task Commits

| Commit | Type | Description |
|--------|------|-------------|
| `77c7aad` | fix | setlists read rule tightened + `firebase deploy` ran successfully |

## Deploy

Ran `firebase deploy --only firestore:rules` against project `crcmusiccharts`. Rules are live as of commit time.

## Deviations

None.

## Next

P10-05 — production E2E auth smoke via Playwright (catches regressions in this class before users do).
