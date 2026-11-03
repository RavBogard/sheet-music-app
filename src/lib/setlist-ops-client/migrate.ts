/**
 * PR 3 migration: the old outbox's `tracks` and `setlists` rows become
 * intents, so nothing an author queued before this deploy is lost (Daniel had
 * unsaved rows in a live tab).
 *
 *   create (set)  → insert, with the row's id and its neighbours in the local
 *                   cache as anchors. Resolved against the server just before
 *                   it is sent (client.ts resolveMigrated): a row that exists
 *                   now becomes an edit of it with the base resolved, never
 *                   dropped; a row the old cache had seen on the server and
 *                   that is gone was removed since, and is refused
 *                   ("the row was removed"), never resurrected.
 *   update        → editRow / editSetlist. The old outbox kept only the
 *                   `updatedAt` it expected, so the base is resolved against
 *                   the server just before sending: unchanged since → the
 *                   server's values (applies); changed → no base (every field
 *                   the server holds a value for becomes a conflict to decide).
 *                   An `order` patch is a reorder: those become ONE batch of
 *                   moves per setlist, placed as the local cache had them.
 *   delete        → remove.
 * Pending AND failed rows convert. Whatever still conflicts lands in the
 * refused list (Try again / Discard). Then the converted outbox rows and every
 * tracks/setlists tombstone are deleted. The outbox keeps serving `songs`.
 *
 * Runs once per page load before the snapshot listener may prune the cache
 * (the listener awaits `whenMigrated()`), and is a no-op once the outbox has
 * no tracks/setlists rows.
 */
import type { LocalDb } from '@/lib/local/schema'
import type { LocalTrack, OutboxRow, SetlistIntent } from '@/lib/local/types'

import { rowEditSet, rowForInsert, setlistEditSet } from './fields'
import { anchorsAt, canonicalOrder } from './view'
import type { ServerReader } from './client'

const MIGRATED = new Set(['tracks', 'setlists'])

export interface MigrationReport {
    converted: number
    intents: number
    dropped: number
    /** Rows left in the outbox to retry next load (their setlist could not be found offline). */
    deferred: number
}

