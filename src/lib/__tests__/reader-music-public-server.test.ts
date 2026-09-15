import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEH_ANI_PUBLIC_READER_CHART } from "@/lib/reader-music-public"

const state = vi.hoisted(() => {
    const crosswalkGet = vi.fn()
    const setlistsGet = vi.fn()
    const getAll = vi.fn()
    return {
        adminReady: true,
        crosswalkGet,
        setlistsGet,
        getAll,
        tracks: vi.fn(),
        downloadExact: vi.fn(),
        db: {
            collection: (name: string) => ({
                doc: (id: string) => ({ name, id, get: crosswalkGet }),
                where: vi.fn(() => ({ get: setlistsGet })),
            }),
            getAll,
        },
    }
})

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => state.adminReady,
}))
vi.mock("firebase-admin/firestore", () => ({
    getFirestore: () => state.db,
}))
vi.mock("firebase-admin/auth", () => ({
    getAuth: vi.fn(),
}))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: state.tracks,
}))
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(),
}))
vi.mock("@/lib/firebase-storage", () => ({
    downloadExactStorageGeneration: state.downloadExact,
}))

import {
    fetchPublicResolvedReaderMusic,
    resolvePublicReaderMusic,
} from "@/lib/reader-music-server"

const definition = MODEH_ANI_PUBLIC_READER_CHART
const now = Date.parse("2026-09-06T12:00:00Z")
const PILOT_BYTES = Buffer.from("%PDF-1.7 pilot")
const manifest = {
    version: 1 as const,
    songId: "song-private",
    fileId: "file-private",
    storagePath: "library/file-private.pdf",
    generation: "1725550000000000",
    sha256: createHash("sha256").update(PILOT_BYTES).digest("hex"),
    sizeBytes: PILOT_BYTES.byteLength,
    contentType: "application/pdf" as const,
}

function songSnapshot() {
    return { exists: true, data: () => ({ status: "active", orgId: "crc" }) }
}

function librarySnapshot() {
    return {
        exists: true,
        data: () => ({
            status: "active",
            orgId: "crc",
            mimeType: manifest.contentType,
            fileSize: manifest.sizeBytes,
            contentHash: {
                alg: "sha256",
                value: manifest.sha256,
                sizeBytes: manifest.sizeBytes,
            },
        }),
    }
}

