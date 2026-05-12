import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import type { OutboxOp, OutboxRow, OutboxStatus } from '../../local/types'
import { discardFailedOutboxRows } from '../cleanup'

function makeRow(
    status: OutboxStatus,
    overrides: Partial<OutboxRow> = {},
): Omit<OutboxRow, 'localId'> {
    const now = Date.now()
    return {
        status,
        scheduledFor: now,
        op: ('update' as OutboxOp),
        collection: 'tracks',
        docId: 'track-' + Math.random().toString(36).slice(2, 8),
        payload: { foo: 'bar' },
        attempts: 0,
        createdAt: now,
        ...overrides,
    }
}

describe('discardFailedOutboxRows', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it("deletes only rows where status === 'failed'", async () => {
        const db = getDb()
        await db.outbox.add(makeRow('pending') as OutboxRow)
        await db.outbox.add(makeRow('sending') as OutboxRow)
        await db.outbox.add(makeRow('failed') as OutboxRow)

        const result = await discardFailedOutboxRows({ db })

        expect(result.removed).toBe(1)
        const remaining = await db.outbox.toArray()
        expect(remaining).toHaveLength(2)
        const statuses = remaining.map((r) => r.status).sort()
        expect(statuses).toEqual(['pending', 'sending'])
    })

    it('preserves pending and sending rows when no failed rows exist', async () => {
        const db = getDb()
        await db.outbox.add(makeRow('pending') as OutboxRow)
        await db.outbox.add(makeRow('pending') as OutboxRow)
        await db.outbox.add(makeRow('sending') as OutboxRow)

        const result = await discardFailedOutboxRows({ db })

        expect(result.removed).toBe(0)
        const remaining = await db.outbox.toArray()
        expect(remaining).toHaveLength(3)
    })

    it('is idempotent on an empty outbox', async () => {
        const db = getDb()
        const first = await discardFailedOutboxRows({ db })
        const second = await discardFailedOutboxRows({ db })

        expect(first.removed).toBe(0)
        expect(second.removed).toBe(0)
        expect(await db.outbox.count()).toBe(0)
    })

    it('a pending row inserted during cleanup is preserved', async () => {
        const db = getDb()
        await db.outbox.add(makeRow('failed') as OutboxRow)
        await db.outbox.add(makeRow('failed') as OutboxRow)

        // Race a pending insert against the cleanup. The cleanup snapshots the
        // failed-row set on entry; any rows added afterward (regardless of
        // status) survive — engine's pending work is never lost.
        const cleanup = discardFailedOutboxRows({ db })
        await db.outbox.add(makeRow('pending') as OutboxRow)
        const result = await cleanup

        expect(result.removed).toBe(2)
        const remaining = await db.outbox.toArray()
        expect(remaining).toHaveLength(1)
        expect(remaining[0]!.status).toBe('pending')
    })
})
