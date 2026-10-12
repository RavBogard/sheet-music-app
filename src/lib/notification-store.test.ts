import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track batch operations for verification
const batchOps: { type: string; path?: string; data?: Record<string, unknown> }[] = []
const mockBatch = {
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
        batchOps.push({ type: 'set', path: ref.path, data })
    }),
    update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
        batchOps.push({ type: 'update', path: ref.path, data })
    }),
    commit: vi.fn().mockResolvedValue(undefined),
}

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
        path: segments.join('/'),
    })),
    doc: vi.fn((collRef: { path: string }) => ({
        path: `${collRef.path}/${Math.random().toString(36).slice(2, 8)}`,
    })),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => mockBatch),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    addDoc: vi.fn().mockResolvedValue({ id: 'new-notif-id' }),
    getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    Timestamp: { now: vi.fn() },
}))

vi.mock('@/lib/firebase', () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === 'function' ? u : () => {}
    }),
    recoverFromFirestoreShutdown: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import {
    markAsRead,
    markAllAsRead,
} from './notification-store'
import { updateDoc, getDocs } from 'firebase/firestore'

const mockUpdateDoc = updateDoc as ReturnType<typeof vi.fn>
const mockGetDocs = getDocs as ReturnType<typeof vi.fn>

describe('markAsRead', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates the notification document', async () => {
        await markAsRead('user1', 'notif1')
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
        expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ read: true })
    })
})

describe('markAllAsRead', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        batchOps.length = 0
    })

    it('does nothing when no unread notifications', async () => {
        mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
        await markAllAsRead('user1')
        expect(mockBatch.commit).not.toHaveBeenCalled()
    })

    it('batch-updates all unread notifications', async () => {
        mockGetDocs.mockResolvedValue({
            empty: false,
            docs: [
                { ref: { path: 'users/user1/notifications/n1' } },
                { ref: { path: 'users/user1/notifications/n2' } },
            ],
        })

        await markAllAsRead('user1')
        expect(mockBatch.update).toHaveBeenCalledTimes(2)
        expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    })
})
