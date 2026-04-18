import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }
let usersDocs: MockDocEntry[] = []
let assignmentDocs: MockDocEntry[] = []

const makeChainable = (docs: MockDocEntry[]) => {
    const chain: Record<string, any> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: vi.fn(async () => ({ empty: docs.length === 0, docs })),
    }
    return chain
}

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'users') return makeChainable(usersDocs)
        if (name === 'scheduling_assignments') return makeChainable(assignmentDocs)
        return makeChainable([])
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'leader-1',
        email: 'leader@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

function makeUserDoc(id: string, overrides: Record<string, unknown> = {}): MockDocEntry {
    return {
        id,
        data: () => ({
            displayName: `User ${id}`,
            email: `${id}@example.com`,
            role: 'musician',
            musicianProfile: {
                instrument: null,
                schedulingTier: 'regular',
                phone: null,
            },
            ...overrides,
        }),
    }
}

// ── Tests ──

describe('GET /api/scheduling/suggest', () => {
    let GET: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/suggest/route')
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockAuth('band_leader')
        usersDocs = []
        assignmentDocs = []
    })

    it('returns 400 without setlistId', async () => {
        const req = makeReq('/api/scheduling/suggest', { token: 'valid-token' })

        const res = await GET(req)
        expect(res.status).toBe(400)
    })

    it('returns available musicians excluding already assigned', async () => {
        usersDocs = [
            makeUserDoc('u1'),
            makeUserDoc('u2'),
            makeUserDoc('u3'),
        ]
        assignmentDocs = [
            { id: 'a1', data: () => ({ musicianUid: 'u1', status: 'confirmed' }) },
        ]

        const req = makeReq('/api/scheduling/suggest?setlistId=sl-1', { token: 'valid-token' })

        const res = await GET(req)
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        // u1 is assigned, so only u2 and u3 should appear
        const uids = json.suggestions.map((s: any) => s.uid)
        expect(uids).not.toContain('u1')
        expect(uids).toContain('u2')
        expect(uids).toContain('u3')
    })

    it('sorts by scheduling tier (core > regular > guest)', async () => {
        usersDocs = [
            makeUserDoc('guest', { musicianProfile: { schedulingTier: 'guest', instrument: null } }),
            makeUserDoc('core', { musicianProfile: { schedulingTier: 'core', instrument: null } }),
            makeUserDoc('regular', { musicianProfile: { schedulingTier: 'regular', instrument: null } }),
        ]
        assignmentDocs = []

        const req = makeReq('/api/scheduling/suggest?setlistId=sl-1', { token: 'valid-token' })

        const res = await GET(req)
        const json = await res.json()

        const tiers = json.suggestions.map((s: any) => s.schedulingTier)
        expect(tiers).toEqual(['core', 'regular', 'guest'])
    })

    it('prioritizes instrument matches when instrument filter provided', async () => {
        usersDocs = [
            makeUserDoc('u1', { musicianProfile: { instrument: 'drums', schedulingTier: 'regular' } }),
            makeUserDoc('u2', { musicianProfile: { instrument: 'acoustic_guitar', schedulingTier: 'regular' } }),
            makeUserDoc('u3', { musicianProfile: { instrument: 'bass', schedulingTier: 'regular' } }),
        ]
        assignmentDocs = []

        const req = makeReq('/api/scheduling/suggest?setlistId=sl-1&instrument=guitar', { token: 'valid-token' })

        const res = await GET(req)
        const json = await res.json()

        // u2 (acoustic_guitar) should come first as instrument match
        expect(json.suggestions[0].uid).toBe('u2')
        expect(json.suggestions[0].instrumentMatch).toBe(true)
    })

    it('limits to 10 suggestions', async () => {
        usersDocs = Array.from({ length: 15 }, (_, i) => makeUserDoc(`u${i}`))
        assignmentDocs = []

        const req = makeReq('/api/scheduling/suggest?setlistId=sl-1', { token: 'valid-token' })

        const res = await GET(req)
        const json = await res.json()

        expect(json.suggestions.length).toBe(10)
    })
})
