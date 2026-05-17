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

/**
 * Cycle-3 NEW-2 (ADDENDUM-1) — `reconcile_library` admin-only one-shot
 * bootstrap reconciliation tool.
 *
 * The reconcile tool composes three external systems (Firestore for the
 * index walk + writes, Firebase Storage for the HEAD probe + bytes write,
 * Google Drive for the fallback probe + bytes read). The emulator runs
 * Firestore for real and we mock the Storage + Drive seams here — the same
 * posture cycle-1 verify_setlist_charts emulator tests use.
 *
 * Properties asserted (msg-001 first-actions checklist):
 *  - admin gate refuses non-admin callers
 *  - dryRun default true; force omitted on a real run → refused, no writes
 *  - dryRun returns the bucket plan with zero writes
 *  - force-run mirrors Drive-200 rows into Storage at the EXISTING fileId
 *    (preserves bonds), curation fields are preserved by merge-update,
 *    status flips to 'active'
 *  - force-run marks Drive-404 rows status:'orphaned'
 *  - transient Drive 5xx leaves the row untouched and surfaces in report
 *  - idempotent: re-run after a force-run is a no-op
 *  - Bar'chu Walkdown `upload-…` style row buckets correctly when Storage
 *    402s — upload-prefixed ids bucket as orphan (no Drive fallback,
 *    matches getChartHealth's behavior)
 */

// ─── Mocks for Storage + Drive seams ────────────────────────────────────────
// `vi.mock` MUST be hoisted before the imports under test. We use mutable
// state inside the factory and let each test program the desired behavior.

const storageState = {
    /** fileIds that are "present" in Storage. */
    present: new Set<string>(),
    /** fileIds whose probe should fail with a network error. */
    networkFail: new Set<string>(),
    /** Captured uploads keyed by fileId; tests assert against this. */
    uploaded: new Map<string, { bytes: number; mime: string }>(),
    /** Captured compensating-deletes (Storage paths). */
    deletedPaths: [] as string[],
    /** When set, uploadToStorage throws on this fileId. */
    uploadThrows: new Set<string>(),
    /** When set, the read-verify size returned does NOT match the input bytes. */
    readVerifyMismatch: new Set<string>(),
}

vi.mock("@/lib/firebase-storage", () => ({
    fileExistsInStorage: vi.fn(async (fileId: string) => {
        if (storageState.networkFail.has(fileId)) {
            return {
                success: false as const,
                reason: "network" as const,
                message: "network blip",
            }
        }
        return {
            success: true as const,
            data: storageState.present.has(fileId),
        }
    }),
    uploadToStorage: vi.fn(async (fileId: string, buffer: Buffer, mime: string) => {
        if (storageState.uploadThrows.has(fileId)) {
            throw new Error("storage upload boom")
        }
        storageState.uploaded.set(fileId, { bytes: buffer.byteLength, mime })
        storageState.present.add(fileId)
        return `gs://mock/library/${fileId}`
    }),
    getStorageObjectSize: vi.fn(async (path: string) => {
        // path is `library/{fileId}<ext>` — recover fileId for state lookup.
        const m = path.match(/^library\/(.+?)(\.[a-z0-9]+)?$/)
        const fileId = m?.[1]
        if (!fileId) return null
        const uploaded = storageState.uploaded.get(fileId)
        if (!uploaded) return null
        if (storageState.readVerifyMismatch.has(fileId)) {
            return uploaded.bytes + 99 // intentional mismatch
        }
        return uploaded.bytes
    }),
    deleteStorageObjectAtPath: vi.fn(async (path: string) => {
        storageState.deletedPaths.push(path)
        const m = path.match(/^library\/(.+?)(\.[a-z0-9]+)?$/)
        const fileId = m?.[1]
        if (fileId) {
            storageState.uploaded.delete(fileId)
            storageState.present.delete(fileId)
        }
    }),
    // Pass-throughs for any other imports (none used by reconcile, but the
    // module is also imported by sibling tools transitively in test setup).
    downloadFromStorage: vi.fn(),
    getStorageUrl: vi.fn(),
    getRecordingStoragePath: vi.fn(),
    uploadRecordingToStorage: vi.fn(),
    downloadFromStoragePath: vi.fn(),
}))

