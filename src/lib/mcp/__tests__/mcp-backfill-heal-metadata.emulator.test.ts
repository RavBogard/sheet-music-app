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
import { createHash } from "node:crypto"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * storage-recovery Lane B follow-up — `backfill_heal_metadata` admin tool.
 *
 * Stamps the derived dedup/search fields (normalizedName/stem/titleSpecificity)
 * + enrichmentStatus onto rows healed before the chart-heal metadata fix, and
 * re-fires the AI enrichment pass. Asserts:
 *  - admin gate refuses non-admin
 *  - row_not_found rich envelope when the row is absent
 *  - skipped when the row isn't active (heal the bytes first)
 *  - dryRun computes the plan WITHOUT writing or enriching
 *  - commit stamps the four fields + calls enrichLibraryRow once with the
 *    event (contentHash = sha256 of the bytes) + the injected fetchBytes
 *    returning the downloaded buffer (single round-trip)
 */

// chart-heal.ts imports @/lib/firebase-storage; the backfill tool also reads
// bytes via downloadFromStoragePath. Mock the Storage seam (emulator has no
// real bucket). Keyed by Storage path.
const storedBytes = new Map<string, Buffer>()
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: vi.fn(async () => "gs://mock"),
    getStorageObjectSize: vi.fn(async () => null),
    deleteStorageObjectAtPath: vi.fn(async () => {}),
    fileExistsInStorage: vi.fn(async () => ({ success: true as const, data: false })),
    downloadFromStorage: vi.fn(),
    getStorageUrl: vi.fn(),
    getRecordingStoragePath: vi.fn(),
    uploadRecordingToStorage: vi.fn(),
    downloadFromStoragePath: vi.fn(async (path: string) => {
        const b = storedBytes.get(path)
        if (!b) return { success: false as const, error: "not found" }
        return { success: true as const, data: { buffer: b, contentType: "application/pdf" } }
    }),
}))

// Don't call real Gemini — record the enrichment invocation instead.
vi.mock("@/lib/library/ai-enrichment", () => ({
    buildDefaultDeps: vi.fn(() => ({
        db: null,
        callModel: vi.fn(),
        fetchBytes: vi.fn(async () => null),
        loadConfig: vi.fn(),
    })),
    enrichLibraryRow: vi.fn(async () => {}),
}))

import { backfillHealMetadata } from "../tools/backfill-heal-metadata"
import { enrichLibraryRow } from "@/lib/library/ai-enrichment"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"

