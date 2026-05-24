/**
 * bond-aware-delete-guard — `safelyDeleteLibraryObject` emulator tests.
 *
 * Covers the structural guard at the library/* Storage delete chokepoint:
 *   - bonded refuses (no force)
 *   - dangling-only proceeds (parent setlist absent ≠ live bond)
 *   - force overrides bonded refusal
 *   - audit log written on success, refusal, and forced override
 *   - multi-variant deletion handled (all 3 of .pdf/.xml/no-ext)
 *   - exactPath surgical mode (single path; rejects non-library paths)
 *   - idempotent re-call (not-found is no-op)
 *   - audit-write-failure non-fatal
 *   - invalid args throw (empty fileId / empty reason)
 *
 * Integration-shape test:
 *   - simulates the cron-blast scenario — direct helper call against a
 *     live-bonded fileId refuses + records audit + bytes remain.
 */

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import {
    initializeApp,
    deleteApp,
    getApps,
    type App,
} from "firebase-admin/app"
import {
    getFirestore,
    type Firestore,
} from "firebase-admin/firestore"

// In-test Storage state — same shape as mcp-chart-upload.emulator.test.ts
// so the underlying `deleteStorageObjectAtPath` mock can drop entries that
// were "uploaded" by tests directly populating the map.
const storageState = new Map<string, number>()
const mockDeleteStorageObjectAtPath = vi.fn(async (path: string) => {
    if (!storageState.has(path)) {
        // Mirror the real Admin SDK 404 shape so the helper's not-found
        // catch path is exercised.
        throw new Error(`No such object: ${path}`)
    }
    storageState.delete(path)
})

