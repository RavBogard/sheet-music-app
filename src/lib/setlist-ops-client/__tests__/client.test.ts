import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'

import { LocalDb } from '@/lib/local/schema'
import type { LocalTrack, SetlistIntent } from '@/lib/local/types'
import { checkSetlistFields, ROW_FIELD_NAMES, SETLIST_FIELD_NAMES } from '@/lib/setlist-ops/fields'

import { useUndoStore } from '@/lib/local/undo-store'

import { editRow, insertRows, moveRow, removeRows } from '../actions'
import { SetlistOpsClient, type OpsTransport } from '../client'
import { configureOpsClient } from '../runtime'
import { _setConnectivityForTests, useConnectivity } from '../connectivity'
import { ROW_FIELDS, SETLIST_FIELDS, rowEditSet, rowForInsert } from '../fields'
import { computeFreshness } from '../freshness'
import { _resetServerCacheMemory } from '../server-cache'
import { computeView } from '../view'

/**
 * The browser ops client (setlist sync PR 3): queue, sender, answer handling,
 * and the view. The server engine itself is tested against the emulator
 * (src/lib/setlist-ops/__tests__/engine.emulator.test.ts) and end to end in
 * two-author-repro.emulator.test.ts.
 */

const row = (id: string, order: number, extra: Record<string, unknown> = {}): LocalTrack =>
    ({ id, setlistId: 's1', order, title: `T ${id}`, version: 1, ...extra }) as LocalTrack

describe('fields mirror the server table', () => {
    it('row and setlist field lists equal the server engine\'s', () => {
        expect([...ROW_FIELDS].sort()).toEqual([...ROW_FIELD_NAMES].sort())
        expect([...SETLIST_FIELDS].sort()).toEqual([...SETLIST_FIELD_NAMES].sort())
    })

    it('a copied row becomes an explicit field list: no stamps, no undefined, no unknown fields', () => {
        const out = rowForInsert({ id: 'x', title: 'A', bpm: undefined, version: 7, updatedAt: 5, orgId: 'crc', order: 3, junk: 1 })
        expect(out).toEqual({ title: 'A', type: 'song' })
    })

    it('the server takes a whole gig as one field (the meta sheet), refuses nulls inside it, and clears it with null', () => {
        expect(checkSetlistFields({ gig: { venue: 'The Hall', start: '20:00' } }, 'set').ok).toBe(true)
        expect(checkSetlistFields({ gig: { venue: null } }, 'set').ok).toBe(false)
        expect(checkSetlistFields({ gig: null }, 'set')).toEqual({ ok: true, value: { gig: null } })
    })

    it("a cleared cell's `undefined` goes out as null; a cleared title as ''", () => {
        expect(rowEditSet({ bpm: undefined, title: undefined, key: 'G', version: 2 })).toEqual({ bpm: null, title: '', key: 'G' })
    })
})

describe('computeView', () => {
    const it0 = (localId: number, op: Record<string, unknown>, status: SetlistIntent['status'] = 'pending'): SetlistIntent =>
        ({ localId, setlistId: 's1', batchKey: `b${localId}`, attempt: 0, op, status, createdAt: 1 }) as SetlistIntent

    it('draws pending inserts, moves, removes and edits over the server rows, flagged', () => {
        const v = computeView(
            [row('a', 0), row('b', 1), row('c', 2)],
            undefined,
            [
                it0(1, { kind: 'insert', rowId: 'n', afterRowId: 'a', beforeRowId: 'b', row: { title: 'New' } }),
                it0(2, { kind: 'move', rowId: 'c', afterRowId: null, beforeRowId: 'a' }),
                it0(3, { kind: 'remove', rowId: 'b' }),
                it0(4, { kind: 'editRow', rowId: 'a', set: { key: 'G' }, base: { key: null } }),
            ],
        )
        expect(v.rows.map((r) => r.id)).toEqual(['c', 'a', 'n'])
        expect(v.rows.map((r) => r.order)).toEqual([0, 1, 2])
        expect(v.rows[1].key).toBe('G')
        expect(v.pending).toEqual({ n: { row: true, fields: [] }, c: { row: true, fields: [] }, a: { row: false, fields: ['key'] } })
    })

    it('a refused intent is not drawn: the server row shows again', () => {
        const v = computeView([row('a', 0, { key: 'F' })], undefined, [
            it0(1, { kind: 'editRow', rowId: 'a', set: { key: 'G' }, base: { key: 'E' } }, 'refused'),
        ])
        expect(v.rows[0].key).toBe('F')
        expect(v.pending).toEqual({})
    })
})

