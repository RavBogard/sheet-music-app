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
import { inflateSync } from "node:zlib"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * Decode every `<hex> Tj` glyph run out of the saved PDF's content streams.
 * A page-count assertion cannot see a MISSING header line — the document stays
 * structurally valid — so the date test has to read the drawn text itself.
 * Same decode shape as src/lib/pdf/__tests__/service-sheet-pdf.test.ts.
 */
function drawnText(bytes: Buffer): string {
    const out: string[] = []
    let i = 0
    while (i < bytes.length) {
        const s = bytes.indexOf("stream", i)
        if (s === -1) break
        if (s >= 3 && bytes.subarray(s - 3, s).toString("latin1") === "end") {
            i = s + 6
            continue
        }
        let d = s + 6
        if (bytes[d] === 0x0d) d++
        if (bytes[d] === 0x0a) d++
        const e = bytes.indexOf("endstream", d)
        if (e === -1) break
        const raw = bytes.subarray(d, e)
        let txt: string
        try {
            txt = inflateSync(raw).toString("latin1")
        } catch {
            txt = raw.toString("latin1")
        }
        const re = /<([0-9A-Fa-f]*)>\s*Tj/g
        let m: RegExpExecArray | null
        while ((m = re.exec(txt)) !== null) {
            let text = ""
            for (let k = 0; k + 1 < m[1].length; k += 2) {
                text += String.fromCharCode(parseInt(m[1].slice(k, k + 2), 16))
            }
            out.push(text)
        }
        i = e + 9
    }
    return out.join(" ")
}

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

    // `eventDate` is persisted as a Firestore Timestamp by every write path, but
    // this tool tested `typeof eventDate === "string"` — always false — so the
    // header printed only the rabbi and the book and every week's sheet looked
    // identical on the lectern. No test asserted any header content, which is why
    // it survived to a final review.
    it("prints the service date in the header", async () => {
        await generateServiceSheet(ADMIN, { setlistId: await seedService() })
        const text = drawnText(saveSpy.mock.calls[0][0] as Buffer)
        // 2026-09-04 anchored at noon America/Chicago by parseEventDate.
        expect(text).toContain("September 4, 2026")
        expect(text).toContain("Rabbi Daniel")
        expect(text).toContain("CRC Friday Siddur")
    })

    it("still renders a header when the setlist has no eventDate", async () => {
        const created = await createSetlist(ADMIN, { name: "No Date Service", rabbi: "Rabbi Daniel" })
        const setlistId = (created as { setlistId: string }).setlistId
        await addTrackToSetlist(ADMIN, { setlistId, title: "Warmup", type: "note" })
        expect(await generateServiceSheet(ADMIN, { setlistId })).toMatchObject({ ok: true })
        const text = drawnText(saveSpy.mock.calls[0][0] as Buffer)
        expect(text).toContain("No Date Service")
        expect(text).toContain("Rabbi Daniel")
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
