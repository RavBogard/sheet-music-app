import { logger } from "@/lib/logger"
import type { OrgId } from "@/lib/org/types"
import { deleteSetlistRows, deleteSetlistTree } from "./maintenance"

type DB = FirebaseFirestore.Firestore

export interface SetlistCascadeResult {
    assignments: number
    tasks: number
    notifications: number
    tracks: number
    /** One `<phase>: <message>` per phase that failed. */
    errors: string[]
}

/**
 * Delete chunked at 500 per WriteBatch (Firestore hard limit). Never touches
 * setlists/* or tracks/*: the collections passed in are the setlist's
 * dependents.
 */
async function batchDeleteByField(
    db: DB,
    collectionPath: string,
    field: string,
    value: string,
    opts: { collectionGroup?: boolean } = {},
): Promise<number> {
    const ref: FirebaseFirestore.Query = opts.collectionGroup
        ? db.collectionGroup(collectionPath).where(field, "==", value)
        : db.collection(collectionPath).where(field, "==", value)

    let total = 0
    while (true) {
        const snap = await ref.limit(500).get()
        if (snap.empty) break
        const batch = db.batch()
        snap.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
        total += snap.size
        if (snap.size < 500) break
    }
    return total
}

/**
 * THE cascading setlist delete, shared by `POST /api/setlist/delete` and the
 * MCP `delete_setlist` tool. The caller has already checked existence,
 * tenant and permission. Removes, in order:
 *   - scheduling_assignments where setlistId == id
 *   - tasks where setlistId == id
 *   - notifications (collectionGroup) where entityId == id
 *   - tracks where setlistId == id (tenant-checked)
 *   - setlists/{id} and every subcollection under it (history, performance,
 *     opBatches, emailEvents, …), tenant-checked
 *
 * Each phase is best-effort: a failure is logged and recorded in `errors`
 * but does not halt the cascade. Re-running for the same id is a no-op, and
 * so is a phase whose target is already gone (a setlist doc deleted earlier
 * still has its subcollections removed).
 */
export async function deleteSetlistCascade(
    db: DB,
    org: OrgId,
    setlistId: string,
): Promise<SetlistCascadeResult> {
    const out: SetlistCascadeResult = { assignments: 0, tasks: 0, notifications: 0, tracks: 0, errors: [] }
    const phase = async (name: string, run: () => Promise<void>) => {
        try {
            await run()
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] ${name} cleanup failed for ${setlistId}: ${msg}`)
            out.errors.push(`${name}: ${msg}`)
        }
    }

    await phase("assignments", async () => {
        out.assignments = await batchDeleteByField(db, "scheduling_assignments", "setlistId", setlistId)
    })
    await phase("tasks", async () => {
        out.tasks = await batchDeleteByField(db, "tasks", "setlistId", setlistId)
    })
    await phase("notifications", async () => {
        out.notifications = await batchDeleteByField(db, "notifications", "entityId", setlistId, {
            collectionGroup: true,
        })
    })
    await phase("tracks", async () => {
        out.tracks = await deleteSetlistRows(db, org, setlistId)
    })
    await phase("setlist", async () => {
        await deleteSetlistTree(db, org, setlistId)
    })
    return out
}
