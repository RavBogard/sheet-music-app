# Cycle-9 Lane B — trackCount drift-producer path audit

**Author:** coder-3 · **Anchor:** `edb24a47c` · **Tier:** 1

## TL;DR

The drift producer is the **in-app grid editor** (`SetlistGrid.tsx`). It
adds/removes/duplicates/pastes `tracks/{id}` docs through the local-first
write engine (`applyEdit` → sync engine → `ProductionFirestoreAdapter`)
**without ever maintaining the parent setlist's denormalized `trackCount`**.
Every in-app row delete inflates the count (count > actual — e.g.
`UnjLqKTtS4lNKQfMY6hB` 45 vs 30); every in-app add deflates it.

`SetlistGrid.tsx` is in the do-not-touch zone, so the fix goes at the **single
client→Firestore chokepoint** — `ProductionFirestoreAdapter.commitOutboxRow`
(`src/lib/sync/init.ts`). After committing a `tracks` create or delete, recompute
the parent `trackCount` from the live `tracks` subcollection. One chokepoint →
no current or future client caller can drift the count.

## Track-mutation path audit (every writer enumerated)

### Server-side (MCP + HTTP) — ALL atomic-and-correct ✓
| Path | Mechanism | trackCount maintenance |
|---|---|---|
| `src/lib/mcp/server-tracks-write.ts` `addTrack` | batch | `trackCount: existing.length+1` in same batch ✓ |
| ` ` `removeTrack` | transaction | `trackCount: remaining.length` in same tx ✓ |
| ` ` `bulkAddTracks` (atomic) | batch | `trackCount: existing.length+insertCount` ✓ |
| ` ` `reorderTracks` / `updateTrack` / `bulkUpdateTracks` | tx/batch | no count change (correct) ✓ |
| `src/lib/setlist-write.ts` `createSetlistServerSide` | batch | `trackCount: tracks.length` ✓ |
| `src/lib/mcp/tools/clone-setlist.ts` | batch | `trackCount: sourceTracks.length` ✓ |
| `src/lib/mcp/tools/propose-changes.ts` `commitStagedChanges` | tx | `trackCount: working.length` ✓ |
| `src/app/api/setlists/import/execute/route.ts` | via createSetlistServerSide | ✓ (trackCounter only names default titles) |

### Client-side (local-first engine)
| Path | Mechanism | trackCount maintenance |
|---|---|---|
| `src/lib/setlist-firebase.ts` create/clone/duplicate/saveAsTemplate | addDoc(absolute) + seed | sets absolute count at creation ✓ |
| `src/hooks/use-add-to-setlist.ts` add + undo | applyEdit + `updateSetlist({trackCount})` | maintained manually ✓ |
| **`src/components/setlist/grid/SetlistGrid.tsx`** add (`handlePickSong` :1531, `handleCreateFreeText` :1578, `handleAddTrackOfType` :1602), duplicate (`handleContextDuplicate` :1336), delete (`handleDeleteRow` :1114, bulk delete), paste | **`applyEdit` set/delete only** | **NONE — PRODUCER** ✗ |

`use-setlist-performance.ts` writes no tracks (read/playback). Reorder/cell-edits
are `update` ops (no count change).

## Why the fix lives at the adapter chokepoint

- `applyEdit` is a generic single-doc engine (Dexie + outbox); it has no notion
  of a parent counter. Every client track write flushes through
  `ProductionFirestoreAdapter.commitOutboxRow` (`set` / `update` / `delete`).
- The grid editor is the do-not-touch producer; the chokepoint covers it **and**
  every future client caller.
- **Recompute (absolute), not increment:** idempotent under outbox retry, and
  double-count-safe against the create/clone/add-to-setlist paths that also write
  an absolute count (recompute overwrites with the same true value). Increment
  would double-count those paths and break under retry.
- `updateDoc` (not `setDoc`-merge) so a missing parent (orphan track whose
  setlist was deleted) throws + is swallowed — never resurrects a stub setlist.
- **Best-effort:** the track write already succeeded; a count-sync failure must
  not bubble (would re-drive the outbox row + loop). The
  `verify-chart-bond-health` cron + `recompute_setlist_track_count` heal residual.
- Safe by construction: engine drains the outbox **serially** under a cross-tab
  lock → no concurrent track-write races during a recompute.

## Known residual (cron-healed, non-blocking)
A client grid edit racing a concurrent **server-side MCP** track write on the
same setlist within the recompute window could momentarily clobber the MCP's
correct count with a stale recount. Rare (simultaneous in-app + MCP edit of one
setlist); the daily cron + recompute tool heal it. No worse than today.

## Plan
1. NEW `src/lib/sync/track-count-sync.ts` — `reconcileSetlistTrackCount(fsDb, setlistId)` (Web SDK).
2. Wire into `src/lib/sync/init.ts` `commitOutboxRow`: after `tracks` `set` (use `payload.setlistId`) and after `tracks` `delete` (read setlistId before delete) → reconcile.
3. NEW emulator test (Web SDK via `@firebase/rules-unit-testing`, real Firestore): add keeps count==size, remove keeps count==size, 45→30 drift heals, idempotent, missing-parent no-resurrection.
4. Gates: `npm run test:emulator` + `next build --webpack`. Deployed REPRO per harness reality.
