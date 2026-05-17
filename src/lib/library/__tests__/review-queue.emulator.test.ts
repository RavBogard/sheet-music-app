/**
 * Cycle-3 NEW-4 (A4) — review-queue emulator tests.
 *
 * Covers the shared logic backing `/api/admin/library-review/*`:
 *   - readReviewQueue: joins library_index + aiEnrichmentRetryQueue +
 *     chartImportQueue + aiConfig; hydrates duplicate_candidates titles;
 *     filters dismissed import rows.
 *   - acceptEnrichment: gap-fill only; never overwrites human-set fields;
 *     never overwrites collection; clears retry queue.
 *   - rejectEnrichment: idempotent; clears retry queue.
 *   - editEnrichment: invalid_field guards; humanRenamedAt stamp on title edit.
 *   - retryFailed: enrichment rewinds doc; import deletes doc.
 *   - dismissFailed: enrichment + import branches.
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
import {
    getFirestore,
    type Firestore,
} from "firebase-admin/firestore"

import {
    acceptEnrichment,
    dismissFailed,
    editEnrichment,
    readReviewQueue,
    rejectEnrichment,
    retryFailed,
} from "../review-queue"
import type { EnrichmentOutput } from "../ai-enrichment"

const ACTOR = "rabbi-daniel"

function passingSuggestion(
    overrides: Partial<EnrichmentOutput> = {},
): EnrichmentOutput {
    return {
        is_chart: true,
        confidence: 0.92,
        suggested_title: "Shalom Rav (Frankel)",
        suggested_collection: "supplemental",
        collection_disagrees_with_folder: false,
        suggested_key: "G",
        suggested_bpm: null,
        suggested_lead: null,
        suggested_tags: ["friday-evening", "frankel"],
        duplicate_candidates: [],
        concerns: [],
        review_required: false,
        ...overrides,
    }
}

async function seedReviewRow(
    db: Firestore,
    id: string,
    extra: Record<string, unknown> = {},
    suggestion: EnrichmentOutput | null = passingSuggestion(),
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
            enrichmentStatus: "review_pending",
            aiSuggestion: suggestion,
            aiReviewTriggers: suggestion ? ["low_confidence"] : [],
            enrichmentRanAt: "2026-05-18T16:00:00.000Z",
            ...extra,
        })
}

async function seedFailedRow(
    db: Firestore,
    id: string,
    error: string = "sonnet 503",
) {
    await db
        .collection("library_index")
        .doc(id)
        .set({
            name: "Niggun (Carlebach)",
            collection: "supplemental",
            mimeType: "application/pdf",
            fileSize: 23456,
            status: "active",
            uploadedBy: ACTOR,
            enrichmentStatus: "failed",
            enrichmentFailedAt: "2026-05-18T15:00:00.000Z",
            enrichmentLastError: error,
        })
    await db
        .collection("aiEnrichmentRetryQueue")
        .doc(id)
        .set({
            rowId: id,
            fileId: id,
            attempts: 4,
            lastError: error,
            exhaustedAt: "2026-05-18T15:00:00.000Z",
            updatedAt: "2026-05-18T15:00:00.000Z",
            event: {
                rowId: id,
                fileId: id,
                source: "upload",
                nameLower: "niggun (carlebach)",
                title: "Niggun (Carlebach)",
                mimeType: "application/pdf",
                sizeBytes: 23456,
                collection: "supplemental",
                storagePath: `library/${id}.pdf`,
                contentHash: "b".repeat(64),
                uploaderUid: ACTOR,
            },
        })
}

async function seedImportFailure(
    db: Firestore,
    id: string,
    extra: Record<string, unknown> = {},
) {
    await db
        .collection("chartImportQueue")
        .doc(id)
        .set({
            driveFileId: id,
            driveName: `${id}.pdf`,
            driveMimeType: "application/pdf",
            parents: ["folder-supplemental"],
            md5Checksum: "abc123",
            status: "drive_404",
            errorMessage: "File deleted in Drive before fetch.",
            attemptCount: 3,
            firstSeenAt: "2026-05-18T14:00:00.000Z",
            lastAttemptAt: "2026-05-18T15:00:00.000Z",
            ...extra,
        })
}

describe("Library Review Queue — NEW-4 (emulator)", () => {
    let app: App

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-library-review" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    function db() {
        return getFirestore(app)
    }

    beforeEach(async () => {
        for (const coll of [
            "library_index",
            "aiConfig",
            "aiEnrichmentRetryQueue",
            "chartImportQueue",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // ─── readReviewQueue ──────────────────────────────────────────────────

    describe("readReviewQueue", () => {
        it("joins all three queues + filters dismissed import rows + hydrates duplicate_candidates", async () => {
            await seedReviewRow(db(), "upload-1")
            await seedReviewRow(
                db(),
                "upload-with-dupe",
                {},
                passingSuggestion({
                    duplicate_candidates: ["upload-1", "missing-row"],
                }),
            )
            await seedFailedRow(db(), "upload-2")
            await seedImportFailure(db(), "drive-1")
            await seedImportFailure(db(), "drive-2", {
                dismissed: true,
                dismissedAt: "2026-05-18T15:30:00.000Z",
            })
            await db()
                .collection("aiConfig")
                .doc("autoApplyEnabled")
                .set({ enabled: false, threshold: 0.8 })

            const result = await readReviewQueue(db())

            expect(result.aiReview).toHaveLength(2)
            expect(result.aiFailed).toHaveLength(1)
            expect(result.importFailures).toHaveLength(1)
            expect(result.importFailures[0].driveFileId).toBe("drive-1")
            expect(result.config.autoApplyEnabled).toBe(false)
            expect(result.config.threshold).toBe(0.8)

            const dupeRow = result.aiReview.find(
                (r) => r.rowId === "upload-with-dupe",
            )
            expect(dupeRow).toBeDefined()
            expect(dupeRow!.duplicateCandidates).toHaveLength(1)
            expect(dupeRow!.duplicateCandidates[0].rowId).toBe("upload-1")

            const failed = result.aiFailed[0]
            expect(failed.rowId).toBe("upload-2")
            expect(failed.attempts).toBe(4)
            expect(failed.lastError).toMatch(/sonnet 503/)
        })

        it("returns DEFAULT_CONFIDENCE_THRESHOLD when aiConfig is missing", async () => {
            const result = await readReviewQueue(db())
            expect(result.config.threshold).toBe(0.7)
            expect(result.config.autoApplyEnabled).toBe(false)
        })
    })

    // ─── acceptEnrichment ────────────────────────────────────────────────

    describe("acceptEnrichment", () => {
        it("applies gap-fillers + sets enrichmentStatus:'enriched'", async () => {
            await seedReviewRow(db(), "upload-1")

            const result = await acceptEnrichment(db(), "upload-1", ACTOR)

            expect(result.ok).toBe(true)
            const row = (
                await db().collection("library_index").doc("upload-1").get()
            ).data()
            expect(row?.enrichmentStatus).toBe("enriched")
            expect(row?.key).toBe("G")
            expect(row?.tags).toEqual(["friday-evening", "frankel"])
            expect(row?.name).toBe("Shalom Rav (Frankel)") // suggested_title applied
            expect(row?.collection).toBe("uploads") // NEVER overwritten
            expect(row?.enrichmentReviewedBy).toBe(ACTOR)
        })

        it("NEVER overwrites human-set key/bpm/tags/lead", async () => {
            await seedReviewRow(db(), "upload-1", {
                key: "Bb",
                bpm: 72,
                tags: ["high-holy-days"],
                leadMusician: "Rabbi Daniel",
            })

            await acceptEnrichment(db(), "upload-1", ACTOR)

            const row = (
                await db().collection("library_index").doc("upload-1").get()
            ).data()
            expect(row?.key).toBe("Bb")
            expect(row?.bpm).toBe(72)
            expect(row?.tags).toEqual(["high-holy-days"])
            expect(row?.leadMusician).toBe("Rabbi Daniel")
            expect(row?.enrichmentStatus).toBe("enriched")
        })

        it("NEVER overwrites human-renamed title (humanRenamedAt stamp)", async () => {
            await seedReviewRow(db(), "upload-1", {
                name: "Custom Title",
                humanRenamedAt: "2026-05-18T10:00:00.000Z",
            })
            await acceptEnrichment(db(), "upload-1", ACTOR)
            const row = (
                await db().collection("library_index").doc("upload-1").get()
            ).data()
            expect(row?.name).toBe("Custom Title")
        })

        it("returns row_not_found rich envelope for missing row", async () => {
            const result = await acceptEnrichment(db(), "nope", ACTOR)
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.code).toBe("row_not_found")
            }
        })

        it("returns invalid_state when row has no aiSuggestion", async () => {
            await seedReviewRow(db(), "upload-1", {}, null)
            const result = await acceptEnrichment(db(), "upload-1", ACTOR)
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.code).toBe("invalid_state")
            }
        })

        it("is idempotent — running twice on the same row leaves status:'enriched'", async () => {
            await seedReviewRow(db(), "upload-1")
            await acceptEnrichment(db(), "upload-1", ACTOR)
            const r2 = await acceptEnrichment(db(), "upload-1", ACTOR)
            expect(r2.ok).toBe(true)
            const row = (
                await db().collection("library_index").doc("upload-1").get()
            ).data()
            expect(row?.enrichmentStatus).toBe("enriched")
        })
    })

    // ─── rejectEnrichment ────────────────────────────────────────────────

    describe("rejectEnrichment", () => {
        it("sets human_rejected + clears retry queue", async () => {
            await seedReviewRow(db(), "upload-1")
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc("upload-1")
                .set({ rowId: "upload-1", attempts: 2 })

            const result = await rejectEnrichment(db(), "upload-1", ACTOR)
            expect(result.ok).toBe(true)
            const row = (
                await db().collection("library_index").doc("upload-1").get()
            ).data()
            expect(row?.enrichmentStatus).toBe("human_rejected")
            const queue = await db()
                .collection("aiEnrichmentRetryQueue")
                .doc("upload-1")
                .get()
            expect(queue.exists).toBe(false)
        })
    })

    // ─── editEnrichment ──────────────────────────────────────────────────

    describe("editEnrichment", () => {
        it("applies operator edits + sets status:'human_curated' + stamps humanRenamedAt on title edit", async () => {
            await seedReviewRow(db(), "upload-1")
            const result = await editEnrichment(
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
            expect(result.ok).toBe(true)
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
            expect(row?.humanRenamedAt).toBeDefined()
        })

        it("rejects invalid bpm with invalid_field envelope", async () => {
            await seedReviewRow(db(), "upload-1")
            const result = await editEnrichment(
                db(),
                "upload-1",
                { bpm: -1 },
                ACTOR,
            )
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.code).toBe("invalid_field")
            }
        })

        it("allows bpm:null to explicitly clear the field", async () => {
            await seedReviewRow(db(), "upload-1", { bpm: 80 })
            const result = await editEnrichment(
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
    })

    // ─── retryFailed ─────────────────────────────────────────────────────

    describe("retryFailed", () => {
        it("kind='enrichment' rewinds the retry queue doc + flips row back to pending", async () => {
            await seedFailedRow(db(), "upload-2")
            const result = await retryFailed(
                db(),
                "upload-2",
                "enrichment",
                ACTOR,
            )
            expect(result.ok).toBe(true)
            const queue = (
                await db()
                    .collection("aiEnrichmentRetryQueue")
                    .doc("upload-2")
                    .get()
            ).data()
            expect(queue?.attempts).toBe(0)
            expect(queue?.nextRetryAt).toBeDefined()
            expect(queue?.exhaustedAt).toBeUndefined()
            const row = (
                await db().collection("library_index").doc("upload-2").get()
            ).data()
            expect(row?.enrichmentStatus).toBe("pending")
        })

        it("kind='import' deletes the chartImportQueue doc", async () => {
            await seedImportFailure(db(), "drive-1")
            const result = await retryFailed(db(), "drive-1", "import", ACTOR)
            expect(result.ok).toBe(true)
            const queue = await db()
                .collection("chartImportQueue")
                .doc("drive-1")
                .get()
            expect(queue.exists).toBe(false)
        })

        it("returns queue_doc_missing rich envelope when queue doc absent", async () => {
            const result = await retryFailed(
                db(),
                "ghost",
                "enrichment",
                ACTOR,
            )
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.code).toBe("queue_doc_missing")
            }
        })
    })

    // ─── dismissFailed ───────────────────────────────────────────────────

    describe("dismissFailed", () => {
        it("kind='enrichment' marks row human_rejected + clears retry doc", async () => {
            await seedFailedRow(db(), "upload-2")
            const result = await dismissFailed(
                db(),
                "upload-2",
                "enrichment",
                ACTOR,
            )
            expect(result.ok).toBe(true)
            const row = (
                await db().collection("library_index").doc("upload-2").get()
            ).data()
            expect(row?.enrichmentStatus).toBe("human_rejected")
            const queue = await db()
                .collection("aiEnrichmentRetryQueue")
                .doc("upload-2")
                .get()
            expect(queue.exists).toBe(false)
        })

        it("kind='import' marks chartImportQueue.dismissed:true (next failure overwrites)", async () => {
            await seedImportFailure(db(), "drive-1")
            const result = await dismissFailed(
                db(),
                "drive-1",
                "import",
                ACTOR,
            )
            expect(result.ok).toBe(true)
            const queue = (
                await db().collection("chartImportQueue").doc("drive-1").get()
            ).data()
            expect(queue?.dismissed).toBe(true)
            expect(queue?.dismissedBy).toBe(ACTOR)
        })

        it("import dismiss returns queue_doc_missing for non-existent rows", async () => {
            const result = await dismissFailed(
                db(),
                "ghost-drive",
                "import",
                ACTOR,
            )
            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.code).toBe("queue_doc_missing")
            }
        })
    })
})
