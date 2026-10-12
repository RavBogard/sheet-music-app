/**
 * Multi-tenant phase 2 — W6 + W11 on the admin Drive sync (CRC's folder).
 *
 *  - a NEW library_index row written by syncLibraryIndex carries orgId 'crc';
 *  - an EXISTING row's merge-write omits orgId (keeps whatever tenant it has),
 *    and its songs/* mirror carries that row's tenant;
 *  - the Storage copy passes 'crc' to uploadToStorage (customMetadata.orgId).
 *
 * Mock scaffolding copied from sync-engine-songs-mirror.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Batch capture ──
// Each call to db.batch() produces a NEW batch whose set ops accumulate in this list.
// ref.path tells us which collection it targets.
const batchSetOps: Array<{ batchId: number; collection: string; id: string; data: Record<string, unknown>; opts?: unknown }> = []
let nextBatchId = 0

const mockDocs = new Map<string, Record<string, unknown>>()
const mockSyncRunDocs = new Map<string, Record<string, unknown>>()

function createMockDocRef(collection: string, id: string) {
    return {
        id,
        path: `${collection}/${id}`,
        set: vi.fn(async (data: Record<string, unknown>) => {
            if (collection === 'sync_runs') {
                mockSyncRunDocs.set(id, { ...mockSyncRunDocs.get(id), ...data })
            } else {
                mockDocs.set(`${collection}/${id}`, { ...mockDocs.get(`${collection}/${id}`), ...data })
            }
        }),
        update: vi.fn(async (data: Record<string, unknown>) => {
            if (collection === 'sync_runs') {
                mockSyncRunDocs.set(id, { ...mockSyncRunDocs.get(id), ...data })
            } else {
                mockDocs.set(`${collection}/${id}`, { ...mockDocs.get(`${collection}/${id}`), ...data })
            }
        }),
        collection: vi.fn(() => ({
            get: vi.fn(async () => ({ empty: true, docs: [] })),
        })),
    }
}

function createMockCollection(collectionName: string) {
    return {
        doc: vi.fn((id: string) => createMockDocRef(collectionName, id)),
        select: vi.fn(() => ({
            get: vi.fn(async () => {
                const docs = Array.from(mockDocs.entries())
                    .filter(([key]) => key.startsWith(`${collectionName}/`))
                    .map(([key, data]) => {
                        const id = key.slice(collectionName.length + 1)
                        return {
                            id,
                            data: () => data,
                            ref: createMockDocRef(collectionName, id),
                        }
                    })
                return { docs }
            }),
        })),
        where: vi.fn(() => ({
            where: vi.fn(() => ({
                limit: vi.fn(() => ({
                    get: vi.fn(async () => ({ empty: true, docs: [] })),
                })),
            })),
        })),
    }
}

const mockDb = {
    collection: vi.fn((name: string) => createMockCollection(name)),
    batch: vi.fn(() => {
        const batchId = nextBatchId++
        return {
            set: vi.fn((ref: { path: string }, data: Record<string, unknown>, opts?: unknown) => {
                const [collection, id] = ref.path.split('/')
                batchSetOps.push({ batchId, collection, id, data, opts })
            }),
            delete: vi.fn(),
            commit: vi.fn(async () => {}),
        }
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => mockDb),
}))

const mockUploadToStorage = vi.fn(async (..._args: unknown[]) => 'gs://bucket/library/test.pdf')
vi.mock('@/lib/firebase-storage', () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
}))

const mockListAllFiles = vi.fn(async () => [] as unknown[])
const mockGetFile = vi.fn(async () => new ArrayBuffer(100))
vi.mock('@/lib/google-drive', () => ({
    DriveClient: vi.fn().mockImplementation(() => ({
        listAllFiles: mockListAllFiles,
        getFile: mockGetFile,
    })),
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Helpers ──

interface DriveFileFixture {
    id: string
    name: string
    mimeType: string
    modifiedTime: string
    webViewLink: string | null
    parents: string[]
    shortcutDetails?: { targetId: string }
}

function makeDriveFile(overrides: Partial<DriveFileFixture> = {}): DriveFileFixture {
    return {
        id: overrides.id ?? 'file-1',
        name: overrides.name ?? 'Test Song.pdf',
        mimeType: overrides.mimeType ?? 'application/pdf',
        modifiedTime: overrides.modifiedTime ?? '2026-01-01T00:00:00Z',
        webViewLink: overrides.webViewLink ?? null,
        parents: overrides.parents ?? [],
        ...(overrides.shortcutDetails ? { shortcutDetails: overrides.shortcutDetails } : {}),
    }
}

function libraryWritesFor(fileId: string) {
    return batchSetOps.filter((op) => op.collection === 'library_index' && op.id === fileId)
}

function songsWritesFor(fileId: string) {
    return batchSetOps.filter((op) => op.collection === 'songs' && op.id === fileId)
}

function addExistingLibraryDoc(id: string, data: Record<string, unknown> = {}) {
    mockDocs.set(`library_index/${id}`, { modifiedTime: '2026-01-01T00:00:00Z', ...data })
}

// ── Tests ──

describe('W6/W11 · syncLibraryIndex orgId', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDocs.clear()
        mockSyncRunDocs.clear()
        batchSetOps.length = 0
        nextBatchId = 0
        mockListAllFiles.mockResolvedValue([])
    })

    it("new Drive row → library_index carries orgId 'crc'; Storage copy gets 'crc'", async () => {
        mockListAllFiles.mockResolvedValue([makeDriveFile({ id: 'new-1', name: 'New Chart.pdf' })])
        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const lib = libraryWritesFor('new-1')
        expect(lib).toHaveLength(1)
        expect(lib[0].data.orgId).toBe('crc')
        expect(lib[0].opts).toEqual({ merge: true })
        expect(songsWritesFor('new-1')[0].data.orgId).toBe('crc')

        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
        const call = mockUploadToStorage.mock.calls[0] as unknown[]
        expect(call[0]).toBe('new-1')
        expect(call[3]).toBe('crc')
    })

    it('existing row (any tenant) → merge-write omits orgId; songs mirror keeps the row tenant', async () => {
        addExistingLibraryDoc('old-1', {
            orgId: 'brotherslazaroff',
            modifiedTime: '2025-01-01T00:00:00Z',
            storageCopiedAt: '2025-01-02T00:00:00Z',
        })
        mockListAllFiles.mockResolvedValue([
            makeDriveFile({ id: 'old-1', name: 'Old Chart.pdf', modifiedTime: '2026-01-01T00:00:00Z' }),
        ])
        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const lib = libraryWritesFor('old-1')
        expect(lib).toHaveLength(1)
        expect(lib[0].data).not.toHaveProperty('orgId')
        expect(songsWritesFor('old-1')[0].data.orgId).toBe('brotherslazaroff')
    })
})
