import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import type { OutboxOp, OutboxRow, OutboxStatus } from '../../local/types'
import { discardFailedOutboxRows, retryFailedOutboxRows } from '../cleanup'

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

    it('discardFailedOutboxRows does NOT set forceLwwOnConflict (explicit give-up path)', async () => {
        const db = getDb()
        // Seed a failed row WITHOUT the flag; the give-up path should
        // never accidentally couple to the retry path.
        await db.outbox.add(makeRow('failed') as OutboxRow)
        await db.outbox.add(makeRow('pending') as OutboxRow)

        await discardFailedOutboxRows({ db })

        const remaining = await db.outbox.toArray()
        for (const row of remaining) {
            expect(row.forceLwwOnConflict).toBeUndefined()
        }
    })
})

describe('retryFailedOutboxRows', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it("resets every failed row to status='pending' with forceLwwOnConflict=true", async () => {
        const db = getDb()
        await db.outbox.add(
            makeRow('failed', {
                attempts: 5,
                lastError: 'VersionMismatch',
                scheduledFor: 0,
            }) as OutboxRow,
        )
        await db.outbox.add(makeRow('failed') as OutboxRow)
        await db.outbox.add(makeRow('pending') as OutboxRow)

        // No-op pump for the test seam — we only care about the Dexie writes.
        const result = await retryFailedOutboxRows({ db, pump: () => {} })

        expect(result.retried).toBe(2)
        const rows = await db.outbox.toArray()
        const reset = rows.filter((r) => r.forceLwwOnConflict === true)
        expect(reset).toHaveLength(2)
        for (const row of reset) {
            expect(row.status).toBe('pending')
            expect(row.attempts).toBe(0)
            expect(row.lastError).toBeUndefined()
        }
        // The originally-pending row is untouched and carries no flag.
        const untouched = rows.find((r) => r.forceLwwOnConflict === undefined)
        expect(untouched?.status).toBe('pending')
    })

    it('is a no-op when no failed rows exist (flag never gets set on pending/sending)', async () => {
        const db = getDb()
        await db.outbox.add(makeRow('pending') as OutboxRow)
        await db.outbox.add(makeRow('sending') as OutboxRow)

        const result = await retryFailedOutboxRows({ db, pump: () => {} })

        expect(result.retried).toBe(0)
        const rows = await db.outbox.toArray()
        for (const row of rows) {
            expect(row.forceLwwOnConflict).toBeUndefined()
        }
    })
})
