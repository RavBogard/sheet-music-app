import "server-only"
/**
 * Multi-tenant phase 5 — stamp every chart row and Storage object with its
 * visibility, as the collection records say today (phase 4 seeded them all
 * private, so every row ends up visible only to its own tenant: nothing a
 * reader sees changes). Run once before the browser starts querying
 * `visibleToOrgs` (lane 2). Plan / apply / undo, with a manifest that holds,
 * for every document and object written, the exact values before and after.
 *
 * CLI: scripts/ops/multitenant/stamp-collection-visibility.ts.
 */
import type { Bucket } from "@google-cloud/storage"
import { FieldValue, type Firestore } from "firebase-admin/firestore"
import {
    collectionIdOf,
    ownerOf,
    sameStamp,
    storageVisibleTo,
    type VisibilityRow,
    type VisibilityStamp,
} from "@/lib/library/visibility"
import { fileIdOfObject, stampFor } from "@/lib/library/visibility-job"

export const STAMP_FIELDS = ["collectionId", "visibleToOrgs", "libraryOrgs"] as const
type StampField = (typeof STAMP_FIELDS)[number]

/** A field's value, or ABSENT when the document had no such field. */
export const ABSENT = "__absent__"
type Val = unknown

export interface DocEntry {
    collection: "library_index" | "songs"
    id: string
    before: Record<StampField, Val>
    after: Record<StampField, Val>
}

export interface ObjectEntry {
    name: string
    before: string | typeof ABSENT
    after: string
}

export interface StampManifest {
    kind: "stamp-collection-visibility"
    at: string
    projectId: string
    docs: DocEntry[]
    objects: ObjectEntry[]
    summary: Record<string, number>
}

const pick = (d: Record<string, unknown>): Record<StampField, Val> =>
    Object.fromEntries(STAMP_FIELDS.map((f) => [f, f in d ? d[f] : ABSENT])) as Record<StampField, Val>
const asStamp = (s: VisibilityStamp): Record<StampField, Val> => ({
    collectionId: s.collectionId,
    visibleToOrgs: s.visibleToOrgs,
    libraryOrgs: s.libraryOrgs,
})

/** Work out every write; touches nothing. */
export async function planStamp(db: Firestore, bucket: Bucket | null, projectId = "unknown"): Promise<StampManifest> {
    const cache = new Map<string, VisibilityStamp>()
    const stampOf = async (row: VisibilityRow): Promise<VisibilityStamp> => {
        const id = collectionIdOf(row)
        if (!cache.has(id)) cache.set(id, await stampFor(db, id, ownerOf(row)))
        return cache.get(id)!
    }
    const docs: DocEntry[] = []
    const byFileId = new Map<string, VisibilityStamp>()
    const index = await db.collection("library_index").get()
    for (const d of index.docs) {
        const row = d.data() as VisibilityRow
        const s = await stampOf(row)
        byFileId.set(d.id, s)
        if (!sameStamp(row, s)) docs.push({ collection: "library_index", id: d.id, before: pick(row), after: asStamp(s) })
    }
    const songs = await db.collection("songs").get()
    for (const d of songs.docs) {
        const row = d.data() as VisibilityRow
        // A songs row follows its library_index twin; one without a twin derives from itself.
        const s = byFileId.get(d.id) ?? (await stampOf(row))
        if (!sameStamp(row, s)) docs.push({ collection: "songs", id: d.id, before: pick(row), after: asStamp(s) })
    }
    const objects: ObjectEntry[] = []
    if (bucket) {
        const [files] = await bucket.getFiles({ prefix: "library/" })
        for (const f of files) {
            if (f.name.endsWith("/")) continue
            const md = (f.metadata?.metadata ?? {}) as Record<string, unknown>
            const s = byFileId.get(fileIdOfObject(f.name))
            const owner = typeof md.orgId === "string" && md.orgId ? md.orgId : "crc"
            const after = storageVisibleTo(s ? s.visibleToOrgs : [owner])
            const before = typeof md.visibleTo === "string" ? md.visibleTo : ABSENT
            if (before !== after) objects.push({ name: f.name, before, after })
        }
    }
    const summary: Record<string, number> = {
        library_index: docs.filter((d) => d.collection === "library_index").length,
        songs: docs.filter((d) => d.collection === "songs").length,
        objects: objects.length,
        sharedRows: docs.filter((d) => Array.isArray(d.after.visibleToOrgs) && (d.after.visibleToOrgs as string[]).length > 1).length,
    }
    return { kind: "stamp-collection-visibility", at: new Date().toISOString(), projectId, docs, objects, summary }
}

const BATCH = 400

/** Write the manifest's `after` values. */
export async function applyStamp(db: Firestore, bucket: Bucket | null, m: StampManifest): Promise<{ docs: number; objects: number }> {
    for (let i = 0; i < m.docs.length; i += BATCH) {
        const b = db.batch()
        for (const e of m.docs.slice(i, i + BATCH)) b.update(db.collection(e.collection).doc(e.id), e.after)
        await b.commit()
    }
    let objects = 0
    if (bucket) {
        for (const o of m.objects) {
            await bucket.file(o.name).setMetadata({ metadata: { visibleTo: o.after } })
            objects++
        }
    }
    return { docs: m.docs.length, objects }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Put back the manifest's `before` values (an absent field is deleted again),
 * only where the document still holds exactly what the stamp wrote; anything
 * changed since is reported, never overwritten.
 */
export async function undoStamp(
    db: Firestore,
    bucket: Bucket | null,
    m: StampManifest,
    apply: boolean,
): Promise<{ docs: number; objects: number; skipped: string[] }> {
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
            for (const f of STAMP_FIELDS) patch[f] = e.before[f] === ABSENT ? FieldValue.delete() : e.before[f]
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
            if (!md || (md.metadata as Record<string, unknown> | undefined)?.visibleTo !== o.after) {
                skipped.push(o.name)
                continue
            }
            if (apply) await file.setMetadata({ metadata: { visibleTo: o.before === ABSENT ? null : o.before } })
            objects++
        }
    }
    return { docs, objects, skipped }
}
