import "server-only"

/**
 * Batch chart intake — Firestore persistence for `upload_batches/{batchId}`.
 *
 * Every function takes the `db` handle as its first argument rather than
 * calling `getFirestore()` itself, so the emulator test (and any future
 * caller holding a non-default app) can drive the store directly.
 *
 * Item mutations run in a transaction that re-reads the doc, merges the patch,
 * stamps `updatedAt`, recomputes `counts` from the resulting item map and
 * writes both — `counts` is a derived cache, never incremented in place, so a
 * concurrent processor can never leave it out of step with `items`.
 */

import {
    BATCH_COLLECTION,
    BATCH_TTL_MS,
    MAX_ITEMS_PER_BATCH,
    newBatchId,
    type BatchSource,
    type BatchStatus,
    type ParkedInfo,
    type UploadBatchDoc,
    type UploadBatchItem,
} from "./batch-types"
import { recomputeCounts } from "./batch-outcome"
import type { OrgId } from "@/lib/org/types"

/**
 * Firestore rejects `undefined` anywhere in a write payload. Item patches are
 * produced by `mapUploadResultToItem`, which legitimately yields
 * `{ score: undefined }` for a similar-duplicate with no score, so strip
 * undefined-valued keys (deeply) before writing.
 */
function stripUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((v) => stripUndefined(v)) as unknown as T
    }
    if (value !== null && typeof value === "object") {
        // Leave non-plain objects (Date, Timestamp, Buffer) alone.
        const proto = Object.getPrototypeOf(value)
        if (proto !== Object.prototype && proto !== null) return value
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v === undefined) continue
            out[k] = stripUndefined(v)
        }
        return out as unknown as T
    }
    return value
}

/** Firestore Timestamp | Date | ISO string → ISO string (empty string if absent). */
function toIso(value: unknown): string {
    if (!value) return ""
    if (value instanceof Date) return value.toISOString()
    if (typeof value === "string") return value
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === "function") return maybe.toDate().toISOString()
    return ""
}

export async function createBatch(
    db: FirebaseFirestore.Firestore,
    args: {
        ownerUid: string
        orgId: OrgId
        source: BatchSource
        defaults: UploadBatchDoc["defaults"]
    },
): Promise<{ batchId: string; expiresAt: Date }> {
    const batchId = newBatchId()
    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + BATCH_TTL_MS)

    const doc: UploadBatchDoc = {
        ownerUid: args.ownerUid,
        orgId: args.orgId,
        source: args.source,
        status: "open",
        defaults: args.defaults ?? {},
        counts: recomputeCounts({}),
        items: {},
        createdAt,
        expiresAt,
    }

    await db.collection(BATCH_COLLECTION).doc(batchId).set(stripUndefined(doc))
    return { batchId, expiresAt }
}

export async function getBatch(
    db: FirebaseFirestore.Firestore,
    batchId: string,
): Promise<(UploadBatchDoc & { batchId: string }) | null> {
    const snap = await db.collection(BATCH_COLLECTION).doc(batchId).get()
    if (!snap.exists) return null
    const data = snap.data() as UploadBatchDoc
    return { ...data, items: data.items ?? {}, batchId: snap.id }
}

/**
 * Append items to an open batch.
 *
 * Throws `Error("batch_not_found")` when the doc is gone,
 * `Error("batch_not_open")` when it is past `open`, and `Error("batch_full")`
 * when the resulting item count would exceed `MAX_ITEMS_PER_BATCH` — the
 * transaction aborts, so nothing is written in any of the three cases.
 */
export async function addItems(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    items: UploadBatchItem[],
): Promise<void> {
    const ref = db.collection(BATCH_COLLECTION).doc(batchId)
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) throw new Error("batch_not_found")
        const data = snap.data() as UploadBatchDoc
        if (data.status !== "open") throw new Error("batch_not_open")

        const existing = data.items ?? {}
        const merged: Record<string, UploadBatchItem> = { ...existing }
        for (const item of items) merged[item.itemId] = item
        if (Object.keys(merged).length > MAX_ITEMS_PER_BATCH)
            throw new Error("batch_full")

        tx.update(ref, stripUndefined({ items: merged, counts: recomputeCounts(merged) }))
    })
}

/**
 * Merge `patch` into one item, stamp its `updatedAt`, recompute `counts` and
 * write both. Returns the batch document as written.
 *
 * A key present in `patch` with the value `undefined` REMOVES that field from
 * the item — `mapUploadResultToItem` uses this to clear a stale `parked` block
 * when a forced re-run of a parked item fails (and vice versa). The removal is
 * real, not a `FieldValue.delete()` sentinel: `stripUndefined` drops the key
 * from the merged item and the transaction rewrites the WHOLE `items` map, and
 * `update()` replaces a map-valued field rather than deep-merging it, so a key
 * that is absent from the new map is gone from the document. (The sentinel
 * would not work here anyway — Firestore only accepts it at the top level of
 * the update data, not nested inside a map value.)
 *
 * Throws `Error("batch_not_found")` / `Error("item_not_found")`.
 */
export async function updateItem(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    itemId: string,
    patch: Partial<UploadBatchItem>,
): Promise<UploadBatchDoc> {
    const ref = db.collection(BATCH_COLLECTION).doc(batchId)
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) throw new Error("batch_not_found")
        const data = snap.data() as UploadBatchDoc
        const items = { ...(data.items ?? {}) }
        const current = items[itemId]
        if (!current) throw new Error("item_not_found")

        const next: UploadBatchItem = stripUndefined({
            ...current,
            ...patch,
            itemId: current.itemId,
            updatedAt: new Date().toISOString(),
        })
        items[itemId] = next
        const counts = recomputeCounts(items)

        tx.update(ref, stripUndefined({ items, counts }))
        return { ...data, items, counts }
    })
}

export async function setBatchStatus(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    status: BatchStatus,
    extra?: Partial<
        Pick<UploadBatchDoc, "committedAt" | "finishedAt" | "inngestEventId">
    >,
): Promise<void> {
    await db
        .collection(BATCH_COLLECTION)
        .doc(batchId)
        .update(stripUndefined({ status, ...(extra ?? {}) }))
}

/**
 * Parked items awaiting a human decision, newest batches first.
 *
 * Scans the org's 20 most recent batches that have anything parked, flattens
 * their parked items and returns at most `limit` rows.
 */
export async function listParkedForOrg(
    db: FirebaseFirestore.Firestore,
    orgId: OrgId,
    limit = 50,
): Promise<
    Array<{
        batchId: string
        itemId: string
        title: string
        fileName: string
        parked: ParkedInfo
        createdAt: string
    }>
> {
    // Requires the `upload_batches` composite index (orgId ASC, createdAt DESC,
    // counts.parked ASC) in firestore.indexes.json — the emulator does not
    // enforce composite indexes, so this only fails in a real project.
    const snap = await db
        .collection(BATCH_COLLECTION)
        .where("orgId", "==", orgId)
        .where("counts.parked", ">", 0)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get()

    const rows: Array<{
        batchId: string
        itemId: string
        title: string
        fileName: string
        parked: ParkedInfo
        createdAt: string
    }> = []

    for (const doc of snap.docs) {
        const data = doc.data() as UploadBatchDoc
        const createdAt = toIso(data.createdAt)
        for (const item of Object.values(data.items ?? {})) {
            if (item.status !== "parked" || !item.parked) continue
            rows.push({
                batchId: doc.id,
                itemId: item.itemId,
                title: item.title,
                fileName: item.fileName,
                parked: item.parked,
                createdAt,
            })
        }
    }

    return rows.slice(0, limit)
}