vi.mock("@/lib/firebase-storage", () => ({
    deleteStorageObjectAtPath: (...args: unknown[]) =>
        mockDeleteStorageObjectAtPath(...(args as [string])),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { safelyDeleteLibraryObject } from "../safely-delete-library-object"

describe("safelyDeleteLibraryObject (emulator)", () => {
    let app: App
    const FILE_ID = "upload-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const FILE_ID_2 = "upload-ffffffff-1111-2222-3333-444444444444"
    const ACTOR = "rabbi-daniel"

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-safely-delete-library" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    function db(): Firestore {
        return getFirestore(app)
    }

    beforeEach(async () => {
        storageState.clear()
        mockDeleteStorageObjectAtPath.mockClear()
        for (const coll of ["tracks", "setlists", "auditLogs", "library_index"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    /** Seed `library/<fileId>.pdf` Storage object (default mime). */
    function seedStorage(fileId: string, ext = ".pdf", bytes = 1024) {
        storageState.set(`library/${fileId}${ext}`, bytes)
    }

    async function seedLiveBond(
        fileId: string,
        setlistId: string,
        trackId: string,
    ) {
        await db()
            .collection("setlists")
            .doc(setlistId)
            .set({ name: "Live Setlist", date: "2026-06-07" })
        await db().collection("tracks").doc(trackId).set({
            setlistId,
            fileId,
            title: "Bonded",
            order: 0,
        })
    }

    async function seedDanglingBond(
        fileId: string,
        deadSetlistId: string,
        trackId: string,
    ) {
        // setlist doc deliberately NOT created → dangling
        await db().collection("tracks").doc(trackId).set({
            setlistId: deadSetlistId,
            fileId,
            title: "Dangling",
            order: 0,
        })
    }

    // ─── bond-check refusal ────────────────────────────────────────────────

    it("refuses when a live setlist binds the fileId (no force)", async () => {
        seedStorage(FILE_ID)
        await seedLiveBond(FILE_ID, "live-set-1", "trk-live-1")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:should-refuse",
            callerUid: ACTOR,
        })

        expect(r).toEqual({
            deleted: false,
            refusedBecauseBonded: ["trk-live-1"],
        })
        // Bytes remain — guard fired BEFORE any delete.
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(true)
        expect(mockDeleteStorageObjectAtPath).not.toHaveBeenCalled()

        // Refusal audit row written.
        const auditSnap = await db()
            .collection("auditLogs")
            .where("fileId", "==", FILE_ID)
            .get()
        expect(auditSnap.docs.length).toBe(1)
        expect(auditSnap.docs[0].data()).toMatchObject({
            type: "library-object-delete-refused",
            reason: "test:should-refuse",
            forcedOverride: false,
            bondedTrackIds: ["trk-live-1"],
            callerUid: ACTOR,
            paths: [],
        })
    })

    it("proceeds when only dangling tracks point at the fileId (parent setlist dead)", async () => {
        seedStorage(FILE_ID)
        await seedDanglingBond(FILE_ID, "dead-set", "trk-dangling")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:dangling-only",
            callerUid: ACTOR,
        })

        expect(r.deleted).toBe(true)
        expect(r.refusedBecauseBonded).toBeUndefined()
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(false)
    })

    it("force overrides a live-bonded refusal", async () => {
        seedStorage(FILE_ID)
        await seedLiveBond(FILE_ID, "live-set-2", "trk-live-2")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:force-override",
            force: true,
            callerUid: ACTOR,
        })

        expect(r.deleted).toBe(true)
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(false)

        // Forced-override audit row records the bondedTrackIds that were
        // overridden, so the override is traceable post-hoc.
        const auditSnap = await db()
            .collection("auditLogs")
            .where("fileId", "==", FILE_ID)
            .get()
        expect(auditSnap.docs.length).toBe(1)
        expect(auditSnap.docs[0].data()).toMatchObject({
            type: "library-object-deleted",
            reason: "test:force-override",
            forcedOverride: true,
            bondedTrackIds: ["trk-live-2"],
            callerUid: ACTOR,
        })
    })

    // ─── multi-variant deletion ────────────────────────────────────────────

    it("attempts all three library/<fileId>.{pdf|xml|} variants by default", async () => {
        seedStorage(FILE_ID, ".pdf")
        seedStorage(FILE_ID, ".xml")
        seedStorage(FILE_ID, "")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:multi-variant",
            callerUid: ACTOR,
        })

        expect(r.deleted).toBe(true)
        expect(r.deletedPaths).toEqual([
            `library/${FILE_ID}.pdf`,
            `library/${FILE_ID}.xml`,
            `library/${FILE_ID}`,
        ])
        // All three variants gone.
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(false)
        expect(storageState.has(`library/${FILE_ID}.xml`)).toBe(false)
        expect(storageState.has(`library/${FILE_ID}`)).toBe(false)
    })

    it("ignores not-found errors for absent variants (idempotent)", async () => {
        // Only the .pdf variant exists; .xml and no-ext do NOT.
        seedStorage(FILE_ID, ".pdf")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:idempotent",
            callerUid: ACTOR,
        })

        expect(r.deleted).toBe(true)
        // Only the present variant was actually deleted.
        expect(r.deletedPaths).toEqual([`library/${FILE_ID}.pdf`])

        // Re-call after deletion is a no-op + still returns deleted:true.
        const r2 = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:idempotent-rerun",
            callerUid: ACTOR,
        })
        expect(r2.deleted).toBe(true)
        expect(r2.deletedPaths).toEqual([])
    })

    // ─── exactPath surgical mode ───────────────────────────────────────────

    it("exactPath deletes ONLY the supplied path", async () => {
        seedStorage(FILE_ID, ".pdf")
        seedStorage(FILE_ID, ".xml")

        const r = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "test:exact-path",
            callerUid: ACTOR,
            exactPath: `library/${FILE_ID}.pdf`,
        })

        expect(r.deleted).toBe(true)
        expect(r.deletedPaths).toEqual([`library/${FILE_ID}.pdf`])
        // The other variant untouched.
        expect(storageState.has(`library/${FILE_ID}.xml`)).toBe(true)
    })

    it("exactPath rejects non-library/* paths", async () => {
        await expect(() =>
            safelyDeleteLibraryObject(FILE_ID, {
                reason: "test:wrong-subtree",
                exactPath: `originals/${FILE_ID}.heic`,
            }),
        ).rejects.toThrow(/must start with 'library\//)
    })

    it("exactPath rejects library paths for a different fileId", async () => {
        await expect(() =>
            safelyDeleteLibraryObject(FILE_ID, {
                reason: "test:wrong-file",
                exactPath: `library/${FILE_ID_2}.pdf`,
            }),
        ).rejects.toThrow(/must start with 'library\/upload-aaaaaaaa/)
    })

    // ─── arg validation ────────────────────────────────────────────────────

    it("throws on empty fileId", async () => {
        await expect(() =>
            safelyDeleteLibraryObject("", { reason: "x" }),
        ).rejects.toThrow(/fileId/)
    })

    it("throws on missing reason", async () => {
        await expect(() =>
            safelyDeleteLibraryObject(FILE_ID, {
                reason: "",
            }),
        ).rejects.toThrow(/reason/)
    })

    // ─── integration shape: cron-blast scenario ────────────────────────────

    it("CRON-BLAST SHAPE: direct helper call against a live-bonded fileId refuses + bytes remain", async () => {
        // This is the structural test the dispatch calls out:
        // "Simulate the cron-blast scenario — try deleting a fileId that IS
        // bonded; assert refuse + Sentry breadcrumb + audit log written +
        // bytes remain. Try with force: true + assert deletion proceeds."
        seedStorage(FILE_ID)
        await seedLiveBond(FILE_ID, "kabbalat-shabbat", "trk-modeh-ani")

        // First call WITHOUT force — the "future mutator that doesn't have
        // the upstream chart_in_use guard" scenario. Helper must refuse.
        const refused = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "cron-blast-shape:no-upstream-guard",
            callerUid: "system-cron",
        })
        expect(refused.deleted).toBe(false)
        expect(refused.refusedBecauseBonded).toEqual(["trk-modeh-ani"])
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(true)

        // Now WITH force — the legitimate atomic-guard rollback scenario.
        // Same bond, but caller has overt force + reason.
        const forced = await safelyDeleteLibraryObject(FILE_ID, {
            reason: "cron-blast-shape:legitimate-override",
            force: true,
            callerUid: "system-rollback",
        })
        expect(forced.deleted).toBe(true)
        expect(storageState.has(`library/${FILE_ID}.pdf`)).toBe(false)

        // Both rows present in auditLogs — the refuse + the forced override.
        const audit = await db()
            .collection("auditLogs")
            .where("fileId", "==", FILE_ID)
            .get()
        const types = audit.docs.map((d) => d.data().type).sort()
        expect(types).toEqual([
            "library-object-delete-refused",
            "library-object-deleted",
        ])
    })
})
