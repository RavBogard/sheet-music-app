import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Mock the file-fetcher (Storage primary + Drive fallback) — downloadChart
// delegates byte retrieval to it. Tests control what each fileId returns.
// Must come BEFORE the SUT import.
const mockFetchFileById = vi.fn()
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: (...args: unknown[]) => mockFetchFileById(...args),
}))

// Real per-user rate limiting is module-global state that would carry across
// tests in the same process; mock it the same way the upload-suite does.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

import { downloadChart, DOWNLOAD_CHART_MAX_BYTES } from "../tools/library-download"

/**
 * MCP download_chart tool against the Firebase emulator.
 *
 * Real Firestore (library_index lookup). Mocked file-fetcher (byte retrieval).
 *
 * Covers:
 *  - Happy path: library_index entry resolves → bytes returned base64
 *  - Title + mimeType + fileName surfaced from index
 *  - Source field carried through (firebase-storage vs drive fallback)
 *  - Missing library_index doc → 'Chart not found'
 *  - file-fetcher returns null (Storage miss, no Drive) → underlying-bytes error
 *  - Size cap rejection above 20 MB
 *  - Empty fileId rejected
 *  - Any authenticated uid may download (no role gate per chart-access policy)
 */
describe("MCP download_chart (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-leader"
    const MUSICIAN = "alex-musician"
    const ANONYMOUS = "unknown-uid" // no users/{uid} doc — should still work

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-chart-download" })

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
        const snap = await db().collection("library_index").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    async function seedIndex(
        fileId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        await db().collection("library_index").doc(fileId).set(data)
    }

    it("happy path: returns base64 bytes + mimeType + title from a Storage chart", async () => {
        const fileId = "upload-abc123"
        await seedIndex(fileId, {
            name: "Oseh Shalom",
            fileName: "Oseh Shalom.pdf",
            mimeType: "application/pdf",
            collection: "core",
        })
        const buffer = Buffer.from("%PDF-1.4 oseh-content")
        mockFetchFileById.mockResolvedValueOnce({
            buffer,
            contentType: "application/pdf",
            source: "firebase-storage",
        })

        const r = await downloadChart(ADMIN, { fileId })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.fileId).toBe(fileId)
        expect(r.title).toBe("Oseh Shalom")
        expect(r.fileName).toBe("Oseh Shalom.pdf")
        expect(r.mimeType).toBe("application/pdf")
        expect(r.sizeBytes).toBe(buffer.byteLength)
        expect(r.source).toBe("firebase-storage")
        // Round-trip the base64 and verify it matches the original buffer.
        expect(Buffer.from(r.contentBase64, "base64").toString()).toBe(
            buffer.toString(),
        )
    })

    it("surfaces the Drive fallback source field when Storage misses (legacy charts)", async () => {
        const fileId = "drive-id-legacy-789"
        await seedIndex(fileId, {
            name: "Hinei Ma Tov",
            mimeType: "application/pdf",
        })
        mockFetchFileById.mockResolvedValueOnce({
            buffer: Buffer.from("%PDF-1.4 drive-fallback"),
            contentType: "application/pdf",
            source: "google-drive-fallback",
        })

        const r = await downloadChart(ADMIN, { fileId })
        expect("ok" in r && r.ok && r.source).toBe("google-drive-fallback")
    })

    it("any authenticated uid may download — no role gate (chart-access policy)", async () => {
        const fileId = "upload-public-chart"
        await seedIndex(fileId, {
            name: "Public Chart",
            mimeType: "application/pdf",
        })
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from("%PDF-1.4 pub"),
            contentType: "application/pdf",
            source: "firebase-storage",
        })

        for (const caller of [ADMIN, LEADER, MUSICIAN, ANONYMOUS]) {
            const r = await downloadChart(caller, { fileId })
            expect("ok" in r && r.ok).toBe(true)
        }
    })

    it("returns chart_not_found when library_index has no entry for fileId", async () => {
        const r = await downloadChart(ADMIN, { fileId: "ghost-chart" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "chart_not_found" },
            fileId: "ghost-chart",
        })
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    it("returns chart_bytes_missing when bytes are missing from Storage AND Drive", async () => {
        const fileId = "upload-orphan"
        await seedIndex(fileId, {
            name: "Orphan Chart",
            mimeType: "application/pdf",
        })
        mockFetchFileById.mockResolvedValueOnce(null)

        const r = await downloadChart(ADMIN, { fileId })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "chart_bytes_missing", message: expect.stringContaining("not found in Storage or Drive") },
            fileId,
        })
    })

    it("rejects oversized charts above the 20 MB cap", async () => {
        const fileId = "upload-huge"
        await seedIndex(fileId, {
            name: "Huge Chart",
            mimeType: "application/pdf",
        })
        // Build a buffer larger than the cap. Allocate sparse to keep test fast.
        const oversized = Buffer.alloc(DOWNLOAD_CHART_MAX_BYTES + 1)
        mockFetchFileById.mockResolvedValueOnce({
            buffer: oversized,
            contentType: "application/pdf",
            source: "firebase-storage",
        })

        const r = await downloadChart(ADMIN, { fileId })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "chart_too_large", message: expect.stringContaining("exceeds the") },
        })
    })

    it("rejects an empty fileId", async () => {
        const r = await downloadChart(ADMIN, { fileId: "   " })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
            field: "fileId",
        })
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    it("falls back to fileId when index lacks a name/title field", async () => {
        const fileId = "upload-untitled"
        await seedIndex(fileId, { mimeType: "application/pdf" }) // no name field
        mockFetchFileById.mockResolvedValueOnce({
            buffer: Buffer.from("x"),
            contentType: "application/pdf",
            source: "firebase-storage",
        })

        const r = await downloadChart(ADMIN, { fileId })
        expect("ok" in r && r.ok && r.title).toBe(fileId)
    })
})
