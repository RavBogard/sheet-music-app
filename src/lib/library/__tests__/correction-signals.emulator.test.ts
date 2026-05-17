/**
 * Cycle-3 c3 — emit-from-review-queue + admin-MCP-tool emulator tests.
 *
 * Covers:
 *  - Every review-queue action handler persists a structured signal at
 *    `aiCorrectionSignals/<id>` with the right shape (before/after,
 *    fieldsChanged, fieldsAccepted).
 *  - Both branches of retry/dismiss (enrichment + import) emit a signal.
 *  - Fail-open contract honored at two layers:
 *      (a) `emitCorrectionSignal` swallows internal Firestore throws.
 *      (b) Review-queue handlers wrap emit so a regression that makes
 *          emit throw NEVER fails the user's action.
 *  - End-to-end: signals → aggregator → stats persisted → `get_correction_stats`
 *    surfaces the same counters.
 *  - Admin gate: non-admins refused with rich `forbidden_role`.
 *  - Snapshot-missing fallback: `get_correction_stats` with no cron snapshot
 *    yet computes inline and returns `snapshotMissing: true`.
 *  - Input validation: invalid `since`/`until` and inverted window return
 *    rich `invalid_argument` envelopes.
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
import { getFirestore, type Firestore } from "firebase-admin/firestore"

import {
    acceptEnrichment,
    dismissFailed,
    editEnrichment,
    rejectEnrichment,
    retryFailed,
} from "../review-queue"
import {
    SIGNALS_COLLECTION,
    STATS_COLLECTION,
    STATS_DOC_ID,
    aggregateCorrectionSignals,
    emitCorrectionSignal,
    readCorrectionStats,
    writeCorrectionStats,
} from "../correction-signals"
import { getCorrectionStats } from "../../mcp/tools/correction-stats"
import type { EnrichmentOutput } from "../ai-enrichment"

const ADMIN = "rabbi-daniel"
const BAND_LEADER = "david-band-leader"
const MUSICIAN = "test-musician-1"

function suggestion(
    overrides: Partial<EnrichmentOutput> = {},
): EnrichmentOutput {
    return {
        is_chart: true,
        confidence: 0.62,
        suggested_title: "Shalom Rav (Frankel)",
        suggested_collection: "supplemental",
        collection_disagrees_with_folder: true,
        suggested_key: "G",
        suggested_bpm: null,
        suggested_lead: null,
        suggested_tags: ["frankel", "friday-evening"],
        duplicate_candidates: [],
        concerns: ["Low confidence on title casing"],
        review_required: true,
        ...overrides,
    }
}

describe("Correction-signal capture + aggregation (emulator)", () => {
    let app: App

    function db(): Firestore {
        return getFirestore(app)
    }

    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }

    async function seedReviewRow(
        rowId: string,
        sug: EnrichmentOutput | null = suggestion(),
        extra: Record<string, unknown> = {},
    ) {
        await db()
            .collection("library_index")
            .doc(rowId)
            .set({
                name: "shalom-rav.pdf",
                nameLower: "shalom-rav.pdf",
                collection: "uploads",
                mimeType: "application/pdf",
                fileSize: 9876,
                status: "active",
                enrichmentStatus: "review_pending",
                aiSuggestion: sug,
                aiReviewTriggers: sug
                    ? ["low_confidence", "collection_disagrees_with_folder"]
                    : [],
                enrichmentRanAt: "2026-05-18T17:00:00.000Z",
                ...extra,
            })
    }

    async function seedFailedRow(rowId: string) {
        await db()
            .collection("library_index")
            .doc(rowId)
            .set({
                name: "broken.pdf",
                nameLower: "broken.pdf",
                collection: "uploads",
                mimeType: "application/pdf",
                fileSize: 1234,
                status: "active",
                enrichmentStatus: "failed",
                aiReviewTriggers: [],
                enrichmentFailedAt: "2026-05-18T16:30:00.000Z",
                enrichmentLastError: "timeout",
            })
        await db()
            .collection("aiEnrichmentRetryQueue")
            .doc(rowId)
            .set({
                rowId,
                attempts: 3,
                lastError: "timeout",
                exhaustedAt: "2026-05-18T16:30:00.000Z",
                updatedAt: "2026-05-18T16:30:00.000Z",
                event: { rowId, fileId: rowId },
            })
    }

    async function seedImportFailure(driveFileId: string) {
        await db()
            .collection("chartImportQueue")
            .doc(driveFileId)
            .set({
                driveName: "draft.pdf",
                driveMimeType: "application/pdf",
                parents: ["folder-a"],
                md5Checksum: "abc123",
                status: "drive_404",
                errorMessage: "Drive returned 404",
                attemptCount: 3,
                firstSeenAt: "2026-05-18T15:00:00.000Z",
                lastAttemptAt: "2026-05-18T15:30:00.000Z",
            })
    }

    async function listSignals() {
        const snap = await db().collection(SIGNALS_COLLECTION).get()
        return snap.docs
            .map((d) => d.data())
            .sort((a, b) =>
                String(a.timestamp) < String(b.timestamp) ? -1 : 1,
            )
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-correction-signals" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of [
            SIGNALS_COLLECTION,
            STATS_COLLECTION,
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

    // ─── Emit-from-review-queue ───────────────────────────────────────────

    it("acceptEnrichment emits an accept signal with fieldsAccepted derived from gap-fill", async () => {
        await seedReviewRow("upload-1")
        const result = await acceptEnrichment(db(), "upload-1", ADMIN)
        expect(result).toEqual({
            ok: true,
            rowId: "upload-1",
            status: "enriched",
        })

        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        const s = signals[0]
        expect(s).toMatchObject({
            rowId: "upload-1",
            uid: ADMIN,
            action: "accept",
            afterState: { enrichmentStatus: "enriched" },
            fieldsChanged: [],
        })
        // The row started with no key/tags/title-rename; the suggestion has
        // suggested_key='G' + suggested_tags=[...] + suggested_title that
        // differs from the raw name. lead is null. bpm is null. So accepted
        // fields: key, tags, title (no leadMusician, no bpm).
        expect(s.fieldsAccepted).toEqual(
            expect.arrayContaining(["key", "tags", "title"]),
        )
        expect(s.fieldsAccepted).not.toContain("bpm")
        expect(s.fieldsAccepted).not.toContain("leadMusician")
        expect(s.beforeState).toMatchObject({
            enrichmentStatus: "review_pending",
            confidence: 0.62,
            reviewTriggers: [
                "low_confidence",
                "collection_disagrees_with_folder",
            ],
        })
        // aiSuggestion is the full EnrichmentOutput blob.
        expect(
            (s.beforeState.aiSuggestion as { suggested_title?: string })
                .suggested_title,
        ).toBe("Shalom Rav (Frankel)")
    })

    it("rejectEnrichment emits a reject signal carrying review triggers", async () => {
        await seedReviewRow("upload-2")
        const result = await rejectEnrichment(db(), "upload-2", ADMIN)
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({
            rowId: "upload-2",
            uid: ADMIN,
            action: "reject",
            beforeState: {
                reviewTriggers: [
                    "low_confidence",
                    "collection_disagrees_with_folder",
                ],
            },
            afterState: { enrichmentStatus: "human_rejected" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
    })

    it("editEnrichment emits an edit signal with the exact fieldsChanged list", async () => {
        await seedReviewRow("upload-3")
        const result = await editEnrichment(
            db(),
            "upload-3",
            { title: "Shalom Rav (Frankel)", bpm: 88, tags: ["frankel"] },
            ADMIN,
        )
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0].action).toBe("edit")
        expect(signals[0].fieldsChanged).toEqual(["title", "bpm", "tags"])
        expect(signals[0].fieldsAccepted).toEqual([])
        expect(signals[0].afterState).toMatchObject({
            enrichmentStatus: "human_curated",
        })
    })

    it("retryFailed(enrichment) emits a retry signal with row context", async () => {
        await seedFailedRow("upload-failed")
        const result = await retryFailed(
            db(),
            "upload-failed",
            "enrichment",
            ADMIN,
        )
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({
            rowId: "upload-failed",
            uid: ADMIN,
            action: "retry",
            afterState: { enrichmentStatus: "pending" },
        })
    })

    it("retryFailed(import) emits a retry signal with import_<status> prefix", async () => {
        await seedImportFailure("drive-broken")
        const result = await retryFailed(
            db(),
            "drive-broken",
            "import",
            ADMIN,
        )
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({
            rowId: "drive-broken",
            action: "retry",
            beforeState: { enrichmentStatus: "import_drive_404" },
            afterState: { enrichmentStatus: "deleted_for_retry" },
        })
    })

    it("dismissFailed(enrichment) emits a dismiss signal", async () => {
        await seedFailedRow("upload-dismiss")
        const result = await dismissFailed(
            db(),
            "upload-dismiss",
            "enrichment",
            ADMIN,
        )
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({
            rowId: "upload-dismiss",
            action: "dismiss",
            afterState: { enrichmentStatus: "human_rejected" },
        })
    })

    it("dismissFailed(import) emits a dismiss signal", async () => {
        await seedImportFailure("drive-dismiss")
        const result = await dismissFailed(
            db(),
            "drive-dismiss",
            "import",
            ADMIN,
        )
        expect(result.ok).toBe(true)
        const signals = await listSignals()
        expect(signals).toHaveLength(1)
        expect(signals[0]).toMatchObject({
            rowId: "drive-dismiss",
            action: "dismiss",
            beforeState: { enrichmentStatus: "import_drive_404" },
            afterState: { enrichmentStatus: "dismissed" },
        })
    })

    // ─── Fail-open ────────────────────────────────────────────────────────

    it("emitCorrectionSignal swallows internal write errors and never throws", async () => {
        const brokenDb = {
            collection: () => ({
                doc: () => ({
                    set: () => {
                        throw new Error("simulated firestore down")
                    },
                }),
            }),
        } as unknown as Firestore
        await expect(
            emitCorrectionSignal(brokenDb, {
                rowId: "x",
                uid: "y",
                action: "accept",
                beforeState: {
                    enrichmentStatus: "review_pending",
                    confidence: 0.9,
                    aiSuggestion: null,
                    reviewTriggers: [],
                },
                afterState: { enrichmentStatus: "enriched" },
                fieldsChanged: [],
                fieldsAccepted: [],
            }),
        ).resolves.toBeUndefined()
    })

    it("rejects malformed input via Zod safeParse without throwing", async () => {
        await emitCorrectionSignal(
            db(),
            // @ts-expect-error — intentionally malformed payload
            { rowId: "", uid: "", action: "unknown" },
        )
        // No throw. No doc written.
        const after = await listSignals()
        expect(after).toHaveLength(0)
    })

    it("fail-open: review-queue handler succeeds even when emit itself throws", async () => {
        await seedReviewRow("upload-failopen")
        const mod = await import("../correction-signals")
        const spy = vi
            .spyOn(mod, "emitCorrectionSignal")
            .mockImplementation(() => {
                throw new Error("module-level emit boom")
            })
        try {
            const r = await acceptEnrichment(db(), "upload-failopen", ADMIN)
            expect(r).toEqual({
                ok: true,
                rowId: "upload-failopen",
                status: "enriched",
            })
            // Row update STILL landed regardless of the broken emit.
            const after = await db()
                .collection("library_index")
                .doc("upload-failopen")
                .get()
            expect(after.data()?.enrichmentStatus).toBe("enriched")
            // No signal was written because emit blew up.
            const signals = await listSignals()
            expect(signals).toHaveLength(0)
        } finally {
            spy.mockRestore()
        }
    })

    // ─── Aggregation + stats persistence ──────────────────────────────────

    it("aggregator + writeCorrectionStats round-trip via readCorrectionStats", async () => {
        await seedReviewRow("u1")
        await seedReviewRow("u2")
        await seedReviewRow("u3")
        await acceptEnrichment(db(), "u1", ADMIN)
        await rejectEnrichment(db(), "u2", ADMIN)
        await editEnrichment(
            db(),
            "u3",
            { title: "Curated Title" },
            ADMIN,
        )

        const stats = await aggregateCorrectionSignals(db())
        expect(stats.totalSignals).toBe(3)
        expect(stats.actionDistribution).toMatchObject({
            accept: 1,
            reject: 1,
            edit: 1,
        })
        expect(stats.editFieldFrequency).toEqual({ title: 1 })
        // All three seeded rows had collection_disagrees_with_folder: true
        // on the suggestion the human acted on, so 3 flagged, 1 accepted.
        expect(stats.collectionMismatchAcceptanceRate).toMatchObject({
            flaggedTotal: 3,
            acceptedCount: 1,
        })
        expect(stats.collectionMismatchAcceptanceRate.rate).toBeCloseTo(
            1 / 3,
            6,
        )
        await writeCorrectionStats(db(), stats)
        const round = await readCorrectionStats(db())
        expect(round?.totalSignals).toBe(3)
        // Persisted at the singleton doc id.
        const doc = await db()
            .collection(STATS_COLLECTION)
            .doc(STATS_DOC_ID)
            .get()
        expect(doc.exists).toBe(true)
    })

    // ─── get_correction_stats MCP tool ────────────────────────────────────

    it("get_correction_stats: refuses non-admin with rich forbidden_role envelope", async () => {
        const r = await getCorrectionStats(MUSICIAN)
        expect(r).toMatchObject({
            ok: false,
            error: "forbidden_role",
            callerRole: "musician",
            requiredRoles: ["admin"],
        })
        expect("hint" in r && r.hint).toBeTruthy()
    })

    it("get_correction_stats: refuses band_leader (admin-only — same broader gate as c2)", async () => {
        const r = await getCorrectionStats(BAND_LEADER)
        expect(r).toMatchObject({
            ok: false,
            error: "forbidden_role",
            callerRole: "band_leader",
        })
    })

    it("get_correction_stats: returns onDemand + snapshotMissing when no cron snapshot exists", async () => {
        const r = await getCorrectionStats(ADMIN)
        if (!("ok" in r) || r.ok !== true) {
            throw new Error(`expected ok response, got ${JSON.stringify(r)}`)
        }
        expect(r.onDemand).toBe(true)
        expect(r.snapshotMissing).toBe(true)
        expect(r.totalSignals).toBe(0)
    })

    it("get_correction_stats: returns the latest cron snapshot when present", async () => {
        // Pre-populate as if the cron ran.
        await seedReviewRow("u-stats")
        await acceptEnrichment(db(), "u-stats", ADMIN)
        const stats = await aggregateCorrectionSignals(db())
        await writeCorrectionStats(db(), stats)

        const r = await getCorrectionStats(ADMIN)
        if (!("ok" in r) || r.ok !== true) {
            throw new Error(`expected ok response, got ${JSON.stringify(r)}`)
        }
        expect(r.onDemand).toBe(false)
        expect(r.totalSignals).toBe(1)
        expect(r.actionDistribution.accept).toBe(1)
    })

    it("get_correction_stats: windowed query computes on-demand without persisting", async () => {
        await seedReviewRow("u-windowed")
        await acceptEnrichment(db(), "u-windowed", ADMIN)

        const r = await getCorrectionStats(ADMIN, {
            since: "2026-05-18T00:00:00Z",
            until: "2026-05-19T00:00:00Z",
        })
        if (!("ok" in r) || r.ok !== true) {
            throw new Error(`expected ok response, got ${JSON.stringify(r)}`)
        }
        expect(r.onDemand).toBe(true)
        expect(r.since).toBe("2026-05-18T00:00:00Z")
        expect(r.until).toBe("2026-05-19T00:00:00Z")
        // No snapshot persisted by a windowed call.
        const snap = await db()
            .collection(STATS_COLLECTION)
            .doc(STATS_DOC_ID)
            .get()
        expect(snap.exists).toBe(false)
    })

    it("get_correction_stats: rejects malformed `since` with invalid_argument", async () => {
        const r = await getCorrectionStats(ADMIN, {
            since: "yesterday",
        })
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
            since: "yesterday",
        })
    })

    it("get_correction_stats: rejects inverted window with invalid_argument", async () => {
        const r = await getCorrectionStats(ADMIN, {
            since: "2026-06-01T00:00:00Z",
            until: "2026-05-01T00:00:00Z",
        })
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
        })
    })
})
