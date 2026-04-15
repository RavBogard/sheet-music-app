import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let latestOnNext: Function
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let latestOnError: Function | undefined

const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockOnSnapshot = vi.fn((...args: any[]) => {
    latestOnNext = args[1]
    latestOnError = args[2]
    return vi.fn() // unsubscribe
})
const mockDoc = vi.fn((...args: any[]) => ({ __ref: 'doc', args, withConverter: vi.fn(() => ({ __ref: 'doc-converted', args })) }))
const mockCollection = vi.fn((...args: any[]) => ({ __ref: 'collection', args, withConverter: vi.fn(() => ({ __ref: 'collection-converted', args })) }))
const mockQuery = vi.fn((...args: any[]) => ({ __ref: 'query', args }))
const mockOrderBy = vi.fn((...args: any[]) => ({ __ref: 'orderBy', args }))
const mockTimestampNow = vi.fn(() => ({ seconds: 1000, nanoseconds: 0 }))

vi.mock('firebase/firestore', () => ({
    getDoc: (...args: any[]) => mockGetDoc(...args),
    setDoc: (...args: any[]) => mockSetDoc(...args),
    updateDoc: (...args: any[]) => mockUpdateDoc(...args),
    onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    query: (...args: any[]) => mockQuery(...args),
    orderBy: (...args: any[]) => mockOrderBy(...args),
    Timestamp: { now: () => mockTimestampNow() },
}))

vi.mock('@/lib/firebase', () => ({
    db: { __mock: true },
    auth: {
        currentUser: {
            uid: 'test-uid',
            getIdToken: vi.fn(async () => 'mock-token'),
        },
    },
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/types/schemas', () => ({
    userProfileConverter: {
        toFirestore: (data: unknown) => data,
        fromFirestore: (snap: { data: () => unknown; id: string }) => {
            const d = snap.data()
            return d ? { id: snap.id, uid: snap.id, ...d as Record<string, unknown> } : null
        },
    },
}))

// ── Import after mocks ──

import {
    ensureUserProfile,
    subscribeToUserProfile,
    subscribeToAllUsers,
    updateUserRole,
    updateUserDisplayName,
    markWelcomeModalViewed,
} from '@/lib/users-firebase'
import { auth } from '@/lib/firebase'

// ── Helpers ──

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        uid: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        getIdToken: vi.fn(async () => 'mock-token'),
        ...overrides,
    } as any
}

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return {
        exists: () => exists,
        data: () => data ? { ...data } : undefined,
    }
}

// ── Tests ──

beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
})

