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

export const mockFirestore = {
    collection: vi.fn(() => ({
        doc: vi.fn(() => ({
            get: vi.fn(() => mockDoc),
            update: vi.fn(),
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({ set: vi.fn() })),
            })),
        })),
        where: mockWhere,
    })),
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
