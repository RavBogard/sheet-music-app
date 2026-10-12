import "server-only"
/**
 * Multi-tenant phase 5 — the `nava` ownership move (ruling R-1012-mt-6),
 * BUILT AND REHEARSED here; it runs in production in phase 8 once Nava
 * Tehila's tenant exists.
 *
 * Every row of CRC's `nava` collection (library_index + its songs twin, every
 * status) becomes Nava's and is shared back to CRC:
 *   orgId          crc → <nava>
 *   collectionId   <nava>__nava
 *   visibleToOrgs  [<nava>, crc]
 *   libraryOrgs    [<nava>, crc]   (assigned to CRC: it stays in CRC's library,
 *                                   tab, pickers and default MCP search)
 *   previousOrgId  crc
 *   collection     "nava"          (unchanged, so CRC's "Nava Tehilah" tab keeps it)
 * File ids do not change, so every setlist track, cached title and Storage path
 * keeps resolving. The collection record `<nava>__nava` is created (owner Nava,
 * visibility listed, sharedWith [crc], assignedTo [crc] — assigned by the
 * platform owner, so a future Nava admin cannot cut CRC off), and CRC's
 * `crc__nava` is marked `movedTo`. Storage objects get metadata orgId <nava>
 * and visibleTo "<nava>,crc".
 *
 * Plan → manifest (every field's before and after) → apply; undo restores
 * exactly the before values, only where a document still holds the after
 * values. CLI: scripts/ops/multitenant/move-nava-collection.ts.
 */
import type { Bucket } from "@google-cloud/storage"
import { FieldValue, type Firestore } from "firebase-admin/firestore"
import { codeOrgConfig } from "@/lib/org/config-code"
import { ownerOf, stampForCollection, storageVisibleTo, type VisibilityRow } from "@/lib/library/visibility"
import { chartObjects } from "@/lib/library/visibility-job"

export const FROM_ORG = "crc"
export const COLLECTION_KEY = "nava"
export const MOVE_FIELDS = ["orgId", "collectionId", "visibleToOrgs", "libraryOrgs", "previousOrgId"] as const
type MoveField = (typeof MOVE_FIELDS)[number]
export const ABSENT = "__absent__"

export interface MoveDocEntry {
    collection: "library_index" | "songs"
    id: string
    status: string
    before: Record<MoveField, unknown>
    after: Record<MoveField, unknown>
}
export interface MoveObjectEntry {
    name: string
    before: { orgId: string; visibleTo: string }
    after: { orgId: string; visibleTo: string }
}
export interface MoveManifest {
    kind: "move-nava-collection"
    at: string
    projectId: string
    to: string
    targetCollectionId: string
    /** null = the move creates it (undo deletes it); else its fields before. */
    targetCollectionBefore: Record<string, unknown> | null
    targetCollectionAfter: Record<string, unknown>
    sourceCollectionId: string
    sourceCollectionBefore: { movedTo: unknown; movedAt: unknown } | null
    docs: MoveDocEntry[]
    objects: MoveObjectEntry[]
    summary: Record<string, number>
}

export class MoveError extends Error {}

const pick = (d: Record<string, unknown>): Record<MoveField, unknown> =>
    Object.fromEntries(MOVE_FIELDS.map((f) => [f, f in d ? d[f] : ABSENT])) as Record<MoveField, unknown>
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function assertTenant(db: Firestore, to: string): Promise<string> {
    if (!/^[a-z0-9-]+$/.test(to)) throw new MoveError(`"${to}" is not a tenant id.`)
    if (to === FROM_ORG) throw new MoveError("The nava collection already belongs to crc; name the tenant it moves to.")
    const snap = await db.collection("orgs").doc(to).get()
    const name = snap.exists ? snap.get("name") : codeOrgConfig(to)?.name
    if (!snap.exists && !codeOrgConfig(to)) throw new MoveError(`There is no tenant "${to}". Create it first (phase 8: create_tenant).`)
    return typeof name === "string" && name ? name : to
}

