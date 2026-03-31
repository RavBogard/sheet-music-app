# Phase 1 Research: Song Groups & Swap Infrastructure

**Completed:** 2026-03-30
**Rounds:** 4 (12 agents total)
**Scope:** v3.0 Live Setlist Sync — foundational research across codebase, best practices, UX, and architecture

---

## Research Rounds

| Round | Focus | Agents | Key Deliverables |
|-------|-------|--------|-----------------|
| 1 | Codebase Discovery | 3 | Firestore models, permission system, real-time architecture |
| 2 | Deep Codebase Analysis | 3 | Mutation patterns, performance UI, security rules |
| 3 | External Research | 3 | Firestore best practices, worship UX patterns, data model design |
| 4 | Architecture Synthesis | 3 | Technical architecture, edge cases, migration plan |

---

## Executive Summary

### What We're Building
A music director can swap songs mid-service and have all musicians' tablets update in real-time. Songs are grouped by liturgical slot (all Barechu versions, all Mi Chamocha versions) for one-tap alternative selection.

### Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Song grouping model** | Hybrid: `metadata.liturgicalSlot` tag on songs + `config/songGroups` config doc | Tags = source of truth (no sync issues), config = display metadata/aliases |
| **Permission model** | `canLiveSwap` custom claim (mirrors `soundEngineer` pattern) | Existing pattern, zero Firestore reads for auth checks |
| **Swap mechanism** | Single `updateDoc` on setlist doc (tracks array + liveState dot-notation) | Already atomic, sub-500ms propagation, no new listeners needed |
| **Security enforcement** | `affectedKeys().hasOnly(['liveState', 'tracks', 'trackCount'])` | Field-level restriction — swap users can't modify other setlist fields |
| **Rate limiting** | 2s client debounce + `isNotTooFrequent()` Firestore rule | Prevents accidental double-taps, tamper-proof server-side |
| **Conflict resolution** | Last-write-wins (sufficient for 1-2 authorized users per service) | Simple, swap events are rare, `liveState.updatedByName` provides visibility |
| **Swap UI** | 3-tap flow: swap icon → bottom sheet alternatives → "Swap Now" | Fastest possible with confirmation; bottom sheet = best tablet UX |
| **Musician notification** | Silent auto-update + 4s toast ("Song changed to X") | Non-disruptive; never auto-navigate a musician viewing a different chart |
| **Audit trail** | `setlists/{id}/swapHistory` append-only subcollection | Matches existing `history` pattern, immutable, no document bloat |

---

## Codebase Findings (Rounds 1-2)

### Firestore Data Model
- **Setlists** at `setlists/{setlistId}` — tracks as embedded array, liveState as nested object
- **liveState** already exists: `{ enabled, currentTrackIndex, updatedBy, updatedByName, updatedAt }`
- **Tracks** mutated via full array replacement with 1s debounced auto-save
- **liveState** uses efficient dot-notation partial updates
- **No song grouping exists** — songs have AI-enriched `topics` but no functional category

### Permission System
- Roles: admin > band_leader > musician > member > pending
- `soundEngineer` boolean flag pattern = exact blueprint for `canLiveSwap`
- Monitor access: `useMonitorAccess()` hook derives from `isAdmin || isSoundEngineer || hasBusAssigned`
- Custom claims propagate via `claimsUpdatedAt` trigger → `getIdToken(true)` refresh

### Real-Time Architecture
- All listeners use `useSafeFirestoreSync` wrapper (handles lifecycle, errors, timeout)
- `useSetlistPerformance` subscribes to setlist doc — already provides `tracks` + `liveState`
- Cross-device sync only for leader position + presence — no queue sync between musicians
- `BroadcastChannel` used for library cache invalidation only

### Security Rules
- **Musicians CANNOT update setlists** — only owner/leader/admin
- **Field-level rules possible** via `affectedKeys().hasOnly()` (already used for notifications)
- **Presence** uses self-write pattern (each user writes own doc)

### Performance UI
- SetlistView → SetlistRow → PDFOverlay component tree
- PerformanceToolbar is dense/maxed on mobile (no room for new buttons there)
- AlertDialog pattern used for confirmations
- 3-tier responsive: default (<768) → md (768-1024) → lg (1024+)
- SetlistDrawer is virtualized with @tanstack/react-virtual

---

## Best Practices Research (Round 3)

### Firestore Real-Time Collaboration
- **Sub-500ms latency** typical for same-region onSnapshot
- **Single `updateDoc` is atomic** for multi-field writes on one document
- **Firestore SDK provides free optimistic UI** — writer sees instant update via `hasPendingWrites`
- **Custom claims recommended** over config doc for permissions (matches existing pattern)
- **Rate limiting** via `request.time` comparison in security rules is tamper-proof

### Worship Software UX Patterns
- **No existing worship app** has this exact live swap feature — novel concept
- **Planning Center** uses "arrangements" (closest model), **OnSong** uses tags
- **3-tap flow** is optimal: icon → picker → confirm (under 2-3 seconds)
- **Bottom sheet** preferred over popover for tablet (large touch targets, predictable positioning)
- **Silent auto-switch + brief toast** for musician notification (non-disruptive)
- **56px minimum touch targets** for stage use; 18px+ text for music stand readability
- **Never auto-navigate** a musician viewing a different chart — only update the track list silently

