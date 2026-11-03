import { runSetlistTransaction, setlistRef, trackRef, TRACKS, type SetlistWriter, type WriterOptions } from "./writer"

/**
 * Server writers that are not author ops (OPS-CONTRACT §Single writer, PR 3b):
 *
 *  - `createSetlistWithRows` / `writeNewSetlist`: a NEW setlist and all its
 *    rows in ONE transaction (clone, from template, performed clone, B'nei
 *    Mitzvah service creation).
 *  - `maintainSetlist`: any other server write to an EXISTING setlist and its
 *    rows, in one transaction. By default it bumps the setlist `version` (with
 *    `updatedAt`/`lastModifiedAt`) and each touched row's `version` +
 *    `updatedAt`, so every device sees the change. `bump: false` writes the
 *    fields with no stamps — only for bookkeeping fields nobody renders, and
 *    every such call site carries a `// no-bump: <why>` line (guarded).
 *  - `maintainSetlists` / `maintainRows`: the same, batched for back-fills
 *    (one transaction per setlist).
 *  - `deleteSetlistRows` / `deleteSetlistsWithRows` / `deleteSetlistTree`:
 *    removing whole setlists.
 */

type DB = FirebaseFirestore.Firestore
type Data = Record<string, unknown>

/** Firestore caps one transaction at 500 writes. */
export const MAX_TRANSACTION_WRITES = 500

export interface NewSetlistInput {
    setlistId: string
    setlist: Data
    rows: ReadonlyArray<{ id: string; data: Data }>
}

/**
 * Write a new setlist and its rows through a writer the caller already holds
 * (inside `runSetlistTransaction`, when the same transaction writes other docs).
 * `mode: "create"` refuses if any doc already exists; `"set"` replaces.
 */
export function writeNewSetlist(w: SetlistWriter, input: NewSetlistInput, mode: "set" | "create" = "set"): void {
    if (input.rows.length + 1 > MAX_TRANSACTION_WRITES) {
        throw new Error(`A setlist of ${input.rows.length} rows is too large to create in one transaction.`)
    }
    if (mode === "create") w.createSetlist(input.setlistId, input.setlist)
    else w.setSetlist(input.setlistId, input.setlist)
    for (const r of input.rows) {
        const data = { ...r.data, setlistId: input.setlistId }
        if (mode === "create") w.createTrack(r.id, data)
        else w.setTrack(r.id, data)
    }
}

/** A new setlist with all its rows, in ONE transaction. */
export async function createSetlistWithRows(
    db: DB,
    input: NewSetlistInput,
    opts: WriterOptions & { mode?: "set" | "create" } = {},
): Promise<void> {
    await runSetlistTransaction(
        db,
        async (_tx, w) => {
            writeNewSetlist(w, input, opts.mode ?? "set")
        },
        opts,
    )
}

export interface MaintainOptions extends WriterOptions {
    /** Default true. See the module comment before passing false. */
    bump?: boolean
}

/**
 * The writes one `maintainSetlist` call queues. Several writes to one doc
 * merge into one (a transaction may write a doc only once); they are written
 * when the callback returns.
 */
export class SetlistMaintenance {
    private readonly newRows = new Map<string, Data>()
    private readonly rowPatches = new Map<string, Data>()
    private readonly rowDeletes = new Set<string>()
    private setlistPatch: Data | null = null
    private setlistGone = false

    constructor(readonly setlistId: string) {}

    /** A new row on this setlist. */
    addRow(rowId: string, data: Data): void {
        this.rowDeletes.delete(rowId)
        this.rowPatches.delete(rowId)
        this.newRows.set(rowId, { ...data, setlistId: this.setlistId })
    }

    /** Patch an existing row (or a row added in this same call). */
    updateRow(rowId: string, patch: Data): void {
        const added = this.newRows.get(rowId)
        if (added) this.newRows.set(rowId, { ...added, ...patch })
        else this.rowPatches.set(rowId, { ...(this.rowPatches.get(rowId) ?? {}), ...patch })
    }

