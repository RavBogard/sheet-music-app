/**
 * The browser side of the setlist ops contract
 * (docs/planning/2026-11-03-setlist-sync-structural/OPS-CONTRACT.md).
 *
 * Every edit to a setlist or its rows becomes an INTENT in Dexie (`intents`),
 * queued per setlist. One user action is one batch (`batchKey`): a drag is
 * one move, a duplicate is one insert, a bulk delete is one batch of removes.
 * The sender posts each batch to /api/setlists/{id}/ops in queue order and
 * applies the answer:
 *   - `rows` / `removed` go into the server cache (server-cache.ts);
 *   - applied intents are deleted;
 *   - conflicts become REFUSED intents, which the editor lists with
 *     "Try again" (re-send over the server's value) and "Discard";
 *   - a refusal of the whole batch (forbidden, not-found, invalid) refuses
 *     each of its intents;
 *   - a network failure or a 5xx leaves the batch pending and retries with
 *     backoff (the same `clientBatchId`, so the server replays rather than
 *     applies twice).
 *
 * Two tabs may both send a batch: the server's receipt makes the second a
 * replay; a per-setlist lock (navigator.locks) keeps them from racing.
 */
import type { LocalDb } from '@/lib/local/schema'
import type { SetlistIntent, SetlistIntentRefusal } from '@/lib/local/types'

import { applyOpsRows, applySetlistEdit, noteSetlistVersion } from './server-cache'
import { baseOf, setlistBaseOf } from './fields'
import { noteSendFailedOnNetwork, noteSendReachedServer, useConnectivity } from './connectivity'

export type WireOp = Record<string, unknown> & { kind: 'insert' | 'remove' | 'move' | 'editRow' | 'editSetlist' }

export interface TransportResponse {
    status: number
    json: unknown
}

/** Posts one batch. Throws on a network failure (no response at all). */
export type OpsTransport = (setlistId: string, body: { clientBatchId: string; baseVersion: number; ops: WireOp[] }) => Promise<TransportResponse>


/** Reads one doc from the server (for the old-outbox migration's base values). */
export interface ServerReader {
    readRow(rowId: string): Promise<Record<string, unknown> | null>
    readSetlist(setlistId: string): Promise<Record<string, unknown> | null>
}

/**
 * Runs `fn` while this tab alone drains `setlistId`. Resolves false (without
 * running) when another tab holds it. Production: navigator.locks, else the
 * cross-tab lock (runtime.ts).
 */
export type SetlistLock = (setlistId: string, fn: () => Promise<void>) => Promise<boolean>

export interface OpsClientDeps {
    /** The Dexie database, or a getter (the page's db can be reopened). */
    db: LocalDb | (() => LocalDb)
    transport: OpsTransport
    reader: ServerReader
    /** One forced token refresh after a 401. */
    refreshAuth?: () => Promise<void>
    /** Default: no lock (one tab, or tests). */
    lock?: SetlistLock
    now?: () => number
    /** Test seam: schedule a retry. Defaults to setTimeout. */
    schedule?: (fn: () => void, ms: number) => unknown
}

export interface IntentInput {
    op: WireOp
    label?: string
}

/** How one user action ended (`settle`). */
export type BatchOutcome = { ok: true } | { ok: false; reason: string; field?: string }

const MAX_BACKOFF_MS = 30_000
/** A 'sending' intent with no answer after this long is sent again (same batch id). */
export const STALE_SENDING_MS = 30_000

function newKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `b-${crypto.randomUUID()}`
    return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function newRowId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    return `tr-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

function toMs(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
        const t = Date.parse(v)
        return Number.isNaN(t) ? undefined : t
    }
    const ts = v as { toMillis?: () => number } | null
    if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
    return undefined
}

function conflictRefusal(c: Record<string, unknown>): SetlistIntentRefusal {
    return {
        reason: String(c.reason ?? 'conflict'),
        ...(typeof c.field === 'string' ? { field: c.field } : {}),
        ...('server' in c ? { server: c.server } : {}),
        ...('mine' in c ? { mine: c.mine } : {}),
    }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** `field` may be a top-level name or `gig.<sub>`: the value at that path. */
function atPath(obj: Record<string, unknown>, field: string): unknown {
    const [head, sub] = field.split('.', 2)
    if (sub === undefined) return obj[head]
    const inner = obj[head]
    return isObj(inner) ? inner[sub] : undefined
}

/** A map holding only `field` (nested for `gig.<sub>`). */
function onlyPath(field: string, value: unknown): Record<string, unknown> {
    const [head, sub] = field.split('.', 2)
    return sub === undefined ? { [head]: value ?? null } : { [head]: { [sub]: value ?? null } }
}

/** `obj` with `field` set to `value` (nested for `gig.<sub>`). */
function withPath(obj: Record<string, unknown>, field: string, value: unknown): Record<string, unknown> {
    const [head, sub] = field.split('.', 2)
    if (sub === undefined) return { ...obj, [head]: value ?? null }
    return { ...obj, [head]: { ...(isObj(obj[head]) ? (obj[head] as Record<string, unknown>) : {}), [sub]: value ?? null } }
}

export class SetlistOpsClient {
    private readonly dbSource: LocalDb | (() => LocalDb)
    private get db(): LocalDb {
        return typeof this.dbSource === 'function' ? this.dbSource() : this.dbSource
    }
    private readonly transport: OpsTransport
    private readonly reader: ServerReader
    private readonly refreshAuth?: () => Promise<void>
    private readonly lock?: SetlistLock
    private readonly now: () => number
    private readonly schedule: (fn: () => void, ms: number) => unknown
    private readonly running = new Map<string, Promise<void>>()
    private readonly again = new Set<string>()
    private failures = 0
    private retryArmed = false

    constructor(deps: OpsClientDeps) {
        this.dbSource = deps.db
        this.transport = deps.transport
        this.reader = deps.reader
        this.refreshAuth = deps.refreshAuth
        this.lock = deps.lock
        this.now = deps.now ?? (() => Date.now())
        this.schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms))
    }

    // ── queue ─────────────────────────────────────────────────────────────

    /** Queue one user action (one batch). Returns its batch key. */
    async enqueue(setlistId: string, items: readonly IntentInput[]): Promise<string> {
        if (items.length === 0) return ''
        const batchKey = newKey()
        const now = this.now()
        await this.db.intents.bulkAdd(
            items.map((it) => ({
                setlistId,
                batchKey,
                attempt: 0,
                op: it.op,
                status: 'pending' as const,
                createdAt: now,
                ...(it.label ? { label: it.label } : {}),
            })),
        )
        this.kick(setlistId)
        return batchKey
    }

    /**
     * Wait for one user action's answer (Perform's live-director modal, the
     * "Added" / "Saved" toasts). `ok` once every intent of the batch is
     * applied; the refusal when one was refused; `offline` when the device
     * cannot reach the server now (the batch stays queued).
     */
    async settle(setlistId: string, batchKey: string): Promise<BatchOutcome> {
        if (!batchKey) return { ok: true }
        await this.drain(setlistId)
        const mine = (await this.db.intents.where('batchKey').equals(batchKey).toArray()) as SetlistIntent[]
        if (mine.length === 0) return { ok: true }
        const refused = mine.find((i) => i.status === 'refused')
        if (refused) {
            return { ok: false, reason: refused.refusal?.reason ?? 'conflict', ...(refused.refusal?.field ? { field: refused.refusal.field } : {}) }
        }
        return { ok: false, reason: 'offline' }
    }

    /** "Try again" on a refused intent: re-send it over the server's current value. */
    async retry(localId: number): Promise<void> {
        const it = await this.db.intents.get(localId)
        if (!it || it.status !== 'refused') return
        let op = { ...it.op } as WireOp
        const r = it.refusal
        if (r?.reason === 'field' && r.field && (op.kind === 'editRow' || op.kind === 'editSetlist')) {
            op = { ...op, base: withPath((op.base as Record<string, unknown>) ?? {}, r.field, r.server) }
        } else if (r?.reason === 'row-exists' && op.kind === 'insert') {
            op.rowId = newRowId()
        }
        await this.db.intents.update(localId, {
            op,
            status: 'pending',
            attempt: it.attempt + 1,
            batchKey: newKey(),
            refusal: undefined,
            migrated: undefined,
            sentAt: undefined,
        })
        this.kick(it.setlistId)
    }

    /** "Discard" a refused intent: the server's row shows again. */
    async discard(localId: number): Promise<void> {
        await this.db.intents.delete(localId)
    }

    // ── sending ───────────────────────────────────────────────────────────

    /** Drain this setlist (or every setlist with pending intents). */
    kick(setlistId?: string): void {
        if (setlistId) {
            void this.drain(setlistId)
            return
        }
        void this.db.intents
            .where('status')
            .anyOf('pending', 'sending')
            .toArray()
            .then((rows) => {
                for (const id of new Set(rows.map((r) => r.setlistId))) void this.drain(id)
            })
            .catch(() => {})
    }

    /** Send every pending batch of one setlist, in order. Resolves when idle. */
    drain(setlistId: string): Promise<void> {
        const cur = this.running.get(setlistId)
        if (cur) {
            this.again.add(setlistId)
            return cur
        }
        const loop = async () => {
            do {
                this.again.delete(setlistId)
                while (await this.sendNext(setlistId)) {
                    /* next batch */
                }
            } while (this.again.has(setlistId))
        }
        const run = (async () => {
            try {
                if (this.lock) {
                    // Another tab holds this setlist: it sends; we look again later.
                    const ran = await this.lock(setlistId, loop)
                    if (!ran) this.armRetry(STALE_SENDING_MS)
                } else {
                    await loop()
                }
            } catch {
                // A local failure (the database closed under us, a reload):
                // the intents stay in Dexie and the next kick sends them.
                this.failures++
                this.armRetry()
            } finally {
                this.running.delete(setlistId)
            }
        })()
        this.running.set(setlistId, run)
        return run
    }

    /** Resolves when no drain is running (tests). */
    async idle(): Promise<void> {
        while (this.running.size > 0) await Promise.all([...this.running.values()])
    }

    private armRetry(atMs?: number): void {
        if (this.retryArmed) return
        this.retryArmed = true
        const ms = atMs ?? Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.failures, 5))
        this.schedule(() => {
            this.retryArmed = false
            this.kick()
        }, ms)
    }

    /**
     * Migrated intents are resolved against the server just before they go:
     *  - an edit's base (the old outbox kept only an `updatedAt`): unchanged
     *    since → the server's values; changed → no base (each field the server
     *    holds a value for becomes a conflict the author decides);
     *  - a create: if the row now exists it becomes an edit of that row with
     *    the base resolved the same way (never dropped); if the old cache had
     *    seen it on the server and it is gone, it was removed since and is
     *    refused as `row-gone` (never resurrected); otherwise it is inserted.
     * Returns intents refused here (they are not sent).
     */
    private async resolveMigrated(group: SetlistIntent[]): Promise<Set<number>> {
        const refusedHere = new Set<number>()
        for (const it of group) {
            const m = it.migrated
            if (!m || it.op.kind === 'remove' || it.op.kind === 'move') continue
            if (it.op.kind === 'insert') {
                const rowId = String(it.op.rowId)
                const server = await this.reader.readRow(rowId)
                if (server) {
                    const set = (it.op.row ?? {}) as Record<string, unknown>
                    const fresh = m.expectedUpdatedAt === undefined || toMs(server.updatedAt) === m.expectedUpdatedAt
                    it.op = { kind: 'editRow', rowId, set, base: fresh ? baseOf(server, Object.keys(set)) : {} }
                    it.migrated = { ...m, from: 'update' }
                    await this.db.intents.update(it.localId!, { op: it.op, migrated: it.migrated })
                } else if (m.seenOnServer) {
                    await this.db.intents.update(it.localId!, { status: 'refused', refusal: { reason: 'row-gone' } })
                    refusedHere.add(it.localId!)
                }
                continue
            }
            if ((it.op as { base?: unknown }).base !== undefined) continue
            const set = (it.op.set ?? {}) as Record<string, unknown>
            let base: Record<string, unknown> = {}
            if (it.op.kind === 'editRow') {
                const server = await this.reader.readRow(String(it.op.rowId))
                if (server && (m.expectedUpdatedAt === undefined || toMs(server.updatedAt) === m.expectedUpdatedAt)) {
                    base = baseOf(server, Object.keys(set))
                }
            } else {
                const server = await this.reader.readSetlist(it.setlistId)
                if (server && (m.expectedUpdatedAt === undefined || toMs(server.updatedAt) === m.expectedUpdatedAt)) {
                    base = setlistBaseOf(server, Object.keys(set))
                }
            }
            it.op = { ...it.op, base }
            await this.db.intents.update(it.localId!, { op: it.op })
        }
        return refusedHere
    }

    /** Send the oldest pending batch. True when there may be more to send. */
    private async sendNext(setlistId: string): Promise<boolean> {
        // Offline by the browser's word: the 'online' event kicks us. An
        // unreachable server is probed by the send itself, on backoff.
        if (!useConnectivity.getState().browserOnline) return false
        const now = this.now()
        const queued = (await this.db.intents.where('setlistId').equals(setlistId).toArray())
            .filter((i) => i.status === 'pending' || i.status === 'sending')
            .sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0))
        if (queued.length === 0) return false
        const key = queued[0].batchKey
        let group = queued.filter((i) => i.batchKey === key)
        // In flight elsewhere (another tab without a shared lock) and not yet
        // stale: wait for its answer, look again later.
        const inFlight = group.some((i) => i.status === 'sending' && i.sentAt !== undefined && now - i.sentAt < STALE_SENDING_MS)
        if (inFlight) {
            this.armRetry(STALE_SENDING_MS)
            return false
        }

        try {
            const refusedHere = await this.resolveMigrated(group)
            if (refusedHere.size) group = group.filter((i) => !refusedHere.has(i.localId!))
        } catch {
            this.failures++
            noteSendFailedOnNetwork(this.now())
            this.armRetry()
            return false
        }
        if (group.length === 0) return true

        await this.db.intents.bulkUpdate(
            group.map((i) => ({ key: i.localId!, changes: { status: 'sending' as const, sentAt: this.now() } })),
        )
        const cached = await this.db.setlists.get(setlistId)
        const baseVersion = typeof cached?.version === 'number' ? (cached.version as number) : 0
        const clientBatchId = group[0].attempt > 0 ? `${key}.r${group[0].attempt}` : key
        const body = { clientBatchId, baseVersion, ops: group.map((i) => i.op as WireOp) }

        let res: TransportResponse
        try {
            res = await this.transport(setlistId, body)
            if (res.status === 401 && this.refreshAuth) {
                // One forced token refresh, then the same batch once more.
                await this.refreshAuth()
                res = await this.transport(setlistId, body)
            }
        } catch {
            await this.backToPending(group)
            this.failures++
            noteSendFailedOnNetwork(this.now())
            this.armRetry()
            return false
        }
        noteSendReachedServer()

        const json = (res.json ?? {}) as Record<string, unknown>
        if (res.status === 401) {
            // Still signed out after a refresh: keep the edits, ask the author
            // to sign in, never retry on our own.
            await this.refuse(group, { reason: 'unauthenticated' })
            return true
        }
        if (res.status >= 500 || res.status === 429) {
            // Not an answer about these ops: try again later, same batch id.
            await this.backToPending(group)
            this.failures++
            this.armRetry()
            return false
        }
        this.failures = 0

        if (json.ok !== true) {
            await this.refuse(group, {
                reason: typeof json.reason === 'string' ? json.reason : `http-${res.status}`,
                ...(typeof json.message === 'string' ? { message: json.message } : {}),
            })
            return true
        }

        await this.applyAnswer(setlistId, group, json)
        return true
    }

    private async refuse(group: SetlistIntent[], refusal: SetlistIntentRefusal): Promise<void> {
        await this.db.intents.bulkUpdate(group.map((i) => ({ key: i.localId!, changes: { status: 'refused' as const, refusal } })))
    }

    private async backToPending(group: SetlistIntent[]): Promise<void> {
        await this.db.intents.bulkUpdate(
            group.map((i) => ({ key: i.localId!, changes: { status: 'pending' as const, sentAt: undefined } })),
        )
    }

    private async applyAnswer(setlistId: string, group: SetlistIntent[], body: Record<string, unknown>): Promise<void> {
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown> & { id: string }>) : []
        const removed = Array.isArray(body.removed) ? (body.removed as string[]) : []
        const version = typeof body.version === 'number' ? body.version : 0
        const conflicts = Array.isArray(body.conflicts) ? (body.conflicts as Array<Record<string, unknown>>) : []
        const byOp = new Map<number, Array<Record<string, unknown>>>()
        for (const c of conflicts) {
            const i = typeof c.opIndex === 'number' ? c.opIndex : -1
            byOp.set(i, [...(byOp.get(i) ?? []), c])
        }

        await applyOpsRows(this.db, setlistId, rows, removed, this.now())
        if (version > 0) await noteSetlistVersion(this.db, setlistId, version)

        // editSetlist: what applied is the op's set minus its conflicted fields
        // (a `gig.<sub>` conflict removes just that sub-field).
        const setlistApplied: Record<string, unknown> = {}
        group.forEach((it, i) => {
            if (it.op.kind !== 'editSetlist') return
            const bad = new Set((byOp.get(i) ?? []).map((c) => String(c.field)))
            for (const [k, v] of Object.entries((it.op.set ?? {}) as Record<string, unknown>)) {
                if (bad.has(k)) continue
                if (k === 'gig' && isObj(v)) {
                    const sub = Object.fromEntries(Object.entries(v).filter(([s]) => !bad.has(`gig.${s}`)))
                    if (Object.keys(sub).length) setlistApplied.gig = { ...(isObj(setlistApplied.gig) ? setlistApplied.gig : {}), ...sub }
                    continue
                }
                setlistApplied[k] = v
            }
        })
        if (Object.keys(setlistApplied).length > 0) await applySetlistEdit(this.db, setlistId, setlistApplied, version)

        await this.db.transaction('rw', this.db.intents, async () => {
            for (let i = 0; i < group.length; i++) {
                const it = group[i]
                const mine = byOp.get(i) ?? []
                if (mine.length === 0) {
                    await this.db.intents.delete(it.localId!)
                    continue
                }
                const fieldConflicts = mine.filter((c) => c.reason === 'field' && typeof c.field === 'string')
                if (fieldConflicts.length > 0 && (it.op.kind === 'editRow' || it.op.kind === 'editSetlist')) {
                    // One refused intent per field, each holding only that field.
                    await this.db.intents.delete(it.localId!)
                    const set = (it.op.set ?? {}) as Record<string, unknown>
                    const base = (it.op.base ?? {}) as Record<string, unknown>
                    for (const c of fieldConflicts) {
                        const f = c.field as string
                        await this.db.intents.add({
                            setlistId: it.setlistId,
                            batchKey: it.batchKey,
                            attempt: it.attempt,
                            op: { ...it.op, set: onlyPath(f, atPath(set, f)), base: onlyPath(f, atPath(base, f)) },
                            status: 'refused',
                            createdAt: it.createdAt,
                            ...(it.label ? { label: it.label } : {}),
                            refusal: conflictRefusal(c),
                        })
                    }
                    continue
                }
                await this.db.intents.update(it.localId!, { status: 'refused', refusal: conflictRefusal(mine[0]) })
            }
        })
    }

    /** After a reload: an intent left 'sending' never got its answer; send it again (the server replays). */
    async recoverInFlight(): Promise<void> {
        // Only stale ones: a fresh 'sending' may be another open tab's request.
        const now = this.now()
        const stuck = (await this.db.intents.where('status').equals('sending').toArray()).filter(
            (i) => i.sentAt === undefined || now - i.sentAt >= STALE_SENDING_MS,
        )
        if (stuck.length) await this.backToPending(stuck)
    }
}
