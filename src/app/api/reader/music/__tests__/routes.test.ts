// @vitest-environment node

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEH_ANI_PUBLIC_READER_CHART } from "@/lib/reader-music-public"

const mocks = vi.hoisted(() => ({
    authorize: vi.fn(),
    resolvePublic: vi.fn(),
    fetchPublic: vi.fn(),
    setPreference: vi.fn(),
    rateLimit: vi.fn(),
}))

vi.mock("@/lib/reader-music-server", () => ({
    authorizeReaderMusic: mocks.authorize,
    resolvePublicReaderMusic: mocks.resolvePublic,
    fetchPublicResolvedReaderMusic: mocks.fetchPublic,
    setReaderMusicPreference: mocks.setPreference,
}))
vi.mock("@/lib/reader-public-rate-limit", () => ({
    checkPublicReaderRateLimit: mocks.rateLimit,
}))

import {
    GET as getPreference,
    OPTIONS as preferenceOptions,
    PATCH as patchPreference,
} from "@/app/api/reader/music/preference/route"
import {
    OPTIONS as selectOptions,
    POST as selectMusic,
} from "@/app/api/reader/music/select/route"
import { GET as getChart } from "@/app/api/reader/music/chart/route"

const ORIGIN = "https://reader.example"
const UNIT_ID = MODEH_ANI_PUBLIC_READER_CHART.unitId

function request(
    path: string,
    init: RequestInit = {},
    origin = ORIGIN,
): NextRequest {
    const headers = new Headers(init.headers)
    if (origin) headers.set("Origin", origin)
    return new NextRequest(`https://centralreform.live${path}`, {
        method: init.method,
        body: init.body,
        signal: init.signal ?? undefined,
        headers,
    })
}

function privateRequest(path: string, init: RequestInit = {}): NextRequest {
    const headers = new Headers(init.headers)
    headers.set("Authorization", "Bearer firebase-id-token")
    return request(path, { ...init, headers })
}

function selectionRequest(unitId = UNIT_ID): NextRequest {
    return request("/api/reader/music/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId }),
    })
}

