import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }
let userDocs: MockDocEntry[] = []
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
        if (name === 'users') return makeChainable(userDocs)
        if (name === 'scheduling_assignments') return makeChainable(assignmentDocs)
        return makeChainable([])
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/constants', () => ({
    BASE_URL: 'https://centralreform.live',
}))

// ── Import after mocks ──

describe('GET /api/scheduling/calendar-feed/[token]', () => {
    let GET: (req: NextRequest, context: { params: Promise<{ token: string }> }) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/calendar-feed/[token]/route')
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        userDocs = [{
            id: 'musician-1',
            data: () => ({
                displayName: 'Test Musician',
                musicianProfile: { calendarFeedToken: 'a'.repeat(48) },
            }),
        }]
        assignmentDocs = [{
            id: 'a1',
            data: () => ({
                musicianUid: 'musician-1',
                status: 'confirmed',
                setlistName: 'Shabbat Service',
                setlistId: 'sl-1',
                instrument: 'Guitar',
                eventDate: '2026-03-15T10:00:00Z',
            }),
        }]
    })

    it('returns text/calendar for valid token', async () => {
        const token = 'a'.repeat(48)
        const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${token}`)
        const res = await GET(req, { params: Promise.resolve({ token }) })

        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/calendar')
    })

    it('includes VCALENDAR and VEVENT in iCal output', async () => {
        const token = 'a'.repeat(48)
        const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${token}`)
        const res = await GET(req, { params: Promise.resolve({ token }) })
        const text = await res.text()

        expect(text).toContain('BEGIN:VCALENDAR')
        expect(text).toContain('END:VCALENDAR')
        expect(text).toContain('BEGIN:VEVENT')
        expect(text).toContain('Shabbat Service')
    })

    it('returns 400 for short tokens', async () => {
        const token = 'short'
        const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${token}`)
        const res = await GET(req, { params: Promise.resolve({ token }) })

        expect(res.status).toBe(400)
    })

    it('returns 404 for unknown tokens', async () => {
        userDocs = [] // no user found

        const token = 'b'.repeat(48)
        const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${token}`)
        const res = await GET(req, { params: Promise.resolve({ token }) })

        expect(res.status).toBe(404)
    })

    it('includes Content-Disposition header with filename', async () => {
        const token = 'a'.repeat(48)
        const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${token}`)
        const res = await GET(req, { params: Promise.resolve({ token }) })

        expect(res.headers.get('Content-Disposition')).toContain('.ics')
    })
})
