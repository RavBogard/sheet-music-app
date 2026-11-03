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
 * replay. Nothing here takes a cross-tab lock.
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

export interface OpsClientDeps {
    /** The Dexie database, or a getter (the page's db can be reopened). */
    db: LocalDb | (() => LocalDb)
    transport: OpsTransport
    reader: ServerReader
    now?: () => number
    /** Test seam: schedule a retry. Defaults to setTimeout. */
    schedule?: (fn: () => void, ms: number) => unknown
}

export interface IntentInput {
    op: WireOp
    label?: string
}

const MAX_BACKOFF_MS = 30_000

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

export class SetlistOpsClient {
    private readonly dbSource: LocalDb | (() => LocalDb)
    private get db(): LocalDb {
        return typeof this.dbSource === 'function' ? this.dbSource() : this.dbSource
    }
    private readonly transport: OpsTransport
    private readonly reader: ServerReader
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

    /** "Try again" on a refused intent: re-send it over the server's current value. */
    async retry(localId: number): Promise<void> {
        const it = await this.db.intents.get(localId)
        if (!it || it.status !== 'refused') return
        const op = { ...it.op } as WireOp
        const r = it.refusal
        if (r?.reason === 'field' && r.field && (op.kind === 'editRow' || op.kind === 'editSetlist')) {
            op.base = { ...((op.base as Record<string, unknown>) ?? {}), [r.field]: r.server ?? null }
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
        const run = (async () => {
            try {
                do {
                    this.again.delete(setlistId)
                    while (await this.sendNext(setlistId)) {
                        /* next batch */
                    }
                } while (this.again.has(setlistId))
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

    private armRetry(): void {
        if (this.retryArmed) return
        this.retryArmed = true
        const ms = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.failures, 5))
        this.schedule(() => {
            this.retryArmed = false
            this.kick()
        }, ms)
    }

    /** Resolve the base of migrated edits against the server, just before sending. */
    private async resolveMigrated(group: SetlistIntent[]): Promise<void> {
        for (const it of group) {
            const m = it.migrated
            if (!m || it.op.kind === 'insert' || it.op.kind === 'remove' || it.op.kind === 'move') continue
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
            // A row someone else touched since this edit was queued: base {}
            // makes every field the server holds a value for a conflict the
            // author decides, instead of a silent overwrite.
            it.op = { ...it.op, base }
            await this.db.intents.update(it.localId!, { op: it.op })
        }
    }

    /** Send the oldest pending batch. True when there may be more to send. */
    private async sendNext(setlistId: string): Promise<boolean> {
        // Offline by the browser's word: the 'online' event kicks us. An
        // unreachable server is probed by the send itself, on backoff.
        if (!useConnectivity.getState().browserOnline) return false
        const queued = (await this.db.intents.where('setlistId').equals(setlistId).toArray())
            .filter((i) => i.status === 'pending' || i.status === 'sending')
            .sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0))
        if (queued.length === 0) return false
        const key = queued[0].batchKey
        const group = queued.filter((i) => i.batchKey === key)

        try {
            await this.resolveMigrated(group)
        } catch {
            this.failures++
            noteSendFailedOnNetwork(this.now())
            this.armRetry()
            return false
        }

        await this.db.intents.bulkUpdate(group.map((i) => ({ key: i.localId!, changes: { status: 'sending' as const } })))
        const cached = await this.db.setlists.get(setlistId)
        const baseVersion = typeof cached?.version === 'number' ? (cached.version as number) : 0
        const clientBatchId = group[0].attempt > 0 ? `${key}.r${group[0].attempt}` : key

        let res: TransportResponse
        try {
            res = await this.transport(setlistId, { clientBatchId, baseVersion, ops: group.map((i) => i.op as WireOp) })
        } catch {
            await this.backToPending(group)
            this.failures++
            noteSendFailedOnNetwork(this.now())
            this.armRetry()
            return false
        }
        noteSendReachedServer()

        const body = (res.json ?? {}) as Record<string, unknown>
        if (res.status >= 500 || res.status === 429 || res.status === 401) {
            // Not an answer about these ops: try again later, same batch id.
            await this.backToPending(group)
            this.failures++
            this.armRetry()
            return false
        }
        this.failures = 0

        if (body.ok !== true) {
            const refusal: SetlistIntentRefusal = {
                reason: typeof body.reason === 'string' ? body.reason : `http-${res.status}`,
                ...(typeof body.message === 'string' ? { message: body.message } : {}),
            }
            await this.db.intents.bulkUpdate(group.map((i) => ({ key: i.localId!, changes: { status: 'refused' as const, refusal } })))
            return true
        }

        await this.applyAnswer(setlistId, group, body)
        return true
    }

    private async backToPending(group: SetlistIntent[]): Promise<void> {
        await this.db.intents.bulkUpdate(group.map((i) => ({ key: i.localId!, changes: { status: 'pending' as const } })))
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

        // editSetlist: what applied is the op's set minus its conflicted fields.
        const setlistApplied: Record<string, unknown> = {}
        group.forEach((it, i) => {
            if (it.op.kind !== 'editSetlist') return
            const bad = new Set((byOp.get(i) ?? []).map((c) => c.field))
            for (const [k, v] of Object.entries((it.op.set ?? {}) as Record<string, unknown>)) if (!bad.has(k)) setlistApplied[k] = v
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
                // An old-outbox create the server already has: it landed after all.
                if (it.migrated && it.op.kind === 'insert' && mine.every((c) => c.reason === 'row-exists')) {
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
                            op: { ...it.op, set: { [f]: set[f] ?? null }, base: { [f]: base[f] ?? null } },
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
        const stuck = await this.db.intents.where('status').equals('sending').toArray()
        if (stuck.length) await this.backToPending(stuck)
    }
}
