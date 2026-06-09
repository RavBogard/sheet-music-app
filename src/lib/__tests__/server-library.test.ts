import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

type MockDoc = { id: string; data: () => Record<string, unknown> }
let pages: MockDoc[][] = []
let pageIndex = 0
let mockShouldThrow = false

// ── Mocks ──

const mockStartAfter = vi.fn()

const queryChain: Record<string, unknown> = {
    orderBy: vi.fn(() => queryChain),
    limit: vi.fn(() => queryChain),
    select: vi.fn(() => queryChain),
    startAfter: vi.fn((...args: unknown[]) => {
        mockStartAfter(...args)
        return queryChain
    }),
    get: vi.fn(async () => {
        if (mockShouldThrow) throw new Error('Firestore error')
        const docs = pages[pageIndex] || []
        pageIndex++
        return {
            empty: docs.length === 0,
            docs,
        }
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => queryChain),
    })),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Import after mocks ──

import { getServerLibrary, getServerLibraryLean, __resetServerLibraryCache } from '@/lib/server-library'
import { logger } from '@/lib/logger'

// ── Helpers ──

function makeLibDoc(id: string, overrides: Record<string, unknown> = {}): MockDoc {
    return {
        id,
        data: () => ({
            name: `Song ${id}`,
            mimeType: 'application/pdf',
            parents: [],
            modifiedTime: null,
            webViewLink: null,
            metadata: null,
            lastSyncedAt: '',
            ...overrides,
        }),
    }
}

// ── Tests ──

describe('getServerLibrary', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        pageIndex = 0
        pages = []
        mockShouldThrow = false
    })

    it('returns files for a single page of results', async () => {
        pages = [
            [makeLibDoc('f1'), makeLibDoc('f2'), makeLibDoc('f3')],
            [], // empty second page signals end
        ]

        const result = await getServerLibrary()

        expect(result.files).toHaveLength(3)
        expect(result.files[0].id).toBe('f1')
        expect(result.files[0].name).toBe('Song f1')
        expect(result.files[0].mimeType).toBe('application/pdf')
    })

    it('paginates correctly when >500 docs exist', async () => {
        // Create 500 docs for page 1, 100 for page 2
        const page1 = Array.from({ length: 500 }, (_, i) => makeLibDoc(`p1-${i}`))
        const page2 = Array.from({ length: 100 }, (_, i) => makeLibDoc(`p2-${i}`))

        pages = [page1, page2, []]

        const result = await getServerLibrary()

        expect(result.files).toHaveLength(600)
        // Verify startAfter was called with the last doc from page 1
        expect(mockStartAfter).toHaveBeenCalledWith(page1[499])
    })

    it('skips malformed documents that fail Zod validation', async () => {
        pages = [
            [
                makeLibDoc('good-1'),
                // Malformed: missing name (Zod requires name: string)
                {
                    id: 'bad-1',
                    data: () => ({
                        // name intentionally omitted
                        mimeType: 'application/pdf',
                    }),
                },
                makeLibDoc('good-2'),
            ],
            [],
        ]

        const result = await getServerLibrary()

        expect(result.files).toHaveLength(2)
        expect(result.files[0].id).toBe('good-1')
        expect(result.files[1].id).toBe('good-2')
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('bad-1'),
            expect.anything()
        )
    })

    it('returns empty files and current timestamp on Firestore error', async () => {
        mockShouldThrow = true

        const before = new Date().toISOString()
        const result = await getServerLibrary()
        const after = new Date().toISOString()

        expect(result.files).toEqual([])
        expect(result.lastModified >= before).toBe(true)
        expect(result.lastModified <= after).toBe(true)
    })

    it('tracks lastModified from the most recent lastSyncedAt', async () => {
        pages = [
            [
                makeLibDoc('f1', { lastSyncedAt: '2026-03-01T00:00:00Z' }),
                makeLibDoc('f2', { lastSyncedAt: '2026-03-10T00:00:00Z' }),
                makeLibDoc('f3', { lastSyncedAt: '2026-03-05T00:00:00Z' }),
            ],
            [],
        ]

        const result = await getServerLibrary()

        expect(result.lastModified).toBe('2026-03-10T00:00:00Z')
    })

    it('returns empty when collection has no documents', async () => {
        pages = [[]]

        const result = await getServerLibrary()

        expect(result.files).toEqual([])
    })

    // v11.1-03: host-org display filter.
    describe('orgId host-filter', () => {
        beforeEach(() => __resetServerLibraryCache())

        it('returns all rows when no orgId is passed (byte-identical to prior behavior)', async () => {
            pages = [[
                makeLibDoc('crc-1', { orgId: 'crc' }),
                makeLibDoc('bl-1', { orgId: 'brotherslazaroff' }),
                makeLibDoc('legacy', {}), // no orgId
            ], []]

            const result = await getServerLibrary()
            expect(result.files.map(f => f.id).sort()).toEqual(['bl-1', 'crc-1', 'legacy'])
        })

        it('filters to crc (legacy/unstamped rows count as crc)', async () => {
            pages = [[
                makeLibDoc('crc-1', { orgId: 'crc' }),
                makeLibDoc('bl-1', { orgId: 'brotherslazaroff' }),
                makeLibDoc('legacy', {}), // rowOrg(undefined) === 'crc'
            ], []]

            const result = await getServerLibrary('crc')
            expect(result.files.map(f => f.id).sort()).toEqual(['crc-1', 'legacy'])
        })

        it('filters to brotherslazaroff (drops crc + legacy rows)', async () => {
            pages = [[
                makeLibDoc('crc-1', { orgId: 'crc' }),
                makeLibDoc('bl-1', { orgId: 'brotherslazaroff' }),
                makeLibDoc('bl-2', { orgId: 'brotherslazaroff' }),
                makeLibDoc('legacy', {}),
            ], []]

            const result = await getServerLibrary('brotherslazaroff')
            expect(result.files.map(f => f.id).sort()).toEqual(['bl-1', 'bl-2'])
        })
    })

    describe('getServerLibraryLean orgId host-filter + per-org cache', () => {
        beforeEach(() => __resetServerLibraryCache())

        it('scopes lean results by org and caches per-org (no cross-poisoning)', async () => {
            pages = [[
                makeLibDoc('crc-1', { orgId: 'crc' }),
                makeLibDoc('bl-1', { orgId: 'brotherslazaroff' }),
            ], []]

            const crc = await getServerLibraryLean('crc')
            expect(crc.map(f => f.id)).toEqual(['crc-1'])

            // Different org key → fresh scan (not served from the crc cache entry).
            pageIndex = 0
            pages = [[
                makeLibDoc('crc-1', { orgId: 'crc' }),
                makeLibDoc('bl-1', { orgId: 'brotherslazaroff' }),
            ], []]
            const bl = await getServerLibraryLean('brotherslazaroff')
            expect(bl.map(f => f.id)).toEqual(['bl-1'])
        })
    })
})
