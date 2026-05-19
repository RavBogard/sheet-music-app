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

/**
 * Cycle-9 Lane B — trackCount drift-producer fix.
 *
 * Recompute a setlist's denormalized `trackCount` from the live top-level
 * `tracks` subcollection and write it back to the parent setlist doc.
 *
 * Called from the sync-engine flush chokepoint
 * (`ProductionFirestoreAdapter.commitOutboxRow`) after every CLIENT-side
 * track create / delete. The in-app grid editor (`SetlistGrid.tsx`) adds and
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
): Promise<void> {
    if (!setlistId) return
    try {
        const snap = await getDocs(
            query(
                collection(fsDb, 'tracks'),
                where('setlistId', '==', setlistId),
            ),
        )
        await updateDoc(doc(fsDb, 'setlists', setlistId), {
            trackCount: snap.size,
        })
    } catch (err) {
        logger.warn(
            `[track-count-sync] reconcile failed for setlist ${setlistId}`,
            err,
        )
    }
}
