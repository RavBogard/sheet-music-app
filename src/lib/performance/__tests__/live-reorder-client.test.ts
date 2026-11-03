import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalDb } from '@/lib/local/schema'
import { _setConnectivityForTests } from '@/lib/setlist-ops-client/connectivity'
import type { OpsTransport } from '@/lib/setlist-ops-client/client'
import { configureOpsClient } from '@/lib/setlist-ops-client/runtime'
import { _resetServerCacheMemory, isOwnRow } from '@/lib/setlist-ops-client/server-cache'

import { commitLiveReorder, moveOps } from '../live-reorder-client'

const NAME = 'crc-live-reorder-test'

describe('moveOps', () => {
    it('is ONE anchored move for the dragged row, on its new neighbours', () => {
        expect(moveOps(['b', 'a', 'c'], ['a'])).toEqual([{ kind: 'move', rowId: 'a', afterRowId: 'b', beforeRowId: 'c' }])
        expect(moveOps(['c', 'a', 'b'], ['c'])).toEqual([{ kind: 'move', rowId: 'c', afterRowId: null, beforeRowId: 'a' }])
    })
    it('one move per dragged row when several drags coalesced, never n-1 moves', () => {
        expect(moveOps(['b', 'a', 'd', 'c'], ['a', 'c', 'a'])).toHaveLength(2)
    })
})

describe('commitLiveReorder', () => {
    let db: LocalDb
    const transport = vi.fn()
    beforeEach(async () => {
        _resetServerCacheMemory()
        _setConnectivityForTests(true)
        transport.mockReset()
        db = new LocalDb(NAME)
        await db.open()
        await db.setlists.put({ id: 's1', ownerId: 'u', updatedAt: 1, version: 4 })
        configureOpsClient({ db, transport: transport as unknown as OpsTransport, schedule: () => 0 })
    })
    afterEach(async () => {
        db.close()
        await Dexie.delete(NAME)
    })

    it('an unreachable server rolls back AND removes the batch, so the move can never land later', async () => {
        transport.mockRejectedValue(new Error('network down'))
        const res = await commitLiveReorder('s1', ['b', 'a', 'c'], ['a'])
        expect(res.ok).toBe(false)
        expect(await db.intents.count()).toBe(0)
    })

    it('a refused move is dropped from the queue', async () => {
        transport.mockResolvedValue({
            status: 200,
            json: { ok: true, version: 5, applied: [], conflicts: [{ opIndex: 0, reason: 'row-gone' }], rows: [], removed: [] },
        })
        const res = await commitLiveReorder('s1', ['b', 'a', 'c'], ['a'])
        expect(res).toMatchObject({ ok: false, reason: 'rejected' })
        expect(await db.intents.count()).toBe(0)
    })

    it('an applied move succeeds and marks the row as this device\'s own at enqueue time', async () => {
        transport.mockResolvedValue({
            status: 200,
            json: { ok: true, version: 5, applied: [0], conflicts: [], rows: [], removed: [] },
        })
        const res = await commitLiveReorder('s1', ['b', 'a', 'c'], ['a'])
        expect(res).toEqual({ ok: true })
        expect(isOwnRow('a')).toBe(true)
        expect(transport.mock.calls[0][1].ops).toHaveLength(1)
    })
})
