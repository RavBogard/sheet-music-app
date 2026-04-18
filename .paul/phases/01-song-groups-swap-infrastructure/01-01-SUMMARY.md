---
phase: 01-song-groups-swap-infrastructure
plan: 01
subsystem: api, auth, data
tags: [firestore, firebase-auth, custom-claims, real-time, song-groups, live-swap]

requires: []
provides:
  - Song group types (SongGroup, SongGroupEntry, SongGroupsConfig)
  - Swap history type (SwapHistoryEntry)
  - canLiveSwap permission model (profile + custom claims + auth context)
  - swapLiveTrack() atomic swap function
  - useLiveSwapAccess() and useSongGroups() hooks
  - API routes for song group CRUD, seeding, and permission toggle
  - Firestore security rules for live swap, song groups, swap history
affects: [01-02-admin-ui, phase-2-swap-ui, phase-3-receiver]

tech-stack:
  added: []
  patterns: [canLiveSwap mirrors soundEngineer, affectedKeys().hasOnly() for field-level rules, config doc for group metadata]

key-files:
  created:
    - src/types/song-groups.ts
    - src/types/swap-history.ts
    - src/hooks/use-live-swap-access.ts
    - src/hooks/use-song-groups.ts
    - src/app/api/admin/set-live-swap/route.ts
    - src/app/api/admin/song-groups/route.ts
    - src/app/api/admin/seed-song-groups/route.ts
  modified:
    - src/types/models.ts
    - src/types/schemas.ts
    - src/lib/setlist-live.ts
    - src/lib/auth-context.tsx
    - src/lib/liturgical-templates.ts
    - firestore.rules

key-decisions:
  - "canLiveSwap follows soundEngineer pattern exactly (profile field + custom claim + auth context)"
  - "affectedKeys().hasOnly() restricts swap users to only tracks + liveState + trackCount fields"
  - "isNotTooFrequent() rule enforces 2s minimum between swaps via request.time"
  - "TEMPLATES exported from liturgical-templates.ts for seed endpoint reuse"
  - "swapLiveTrack uses dot-notation for liveState.lastSwap (partial update, not full object replace)"

patterns-established:
  - "canLiveSwap permission: isAdmin || isBandLeader || !!profile?.canLiveSwap"
  - "Song groups stored in config/songGroups (single doc, real-time via onSnapshot)"
  - "Swap audit trail in setlists/{id}/swapHistory subcollection (append-only, fire-and-forget)"
  - "LiveState.lastSwap with swapId for toast deduplication"

duration: ~25min
completed: 2026-03-30
---

# Phase 1 Plan 01: Data Layer for Live Setlist Sync

**Complete data infrastructure for live song swapping: types, permissions, security rules, swap function, hooks, and API routes.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Completed | 2026-03-30 |
| Tasks | 3 completed |
| Files created | 7 |
| Files modified | 6 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Song group types and config document | Pass | SongGroup, SongGroupEntry, SongGroupsConfig types created; liturgicalSlot on SetlistTrack + DriveFile.metadata |
| AC-2: canLiveSwap permission model | Pass | Auth context, hook, and API route all wired; mirrors soundEngineer exactly |
| AC-3: Firestore security rules | Pass | canLiveSwap(), isNotTooFrequent(), affectedKeys().hasOnly(), songGroups config, swapHistory subcollection |
| AC-4: swapLiveTrack atomic swap | Pass | Single updateDoc for tracks + liveState.lastSwap; fire-and-forget swapHistory addDoc |
| AC-5: Song groups CRUD and seeding | Pass | GET/PUT/DELETE on /api/admin/song-groups; POST /api/admin/seed-song-groups from liturgical templates |
| AC-6: useSongGroups hook | Pass | Real-time onSnapshot, getAlternatives(), getAlternativesByFileId(), hasAlternatives(), allGroups |
| AC-7: Build and type-check | Pass | tsc --noEmit zero errors, next build success |

## Accomplishments

- Built complete permission model for live swap (canLiveSwap custom claim + profile field + auth derivation + API toggle)
- Implemented field-level Firestore security rules restricting swap users to only tracks/liveState/trackCount fields
- Created swapLiveTrack() atomic function that updates tracks array + liveState.lastSwap in one write + audit trail
- Built song groups system with config/songGroups real-time subscription and library-matching seed endpoint
- Added rate limiting via Firestore rules (isNotTooFrequent — 2s minimum between swaps)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/types/song-groups.ts` | Created | SongGroup, SongGroupEntry, SongGroupsConfig interfaces |
| `src/types/swap-history.ts` | Created | SwapHistoryEntry interface for audit trail |
| `src/hooks/use-live-swap-access.ts` | Created | Permission hook deriving canSwap from auth context |
| `src/hooks/use-song-groups.ts` | Created | Real-time song groups subscription with lookup helpers |
| `src/app/api/admin/set-live-swap/route.ts` | Created | Toggle canLiveSwap (Firestore + custom claims) |
| `src/app/api/admin/song-groups/route.ts` | Created | CRUD for song group management |
| `src/app/api/admin/seed-song-groups/route.ts` | Created | Auto-seed groups from liturgical templates |
| `src/types/models.ts` | Modified | Added canLiveSwap to UserProfile, liturgicalSlot to SetlistTrack + DriveFile.metadata |
| `src/types/schemas.ts` | Modified | Added Zod fields for canLiveSwap and liturgicalSlot |
| `src/lib/setlist-live.ts` | Modified | Extended LiveState with lastSwap, added swapLiveTrack() |
| `src/lib/auth-context.tsx` | Modified | Added canLiveSwap derivation and context value |
| `src/lib/liturgical-templates.ts` | Modified | Exported TEMPLATES constant for seed endpoint |
| `firestore.rules` | Modified | Added canLiveSwap(), isNotTooFrequent(), modified setlist update, songGroups, swapHistory rules |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Dot-notation for liveState.lastSwap | Partial update avoids overwriting other liveState fields | Consistent with existing liveState patterns |
| getAlternativesByFileId() fallback in useSongGroups | Handles tracks without liturgicalSlot (legacy setlists) | Zero migration needed for existing setlists |
| TEMPLATES exported as named constant | Seed endpoint reuses existing template slot definitions | No duplicate liturgical data |
| Swap audit as fire-and-forget addDoc | Audit failure shouldn't block the live swap | Musicians see swap instantly regardless of audit write |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- All types importable by UI components
- useLiveSwapAccess() and useSongGroups() ready for component consumption
- swapLiveTrack() ready to be called from swap confirmation UI
- Security rules deployed and protecting swap operations

**Concerns:**
- Song groups config/songGroups doc doesn't exist yet in Firestore — needs seed endpoint called or manual setup
- canLiveSwap not yet granted to any users — admin must toggle via API or upcoming UI

**Blockers:** None

---
*Phase: 01-song-groups-swap-infrastructure, Plan: 01*
*Completed: 2026-03-30*
