import { vi } from 'vitest'

/**
 * Shared Firebase Admin mock objects.
 *
 * Usage in test files:
 * ```ts
 * import { firebaseAdminMock, mockDoc, mockFirestore } from '@/__tests__/mock-firebase-admin'
 * vi.mock('@/lib/firebase-admin', () => firebaseAdminMock)
 * ```
 *
 * vi.mock() must be called in the consuming test file (vitest hoists them).
 * These exports provide the mock objects to reference.
 */

export const mockDoc = {
    exists: true,
    data: () => ({} as Record<string, unknown>),
    ref: { update: vi.fn() },
}

export const mockUsersSnap = {
    docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}

export const mockWhere: ReturnType<typeof vi.fn> = vi.fn(() => {
    const chain = {
        where: mockWhere,
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: vi.fn(() => mockUsersSnap),
    }
    return chain
})

export const mockUpdate = vi.fn()
export const mockSet = vi.fn()

export const mockFirestore = {
    collection: vi.fn(() => ({
        doc: vi.fn(() => ({
            id: 'mock-doc-id',
            get: vi.fn(() => mockDoc),
            update: mockUpdate,
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({ set: vi.fn() })),
                add: vi.fn(),
            })),
        })),
        where: mockWhere,
    })),
    runTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        const transaction = {
            // tx.get(ref | query) returns a union-shaped snapshot: both
            // DocumentSnapshot fields (exists/data/ref) AND QuerySnapshot
            // fields (docs/empty), so callers needing either shape can read it.
            get: vi.fn(async () => ({
                exists: mockDoc.exists,
                data: mockDoc.data,
                ref: mockDoc.ref,
                docs: mockUsersSnap.docs,
                empty: mockUsersSnap.docs.length === 0,
            })),
            set: mockSet,
            update: mockUpdate,
        }
        return fn(transaction)
    }),
}

export const firebaseAdminMock = {
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}

/**
 * Configure verifyIdToken to return a user with the given role and correct claim flags.
 */
export function mockAuth(role: string) {
    firebaseAdminMock.verifyIdToken.mockResolvedValue({
        uid: 'user123',
        email: 'test@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}
