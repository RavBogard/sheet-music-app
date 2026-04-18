# D01 Orphan-Surface Audit

Generated: 2026-04-14 for plan 04-03.

## Orphan surface

| Collection path | Reference field | Source of writes |
|---|---|---|
| `scheduling_assignments/*` | `setlistId` | `src/lib/scheduling-firebase.ts` (flat) |
| `tasks/*` | `setlistId` | server-side writes only (rules deny client) |
| `setlists/{id}/history/*` | — (subcollection) | client-side via `logSetlistChange` |
| `setlists/{id}/emailEvents/*` | — (subcollection) | server-side during publish |
| `users/{uid}/notifications/*` where `entityId == setlistId` | `entityId` | `publish/route.ts:140`, `notify-updated/route.ts:76`, `notification-store.ts:239,338,360`, `scheduling/unassign/route.ts:109` (uses setlistId as entityId) |

**Not in scope** (unrelated entityId):
- `users/{uid}/notifications/*` where `entityId == assignmentId` — scheduling-reminder uses the assignment doc.id (cron/scheduling-reminder/route.ts:147). These reference already-deleted assignments; harmless dead links.

## Firebase Admin SDK surface

`firestore.recursiveDelete(ref)` is available via `firebase-admin/firestore`. Our wrapper `src/lib/firebase-admin.ts` re-exports `getFirestore`, which returns the Firestore instance with `.recursiveDelete()` on it. No wrapper changes needed.

## AC-6 Decision — **Path (a): cascade notifications**

Use a `collectionGroup('notifications').where('entityId', '==', setlistId)` query to catch setlist-rooted notifications across all users.

**Rationale:** the `entityId` pattern is consistent enough that a single query reliably identifies setlist-direct notifications. Avoiding dead links in NotificationBell is user-visible quality; the index cost (one collectionGroup field index) is small.

**Required index:** `collectionGroup: notifications, fields: [entityId ASC]`.

To be added to `firestore.indexes.json` and deployed via `firebase deploy --only firestore:indexes` as part of this plan's rollout.

## Cascade order (retry-safe)

1. Verify `setlists/{id}` exists → 404 if not
2. Batch-delete `scheduling_assignments` where `setlistId == id` (chunks of 500)
3. Batch-delete `tasks` where `setlistId == id`
4. Batch-delete `notifications` via collectionGroup where `entityId == id`
5. `recursiveDelete(setlists/{id})` — removes parent + history + emailEvents + any other subcollection

Each phase is wrapped in try/catch; errors accumulate into a response `errors[]` array but don't halt subsequent phases. Re-running the route on the same id is safe — each phase's query will simply find 0 docs.
