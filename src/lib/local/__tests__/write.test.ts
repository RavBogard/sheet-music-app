import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '../schema'
import type { LocalTrack, OutboxRow } from '../types'
import { WriteAtomicityError } from '../types'
import { applyEdit } from '../write'

describe('applyEdit', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await resetDbForTests()
    })

    it("'set' lands the entity row and a matching outbox row", async () => {
        const db = getDb()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0, title: 'Adon Olam' },
        })

        const track = await db.tracks.get('t1')
        expect(track?.title).toBe('Adon Olam')

        const outbox = await db.outbox.toArray()
        expect(outbox).toHaveLength(1)
        expect(outbox[0]).toMatchObject({
            op: 'set',
            collection: 'tracks',
            docId: 't1',
            status: 'pending',
            attempts: 0,
        })
        expect(outbox[0].payload).toMatchObject({ id: 't1', title: 'Adon Olam' })
    })

    it("'update' merges the patch into the entity and enqueues the patch (not the merged doc)", async () => {
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0, key: 'C' },
        })
        await applyEdit({
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            patch: { key: 'G' },
            expectedUpdatedAt: 0,
        })

        const db = getDb()
        const track = (await db.tracks.get('t1')) as LocalTrack
        expect(track.key).toBe('G')
        expect(track.setlistId).toBe('s1') // preserved

        const outbox = await db.outbox.toArray()
        expect(outbox).toHaveLength(2)
        const updateRow = outbox[1] as OutboxRow
        expect(updateRow.op).toBe('update')
        expect(updateRow.payload).toEqual({ key: 'G' })
        expect(updateRow.expectedUpdatedAt).toBe(0)
        expect(Object.keys(updateRow.payload)).not.toContain('setlistId')
    })

    it("'delete' removes the entity and enqueues an empty-payload row", async () => {
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        await applyEdit({
            op: 'delete',
            collection: 'tracks',
            docId: 't1',
        })

        const db = getDb()
        expect(await db.tracks.get('t1')).toBeUndefined()

        const outbox = await db.outbox.toArray()
        expect(outbox).toHaveLength(2)
        expect(outbox[1]).toMatchObject({
            op: 'delete',
            collection: 'tracks',
            docId: 't1',
            payload: {},
        })
    })

    it("'update' on a missing target throws WriteAtomicityError and writes nothing", async () => {
        await expect(
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: 'nope',
                patch: { key: 'G' },
            }),
        ).rejects.toBeInstanceOf(WriteAtomicityError)

        const db = getDb()
        expect(await db.outbox.count()).toBe(0)
        expect(await db.tracks.count()).toBe(0)
    })

    // AC-1: atomicity — if the transaction throws after the entity write but
    // before the outbox insert, BOTH must roll back.
    it('AC-1: rollback when outbox insert fails leaves entity unchanged', async () => {
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0, key: 'C' },
        })

        const db = getDb()
        const addSpy = vi
            .spyOn(db.outbox, 'add')
            .mockImplementationOnce(() => {
                // Force the transaction to abort AFTER the entity put has happened
                // but BEFORE any outbox row lands. Dexie rolls the whole tx back.
                throw new Error('injected outbox failure')
            })

        await expect(
            applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: 't1',
                patch: { key: 'G' },
                expectedUpdatedAt: 0,
            }),
        ).rejects.toBeInstanceOf(WriteAtomicityError)

        // Entity reverts to pre-update value
        const track = (await db.tracks.get('t1')) as LocalTrack
        expect(track.key).toBe('C')

        // Outbox has only the original 'set' row from before injection — no
        // partial 'update' row left behind.
        const outbox = await db.outbox.toArray()
        expect(outbox).toHaveLength(1)
        expect(outbox[0].op).toBe('set')

        addSpy.mockRestore()
    })

    it('payload preserves Date instances via structured clone (no JSON roundtrip)', async () => {
        const when = new Date('2026-04-26T12:00:00Z')
        await applyEdit({
            op: 'set',
            collection: 'setlists',
            doc: {
                id: 's1',
                ownerId: 'u1',
                updatedAt: 0,
                eventDate: when.getTime(),
                rawDate: when,
            },
        })

        const db = getDb()
        const outbox = await db.outbox.toArray()
        const row = outbox[0] as OutboxRow
        expect(row.payload.rawDate).toBeInstanceOf(Date)
        expect((row.payload.rawDate as Date).getTime()).toBe(when.getTime())
    })
})