describe("anonymous public reader-chart routes", () => {
    beforeEach(() => {
        process.env.READER_MUSIC_ALLOWED_ORIGINS = ORIGIN
        process.env.READER_PUBLIC_CHARTS_ENABLED = "true"
        mocks.resolvePublic.mockReset().mockResolvedValue({ status: "unavailable" })
        mocks.fetchPublic.mockReset().mockResolvedValue(null)
        mocks.rateLimit.mockReset().mockResolvedValue({ allowed: true })
    })

    it("permits only the configured origin and credential-free public headers", async () => {
        const response = await selectOptions(
            request("/api/reader/music/select", { method: "OPTIONS" }),
        )
        expect(response.status).toBe(204)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN)
        expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type")
        expect(response.headers.get("Access-Control-Allow-Headers")).not.toContain("Authorization")
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
        expect(response.headers.get("Vary")).toBe("Origin")
    })

    it("rejects a non-allowlisted origin before resolution", async () => {
        const response = await selectMusic(
            request(
                "/api/reader/music/select",
                {
                    method: "POST",
                    body: JSON.stringify({ unitId: UNIT_ID }),
                },
                "https://evil.example",
            ),
        )
        expect(response.status).toBe(403)
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
    })

    it("returns the exact anonymous minimal availability contract", async () => {
        mocks.resolvePublic.mockResolvedValue({
            status: "available",
            definition: MODEH_ANI_PUBLIC_READER_CHART,
            binding: {
                fileId: "upload-private",
                songId: "song-private",
                setlistId: "setlist-private",
                trackId: "track-private",
            },
        })
        const response = await selectMusic(selectionRequest())
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
            status: "available",
            unitId: UNIT_ID,
            kind: "pdf",
            contentType: "application/pdf",
            chartUrl: `/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`,
        })
        expect(Object.keys(body).sort()).toEqual(
            ["chartUrl", "contentType", "kind", "status", "unitId"].sort(),
        )
        expect(JSON.stringify(body)).not.toMatch(/file|song|setlist|track|storage|token/i)
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        expect(response.headers.get("Vary")).toBe("Origin")
    })

    it("returns one calm shape for an unavailable or held approved unit", async () => {
        const response = await selectMusic(selectionRequest())
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            unitId: UNIT_ID,
        })
        expect(response.headers.get("Cache-Control")).toBe("no-store")
    })

    it("is default-off and performs no chart resolution while off", async () => {
        delete process.env.READER_PUBLIC_CHARTS_ENABLED
        const response = await selectMusic(selectionRequest())
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            unitId: UNIT_ID,
        })
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
    })

    it("does not pass arbitrary stable-looking IDs to Firestore resolution", async () => {
        const response = await selectMusic(
            selectionRequest("amidah.oseh-shalom@legacy-shabbat-morning"),
        )
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            status: "unavailable",
            unitId: "amidah.oseh-shalom@legacy-shabbat-morning",
        })
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
    })

    it("rejects malformed, expanded, and oversized selection bodies", async () => {
        for (const body of [
            "not-json",
            JSON.stringify({ unitId: UNIT_ID, fileId: "private" }),
            JSON.stringify({ unitId: "" }),
            JSON.stringify({ unitId: UNIT_ID, padding: "x".repeat(600) }),
        ]) {
            const response = await selectMusic(
                request("/api/reader/music/select", { method: "POST", body }),
            )
            expect(response.status).toBe(400)
            await expect(response.json()).resolves.toEqual({ status: "unavailable" })
        }
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
    })

    it("rejects file IDs, extra query parameters, and repeated unit IDs", async () => {
        const paths = [
            "/api/reader/music/chart?fileId=upload-private",
            `/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}&fileId=x`,
            `/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}&unitId=x`,
        ]
        for (const path of paths) {
            const response = await getChart(request(path))
            expect(response.status).toBe(404)
            await expect(response.json()).resolves.toEqual({ status: "unavailable" })
        }
        expect(mocks.fetchPublic).not.toHaveBeenCalled()
    })

    it("collapses missing, revoked, held, and unsafe chart results to no-store 404", async () => {
        const response = await getChart(
            request(`/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`),
        )
        expect(response.status).toBe(404)
        await expect(response.json()).resolves.toEqual({ status: "unavailable" })
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        expect(response.headers.get("Vary")).toBe("Origin")
    })

    it("serves only approved bytes with revocation-safe no-store headers", async () => {
        const buffer = Buffer.from("%PDF-1.7 pilot")
        mocks.fetchPublic.mockResolvedValue({
            definition: MODEH_ANI_PUBLIC_READER_CHART,
            buffer,
        })
        const response = await getChart(
            request(`/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`),
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("Content-Type")).toBe("application/pdf")
        expect(response.headers.get("Content-Length")).toBe(String(buffer.byteLength))
        expect(response.headers.get("Content-Disposition")).toBe(
            'inline; filename="chart.pdf"',
        )
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
        expect(response.headers.get("Vary")).toBe("Origin")
        expect(await response.text()).toBe("%PDF-1.7 pilot")
    })

    it("applies dedicated anonymous selection/chart limits and minimizes their response", async () => {
        mocks.rateLimit.mockResolvedValue({
            allowed: false,
            status: 429,
            retryAfterSec: 60,
        })
        const metadata = await selectMusic(selectionRequest())
        expect(metadata.status).toBe(429)
        await expect(metadata.json()).resolves.toEqual({ status: "unavailable" })
        expect(metadata.headers.get("Retry-After")).toBe("60")
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
        expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "selection")

        mocks.rateLimit.mockClear()
        const bytes = await getChart(
            request(`/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`),
        )
        expect(bytes.status).toBe(429)
        await expect(bytes.json()).resolves.toEqual({ status: "unavailable" })
        expect(bytes.headers.get("Retry-After")).toBe("60")
        expect(mocks.fetchPublic).not.toHaveBeenCalled()
        expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "chart")
    })

    it("rejects Authorization and Range before limiting or resolving", async () => {
        for (const headers of [
            { Authorization: "Bearer forged.jwt.value" },
            { Range: "bytes=0-99" },
        ]) {
            const selection = await selectMusic(
                request("/api/reader/music/select", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ unitId: UNIT_ID }),
                }),
            )
            expect(selection.status).toBe(400)

            const chart = await getChart(
                request(
                    `/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`,
                    { headers },
                ),
            )
            expect(chart.status).toBe(400)
        }
        expect(mocks.rateLimit).not.toHaveBeenCalled()
        expect(mocks.resolvePublic).not.toHaveBeenCalled()
        expect(mocks.fetchPublic).not.toHaveBeenCalled()
    })

    it("fails closed when the distributed limiter cannot decide", async () => {
        mocks.rateLimit.mockResolvedValue({ allowed: false, status: 503 })
        const response = await getChart(
            request(`/api/reader/music/chart?unitId=${encodeURIComponent(UNIT_ID)}`),
        )
        expect(response.status).toBe(503)
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        expect(mocks.fetchPublic).not.toHaveBeenCalled()
    })
})

describe("unrelated authenticated reader preference route", () => {
    beforeEach(() => {
        process.env.READER_MUSIC_ALLOWED_ORIGINS = ORIGIN
        mocks.authorize.mockReset().mockResolvedValue({
            ok: true,
            uid: "user-1",
            orgId: "crc",
            readerMusicEnabled: true,
        })
        mocks.setPreference.mockReset()
    })

    it("retains the authenticated preflight contract", async () => {
        const response = await preferenceOptions(
            privateRequest("/api/reader/music/preference", { method: "OPTIONS" }),
        )
        expect(response.status).toBe(204)
        expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization")
        expect(mocks.authorize).not.toHaveBeenCalled()
    })

    it("remains private when the public chart route is anonymous", async () => {
        mocks.authorize.mockResolvedValue({ ok: false, kind: "unauthenticated" })
        const response = await getPreference(
            request("/api/reader/music/preference"),
        )
        expect(response.status).toBe(401)
        expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), false)
    })

    it("still writes only the authenticated user's explicit preference", async () => {
        const response = await patchPreference(
            privateRequest("/api/reader/music/preference", {
                method: "PATCH",
                body: JSON.stringify({ readerMusicEnabled: false }),
            }),
        )
        expect(response.status).toBe(200)
        expect(mocks.setPreference).toHaveBeenCalledWith("user-1", false)
        await expect(response.json()).resolves.toEqual({ readerMusicEnabled: false })
    })
})