describe("MCP backfill_heal_metadata — storage-recovery Lane B follow-up (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-1"

    function db() {
        return getFirestore(app)
    }
    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }
    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-backfill-heal-metadata" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["users", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storedBytes.clear()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it("admin gate refuses non-admin callers", async () => {
        await seedUser(MUSICIAN, "musician")
        await seedIndex("upload-heal-1", { name: "Abanibi", status: "active" })

        const r = await backfillHealMetadata(MUSICIAN, { fileId: "upload-heal-1" })
        expect("ok" in r && r.ok === false).toBe(true)
        if ("ok" in r && r.ok === false) {
            expect((r.error as { machine_code: string }).machine_code).toBe(
                "forbidden_role",
            )
        }
    })

    it("row_not_found when the row is absent", async () => {
        await seedUser(ADMIN, "admin")
        const r = await backfillHealMetadata(ADMIN, { fileId: "nope" })
        expect("ok" in r && r.ok === false).toBe(true)
        if ("ok" in r && r.ok === false) {
            expect((r.error as { machine_code: string }).machine_code).toBe(
                "row_not_found",
            )
        }
    })

    it("skips a non-active (still-orphaned) row — heal bytes first", async () => {
        await seedUser(ADMIN, "admin")
        await seedIndex("upload-orphan", {
            name: "Adonai Oz (Klepper-Freelander)",
            status: "orphaned",
        })

        const r = await backfillHealMetadata(ADMIN, {
            fileId: "upload-orphan",
            dryRun: false,
        })
        if (!("ok" in r) || r.ok !== true) throw new Error("expected ok:true")
        expect(r.action).toBe("skipped")
        expect(r.reason).toContain("orphaned")
        // No fields written.
        const row = (await db().collection("library_index").doc("upload-orphan").get()).data() ?? {}
        expect(row.normalizedName).toBeUndefined()
        expect(enrichLibraryRow).not.toHaveBeenCalled()
    })

    it("dryRun computes the plan (extension stripped) without writing or enriching", async () => {
        await seedUser(ADMIN, "admin")
        // Name carries the ".pdf" extension (as the pre-atomic-guard orphan
        // rows do) — the tool must strip it before deriving keys so a common
        // liturgical stem ("oseh shalom") is detected, not "oseh shalom pdf".
        const NAME = "Oseh Shalom.pdf"
        const CLEAN = "Oseh Shalom"
        await seedIndex("upload-heal-1", {
            name: NAME,
            status: "active",
            source: "salvage",
            mimeType: "application/pdf",
            collection: "supplemental",
        })

        const r = await backfillHealMetadata(ADMIN, { fileId: "upload-heal-1" })
        if (!("ok" in r) || r.ok !== true) throw new Error("expected ok:true")
        expect(r.dryRun).toBe(true)
        expect(r.action).toBe("would-stamp")
        expect(r.computed.stem).toBe(bareStem(CLEAN))
        expect(r.computed.stem).not.toContain("pdf")
        expect(r.computed.normalizedName).toBe("osehshalom")
        expect(r.computed.titleSpecificity).toBe(titleSpecificity(CLEAN, 1))
        expect(r.computed.enrichmentStatus).toBe("pending")
        expect(r.prior.normalizedName).toBeNull()

        // Nothing written; enrichment not invoked.
        const row = (await db().collection("library_index").doc("upload-heal-1").get()).data() ?? {}
        expect(row.normalizedName).toBeUndefined()
        expect(row.stem).toBeUndefined()
        expect(enrichLibraryRow).not.toHaveBeenCalled()
    })

    it("commit stamps the four fields + fires enrichment with the right event", async () => {
        await seedUser(ADMIN, "admin")
        const NAME = "Abanibi (Hirsch) - Achshav (Folk)"
        await seedIndex("upload-heal-1", {
            name: NAME,
            status: "active",
            source: "salvage",
            mimeType: "application/pdf",
            collection: "supplemental",
        })
        const bytes = Buffer.from("%PDF-1.4 healed abanibi bytes")
        storedBytes.set("library/upload-heal-1.pdf", bytes)

        const r = await backfillHealMetadata(ADMIN, {
            fileId: "upload-heal-1",
            dryRun: false,
        })
        if (!("ok" in r) || r.ok !== true) throw new Error("expected ok:true")
        expect(r.action).toBe("stamped")
        expect(r.enrichment).toBe("ran")

        // Fields landed on the row.
        const row = (await db().collection("library_index").doc("upload-heal-1").get()).data() ?? {}
        expect(row.normalizedName).toBe(NAME.toLowerCase().replace(/[^a-z0-9]/g, ""))
        expect(row.stem).toBe(bareStem(NAME))
        expect(row.titleSpecificity).toBe(titleSpecificity(NAME, 1))
        expect(row.enrichmentStatus).toBe("pending")

        // Enrichment invoked once with the heal event + injected fetchBytes.
        expect(enrichLibraryRow).toHaveBeenCalledTimes(1)
        const [event, deps] = (enrichLibraryRow as unknown as { mock: { calls: unknown[][] } })
            .mock.calls[0] as [
            { fileId: string; title: string; collection: string; contentHash: string },
            { fetchBytes: () => Promise<Buffer | null> },
        ]
        expect(event.fileId).toBe("upload-heal-1")
        expect(event.title).toBe(NAME)
        expect(event.collection).toBe("supplemental")
        expect(event.contentHash).toBe(createHash("sha256").update(bytes).digest("hex"))
        const fetched = await deps.fetchBytes()
        expect(fetched && fetched.equals(bytes)).toBe(true)
    })
})
