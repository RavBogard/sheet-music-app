import { FieldValue } from "firebase-admin/firestore"
import { stripUndefined } from "./pure"

/**
 * THE ONLY CODE THAT WRITES `setlists/*` OR `tracks/*` (OPS-CONTRACT §Single
 * writer; guarded by src/lib/__tests__/setlist-single-writer.test.ts).
 *
 * Every write here carries the stamps receivers compare:
 *  - a row update sets `updatedAt` (server time) and bumps `version`, so the
 *    Dexie listener, the Perform strip and MCP `lastSeenVersion` all see it;
 *  - a setlist update does the same and stamps `lastModifiedAt`/`lastModifiedBy`;
 *  - `undefined` is never written.
 *
 * The one exception is `updateSetlistDerived`: the derived counts heal
 * (`trackCount`, `songCount`, `fileIds`) writes no stamp on purpose, because
 * it changes nothing an author wrote.
 *
 * Writers that need their own reads and logic (the MCP tools) open a
 * transaction or batch through `runSetlistTransaction` / `setlistBatch` and
 * write through the `SetlistWriter` they are handed. The op engine
 * (`engine.ts`) is built on the same writer.
 */

type DB = FirebaseFirestore.Firestore
type DocRef = FirebaseFirestore.DocumentReference

/** What Transaction and WriteBatch have in common. */
export interface WriteSink {
    set(ref: DocRef, data: FirebaseFirestore.DocumentData): unknown
    update(ref: DocRef, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>): unknown
    delete(ref: DocRef): unknown
    create(ref: DocRef, data: FirebaseFirestore.DocumentData): unknown
}

export interface WriterOptions {
    /** uid recorded as `lastModifiedBy` on setlist writes. */
    actor?: string
}

export const TRACKS = "tracks"
export const SETLISTS = "setlists"

export function trackRef(db: DB, id: string): DocRef {
    return db.collection(TRACKS).doc(id)
}
export function setlistRef(db: DB, id: string): DocRef {
    return db.collection(SETLISTS).doc(id)
}

export interface StampOptions {
    /**
     * Default true. False bumps `version` (and `lastModifiedAt`) but leaves
     * `updatedAt` alone: used for server-derived page fields until PR 3, so
     * an open editor's `updatedAt` precondition does not trip "Remote changes
     * detected", while iPads still take the row by its higher `version`.
     */
    touchUpdatedAt?: boolean
}

function bumpStamps(o: StampOptions = {}): Record<string, unknown> {
    return {
        ...(o.touchUpdatedAt === false ? {} : { updatedAt: FieldValue.serverTimestamp() }),
        version: FieldValue.increment(1),
        lastModifiedAt: new Date().toISOString(),
    }
}

function createStamps(data: Record<string, unknown>): Record<string, unknown> {
    return {
        updatedAt: data.updatedAt ?? FieldValue.serverTimestamp(),
        version: typeof data.version === "number" ? data.version : 1,
        lastModifiedAt:
            typeof data.lastModifiedAt === "string" ? data.lastModifiedAt : new Date().toISOString(),
    }
}

export class SetlistWriter {
    /** Number of writes queued so far (Firestore caps a transaction at 500). */
    writes = 0

    constructor(
        readonly db: DB,
        private readonly sink: WriteSink,
        private readonly opts: WriterOptions = {},
    ) {}

    // ── tracks ────────────────────────────────────────────────────────────

    /** Write a whole new row (`set`, replacing any doc of that id). */
    setTrack(id: string, data: Record<string, unknown>): void {
        const clean = stripUndefined(data)
        this.sink.set(trackRef(this.db, id), { ...clean, ...createStamps(clean) })
        this.writes++
    }

    /** Write a whole new row that must not exist yet (`create`). */
    createTrack(id: string, data: Record<string, unknown>): void {
        const clean = stripUndefined(data)
        this.sink.create(trackRef(this.db, id), { ...clean, ...createStamps(clean) })
        this.writes++
    }

    /** Patch a row; stamps `updatedAt` and bumps `version`. */
    updateTrack(id: string, patch: Record<string, unknown>, o: StampOptions = {}): void {
        const clean = stripUndefined(patch)
        if (o.touchUpdatedAt === false) delete clean.updatedAt
        this.sink.update(trackRef(this.db, id), { ...clean, ...bumpStamps(o) })
        this.writes++
    }

    deleteTrack(id: string): void {
        this.sink.delete(trackRef(this.db, id))
        this.writes++
    }

    // ── setlists ──────────────────────────────────────────────────────────

    setSetlist(id: string, data: Record<string, unknown>): void {
        const clean = stripUndefined(data)
        this.sink.set(setlistRef(this.db, id), {
            ...clean,
            ...createStamps(clean),
            ...(this.opts.actor && clean.lastModifiedBy === undefined ? { lastModifiedBy: this.opts.actor } : {}),
        })
        this.writes++
    }

    createSetlist(id: string, data: Record<string, unknown>): void {
        const clean = stripUndefined(data)
        this.sink.create(setlistRef(this.db, id), {
            ...clean,
            ...createStamps(clean),
            ...(this.opts.actor && clean.lastModifiedBy === undefined ? { lastModifiedBy: this.opts.actor } : {}),
        })
        this.writes++
    }