describe('ensureUserProfile', () => {
    it('returns existing profile when snap exists', async () => {
        const profileData = { uid: 'user-1', email: 'test@example.com', displayName: 'Test', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        const result = await ensureUserProfile(makeUser())

        expect(result).toEqual(profileData)
        expect(mockGetDoc).toHaveBeenCalledTimes(1)
    })

    it('creates new profile with pending role when snap does not exist', async () => {
        mockGetDoc.mockResolvedValue(makeSnap(false))

        const result = await ensureUserProfile(makeUser())

        expect(result.role).toBe('pending')
        expect(result.uid).toBe('user-1')
        expect(result.email).toBe('test@example.com')
        expect(mockSetDoc).toHaveBeenCalledTimes(1)
    })

    it('updates lastLoginAt in background for existing profiles', async () => {
        const profileData = { uid: 'user-1', email: 'old@example.com', displayName: 'Test', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        await ensureUserProfile(makeUser())

        expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
        const updateArgs = mockUpdateDoc.mock.calls[0][1]
        expect(updateArgs).toHaveProperty('lastLoginAt')
        expect(updateArgs).toHaveProperty('email', 'test@example.com')
    })

    it('only writes photoURL if auth user has one', async () => {
        const profileData = { uid: 'user-1', displayName: 'Test', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        // User without photoURL
        await ensureUserProfile(makeUser({ photoURL: null }))

        const updateArgs = mockUpdateDoc.mock.calls[0][1]
        expect(updateArgs).not.toHaveProperty('photoURL')
    })

    it('writes photoURL when auth user has one', async () => {
        const profileData = { uid: 'user-1', displayName: 'Test', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        await ensureUserProfile(makeUser({ photoURL: 'https://photo.jpg' }))

        const updateArgs = mockUpdateDoc.mock.calls[0][1]
        expect(updateArgs.photoURL).toBe('https://photo.jpg')
    })

    it('only writes displayName if profile has no existing displayName', async () => {
        // Profile already has displayName — should NOT overwrite
        const profileData = { uid: 'user-1', displayName: 'Custom Name', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        await ensureUserProfile(makeUser({ displayName: 'Auth Name' }))

        const updateArgs = mockUpdateDoc.mock.calls[0][1]
        expect(updateArgs).not.toHaveProperty('displayName')
    })

    it('writes displayName if profile has no existing displayName', async () => {
        // Profile has no displayName — should write from auth
        const profileData = { uid: 'user-1', displayName: '', role: 'musician' }
        mockGetDoc.mockResolvedValue(makeSnap(true, profileData))

        await ensureUserProfile(makeUser({ displayName: 'Auth Name' }))

        const updateArgs = mockUpdateDoc.mock.calls[0][1]
        expect(updateArgs.displayName).toBe('Auth Name')
    })

    it('returns minimal fallback when db is empty/uninitialized', async () => {
        // Temporarily override db to empty object
        const firebase = await import('@/lib/firebase')
        const originalDb = firebase.db
        Object.defineProperty(firebase, 'db', { value: {}, writable: true, configurable: true })

        const result = await ensureUserProfile(makeUser())

        expect(result.uid).toBe('user-1')
        expect(result.role).toBe('pending')
        expect(mockGetDoc).not.toHaveBeenCalled()

        Object.defineProperty(firebase, 'db', { value: originalDb, writable: true, configurable: true })
    })
})

describe('subscribeToUserProfile', () => {
    it('calls onSnapshot with doc reference for uid', () => {
        const cb = vi.fn()
        subscribeToUserProfile('user-1', cb)

        expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
        expect(mockDoc).toHaveBeenCalled()
    })

    it('callback receives profile data when snap exists', () => {
        const cb = vi.fn()
        subscribeToUserProfile('user-1', cb)

        latestOnNext({
            exists: () => true,
            data: () => ({ uid: 'user-1', role: 'musician', email: 'a@b.com', displayName: 'Test', photoURL: null }),
        })

        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'user-1', role: 'musician' })
        )
    })

    it('deduplicates: skips callback when only lastLoginAt changes', () => {
        const cb = vi.fn()
        subscribeToUserProfile('user-1', cb)

        const profileBase = { uid: 'user-1', role: 'musician', email: 'a@b.com', displayName: 'Test', photoURL: null }

        latestOnNext({ exists: () => true, data: () => ({ ...profileBase, lastLoginAt: 1 }) })
        latestOnNext({ exists: () => true, data: () => ({ ...profileBase, lastLoginAt: 2 }) })

        // Should only fire once since meaningful fields are the same
        expect(cb).toHaveBeenCalledTimes(1)
    })

    it('fires callback when meaningful fields change', () => {
        const cb = vi.fn()
        subscribeToUserProfile('user-1', cb)

        latestOnNext({ exists: () => true, data: () => ({ uid: 'user-1', role: 'musician', email: 'a@b.com', displayName: 'Test', photoURL: null }) })
        latestOnNext({ exists: () => true, data: () => ({ uid: 'user-1', role: 'admin', email: 'a@b.com', displayName: 'Test', photoURL: null }) })

        expect(cb).toHaveBeenCalledTimes(2)
    })

    it('calls callback(null) when snap does not exist', () => {
        const cb = vi.fn()
        subscribeToUserProfile('user-1', cb)

        // First send a valid profile to set lastProfile
        latestOnNext({ exists: () => true, data: () => ({ uid: 'user-1', role: 'musician', email: 'a@b.com', displayName: 'T', photoURL: null }) })
        // Then send non-existent
        latestOnNext({ exists: () => false, data: () => undefined })

        expect(cb).toHaveBeenLastCalledWith(null)
    })

    it('returns noop when db is empty', async () => {
        const firebase = await import('@/lib/firebase')
        const originalDb = firebase.db
        Object.defineProperty(firebase, 'db', { value: {}, writable: true, configurable: true })

        const cb = vi.fn()
        const unsub = subscribeToUserProfile('user-1', cb)

        expect(typeof unsub).toBe('function')
        expect(mockOnSnapshot).not.toHaveBeenCalled()

        Object.defineProperty(firebase, 'db', { value: originalDb, writable: true, configurable: true })
    })
})

describe('subscribeToAllUsers', () => {
    it('calls onSnapshot with users collection ordered by createdAt desc', () => {
        const cb = vi.fn()
        subscribeToAllUsers(cb)

        expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
        expect(mockCollection).toHaveBeenCalled()
        expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc')
        expect(mockQuery).toHaveBeenCalled()
    })

    it('maps snapshot docs to UserProfile array', () => {
        const cb = vi.fn()
        subscribeToAllUsers(cb)

        latestOnNext({
            docs: [
                { data: () => ({ uid: 'u1', role: 'admin' }), id: 'u1' },
                { data: () => ({ uid: 'u2', role: 'musician' }), id: 'u2' },
            ],
        })

        expect(cb).toHaveBeenCalledWith([
            expect.objectContaining({ uid: 'u1', role: 'admin' }),
            expect.objectContaining({ uid: 'u2', role: 'musician' }),
        ])
    })

    it('calls onError callback on snapshot error', () => {
        const cb = vi.fn()
        const onErr = vi.fn()
        subscribeToAllUsers(cb, onErr)

        const error = new Error('snapshot failed')
        latestOnError!(error)

        expect(onErr).toHaveBeenCalledWith(error)
    })
})

describe('updateUserRole', () => {
    beforeEach(() => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            text: async () => 'ok',
        })) as any
    })

    it('calls /api/admin/set-role with correct payload and auth header', async () => {
        await updateUserRole('target-uid', 'musician' as any)

        expect(global.fetch).toHaveBeenCalledWith('/api/admin/set-role', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ targetUserId: 'target-uid', newRole: 'musician' }),
        }))
        const callHeaders = (global.fetch as any).mock.calls[0][1].headers
        expect(callHeaders.Authorization).toBe('Bearer mock-token')
    })

    it('throws when not authenticated (no currentUser)', async () => {
        const firebase = await import('@/lib/firebase')
        const originalAuth = firebase.auth
        Object.defineProperty(firebase, 'auth', { value: { currentUser: null }, writable: true, configurable: true })

        await expect(updateUserRole('target-uid', 'musician' as any)).rejects.toThrow('Not authenticated')

        Object.defineProperty(firebase, 'auth', { value: originalAuth, writable: true, configurable: true })
    })

    it('throws with API error message on non-OK response', async () => {
        global.fetch = vi.fn(async () => ({
            ok: false,
            text: async () => 'Role update failed',
        })) as any

        await expect(updateUserRole('target-uid', 'musician' as any)).rejects.toThrow('Role update failed')
    })
})

