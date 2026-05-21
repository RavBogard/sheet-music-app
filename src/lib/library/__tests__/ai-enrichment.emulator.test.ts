/**
 * Cycle-3 NEW-3 (A3) — AI enrichment subscriber emulator tests.
 *
 * Uses the Firestore emulator for real reads/writes against
 * `library_index`, `aiConfig`, `aiEnrichmentCache`, and
 * `aiEnrichmentRetryQueue`. Gemini SDK is mocked via
 * dependency injection (we never call the real Gemini endpoint
 * from tests).
 *
 * Properties asserted (msg-001 first-actions §11):
 *  - fire-on-success: AI runs after library.row.created
 *  - fail-open: model throw → retry queue, no rethrow to caller
 *  - idempotent content-hash cache: 2nd call same hash = zero model calls
 *  - threshold flagging: every review trigger routes to review_pending
 *  - autoApplyEnabled:false forces review_pending regardless of triggers
 *  - never-overwrite-human-set: existing key/bpm/tags survive auto-apply
 *  - David's-subfolder-authority: AI never overwrites `collection`
 *  - retry queue backoff: attempts increment, nextRetryAt advances
 *  - max-attempts: 3 failures land enrichmentStatus:'failed'
 */

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
import {
    initializeApp,
    deleteApp,
    getApps,
    type App,
} from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

import {
    applyEnrichment,
    collectReviewTriggers,
    DEFAULT_CONFIDENCE_THRESHOLD,
    enrichLibraryRow,
    processAiEnrichmentRetryQueue,
    type AiEnrichmentDeps,
    type EnrichmentOutput,
} from "../ai-enrichment"
import type { LibraryRowCreatedEvent } from "../library-events"

const SHALOM_HASH = "a".repeat(64)

function makeEvent(
    overrides: Partial<LibraryRowCreatedEvent> = {},
): LibraryRowCreatedEvent {
    return {
        rowId: "upload-shalom-rav-1",
        fileId: "upload-shalom-rav-1",
        source: "upload",
        nameLower: "shalom rav (frankel)",
        title: "Shalom Rav (Frankel)",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        collection: "supplemental",
        storagePath: "library/upload-shalom-rav-1.pdf",
        contentHash: SHALOM_HASH,
        uploaderUid: "rabbi-daniel",
        ...overrides,
    }
}

function passingOutput(): EnrichmentOutput {
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
    }
}

function buildTestDeps(
    db: Firestore,
    overrides: Partial<AiEnrichmentDeps> = {},
): AiEnrichmentDeps {
    return {
        db,
        callModel: overrides.callModel ?? vi.fn(async () => passingOutput()),
        fetchBytes:
            overrides.fetchBytes ??
            vi.fn(async () => Buffer.from("fake-pdf-bytes")),
        loadConfig:
            overrides.loadConfig ??
            (async () => ({
                enabled: true,
                autoApplyEnabled: true,
                threshold: DEFAULT_CONFIDENCE_THRESHOLD,
            })),
    }
}

async function seedRow(
    db: Firestore,
    id: string,
    data: Record<string, unknown> = {},
) {
    await db
        .collection("library_index")
        .doc(id)
        .set({
            name: "Shalom Rav (Frankel)",
            nameLower: "shalom rav (frankel)",
            collection: "supplemental",
            mimeType: "application/pdf",
            fileSize: 12345,
            status: "active",
            uploadedBy: "rabbi-daniel",
            enrichmentStatus: "pending",
            ...data,
        })
}