    deleteRow(rowId: string): void {
        this.newRows.delete(rowId)
        this.rowPatches.delete(rowId)
        this.rowDeletes.add(rowId)
    }

    /** Patch the setlist doc itself. */
    updateSetlist(patch: Data): void {
        this.setlistPatch = { ...(this.setlistPatch ?? {}), ...patch }
    }

    /**
     * The setlist doc does not exist (rows left behind by a deleted setlist):
     * rows are still written, stamped, but there is no setlist to bump.
     */
    setlistDocMissing(): void {
        this.setlistGone = true
        this.setlistPatch = null
    }

    get touched(): boolean {
        return this.newRows.size + this.rowPatches.size + this.rowDeletes.size > 0 || this.setlistPatch !== null
    }

    /** @internal */
    flush(w: SetlistWriter, bump: boolean): void {
        const writes = this.newRows.size + this.rowPatches.size + this.rowDeletes.size + 1
        if (writes > MAX_TRANSACTION_WRITES) {
            throw new Error(`${writes} writes are too many for one setlist transaction.`)
        }
        for (const [id, data] of this.newRows) w.setTrack(id, data)
        for (const [id, patch] of this.rowPatches) {
            if (bump) w.updateTrack(id, patch)
            else w.updateUnstamped("track", id, patch)
        }
        for (const id of this.rowDeletes) w.deleteTrack(id)
        if (bump) {
            if (this.touched && !this.setlistGone) w.updateSetlist(this.setlistId, this.setlistPatch ?? {})
        } else if (this.setlistPatch && !this.setlistGone) {
            w.updateUnstamped("setlist", this.setlistId, this.setlistPatch)
        }
    }
}

/**
 * One transaction on an existing setlist. `fn` reads through `tx` (and may
 * write docs of other collections through it) and queues setlist/row writes
 * on `m`; they are written, stamped, when `fn` returns. A callback that
 * queues nothing writes nothing.
 */
export function maintainSetlist<T>(
    db: DB,
    setlistId: string,
    fn: (tx: FirebaseFirestore.Transaction, m: SetlistMaintenance) => Promise<T>,
    opts: MaintainOptions = {},
): Promise<T> {
    return runSetlistTransaction(
        db,
        async (tx, w) => {
            const m = new SetlistMaintenance(setlistId)
            const out = await fn(tx, m)
            m.flush(w, opts.bump !== false)
            return out
        },
        opts,
    )
}

const BULK_CONCURRENCY = 8

async function inGroups<T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += BULK_CONCURRENCY) {
        await Promise.all(items.slice(i, i + BULK_CONCURRENCY).map(fn))
    }
}

/**
 * Back-fill helper: patch many setlist docs, one transaction each. A setlist
 * that no longer exists is skipped.
 */
export async function maintainSetlists(
    db: DB,
    items: ReadonlyArray<{ setlistId: string; patch: Data }>,
    opts: MaintainOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
    const written: string[] = []
    const skipped: string[] = []
    await inGroups(items, async ({ setlistId, patch }) => {
        const ok = await maintainSetlist(
            db,
            setlistId,
            async (tx, m) => {
                if (!(await tx.get(setlistRef(db, setlistId))).exists) return false
                m.updateSetlist(patch)
                return true
            },
            opts,
        )
        ;(ok ? written : skipped).push(setlistId)
    })
    return { written, skipped }
}

/**
 * Back-fill helper: patch rows across many setlists, one transaction per
 * setlist. Rows that are gone or now belong to another setlist are skipped.
 * Rows whose setlist doc is gone are still patched (stamped) with no setlist
 * bump, and so is a row with `setlistId: null` (an orphan no setlist lists) is patched, still
 * stamped, with no setlist to bump.
 */
