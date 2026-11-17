/**
 * `applyLibraryEntryEdit` — the write behind `edit_library_entry`.
 *
 * Ported from the `editEnrichment` block of the retired
 * `review-queue.emulator.test.ts` when the AI enrichment layer was removed.
 * Rows are seeded with the legacy enrichment fields an existing
 * `library_index` row may still carry, to show the edit tolerates them.
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

const ACTOR = "rabbi-daniel"

async function seedRow(
    db: Firestore,
    id: string,
    extra: Record<string, unknown> = {},
) {
    await db
        .collection("library_index")
        .doc(id)
        .set({
            name: "Shalom Rav RAW",
            nameLower: "shalom rav raw",
            collection: "uploads",
            mimeType: "application/pdf",
            fileSize: 12345,
            status: "active",
            uploadedBy: ACTOR,
            // Legacy AI enrichment fields, left on rows in production.
            enrichmentStatus: "review_pending",
            aiSuggestion: { is_chart: true, confidence: 0.92, suggested_key: "G" },
            aiReviewTriggers: ["low_confidence"],
            ...extra,
        })
}

describe("applyLibraryEntryEdit (emulator)", () => {
    let app: App

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-library-entry-edit" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    function db() {
        return getFirestore(app)
    }

    beforeEach(async () => {
        const snap = await db().collection("library_index").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("applies operator edits + sets status:'human_curated' + stamps humanRenamedAt on title edit", async () => {
        await seedRow(db(), "upload-1")
        const result = await applyLibraryEntryEdit(
            db(),
            "upload-1",
            {
                title: "Shalom Rav — Frankel arrangement",
                collection: "core",
                key: "F",
                bpm: 96,
                tags: ["friday-evening"],
            },
            ACTOR,
        )
        expect(result).toEqual({ ok: true, rowId: "upload-1", status: "human_curated" })
        const row = (
            await db().collection("library_index").doc("upload-1").get()
        ).data()
        expect(row?.name).toBe("Shalom Rav — Frankel arrangement")
        expect(row?.nameLower).toBe("shalom rav — frankel arrangement")
        expect(row?.collection).toBe("core")
        expect(row?.key).toBe("F")
        expect(row?.bpm).toBe(96)
        expect(row?.tags).toEqual(["friday-evening"])
        expect(row?.enrichmentStatus).toBe("human_curated")
        expect(row?.enrichmentReviewedBy).toBe(ACTOR)
        expect(row?.humanRenamedAt).toBeDefined()
        // The stored suggestion is left as it was.
        expect(row?.aiSuggestion?.suggested_key).toBe("G")
    })

    it("returns row_not_found for a missing row", async () => {
        const result = await applyLibraryEntryEdit(db(), "nope", { key: "C" }, ACTOR)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.code).toBe("row_not_found")
    })

    it("rejects invalid bpm with invalid_field and writes nothing", async () => {
        await seedRow(db(), "upload-1", { bpm: 80 })
        const result = await applyLibraryEntryEdit(
            db(),
            "upload-1",
            { bpm: -1 },
            ACTOR,
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.code).toBe("invalid_field")
        }
        const row = (await db().collection("library_index").doc("upload-1").get()).data()
        expect(row?.bpm).toBe(80)
        expect(row?.enrichmentStatus).toBe("review_pending")
    })

    it("allows bpm:null to explicitly clear the field", async () => {
        await seedRow(db(), "upload-1", { bpm: 80 })
        const result = await applyLibraryEntryEdit(
            db(),
            "upload-1",
            { bpm: null },
            ACTOR,
        )
        expect(result.ok).toBe(true)
        const row = (
            await db().collection("library_index").doc("upload-1").get()
        ).data()
        expect(row?.bpm).toBeNull()
    })

    it("records a person's setting/part as human; a later rename keeps them and moves partGroup", async () => {
        await seedRow(db(), "upload-1", { name: "Barchu (Walkdown) Bb" })
        const set = await applyLibraryEntryEdit(db(), "upload-1", { setting: "Walkdown", part: "Bb" }, ACTOR)
        expect(set.ok).toBe(true)
        let row = (await db().collection("library_index").doc("upload-1").get()).data()
        expect(row?.setting).toBe("Walkdown")
        expect(row?.part).toBe("Bb")
        expect(row?.settingSource).toBe("human")
        expect(row?.partGroup).toBe("barchu walkdown")

        const renamed = await applyLibraryEntryEdit(db(), "upload-1", { title: "Barchu (Friedman) Eb" }, ACTOR)
        expect(renamed.ok).toBe(true)
        row = (await db().collection("library_index").doc("upload-1").get()).data()
        expect(row?.setting).toBe("Walkdown")
        expect(row?.part).toBe("Bb")
        expect(row?.partGroup).toBe("barchu friedman")
    })

    it("a title edit on an unset row computes setting, part and partGroup", async () => {
        await seedRow(db(), "upload-1")
        await applyLibraryEntryEdit(db(), "upload-1", { title: "Barchu (Friedman) Eb" }, ACTOR)
        const row = (await db().collection("library_index").doc("upload-1").get()).data()
        expect(row?.setting).toBe("Friedman")
        expect(row?.part).toBe("Eb")
        expect(row?.partGroup).toBe("barchu friedman")
    })
})
