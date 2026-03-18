import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

const mockSet = vi.fn()
const mockGet = vi.fn()
const mockUserDocGet = vi.fn()

const makeChainable = () => {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        select: vi.fn(() => chain),
        get: vi.fn(async () => ({ docs: [], empty: true })),
        doc: vi.fn((id: string) => ({
            get: id === 'test-user' ? mockUserDocGet : vi.fn(async () => ({ exists: false })),
            set: mockSet,
        })),
    }
    return chain
}

const mockFirestore = {
    collection: vi.fn(() => makeChainable()),
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
vi.mock('@/lib/firebase-storage', () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
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
        isAdmin: true,
        isBandLeader: true,
        isMusician: true,
    } as never)
}

function createUploadRequest(fileName: string, fileContent = 'file-content', mimeType = 'application/octet-stream') {
    const blob = new Blob([fileContent], { type: mimeType })
    const file = new File([blob], fileName, { type: mimeType })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', fileName.replace(/\.[^/.]+$/, ''))

    return new NextRequest('http://localhost/api/library/upload', {
        method: 'POST',
        body: formData,
        headers: { Authorization: 'Bearer test-token' },
    })
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

        // Find the original upload call (contains 'originals' path or octet-stream mime)
        const originalCall = mockUploadToStorage.mock.calls.find(
            (call: unknown[]) => String(call[0]).includes('original') || call[2] === 'application/octet-stream'
        )
        expect(originalCall).toBeTruthy()
        expect(originalCall![2]).toBe('application/octet-stream')
    })

    it('stores original .mscx file at library/originals/{fileId}.mscx', async () => {
        const req = createUploadRequest('test-song.mscx')
        await POST(req)

        expect(mockUploadToStorage).toHaveBeenCalledTimes(2)

        const originalCall = mockUploadToStorage.mock.calls.find(
            (call: unknown[]) => String(call[0]).includes('original') || call[2] === 'application/octet-stream'
        )
        expect(originalCall).toBeTruthy()
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

    it('still rejects unsupported file types (.doc, .txt)', async () => {
        const reqDoc = createUploadRequest('file.doc')
        const resDoc = await POST(reqDoc)
        expect(resDoc.status).toBe(400)

        const reqTxt = createUploadRequest('file.txt')
        const resTxt = await POST(reqTxt)
        expect(resTxt.status).toBe(400)
    })

    it('library index entry has mimeType application/xml and originalStorageUrl for MuseScore uploads', async () => {
        const req = createUploadRequest('test-song.mscz')
        await POST(req)

        expect(mockSet).toHaveBeenCalledTimes(1)
        const indexEntry = mockSet.mock.calls[0][0]
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
