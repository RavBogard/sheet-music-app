/**
 * /api/profile/update: the caller's displayName and musician phone are written
 * to users/{uid}; an unchanged value is a no-op; an empty body is refused.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

const mockUserUpdate = vi.fn()

let userData: Record<string, unknown> | undefined = {
    displayName: 'Old Name',
    musicianProfile: { phone: '+10000000000' },
}

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({ exists: userData !== undefined, data: () => userData })),
                    update: mockUserUpdate,
                })),
            }
        }
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) }
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => withMockMemberships(mockFirestoreLocal)),
    verifyIdToken: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
        delete: vi.fn(() => '__DELETE__'),
    },
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { verifyIdToken } from '@/lib/firebase-admin'
import type { NextRequest } from 'next/server'
import { setMockMembershipRole, withMockMemberships } from '@/test-stubs/tenant-claims'

function mockAuth(uid = 'u1') {
    setMockMembershipRole('musician', uid)
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: `${uid}@example.com`,
        role: 'musician',
        m: { crc: 'mu' },
        isAdmin: false,
        isBandLeader: false,
        isMusician: true,
        isMember: true,
    } as never)
}

let POST: (req: NextRequest) => Promise<Response>
beforeAll(async () => {
    POST = (await import('@/app/api/profile/update/route')).POST
})

beforeEach(() => {
    vi.clearAllMocks()
    userData = { displayName: 'Old Name', musicianProfile: { phone: '+10000000000' } }
    mockAuth('u1')
})

describe('POST /api/profile/update', () => {
    it('writes_displayName', async () => {
        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'New Name' },
        }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true })
        expect(mockUserUpdate).toHaveBeenCalledWith({ displayName: 'New Name' })
    })

    it('writes_phone', async () => {
        await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { phone: '+15559999999' },
        }))

        expect(mockUserUpdate).toHaveBeenCalledWith({ 'musicianProfile.phone': '+15559999999' })
    })

    it('null_phone_deletes_it', async () => {
        await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { phone: null },
        }))

        expect(mockUserUpdate).toHaveBeenCalledWith({ 'musicianProfile.phone': '__DELETE__' })
    })

    it('writes_both_fields_in_one_update', async () => {
        await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'N', phone: '+15551111111' },
        }))

        expect(mockUserUpdate).toHaveBeenCalledTimes(1)
        expect(mockUserUpdate).toHaveBeenCalledWith({ displayName: 'N', 'musicianProfile.phone': '+15551111111' })
    })

    it('partial_no_change_is_noop', async () => {
        // displayName already matches current
        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'Old Name' },
        }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true })
        expect(mockUserUpdate).not.toHaveBeenCalled()
    })

    it('rejects_empty_body', async () => {
        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: {},
        }))
        expect(res.status).toBe(400)
    })
})
