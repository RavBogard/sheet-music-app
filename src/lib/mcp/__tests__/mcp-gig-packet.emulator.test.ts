// @vitest-environment node
//
// Force the Node environment for this file. The default emulator config uses
// jsdom (other tests need DOM globals), but jsdom installs its own
// Uint8Array global. Node's Buffer extends the Node Uint8Array, so pdf-lib's
// internal `instanceof Uint8Array` check fails inside jsdom and throws
// "pdf must be of type ... but was actually of type NaN" when passed a real
// Buffer. The generate_gig_packet SUT is a pure server-side function — it
// never touches DOM globals — so Node is the right environment.
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { PDFDocument, StandardFonts } from "pdf-lib"

// Mock the file-fetcher: tests control what each fileId returns so we can
// exercise PDF / image / text / appendix-routed branches without touching
// real Storage or Drive. Must be declared BEFORE the SUT import.
const mockFetchFileById = vi.fn()
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: (...args: unknown[]) => mockFetchFileById(...args),
}))

// Per-user rate limiting is module-global state that carries across tests;
// the same admin uid runs every test, so we'd exhaust the bucket without a
// stub. Production behavior unchanged.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

import {
    generateGigPacket,
    _setGigPacketMaxBytesForTest,
} from "../tools/library-download"

/**
 * MCP generate_gig_packet (CF2-C) against the Firebase emulator.
 *
 * Covers the per-track routing contract:
 *  - PDF rows → pages copied into the merged document
 *  - text/plain (scraped chord chart) → rendered as monospaced pages
 *  - JPEG / PNG → embedded as a full letter-size page
 *  - HEIC → appendix entry (server normally converts upstream; raw HEIC is
 *           an unconverted upload and isn't embedded directly)
 *  - MusicXML / MuseScore → appendix entry (rendering not cheap)
 *  - Unsupported content type → appendix entry
 *  - Missing bytes (Storage + Drive both miss) → appendix entry
 *  - Setlist not found, empty setlistId, no bonded tracks
 *  - Output cap enforced (with a lowered test cap so we don't have to build a
 *    real ~20 MB merged PDF in the test process)
 *  - Any authenticated uid may generate — no role gate per chart-access policy
 */
