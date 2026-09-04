/**
 * v60-11-01 Task 2 — syncLibraryIndex songs/* mirror parity.
 *
 * Validates that the new songsBatch alongside the library_index batch:
 *   1. Mirrors EVERY library_index batch.set, regardless of MIME type (no MIME filter).
 *   2. Writes payload { id, title, normalizedTitle, fileId, createdAt? } only —
 *      NO `status` field (owned by /api/library/archive; cron must not clobber).
 *   3. Preserves library_index.name VERBATIM in songs/{id}.title — no .pdf stripping —
 *      so the 364 bootstrap-written docs and the new mirrored docs share shape.
 *   4. createdAt is set only on first write (file not in existingDocs); subsequent
 *      ticks rely on .set({ merge: true }) to preserve prior createdAt.
 *   5. Empty-name files trigger NO songs/* write (library_index write still happens).
 *
 * Mocking note: mirrors the patterns from src/lib/sync-engine.test.ts. Batch ops are
 * captured per-batch via separate arrays keyed by batch identity, which is how we
 * distinguish library_index writes from songs writes (both go through db.batch()).
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

const mockUploadToStorage = vi.fn(async () => 'gs://bucket/library/test.pdf')
vi.mock('@/lib/firebase-storage', () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...(args as [])),
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

describe('v60-11-01 syncLibraryIndex songs/* mirror', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDocs.clear()
        mockSyncRunDocs.clear()
        batchSetOps.length = 0
        nextBatchId = 0
        mockListAllFiles.mockResolvedValue([])
    })

    // LEFT RED DELIBERATELY — R2's own STOP clause in
    // `HANDOFF-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`, under `R-0904-live-cw-17` §2.
    //
    // The order asked for a chart-shaped fixture so the shortcut mirror is
    // actually exercised. Measured at `cdf1c37386`: no such fixture exists.
    // `isNonChartArtifactShape` rejects the whole Google-Apps namespace on
    // `mime.startsWith("application/vnd.google-apps.")` (`junk-filter.ts:35`),
    // a Drive shortcut IS `application/vnd.google-apps.shortcut`, and the
    // ingestion filter reads `f.mimeType` — never
    // `shortcutDetails.targetMimeType` (`sync-engine.ts:146`-`:148`). So EVERY
    // shortcut is dropped before the mirror, deliberately: `sync-engine.ts:16`
    // names the ~134 shortcuts as part of what this change excludes.
    //
    // Giving the fixture `mimeType: 'application/pdf'` would turn it green
    // while testing a shape Drive cannot return, and inverting it to assert
    // the drop would report the deletion of a named behaviour as a repair —
    // which R2 refuses. So it stays red and returns instead: whether a
    // shortcut-bonded row should still reach songs/* is a behaviour question
    // for `live-cw`, not a test edit.
    it('Scenario 1: new Drive shortcut mirrors to songs/* with raw name (no .pdf strip, no status)', async () => {
        const file = makeDriveFile({
            id: 'shortcut-lechu',
            name: 'Lechu Goldman.pdf',
            mimeType: 'application/vnd.google-apps.shortcut',
            shortcutDetails: { targetId: 'target-abc' },
        })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        expect(libraryWritesFor('shortcut-lechu')).toHaveLength(1)
        const songsOps = songsWritesFor('shortcut-lechu')
        expect(songsOps).toHaveLength(1)
        const songsData = songsOps[0].data
        expect(songsData.title).toBe('Lechu Goldman.pdf') // verbatim — no .pdf strip
        expect(songsData.normalizedTitle).toBe('lechu goldman.pdf')
        expect(songsData.fileId).toBe('shortcut-lechu')
        expect(songsData.id).toBe('shortcut-lechu')
        expect(songsData.createdAt).toBeTypeOf('number') // new file → createdAt set
        expect(songsData).not.toHaveProperty('status') // status owned by archive route
        expect(songsOps[0].opts).toEqual({ merge: true })
    })

    it('Scenario 2: new PDF (chart) mirrors with verbatim title including extension', async () => {
        const file = makeDriveFile({ id: 'pdf-adon', name: 'Adon Olam.pdf', mimeType: 'application/pdf' })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const songsOps = songsWritesFor('pdf-adon')
        expect(songsOps).toHaveLength(1)
        expect(songsOps[0].data.title).toBe('Adon Olam.pdf') // matches bootstrap-songs.ts:142 pattern
    })

    it('Scenario 3: modified file (already in library_index) — songs payload omits createdAt', async () => {
        addExistingLibraryDoc('existing-file', { modifiedTime: '2026-01-01T00:00:00Z' })
        const file = makeDriveFile({
            id: 'existing-file',
            name: 'Updated.pdf',
            modifiedTime: '2026-02-01T00:00:00Z',
        })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const songsOps = songsWritesFor('existing-file')
        expect(songsOps).toHaveLength(1)
        expect(songsOps[0].data.title).toBe('Updated.pdf')
        expect(songsOps[0].data).not.toHaveProperty('createdAt') // merge:true preserves prior
    })

    it('Scenario 4: empty/missing name → NO songs/* write, library_index write still happens', async () => {
        // Drive returns a file whose name is whitespace only. The fixture is a
        // PDF, not a folder, DELIBERATELY: v11.5-04-02's ingestion filter
        // (`sync-engine.ts:146`, `isNonChartArtifactShape`) drops folders
        // before either write, so the old folder fixture could no longer reach
        // the guard this test is named for — it asserted 0 library writes for
        // the FILTER's reason instead of the guard's. A whitespace name is not
        // itself non-chart-shaped (`junk-filter.ts:47` rejects a leading dot
        // and audio/office extensions, not blank), so a whitespace-named PDF
        // is ingested and the empty-name skip at `sync-engine.ts:294`-`:303`
        // is what is measured here.
        const file = makeDriveFile({ id: 'empty-name', name: '   ', mimeType: 'application/pdf' })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        expect(libraryWritesFor('empty-name')).toHaveLength(1) // library_index still mirrored
        expect(songsWritesFor('empty-name')).toHaveLength(0) // songs/* skipped
    })

    // Renamed from 'non-chart MIME types (folder, audio, doc) ARE mirrored — no
    // MIME filter'. v11.5-04-02 added exactly that filter, one layer EARLIER
    // than the mirror this file was written to guard: the drop is at ingestion
    // (`sync-engine.ts:146`-`:148`), so a non-chart artifact now reaches
    // neither library_index nor songs/*. The old title promised the opposite
    // of what the app does, which is worse than a red test — so the name moves
    // with the assertions.
    it('Scenario 5: non-chart MIME types (folder, audio, doc) are DROPPED at ingestion — v11.5-04-02 filter, counted in stats.skippedNonChart', async () => {
        const folder = makeDriveFile({ id: 'folder-1', name: 'CRC Charts', mimeType: 'application/vnd.google-apps.folder' })
        const audio = makeDriveFile({ id: 'audio-1', name: 'recording.mp3', mimeType: 'audio/mpeg' })
        const doc = makeDriveFile({ id: 'doc-1', name: 'liner-notes.docx', mimeType: 'application/vnd.google-apps.document' })
        const pdf = makeDriveFile({ id: 'pdf-1', name: 'Chart.pdf', mimeType: 'application/pdf' })
        mockListAllFiles.mockResolvedValue([folder, audio, doc, pdf])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        const stats = await syncLibraryIndex()

        // Dropped BEFORE either batch — not filtered at the mirror site — so
        // library_index is empty for all three as well. Asserting BOTH
        // collections is what distinguishes 'dropped at ingestion' from
        // 'mirrored but MIME-filtered', which is the change this test now
        // documents.
        for (const id of ['folder-1', 'audio-1', 'doc-1']) {
            expect(songsWritesFor(id)).toHaveLength(0)
            expect(libraryWritesFor(id)).toHaveLength(0)
        }

        // The chart still goes through both, and still carries no status — the
        // mirror contract this file exists for is UNCHANGED, and this is the
        // assertion that stops the inverted test from passing vacuously if the
        // filter ever widened to swallow PDFs too.
        expect(libraryWritesFor('pdf-1')).toHaveLength(1)
        const pdfOps = songsWritesFor('pdf-1')
        expect(pdfOps).toHaveLength(1)
        expect(pdfOps[0].data).not.toHaveProperty('status')

        // `sync-engine.ts:149` — the drop is counted, not silent.
        expect(stats.skippedNonChart).toBe(3)
    })

    it('Scenario 6: library_index batch and songs batch use SEPARATE batch IDs (parallel commits)', async () => {
        const file = makeDriveFile({ id: 'parallel-test', name: 'Test.pdf' })
        mockListAllFiles.mockResolvedValue([file])

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const libOp = libraryWritesFor('parallel-test')[0]
        const songOp = songsWritesFor('parallel-test')[0]
        expect(libOp).toBeDefined()
        expect(songOp).toBeDefined()
        expect(libOp.batchId).not.toBe(songOp.batchId) // separate batches → committed in parallel
    })

    it('contract: NO songs/* write ever carries a status field (cron must not clobber archive state)', async () => {
        const files = [
            makeDriveFile({ id: 'a', name: 'A.pdf' }),
            makeDriveFile({ id: 'b', name: 'B.pdf', mimeType: 'application/vnd.google-apps.shortcut' }),
            makeDriveFile({ id: 'c', name: 'C.mp3', mimeType: 'audio/mpeg' }),
        ]
        mockListAllFiles.mockResolvedValue(files)
        addExistingLibraryDoc('a')

        const { syncLibraryIndex } = await import('@/lib/sync-engine')
        await syncLibraryIndex()

        const allSongsWrites = batchSetOps.filter((op) => op.collection === 'songs')
        expect(allSongsWrites.length).toBeGreaterThan(0)
        for (const op of allSongsWrites) {
            expect(op.data).not.toHaveProperty('status')
        }
    })
})