describe('editor actions: one batch each, and an explicit undo', () => {
    const NAME = 'crc-ops-actions-test'
    let db: LocalDb
    const view = [row('a', 0, { key: 'F', bpm: 90 }), row('b', 1), row('c', 2)]

    beforeEach(async () => {
        _setConnectivityForTests(true)
        useUndoStore.getState().clear()
        db = new LocalDb(NAME)
        await db.open()
        configureOpsClient({ db, transport: vi.fn(() => new Promise(() => {})) as unknown as OpsTransport })
    })
    afterEach(async () => {
        db.close()
        await Dexie.delete(NAME)
    })

    const lastUndo = () => useUndoStore.getState().undoStack.at(-1) as { kind: string; undo: unknown[]; redo: unknown[] }

    it('a field edit: base = what the author saw; undo sets it back with the edit as its base', async () => {
        await editRow('s1', view[0], { key: 'G', bpm: undefined })
        const [it0] = await db.intents.toArray()
        expect(it0.op).toEqual({ kind: 'editRow', rowId: 'a', set: { key: 'G', bpm: null }, base: { key: 'F', bpm: 90 } })
        expect(lastUndo().undo).toEqual([{ kind: 'editRow', rowId: 'a', set: { key: 'F', bpm: 90 }, base: { key: 'G', bpm: null } }])
    })

    it('a drag is ONE move on its new neighbours; undo moves it back between its old ones', async () => {
        await moveRow('s1', view, 'c', 'a')
        const ops = (await db.intents.toArray()).map((i) => i.op)
        expect(ops).toEqual([{ kind: 'move', rowId: 'c', afterRowId: null, beforeRowId: 'a' }])
        expect(lastUndo().undo).toEqual([{ kind: 'move', rowId: 'c', afterRowId: 'b', beforeRowId: null }])
    })

    it('a delete: undo re-inserts each row between its old neighbours with an explicit field list', async () => {
        await removeRows('s1', view, ['b'])
        expect(lastUndo().undo).toEqual([
            { kind: 'insert', rowId: 'b', afterRowId: 'a', beforeRowId: 'c', row: { title: 'T b', type: 'song' } },
        ])
    })

    it('offline: add, move and remove queue nothing; a field edit still queues', async () => {
        _setConnectivityForTests(false)
        expect(await moveRow('s1', view, 'c', 'a')).toBe(false)
        expect(await removeRows('s1', view, ['a'])).toBe(false)
        expect(await insertRows('s1', view, 3, [{ title: 'X' }])).toBeNull()
        expect(await db.intents.count()).toBe(0)
        await editRow('s1', view[1], { notes: 'later' })
        expect(await db.intents.count()).toBe(1)
    })
})

