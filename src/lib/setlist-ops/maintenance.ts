import { rowOrg } from "@/lib/org/membership"
import type { OrgId } from "@/lib/org/types"
import {
    runSetlistTransaction,
    setlistRef,
    trackRef,
    TRACKS,
    writeSetlistUnstamped,
    type SetlistWriter,
    type StampOptions,
    type WriterOptions,
} from "./writer"

/**
 * Server writers that are not author ops (OPS-CONTRACT §Single writer, PR 3b):
 *
 *  - `createSetlistWithRows` / `writeNewSetlist`: a NEW setlist and all its
 *    rows in ONE transaction (clone, from template, performed clone, B'nei
 *    Mitzvah service creation).
 *  - `maintainSetlist`: any other server write to an EXISTING setlist and its
 *    rows, in one transaction. By default it bumps the setlist `version` (with
 *    `updatedAt`/`lastModifiedAt`) and each touched row's `version` +
 *    `updatedAt`, so every device sees the change. `bump: false` writes only
 *    the setlist fields in `NO_BUMP_FIELDS`, unstamped; every such call site
 *    carries a `// no-bump: <why>` line (guarded).
 *  - `maintainSetlists` / `maintainRows`: the same, for back-fills (one
 *    transaction per setlist).
 *  - `deleteSetlistRows` / `deleteSetlistsWithRows` / `deleteSetlistTree`:
 *    removing whole setlists.
 *
 * Every helper takes the caller's tenant (`org`) and checks it against the
 * stored setlist/row `orgId` (unstamped reads as crc) before writing: a
 * mismatch throws `wrong-tenant` and nothing is written.
 */

type DB = FirebaseFirestore.Firestore
type Data = Record<string, unknown>

/** Firestore caps one transaction at 500 writes. */
export const MAX_TRANSACTION_WRITES = 500

/** The only setlist fields a `bump: false` write may carry. */
export const NO_BUMP_FIELDS: ReadonlySet<string> = new Set(["lastNotifiedAt"])

export class MaintenanceError extends Error {
    constructor(
        readonly code: "wrong-tenant" | "not-found" | "too-large" | "invalid",
        message: string,
    ) {
        super(`${code}: ${message}`)
        this.name = "MaintenanceError"
    }
}

function assertOrg(data: Data | undefined, org: OrgId, what: string): void {
    if (data && rowOrg(data.orgId) !== org) {
        throw new MaintenanceError("wrong-tenant", `${what} belongs to another tenant.`)
    }
}

export interface NewSetlistInput {
    setlistId: string
    setlist: Data
    rows: ReadonlyArray<{ id: string; data: Data }>
}

/**
 * Write a new setlist and its rows through a writer the caller already holds
 * (inside `runSetlistTransaction`, when the same transaction writes other docs).
 * `mode: "create"` (the default) refuses if any doc already exists.
 */
export function writeNewSetlist(
    w: SetlistWriter,
    org: OrgId,
    input: NewSetlistInput,
    mode: "set" | "create" = "create",
): void {
    if (input.rows.length + 1 > MAX_TRANSACTION_WRITES) {
        throw new MaintenanceError("too-large", `A setlist of ${input.rows.length} rows is too large to create in one transaction.`)
    }
    assertOrg(input.setlist, org, `Setlist ${input.setlistId}`)
    for (const r of input.rows) assertOrg(r.data, org, `Row ${r.id}`)
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
    org: OrgId,
    input: NewSetlistInput,
    opts: WriterOptions & { mode?: "set" | "create" } = {},
): Promise<void> {
    await runSetlistTransaction(
        db,
        async (_tx, w) => {
            writeNewSetlist(w, org, input, opts.mode ?? "create")
        },
        opts,
    )
}

export interface MaintainOptions extends WriterOptions {
    /** Default true. See the module comment before passing false. */
    bump?: boolean
    /**
     * Default true. False still bumps `version` but leaves `updatedAt` alone:
     * for server-derived writes (assignments, back-filled week keys / isTest,
     * the ceremony link) until PR 3 retires the editor's `updatedAt`
     * precondition.
     */
    touchUpdatedAt?: boolean
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

    constructor(
        readonly setlistId: string,
        private readonly bump: boolean = true,
    ) {}

    private rowsAllowed(): void {
        if (!this.bump) throw new MaintenanceError("invalid", "A bump:false write may not touch rows.")
    }

    /** A new row on this setlist (written with `create`: it must not exist). */
    addRow(rowId: string, data: Data): void {
        this.rowsAllowed()
        if (this.rowDeletes.has(rowId)) throw new MaintenanceError("invalid", `Row ${rowId} was deleted earlier in this write.`)
        this.newRows.set(rowId, { ...data, setlistId: this.setlistId })
    }

