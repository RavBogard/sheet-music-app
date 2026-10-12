import "server-only"
/**
 * Multi-tenant phase 5 — the ONE server job that writes chart visibility.
 *
 * recomputeCollectionVisibility(collectionId) reads `collections/{id}`, works
 * out `visibleToOrgs` and `libraryOrgs` (visibility.ts stampForCollection), and
 * writes them, with `collectionId`, onto every `library_index` and `songs` row
 * of the collection, and `visibleTo` (a comma list) onto each row's Storage
 * objects' custom metadata for storage.rules. Batched and idempotent: a row or
 * object already holding the values is not written.
 *
 * Called whenever sharing or assignment changes (platform set_collection_sharing
 * / assign_collection, the tenant-admin authoring tools) and by the stamp and
 * nava-move scripts. recomputeRowVisibility(fileId) does the same for one row
 * (new uploads, a row moved between collections).
 *
 * Which rows belong to a collection: those whose `collectionId` is the id, plus
 * not-yet-stamped rows of the owner whose legacy `collection` derives to it
 * (visibility.ts collectionIdOf). `songs` rows follow their library_index twin
 * (same id); a songs row with no twin is matched by its own collectionId.
 */
import type { Bucket } from "@google-cloud/storage"
import type { Firestore } from "firebase-admin/firestore"
import { getFirestore, getStorage, initAdmin } from "@/lib/firebase-admin"
import { parseOrgConfig } from "@/lib/org/config-schema"
import { CODE_ORG_IDS, codeOrgConfig } from "@/lib/org/config-code"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import {
    collectionIdOf,
    ownerOf,
    sameStamp,
    stampForCollection,
    storageVisibleTo,
    type CollectionSharing,
    type VisibilityRow,
    type VisibilityStamp,
} from "@/lib/library/visibility"

export interface VisibilityJobDeps {
    db?: Firestore
    /** null = skip Storage (Firestore-only callers and tests without the Storage emulator). */
    bucket?: Bucket | null
}

export interface RecomputeResult {
    collectionId: string
    stamp: VisibilityStamp
    rows: number
    libraryIndexChanged: number
    songsChanged: number
    storageObjects: number
    storageChanged: number
    storageFailed: string[]
    dryRun: boolean
}

const BATCH = 400

function defaultBucket(): Bucket {
    initAdmin()
    const name =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return getStorage().bucket(name) as unknown as Bucket
}

function resolve(deps: VisibilityJobDeps): { db: Firestore; bucket: Bucket | null } {
    if (!deps.db) initAdmin()
    return {
        db: deps.db ?? getFirestore(),
        bucket: deps.bucket === undefined ? defaultBucket() : deps.bucket,
    }
}

const list = (v: unknown): OrgId[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [])

/** A collection record as the job needs it; null when the doc does not exist. */
export async function readCollectionSharing(db: Firestore, collectionId: string): Promise<CollectionSharing | null> {
    const snap = await db.collection("collections").doc(collectionId).get()
    if (!snap.exists) return null
    const d = (snap.data() ?? {}) as Record<string, unknown>
    const vis = d.visibility === "listed" || d.visibility === "all" ? d.visibility : "private"
    return {
        ownerOrgId: typeof d.ownerOrgId === "string" && d.ownerOrgId ? d.ownerOrgId : collectionId.split("__")[0],
        visibility: vis,
        sharedWith: list(d.sharedWith),
        assignedTo: list(d.assignedTo),
    }
}

/** Every tenant that is not suspended: orgs/* plus the code-configured tenants. */
export async function activeTenantIds(db: Firestore): Promise<OrgId[]> {
    const ids = new Set<OrgId>()
    const suspended = new Set<OrgId>()
    for (const d of (await db.collection("orgs").get()).docs) {
        const parsed = parseOrgConfig(d.data())
        const status = parsed.ok ? parsed.config.status : codeOrgConfig(d.id)?.status
        if (status === "suspended") suspended.add(d.id)
        else if (parsed.ok || codeOrgConfig(d.id)) ids.add(d.id)
    }
    for (const id of CODE_ORG_IDS) if (!suspended.has(id) && codeOrgConfig(id)?.status !== "suspended") ids.add(id)
    return [...ids].sort()
}