function key(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `m-${crypto.randomUUID()}`
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function migrateOutbox(db: LocalDb, reader: ServerReader): Promise<MigrationReport> {
    const all = (await db.outbox.toArray()).filter((r) => MIGRATED.has(r.collection))
    const report: MigrationReport = { converted: 0, intents: 0, dropped: 0, deferred: 0 }
    if (all.length === 0) {
        await clearTombstones(db)
        return report
    }

    // Phase 1 (may touch the network): the setlist of a track op whose local
    // row is gone (a delete removed it). Done before the transaction.
    const setlistOfTrack = new Map<string, string>()
    const deferred = new Set<number>()
    for (const r of all) {
        if (r.collection !== 'tracks') continue
        const fromPayload = typeof r.payload?.setlistId === 'string' ? (r.payload.setlistId as string) : undefined
        if (fromPayload) {
            setlistOfTrack.set(r.docId, fromPayload)
            continue
        }
        const local = await db.tracks.get(r.docId)
        if (local?.setlistId) {
            setlistOfTrack.set(r.docId, local.setlistId)
            continue
        }
        try {
            const server = await reader.readRow(r.docId)
            if (server && typeof server.setlistId === 'string') setlistOfTrack.set(r.docId, server.setlistId)
            // No server row and no local row: nothing left to act on.
        } catch {
            deferred.add(r.localId!)
        }
    }

    // Rows the old listener once delivered from the server (its edit log keeps
    // the doc id): a create of one of those that the server no longer has
    // was removed since, and must not come back.
    const seen = new Set<string>()
    try {
        for (const e of await db.edit_log.toArray()) {
            if (e.source === 'snapshot-listener' && e.collection === 'tracks' && typeof e.docId === 'string') seen.add(e.docId)
        }
    } catch {
        // No log: every missing create is treated as never saved.
    }

    // Phase 2: one transaction, so a reload can never see half of it.
    await db.transaction('rw', db.outbox, db.tracks, db.intents, db.tombstones, async () => {
        const rows = (await db.outbox.toArray())
            .filter((r) => MIGRATED.has(r.collection) && !deferred.has(r.localId!))
            .sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0))
        const now = Date.now()
        const intents: SetlistIntent[] = []
        const seqCache = new Map<string, LocalTrack[]>()
        const localSeq = async (setlistId: string) => {
            if (!seqCache.has(setlistId))
                seqCache.set(setlistId, canonicalOrder(await db.tracks.where('setlistId').equals(setlistId).toArray()))
            return seqCache.get(setlistId)!
        }
        const movesBySetlist = new Map<string, Set<string>>()

        for (const r of rows) {
            // A `set` carries the stamp its copy was taken at: if the row exists
            // now, the edit it becomes applies only over that same version.
            const expected =
                r.expectedUpdatedAt ?? (r.op === 'set' && typeof r.payload?.updatedAt === 'number' ? (r.payload.updatedAt as number) : undefined)
            const base = (setlistId: string, op: SetlistIntent['op'], label?: string): SetlistIntent => ({
                setlistId,
                batchKey: key(),
                attempt: 0,
                op,
                status: 'pending',
                createdAt: r.createdAt ?? now,
                ...(label ? { label } : {}),
                migrated: {
                    from: r.op,
                    ...(expected !== undefined ? { expectedUpdatedAt: expected } : {}),
                    ...(r.op === 'set' && seen.has(r.docId) ? { seenOnServer: true } : {}),
                },
            })
            if (r.collection === 'setlists') {
                if (r.op !== 'update') {
                    report.dropped++
                    continue
                }
                const set = setlistEditSet(r.payload ?? {})
                if (Object.keys(set).length === 0) {
                    report.dropped++
                    continue
                }
                intents.push(base(r.docId, { kind: 'editSetlist', set }))
                continue
            }
            const setlistId = setlistOfTrack.get(r.docId)
            if (!setlistId) {
                report.dropped++
                continue
            }
            const local = await db.tracks.get(r.docId)
            const label = typeof (r.payload?.title ?? local?.title) === 'string' ? String(r.payload?.title ?? local?.title) : undefined
            if (r.op === 'delete') {
                intents.push(base(setlistId, { kind: 'remove', rowId: r.docId }, label))
                continue
            }
            if (r.op === 'set') {
                const seq = (await localSeq(setlistId)).map((t) => t.id)
                const at = seq.indexOf(r.docId)
                const others = seq.filter((id) => id !== r.docId)
                const anchors = at >= 0 ? anchorsAt(others, at) : { afterRowId: r.docId, beforeRowId: null }
                intents.push(base(setlistId, { kind: 'insert', rowId: r.docId, ...anchors, row: rowForInsert(r.payload ?? {}) }, label))
                continue
            }
            // update
            const payload = { ...(r.payload ?? {}) }
            if ('order' in payload) {
                if (!movesBySetlist.has(setlistId)) movesBySetlist.set(setlistId, new Set())
                movesBySetlist.get(setlistId)!.add(r.docId)
                delete payload.order
            }
            const set = rowEditSet(payload)
            if (Object.keys(set).length > 0) intents.push(base(setlistId, { kind: 'editRow', rowId: r.docId, set }, label))
        }

        // One batch of moves per setlist, last, in the order the cache shows.
        for (const [setlistId, moved] of movesBySetlist) {
            const seq = (await localSeq(setlistId)).map((t) => t.id)
            const batchKey = key()
            seq.forEach((id, i) => {
                if (!moved.has(id)) return
                intents.push({
                    setlistId,
                    batchKey,
                    attempt: 0,
                    op: { kind: 'move', rowId: id, afterRowId: i > 0 ? seq[i - 1] : null, beforeRowId: i + 1 < seq.length ? seq[i + 1] : null },
                    status: 'pending',
                    createdAt: now,
                    migrated: { from: 'update' },
                })
            })
        }

        if (intents.length) await db.intents.bulkAdd(intents)
        await db.outbox.bulkDelete(rows.map((r) => r.localId!))
        report.converted = rows.length
        report.intents = intents.length
    })
    report.deferred = deferred.size
    await clearTombstones(db)
    return report
}

async function clearTombstones(db: LocalDb): Promise<void> {
    const stale = (await db.tombstones.toArray()).filter((t) => MIGRATED.has(t.collection))
    if (stale.length) await db.tombstones.bulkDelete(stale.map((t) => [t.collection, t.docId] as [string, string]))
}

/** For tests and diagnostics: the tracks/setlists rows still in the outbox. */
export async function legacyOutboxRows(db: LocalDb): Promise<OutboxRow[]> {
    return (await db.outbox.toArray()).filter((r) => MIGRATED.has(r.collection))
}
