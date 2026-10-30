import {
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where,
    type Firestore,
} from 'firebase/firestore'

import { logger } from '@/lib/logger'
import { deriveSetlistCounts } from '@/lib/setlist-derived-counts'

/**
 * Cycle-9 Lane B — trackCount drift-producer fix.
 *
 * Recompute a setlist's derived fields (`trackCount`, `songCount`, `fileIds`)
 * from the live top-level `tracks` collection and write them back to the
 * parent setlist doc, via `deriveSetlistCounts` (the same rules every server
 * track writer uses).
 *
 * This is the ONLY client writer of these fields (no client code writes
 * them through `updateSetlist` or the outbox any more). The editor used to
 * reconcile them through the outbox from its local Dexie copy; that copy is
 * routinely stale when the setlist is authored over MCP, so those rows
 * overwrote correct server counts and raised false "Remote changes detected"
 * conflicts. They were removed; this reads the server's tracks instead.
 *
 * No `updatedAt` bump: derived fields are not an edit, so writing them must
 * not invalidate any editor's pending `expectedUpdatedAt` precondition.
 *
 * Called from the sync-engine flush chokepoint
 * (`ProductionFirestoreAdapter.commitOutboxRow`) after every CLIENT-side
 * track create / delete, and after a track update that changes its type or
 * chart. The in-app grid editor (`SetlistGrid.tsx`) adds and
 * removes `tracks/{id}` docs through `applyEdit` WITHOUT maintaining the parent
 * counter, so each in-app delete inflated `trackCount` (count > actual — e.g.
 * `UnjLqKTtS4lNKQfMY6hB` 45 vs 30) and each add deflated it. Reconciling at the
 * single client→Firestore chokepoint means no current or future client caller
 * can drift the count, without editing the do-not-touch grid component.
 *
 * Why absolute recompute (not `FieldValue.increment`):
 *  - Idempotent under outbox retry — a recount is absolute, so re-driving the
 *    same flush twice yields the same value (an increment would double-count).
 *  - Double-count-safe against the paths that ALSO write an absolute count
 *    (create / clone / duplicate / `use-add-to-setlist`): this overwrites with
 *    the same true value rather than stacking on top.
 *
 * Why `updateDoc` (not `setDoc({merge:true})`): a missing parent — an orphan
 * track whose setlist was already deleted — must throw and be swallowed, NOT
 * resurrect a stub `setlists/{id}` doc.
 *
 * Best-effort by contract: the track write itself has already committed by the
 * time this runs, so a count-sync failure MUST NOT bubble — re-driving the
 * outbox row would loop. The `verify-chart-bond-health` cron +
 * `recompute_setlist_track_count` MCP tool heal any residual drift.
 *
 * Race safety: the engine drains the outbox serially under a cross-tab lock, so
 * no concurrent client track write mutates the subcollection mid-recount.
 */
export async function reconcileSetlistTrackCount(
    fsDb: Firestore,
    setlistId: string,
    orgId: unknown,
): Promise<void> {
    if (!setlistId) return
    // Listing tracks is tenant-scoped (a rule can only see an orgId filter),
    // so the count is only true when the query names the setlist's own
    // tenant. The caller passes the tenant of the committed track (stamped
    // from its parent setlist). When it is unknown — a legacy track with no
    // orgId — skip: guessing (e.g. the host site's tenant) would count zero
    // rows for another tenant's setlist and write trackCount 0 / fileIds [].
    // The crons heal anything left behind.
    if (typeof orgId !== 'string' || orgId.length === 0) {
        logger.warn(
            `[track-count-sync] skipped reconcile for setlist ${setlistId}: tenant unknown`,
        )
        return
    }
    try {
        const org = orgId
        const snap = await getDocs(
            query(
                collection(fsDb, 'tracks'),
                where('orgId', '==', org),
                where('setlistId', '==', setlistId),
            ),
        )
        const derived = deriveSetlistCounts(
            snap.docs.map((d) => d.data() as { type?: unknown; fileId?: unknown }),
        )
        await updateDoc(doc(fsDb, 'setlists', setlistId), {
            trackCount: derived.trackCount,
            songCount: derived.songCount,
            fileIds: derived.fileIds,
        })
    } catch (err) {
        logger.warn(
            `[track-count-sync] reconcile failed for setlist ${setlistId}`,
            err,
        )
    }
}
