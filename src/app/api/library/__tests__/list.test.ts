import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }

let libraryDocs: MockDocEntry[] = []
let cursorDocExists = false

const makeChainable = (docs: MockDocEntry[]) => {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        startAfter: vi.fn(() => chain),
        get: vi.fn(async () => ({ docs, empty: docs.length === 0 })),
        doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: cursorDocExists })),
        })),
    }
    return chain
}

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'library_index') return makeChainable(libraryDocs)
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

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'user-1',
        email: 'user@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

let GET: typeof import('@/app/api/library/list/route').GET

beforeAll(async () => {
    const mod = await import('@/app/api/library/list/route')
    GET = mod.GET
})

function makeLibDoc(overrides: Record<string, unknown> = {}): MockDocEntry {
    const id = overrides.id as string || 'file-1'
    return {
        id,
        data: () => ({
            name: 'Test Song.pdf',
            mimeType: 'application/pdf',
            parents: ['folder-1'],
            modifiedTime: '2026-03-01',
            webViewLink: 'https://drive.google.com/file/d/abc',
            metadata: null,
            status: 'active',
            lastSyncedAt: '2026-03-01T00:00:00Z',
            ...overrides,
        }),
    }
}

describe('GET /api/library/list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        libraryDocs = []
        cursorDocExists = false
    })

    it('returns files array with correct shape', async () => {
        mockAuth('musician')
        libraryDocs = [makeLibDoc({ id: 'f1' }), makeLibDoc({ id: 'f2', name: 'Another.pdf' })]
        const req = makeReq('/api/library/list', { token: 'valid' })
        const res = await GET(req)
        const json = await res.json()

        expect(json.files).toHaveLength(2)
        expect(json.files[0]).toHaveProperty('id')
        expect(json.files[0]).toHaveProperty('name')
        expect(json.files[0]).toHaveProperty('mimeType')
        expect(json.files[0]).toHaveProperty('status')
        expect(json.total).toBe(2)
    })

    it('excludes archived files by default', async () => {
        mockAuth('musician')
        libraryDocs = [
            makeLibDoc({ id: 'f1', status: 'active' }),
            makeLibDoc({ id: 'f2', status: 'archived' }),
        ]
        const req = makeReq('/api/library/list', { token: 'valid' })
        const res = await GET(req)
        const json = await res.json()

        expect(json.files).toHaveLength(1)
        expect(json.files[0].id).toBe('f1')
    })

    it('returns only archived files when status=archived', async () => {
        mockAuth('musician')
        libraryDocs = [
            makeLibDoc({ id: 'f1', status: 'active' }),
            makeLibDoc({ id: 'f2', status: 'archived', archivedAt: '2026-03-01', archivedBy: 'user-1' }),
        ]
        const req = makeReq('/api/library/list?status=archived', { token: 'valid' })
        const res = await GET(req)
        const json = await res.json()

        expect(json.files).toHaveLength(1)
        expect(json.files[0].id).toBe('f2')
        expect(json.files[0]).toHaveProperty('archivedAt')
        expect(json.files[0]).toHaveProperty('archivedBy')
    })

    it('returns null nextCursor when fewer results than limit', async () => {
        mockAuth('musician')
        libraryDocs = [makeLibDoc()]
        const req = makeReq('/api/library/list?limit=10', { token: 'valid' })
        const res = await GET(req)
        const json = await res.json()

        expect(json.nextCursor).toBeNull()
    })

    it('sets Cache-Control header when all=true', async () => {
        mockAuth('musician')
        libraryDocs = [makeLibDoc()]
        const req = makeReq('/api/library/list?all=true', { token: 'valid' })
        const res = await GET(req)

        expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
    })

    it('does not set Cache-Control for non-all requests', async () => {
        mockAuth('musician')
        libraryDocs = [makeLibDoc()]
        const req = makeReq('/api/library/list', { token: 'valid' })
        const res = await GET(req)

        expect(res.headers.get('Cache-Control')).toBeNull()
    })
})