/** Every write the move would make; touches nothing. */
export async function planNavaMove(db: Firestore, bucket: Bucket | null, to: string, projectId = "unknown"): Promise<MoveManifest> {
    const toName = await assertTenant(db, to)
    const targetCollectionId = `${to}__${COLLECTION_KEY}`
    const sourceCollectionId = `${FROM_ORG}__${COLLECTION_KEY}`
    const sharing = { ownerOrgId: to, visibility: "listed" as const, sharedWith: [FROM_ORG], assignedTo: [FROM_ORG] }
    const stamp = stampForCollection(targetCollectionId, sharing, [])

    const rows = (await db.collection("library_index").where("collection", "==", COLLECTION_KEY).get()).docs.filter(
        (d) => ownerOf(d.data() as VisibilityRow) === FROM_ORG,
    )
    const docs: MoveDocEntry[] = []
    const songRefs = rows.map((d) => db.collection("songs").doc(d.id))
    const songs = songRefs.length ? await db.getAll(...songRefs) : []
    rows.forEach((d, i) => {
        const data = d.data()
        const after: Record<MoveField, unknown> = {
            orgId: to,
            collectionId: stamp.collectionId,
            visibleToOrgs: stamp.visibleToOrgs,
            libraryOrgs: stamp.libraryOrgs,
            previousOrgId: FROM_ORG,
        }
        const status = typeof data.status === "string" ? data.status : "active"
        docs.push({ collection: "library_index", id: d.id, status, before: pick(data), after })
        const s = songs[i]
        if (s?.exists) docs.push({ collection: "songs", id: d.id, status, before: pick(s.data() ?? {}), after })
    })

    const objects: MoveObjectEntry[] = []
    if (bucket) {
        const visibleTo = storageVisibleTo(stamp.visibleToOrgs)
        for (const d of rows) {
            for (const f of await chartObjects(bucket, d.id)) {
                const md = (f.metadata?.metadata ?? {}) as Record<string, unknown>
                objects.push({
                    name: f.name,
                    before: {
                        orgId: typeof md.orgId === "string" ? md.orgId : ABSENT,
                        visibleTo: typeof md.visibleTo === "string" ? md.visibleTo : ABSENT,
                    },
                    after: { orgId: to, visibleTo },
                })
            }
        }
    }

    const tSnap = await db.collection("collections").doc(targetCollectionId).get()
    const srcSnap = await db.collection("collections").doc(sourceCollectionId).get()
    const srcData = srcSnap.exists ? (srcSnap.data() ?? {}) : null
    const label = (srcData && typeof srcData.label === "string" && srcData.label) || toName
    const byStatus: Record<string, number> = {}
    for (const e of docs) if (e.collection === "library_index") byStatus[`status:${e.status}`] = (byStatus[`status:${e.status}`] ?? 0) + 1
    return {
        kind: "move-nava-collection",
        at: new Date().toISOString(),
        projectId,
        to,
        targetCollectionId,
        targetCollectionBefore: tSnap.exists
            ? Object.fromEntries(["ownerOrgId", "name", "label", "visibility", "sharedWith", "assignedTo"].map((k) => [k, tSnap.get(k) ?? ABSENT]))
            : null,
        targetCollectionAfter: { ownerOrgId: to, name: COLLECTION_KEY, label, ...sharing },
        sourceCollectionId,
        sourceCollectionBefore: srcData ? { movedTo: srcData.movedTo ?? ABSENT, movedAt: srcData.movedAt ?? ABSENT } : null,
        docs,
        objects,
        summary: {
            library_index: rows.length,
            songs: docs.filter((d) => d.collection === "songs").length,
            objects: objects.length,
            ...byStatus,
        },
    }
}

const BATCH = 400