describe("AI enrichment subscriber — NEW-3 (emulator)", () => {
    let app: App

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-ai-enrichment" })
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
            "aiEnrichmentCache",
            "aiEnrichmentRetryQueue",
            "aiSpend",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("fire-on-success: AI runs, row enriched, cache populated", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => passingOutput())
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)

        expect(callModel).toHaveBeenCalledTimes(1)
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
        expect(row?.key).toBe("G") // gap-fill applied
        expect(row?.tags).toEqual(["friday-evening", "frankel"]) // gap-fill applied
        expect(row?.aiSuggestion).toBeDefined()

        const cached = (
            await db().collection("aiEnrichmentCache").doc(SHALOM_HASH).get()
        ).data()
        expect(cached?.output.confidence).toBeCloseTo(0.92)
    })

    it("fail-open: model throw → retry queue, no rethrow", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => {
            throw new Error("gemini 503")
        })
        const deps = buildTestDeps(db(), { callModel })

        // MUST NOT throw — atomic-guard contract.
        await expect(enrichLibraryRow(event, deps)).resolves.toBeUndefined()

        const queueDoc = (
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc(event.rowId)
                .get()
        ).data()
        expect(queueDoc?.attempts).toBe(1)
        expect(queueDoc?.lastError).toMatch(/gemini 503/)
        expect(queueDoc?.nextRetryAt).toBeTruthy()

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        // Row stays at 'pending' — fail-open means raw metadata survives.
        expect(row?.enrichmentStatus).toBe("pending")
    })

    it("idempotent cache: second call with same hash is zero-token", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => passingOutput())
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)
        expect(callModel).toHaveBeenCalledTimes(1)

        // Reset enrichmentStatus to simulate a fresh row with same content.
        await db()
            .collection("library_index")
            .doc(event.rowId)
            .update({ enrichmentStatus: "pending" })

        await enrichLibraryRow(event, deps)
        // Cache hit — model not called a second time.
        expect(callModel).toHaveBeenCalledTimes(1)

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
    })

    it("threshold trigger: confidence < 0.7 forces review_pending", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => ({
            ...passingOutput(),
            confidence: 0.55,
        }))
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("review_pending")
        expect(row?.aiReviewTriggers).toContain("low_confidence")
        // Gap-fillers NOT applied — review_pending blocks auto-apply.
        expect(row?.key).toBeUndefined()
    })

    it("each review trigger lights the correct flag", () => {
        const o = passingOutput()
        expect(collectReviewTriggers(o, 0.7)).toEqual([])

        expect(
            collectReviewTriggers({ ...o, is_chart: false }, 0.7),
        ).toContain("is_chart_false")
        expect(
            collectReviewTriggers({ ...o, review_required: true }, 0.7),
        ).toContain("review_required")
        expect(collectReviewTriggers({ ...o, confidence: 0.5 }, 0.7)).toContain(
            "low_confidence",
        )
        expect(
            collectReviewTriggers(
                { ...o, collection_disagrees_with_folder: true },
                0.7,
            ),
        ).toContain("collection_disagrees_with_folder")
        expect(
            collectReviewTriggers(
                { ...o, duplicate_candidates: ["lib_id_1"] },
                0.7,
            ),
        ).toContain("duplicate_candidates")
    })

    it("autoApplyEnabled:false forces review_pending even on a clean output", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const deps = buildTestDeps(db(), {
            loadConfig: async () => ({
                enabled: true,
                autoApplyEnabled: false,
                threshold: 0.7,
            }),
        })

        await enrichLibraryRow(event, deps)

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("review_pending")
        // No gap-fillers applied during calibration phase.
        expect(row?.key).toBeUndefined()
        expect(row?.tags).toBeUndefined()
        expect(row?.aiSuggestion).toBeDefined() // suggestion saved for A4 review
    })

    it("disabled (GEMINI_API_KEY unset) leaves row at 'pending' silently", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn()
        const deps = buildTestDeps(db(), {
            callModel,
            loadConfig: async () => ({
                enabled: false,
                autoApplyEnabled: false,
                threshold: 0.7,
            }),
        })

        await enrichLibraryRow(event, deps)
        expect(callModel).not.toHaveBeenCalled()
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("pending")
    })

    it("never overwrites human-set key/bpm/tags on auto-apply", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId, {
            key: "C",
            bpm: 80,
            tags: ["custom-tag"],
            leadMusician: "Daniel",
        })
        const callModel = vi.fn(async () => ({
            ...passingOutput(),
            suggested_key: "G",
            suggested_bpm: 120,
            suggested_lead: "Randy",
            suggested_tags: ["should-not-apply"],
        }))
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
        // Human-set fields survive — gap-fill is the only auto-apply path.
        expect(row?.key).toBe("C")
        expect(row?.bpm).toBe(80)
        expect(row?.tags).toEqual(["custom-tag"])
        expect(row?.leadMusician).toBe("Daniel")
    })

    it("David's-subfolder authority: AI never overwrites `collection`", async () => {
        const event = makeEvent({
            collection: "supplemental", // routed by David's subfolder
        })
        await seedRow(db(), event.rowId, { collection: "supplemental" })
        const callModel = vi.fn(async () => ({
            ...passingOutput(),
            suggested_collection: "core" as const,
            // Even with disagreement, we never overwrite the row's collection.
            collection_disagrees_with_folder: true,
        }))
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.collection).toBe("supplemental") // unchanged
        // The disagreement routes the row to review_pending.
        expect(row?.enrichmentStatus).toBe("review_pending")
        expect(row?.aiReviewTriggers).toContain(
            "collection_disagrees_with_folder",
        )
    })

    it("retry backoff: attempts increment, nextRetryAt advances", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        let calls = 0
        const callModel = vi.fn(async () => {
            calls++
            throw new Error(`attempt ${calls} fails`)
        })
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)
        let queueDoc = (
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc(event.rowId)
                .get()
        ).data()
        expect(queueDoc?.attempts).toBe(1)
        const t1 = Date.parse(queueDoc?.nextRetryAt as string)

        // Replay through the queue — should fail again. Advance the
        // drain's `now` past the backoff window so the query finds the
        // doc (test wall-clock is real but the drain queries against
        // `nextRetryAt`).
        const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000)
        await processAiEnrichmentRetryQueue(deps, { now: future })
        queueDoc = (
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc(event.rowId)
                .get()
        ).data()
        expect(queueDoc?.attempts).toBe(2)
        const t2 = Date.parse(queueDoc?.nextRetryAt as string)
        // Backoff schedule is 5min → 30min → 2h → 6h. t2 must be later than t1.
        expect(t2).toBeGreaterThan(t1)
    })

    it("max-attempts: 3 failures land enrichmentStatus:'failed'", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => {
            throw new Error("permanent failure")
        })
        const deps = buildTestDeps(db(), { callModel })

        // Attempt 1.
        await enrichLibraryRow(event, deps)
        // Attempts 2, 3, 4 (last one triggers the cap → 'failed').
        // Each drain advances `now` past the longest backoff window so the
        // query finds the queued doc (test wall-clock is real).
        const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000)
        await processAiEnrichmentRetryQueue(deps, { now: future })
        await processAiEnrichmentRetryQueue(deps, { now: future })
        await processAiEnrichmentRetryQueue(deps, { now: future })

        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("failed")
        expect(row?.enrichmentLastError).toMatch(/permanent failure/)

        const queueDoc = (
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc(event.rowId)
                .get()
        ).data()
        // Forensic doc left behind for A4 with exhaustedAt timestamp.
        expect(queueDoc?.exhaustedAt).toBeTruthy()
    })

    it("applyEnrichment is a no-op when the row was deleted between import + AI", async () => {
        // No row seeded — applyEnrichment must tolerate the race.
        const out = passingOutput()
        const cfg = {
            enabled: true,
            autoApplyEnabled: true,
            threshold: 0.7,
        }
        await expect(
            applyEnrichment(db(), makeEvent(), out, cfg),
        ).resolves.toBeUndefined()
    })

    it("PGR-04: records an aiSpend doc when the model returns usage", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => ({
            output: passingOutput(),
            usage: {
                promptTokenCount: 1000,
                candidatesTokenCount: 200,
                totalTokenCount: 1200,
            },
        }))
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)

        const spendSnap = await db().collection("aiSpend").get()
        expect(spendSnap.size).toBe(1)
        const spend = spendSnap.docs[0].data()
        expect(spend.rowId).toBe(event.rowId)
        expect(spend.promptTokens).toBe(1000)
        expect(spend.candidatesTokens).toBe(200)
        expect(spend.totalTokens).toBe(1200)
        expect(spend.model).toBeTruthy()
        expect(typeof spend.ts).toBe("string")
        // 1000/1e6*1.25 + 200/1e6*10 = 0.00125 + 0.002 = 0.00325
        expect(spend.costUsd).toBeCloseTo(0.00325, 8)

        // The row is still enriched normally — spend capture is a side-write.
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
    })

    it("PGR-04: legacy bare-EnrichmentOutput callModel still enriches, writes no spend", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        // Default buildTestDeps callModel returns a bare EnrichmentOutput
        // (the pre-PGR-04 shape) — backward-compat path.
        const deps = buildTestDeps(db())

        await enrichLibraryRow(event, deps)

        const spendSnap = await db().collection("aiSpend").get()
        expect(spendSnap.size).toBe(0) // no usage available → no spend doc
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
    })

    it("PGR-04: oversized inline input → skipped-with-signal, NO model call, NO spend", async () => {
        const event = makeEvent({ mimeType: "application/pdf" })
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => passingOutput())
        const big = Buffer.alloc(11 * 1024 * 1024, 1) // 11MB > 10MB cap
        const deps = buildTestDeps(db(), {
            callModel,
            fetchBytes: vi.fn(async () => big),
        })

        await enrichLibraryRow(event, deps)

        expect(callModel).not.toHaveBeenCalled()
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("review_pending")
        expect(row?.aiReviewTriggers).toContain("input_too_large")
        expect(row?.enrichmentSkippedReason).toMatch(/input_exceeds_inline_cap/)

        const spendSnap = await db().collection("aiSpend").get()
        expect(spendSnap.size).toBe(0)
    })

    it("PGR-04: under-cap input proceeds to the model normally", async () => {
        const event = makeEvent({ mimeType: "application/pdf" })
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(async () => ({
            output: passingOutput(),
            usage: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15,
            },
        }))
        const small = Buffer.alloc(1024, 1) // 1KB ≪ cap
        const deps = buildTestDeps(db(), {
            callModel,
            fetchBytes: vi.fn(async () => small),
        })

        await enrichLibraryRow(event, deps)

        expect(callModel).toHaveBeenCalledTimes(1)
        const row = (
            await db().collection("library_index").doc(event.rowId).get()
        ).data()
        expect(row?.enrichmentStatus).toBe("enriched")
        expect((await db().collection("aiSpend").get()).size).toBe(1)
    })

    it("schema-invalid Gemini payload routes to retry queue", async () => {
        const event = makeEvent()
        await seedRow(db(), event.rowId)
        const callModel = vi.fn(
            async () =>
                // Confidence out of [0,1] — schema rejects.
                ({
                    ...passingOutput(),
                    confidence: 1.5,
                }) as unknown as EnrichmentOutput,
        )
        const deps = buildTestDeps(db(), { callModel })

        await enrichLibraryRow(event, deps)
        const queueDoc = (
            await db()
                .collection("aiEnrichmentRetryQueue")
                .doc(event.rowId)
                .get()
        ).data()
        expect(queueDoc?.attempts).toBe(1)
        expect(queueDoc?.lastError).toMatch(/schema validation/i)
    })
})
