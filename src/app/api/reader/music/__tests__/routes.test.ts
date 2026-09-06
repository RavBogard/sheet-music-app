import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    authorize: vi.fn(),
    resolve: vi.fn(),
    fetchResolved: vi.fn(),
    setPreference: vi.fn(),
}))

vi.mock("@/lib/reader-music-server", () => ({
    authorizeReaderMusic: mocks.authorize,
    resolveReaderMusic: mocks.resolve,
    fetchResolvedReaderMusic: mocks.fetchResolved,
    setReaderMusicPreference: mocks.setPreference,
}))

import { GET as getChart } from "@/app/api/reader/music/chart/route"
import {
    GET as getPreference,
    OPTIONS as preferenceOptions,
    PATCH as patchPreference,
} from "@/app/api/reader/music/preference/route"
import { POST as selectMusic } from "@/app/api/reader/music/select/route"

const ORIGIN = "https://reader.example"

function request(
    path: string,
    init: RequestInit = {},
    origin = ORIGIN,
): Request {
    const headers = new Headers(init.headers)
    headers.set("Origin", origin)
    headers.set("Authorization", "Bearer firebase-id-token")
    return new Request(`https://centralreform.live${path}`, { ...init, headers })
}

describe("reader music API routes", () => {
    beforeEach(() => {
        process.env.READER_MUSIC_ALLOWED_ORIGINS = ORIGIN
        mocks.authorize.mockReset()
        mocks.resolve.mockReset()
        mocks.fetchResolved.mockReset()
        mocks.setPreference.mockReset()
        mocks.authorize.mockResolvedValue({
            ok: true,
            uid: "user-1",
            orgId: "crc",
            readerMusicEnabled: true,
        })
    })

    it("allows exact configured CORS preflight without treating CORS as auth", async () => {
        const response = await preferenceOptions(
            request("/api/reader/music/preference", { method: "OPTIONS" }),
        )
        expect(response.status).toBe(204)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
        expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization")
        expect(mocks.authorize).not.toHaveBeenCalled()
    })

    it("rejects a non-allowlisted origin even with a bearer", async () => {
        const response = await getPreference(
            request("/api/reader/music/preference", {}, "https://evil.example"),
        )
        expect(response.status).toBe(403)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
        expect(mocks.authorize).not.toHaveBeenCalled()
    })

    it("returns 401 before selection for unauthenticated callers", async () => {
        mocks.authorize.mockResolvedValue({ ok: false, kind: "unauthenticated" })
        const response = await selectMusic(
            request("/api/reader/music/select", {
                method: "POST",
                body: JSON.stringify({ unitId: "unit-1" }),
            }),
        )
        expect(response.status).toBe(401)
        expect(mocks.resolve).not.toHaveBeenCalled()
    })

    it("does not resolve or fetch chart bytes before authorization and opt-in", async () => {
        mocks.authorize.mockResolvedValue({ ok: false, kind: "forbidden" })
        const response = await getChart(
            request("/api/reader/music/chart?unitId=unit-1"),
        )
        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toEqual({ status: "unavailable" })
        expect(mocks.fetchResolved).not.toHaveBeenCalled()
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    })

    it("does not allow a preference payload to target another user", async () => {
        const response = await patchPreference(
            request("/api/reader/music/preference", {
                method: "PATCH",
                body: JSON.stringify({
                    readerMusicEnabled: true,
                    uid: "someone-else",
                }),
            }),
        )
        expect(response.status).toBe(400)
        expect(mocks.setPreference).not.toHaveBeenCalled()
    })

    it("mutates the authenticated user's explicit preference", async () => {
        const response = await patchPreference(
            request("/api/reader/music/preference", {
                method: "PATCH",
                body: JSON.stringify({ readerMusicEnabled: false }),
            }),
        )
        expect(response.status).toBe(200)
        expect(mocks.setPreference).toHaveBeenCalledWith("user-1", false)
        await expect(response.json()).resolves.toEqual({ readerMusicEnabled: false })
    })

    it("uses one calm metadata shape for absent, ambiguous, and revoked history", async () => {
        mocks.resolve.mockResolvedValue({ status: "unavailable" })
        const response = await selectMusic(
            request("/api/reader/music/select", {
                method: "POST",
                body: JSON.stringify({ unitId: "unit-secret" }),
            }),
        )
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            unitId: "unit-secret",
        })
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
        expect(response.headers.get("Vary")).toBe("Origin, Authorization")
    })

    it("returns exact selection metadata and an authenticated byte URL", async () => {
        mocks.resolve.mockResolvedValue({
            status: "available",
            pieceId: "piece-1",
            binding: {
                setlistId: "setlist-1",
                trackId: "track-1",
                songId: "song-1",
                fileId: "file-1",
                title: "Mi Chamocha",
                key: "Em",
                arrangement: "Band",
                version: "v3",
                mimeType: "application/pdf",
                lastUsedDate: "2026-09-01",
                lastUsedLabel: "Last used 2026-09-01",
            },
        })
        const response = await selectMusic(
            request("/api/reader/music/select", {
                method: "POST",
                body: JSON.stringify({ unitId: "unit-1" }),
            }),
        )
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({
            status: "available",
            unitId: "unit-1",
            pieceId: "piece-1",
            selection: { fileId: "file-1", key: "Em", arrangement: "Band", version: "v3" },
            chartUrl: "/api/reader/music/chart?unitId=unit-1",
        })
    })

    it("collapses missing/revoked chart records to one 404 with no oracle", async () => {
        mocks.fetchResolved.mockResolvedValue(null)
        const response = await getChart(
            request("/api/reader/music/chart?unitId=anything"),
        )
        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({ status: "unavailable" })
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
        expect(response.headers.get("Vary")).toBe("Origin, Authorization")
    })

    it("serves in-memory Blob-compatible bytes with private no-store headers", async () => {
        mocks.fetchResolved.mockResolvedValue({
            binding: { fileId: "file-1" },
            file: {
                buffer: Buffer.from("%PDF pilot"),
                contentType: "application/pdf",
                source: "firebase-storage",
            },
        })
        const response = await getChart(
            request("/api/reader/music/chart?unitId=unit-1"),
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("Content-Type")).toBe("application/pdf")
        expect(response.headers.get("Cache-Control")).toBe("private, no-store")
        const blob = await response.blob()
        expect(blob.type).toBe("application/pdf")
        expect(await blob.text()).toBe("%PDF pilot")
    })
})
