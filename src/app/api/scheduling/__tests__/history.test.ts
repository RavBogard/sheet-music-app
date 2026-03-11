import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }
let historyDocs: MockDocEntry[] = []
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
        if (name === 'scheduling_history') return makeChainable(historyDocs)
        if (name === 'scheduling_assignments') return makeChainable(assignmentDocs)
        return makeChainable([])
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'leader-1', email: 'leader@example.com', role,
        isAdmin: role === 'admin', isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role), isMember: role !== 'pending',
    } as never)
}

describe('GET /api/scheduling/history', () => {
    let GET: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/history/route')
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockAuth('band_leader')
        historyDocs = [
            { id: 'h1', data: () => ({ musicianUid: 'u1', action: 'assigned', recordedAt: 1000 }) },
        ]
        assignmentDocs = [
            { id: 'a1', data: () => ({ musicianUid: 'u1', musicianName: 'Alice', status: 'confirmed', instrument: 'Guitar' }) },
            { id: 'a2', data: () => ({ musicianUid: 'u1', musicianName: 'Alice', status: 'declined', instrument: 'Guitar' }) },
            { id: 'a3', data: () => ({ musicianUid: 'u2', musicianName: 'Bob', status: 'pending', instrument: 'Drums' }) },
        ]
    })

    it('returns history entries', async () => {
        const req = makeReq('/api/scheduling/history', { token: 'valid-token' })
        const res = await GET(req)
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.history).toHaveLength(1)
        expect(json.history[0].id).toBe('h1')
    })

    it('computes musician stats from assignments', async () => {
        const req = makeReq('/api/scheduling/history', { token: 'valid-token' })
        const res = await GET(req)
        const json = await res.json()

        const aliceStats = json.analytics.musicianStats.find((s: any) => s.uid === 'u1')
        expect(aliceStats.confirmed).toBe(1)
        expect(aliceStats.declined).toBe(1)
    })

    it('computes instrument frequency', async () => {
        const req = makeReq('/api/scheduling/history', { token: 'valid-token' })
        const res = await GET(req)
        const json = await res.json()

        const guitar = json.analytics.instrumentFrequency.find((i: any) => i.instrument === 'Guitar')
        expect(guitar.count).toBe(2)
    })

    it('computes response rate', async () => {
        const req = makeReq('/api/scheduling/history', { token: 'valid-token' })
        const res = await GET(req)
        const json = await res.json()

        // 3 total, 2 responded (confirmed + declined), 1 pending
        expect(json.analytics.responseRate).toBe(67) // Math.round(2/3 * 100)
    })
})