### Song Grouping Data Model
- **Hybrid approach wins**: tag on song (source of truth) + config doc (display metadata)
- **Token prefix matching** from existing template `queries` arrays for auto-grouping
- **Liturgical categories**: ~20 standard slots for Reform Judaism services
- **No denormalization needed** — client filters by tag from already-cached library
- **Migration**: Auto-tag from song names (70-80%), Gemini enrichment for new uploads, admin UI for edge cases
- **Schema evolution**: Start with `liturgicalSlot: string`, evolve to `liturgicalSlots: string[]` if needed

---

## Edge Cases & Failure Modes (Round 4)

### P0 — Must Handle at Launch (11 items)

| ID | Edge Case | Mitigation |
|----|-----------|------------|
| A1 | Musician loses WiFi | Show "Offline" banner when `fromCache === true`; auto-sync on reconnect |
| A2 | Director offline after confirming | Check `hasPendingWrites` after 3s; show "Swap pending" warning |
| A3 | Listener disconnects silently | Auto-resubscribe with backoff; 30s heartbeat monitor |
| B1 | Concurrent swap conflict | `swapVersion` counter; transaction rejects if version mismatch |
| B2 | Musician mid-scroll during swap | Overlay notification "Song changed" + "Load New Chart" button; don't auto-navigate |
| C1 | Late joiner | `tracks` array is canonical state; first snapshot is always correct |
| C5 | Swap target has no chart | Gray out chartless songs in picker; fallback to title/key display |
| E1 | Accidental wrong swap | 3-tap confirmation + 10s "Undo Last Swap" button after swap |
| E3 | Viewing swapped song's chart | Overlay notification; don't auto-replace chart |
| E4 | Viewing different song's chart | Silent track list update + brief toast; never navigate away |
| E5 | Unprefetched swap target | Immediately prefetch new chart on swap event; show skeleton during load |
| F1 | Partial write failure | Keep swap as single-document update (already atomic) |

### P1 — Should Handle (11 items)
- Slow WiFi >2s propagation, editor unsaved changes, swap revert A→B→A, deleted songs in group, empty group, token not refreshed, no setlist membership check, multiple authorized users, mixed file types, large tracks array, rapid successive swaps, concurrent PDF fetches

### P2 — Nice to Have (4 items)
- Print modal open during swap, permission revoked mid-service, unbounded swap history, orphaned group keys

---

## Technical Architecture

**Full architecture document:** `research/architecture.md`

### New Files (10)
| File | Purpose |
|------|---------|
| `src/types/song-groups.ts` | SongGroup, SongGroupEntry, SongGroupsConfig types |
| `src/types/swap-history.ts` | SwapHistoryEntry type |
| `src/hooks/use-live-swap-access.ts` | Permission hook |
| `src/hooks/use-song-groups.ts` | Song groups data + lookup helpers |
| `src/components/performance/SwapButton.tsx` | Swap icon on SetlistRow |
| `src/components/performance/SwapBottomSheet.tsx` | Alternative picker |
| `src/components/performance/SwapToast.tsx` | Receiver notification |
| `src/app/api/admin/set-live-swap/route.ts` | Toggle canLiveSwap |
| `src/app/api/admin/song-groups/route.ts` | CRUD for song groups |
| `src/app/api/admin/seed-song-groups/route.ts` | One-time group seeding |

### Modified Files (10)
| File | Change |
|------|--------|
| `src/types/models.ts` | `canLiveSwap` on UserProfile, `liturgicalSlot` on SetlistTrack + DriveFile.metadata |
| `src/types/schemas.ts` | Zod fields for new properties |
| `src/lib/setlist-live.ts` | `lastSwap` on LiveState, `swapLiveTrack()` function |
| `src/lib/auth-context.tsx` | `canLiveSwap` boolean derivation |
| `src/lib/liturgical-templates.ts` | Export TEMPLATE_REGISTRY |
| `src/components/performance/SetlistRow.tsx` | SwapButton integration |
| `src/components/performance/SetlistView.tsx` | Pass swap props to rows |
| `src/components/admin/UserRow.tsx` | canLiveSwap toggle button |
| `src/hooks/use-setlist-performance.ts` | Expose liveState for SwapToast |
| `firestore.rules` | canLiveSwap(), isNotTooFrequent(), modified update rule, swapHistory, songGroups |

### Data Flow (Happy Path)
```
T+0ms      Director taps swap icon on SetlistRow
T+50ms     SwapBottomSheet opens (config/songGroups already loaded)
T+200ms    Director taps alternative → "Swap Now"
T+250ms    swapLiveTrack(): updateDoc(tracks + liveState.lastSwap) + addDoc(swapHistory)
T+300ms    Director sees optimistic update
T+500-800ms  All musicians receive onSnapshot → SetlistRow re-renders + SwapToast appears
T+800ms    If musician viewing swapped chart → PDF reload
T+4800ms   SwapToast auto-dismisses
```

### Deployment Order
1. **Data layer**: Security rules → API routes → types → swapLiveTrack()
2. **UI layer**: Auth context → hooks → components → SetlistRow modifications
3. **Admin tooling** (deferred): Song Group Manager admin page

---

## Open Questions for Planning

1. Should we implement `swapVersion` transaction-based conflict resolution in Phase 1 or defer to Phase 3?
2. Should the "Undo Last Swap" button be a P0 or P1?
3. Should the admin Song Group Manager be its own phase or part of Phase 1?

---

*Research informs but does not automatically integrate into plans.*
*Review findings and proceed to /paul:plan for Phase 1.*