/** The stamp for a collection id; a missing record means owner-only. */
export async function stampFor(db: Firestore, collectionId: string, ownerHint?: OrgId): Promise<VisibilityStamp> {
    const rec = await readCollectionSharing(db, collectionId)
    if (!rec) {
        const owner = ownerHint ?? collectionId.split("__")[0]
        return { collectionId, visibleToOrgs: [owner], libraryOrgs: [owner] }
    }
    const active = rec.visibility === "all" ? await activeTenantIds(db) : []
    return stampForCollection(collectionId, rec, active)
}

/** `library/abc.pdf` → abc; `library/abc/page-1.png` → abc. */
export function fileIdOfObject(name: string): string {
    const rest = name.replace(/^library\//, "")
    const first = rest.split("/")[0]
    return rest.includes("/") ? first : first.replace(/\.[A-Za-z0-9]+$/, "")
}

/** Storage objects belonging to one chart (prefix match, then exact id). */
export async function chartObjects(bucket: Bucket, fileId: string) {
    const [files] = await bucket.getFiles({ prefix: `library/${fileId}` })
    return files.filter((f) => !f.name.endsWith("/") && fileIdOfObject(f.name) === fileId)
}

/** Stamp `visibleTo` on a chart's objects; returns [objects, changed, failed names]. */
export async function stampStorage(
    bucket: Bucket,
    fileId: string,
    visibleTo: string,
    dryRun: boolean,
): Promise<{ objects: number; changed: number; failed: string[] }> {
    let objects = 0
    let changed = 0
    const failed: string[] = []
    try {
        for (const f of await chartObjects(bucket, fileId)) {
            objects++
            const current = (f.metadata?.metadata as Record<string, unknown> | undefined)?.visibleTo
            if (current === visibleTo) continue
            changed++
            if (dryRun) continue
            try {
                await f.setMetadata({ metadata: { visibleTo } })
            } catch (e) {
                failed.push(f.name)
                logger.warn(`[visibility] setMetadata ${f.name} failed`, e)
            }
        }
    } catch (e) {
        failed.push(`library/${fileId}*`)
        logger.warn(`[visibility] listing objects for ${fileId} failed`, e)
    }
    return { objects, changed, failed }
}

interface Matched {
    ids: Set<string>
    index: Map<string, VisibilityRow>
}

async function rowsOfCollection(db: Firestore, collectionId: string, owner: OrgId): Promise<Matched> {
    const index = new Map<string, VisibilityRow>()
    const stamped = await db.collection("library_index").where("collectionId", "==", collectionId).get()
    for (const d of stamped.docs) index.set(d.id, d.data() as VisibilityRow)
    // Legacy (unstamped) rows of the owner that derive to this collection. The
    // missing-orgId case is crc's (ownerOf), so crc also scans rows with no orgId.
    const owned = await db.collection("library_index").where("orgId", "==", owner).get()
    for (const d of owned.docs) {
        const r = d.data() as VisibilityRow
        if (typeof r.collectionId === "string" && r.collectionId) continue
        if (collectionIdOf(r) === collectionId) index.set(d.id, r)
    }
    const ids = new Set(index.keys())
    const songsStamped = await db.collection("songs").where("collectionId", "==", collectionId).get()
    for (const d of songsStamped.docs) ids.add(d.id)
    return { ids, index }
}

async function commitInBatches(db: Firestore, writes: Array<{ path: string; data: Record<string, unknown> }>) {
    for (let i = 0; i < writes.length; i += BATCH) {
        const b = db.batch()
        for (const w of writes.slice(i, i + BATCH)) b.update(db.doc(w.path), w.data)
        await b.commit()
    }
}

const stampData = (s: VisibilityStamp) => ({
    collectionId: s.collectionId,
    visibleToOrgs: s.visibleToOrgs,
    libraryOrgs: s.libraryOrgs,
})

/** Rewrite every row (and Storage object) of one collection. Idempotent. */
export async function recomputeCollectionVisibility(
    collectionId: string,
    opts: VisibilityJobDeps & { dryRun?: boolean } = {},
): Promise<RecomputeResult> {
    const { db, bucket } = resolve(opts)
    const dryRun = opts.dryRun === true
    if (typeof collectionId !== "string" || !collectionId.includes("__")) {
        throw new Error(`"${collectionId}" is not a collection id (<owner>__<key>).`)
    }
    const rec = await readCollectionSharing(db, collectionId)
    const owner = rec?.ownerOrgId ?? collectionId.split("__")[0]
    const stamp = await stampFor(db, collectionId, owner)
    const { ids, index } = await rowsOfCollection(db, collectionId, owner)

    const writes: Array<{ path: string; data: Record<string, unknown> }> = []
    let libraryIndexChanged = 0
    let songsChanged = 0
    const idList = [...ids].sort()
    const songSnaps = idList.length ? await db.getAll(...idList.map((id) => db.collection("songs").doc(id))) : []
    idList.forEach((id, i) => {
        const row = index.get(id)
        if (row && !sameStamp(row, stamp)) {
            libraryIndexChanged++
            writes.push({ path: `library_index/${id}`, data: stampData(stamp) })
        }
        const s = songSnaps[i]
        if (s?.exists && !sameStamp(s.data() as VisibilityRow, stamp)) {
            songsChanged++
            writes.push({ path: `songs/${id}`, data: stampData(stamp) })
        }
    })
    if (!dryRun) await commitInBatches(db, writes)

    let storageObjects = 0
    let storageChanged = 0
    const storageFailed: string[] = []
    if (bucket) {
        const csv = storageVisibleTo(stamp.visibleToOrgs)
        for (const id of [...index.keys()].sort()) {
            const r = await stampStorage(bucket, id, csv, dryRun)
            storageObjects += r.objects
            storageChanged += r.changed
            storageFailed.push(...r.failed)
        }
    }
    if (storageFailed.length) logger.warn(`[visibility] ${collectionId}: ${storageFailed.length} Storage objects not stamped`)
    return {
        collectionId,
        stamp,
        rows: ids.size,
        libraryIndexChanged,
        songsChanged,
        storageObjects,
        storageChanged,
        storageFailed,
        dryRun,
    }
}

/**
 * One row: derive its collection, stamp it from that collection's record, and
 * stamp its Storage objects. For a new upload or a row whose `collection`
 * changed. A row with no library_index doc is left alone.
 */
export async function recomputeRowVisibility(
    fileId: string,
    opts: VisibilityJobDeps & { collectionId?: string } = {},
): Promise<VisibilityStamp | null> {
    const { db, bucket } = resolve(opts)
    const ref = db.collection("library_index").doc(fileId)
    const snap = await ref.get()
    if (!snap.exists) return null
    const row = snap.data() as VisibilityRow
    // A changed `collection` re-derives: the stamped collectionId names the old one.
    const derived = opts.collectionId ?? collectionIdOf({ ...row, collectionId: undefined })
    const stamp = await stampFor(db, derived, ownerOf(row))
    const batch = db.batch()
    let any = false
    if (!sameStamp(row, stamp)) {
        batch.update(ref, stampData(stamp))
        any = true
    }
    const songRef = db.collection("songs").doc(fileId)
    const song = await songRef.get()
    if (song.exists && !sameStamp(song.data() as VisibilityRow, stamp)) {
        batch.update(songRef, stampData(stamp))
        any = true
    }
    if (any) await batch.commit()
    if (bucket) await stampStorage(bucket, fileId, storageVisibleTo(stamp.visibleToOrgs), false)
    return stamp
}

/** Best-effort wrapper for write paths: a failure is logged, never thrown. */
export async function recomputeRowVisibilitySafe(fileId: string, opts: VisibilityJobDeps = {}): Promise<void> {
    try {
        await recomputeRowVisibility(fileId, opts)
    } catch (e) {
        logger.warn(`[visibility] row ${fileId} not stamped`, e)
    }
}
