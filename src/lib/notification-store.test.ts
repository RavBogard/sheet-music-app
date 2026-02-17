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
}))

vi.mock('@/lib/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import {
    broadcastNotification,
    createNotification,
    markAsRead,
    markAllAsRead,
} from './notification-store'
import { addDoc, updateDoc, getDocs } from 'firebase/firestore'

const mockAddDoc = addDoc as ReturnType<typeof vi.fn>
const mockUpdateDoc = updateDoc as ReturnType<typeof vi.fn>
const mockGetDocs = getDocs as ReturnType<typeof vi.fn>

describe('createNotification', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        batchOps.length = 0
    })

    it('creates a notification with read=false and serverTimestamp', async () => {
        await createNotification('user1', {
            type: 'general',
            title: 'Test',
            body: 'Test body',
        })

        expect(mockAddDoc).toHaveBeenCalledTimes(1)
        const data = mockAddDoc.mock.calls[0][1]
        expect(data.read).toBe(false)
        expect(data.title).toBe('Test')
        expect(data.body).toBe('Test body')
        expect(data.type).toBe('general')
        expect(data.createdAt).toBe('SERVER_TIMESTAMP')
    })

    it('preserves optional fields like link and entityId', async () => {
        await createNotification('user1', {
            type: 'setlist_published',
            title: 'New setlist',
            body: 'Check it out',
            link: '/setlist/abc',
            entityId: 'abc',
        })

        const data = mockAddDoc.mock.calls[0][1]
        expect(data.link).toBe('/setlist/abc')
        expect(data.entityId).toBe('abc')
    })
})

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

describe('broadcastNotification', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        batchOps.length = 0
        mockBatch.set.mockClear()
        mockBatch.commit.mockClear()
    })

    it('creates one notification per user', async () => {
        const uids = ['user1', 'user2', 'user3']
        await broadcastNotification(uids, {
            type: 'setlist_published',
            title: 'New setlist',
            body: 'Check it out',
        })

        expect(mockBatch.set).toHaveBeenCalledTimes(3)
        expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    })

    it('batches in groups of 50', async () => {
        const uids = Array.from({ length: 120 }, (_, i) => `user${i}`)
        await broadcastNotification(uids, {
            type: 'general',
            title: 'Broadcast',
            body: 'To all members',
        })

        // 120 users = 3 batches (50 + 50 + 20)
        expect(mockBatch.commit).toHaveBeenCalledTimes(3)
    })

    it('sets read=false and serverTimestamp on each notification', async () => {
        await broadcastNotification(['user1'], {
            type: 'setlist_updated',
            title: 'Updated',
            body: 'Tracks changed',
            link: '/setlist/xyz',
            entityId: 'xyz',
        })

        const setData = mockBatch.set.mock.calls[0][1]
        expect(setData.read).toBe(false)
        expect(setData.createdAt).toBe('SERVER_TIMESTAMP')
        expect(setData.type).toBe('setlist_updated')
        expect(setData.link).toBe('/setlist/xyz')
    })

    it('handles empty member list gracefully', async () => {
        await broadcastNotification([], {
            type: 'general',
            title: 'Empty',
            body: 'No members',
        })

        expect(mockBatch.set).not.toHaveBeenCalled()
        expect(mockBatch.commit).not.toHaveBeenCalled()
    })
})