const driveState = {
    /** Metadata responses keyed by driveFileId. */
    metadata: new Map<
        string,
        { name: string; mimeType: string } | "404" | "5xx"
    >(),
    /** Byte buffers keyed by driveFileId. */
    bytes: new Map<string, Buffer>(),
    /** When set, getFile throws for this driveFileId. */
    getFileThrows: new Set<string>(),
}

vi.mock("@/lib/google-drive", () => ({
    DriveClient: vi.fn().mockImplementation(() => ({
        getFileMetadata: vi.fn(async (fileId: string) => {
            const m = driveState.metadata.get(fileId)
            if (!m || m === "404") {
                throw new Error("File not found: 404")
            }
            if (m === "5xx") {
                throw new Error("Drive 503 transient")
            }
            return m
        }),
        getFile: vi.fn(async (fileId: string) => {
            if (driveState.getFileThrows.has(fileId)) {
                throw new Error("Drive get bytes failed")
            }
            const b = driveState.bytes.get(fileId)
            if (!b) throw new Error("no bytes seeded")
            return b
        }),
    })),
}))

// AFTER the mocks: import the module under test.
import { reconcileLibrary } from "../tools/reconcile-library"

describe("MCP reconcile_library — NEW-2 cycle-3 (emulator)", () => {
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
    async function seedSong(id: string, data: Record<string, unknown>) {
        await db().collection("songs").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-reconcile-library" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "users",
            "library_index",
            "songs",
            "library_signals",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storageState.present.clear()
        storageState.networkFail.clear()
        storageState.uploaded.clear()
        storageState.deletedPaths.length = 0
        storageState.uploadThrows.clear()
        storageState.readVerifyMismatch.clear()
        driveState.metadata.clear()
        driveState.bytes.clear()
        driveState.getFileThrows.clear()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it("admin gate refuses non-admin callers", async () => {
        await seedUser(MUSICIAN, "musician")
        await seedIndex("any-row", { name: "Adon Olam.pdf" })

        const r = await reconcileLibrary(MUSICIAN, { dryRun: true })
        if (!("error" in r)) throw new Error("expected admin refusal")
        expect(r.error).toMatch(/admin-only/i)
    })

    it("dryRun is the default; returns plan with zero writes", async () => {
        await seedUser(ADMIN, "admin")
        // One healthy row (Storage 200), one Drive-200 row, one Drive-404 row.
        storageState.present.add("healthy-1")
        await seedIndex("healthy-1", {
            name: "Adon Olam.pdf",
            mimeType: "application/pdf",
            status: "active",
        })
        driveState.metadata.set("drive-200-1", {
            name: "Mi Chamocha.pdf",
            mimeType: "application/pdf",
        })
        driveState.bytes.set("drive-200-1", Buffer.from("pdf-bytes-here"))
        await seedIndex("drive-200-1", {
            name: "Mi Chamocha.pdf",
            mimeType: "application/pdf",
            status: "active",
        })
        driveState.metadata.set("drive-404-1", "404")
        await seedIndex("drive-404-1", {
            name: "Vanished Chart.pdf",
            mimeType: "application/pdf",
            status: "active",
        })

        const r = await reconcileLibrary(ADMIN) // default dryRun:true
        if ("error" in r) throw new Error(r.error)

        expect(r.dryRun).toBe(true)
        expect(r.committed).toBe(0)
        expect(r.scanned).toBe(3)
        expect(r.alreadyHealthy).toBe(1)
        expect(r.driveMirror.count).toBe(1)
        expect(r.driveMirror.rows[0].fileId).toBe("drive-200-1")
        expect(r.orphan.count).toBe(1)
        expect(r.orphan.rows[0].fileId).toBe("drive-404-1")
        expect(r.transient.count).toBe(0)

        // Verify zero Firestore mutations + zero Storage writes.
        const drive200Doc = await db()
            .collection("library_index")
            .doc("drive-200-1")
            .get()
        expect(drive200Doc.data()?.status).toBe("active")
        expect(drive200Doc.data()?.reconciledAt).toBeUndefined()
        const drive404Doc = await db()
            .collection("library_index")
            .doc("drive-404-1")
            .get()
        expect(drive404Doc.data()?.status).toBe("active")
        expect(drive404Doc.data()?.orphanedAt).toBeUndefined()
        expect(storageState.uploaded.size).toBe(0)
    })

    it("real run without force returns refused:true with no writes", async () => {
        await seedUser(ADMIN, "admin")
        driveState.metadata.set("drive-200-1", {
            name: "Mi Chamocha.pdf",
            mimeType: "application/pdf",
        })
        driveState.bytes.set("drive-200-1", Buffer.from("pdf-bytes-here"))
        await seedIndex("drive-200-1", {
            name: "Mi Chamocha.pdf",
            mimeType: "application/pdf",
            status: "active",
        })

        const r = await reconcileLibrary(ADMIN, { dryRun: false })
        if ("error" in r) throw new Error(r.error)

        expect(r.refused).toBe(true)
        expect(r.dryRun).toBe(false)
        expect(r.committed).toBe(0)
        expect(r.driveMirror.count).toBe(1)

        const doc = await db()
            .collection("library_index")
            .doc("drive-200-1")
            .get()
        expect(doc.data()?.reconciledAt).toBeUndefined()
        expect(storageState.uploaded.size).toBe(0)
    })

    it("force run mirrors Drive-200 rows; preserves fileId + curation, flips status:active", async () => {
        await seedUser(ADMIN, "admin")
        const bytes = Buffer.from("real-pdf-content")
        driveState.metadata.set("oseh-shalom-id", {
            name: "Oseh Shalom (camp).pdf",
            mimeType: "application/pdf",
        })
        driveState.bytes.set("oseh-shalom-id", bytes)
        await seedIndex("oseh-shalom-id", {
            name: "Oseh Shalom (camp).pdf",
            mimeType: "application/pdf",
            status: "active",
            // Curation fields a human set previously — MUST survive merge.
            key: "G",
            bpm: 92,
            tags: ["friday-evening"],
            bondCorrectionHistory: { correctedTo: 3, correctedAwayFrom: 1 },
        })

        const r = await reconcileLibrary(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(r.error)

        expect(r.committed).toBe(1)
        expect(r.driveMirror.count).toBe(1)
        expect(r.driveMirror.rows[0].sizeBytes).toBe(bytes.byteLength)

        // Same fileId, status flipped, curation preserved.
        const doc = await db()
            .collection("library_index")
            .doc("oseh-shalom-id")
            .get()
        const data = doc.data() as Record<string, unknown>
        expect(data.status).toBe("active")
        expect(data.source).toBe("drive-sync")
        expect(data.fileSize).toBe(bytes.byteLength)
        expect(data.reconciledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(data.driveFileId).toBe("oseh-shalom-id")
        // Curation survived merge.
        expect(data.key).toBe("G")
        expect(data.bpm).toBe(92)
        expect(data.tags).toEqual(["friday-evening"])
        expect(data.bondCorrectionHistory).toEqual({
            correctedTo: 3,
            correctedAwayFrom: 1,
        })

        // Storage write happened at the SAME fileId.
        expect(storageState.uploaded.get("oseh-shalom-id")).toEqual({
            bytes: bytes.byteLength,
            mime: "application/pdf",
        })

        // library_signals broadcast fired.
        const sig = await db()
            .collection("library_signals")
            .doc("latest")
            .get()
        expect(sig.data()?.op).toBe("reconcile")
        expect(sig.data()?.count).toBe(1)
    })

    it("force run marks Drive-404 rows status:'orphaned' on both library_index + songs", async () => {
        await seedUser(ADMIN, "admin")
        driveState.metadata.set("vanished-id", "404")
        await seedIndex("vanished-id", {
            name: "Vanished Chart.pdf",
            mimeType: "application/pdf",
            status: "active",
        })
        await seedSong("vanished-id", { title: "Vanished Chart", status: "active" })

        const r = await reconcileLibrary(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(r.error)

        expect(r.committed).toBe(1)
        expect(r.orphan.count).toBe(1)
        expect(r.orphan.rows[0].fileId).toBe("vanished-id")

        const idx = await db()
            .collection("library_index")
            .doc("vanished-id")
            .get()
        expect(idx.data()?.status).toBe("orphaned")
        expect(idx.data()?.orphanedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        const sng = await db().collection("songs").doc("vanished-id").get()
        expect(sng.data()?.status).toBe("orphaned")
    })

    it("Drive 5xx leaves the row untouched and surfaces in transient bucket", async () => {
        await seedUser(ADMIN, "admin")
        driveState.metadata.set("blip-id", "5xx")
        await seedIndex("blip-id", {
            name: "Transient Blip.pdf",
            mimeType: "application/pdf",
            status: "active",
        })

        const r = await reconcileLibrary(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(r.error)

        expect(r.transient.count).toBe(1)
        expect(r.transient.rows[0].fileId).toBe("blip-id")
        expect(r.committed).toBe(0)

        // Row status untouched — no permanent flip on a transient blip.
        const idx = await db()
            .collection("library_index")
            .doc("blip-id")
            .get()
        expect(idx.data()?.status).toBe("active")
        expect(idx.data()?.orphanedAt).toBeUndefined()
        expect(idx.data()?.reconciledAt).toBeUndefined()
    })

    it("is idempotent — re-run after force commits nothing", async () => {
        await seedUser(ADMIN, "admin")
        const bytes = Buffer.from("pdf-content-once")
        driveState.metadata.set("recoverable-id", {
            name: "Recoverable.pdf",
            mimeType: "application/pdf",
        })
        driveState.bytes.set("recoverable-id", bytes)
        await seedIndex("recoverable-id", {
            name: "Recoverable.pdf",
            mimeType: "application/pdf",
            status: "active",
        })
        driveState.metadata.set("dead-id", "404")
        await seedIndex("dead-id", {
            name: "Dead.pdf",
            mimeType: "application/pdf",
            status: "active",
        })

        const first = await reconcileLibrary(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in first) throw new Error(first.error)
        expect(first.committed).toBe(2)

        // After force: recoverable is in Storage (so probe returns ok),
        // dead is `status: 'orphaned'` so the candidate loader skips it.
        const second = await reconcileLibrary(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in second) throw new Error(second.error)

        expect(second.scanned).toBe(1) // only recoverable; dead was filtered
        expect(second.alreadyHealthy).toBe(1)
        expect(second.driveMirror.count).toBe(0)
        expect(second.orphan.count).toBe(0)
        expect(second.committed).toBe(0)
    })

    it("upload-prefixed rows (Bar'chu Walkdown shape) bucket as orphan on Storage miss", async () => {
        // The Bar'chu Walkdown case `upload-0594bbd4-…`: an upload-prefixed
        // id has no Drive fallback (matches getChartHealth's behavior),
        // so a Storage-miss row buckets as orphan, not transient.
        await seedUser(ADMIN, "admin")
        await seedIndex("upload-0594bbd4-fake", {
            name: "Bar'chu Walkdown.pdf",
            mimeType: "application/pdf",
            status: "active",
        })

        const r = await reconcileLibrary(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(r.error)

        expect(r.orphan.count).toBe(1)
        expect(r.orphan.rows[0].fileId).toBe("upload-0594bbd4-fake")
        expect(r.transient.count).toBe(0)
    })

    it("orphaned and duplicate rows are skipped on every run", async () => {
        await seedUser(ADMIN, "admin")
        await seedIndex("already-orphaned", {
            name: "Old Dead.pdf",
            mimeType: "application/pdf",
            status: "orphaned",
        })
        await seedIndex("already-duplicate", {
            name: "Dupe Loser.pdf",
            mimeType: "application/pdf",
            status: "duplicate",
        })

        const r = await reconcileLibrary(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(r.error)

        expect(r.scanned).toBe(0)
        expect(r.alreadyHealthy).toBe(0)
        expect(r.driveMirror.count).toBe(0)
        expect(r.orphan.count).toBe(0)
        expect(r.transient.count).toBe(0)
    })
})
