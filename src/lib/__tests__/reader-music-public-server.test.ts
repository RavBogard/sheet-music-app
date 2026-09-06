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
        downloadStorage: vi.fn(),
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
    downloadFromStorage: state.downloadStorage,
}))

import {
    fetchPublicResolvedReaderMusic,
    resolvePublicReaderMusic,
} from "@/lib/reader-music-server"

const definition = MODEH_ANI_PUBLIC_READER_CHART
const now = Date.parse("2026-09-06T12:00:00Z")

function activeSnapshot() {
    return { exists: true, data: () => ({ status: "active", orgId: "crc" }) }
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
            activeSnapshot(),
            activeSnapshot(),
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
        state.downloadStorage.mockReset().mockResolvedValue({
            success: true,
            data: {
                buffer: Buffer.from("%PDF-1.7 pilot"),
                contentType: "application/pdf",
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
            buffer: Buffer.from("%PDF-1.7 pilot"),
        })
        expect(state.downloadStorage).toHaveBeenCalledWith(
            "file-private",
            "application/pdf",
        )

        state.downloadStorage.mockResolvedValueOnce({
            success: true,
            data: {
                buffer: Buffer.from("<html>wrong bytes</html>"),
                contentType: "application/pdf",
            },
        })
        await expect(
            fetchPublicResolvedReaderMusic(definition.unitId),
        ).resolves.toBeNull()

        state.downloadStorage.mockResolvedValueOnce({
            success: true,
            data: {
                buffer: Buffer.from("%PDF-1.7 mislabeled"),
                contentType: "text/html",
            },
        })
        await expect(
            fetchPublicResolvedReaderMusic(definition.unitId),
        ).resolves.toBeNull()
    })
})