export async function maintainRows(
    db: DB,
    items: ReadonlyArray<{ rowId: string; setlistId: string | null; patch: Data }>,
    opts: MaintainOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
    const orphans = items.filter((it) => it.setlistId === null)
    const bySetlist = new Map<string, Array<{ rowId: string; patch: Data }>>()
    for (const it of items) {
        if (it.setlistId === null) continue
        const list = bySetlist.get(it.setlistId) ?? []
        list.push({ rowId: it.rowId, patch: it.patch })
        bySetlist.set(it.setlistId, list)
    }
    const written: string[] = []
    const skipped: string[] = []
    const groups = [...bySetlist]
    // Keep each transaction well under the write cap.
    const chunks = groups.flatMap(([setlistId, rows]) => {
        const out: Array<[string, typeof rows]> = []
        for (let i = 0; i < rows.length; i += MAX_TRANSACTION_WRITES - 1) out.push([setlistId, rows.slice(i, i + MAX_TRANSACTION_WRITES - 1)])
        return out
    })
    await inGroups(chunks, async ([setlistId, rows]) => {
        const res = await maintainSetlist(
            db,
            setlistId,
            async (tx, m) => {
                const [sSnap, ...snaps] = await tx.getAll(setlistRef(db, setlistId), ...rows.map((r) => trackRef(db, r.rowId)))
                if (!sSnap.exists) m.setlistDocMissing()
                const w: string[] = []
                const s: string[] = []
                snaps.forEach((snap, i) => {
                    const data = snap.exists ? (snap.data() as Data) : null
                    if (!data || data.setlistId !== setlistId) s.push(rows[i].rowId)
                    else {
                        m.updateRow(rows[i].rowId, rows[i].patch)
                        w.push(rows[i].rowId)
                    }
                })
                return { w, s }
            },
            opts,
        )
        written.push(...res.w)
        skipped.push(...res.s)
    })
    for (let i = 0; i < orphans.length; i += MAX_TRANSACTION_WRITES) {
        const slice = orphans.slice(i, i + MAX_TRANSACTION_WRITES)
        const res = await runSetlistTransaction(
            db,
            async (tx, w) => {
                const snaps = await tx.getAll(...slice.map((r) => trackRef(db, r.rowId)))
                const ok: string[] = []
                const gone: string[] = []
                snaps.forEach((snap, j) => {
                    const data = snap.exists ? (snap.data() as Data) : null
                    if (!data || typeof data.setlistId === "string") gone.push(slice[j].rowId)
                    else {
                        if (opts.bump === false) w.updateUnstamped("track", slice[j].rowId, slice[j].patch)
                        else w.updateTrack(slice[j].rowId, slice[j].patch)
                        ok.push(slice[j].rowId)
                    }
                })
                return { ok, gone }
            },
            opts,
        )
        written.push(...res.ok)
        skipped.push(...res.gone)
    }
    return { written, skipped }
}

/** Delete every row of one setlist (chunked batches). Returns the count. */
export async function deleteSetlistRows(db: DB, setlistId: string): Promise<number> {
    const q = db.collection(TRACKS).where("setlistId", "==", setlistId)
    let total = 0
    while (true) {
        const snap = await q.limit(MAX_TRANSACTION_WRITES).get()
        if (snap.empty) break
        const batch = db.batch()
        snap.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
        total += snap.size
        if (snap.size < MAX_TRANSACTION_WRITES) break
    }
    return total
}

/**
 * Delete whole setlists: their rows first, then the setlist doc (not its
 * subcollections; see `deleteSetlistTree` for that).
 */
export async function deleteSetlistsWithRows(
    db: DB,
    setlistIds: readonly string[],
): Promise<{ setlists: number; tracks: number }> {
    let tracks = 0
    for (const id of setlistIds) tracks += await deleteSetlistRows(db, id)
    for (let i = 0; i < setlistIds.length; i += MAX_TRANSACTION_WRITES) {
        const batch = db.batch()
        for (const id of setlistIds.slice(i, i + MAX_TRANSACTION_WRITES)) batch.delete(setlistRef(db, id))
        await batch.commit()
    }
    return { setlists: setlistIds.length, tracks }
}

/** The setlist doc and every subcollection under it (history, emailEvents, …). */
export async function deleteSetlistTree(db: DB, setlistId: string): Promise<void> {
    await db.recursiveDelete(setlistRef(db, setlistId))
}
