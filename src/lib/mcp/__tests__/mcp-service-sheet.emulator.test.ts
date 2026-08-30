// @vitest-environment node
//
// Force the Node environment for this file. The default emulator config uses
// jsdom (other tests need DOM globals), but jsdom installs its own
// Uint8Array global. Node's Buffer extends the Node Uint8Array, so pdf-lib's
// internal `instanceof Uint8Array` check fails inside jsdom and throws
// "pdf must be of type ... but was actually of type NaN" when passed a real
// Buffer. The generate_service_sheet SUT is a pure server-side function — it
// never touches DOM globals — so Node is the right environment. Mirrors
// mcp-gig-packet.emulator.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const saveSpy = vi.fn().mockResolvedValue(undefined)
const signedUrlSpy = vi.fn().mockResolvedValue(["https://signed.example/sheet.pdf"])
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: () => ({ save: saveSpy, getSignedUrl: signedUrlSpy }),
        }),
    }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null) }))

import { generateServiceSheet } from "../tools/service-sheet"
import { createSetlist, addTrackToSetlist } from "../tools/setlist-write"

describe("generate_service_sheet (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-service-sheet" })
        await db().collection("users").doc(ADMIN).set({ displayName: "Rabbi Daniel", role: "admin" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        saveSpy.mockClear()
        signedUrlSpy.mockClear()
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seedService(): Promise<string> {
        const created = await createSetlist(ADMIN, {
            name: "Erev Shabbat — Sept 4",
            eventDate: "2026-09-04",
            rabbi: "Rabbi Daniel",
            book: "crc-friday",
        })
        const setlistId = (created as { setlistId: string }).setlistId
        await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Kabbalat Shabbat",
            type: "header",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Candle Lighting",
            type: "reading",
            performer: "Congregation",
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday" }],
        })
        await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
        return setlistId
    }

    it("returns a signed download url and a real page count", async () => {
        const setlistId = await seedService()
        const res = await generateServiceSheet(ADMIN, { setlistId })
        expect(res).toMatchObject({
            ok: true,
            downloadUrl: "https://signed.example/sheet.pdf",
            trackCount: 3,
        })
        const ok = res as { pageCount: number; sizeBytes: number; storagePath: string }
        expect(ok.pageCount).toBeGreaterThanOrEqual(1)
        expect(ok.sizeBytes).toBeGreaterThan(0)
        expect(ok.storagePath).toContain(setlistId)
        expect(saveSpy).toHaveBeenCalledTimes(1)
    })

    it("saves a real PDF (starts with %PDF)", async () => {
        await generateServiceSheet(ADMIN, { setlistId: await seedService() })
        const buf = saveSpy.mock.calls[0][0] as Buffer
        expect(buf.subarray(0, 4).toString()).toBe("%PDF")
    })

    it("rejects an unknown setlist", async () => {
        const res = await generateServiceSheet(ADMIN, { setlistId: "nope" })
        expect(res).toMatchObject({ ok: false, error: { machine_code: "setlist_not_found" } })
    })

    it("generates for a setlist with no book set", async () => {
        const created = await createSetlist(ADMIN, { name: "Rehearsal", eventDate: "2026-09-05" })
        const setlistId = (created as { setlistId: string }).setlistId
        await addTrackToSetlist(ADMIN, { setlistId, title: "Warmup", type: "note" })
        expect(await generateServiceSheet(ADMIN, { setlistId })).toMatchObject({ ok: true })
    })
})
