/**
 * Unit tests for the sync engine Storage copy, retry, incremental processing,
 * and sync run logging.
 *
 * Mocks: firebase-admin (getFirestore), firebase-storage (uploadToStorage),
 *        google-drive (DriveClient), firebase-admin/storage (getStorage).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

const mockDocs = new Map<string, Record<string, unknown>>()
const mockBatchOps: Array<{ op: string; ref: string; data?: unknown }> = []
let mockBatchCommitFn: ReturnType<typeof vi.fn>
const mockSyncRunDocs = new Map<string, Record<string, unknown>>()
const mockDeletedStorageFiles: string[] = []

function createMockDocRef(collection: string, id: string) {
    return {
        id,
        path: `${collection}/${id}`,
        set: vi.fn(async (data: Record<string, unknown>, _opts?: unknown) => {
            if (collection === 'sync_runs') {
                mockSyncRunDocs.set(id, { ...mockSyncRunDocs.get(id), ...data })
            } else {
                mockDocs.set(id, { ...mockDocs.get(id), ...data })
            }
        }),
        update: vi.fn(async (data: Record<string, unknown>) => {
            if (collection === 'sync_runs') {
                mockSyncRunDocs.set(id, { ...mockSyncRunDocs.get(id), ...data })
            } else {
                mockDocs.set(id, { ...mockDocs.get(id), ...data })
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
                    .filter(([_, data]) => data._collection === collectionName)
                    .map(([id, data]) => ({
                        id,
                        data: () => data,
                        ref: createMockDocRef(collectionName, id),
                    }))
                return { docs }
            }),
        })),
    }
}

const mockDb = {
    collection: vi.fn((name: string) => createMockCollection(name)),
    batch: vi.fn(() => {
        mockBatchCommitFn = vi.fn(async () => {})
        return {
            set: vi.fn((ref: { path: string }, data: unknown, _opts?: unknown) => {
                mockBatchOps.push({ op: 'set', ref: ref.path, data })
            }),
            delete: vi.fn((ref: { path: string }) => {
                mockBatchOps.push({ op: 'delete', ref: ref.path })
            }),
            commit: mockBatchCommitFn,
        }
    }),
}

// ── Mock modules ──

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => mockDb),
}))

 
const mockUploadToStorage = vi.fn<any>(async () => 'gs://bucket/library/test.pdf')

vi.mock('@/lib/firebase-storage', () => ({
     
    uploadToStorage: (...args: any[]) => mockUploadToStorage(...args),
}))

 
const mockListAllFiles = vi.fn<any>(async () => [])
 
const mockGetFile = vi.fn<any>(async () => new ArrayBuffer(100))

vi.mock('@/lib/google-drive', () => ({
    DriveClient: vi.fn().mockImplementation(() => ({
        listAllFiles: mockListAllFiles,
        getFile: mockGetFile,
    })),
}))

const mockBucketDelete = vi.fn(async () => {})
const mockBucketFile = vi.fn(() => ({
    delete: mockBucketDelete,
}))

vi.mock('firebase-admin/storage', () => ({
    getStorage: vi.fn(() => ({
        bucket: vi.fn(() => ({
            file: mockBucketFile,
        })),
    })),
}))

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}))

// ── Helpers ──

function addExistingDoc(id: string, data: Record<string, unknown> = {}) {
    mockDocs.set(id, { _collection: 'library_index', modifiedTime: '2026-01-01T00:00:00Z', ...data })
}

function makeDriveFile(overrides: Partial<{
    id: string; name: string; mimeType: string; modifiedTime: string;
    webViewLink: string; parents: string[];
}> = {}) {
    return {
        id: overrides.id || 'file-1',
        name: overrides.name || 'Test Song.pdf',
        mimeType: overrides.mimeType || 'application/pdf',
        modifiedTime: overrides.modifiedTime || '2026-01-01T00:00:00Z',
        webViewLink: overrides.webViewLink || null,
        parents: overrides.parents || [],
    }
}

// ── Tests ──

describe('Sync Engine — Storage Copy Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDocs.clear()
        mockSyncRunDocs.clear()
        mockBatchOps.length = 0
        mockDeletedStorageFiles.length = 0
        mockUploadToStorage.mockResolvedValue('gs://bucket/library/test.pdf')
        mockGetFile.mockResolvedValue(new ArrayBuffer(100))
        mockListAllFiles.mockResolvedValue([])
    })

    it('copies new files to Storage via uploadToStorage', async () => {
        const file = makeDriveFile({ id: 'new-file-1', name: 'New Song.pdf' })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(mockUploadToStorage).toHaveBeenCalledWith(
            'new-file-1',
            expect.any(Buffer),
            'application/pdf'
        )
        expect(stats.copiedToStorage).toBe(1)
    })

    it('retries files with storageFailed=true on subsequent sync runs', async () => {
        const file = makeDriveFile({ id: 'failed-file', name: 'Failed Song.pdf' })
        addExistingDoc('failed-file', {
            storageFailed: true,
            modifiedTime: '2026-01-01T00:00:00Z',
        })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(mockUploadToStorage).toHaveBeenCalledWith(
            'failed-file',
            expect.any(Buffer),
            'application/pdf'
        )
        expect(stats.retriedCopies).toBeGreaterThanOrEqual(1)
    })

    it('copies at most MAX_COPIES_PER_RUN (20) files per invocation', async () => {
        const files = Array.from({ length: 30 }, (_, i) =>
            makeDriveFile({ id: `file-${i}`, name: `Song ${i}.pdf` })
        )
        mockListAllFiles.mockResolvedValue(files)

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(mockUploadToStorage).toHaveBeenCalledTimes(20)
        expect(stats.copiedToStorage + stats.copyErrors).toBeLessThanOrEqual(20)
    })

    it('marks storageFailed=true on individual copy failure without aborting sync', async () => {
        const file1 = makeDriveFile({ id: 'good-file', name: 'Good.pdf' })
        const file2 = makeDriveFile({ id: 'bad-file', name: 'Bad.pdf' })
        mockListAllFiles.mockResolvedValue([file1, file2])

        mockUploadToStorage
            .mockResolvedValueOnce('gs://bucket/library/good.pdf')
            .mockRejectedValueOnce(new Error('Upload failed'))

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        // Sync should complete (not throw)
        expect(stats.copiedToStorage).toBe(1)
        expect(stats.copyErrors).toBe(1)

        // bad-file should be marked storageFailed in Firestore
        const badDoc = mockDocs.get('bad-file')
        expect(badDoc?.storageFailed).toBe(true)
    })

    it('refreshes Storage copy for modified files', async () => {
        const file = makeDriveFile({
            id: 'modified-file',
            name: 'Modified Song.pdf',
            modifiedTime: '2026-02-01T00:00:00Z',
        })
        addExistingDoc('modified-file', {
            modifiedTime: '2026-01-01T00:00:00Z',
            storageCopiedAt: '2026-01-01T00:00:00Z',
        })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(mockUploadToStorage).toHaveBeenCalledWith(
            'modified-file',
            expect.any(Buffer),
            'application/pdf'
        )
        expect(stats.copiedToStorage).toBeGreaterThanOrEqual(1)
    })

    it('deletes Storage files for deleted Drive files', async () => {
        addExistingDoc('deleted-file', { modifiedTime: '2026-01-01T00:00:00Z' })
        mockListAllFiles.mockResolvedValue([]) // file no longer in Drive

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(stats.deletedFromStorage).toBeGreaterThanOrEqual(1)
    })

    it('writes a sync run document to sync_runs collection', async () => {
        mockListAllFiles.mockResolvedValue([])

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(stats.syncRunId).toBeDefined()
        expect(stats.syncRunId).toBeTruthy()

        // sync_runs doc should have been set and updated
        const runDoc = Array.from(mockSyncRunDocs.values())[0]
        expect(runDoc).toBeDefined()
        expect(runDoc?.status).toBe('completed')
        expect(runDoc?.completedAt).toBeDefined()
    })

    it('skips files smaller than 50 bytes', async () => {
        const file = makeDriveFile({ id: 'tiny-file', name: 'Tiny.pdf' })
        mockListAllFiles.mockResolvedValue([file])
        mockGetFile.mockResolvedValue(new ArrayBuffer(30)) // 30 bytes < 50

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        expect(mockUploadToStorage).not.toHaveBeenCalled()
        expect(stats.copiedToStorage).toBe(0)
    })

    it('skips folder-type files for copy', async () => {
        const folder = makeDriveFile({
            id: 'folder-1',
            name: 'Sheet Music Folder',
            mimeType: 'application/vnd.google-apps.folder',
        })
        const file = makeDriveFile({ id: 'normal-file', name: 'Song.pdf' })
        mockListAllFiles.mockResolvedValue([folder, file])

        const { syncLibraryIndex } = await import('./sync-engine')
        const stats = await syncLibraryIndex()

        // uploadToStorage should only be called for the normal file, not the folder
        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
        expect(mockUploadToStorage).toHaveBeenCalledWith(
            'normal-file',
            expect.any(Buffer),
            'application/pdf'
        )
    })
})