describe('SetlistOpsClient', () => {
    const NAME = 'crc-ops-client-test'
    let db: LocalDb
    let transport: ReturnType<typeof vi.fn>
    let client: SetlistOpsClient
    const reader = { readRow: vi.fn(async () => null), readSetlist: vi.fn(async () => null) }

    beforeEach(async () => {
        _resetServerCacheMemory()
        _setConnectivityForTests(true)
        db = new LocalDb(NAME)
        await db.open()
        await db.setlists.put({ id: 's1', ownerId: 'u', updatedAt: 1, version: 4 })
        await db.tracks.bulkPut([row('a', 0), row('b', 1)])
        transport = vi.fn()
        client = new SetlistOpsClient({ db, transport: transport as unknown as OpsTransport, reader, schedule: () => 0 })
    })

    afterEach(async () => {
        db.close()
        await Dexie.delete(NAME)
    })

    const ok = (body: Record<string, unknown>) => ({ status: 200, json: { ok: true, version: 5, applied: [0], conflicts: [], rows: [], removed: [], ...body } })

    it('one action = one batch, with its clientBatchId and the cached version; the answer feeds the cache', async () => {
        transport.mockResolvedValue(ok({ rows: [{ ...row('n', 1), id: 'n', version: 1 }, { ...row('b', 2), id: 'b', version: 2 }] }))
        await client.enqueue('s1', [{ op: { kind: 'insert', rowId: 'n', afterRowId: 'a', beforeRowId: 'b', row: { title: 'N' } } }])
        await client.idle()

        expect(transport).toHaveBeenCalledTimes(1)
        const [setlistId, body] = transport.mock.calls[0]
        expect(setlistId).toBe('s1')
        expect(body.baseVersion).toBe(4)
        expect(body.clientBatchId).toMatch(/^b-/)
        expect(body.ops).toHaveLength(1)
        expect(await db.intents.count()).toBe(0)
        expect((await db.tracks.get('b'))?.order).toBe(2)
        expect(await db.tracks.get('n')).toBeDefined()
        expect((await db.setlists.get('s1'))?.version).toBe(5)
    })

    it('a field conflict becomes a refused intent; Try again sends it over the server value with a NEW batch id', async () => {
        transport.mockResolvedValueOnce(
            ok({ applied: [], conflicts: [{ opIndex: 0, reason: 'field', field: 'key', server: 'A', mine: 'G' }] }),
        )
        await client.enqueue('s1', [{ op: { kind: 'editRow', rowId: 'a', set: { key: 'G' }, base: { key: 'F' } }, label: 'Lecha Dodi' }])
        await client.idle()
        const [refused] = await db.intents.toArray()
        expect(refused.status).toBe('refused')
        expect(refused.refusal).toMatchObject({ reason: 'field', field: 'key' })
        const f = computeFreshness(await db.intents.toArray(), { online: true, offlineSince: null })
        expect(f.state).toBe('refused')
        expect(f.saving).toBe(0)

        transport.mockResolvedValueOnce(ok({}))
        await client.retry(refused.localId!)
        await client.idle()
        const second = transport.mock.calls[1][1]
        expect(second.ops[0].base).toEqual({ key: 'A' })
        expect(second.clientBatchId).not.toBe(transport.mock.calls[0][1].clientBatchId)
        expect(await db.intents.count()).toBe(0)
    })

    it('a network failure leaves the batch pending and the SAME batch id is re-sent (the server replays)', async () => {
        transport.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await client.enqueue('s1', [{ op: { kind: 'remove', rowId: 'b' } }])
        await client.idle()
        expect((await db.intents.toArray())[0].status).toBe('pending')
        expect(useConnectivity.getState().unreachableSince).not.toBeNull()

        transport.mockResolvedValueOnce(ok({ removed: ['b'] }))
        client.kick('s1')
        await client.idle()
        expect(transport.mock.calls[1][1].clientBatchId).toBe(transport.mock.calls[0][1].clientBatchId)
        expect(await db.tracks.get('b')).toBeUndefined()
        expect(useConnectivity.getState().unreachableSince).toBeNull()
    })

    it('a whole-batch refusal refuses each of its intents', async () => {
        transport.mockResolvedValue({ status: 403, json: { ok: false, reason: 'forbidden' } })
        await client.enqueue('s1', [{ op: { kind: 'remove', rowId: 'a' } }, { op: { kind: 'remove', rowId: 'b' } }])
        await client.idle()
        const all = await db.intents.toArray()
        expect(all.map((i) => [i.status, i.refusal?.reason])).toEqual([
            ['refused', 'forbidden'],
            ['refused', 'forbidden'],
        ])
    })

    it('offline: nothing is sent until the browser is back online', async () => {
        _setConnectivityForTests(false)
        await client.enqueue('s1', [{ op: { kind: 'editRow', rowId: 'a', set: { key: 'G' }, base: { key: null } } }])
        await client.idle()
        expect(transport).not.toHaveBeenCalled()
        _setConnectivityForTests(true)
        transport.mockResolvedValue(ok({}))
        client.kick()
        await new Promise((r) => setTimeout(r, 20))
        await client.idle()
        expect(transport).toHaveBeenCalledTimes(1)
    })
})
