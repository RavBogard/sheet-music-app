import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

const mockCookieValue = { value: '' } as { value: string } | undefined
const mockProfileData = {
    role: 'musician',
    displayName: 'Test User',
}
let mockProfileExists = true

// ── Mocks ──

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn((name: string) => {
            if (name === '__session' && mockCookieValue) return mockCookieValue
            return undefined
        }),
    })),
}))

const mockVerifySessionCookie = vi.fn()
vi.mock('firebase-admin/auth', () => ({
    getAuth: vi.fn(() => ({
        verifySessionCookie: mockVerifySessionCookie,
    })),
}))

const mockDocGet = vi.fn(() => ({
    exists: mockProfileExists,
    data: () => (mockProfileExists ? mockProfileData : undefined),
}))

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => ({
            doc: vi.fn(() => ({
                get: mockDocGet,
            })),
        })),
    })),
}))

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Import after mocks ──

import { getServerUser, serializeSetlist, getServerCongregationConfig } from '@/lib/server-auth'

// ── Tests ──

describe('getServerUser', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset to valid defaults
        ;(mockCookieValue as { value: string }).value = 'valid-session-cookie'
        mockProfileExists = true
        mockProfileData.role = 'musician'
        mockProfileData.displayName = 'Test User'
        mockVerifySessionCookie.mockResolvedValue({
            uid: 'user-123',
            email: 'test@example.com',
            name: 'Auth Name',
        })
    })

    it('returns ServerUser with correct fields for valid session', async () => {
        const user = await getServerUser()

        expect(user).not.toBeNull()
        expect(user!.uid).toBe('user-123')
        expect(user!.email).toBe('test@example.com')
        expect(user!.displayName).toBe('Auth Name')
        expect(user!.role).toBe('musician')
    })

    it('returns null when no session cookie present', async () => {
        // Override the cookies mock for this test
        const { cookies } = await import('next/headers')
        vi.mocked(cookies).mockResolvedValueOnce({
            get: vi.fn(() => undefined),
        } as never)

        const user = await getServerUser()
        expect(user).toBeNull()
    })

    it('returns null when verifySessionCookie throws (expired)', async () => {
        mockVerifySessionCookie.mockRejectedValueOnce(new Error('Session expired'))

        const user = await getServerUser()
        expect(user).toBeNull()
    })

    it('returns null role when Firestore profile does not exist', async () => {
        mockProfileExists = false

        const user = await getServerUser()
        expect(user).not.toBeNull()
        expect(user!.role).toBeNull()
        expect(user!.isAdmin).toBe(false)
        expect(user!.isBandLeader).toBe(false)
        expect(user!.isMember).toBe(false)
    })

    it('computes admin boolean flags correctly', async () => {
        mockProfileData.role = 'admin'

        const user = await getServerUser()
        expect(user!.isAdmin).toBe(true)
        expect(user!.isBandLeader).toBe(true)
        expect(user!.isMember).toBe(true)
    })

    it('computes band_leader boolean flags correctly', async () => {
        mockProfileData.role = 'band_leader'

        const user = await getServerUser()
        expect(user!.isAdmin).toBe(false)
        expect(user!.isBandLeader).toBe(true)
        expect(user!.isMember).toBe(true)
    })

    it('computes musician boolean flags correctly', async () => {
        mockProfileData.role = 'musician'

        const user = await getServerUser()
        expect(user!.isAdmin).toBe(false)
        expect(user!.isBandLeader).toBe(false)
        expect(user!.isMember).toBe(true)
    })

    it('computes member boolean flags correctly', async () => {
        mockProfileData.role = 'member'

        const user = await getServerUser()
        expect(user!.isAdmin).toBe(false)
        expect(user!.isBandLeader).toBe(false)
        expect(user!.isMember).toBe(true)
    })

    it('computes pending boolean flags correctly (all false)', async () => {
        mockProfileData.role = 'pending'

        const user = await getServerUser()
        expect(user!.isAdmin).toBe(false)
        expect(user!.isBandLeader).toBe(false)
        expect(user!.isMember).toBe(false)
    })

    it('falls back to auth name when profile has no displayName', async () => {
        mockProfileData.displayName = ''

        const user = await getServerUser()
        expect(user!.displayName).toBe('Auth Name')
    })
})

describe('serializeSetlist', () => {
    it('converts Firestore Timestamps to ISO strings', () => {
        const fakeTimestamp = {
            toDate: () => new Date('2026-03-01T10:00:00Z'),
        }

        const result = serializeSetlist('setlist-1', {
            name: 'Shabbat Service',
            date: fakeTimestamp,
            updatedAt: fakeTimestamp,
        })

        expect(result.id).toBe('setlist-1')
        expect(result.name).toBe('Shabbat Service')
        expect(result.date).toBe('2026-03-01T10:00:00.000Z')
        expect(result.updatedAt).toBe('2026-03-01T10:00:00.000Z')
    })

    it('passes through plain values unchanged', () => {
        const result = serializeSetlist('s1', {
            name: 'Test',
            trackCount: 5,
            isPublic: true,
        })

        expect(result.name).toBe('Test')
        expect(result.trackCount).toBe(5)
        expect(result.isPublic).toBe(true)
    })

    it('handles nested objects and arrays recursively', () => {
        const ts = { toDate: () => new Date('2026-01-01T00:00:00Z') }

        const result = serializeSetlist('s1', {
            tracks: [{ title: 'Song', addedAt: ts }],
            meta: { created: ts, tags: ['worship'] },
        })

        expect(result.tracks[0].title).toBe('Song')
        expect(result.tracks[0].addedAt).toBe('2026-01-01T00:00:00.000Z')
        expect(result.meta.created).toBe('2026-01-01T00:00:00.000Z')
        expect(result.meta.tags).toEqual(['worship'])
    })

    it('handles null and undefined values', () => {
        const result = serializeSetlist('s1', {
            name: 'Test',
            rabbi: null,
            notes: undefined,
        })

        expect(result.name).toBe('Test')
        expect(result.rabbi).toBeNull()
        expect(result.notes).toBeUndefined()
    })
})

describe('getServerCongregationConfig', () => {
    // Need separate mock for this — it uses its own getFirestore call
    it('returns config data when document exists', async () => {
        // The existing mock already returns a Firestore with collection().doc().get()
        // But getServerCongregationConfig uses its own chain. Override for this test.
        const { getFirestore } = await import('firebase-admin/firestore')
        const configData = { name: 'CRC', timezone: 'America/Chicago' }
        vi.mocked(getFirestore).mockReturnValueOnce({
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        exists: true,
                        data: () => configData,
                    })),
                })),
            })),
        } as never)

        const config = await getServerCongregationConfig()
        expect(config).toEqual(configData)
    })

    it('returns null when document does not exist', async () => {
        const { getFirestore } = await import('firebase-admin/firestore')
        vi.mocked(getFirestore).mockReturnValueOnce({
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        exists: false,
                    })),
                })),
            })),
        } as never)

        const config = await getServerCongregationConfig()
        expect(config).toBeNull()
    })

    it('returns null on Firestore error', async () => {
        const { getFirestore } = await import('firebase-admin/firestore')
        vi.mocked(getFirestore).mockReturnValueOnce({
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({
                    get: vi.fn(async () => { throw new Error('Firestore error') }),
                })),
            })),
        } as never)

        const config = await getServerCongregationConfig()
        expect(config).toBeNull()
    })
})