export async function applyNavaMove(db: Firestore, bucket: Bucket | null, m: MoveManifest): Promise<{ docs: number; objects: number }> {
    if (m.kind !== "move-nava-collection") throw new MoveError("Not a move-nava-collection manifest.")
    // Collection record first: rows pointing at a missing record would read owner-only to the job.
    const tRef = db.collection("collections").doc(m.targetCollectionId)
    if (m.targetCollectionBefore === null) {
        await tRef.create({ ...m.targetCollectionAfter, createdAt: FieldValue.serverTimestamp(), createdBy: "move-nava-collection", movedFrom: m.sourceCollectionId })
    } else {
        await tRef.update(m.targetCollectionAfter)
    }
    for (let i = 0; i < m.docs.length; i += BATCH) {
        const b = db.batch()
        for (const e of m.docs.slice(i, i + BATCH)) b.update(db.collection(e.collection).doc(e.id), e.after)
        await b.commit()
    }
    if (m.sourceCollectionBefore !== null) {
        await db.collection("collections").doc(m.sourceCollectionId).update({ movedTo: m.targetCollectionId, movedAt: m.at })
    }
    let objects = 0
    if (bucket) {
        for (const o of m.objects) {
            await bucket.file(o.name).setMetadata({ metadata: { orgId: o.after.orgId, visibleTo: o.after.visibleTo } })
            objects++
        }
    }
    return { docs: m.docs.length, objects }
}

/** Restore the manifest's before values where the after values still stand. */
export async function undoNavaMove(
    db: Firestore,
    bucket: Bucket | null,
    m: MoveManifest,
    apply: boolean,
): Promise<{ docs: number; objects: number; skipped: string[] }> {
    if (m.kind !== "move-nava-collection") throw new MoveError("Not a move-nava-collection manifest.")
    const skipped: string[] = []
    let docs = 0
    for (let i = 0; i < m.docs.length; i += BATCH) {
        const b = db.batch()
        for (const e of m.docs.slice(i, i + BATCH)) {
            const ref = db.collection(e.collection).doc(e.id)
            const cur = await ref.get()
            if (!cur.exists || !same(pick(cur.data() ?? {}), e.after)) {
                skipped.push(`${e.collection}/${e.id}`)
                continue
            }
            const patch: Record<string, unknown> = {}
            for (const f of MOVE_FIELDS) patch[f] = e.before[f] === ABSENT ? FieldValue.delete() : e.before[f]
            b.update(ref, patch)
            docs++
        }
        if (apply) await b.commit()
    }
    let objects = 0
    if (bucket) {
        for (const o of m.objects) {
            const file = bucket.file(o.name)
            const [md] = await file.getMetadata().catch(() => [null] as const)
            const cur = (md?.metadata ?? {}) as Record<string, unknown>
            if (!md || cur.orgId !== o.after.orgId || cur.visibleTo !== o.after.visibleTo) {
                skipped.push(o.name)
                continue
            }
            if (apply)
                await file.setMetadata({
                    metadata: {
                        orgId: o.before.orgId === ABSENT ? null : o.before.orgId,
                        visibleTo: o.before.visibleTo === ABSENT ? null : o.before.visibleTo,
                    },
                })
            objects++
        }
    }
    if (apply) {
        if (skipped.length === 0) {
            const tRef = db.collection("collections").doc(m.targetCollectionId)
            if (m.targetCollectionBefore === null) await tRef.delete()
            else {
                const restore: Record<string, unknown> = {}
                for (const [k, v] of Object.entries(m.targetCollectionBefore)) restore[k] = v === ABSENT ? FieldValue.delete() : v
                await tRef.update(restore)
            }
        }
        if (m.sourceCollectionBefore !== null) {
            const b = m.sourceCollectionBefore
            await db.collection("collections").doc(m.sourceCollectionId).update({
                movedTo: b.movedTo === ABSENT ? FieldValue.delete() : b.movedTo,
                movedAt: b.movedAt === ABSENT ? FieldValue.delete() : b.movedAt,
            })
        }
    }
    return { docs, objects, skipped }
}
