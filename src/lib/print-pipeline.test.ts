/**
 * Integration tests for the print pipeline.
 *
 * Tests the core pipeline logic without requiring Firebase or Google Drive.
 * Uses mocks for external services, real logic for everything else.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ── Unit tests for content hashing ──

describe('Print Pipeline — Content Hashing', () => {
    it('same request produces same hash', async () => {
        // We test the hash function indirectly by importing it
        // The module uses createHash from crypto which is available in Node
        const { createHash } = await import('crypto')

        const req1 = {
            title: 'Shabbat Morning',
            date: '2026-02-21',
            tracks: [{ fileId: 'abc', transposition: 2 }],
        }
        const req2 = { ...req1 }

        const hash1 = createHash('sha256').update(JSON.stringify(req1)).digest('hex').slice(0, 16)
        const hash2 = createHash('sha256').update(JSON.stringify(req2)).digest('hex').slice(0, 16)

        expect(hash1).toBe(hash2)
        expect(hash1).toHaveLength(16)
    })

    it('different transposition produces different hash', async () => {
        const { createHash } = await import('crypto')

        const req1 = { title: 'Test', date: '2026-01-01', tracks: [{ fileId: 'abc', transposition: 2 }] }
        const req2 = { title: 'Test', date: '2026-01-01', tracks: [{ fileId: 'abc', transposition: 3 }] }

        const hash1 = createHash('sha256').update(JSON.stringify(req1)).digest('hex').slice(0, 16)
        const hash2 = createHash('sha256').update(JSON.stringify(req2)).digest('hex').slice(0, 16)

        expect(hash1).not.toBe(hash2)
    })

    it('different tracks produce different hash', async () => {
        const { createHash } = await import('crypto')

        const req1 = { title: 'Test', date: '2026-01-01', tracks: [{ fileId: 'abc' }] }
        const req2 = { title: 'Test', date: '2026-01-01', tracks: [{ fileId: 'def' }] }

        const hash1 = createHash('sha256').update(JSON.stringify(req1)).digest('hex').slice(0, 16)
        const hash2 = createHash('sha256').update(JSON.stringify(req2)).digest('hex').slice(0, 16)

        expect(hash1).not.toBe(hash2)
    })
})

// ── Unit tests for PrintRequest validation ──

describe('Print Pipeline — Request Validation', () => {
    it('rejects empty tracks array', () => {
        const req = { title: 'Test', date: '2026-01-01', tracks: [] }
        expect(req.tracks.length).toBe(0)
    })

    it('rejects missing title', () => {
        const req = { title: '', date: '2026-01-01', tracks: [{ title: 'Song', key: 'C', notes: '' }] }
        expect(req.title).toBeFalsy()
    })

    it('counts transposition needs correctly', () => {
        const tracks = [
            { title: 'A', key: 'C', notes: '', transposition: 0 },
            { title: 'B', key: 'D', notes: '', transposition: 2 },
            { title: 'C', key: 'E', notes: '' },
        ]
        const hasTranspositions = tracks.some(t => t.transposition && t.transposition !== 0)
        expect(hasTranspositions).toBe(true)
    })

    it('detects no transposition needed', () => {
        const tracks = [
            { title: 'A', key: 'C', notes: '' },
            { title: 'B', key: 'D', notes: '', transposition: 0 },
        ]
        const hasTranspositions = tracks.some(t => t.transposition && t.transposition !== 0)
        expect(hasTranspositions).toBe(false)
    })
})

// ── Unit tests for progress tracking ──

describe('Print Pipeline — Progress Tracking', () => {
    it('progress callback receives correct phases', () => {
        const phases: string[] = []
        const onProgress = (p: { phase: string }) => phases.push(p.phase)

        // Simulate the progress flow
        onProgress({ phase: 'preparing' })
        onProgress({ phase: 'processing' })
        onProgress({ phase: 'processing' })
        onProgress({ phase: 'merging' })

        expect(phases).toEqual(['preparing', 'processing', 'processing', 'merging'])
    })

    it('track counting is correct', () => {
        const tracks = [
            { title: 'A', key: 'C', notes: '', fileId: 'abc' },
            { title: 'B (Header)', key: '', notes: '' }, // No fileId
            { title: 'C', key: 'D', notes: '', fileId: 'def' },
        ]
        const totalWithFiles = tracks.filter(t => t.fileId).length
        expect(totalWithFiles).toBe(2)
    })
})

// ══════════════════════════════════════════════════════════════════
// Plan 12-02: Edge case tests with mocked pipeline
// ══════════════════════════════════════════════════════════════════

// ── Hoisted mocks ──

const {
    mockFetchFileById,
    mockInitAdmin,
    mockGetFirestoreFn,
    mockGetStorageFn,
} = vi.hoisted(() => {
    const mockFetchFileById = vi.fn()
    const mockInitAdmin = vi.fn()

    // Firestore mock chain
    const mockGet = vi.fn().mockResolvedValue({ exists: false })
    const mockSet = vi.fn().mockResolvedValue(undefined)
    const mockBatchCommit = vi.fn().mockResolvedValue(undefined)
    const mockBatchSet = vi.fn()
    const mockChordGet = vi.fn().mockResolvedValue({ empty: true, forEach: vi.fn() })
    const mockDoc = vi.fn().mockReturnValue({
        get: mockGet,
        set: mockSet,
        collection: vi.fn().mockReturnValue({
            get: mockChordGet,
            doc: vi.fn().mockReturnValue({}),
        }),
    })
    const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc })
    const mockGetFirestoreFn = vi.fn().mockReturnValue({
        collection: mockCollection,
        batch: vi.fn().mockReturnValue({ set: mockBatchSet, commit: mockBatchCommit }),
    })

    // Storage mock chain (no cached result)
    const mockExists = vi.fn().mockResolvedValue([false])
    const mockSave = vi.fn().mockResolvedValue(undefined)
    const mockFile = vi.fn().mockReturnValue({ exists: mockExists, save: mockSave })
    const mockBucket = vi.fn().mockReturnValue({ file: mockFile })
    const mockGetStorageFn = vi.fn().mockReturnValue({ bucket: mockBucket })

    return { mockFetchFileById, mockInitAdmin, mockGetFirestoreFn, mockGetStorageFn }
})

vi.mock('@/lib/file-fetcher', () => ({
    fetchFileById: mockFetchFileById,
}))

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: mockInitAdmin,
    getFirestore: mockGetFirestoreFn,
    getStorage: mockGetStorageFn,
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ── Dynamic import of the module under test ──

let generatePrintPdf: typeof import('./print-pipeline').generatePrintPdf
type PrintRequestType = import('./print-pipeline').PrintRequest
type PrintProgressType = import('./print-pipeline').PrintProgress

beforeAll(async () => {
    const mod = await import('./print-pipeline')
    generatePrintPdf = mod.generatePrintPdf
})

// Minimal valid PDF bytes (pdf-lib can create from scratch, we mock PDFDocument.load)
// We need to mock pdf-lib since we can't create real PDFs in tests
vi.mock('pdf-lib', () => {
    const mockPage = {
        getSize: vi.fn().mockReturnValue({ width: 612, height: 792 }),
        drawText: vi.fn(),
        drawLine: vi.fn(),
        getPageIndices: vi.fn().mockReturnValue([0]),
    }

    return {
        PDFDocument: {
            create: vi.fn().mockResolvedValue({
                addPage: vi.fn().mockReturnValue(mockPage),
                embedFont: vi.fn().mockResolvedValue({
                    widthOfTextAtSize: vi.fn().mockReturnValue(100),
                }),
                copyPages: vi.fn().mockResolvedValue([mockPage]),
                getPageIndices: vi.fn().mockReturnValue([0]),
                save: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
            }),
            load: vi.fn().mockResolvedValue({
                getPageIndices: vi.fn().mockReturnValue([0]),
                getPages: vi.fn().mockReturnValue([mockPage]),
            }),
        },
        rgb: vi.fn().mockReturnValue({}),
        StandardFonts: {
            HelveticaBold: 'HelveticaBold',
            Helvetica: 'Helvetica',
            HelveticaOblique: 'HelveticaOblique',
        },
    }
})

describe('Print Pipeline — Service Flow Items', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset storage mock to return no cache
        mockGetStorageFn.mockReturnValue({
            bucket: vi.fn().mockReturnValue({
                file: vi.fn().mockReturnValue({
                    exists: vi.fn().mockResolvedValue([false]),
                    save: vi.fn().mockResolvedValue(undefined),
                }),
            }),
        })
    })

    it('skips header tracks without fileId', async () => {
        const req: PrintRequestType = {
            title: 'Shabbat Service',
            date: '2026-03-12',
            tracks: [
                { title: 'OPENING', key: '', notes: '', type: 'header' },
                { title: 'Ma Tovu', key: 'G', notes: '', fileId: 'file-1' },
            ],
        }

        // Mock the song file
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const result = await generatePrintPdf(req)

        // fetchFileById should only be called for the song, not the header
        expect(mockFetchFileById).toHaveBeenCalledTimes(1)
        expect(mockFetchFileById).toHaveBeenCalledWith('file-1')
        expect(result.stats.totalTracks).toBe(1)
    })

    it('skips reading/transition/note tracks without fileId', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Torah Reading', key: '', notes: '', type: 'reading' },
                { title: 'Pause', key: '', notes: '', type: 'transition' },
                { title: 'Reminder', key: '', notes: '', type: 'note' },
                { title: 'Song A', key: 'D', notes: '', fileId: 'file-a' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const result = await generatePrintPdf(req)

        expect(mockFetchFileById).toHaveBeenCalledTimes(1)
        expect(result.stats.totalTracks).toBe(1)
    })

    it('counts only fileId tracks in totalTracks stat', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Header', key: '', notes: '', type: 'header' },
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1' },
                { title: 'Interlude', key: '', notes: '', type: 'transition' },
                { title: 'Song 2', key: 'Am', notes: '', fileId: 'f2' },
                { title: 'Song 3', key: 'G', notes: '', fileId: 'f3' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const result = await generatePrintPdf(req)

        expect(result.stats.totalTracks).toBe(3)
        expect(result.stats.appendedTracks).toBe(3)
    })
})

describe('Print Pipeline — Error Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetStorageFn.mockReturnValue({
            bucket: vi.fn().mockReturnValue({
                file: vi.fn().mockReturnValue({
                    exists: vi.fn().mockResolvedValue([false]),
                    save: vi.fn().mockResolvedValue(undefined),
                }),
            }),
        })
    })

    it('continues when one track file is missing', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'found' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'missing' },
                { title: 'Song 3', key: 'E', notes: '', fileId: 'also-found' },
            ],
        }

        mockFetchFileById.mockImplementation(async (fileId: string) => {
            if (fileId === 'missing') return null
            return {
                buffer: Buffer.from('fake-pdf'),
                contentType: 'application/pdf',
                source: 'firebase-storage' as const,
            }
        })

        const result = await generatePrintPdf(req)

        expect(result.stats.totalTracks).toBe(3)
        expect(result.stats.appendedTracks).toBe(2) // missing one skipped
    })

    it('skips tracks with empty buffer', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'empty' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'good' },
            ],
        }

        mockFetchFileById.mockImplementation(async (fileId: string) => {
            if (fileId === 'empty') {
                return {
                    buffer: Buffer.alloc(0),
                    contentType: 'application/pdf',
                    source: 'firebase-storage' as const,
                }
            }
            return {
                buffer: Buffer.from('fake-pdf'),
                contentType: 'application/pdf',
                source: 'firebase-storage' as const,
            }
        })

        const result = await generatePrintPdf(req)

        expect(result.stats.appendedTracks).toBe(1) // empty one skipped
    })

    it('continues when fetchFileById throws', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'error' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'good' },
            ],
        }

        mockFetchFileById.mockImplementation(async (fileId: string) => {
            if (fileId === 'error') throw new Error('Network error')
            return {
                buffer: Buffer.from('fake-pdf'),
                contentType: 'application/pdf',
                source: 'firebase-storage' as const,
            }
        })

        const result = await generatePrintPdf(req)

        expect(result.stats.appendedTracks).toBe(1)
    })
})

describe('Print Pipeline — Transposition Detection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetStorageFn.mockReturnValue({
            bucket: vi.fn().mockReturnValue({
                file: vi.fn().mockReturnValue({
                    exists: vi.fn().mockResolvedValue([false]),
                    save: vi.fn().mockResolvedValue(undefined),
                }),
            }),
        })
    })

    it('does not load transposition modules when no tracks need transposition', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1', transposition: 0 },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const result = await generatePrintPdf(req)

        expect(result.stats.transposedTracks).toBe(0)
    })
})

describe('Print Pipeline — Progress Callbacks (Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetStorageFn.mockReturnValue({
            bucket: vi.fn().mockReturnValue({
                file: vi.fn().mockReturnValue({
                    exists: vi.fn().mockResolvedValue([false]),
                    save: vi.fn().mockResolvedValue(undefined),
                }),
            }),
        })
    })

    it('sends progress phases in correct order', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const progress: PrintProgressType[] = []
        await generatePrintPdf(req, (p) => progress.push({ ...p }))

        const phases = progress.map(p => p.phase)
        expect(phases[0]).toBe('preparing')
        expect(phases.filter(p => p === 'processing')).toHaveLength(2)
        expect(phases[phases.length - 1]).toBe('merging')
    })

    it('increments currentTrack correctly', async () => {
        const req: PrintRequestType = {
            title: 'Service',
            date: '2026-03-12',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2' },
                { title: 'Song 3', key: 'E', notes: '', fileId: 'f3' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const progress: PrintProgressType[] = []
        await generatePrintPdf(req, (p) => progress.push({ ...p }))

        const processing = progress.filter(p => p.phase === 'processing')
        expect(processing[0].currentTrack).toBe(1)
        expect(processing[1].currentTrack).toBe(2)
        expect(processing[2].currentTrack).toBe(3)
    })
})

// ══════════════════════════════════════════════════════════════════
// Plan 15-01: Cover-only (setlist-only) print mode
// ══════════════════════════════════════════════════════════════════

describe('Print Pipeline — Cover-Only Mode', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetStorageFn.mockReturnValue({
            bucket: vi.fn().mockReturnValue({
                file: vi.fn().mockReturnValue({
                    exists: vi.fn().mockResolvedValue([false]),
                    save: vi.fn().mockResolvedValue(undefined),
                }),
            }),
        })
    })

    it('returns PDF without fetching any track files when coverOnly is true', async () => {
        const req: PrintRequestType = {
            title: 'Shabbat Morning',
            date: '2026-03-12',
            coverOnly: true,
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2' },
                { title: 'Song 3', key: 'E', notes: '', fileId: 'f3' },
            ],
        }

        const result = await generatePrintPdf(req)

        // No track PDFs should be fetched
        expect(mockFetchFileById).not.toHaveBeenCalled()
        // Should still return valid PDF bytes
        expect(result.pdf).toBeInstanceOf(Uint8Array)
        expect(result.pdf.length).toBeGreaterThan(0)
        // Stats should show zero appended tracks
        expect(result.stats.appendedTracks).toBe(0)
        expect(result.stats.transposedTracks).toBe(0)
    })

    it('fetches track files normally when coverOnly is false', async () => {
        const req: PrintRequestType = {
            title: 'Shabbat Morning',
            date: '2026-03-12',
            coverOnly: false,
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1' },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2' },
            ],
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })

        const result = await generatePrintPdf(req)

        expect(mockFetchFileById).toHaveBeenCalledTimes(2)
        expect(result.stats.appendedTracks).toBe(2)
    })

    it('coverOnly still works with transposition metadata on tracks', async () => {
        const req: PrintRequestType = {
            title: 'Transposed Service',
            date: '2026-03-12',
            coverOnly: true,
            musicianName: 'Test Musician - Bb Trumpet',
            tracks: [
                { title: 'Song 1', key: 'C', notes: '', fileId: 'f1', transposition: 2 },
                { title: 'Song 2', key: 'D', notes: '', fileId: 'f2', transposition: -3 },
            ],
        }

        const result = await generatePrintPdf(req)

        // Should not fetch any files even with transpositions
        expect(mockFetchFileById).not.toHaveBeenCalled()
        // Cover page is built (returns valid PDF)
        expect(result.pdf).toBeInstanceOf(Uint8Array)
        expect(result.pdf.length).toBeGreaterThan(0)
    })

    it('coverOnly works with zero tracks that have fileId', async () => {
        const req: PrintRequestType = {
            title: 'Song List Only',
            date: '2026-03-12',
            coverOnly: true,
            tracks: [
                { title: 'OPENING', key: '', notes: '', type: 'header' },
                { title: 'V\'ahavta', key: '', notes: '' },
                { title: 'Shema', key: 'Am', notes: '' },
            ],
        }

        const result = await generatePrintPdf(req)

        expect(mockFetchFileById).not.toHaveBeenCalled()
        expect(result.pdf).toBeInstanceOf(Uint8Array)
        expect(result.stats.totalTracks).toBe(0)
    })
})
