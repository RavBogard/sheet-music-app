/**
 * Wave-2 ingest-mutator-matrix F-7 — emulator coverage of the rename +
 * applyLibraryEntryEdit W-02 recompute fix.
 *
 * Goals:
 *   1. `applyLibraryEntryEdit` title-branch writes all 5 W-02 fields against
 *      a real Firestore (emulator).
 *   2. PCU's fuzzy-dedup range query (`normalizedName >= prefix`)
 *      finds a row by its NEW normalizedName after applyLibraryEntryEdit runs.
 *   3. siblingsInCatalog excludes self + orphaned rows when counting.
 *   4. drive-sync's `handleExistingFile` does NOT loop on a row
 *      renamed via applyLibraryEntryEdit when Drive's view of the file is
 *      unchanged (see also `.paul/research/recompute-w02-fields/
 *      DRIVE-SYNC-LOOP-TRACE.md`).
 *
 * Uses the same emulator-app + cleanup pattern as
 * `library-entry-edit.emulator.test.ts`.
 */

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    initializeApp,
    deleteApp,
    getApps,
    type App,
} from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

import { applyLibraryEntryEdit } from "../library-entry-edit"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"
import { recomputeIndexNameFields } from "../recompute-index-name-fields"

const ACTOR = "rabbi-daniel"

async function seedRow(
    db: Firestore,
    id: string,
    name: string,
    extra: Record<string, unknown> = {},
) {
    const stem = bareStem(name)
    const nameLower = name.toLowerCase()
    const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
    await db
        .collection("library_index")
        .doc(id)
        .set({
            name,
            nameLower,
            normalizedName,
            stem,
            titleSpecificity: titleSpecificity(name, 1),
            collection: "uploads",
            mimeType: "application/pdf",
            fileSize: 12345,
            status: "active",
            uploadedBy: ACTOR,
            originalName: `${name}.pdf`,
            // Legacy enrichment fields an existing row may still carry;
            // applyLibraryEntryEdit gates on row existence only and
            // tolerates them.
            enrichmentStatus: "review_pending",
            aiSuggestion: null,
            ...extra,
        })
}

describe("F-7 W-02 recompute on rename + applyLibraryEntryEdit (emulator)", () => {
    let app: App

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-f7-w02-recompute" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    function db() {
        return getFirestore(app)
    }

    beforeEach(async () => {
        for (const coll of ["library_index", "songs"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    it("applyLibraryEntryEdit title-edit writes ALL 5 W-02 fields on the row", async () => {
        await seedRow(db(), "row-1", "Hashkivenu")

        const result = await applyLibraryEntryEdit(
            db(),
            "row-1",
            { title: "Hashkivenu (Klepper-Freelander)" },
            ACTOR,
        )
        expect(result.ok).toBe(true)

        const snap = await db().collection("library_index").doc("row-1").get()
        const row = snap.data()!
        const expected = recomputeIndexNameFields(
            "Hashkivenu (Klepper-Freelander)",
            1, // no siblings seeded → count = self only
        )
        expect(row.name).toBe("Hashkivenu (Klepper-Freelander)")
        expect(row.nameLower).toBe(expected.nameLower)
        expect(row.normalizedName).toBe(expected.normalizedName)
        expect(row.stem).toBe(expected.stem)
        expect(row.titleSpecificity).toBe(expected.titleSpecificity)
        expect(row.humanRenamedAt).toBeTruthy()
        expect(row.enrichmentStatus).toBe("human_curated")
    })

    it("PCU's fuzzy-dedup range query finds the renamed row by NEW normalizedName prefix", async () => {
        await seedRow(db(), "row-old", "Old Made Up Title")

        // Rename via applyLibraryEntryEdit.
        await applyLibraryEntryEdit(
            db(),
            "row-old",
            { title: "Mi Chamocha (Klepper)" },
            ACTOR,
        )

        // Mirror PCU's range query at `library-upload.ts:417-431`:
        //   const prefix     = normalizedName.slice(0, 6)
        //   const prefixEnd  = prefix.slice(0, -1) + nextChar(...)
        const expected = recomputeIndexNameFields("Mi Chamocha (Klepper)", 1)
        const prefix = expected.normalizedName.slice(0, 6)
        const lastCh = prefix.slice(-1)
        const nextCh = String.fromCharCode(lastCh.charCodeAt(0) + 1)
        const prefixEnd = prefix.slice(0, -1) + nextCh

        const fuzzySnap = await db()
            .collection("library_index")
            .where("normalizedName", ">=", prefix)
            .where("normalizedName", "<", prefixEnd)
            .get()
        const ids = fuzzySnap.docs.map((d) => d.id)
        expect(ids).toContain("row-old")
    })

    it("applyLibraryEntryEdit siblingsInCatalog excludes self + orphans when counting", async () => {
        // Seed 4 rows with stem "hashkivenu":
        //   - row-self  (the one we'll rename TO hashkivenu)
        //   - row-sib-a active
        //   - row-sib-b active
        //   - row-sib-orphan orphaned
        await seedRow(db(), "row-self", "Unrelated Original")
        await seedRow(db(), "row-sib-a", "Hashkivenu", {
            // Already stem=hashkivenu via seedRow's bareStem call.
        })
        await seedRow(db(), "row-sib-b", "Hashkivenu (Mishkan T'filah)")
        await seedRow(db(), "row-sib-orphan", "Hashkivenu", {
            status: "orphaned",
        })

        await applyLibraryEntryEdit(
            db(),
            "row-self",
            { title: "Hashkivenu (Klepper)" },
            ACTOR,
        )

        const snap = await db().collection("library_index").doc("row-self").get()
        const row = snap.data()!
        // Active stem-hashkivenu siblings: row-sib-a + row-sib-b = 2.
        // Including self = 3.
        const expected = recomputeIndexNameFields(
            "Hashkivenu (Klepper)",
            3,
        )
        expect(row.titleSpecificity).toBe(expected.titleSpecificity)
        expect(row.stem).toBe(expected.stem)
    })

    it("drive-sync loop trace: applyLibraryEntryEdit does NOT mutate originalName, so handleExistingFile's nameChanged stays false on the next Drive tick", async () => {
        // Seed a row whose `originalName` reflects a Drive file name.
        await seedRow(db(), "drive-row-1", "Original Drive Title", {
            driveFileId: "drive-1",
            originalName: "Original Drive Title.pdf",
        })

        // UI rename via applyLibraryEntryEdit.
        await applyLibraryEntryEdit(
            db(),
            "drive-row-1",
            { title: "New UI Title" },
            ACTOR,
        )

        // Simulate drive-sync's handleExistingFile checks: Drive's view
        // of the file is unchanged.
        const snap = await db()
            .collection("library_index")
            .doc("drive-row-1")
            .get()
        const row = snap.data()!
        const driveName = "Original Drive Title.pdf" // Drive unchanged
        const rowName = row.name as string
        const newTitle = driveName.replace(/\.[a-z0-9]+$/i, "")
        const nameChangedLeftConjunct = driveName !== row.originalName
        const nameChangedRightConjunct = newTitle !== rowName
        const nameChanged =
            nameChangedLeftConjunct && nameChangedRightConjunct

        // The right conjunct IS true (rowName = "New UI Title", newTitle
        // = "Original Drive Title") but the LEFT conjunct is FALSE
        // (driveName === originalName, both = "Original Drive Title.pdf"),
        // so the AND short-circuits → no rename branch fires → no loop.
        expect(nameChangedLeftConjunct).toBe(false)
        expect(nameChangedRightConjunct).toBe(true)
        expect(nameChanged).toBe(false)
    })
})