describe("public reader chart server boundary", () => {
    beforeEach(() => {
        process.env.READER_PUBLIC_CHARTS_ENABLED = "true"
        state.adminReady = true
        state.crosswalkGet.mockReset().mockResolvedValue({
            exists: true,
            data: () => ({
                status: "reviewed",
                publicReaderStatus: "approved",
                orgId: definition.orgId,
                momentId: definition.unitId,
                pieceId: definition.pieceId,
                publicReaderManifest: manifest,
            }),
        })
        state.setlistsGet.mockReset().mockResolvedValue({
            docs: [
                {
                    id: "setlist-private",
                    data: () => ({
                        orgId: "crc",
                        eventDate: "2026-09-05T14:00:00Z",
                        isTest: false,
                        isTemplate: false,
                    }),
                },
            ],
        })
        state.getAll.mockReset().mockResolvedValue([
            songSnapshot(),
            librarySnapshot(),
        ])
        state.tracks.mockReset().mockResolvedValue([
            {
                id: "track-private",
                setlistId: "setlist-private",
                orgId: "crc",
                order: 0,
                songId: "song-private",
                fileId: "file-private",
                title: "Modah Ani Halpert",
                key: "G#m",
                mimeType: "application/pdf",
                readerMusic: {
                    momentId: definition.unitId,
                    pieceId: definition.pieceId,
                },
            },
        ])
        state.downloadExact.mockReset().mockResolvedValue({
            success: true,
            data: {
                buffer: PILOT_BYTES,
                contentType: "application/pdf",
                generation: manifest.generation,
                sizeBytes: manifest.sizeBytes,
            },
        })
    })

    it("resolves the approved newest exact binding without an account", async () => {
        const resolved = await resolvePublicReaderMusic(definition.unitId, now)
        expect(resolved).toMatchObject({
            status: "available",
            definition,
            binding: {
                setlistId: "setlist-private",
                trackId: "track-private",
                fileId: "file-private",
            },
            manifest,
        })
        expect(state.crosswalkGet).toHaveBeenCalledTimes(1)
        expect(state.setlistsGet).toHaveBeenCalledTimes(1)
    })

    it("never queries Firestore for arbitrary IDs or the held Oseh row", async () => {
        for (const unitId of [
            "upload-arbitrary-file-id",
            "amidah.oseh-shalom@legacy-shabbat-morning",
        ]) {
            await expect(resolvePublicReaderMusic(unitId, now)).resolves.toEqual({
                status: "unavailable",
            })
        }
        expect(state.crosswalkGet).not.toHaveBeenCalled()
        expect(state.setlistsGet).not.toHaveBeenCalled()
    })

    it("stops before setlist lookup when the public approval is absent or held", async () => {
        for (const publicReaderStatus of [undefined, "held", "revoked"]) {
            state.crosswalkGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    status: "reviewed",
                    publicReaderStatus,
                    orgId: definition.orgId,
                        momentId: definition.unitId,
                        pieceId: definition.pieceId,
                        publicReaderManifest: manifest,
                }),
            })
            await expect(
                resolvePublicReaderMusic(definition.unitId, now),
            ).resolves.toEqual({ status: "unavailable" })
        }
        expect(state.setlistsGet).not.toHaveBeenCalled()
    })

    it("fails closed when Firebase Admin is unavailable", async () => {
        state.adminReady = false
        await expect(
            resolvePublicReaderMusic(definition.unitId, now),
        ).resolves.toEqual({ status: "unavailable" })
        expect(state.crosswalkGet).not.toHaveBeenCalled()
    })

    it("fetches only the internally resolved binding and validates returned bytes", async () => {
        const result = await fetchPublicResolvedReaderMusic(definition.unitId)
        expect(result).toEqual({
            definition,
            buffer: PILOT_BYTES,
        })
        expect(state.downloadExact).toHaveBeenCalledWith({
            path: manifest.storagePath,
            generation: manifest.generation,
            contentType: manifest.contentType,
            expectedSizeBytes: manifest.sizeBytes,
            maxBytes: 4 * 1024 * 1024,
        })

        state.downloadExact.mockResolvedValueOnce({
            success: true,
            data: {
                buffer: Buffer.from("<html>wrong bytes</html>"),
                contentType: "application/pdf",
                generation: manifest.generation,
                sizeBytes: manifest.sizeBytes,
            },
        })
        await expect(
            fetchPublicResolvedReaderMusic(definition.unitId),
        ).resolves.toBeNull()

        state.downloadExact.mockResolvedValueOnce({
            success: true,
            data: {
                buffer: PILOT_BYTES,
                contentType: "text/html",
                generation: manifest.generation,
                sizeBytes: manifest.sizeBytes,
            },
        })
        await expect(
            fetchPublicResolvedReaderMusic(definition.unitId),
        ).resolves.toBeNull()
    })

    it("fails closed for catalog drift and exact-generation drift", async () => {
        state.getAll.mockResolvedValueOnce([
            songSnapshot(),
            {
                ...librarySnapshot(),
                data: () => ({
                    ...librarySnapshot().data(),
                    contentHash: {
                        alg: "sha256",
                        value: "f".repeat(64),
                        sizeBytes: manifest.sizeBytes,
                    },
                }),
            },
        ])
        await expect(resolvePublicReaderMusic(definition.unitId, now)).resolves.toEqual({
            status: "unavailable",
        })

        state.downloadExact.mockResolvedValueOnce({
            success: true,
            data: {
                buffer: PILOT_BYTES,
                contentType: manifest.contentType,
                generation: "1725550000000001",
                sizeBytes: manifest.sizeBytes,
            },
        })
        await expect(fetchPublicResolvedReaderMusic(definition.unitId)).resolves.toBeNull()
    })

    it("rechecks approval after fetch so a concurrent revocation serves no bytes", async () => {
        state.crosswalkGet
            .mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    status: "reviewed",
                    publicReaderStatus: "approved",
                    orgId: definition.orgId,
                    momentId: definition.unitId,
                    pieceId: definition.pieceId,
                    publicReaderManifest: manifest,
                }),
            })
            .mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    status: "reviewed",
                    publicReaderStatus: "revoked",
                    orgId: definition.orgId,
                    momentId: definition.unitId,
                    pieceId: definition.pieceId,
                    publicReaderManifest: manifest,
                }),
            })
        await expect(fetchPublicResolvedReaderMusic(definition.unitId)).resolves.toBeNull()
        expect(state.downloadExact).toHaveBeenCalledTimes(1)
    })
})