describe("MCP generate_gig_packet (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-leader"
    const MUSICIAN = "alex-musician"
    const ANONYMOUS = "unknown-uid"

    /** Real 1x1 transparent PNG (canonical). pdf-lib decodes the IHDR/IDAT/IEND
     *  chunks at embedPng-time, so the bytes must be a valid PNG — this is one.
     *  (Constructing a minimal valid JPEG is much harder — SOF/DQT/DHT markers
     *  are required — so the image route is exercised via PNG only. JPEG bytes
     *  that fail to parse route to the missing-charts appendix, exercised by
     *  the "Embed failed" branch under the same `try/catch` as PNG.) */
    const TINY_PNG = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
    )

    /** Build a real two-page PDF that returns deterministic bytes. */
    async function makePdfBytes(title: string, pageCount: number): Promise<Buffer> {
        const doc = await PDFDocument.create()
        const font = await doc.embedFont(StandardFonts.Helvetica)
        for (let i = 0; i < pageCount; i++) {
            const page = doc.addPage([612, 792])
            page.drawText(`${title} — page ${i + 1}`, {
                x: 50,
                y: 700,
                size: 18,
                font,
            })
        }
        return Buffer.from(await doc.save())
    }

    function db() {
        return getFirestore(app)
    }

    async function seedSetlist(
        setlistId: string,
        name: string,
    ): Promise<void> {
        await db()
            .collection("setlists")
            .doc(setlistId)
            .set({ name, ownerId: ADMIN, trackCount: 0 })
    }

    /** Direct-seed a track row. Mirrors the shape produced by
     *  add_track_to_setlist (server-tracks.ts reads by `setlistId`). */
    async function seedTrack(
        trackId: string,
        setlistId: string,
        order: number,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await db()
            .collection("tracks")
            .doc(trackId)
            .set({
                setlistId,
                order,
                ...fields,
            })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-gig-packet" })

        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", email: "daniel@centralreform.org" })
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ role: "band_leader", email: "david@example.com" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ role: "musician", email: "alex@example.com" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        mockFetchFileById.mockReset()
        for (const col of ["setlists", "tracks", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    afterEach(() => {
        _setGigPacketMaxBytesForTest(null)
    })

    it("happy path: all-PDF setlist merges in performance order and returns base64 bytes", async () => {
        const setlistId = "set-pdf-only"
        await seedSetlist(setlistId, "Shabbat Morning")
        await seedTrack("t1", setlistId, 0, {
            type: "song",
            title: "Oseh Shalom",
            fileId: "upload-osehshalom",
        })
        await seedTrack("t2", setlistId, 1, {
            type: "song",
            title: "Hinei Ma Tov",
            fileId: "upload-hineimatov",
        })

        const osehBytes = await makePdfBytes("Oseh", 2)
        const hineiBytes = await makePdfBytes("Hinei", 1)
        mockFetchFileById.mockImplementation(async (fileId: string) => {
            if (fileId === "upload-osehshalom") {
                return {
                    buffer: osehBytes,
                    contentType: "application/pdf",
                    source: "firebase-storage" as const,
                }
            }
            if (fileId === "upload-hineimatov") {
                return {
                    buffer: hineiBytes,
                    contentType: "application/pdf",
                    source: "firebase-storage" as const,
                }
            }
            return null
        })

        const r = await generateGigPacket(ADMIN, { setlistId })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.title).toBe("Shabbat Morning")
        expect(r.source).toBe("merged")
        expect(r.trackCount).toBe(2)
        expect(r.bondedCount).toBe(2)
        // Surface missingCharts first so a routing failure produces a debuggable
        // assertion ("expected [...reason...] to equal []") instead of a bare
        // "0 vs 2" appendedCount mismatch.
        expect(r.missingCharts).toEqual([])
        expect(r.appendedCount).toBe(2)
        expect(r.sizeBytes).toBeGreaterThan(0)
        expect(r.fileId).toMatch(/^gig-packet-set-pdf-only-/)

        // Round-trip the merged PDF and confirm it has the expected page count
        // (2 from Oseh + 1 from Hinei = 3 pages, no appendix because nothing missing).
        const merged = await PDFDocument.load(
            Buffer.from(r.contentBase64, "base64"),
        )
        expect(merged.getPageCount()).toBe(3)
    })

    it("mixed routing: PDF + PNG + text/plain embed; MusicXML + HEIC + unsupported route to appendix", async () => {
        const setlistId = "set-mixed"
        await seedSetlist(setlistId, "Mixed Service")
        const tracks = [
            ["t1", "Mi Chamocha", "upload-pdf"],
            ["t2", "Sh'ma (scan)", "upload-png"],
            ["t3", "Modeh Ani (scraped)", "upload-txt"],
            ["t4", "Yedid Nefesh (xml)", "upload-xml"],
            ["t5", "Lecha Dodi (heic)", "upload-heic"],
            ["t6", "Unknown blob", "upload-blob"],
        ] as const

        for (let i = 0; i < tracks.length; i++) {
            const [id, title, fileId] = tracks[i]
            await seedTrack(id, setlistId, i, {
                type: "song",
                title,
                fileId,
            })
        }

        const pdfBytes = await makePdfBytes("Mi Chamocha", 2)
        const txtBytes = Buffer.from(
            "Verse 1\n  C       G       Am      F\nModeh ani lefanecha\n",
            "utf-8",
        )
        mockFetchFileById.mockImplementation(async (fileId: string) => {
            switch (fileId) {
                case "upload-pdf":
                    return {
                        buffer: pdfBytes,
                        contentType: "application/pdf",
                        source: "firebase-storage" as const,
                    }
                case "upload-png":
                    return {
                        buffer: TINY_PNG,
                        contentType: "image/png",
                        source: "firebase-storage" as const,
                    }
                case "upload-txt":
                    return {
                        buffer: txtBytes,
                        contentType: "text/plain; charset=utf-8",
                        source: "firebase-storage" as const,
                    }
                case "upload-xml":
                    return {
                        buffer: Buffer.from("<score-partwise/>"),
                        contentType: "application/vnd.recordare.musicxml+xml",
                        source: "firebase-storage" as const,
                    }
                case "upload-heic":
                    return {
                        buffer: Buffer.from("\x00\x00\x00\x18ftypheic"),
                        contentType: "image/heic",
                        source: "firebase-storage" as const,
                    }
                case "upload-blob":
                    return {
                        buffer: Buffer.from("opaque"),
                        contentType: "application/x-weird",
                        source: "firebase-storage" as const,
                    }
            }
            return null
        })

        const r = await generateGigPacket(ADMIN, { setlistId })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        // 3 embedded (pdf-2pp + png + text), 3 missing (xml, heic, blob).
        // Assert the missing set first so a routing regression surfaces a
        // readable diff instead of a bare count mismatch.
        const missingTitles = r.missingCharts.map((m) => m.title).sort()
        expect(missingTitles).toEqual([
            "Lecha Dodi (heic)",
            "Unknown blob",
            "Yedid Nefesh (xml)",
        ])
        expect(r.appendedCount).toBe(3)
        expect(
            r.missingCharts.find((m) => m.title === "Lecha Dodi (heic)")?.reason,
        ).toMatch(/HEIC/i)
        expect(
            r.missingCharts.find((m) => m.title === "Yedid Nefesh (xml)")?.reason,
        ).toMatch(/MusicXML|MuseScore/i)
        expect(
            r.missingCharts.find((m) => m.title === "Unknown blob")?.reason,
        ).toMatch(/Unsupported content type/i)

        // Merged PDF has: 2 pages (pdf) + 1 (png) + 1+ text pages + 1 appendix page.
        const merged = await PDFDocument.load(
            Buffer.from(r.contentBase64, "base64"),
        )
        expect(merged.getPageCount()).toBeGreaterThanOrEqual(5)
    })

    it("returns 'Setlist not found' when the setlist doc does not exist", async () => {
        const r = await generateGigPacket(ADMIN, { setlistId: "ghost-setlist" })
        expect(r).toEqual({ error: "Setlist not found" })
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    it("rejects an empty setlistId", async () => {
        const r = await generateGigPacket(ADMIN, { setlistId: "   " })
        expect(r).toEqual({ error: "setlistId is required" })
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    it("refuses when no track on the setlist has a bonded fileId", async () => {
        const setlistId = "set-no-bonded"
        await seedSetlist(setlistId, "Sketch")
        // Tracks exist but are headers / readings — none have fileId
        await seedTrack("h1", setlistId, 0, { type: "header", title: "Opening" })
        await seedTrack("r1", setlistId, 1, { type: "reading", title: "Sh'ma" })

        const r = await generateGigPacket(ADMIN, { setlistId })
        expect(r).toEqual({
            error: expect.stringContaining("No bonded charts on this setlist"),
        })
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    it("lists missing-bytes rows in the appendix and still returns ok:true", async () => {
        const setlistId = "set-orphan"
        await seedSetlist(setlistId, "With Orphan")
        await seedTrack("t1", setlistId, 0, {
            type: "song",
            title: "Orphan Chart",
            fileId: "upload-missing",
        })
        mockFetchFileById.mockResolvedValueOnce(null) // Storage + Drive both miss

        const r = await generateGigPacket(ADMIN, { setlistId })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.appendedCount).toBe(0)
        expect(r.bondedCount).toBe(1)
        expect(r.missingCharts).toHaveLength(1)
        expect(r.missingCharts[0]).toMatchObject({
            trackId: "t1",
            title: "Orphan Chart",
            fileId: "upload-missing",
            reason: expect.stringContaining("Storage or Drive"),
        })
        // Packet still contains an appendix page so Daniel can see the gap.
        const merged = await PDFDocument.load(
            Buffer.from(r.contentBase64, "base64"),
        )
        expect(merged.getPageCount()).toBeGreaterThanOrEqual(1)
    })

    it("enforces the output byte cap and returns a clear error", async () => {
        const setlistId = "set-oversize"
        await seedSetlist(setlistId, "Oversize")
        await seedTrack("t1", setlistId, 0, {
            type: "song",
            title: "Long Chart",
            fileId: "upload-long",
        })
        // A real PDF, just to walk the merge path. Setting the test cap to a
        // size smaller than any saved pdf-lib document guarantees the cap
        // branch fires without inflating the input to 20 MB.
        const bytes = await makePdfBytes("Long Chart", 1)
        mockFetchFileById.mockResolvedValueOnce({
            buffer: bytes,
            contentType: "application/pdf",
            source: "firebase-storage" as const,
        })

        _setGigPacketMaxBytesForTest(100) // 100 bytes is below any valid PDF
        const r = await generateGigPacket(ADMIN, { setlistId })
        expect(r).toEqual({
            error: expect.stringContaining("exceeds the 100-byte response cap"),
        })
    })

    it("any authenticated uid may generate — no role gate (chart-access policy)", async () => {
        const setlistId = "set-public"
        await seedSetlist(setlistId, "Public")
        await seedTrack("t1", setlistId, 0, {
            type: "song",
            title: "Pub Chart",
            fileId: "upload-pub",
        })
        const bytes = await makePdfBytes("Pub", 1)
        mockFetchFileById.mockResolvedValue({
            buffer: bytes,
            contentType: "application/pdf",
            source: "firebase-storage" as const,
        })

        for (const caller of [ADMIN, LEADER, MUSICIAN, ANONYMOUS]) {
            const r = await generateGigPacket(caller, { setlistId })
            expect("ok" in r && r.ok).toBe(true)
        }
    })
})
