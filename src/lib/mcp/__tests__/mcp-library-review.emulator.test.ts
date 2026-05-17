import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    listReviewQueue,
    getEnrichmentSuggestion,
    acceptEnrichment,
    rejectEnrichment,
    editEnrichment,
    retryEnrichment,
    dismissFailure,
} from "../tools/library-review"
import type { EnrichmentOutput } from "@/lib/library/ai-enrichment"

/**
 * Cycle-3 a5 — MCP-tool counterpart to a4's /manage/library-review UI.
 *
 * Test posture mirrors mcp-ai-config / mcp-reconcile-library:
 *  - emulator-backed (Firestore-only; no MCP wire)
 *  - admin gate refusal returns the rich `forbidden_role` envelope
 *  - dryRun-default; real-run without `force: true` refuses with rich force_required envelope (REG-003)
 *  - force: true commits and is idempotent on a second run
 *  - integration with a4's shared `src/lib/library/review-queue.ts` helper
 *    (no duplication of action semantics)
 */
describe("MCP library-review tools — cycle-3 a5 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-band-leader"
    const MUSICIAN = "test-musician-1"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }

    function suggestion(overrides: Partial<EnrichmentOutput> = {}): EnrichmentOutput {
        return {
            is_chart: true,
            confidence: 0.82,
            suggested_title: "Shalom Rav (Frankel)",
            suggested_collection: "core",
            collection_disagrees_with_folder: false,
            suggested_key: "G",
            suggested_bpm: 72,
            suggested_lead: "Daniel",
            suggested_tags: ["hebrew", "shabbat"],
            duplicate_candidates: [],
            concerns: [],
            review_required: true,
            ...overrides,
        }
    }

    async function seedReviewRow(
        rowId: string,
        extras: Record<string, unknown> = {},
    ) {
        await db()
            .collection("library_index")
            .doc(rowId)
            .set({
                name: rowId,
                nameLower: rowId.toLowerCase(),
                collection: "uploads",
                mimeType: "application/pdf",
                fileSize: 100_000,
                source: "drive-sync",
                status: "active",
                enrichmentStatus: "review_pending",
                aiSuggestion: suggestion(),
                aiReviewTriggers: ["low_confidence"],
                enrichmentRanAt: "2026-05-18T00:00:00Z",
                ...extras,
            })
    }

    async function seedFailedRow(rowId: string) {
        await db()
            .collection("library_index")
            .doc(rowId)
            .set({
                name: rowId,
                collection: "uploads",
                mimeType: "application/pdf",
                fileSize: 50_000,
                source: "upload",
                status: "active",
                enrichmentStatus: "failed",
                enrichmentLastError: "Sonnet 5xx",
                enrichmentFailedAt: "2026-05-18T01:00:00Z",
            })
        await db()
            .collection("aiEnrichmentRetryQueue")
            .doc(rowId)
            .set({
                attempts: 5,
                lastError: "Sonnet 5xx",
                exhaustedAt: "2026-05-18T01:00:00Z",
            })
    }

    async function seedImportFailure(driveFileId: string) {
        await db()
            .collection("chartImportQueue")
            .doc(driveFileId)
            .set({
                driveName: "David-Drop/dust.pdf",
                driveMimeType: "application/pdf",
                parents: ["folder-david-drop"],
                md5Checksum: "abc123",
                status: "mime_unrecognized",
                errorMessage: "no mime",
                attemptCount: 3,
                firstSeenAt: "2026-05-18T00:00:00Z",
                lastAttemptAt: "2026-05-18T00:30:00Z",
            })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-library-review" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of [
            "library_index",
            "aiEnrichmentRetryQueue",
            "chartImportQueue",
            "aiConfig",
            "users",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(BAND_LEADER, "band_leader")
        await seedUser(MUSICIAN, "musician")
    })

    // ─── admin gate ────────────────────────────────────────────────────────

    it("list_review_queue: refuses non-admin with rich forbidden_role envelope", async () => {
        const r = await listReviewQueue(MUSICIAN, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            callerRole: "musician",
            requiredRoles: ["admin"],
        })
        expect("hint" in r && r.hint).toBeTruthy()
    })

    it("list_review_queue: refuses band_leader (admin-only — broader than write-tools)", async () => {
        const r = await listReviewQueue(BAND_LEADER, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            callerRole: "band_leader",
        })
    })

    it("accept_enrichment: refuses non-admin", async () => {
        await seedReviewRow("row-1")
        const r = await acceptEnrichment(MUSICIAN, { rowId: "row-1" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("retry_enrichment: refuses non-admin", async () => {
        const r = await retryEnrichment(MUSICIAN, { rowId: "row-x" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    // ─── list_review_queue ────────────────────────────────────────────────

    it("list_review_queue: returns empty buckets when nothing's queued", async () => {
        const r = await listReviewQueue(ADMIN, {})
        expect(r).toMatchObject({
            ok: true,
            kind: "all",
            status: "all",
            aiReview: [],
            aiFailed: [],
            importFailures: [],
            counts: { aiReview: 0, aiFailed: 0, importFailures: 0, total: 0 },
            truncated: false,
        })
    })

    it("list_review_queue: returns all three buckets and the config banner", async () => {
        await seedReviewRow("row-A")
        await seedFailedRow("row-B")
        await seedImportFailure("drive-C")
        await db().collection("aiConfig").doc("autoApplyEnabled").set({
            enabled: false,
            threshold: 0.7,
        })

        const r = await listReviewQueue(ADMIN, {})
        if (!("aiReview" in r)) throw new Error("expected success")
        expect(r.counts.total).toBe(3)
        expect(r.aiReview.map((x) => x.rowId)).toEqual(["row-A"])
        expect(r.aiFailed.map((x) => x.rowId)).toEqual(["row-B"])
        expect(r.importFailures.map((x) => x.driveFileId)).toEqual(["drive-C"])
        expect(r.config).toMatchObject({
            autoApplyEnabled: false,
            threshold: 0.7,
        })
    })

    it("list_review_queue: kind='import' returns ONLY importFailures", async () => {
        await seedReviewRow("row-A")
        await seedFailedRow("row-B")
        await seedImportFailure("drive-C")

        const r = await listReviewQueue(ADMIN, { kind: "import" })
        if (!("aiReview" in r)) throw new Error("expected success")
        expect(r.aiReview).toEqual([])
        expect(r.aiFailed).toEqual([])
        expect(r.importFailures.map((x) => x.driveFileId)).toEqual(["drive-C"])
    })

    it("list_review_queue: status='review_pending' excludes failed + import buckets", async () => {
        await seedReviewRow("row-A")
        await seedFailedRow("row-B")
        await seedImportFailure("drive-C")

        const r = await listReviewQueue(ADMIN, {
            status: "review_pending",
        })
        if (!("aiReview" in r)) throw new Error("expected success")
        expect(r.aiReview.length).toBe(1)
        expect(r.aiFailed).toEqual([])
        expect(r.importFailures).toEqual([])
    })

    it("list_review_queue: limit caps per-bucket and reports truncated", async () => {
        for (let i = 0; i < 5; i++) await seedReviewRow(`row-${i}`)
        const r = await listReviewQueue(ADMIN, { limit: 2 })
        if (!("aiReview" in r)) throw new Error("expected success")
        expect(r.aiReview.length).toBe(2)
        expect(r.truncated).toBe(true)
    })

    it("list_review_queue: rejects bad kind with invalid_argument", async () => {
        const r = await listReviewQueue(ADMIN, {
            // @ts-expect-error — bad input on purpose
            kind: "nope",
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    // ─── get_enrichment_suggestion ────────────────────────────────────────

    it("get_enrichment_suggestion: returns full snapshot + hydrated duplicates", async () => {
        await seedReviewRow("dup-sib", { name: "Shalom Rav (Sibling)" })
        await seedReviewRow("row-A", {
            aiSuggestion: suggestion({
                duplicate_candidates: ["dup-sib"],
            }),
        })

        const r = await getEnrichmentSuggestion(ADMIN, { rowId: "row-A" })
        if (!("suggestion" in r)) throw new Error("expected success")
        expect(r.suggestion?.suggested_title).toBe("Shalom Rav (Frankel)")
        expect(r.duplicateCandidates).toEqual([
            {
                rowId: "dup-sib",
                title: "Shalom Rav (Sibling)",
                collection: "uploads",
            },
        ])
    })

    it("get_enrichment_suggestion: row_not_found rich envelope for missing row", async () => {
        const r = await getEnrichmentSuggestion(ADMIN, {
            rowId: "ghost",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "row_not_found" },
            rowId: "ghost",
        })
    })

    it("get_enrichment_suggestion: invalid_argument on empty rowId", async () => {
        const r = await getEnrichmentSuggestion(ADMIN, { rowId: "" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    // ─── accept_enrichment ────────────────────────────────────────────────

    it("accept_enrichment: dryRun returns plannedPatch without writing", async () => {
        await seedReviewRow("row-A")
        const r = await acceptEnrichment(ADMIN, { rowId: "row-A" })
        expect(r).toMatchObject({
            ok: true,
            rowId: "row-A",
            plannedStatus: "enriched",
            dryRun: true,
        })
        if (!("plannedPatch" in r)) throw new Error("expected plannedPatch")
        expect(r.plannedPatch).toMatchObject({ key: "G", bpm: 72 })

        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("review_pending")
        expect(after.data()?.key).toBeUndefined()
    })

    it("accept_enrichment: real-run without force → rich force_required envelope, no write", async () => {
        await seedReviewRow("row-A")
        const r = await acceptEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            rowId: "row-A",
            dryRunPlan: {
                plannedStatus: "enriched",
            },
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("review_pending")
    })

    it("accept_enrichment: force:true commits and is idempotent", async () => {
        await seedReviewRow("row-A")
        const first = await acceptEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
            force: true,
        })
        expect(first).toMatchObject({
            ok: true,
            status: "enriched",
            dryRun: false,
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("enriched")
        expect(after.data()?.key).toBe("G")
        expect(after.data()?.bpm).toBe(72)
        expect(after.data()?.enrichmentReviewedBy).toBe(ADMIN)

        // Re-run: status stays enriched; helper just re-stamps timestamps.
        const second = await acceptEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
            force: true,
        })
        expect(second).toMatchObject({ ok: true, status: "enriched" })
    })

    it("accept_enrichment: never overwrites human-set collection or `humanRenamedAt` title", async () => {
        await seedReviewRow("row-A", {
            name: "Operator Renamed",
            humanRenamedAt: "2026-05-17T00:00:00Z",
            key: "Em", // human pre-set
        })
        await acceptEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
            force: true,
        })
        const after = await db().collection("library_index").doc("row-A").get()
        // collection preserved (David's-subfolder authority — accept never overwrites)
        expect(after.data()?.collection).toBe("uploads")
        // title preserved (humanRenamedAt sticky)
        expect(after.data()?.name).toBe("Operator Renamed")
        // human-set key preserved
        expect(after.data()?.key).toBe("Em")
    })

    it("accept_enrichment: invalid_state when row has no aiSuggestion", async () => {
        await seedReviewRow("row-A", { aiSuggestion: null })
        const r = await acceptEnrichment(ADMIN, { rowId: "row-A" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_state" },
            rowId: "row-A",
        })
    })

    it("accept_enrichment: row_not_found for missing row", async () => {
        const r = await acceptEnrichment(ADMIN, { rowId: "ghost" })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "row_not_found" },
            rowId: "ghost",
        })
    })

    // ─── reject_enrichment ────────────────────────────────────────────────

    it("reject_enrichment: dryRun previews plannedStatus without write", async () => {
        await seedReviewRow("row-A")
        const r = await rejectEnrichment(ADMIN, { rowId: "row-A" })
        expect(r).toMatchObject({
            ok: true,
            dryRun: true,
            plannedStatus: "human_rejected",
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("review_pending")
    })

    it("reject_enrichment: force:true flips status + clears retry queue", async () => {
        await seedReviewRow("row-A")
        await db()
            .collection("aiEnrichmentRetryQueue")
            .doc("row-A")
            .set({ attempts: 2 })

        const r = await rejectEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "human_rejected",
            dryRun: false,
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("human_rejected")
        const retry = await db()
            .collection("aiEnrichmentRetryQueue")
            .doc("row-A")
            .get()
        expect(retry.exists).toBe(false)
    })

    // ─── edit_enrichment ──────────────────────────────────────────────────

    it("edit_enrichment: invalid_argument when edits is empty", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: {},
        })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
    })

    it("edit_enrichment: invalid_field for unknown key", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            // @ts-expect-error — unknown field on purpose
            edits: { nonsense: true },
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_field" },
            field: "nonsense",
        })
    })

    it("edit_enrichment: invalid_field for bad collection enum", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: {
                // @ts-expect-error — bad enum value on purpose
                collection: "bad",
            },
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_field" },
            field: "collection",
        })
    })

    it("edit_enrichment: invalid_field for negative bpm", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: { bpm: -1 },
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_field" },
            field: "bpm",
        })
    })

    it("edit_enrichment: dryRun returns plannedPatch with the edits payload", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: { title: "Custom Title", key: "Em" },
        })
        expect(r).toMatchObject({
            ok: true,
            dryRun: true,
            plannedStatus: "human_curated",
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.name).toBe("row-A")
    })

    it("edit_enrichment: force:true writes the edits + stamps humanRenamedAt", async () => {
        await seedReviewRow("row-A")
        const r = await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: {
                title: "Operator Title",
                collection: "core",
                key: "F",
                bpm: 90,
                tags: ["liturgy"],
            },
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "human_curated",
            dryRun: false,
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.enrichmentStatus).toBe("human_curated")
        expect(after.data()?.name).toBe("Operator Title")
        expect(after.data()?.collection).toBe("core")
        expect(after.data()?.key).toBe("F")
        expect(after.data()?.bpm).toBe(90)
        expect(after.data()?.tags).toEqual(["liturgy"])
        expect(typeof after.data()?.humanRenamedAt).toBe("string")
    })

    it("edit_enrichment: bpm:null clears the field", async () => {
        await seedReviewRow("row-A", { bpm: 72 })
        await editEnrichment(ADMIN, {
            rowId: "row-A",
            edits: { bpm: null },
            dryRun: false,
            force: true,
        })
        const after = await db().collection("library_index").doc("row-A").get()
        expect(after.data()?.bpm).toBeNull()
    })

    // ─── retry_enrichment ─────────────────────────────────────────────────

    it("retry_enrichment: enrichment kind rewinds the retry doc + flips status to pending", async () => {
        await seedFailedRow("row-B")
        const r = await retryEnrichment(ADMIN, {
            rowId: "row-B",
            kind: "enrichment",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "pending",
            dryRun: false,
        })
        const retry = await db()
            .collection("aiEnrichmentRetryQueue")
            .doc("row-B")
            .get()
        expect(retry.data()?.attempts).toBe(0)
        expect(retry.data()?.exhaustedAt).toBeUndefined()
        const row = await db().collection("library_index").doc("row-B").get()
        expect(row.data()?.enrichmentStatus).toBe("pending")
    })

    it("retry_enrichment: queue_doc_missing when retry queue is empty", async () => {
        const r = await retryEnrichment(ADMIN, {
            rowId: "ghost",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "queue_doc_missing" },
            rowId: "ghost",
        })
    })

    it("retry_enrichment: import kind deletes the chartImportQueue doc", async () => {
        await seedImportFailure("drive-C")
        const r = await retryEnrichment(ADMIN, {
            rowId: "drive-C",
            kind: "import",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "deleted_for_retry",
        })
        const after = await db()
            .collection("chartImportQueue")
            .doc("drive-C")
            .get()
        expect(after.exists).toBe(false)
    })

    it("retry_enrichment: dryRun does not write", async () => {
        await seedFailedRow("row-B")
        await retryEnrichment(ADMIN, { rowId: "row-B" })
        const retry = await db()
            .collection("aiEnrichmentRetryQueue")
            .doc("row-B")
            .get()
        expect(retry.data()?.attempts).toBe(5)
    })

    // ─── dismiss_failure ──────────────────────────────────────────────────

    it("dismiss_failure: kind='enrichment' flips library_index to human_rejected + deletes retry doc", async () => {
        await seedFailedRow("row-B")
        const r = await dismissFailure(ADMIN, {
            rowId: "row-B",
            kind: "enrichment",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "human_rejected",
            dryRun: false,
        })
        const after = await db().collection("library_index").doc("row-B").get()
        expect(after.data()?.enrichmentStatus).toBe("human_rejected")
        const retry = await db()
            .collection("aiEnrichmentRetryQueue")
            .doc("row-B")
            .get()
        expect(retry.exists).toBe(false)
    })

    it("dismiss_failure: kind='import' sets dismissed=true (next failure re-surfaces)", async () => {
        await seedImportFailure("drive-C")
        const r = await dismissFailure(ADMIN, {
            rowId: "drive-C",
            kind: "import",
            dryRun: false,
            force: true,
        })
        expect(r).toMatchObject({
            ok: true,
            status: "dismissed",
            dryRun: false,
        })
        const after = await db()
            .collection("chartImportQueue")
            .doc("drive-C")
            .get()
        expect(after.data()?.dismissed).toBe(true)
        expect(typeof after.data()?.dismissedAt).toBe("string")
    })

    it("dismiss_failure: rejects missing kind with invalid_argument", async () => {
        const r = await dismissFailure(ADMIN, {
            rowId: "row-B",
            // @ts-expect-error — missing kind on purpose
            kind: undefined,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("dismiss_failure: kind='import' refused without force returns rich force_required + no write", async () => {
        await seedImportFailure("drive-C")
        const r = await dismissFailure(ADMIN, {
            rowId: "drive-C",
            kind: "import",
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            rowId: "drive-C",
            dryRunPlan: {
                plannedStatus: "dismissed",
            },
        })
        const after = await db()
            .collection("chartImportQueue")
            .doc("drive-C")
            .get()
        expect(after.data()?.dismissed).toBeUndefined()
    })

    // ─── round-trip ───────────────────────────────────────────────────────

    it("end-to-end: list shows row → accept commits → list omits accepted row", async () => {
        await seedReviewRow("row-A")
        const before = await listReviewQueue(ADMIN, {})
        if (!("aiReview" in before)) throw new Error("expected success")
        expect(before.aiReview.map((x) => x.rowId)).toEqual(["row-A"])

        await acceptEnrichment(ADMIN, {
            rowId: "row-A",
            dryRun: false,
            force: true,
        })

        const after = await listReviewQueue(ADMIN, {})
        if (!("aiReview" in after)) throw new Error("expected success")
        expect(after.aiReview).toEqual([])
    })
})