describe('updateUserDisplayName', () => {
    // v4.4 DL-010: now routes through POST /api/profile/update so the server can
    // fan the new name out to every scheduling_assignments copy.
    it('POSTs to /api/profile/update with displayName body', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            text: async () => 'ok',
        })) as any

        await updateUserDisplayName('user-1', 'New Name')

        expect(global.fetch).toHaveBeenCalledWith('/api/profile/update', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ displayName: 'New Name' }),
        }))
        // The direct Firestore write is gone — updateDoc must NOT be called.
        expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('throws when the server returns non-OK', async () => {
        global.fetch = vi.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => 'server error',
        })) as any

        await expect(updateUserDisplayName('user-1', 'New Name')).rejects.toThrow(/Failed to update display name/)
    })
})

describe('markWelcomeModalViewed', () => {
    it('calls updateDoc with viewedWelcomeModal: true', async () => {
        await markWelcomeModalViewed('user-1')

        expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
        expect(mockUpdateDoc).toHaveBeenCalledWith(
            expect.anything(),
            { viewedWelcomeModal: true }
        )
    })

    it('no-ops when db is empty', async () => {
        const firebase = await import('@/lib/firebase')
        const originalDb = firebase.db
        Object.defineProperty(firebase, 'db', { value: {}, writable: true, configurable: true })

        await markWelcomeModalViewed('user-1')

        expect(mockUpdateDoc).not.toHaveBeenCalled()

        Object.defineProperty(firebase, 'db', { value: originalDb, writable: true, configurable: true })
    })
})
