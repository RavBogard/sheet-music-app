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

export const mockWhere = vi.fn(() => ({
    get: vi.fn(() => mockUsersSnap),
}))

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
            // tx.get(ref) returns the shared mockDoc so transactional reads
            // mirror what a docRef.get() would return in the same test setup.
            // Callers that need the "collection query" shape can override
            // per-test with `mockFirestore.runTransaction.mockImplementationOnce(...)`.
            get: vi.fn(async () => mockDoc),
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
