// @vitest-environment node
//
// `buildToday` / `emitToday` are pure server code — Firestore reads and one
// Storage write, no DOM. Node is the right environment, and jsdom's own
// Uint8Array would only get in the way of the Buffer the Storage stub sees.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

/**
 * Storage is NOT part of the Firebase emulator suite this repo runs
 * (`firestore,auth`), so the one object write is stubbed and inspected. The
 * bytes it receives are the real emitted document, which is the part worth
 * asserting; what a bucket does with them is Google's business.
 */
const saved: Array<{ body: string; options: Record<string, unknown> }> = []
let stored: string | null = null
/** Flipped by the failure test — the stub's save() throws while it is set. */
let saveError: string | null = null
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: () => ({
                save: async (body: string, options: Record<string, unknown>) => {
                    if (saveError) throw new Error(saveError)
                    saved.push({ body, options })
                    stored = body
                },
                exists: async () => [stored !== null],
                download: async () => [Buffer.from(stored ?? "", "utf8")],
            }),
        }),
    }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null) }))

import { buildToday, emitToday, readStoredToday } from "../emit-today"
import { TODAY_CACHE_CONTROL } from "../types"

describe("today.json (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)

    /** Tue 16 Sep 2026, 10:00 America/Chicago. */
    const NOW = new Date("2026-09-16T15:00:00.000Z")

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-today-json" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        saved.length = 0
        stored = null
        saveError = null
        for (const col of ["setlists", "tracks", "config"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seedConfig() {
        await db()
            .collection("config")
            .doc("congregation")
            .set({
                name: "Central Reform Congregation",
                services: {
                    friday_night: { label: "Erev Shabbat", defaultStartLocal: "18:00" },
                },
                stream: { url: "https://example.org/live" },
            })
    }

    async function seedSetlist(
        id: string,
        over: Record<string, unknown> = {},
    ): Promise<string> {
        await db()
            .collection("setlists")
            .doc(id)
            .set({
                id,
                orgId: "crc",
                name: "Shir Shabbat — September 18",
                templateType: "friday_night",
                book: "shabbat-maariv",
                rabbi: "Rabbi Daniel Bogard",
                date: Timestamp.fromDate(new Date("2026-09-14T12:00:00.000Z")),
                eventDate: Timestamp.fromDate(new Date("2026-09-18T17:00:00.000Z")),
                publishedAt: Timestamp.fromDate(new Date("2026-09-15T15:12:00.000Z")),
                version: 7,
                trackCount: 2,
                ...over,
            })
        return id
    }

    async function seedTracks(setlistId: string) {
        // Row 0 carries no page; row 1 does. `startFolio` must be the first
        // page IN TRACK ORDER, not the first row that happens to come back.
        await db().collection("tracks").doc(`${setlistId}-t0`).set({
            id: `${setlistId}-t0`,
            setlistId,
            orgId: "crc",
            order: 0,
            title: "Welcome",
            type: "note",
        })
        await db().collection("tracks").doc(`${setlistId}-t1`).set({
            id: `${setlistId}-t1`,
            setlistId,
            orgId: "crc",
            order: 1,
            title: "Bar'chu",
            type: "prayer",
            liturgyRef: { book: "shabbat-maariv", unitId: "shma.barchu@shabbat-maariv", folio: 21 },
        })
        await db().collection("tracks").doc(`${setlistId}-t2`).set({
            id: `${setlistId}-t2`,
            setlistId,
            orgId: "crc",
            order: 2,
            title: "Mi Chamocha",
            type: "prayer",
            liturgyRef: { book: "shabbat-maariv", folio: 28 },
        })
    }

    it("a published setlist reaches today.json with its book, folio and start time", async () => {
        await seedConfig()
        const id = await seedSetlist("published-1")
        await seedTracks(id)

        const doc = await buildToday("crc", NOW)
        expect(doc.schemaVersion).toBe(1)
        expect(doc.services).toHaveLength(1)
        const s = doc.services[0]
        expect(s.setlistId).toBe(id)
        expect(s.book).toBe("shabbat-maariv")
        expect(s.startFolio).toBe(21)
        expect(s.eventDate).toBe("2026-09-18")
        expect(s.startsAt).toBe("2026-09-18T23:00:00.000Z")
        expect(s.stream).toEqual({
            url: "https://example.org/live",
            startsAt: "2026-09-18T22:55:00.000Z",
        })
        expect(s.rabbi).toBe("Rabbi Daniel Bogard")
        expect(s.version).toBe(7)
    })

    it("an UNPUBLISHED setlist never appears", async () => {
        await seedConfig()
        const id = await seedSetlist("draft-1", { publishedAt: null })
        await seedTracks(id)

        const doc = await buildToday("crc", NOW)
        expect(doc.services).toEqual([])
    })

    it("a deleted setlist is gone on the next build", async () => {
        await seedConfig()
        const id = await seedSetlist("published-2")
        await seedTracks(id)
        expect((await buildToday("crc", NOW)).services).toHaveLength(1)

        await db().collection("setlists").doc(id).delete()
        expect((await buildToday("crc", NOW)).services).toEqual([])
    })

    it("another tenant's published setlist never lands in crc's file", async () => {
        await seedConfig()
        await seedSetlist("bl-1", { orgId: "brotherslazaroff", name: "BL gig" })

        const doc = await buildToday("crc", NOW)
        expect(doc.services).toEqual([])
    })

    it("emitToday writes the document with the agreed cache posture", async () => {
        await seedConfig()
        const id = await seedSetlist("published-3")
        await seedTracks(id)

        const res = await emitToday("crc", NOW)
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.path).toBe("public/today/crc.json")
        expect(res.serviceCount).toBe(1)

        expect(saved).toHaveLength(1)
        expect(saved[0].options.contentType).toBe("application/json")
        expect(
            (saved[0].options.metadata as Record<string, unknown>).cacheControl,
        ).toBe(TODAY_CACHE_CONTROL)

        const parsed = JSON.parse(saved[0].body)
        expect(parsed.services[0].setlistId).toBe(id)
    })

    it("readStoredToday returns null before anything is emitted", async () => {
        expect(await readStoredToday("crc")).toBeNull()
    })

    it("readStoredToday round-trips what emitToday wrote", async () => {
        await seedConfig()
        await seedSetlist("published-4")
        await emitToday("crc", NOW)

        const doc = await readStoredToday("crc")
        expect(doc?.services[0].setlistId).toBe("published-4")
    })

    it("emitToday never throws — a Storage failure is reported, not raised", async () => {
        // The whole contract of this call site: publish must not fail because
        // today.json could not be written. A missing today.json costs the
        // reader a calendar hint; a failed publish costs a service.
        await seedConfig()
        await seedSetlist("published-5")
        saveError = "bucket unavailable"

        const res = await emitToday("crc", NOW)
        expect(res.ok).toBe(false)
        if (res.ok) return
        expect(res.error).toContain("bucket unavailable")
    })
})