    /** Patch an existing row (or a row added in this same call). */
    updateRow(rowId: string, patch: Data): void {
        this.rowsAllowed()
        if (this.rowDeletes.has(rowId)) throw new MaintenanceError("invalid", `Row ${rowId} was deleted earlier in this write.`)
        const added = this.newRows.get(rowId)
        if (added) this.newRows.set(rowId, { ...added, ...patch })
        else this.rowPatches.set(rowId, { ...(this.rowPatches.get(rowId) ?? {}), ...patch })
    }

    deleteRow(rowId: string): void {
        this.rowsAllowed()
        this.newRows.delete(rowId)
        this.rowPatches.delete(rowId)
        this.rowDeletes.add(rowId)
    }

    /** Patch the setlist doc itself. */
    updateSetlist(patch: Data): void {
        if (!this.bump) {
            const bad = Object.keys(patch).filter((k) => !NO_BUMP_FIELDS.has(k))
            if (bad.length > 0) throw new MaintenanceError("invalid", `A bump:false write may not set ${bad.join(", ")}.`)
        }
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

    get missing(): boolean {
        return this.setlistGone
    }

    /** @internal */
    flush(w: SetlistWriter, o: StampOptions, otherWrites: number): void {
        const writes = this.newRows.size + this.rowPatches.size + this.rowDeletes.size + 1 + otherWrites
        if (writes > MAX_TRANSACTION_WRITES) {
            throw new MaintenanceError("too-large", `${writes} writes are too many for one setlist transaction.`)
        }
        for (const [id, data] of this.newRows) w.createTrack(id, data)
        for (const [id, patch] of this.rowPatches) w.updateTrack(id, patch, o)
        for (const id of this.rowDeletes) w.deleteTrack(id)
        if (this.bump) {
            if (this.touched && !this.setlistGone) w.updateSetlist(this.setlistId, this.setlistPatch ?? {}, o)
        } else if (this.setlistPatch && !this.setlistGone) {
            writeSetlistUnstamped(w, this.setlistId, this.setlistPatch)
        }
    }
}

const WRITE_METHODS = new Set<PropertyKey>(["set", "update", "delete", "create"])

/**
 * One transaction on an existing setlist of tenant `org`. `fn` reads through
 * `tx` (and may write docs of other collections through it) and queues
 * setlist/row writes on `m`; they are written, stamped, when `fn` returns. A
 * callback that queues nothing writes nothing. The stored setlist must belong
 * to `org` (else `wrong-tenant`, nothing written); writing to a setlist that
 * does not exist is `not-found`.
 */
export function maintainSetlist<T>(
    db: DB,
    org: OrgId,
    setlistId: string,
    fn: (tx: FirebaseFirestore.Transaction, m: SetlistMaintenance) => Promise<T>,
    opts: MaintainOptions = {},
): Promise<T> {
    return runSetlistTransaction(
        db,
        async (tx, w) => {
            const sSnap = await tx.get(setlistRef(db, setlistId))
            let txWrites = 0
            const counted = new Proxy(tx, {
                get(target, key) {
                    const v = Reflect.get(target, key, target) as unknown
                    if (typeof v !== "function") return v
                    if (WRITE_METHODS.has(key)) {
                        return (...args: unknown[]) => {
                            txWrites++
                            return (v as (...a: unknown[]) => unknown).apply(target, args)
                        }
                    }
                    return (v as (...a: unknown[]) => unknown).bind(target)
                },
            })
            const m = new SetlistMaintenance(setlistId, opts.bump !== false)
            const out = await fn(counted, m)
            if (sSnap.exists) assertOrg(sSnap.data() as Data, org, `Setlist ${setlistId}`)
            else if (m.touched && !m.missing) throw new MaintenanceError("not-found", `Setlist ${setlistId} does not exist.`)
            m.flush(w, { touchUpdatedAt: opts.touchUpdatedAt }, txWrites)
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
 * Back-fill helper: patch many setlist docs of tenant `org`, one transaction
 * each. A setlist that no longer exists is skipped.
 */
export async function maintainSetlists(
    db: DB,
    org: OrgId,
    items: ReadonlyArray<{ setlistId: string; patch: Data }>,
    opts: MaintainOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
    const written: string[] = []
    const skipped: string[] = []
    await inGroups(items, async ({ setlistId, patch }) => {
        const ok = await maintainSetlist(
            db,
            org,
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
 * Back-fill helper: patch rows of tenant `org` across many setlists, one
 * transaction per setlist (a setlist with more rows than one transaction
 * holds is `too-large`, checked before anything is written). Rows that are
 * gone or now belong to another setlist are skipped. Rows whose setlist doc is
 * gone, and rows with `setlistId: null`, are still patched (stamped) with no
 * setlist to bump. A row or setlist of another tenant throws `wrong-tenant`.
 */
export async function maintainRows(
    db: DB,
    org: OrgId,
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
    for (const [setlistId, rows] of bySetlist) {
        if (rows.length + 1 > MAX_TRANSACTION_WRITES) {
            throw new MaintenanceError("too-large", `Setlist ${setlistId} has ${rows.length} rows to patch; one transaction holds ${MAX_TRANSACTION_WRITES - 1}.`)
        }
    }
    const written: string[] = []
    const skipped: string[] = []
    await inGroups([...bySetlist], async ([setlistId, rows]) => {
        const res = await maintainSetlist(
            db,
            org,
            setlistId,
            async (tx, m) => {
                const [sSnap, ...snaps] = await tx.getAll(setlistRef(db, setlistId), ...rows.map((r) => trackRef(db, r.rowId)))
                if (!sSnap.exists) m.setlistDocMissing()
                const w: string[] = []
                const s: string[] = []
                snaps.forEach((snap, i) => {
                    const data = snap.exists ? (snap.data() as Data) : null
                    if (!data || data.setlistId !== setlistId) {
                        s.push(rows[i].rowId)
                        return
                    }
                    assertOrg(data, org, `Row ${rows[i].rowId}`)
                    m.updateRow(rows[i].rowId, rows[i].patch)
                    w.push(rows[i].rowId)
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
                const datas = snaps.map((snap) => (snap.exists ? (snap.data() as Data) : null))
                datas.forEach((data, j) => {
                    if (data && typeof data.setlistId !== "string") assertOrg(data, org, `Row ${slice[j].rowId}`)
                })
                datas.forEach((data, j) => {
                    if (!data || typeof data.setlistId === "string") gone.push(slice[j].rowId)
                    else {
                        if (opts.bump === false) throw new MaintenanceError("invalid", "A bump:false write may not touch rows.")
                        w.updateTrack(slice[j].rowId, slice[j].patch, { touchUpdatedAt: opts.touchUpdatedAt })
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

/**
 * Delete every row of one setlist of tenant `org` (chunked batches). Every
 * row and the setlist (when it still exists) are checked before any delete.
 * Returns the count.
 */
export async function deleteSetlistRows(db: DB, org: OrgId, setlistId: string): Promise<number> {
    assertOrg((await setlistRef(db, setlistId).get()).data(), org, `Setlist ${setlistId}`)
    const snap = await db.collection(TRACKS).where("setlistId", "==", setlistId).get()
    for (const d of snap.docs) assertOrg(d.data(), org, `Row ${d.id}`)
    for (let i = 0; i < snap.docs.length; i += MAX_TRANSACTION_WRITES) {
        const batch = db.batch()
        for (const d of snap.docs.slice(i, i + MAX_TRANSACTION_WRITES)) batch.delete(d.ref)
        await batch.commit()
    }
    return snap.size
}

/**
 * Delete whole setlists of tenant `org`: their rows first, then the setlist
 * doc (not its subcollections; see `deleteSetlistTree` for that). Every
 * setlist is checked before anything is deleted.
 */
export async function deleteSetlistsWithRows(
    db: DB,
    org: OrgId,
    setlistIds: readonly string[],
): Promise<{ setlists: number; tracks: number }> {
    if (setlistIds.length === 0) return { setlists: 0, tracks: 0 }
    const snaps = await db.getAll(...setlistIds.map((id) => setlistRef(db, id)))
    snaps.forEach((s, i) => assertOrg(s.data(), org, `Setlist ${setlistIds[i]}`))
    let tracks = 0
    for (const id of setlistIds) tracks += await deleteSetlistRows(db, org, id)
    for (let i = 0; i < setlistIds.length; i += MAX_TRANSACTION_WRITES) {
        const batch = db.batch()
        for (const id of setlistIds.slice(i, i + MAX_TRANSACTION_WRITES)) batch.delete(setlistRef(db, id))
        await batch.commit()
    }
    return { setlists: setlistIds.length, tracks }
}

/** The setlist doc of tenant `org` and every subcollection under it. */
export async function deleteSetlistTree(db: DB, org: OrgId, setlistId: string): Promise<void> {
    const ref = setlistRef(db, setlistId)
    assertOrg((await ref.get()).data(), org, `Setlist ${setlistId}`)
    await db.recursiveDelete(ref)
}
