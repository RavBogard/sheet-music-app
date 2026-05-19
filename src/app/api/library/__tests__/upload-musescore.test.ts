import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

const mockSet = vi.fn()
const mockUserDocGet = vi.fn()

// Firestore writes go through a db.batch() (atomic-guard refactor 2026-05-15,
// [[feedback_upload_atomicity]]): library_index + songs are batch.set; the
// library_signals broadcast is the only direct doc().set() (→ mockSet).
const mockBatchSet = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchCommit = vi.fn().mockResolvedValue(undefined)

const makeChainable = () => {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        select: vi.fn(() => chain),
        get: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
        doc: vi.fn((id: string) => ({
            get: id === 'test-user' ? mockUserDocGet : vi.fn(async () => ({ exists: false })),
            set: mockSet,
        })),
    }
    return chain
}

const mockFirestore = {
    collection: vi.fn(() => makeChainable()),
    batch: vi.fn(() => ({
        set: mockBatchSet,
        update: mockBatchUpdate,
        commit: mockBatchCommit,
    })),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
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

const mockUploadToStorage = vi.fn().mockResolvedValue('gs://bucket/path')
const mockDeleteStorageObjectAtPath = vi.fn().mockResolvedValue(undefined)
// Atomic-guard read-verify ([[feedback_upload_atomicity]]): processChartUpload
// re-reads the just-written blob's size and aborts (500) unless it matches the
// uploaded buffer. Echo the byte length of the main (non-"originals/") upload.
const mockGetStorageObjectSize = vi.fn(() => {
    const mainCall = [...mockUploadToStorage.mock.calls]
        .reverse()
        .find((c) => !String(c[0]).startsWith('originals/'))
    const buf = mainCall?.[1] as Buffer | undefined
    return buf ? buf.byteLength : 0
})
vi.mock('@/lib/firebase-storage', () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
    getStorageObjectSize: (...args: unknown[]) => mockGetStorageObjectSize(...args),
    deleteStorageObjectAtPath: (...args: unknown[]) => mockDeleteStorageObjectAtPath(...args),
}))

const mockProcessMuseScoreFile = vi.fn().mockResolvedValue({
    musicXml: '<score-partwise><part-list/></score-partwise>',
    originalContent: Buffer.from('original-mscz-content'),
})
vi.mock('@/lib/musescore-converter', () => ({
    processMuseScoreFile: (...args: unknown[]) => mockProcessMuseScoreFile(...args),
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'
import { POST } from '../upload/route'
import { NextRequest } from 'next/server'

function mockAuth() {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'test-user',
        email: 'user@test.com',
        role: 'admin',
    } as never)
}

/**
 * Create a mock File-like object that works in Node test environment.
 * Node's File constructor sometimes doesn't provide arrayBuffer().
 */
function createMockFile(name: string, content = 'file-content', type = 'application/octet-stream') {
    const buffer = Buffer.from(content)
    return {
        name,
        type,
        size: buffer.length,
        arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
    }
}

/**
 * Map a filename to the MIME a real uploader (in-app UploadDialog / MCP)
 * would send. processChartUpload's G-7 guard rejects 'application/octet-stream'
 * outright — a real, specific mimeType is required — so MuseScore uploads
 * must carry their registered type. Unknown extensions intentionally fall
 * back to octet-stream so the "rejects .doc/.exe" case still 400s.
 */
function mimeForFileName(name: string): string {
    if (/\.mscz$/i.test(name)) return 'application/x-musescore'
    if (/\.mscx$/i.test(name)) return 'application/x-musescore+xml'
    return 'application/octet-stream'
}

/**
 * Create a NextRequest with a properly mocked formData() method.
 */
function createUploadRequest(fileName: string, fileContent = 'file-content', mimeType = mimeForFileName(fileName)) {
    const mockFile = createMockFile(fileName, fileContent, mimeType)

    const formEntries = new Map<string, unknown>()
    formEntries.set('file', mockFile)
    formEntries.set('title', fileName.replace(/\.[^/.]+$/, ''))

    const mockFormData = {
        get: (key: string) => formEntries.get(key) ?? null,
        getAll: (key: string) => {
            const v = formEntries.get(key)
            return v ? [v] : []
        },
        has: (key: string) => formEntries.has(key),
    }

    const req = new NextRequest('http://localhost/api/library/upload', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'multipart/form-data',
        },
    })

    // Override formData() to return our mock
    vi.spyOn(req, 'formData').mockResolvedValue(mockFormData as unknown as FormData)

    return req
}

beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ canUpload: true }) })
})

describe('Upload route - MuseScore files', () => {
    it('accepts .mscz file and calls processMuseScoreFile', async () => {
        const req = createUploadRequest('test-song.mscz')
        const res = await POST(req)
        const data = await res.json()

        expect(res.status).toBe(201)
        expect(data.success).toBe(true)
        expect(mockProcessMuseScoreFile).toHaveBeenCalledWith(
            expect.any(Buffer),
            'mscz'
        )
    })

    it('accepts .mscx file and calls processMuseScoreFile', async () => {
        const req = createUploadRequest('test-song.mscx')
        const res = await POST(req)
        const data = await res.json()

        expect(res.status).toBe(201)
        expect(data.success).toBe(true)
        expect(mockProcessMuseScoreFile).toHaveBeenCalledWith(
            expect.any(Buffer),
            'mscx'
        )
    })

    it('stores original .mscz file at library/originals/{fileId}.mscz', async () => {
        const req = createUploadRequest('test-song.mscz')
        await POST(req)

        // Should have two uploadToStorage calls: one for original, one for converted
        expect(mockUploadToStorage).toHaveBeenCalledTimes(2)

        // Find the original upload call (contains 'originals' in the path)
        const originalCall = mockUploadToStorage.mock.calls.find(
            (call: unknown[]) => String(call[0]).includes('original')
        )
        expect(originalCall).toBeTruthy()
        expect(originalCall![2]).toBe('application/octet-stream')
        expect(String(originalCall![0])).toMatch(/\.mscz$/)
    })

    it('stores original .mscx file at library/originals/{fileId}.mscx', async () => {
        const req = createUploadRequest('test-song.mscx')
        await POST(req)

        expect(mockUploadToStorage).toHaveBeenCalledTimes(2)

        const originalCall = mockUploadToStorage.mock.calls.find(
            (call: unknown[]) => String(call[0]).includes('original')
        )
        expect(originalCall).toBeTruthy()
        expect(String(originalCall![0])).toMatch(/\.mscx$/)
    })

    it('stores converted MusicXML with application/xml mimeType', async () => {
        const req = createUploadRequest('test-song.mscz')
        await POST(req)

        // The main upload should be application/xml (converted MusicXML)
        const xmlCall = mockUploadToStorage.mock.calls.find(
            (call: unknown[]) => call[2] === 'application/xml'
        )
        expect(xmlCall).toBeTruthy()
    })

    it('still rejects unsupported file types (.doc, .exe)', async () => {
        const reqDoc = createUploadRequest('file.doc')
        const resDoc = await POST(reqDoc)
        expect(resDoc.status).toBe(400)

        const reqExe = createUploadRequest('file.exe')
        const resExe = await POST(reqExe)
        expect(resExe.status).toBe(400)
    })

    it('library index entry has mimeType application/xml and originalStorageUrl for MuseScore uploads', async () => {
        const req = createUploadRequest('test-song.mscz')
        await POST(req)

        // The library_index row is the FIRST batch.set (ref, indexEntry).
        expect(mockBatchSet).toHaveBeenCalled()
        const indexEntry = mockBatchSet.mock.calls[0][1]
        expect(indexEntry.mimeType).toBe('application/xml')
        expect(indexEntry.originalStorageUrl).toMatch(/library\/originals\/.*\.mscz/)
        expect(indexEntry.sourceFormat).toBe('mscz')
    })

    it('returns 422 if MuseScore conversion fails', async () => {
        mockProcessMuseScoreFile.mockRejectedValueOnce(new Error('XSLT conversion failed'))

        const req = createUploadRequest('broken.mscz')
        const res = await POST(req)
        const data = await res.json()

        expect(res.status).toBe(422)
        expect(data.error).toContain('Failed to convert MuseScore file')
    })
})
