// @vitest-environment node
/**
 * `GET /api/today` builds `today.json` on request. These run the real builder
 * against an in-memory Firestore and an in-memory bucket, so what is asserted
 * is what a consumer of `/today.json` receives:
 *
 *   - the body is exactly what `buildToday` builds for that tenant, byte for byte
 *   - the headers (CORS `*`, the shared cache posture, JSON) are unchanged
 *   - each tenant gets its own document; the other tenant's never appears
 *   - a failed or hung build is answered from the last good copy, and only
 *     with no copy either is it the 404 both consumers already handle
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

let db: FakeFirestore | { collection: () => unknown }
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
// The congregation config is read through the Admin SDK's own getFirestore.
vi.mock("firebase-admin/firestore", async (importOriginal) => ({
    ...(await importOriginal<typeof import("firebase-admin/firestore")>()),
    getFirestore: () => db,
}))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/org/get-org-config", async () => {
    const { codeOrgConfig } = await import("@/lib/org/config-code")
    return { getOrgConfig: vi.fn(async (orgId: string) => codeOrgConfig(orgId)), orgConfigSource: () => "code" }
})

/** The bucket: path → bytes. */
const bucket = new Map<string, string>()
let saveError: string | null = null
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: (path: string) => ({
                save: async (body: string) => {
                    if (saveError) throw new Error(saveError)
                    bucket.set(path, body)
                },
                exists: async () => [bucket.has(path)],
                download: async () => [Buffer.from(bucket.get(path) ?? "", "utf8")],
            }),
        }),
    }),
}))

import { GET, OPTIONS } from "../route"
import { buildToday } from "@/lib/today/emit-today"
import { TODAY_CACHE_CONTROL } from "@/lib/today/types"

/** Tue 16 Sep 2026, 10:00 America/Chicago. */
const NOW = new Date("2026-09-16T15:00:00.000Z")

function seeded(): FakeFirestore {
    return new FakeFirestore()
        .seed("config", {
            congregation: {
                services: { friday_night: { label: "Erev Shabbat", defaultStartLocal: "18:00" } },
                stream: { url: "https://example.org/live" },
            },
            congregation__brotherslazaroff: {
                services: { gig: { label: "Gig", defaultStartLocal: "20:00" } },
            },
        })
        .seed("setlists", {
            "crc-1": {
                orgId: "crc",
                name: "Shir Shabbat — September 18",
                templateType: "friday_night",
                book: "shabbat-maariv",
                rabbi: "Rabbi Daniel Bogard",
                date: "2026-09-14T12:00:00.000Z",
                eventDate: "2026-09-18T17:00:00.000Z",
                version: 7,
                weekKey: "5787-haazinu",
                weekKeyDay: "2026-09-18",
                parashaName: "Ha'azinu",
            },
            "crc-test": {
                orgId: "crc",
                name: "fixture",
                isTest: true,
                date: "2026-09-14T12:00:00.000Z",
                eventDate: "2026-09-18T17:00:00.000Z",
            },
            "bl-1": {
                orgId: "brotherslazaroff",
                name: "BL gig",
                templateType: "gig",
                date: "2026-09-15T12:00:00.000Z",
                eventDate: "2026-09-19T17:00:00.000Z",
                version: 2,
            },
        })
        .seed("tracks", {
            "crc-1-t0": { setlistId: "crc-1", orgId: "crc", order: 0, title: "Welcome", type: "note" },
            "crc-1-t1": {
                setlistId: "crc-1",
                orgId: "crc",
                order: 1,
                title: "Bar'chu",
                type: "prayer",
                liturgyRef: { book: "shabbat-maariv", folio: 21 },
            },
        })
}

function get(org: string) {
    return GET(new NextRequest("https://x.test/api/today", { headers: { "x-org-id": org } }))
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    db = seeded()
    bucket.clear()
    saveError = null
})
afterEach(() => {
    vi.useRealTimers()
})