    /** Patch a setlist; stamps `updatedAt`, `lastModifiedAt/By` and bumps `version`. */
    updateSetlist(id: string, patch: Record<string, unknown>, o: StampOptions = {}): void {
        const clean = stripUndefined(patch)
        if (o.touchUpdatedAt === false) delete clean.updatedAt
        this.sink.update(setlistRef(this.db, id), {
            ...clean,
            ...bumpStamps(o),
            ...(this.opts.actor ? { lastModifiedBy: this.opts.actor } : {}),
        })
        this.writes++
    }

    /**
     * Derived counts only (`trackCount`, `songCount`, `fileIds`). No stamps:
     * a heal that changes no authored field must not look like an edit.
     */
    updateSetlistDerived(
        id: string,
        patch: { trackCount?: number; songCount?: number; fileIds?: string[] },
    ): void {
        this.sink.update(setlistRef(this.db, id), stripUndefined({ ...patch }))
        this.writes++
    }

    deleteSetlist(id: string): void {
        this.sink.delete(setlistRef(this.db, id))
        this.writes++
    }

    /**
     * A patch with NO stamps, for `maintainSetlist(..., { bump: false })` only:
     * bookkeeping fields nobody renders. Every caller of that option carries a
     * `// no-bump: <why>` line (guarded by setlist-single-writer.test.ts).
     */
    updateUnstamped(kind: "track" | "setlist", id: string, patch: Record<string, unknown>): void {
        const ref = kind === "track" ? trackRef(this.db, id) : setlistRef(this.db, id)
        this.sink.update(ref, stripUndefined(patch))
        this.writes++
    }
}

/** Run `fn` in one Admin transaction with a stamped writer. */
export function runSetlistTransaction<T>(
    db: DB,
    fn: (tx: FirebaseFirestore.Transaction, w: SetlistWriter) => Promise<T>,
    opts: WriterOptions = {},
): Promise<T> {
    return db.runTransaction((tx) => fn(tx, new SetlistWriter(db, tx as unknown as WriteSink, opts)))
}

/** A write batch with a stamped writer. Call `commit()` when done. */
export function setlistBatch(
    db: DB,
    opts: WriterOptions = {},
): { w: SetlistWriter; commit: () => Promise<unknown> } {
    const batch = db.batch()
    return { w: new SetlistWriter(db, batch as unknown as WriteSink, opts), commit: () => batch.commit() }
}

/**
 * Patch fields on one setlist doc, stamped and version-bumped. Used by the
 * rename and transfer routes and other single-doc metadata writers.
 */
export async function updateSetlistFields(
    db: DB,
    setlistId: string,
    patch: Record<string, unknown>,
    opts: WriterOptions = {},
): Promise<void> {
    const { w, commit } = setlistBatch(db, opts)
    w.updateSetlist(setlistId, patch)
    await commit()
}

/**
 * The derived counts heal on one setlist doc (`trackCount`, `songCount`,
 * `fileIds`), with no stamps — see `SetlistWriter.updateSetlistDerived`.
 */
export async function updateSetlistDerivedCounts(
    db: DB,
    setlistId: string,
    patch: { trackCount?: number; songCount?: number; fileIds?: string[] },
): Promise<void> {
    await setlistRef(db, setlistId).update(stripUndefined({ ...patch }))
}

export interface RowPatch {
    rowId: string
    patch: Record<string, unknown>
}

/**
 * Server-derived field writes on existing rows of ONE setlist (page binds,
 * re-book, identify). One transaction: rows that are gone or belong to another
 * setlist are skipped, every written row's `version` is bumped and the
 * setlist's `version` is bumped once — so iPads holding the row see the new
 * page number (the snapshot listener takes a higher `version`) instead of
 * keeping the old one.
 *
 * Interim until PR 3: `updatedAt` is NOT touched on the rows or the setlist,
 * so an author's open editor (whose outbox preconditions key on `updatedAt`)
 * does not hit "Remote changes detected" for a page the server filled in.
 *
 * `guard`, when given, runs against each row's current data inside the
 * transaction; returning false skips the row (bind-row's "never overwrite").
 */
export async function writeRowFields(
    db: DB,
    setlistId: string,
    rowsIn: readonly RowPatch[],
    opts: WriterOptions & { guard?: (current: Record<string, unknown>, rowId: string) => boolean } = {},
): Promise<{ written: string[]; skipped: string[] }> {
    if (rowsIn.length === 0) return { written: [], skipped: [] }
    // One write per doc: Firestore refuses two writes to one doc in a transaction.
    const merged = new Map<string, Record<string, unknown>>()
    for (const r of rowsIn) merged.set(r.rowId, { ...(merged.get(r.rowId) ?? {}), ...r.patch })
    const rows = [...merged].map(([rowId, patch]) => ({ rowId, patch }))
    return runSetlistTransaction(
        db,
        async (tx, w) => {
            const sRef = setlistRef(db, setlistId)
            const refs = rows.map((r) => trackRef(db, r.rowId))
            const [setlistSnap, ...snaps] = await tx.getAll(sRef, ...refs)
            const written: string[] = []
            const skipped: string[] = []
            if (!setlistSnap.exists) return { written, skipped: rows.map((r) => r.rowId) }
            snaps.forEach((snap, i) => {
                const { rowId, patch } = rows[i]
                const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
                if (!data || data.setlistId !== setlistId || (opts.guard && !opts.guard(data, rowId))) {
                    skipped.push(rowId)
                    return
                }
                w.updateTrack(rowId, patch, { touchUpdatedAt: false })
                written.push(rowId)
            })
            if (written.length > 0) w.updateSetlist(setlistId, {}, { touchUpdatedAt: false })
            return { written, skipped }
        },
        opts,
    )
}