describe("GET /api/today — body", () => {
    it("is exactly what the builder builds for the tenant, byte for byte", async () => {
        const res = await get("crc")
        expect(res.status).toBe(200)
        const text = await res.text()
        const built = await buildToday("crc", NOW)
        expect(text).toBe(JSON.stringify(built))
        // The fixture is not vacuous: a full service came through.
        expect(built.services).toEqual([
            expect.objectContaining({
                setlistId: "crc-1",
                eventDate: "2026-09-18",
                startsAt: "2026-09-18T23:00:00.000Z",
                startFolio: 21,
                book: "shabbat-maariv",
                version: 7,
                weekKey: "5787-haazinu",
                stream: { url: "https://example.org/live", startsAt: "2026-09-18T22:55:00.000Z" },
            }),
        ])
        expect(JSON.parse(text).generatedAt).toBe(NOW.toISOString())
    })

    it("keeps the build as the tenant's last good copy", async () => {
        await get("crc")
        expect([...bucket.keys()]).toEqual(["public/today/crc.json"])
        expect(JSON.parse(bucket.get("public/today/crc.json")!)).toEqual(await buildToday("crc", NOW))
    })

    it("answers even when the last good copy cannot be written", async () => {
        saveError = "bucket unavailable"
        const res = await get("crc")
        expect(res.status).toBe(200)
        expect((await res.json()).services.map((s: { setlistId: string }) => s.setlistId)).toEqual(["crc-1"])
    })
})

describe("GET /api/today — headers", () => {
    it("carries CORS *, the shared cache posture and a JSON content type", async () => {
        const res = await get("crc")
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
        expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS")
        expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type")
        expect(res.headers.get("cache-control")).toBe(TODAY_CACHE_CONTROL)
        expect(res.headers.get("cache-control")).toContain("s-maxage=60")
        expect(res.headers.get("cache-control")).toContain("stale-if-error=")
        expect(res.headers.get("content-type")).toContain("application/json")
    })

    it("answers the CORS preflight", async () => {
        const res = await OPTIONS()
        expect(res.status).toBe(204)
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
    })
})

describe("GET /api/today — tenants", () => {
    it("gives each tenant its own document and never the other's", async () => {
        const crc = await (await get("crc")).json()
        const bl = await (await get("brotherslazaroff")).json()
        expect(crc.services.map((s: { setlistId: string }) => s.setlistId)).toEqual(["crc-1"])
        expect(bl.services.map((s: { setlistId: string }) => s.setlistId)).toEqual(["bl-1"])
        expect(JSON.stringify(crc)).not.toContain("bl-1")
        expect(JSON.stringify(bl)).not.toContain("crc-1")
        // BL gains no family keys, and its start time is its own config's.
        expect(bl.services[0]).not.toHaveProperty("weekKey")
        expect(bl.services[0].startsAt).toBe("2026-09-20T01:00:00.000Z")
        expect(bl.services[0]).not.toHaveProperty("stream")
        // And the stored copies are kept apart.
        expect(bucket.get("public/today/crc.json")).not.toContain("bl-1")
        expect(bucket.get("public/today/brotherslazaroff.json")).not.toContain("crc-1")
    })

    it("a failed build falls back to the tenant's OWN last good copy, never another's", async () => {
        await get("crc")
        db = { collection: () => { throw new Error("firestore unavailable") } }
        const res = await get("brotherslazaroff")
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: "not_found" })
    })
})

describe("GET /api/today — failure", () => {
    it("serves the last good copy when the build throws", async () => {
        await get("crc")
        const lastGood = bucket.get("public/today/crc.json")!
        vi.setSystemTime(new Date(NOW.getTime() + 60 * 60_000))
        db = { collection: () => { throw new Error("firestore unavailable") } }

        const res = await get("crc")
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(lastGood)
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
        expect(res.headers.get("cache-control")).toBe(TODAY_CACHE_CONTROL)
    })

    it("answers 404 not_found, uncached, when the build throws and there is no copy", async () => {
        db = { collection: () => { throw new Error("firestore unavailable") } }
        const res = await get("crc")
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: "not_found" })
        expect(res.headers.get("cache-control")).toBe("no-store")
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
    })

    it("serves the last good copy when the build hangs", async () => {
        await get("crc")
        const lastGood = bucket.get("public/today/crc.json")!
        vi.useRealTimers()
        vi.useFakeTimers()
        const hang = { where: () => hang, orderBy: () => hang, limit: () => hang, doc: () => hang, get: () => new Promise(() => {}) }
        db = { collection: () => hang }

        const pending = get("crc")
        await vi.advanceTimersByTimeAsync(8_000)
        const res = await pending
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(lastGood)
    })
})
