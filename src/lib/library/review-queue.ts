/**
 * Cycle-3 NEW-4 (A4) — Library Review Queue shared logic.
 *
 * The human-review backend for a3's AI enrichment layer + a1's Drive
 * import failures. The `/api/admin/library-review/*` HTTP surface and
 * the `/manage/library-review` page both depend on this module.
 *
 * Three queues:
 *  1. AI Review     — `library_index` rows at `enrichmentStatus:'review_pending'`
 *  2. AI Failed     — `library_index` rows at `enrichmentStatus:'failed'`
 *                     (the `aiEnrichmentRetryQueue/<rowId>` doc carries `exhaustedAt`)
 *  3. Import Failures — `chartImportQueue/<driveFileId>` rows from a1's
 *                       /api/cron/drive-sync poller (`status` ∈
 *                       {drive_404 | permission_lost | conversion_failed |
 *                        mime_unrecognized | dedup_blocked | storage_failed |
 *                        google_doc_skipped | unknown}).
 *
 * Five per-row actions (idempotent):
 *  - acceptEnrichment  — apply `aiSuggestion` to the row (gap-fill only;
 *                        never overwrites human-set fields; never overwrites
 *                        `collection` — David's subfolder is source of truth).
 *                        Sets `enrichmentStatus:'enriched'`.
 *  - rejectEnrichment  — leaves raw metadata. Sets
 *                        `enrichmentStatus:'human_rejected'`.
 *  - editEnrichment    — applies caller-supplied edits to the row.
 *                        Sets `enrichmentStatus:'human_curated'`.
 *  - retryFailed       — for `'enrichment'`: rewind the retry doc to
 *                        attempts=0 + nextRetryAt=now so the next 30-min
 *                        cron tick picks it up. For `'import'`: delete the
 *                        chartImportQueue doc so the next 5-min cron tick
 *                        re-imports fresh.
 *  - dismissFailed     — for `'enrichment'`: mark
 *                        `enrichmentStatus:'human_rejected'` and delete
 *                        the retry queue doc. For `'import'`: mark the
 *                        chartImportQueue row `dismissed: true` so the
 *                        UI hides it (next failure overwrite from the
 *                        poller resets this flag — that's the intended
 *                        re-surface-on-next-failure semantic).
 *
 * Reads + writes happen exclusively via the Admin SDK because
 * `firestore.rules` blocks browser access to `library_index`,
 * `aiEnrichmentCache`, `aiEnrichmentRetryQueue`, and `chartImportQueue`.
 */

import "server-only"
import type { Firestore } from "firebase-admin/firestore"

import {
    DEFAULT_CONFIDENCE_THRESHOLD,
    type EnrichmentOutput,
} from "@/lib/library/ai-enrichment"
import { logger } from "@/lib/logger"

const ALLOWED_COLLECTIONS = ["core", "supplemental", "uploads"] as const
export type LibraryCollection = (typeof ALLOWED_COLLECTIONS)[number]

// ─── Queue read shape ──────────────────────────────────────────────────────

export interface AiReviewRow {
    rowId: string
    title: string
    collection: string
    mimeType: string
    sizeBytes: number
    source: "upload" | "drive-sync" | "unknown"
    /** Subfolder routing signal (Drive parent id, when source=drive-sync). */
    subfolder?: string
    /** AI's structured-output snapshot, persisted by a3's `applyEnrichment`. */
    suggestion: EnrichmentOutput | null
    /** Which review triggers fired: low_confidence, collection_disagrees_with_folder, etc. */
    triggers: string[]
    /** Existing human-set fields, so the UI can render a diff. */
    current: {
        title: string
        collection: string
        key?: string
        bpm?: number
        leadMusician?: string
        tags?: string[]
    }
    /** Filled only for the duplicate_candidates flag — siblings AI flagged. */
    duplicateCandidates: Array<{
        rowId: string
        title: string
        collection: string
    }>
    /** When the AI last ran (ISO). */
    enrichmentRanAt: string | null
}

export interface AiFailedRow {
    rowId: string
    title: string
    collection: string
    mimeType: string
    sizeBytes: number
    /** lastError prose from the retry queue doc. */
    lastError: string
    attempts: number
    /** When enrichment hit the retry ceiling (ISO). */
    exhaustedAt: string | null
}

export interface ImportFailureRow {
    /** chartImportQueue/{driveFileId}. */
    driveFileId: string
    driveName: string | null
    driveMimeType: string | null
    parents: string[] | null
    md5Checksum: string | null
    status: string
    errorMessage: string
    attemptCount: number
    firstSeenAt: string
    lastAttemptAt: string
}

export interface ReviewQueueResult {
    aiReview: AiReviewRow[]
    aiFailed: AiFailedRow[]
    importFailures: ImportFailureRow[]
    /** Calibration banner — A4 surfaces `autoApplyEnabled:false` to the operator. */
    config: {
        autoApplyEnabled: boolean
        threshold: number
        anthropicConfigured: boolean
    }
}

// ─── Action shapes ─────────────────────────────────────────────────────────

export type EditableField = "title" | "collection" | "key" | "bpm" | "leadMusician" | "tags"

export interface EditPayload {
    title?: string
    /** ONLY collection that A4 lets the operator set. AI never writes collection. */
    collection?: LibraryCollection
    key?: string
    bpm?: number | null
    leadMusician?: string
    tags?: string[]
}

export type FailedKind = "enrichment" | "import"

// ─── Queue read ────────────────────────────────────────────────────────────

const PAGE_LIMIT = 200

export async function readReviewQueue(
    db: Firestore,
): Promise<ReviewQueueResult> {
    const [
        reviewSnap,
        failedRowsSnap,
        retryQueueSnap,
        importFailuresSnap,
        configSnap,
    ] = await Promise.all([
        db
            .collection("library_index")
            .where("enrichmentStatus", "==", "review_pending")
            .limit(PAGE_LIMIT)
            .get(),
        db
            .collection("library_index")
            .where("enrichmentStatus", "==", "failed")
            .limit(PAGE_LIMIT)
            .get(),
        db.collection("aiEnrichmentRetryQueue").limit(PAGE_LIMIT * 2).get(),
        db.collection("chartImportQueue").limit(PAGE_LIMIT).get(),
        db.collection("aiConfig").doc("autoApplyEnabled").get(),
    ])

    // Hydrate duplicate_candidates titles in one batched read.
    const allCandidateIds = new Set<string>()
    for (const doc of reviewSnap.docs) {
        const sug = (doc.data().aiSuggestion ?? null) as EnrichmentOutput | null
        sug?.duplicate_candidates?.forEach((id) => allCandidateIds.add(id))
    }
    const candidateMap = new Map<
        string,
        { title: string; collection: string }
    >()
    if (allCandidateIds.size > 0) {
        const ids = [...allCandidateIds].slice(0, 200) // Firestore safe cap
        const refs = ids.map((id) => db.collection("library_index").doc(id))
        const snaps = await db.getAll(...refs)
        for (const snap of snaps) {
            if (!snap.exists) continue
            const d = snap.data() ?? {}
            candidateMap.set(snap.id, {
                title: String(d.name ?? snap.id),
                collection: String(d.collection ?? ""),
            })
        }
    }

    const aiReview: AiReviewRow[] = reviewSnap.docs.map((doc) => {
        const d = doc.data()
        const sug = (d.aiSuggestion ?? null) as EnrichmentOutput | null
        return {
            rowId: doc.id,
            title: String(d.name ?? doc.id),
            collection: String(d.collection ?? "uploads"),
            mimeType: String(d.mimeType ?? ""),
            sizeBytes: typeof d.fileSize === "number" ? d.fileSize : 0,
            source: (d.source as AiReviewRow["source"]) ?? "unknown",
            ...(typeof d.driveParents === "object" &&
            Array.isArray(d.driveParents) &&
            d.driveParents[0]
                ? { subfolder: String(d.driveParents[0]) }
                : {}),
            suggestion: sug,
            triggers: Array.isArray(d.aiReviewTriggers)
                ? (d.aiReviewTriggers as string[])
                : [],
            current: {
                title: String(d.name ?? doc.id),
                collection: String(d.collection ?? "uploads"),
                ...(d.key ? { key: String(d.key) } : {}),
                ...(typeof d.bpm === "number" ? { bpm: d.bpm } : {}),
                ...(d.leadMusician
                    ? { leadMusician: String(d.leadMusician) }
                    : {}),
                ...(Array.isArray(d.tags)
                    ? { tags: d.tags as string[] }
                    : {}),
            },
            duplicateCandidates:
                sug?.duplicate_candidates
                    ?.map((id) => {
                        const hit = candidateMap.get(id)
                        return hit
                            ? {
                                  rowId: id,
                                  title: hit.title,
                                  collection: hit.collection,
                              }
                            : null
                    })
                    .filter((x): x is NonNullable<typeof x> => x !== null) ??
                [],
            enrichmentRanAt:
                typeof d.enrichmentRanAt === "string"
                    ? d.enrichmentRanAt
                    : null,
        }
    })

    // AI failed: join library_index row data with retry-queue forensic doc.
    const retryByRowId = new Map<string, FirebaseFirestore.DocumentData>()
    for (const doc of retryQueueSnap.docs) {
        retryByRowId.set(doc.id, doc.data())
    }
    const aiFailed: AiFailedRow[] = failedRowsSnap.docs.map((doc) => {
        const d = doc.data()
        const retry = retryByRowId.get(doc.id) ?? {}
        return {
            rowId: doc.id,
            title: String(d.name ?? doc.id),
            collection: String(d.collection ?? "uploads"),
            mimeType: String(d.mimeType ?? ""),
            sizeBytes: typeof d.fileSize === "number" ? d.fileSize : 0,
            lastError: String(
                retry.lastError ?? d.enrichmentLastError ?? "Unknown error",
            ),
            attempts:
                typeof retry.attempts === "number" ? retry.attempts : 0,
            exhaustedAt:
                typeof retry.exhaustedAt === "string"
                    ? retry.exhaustedAt
                    : typeof d.enrichmentFailedAt === "string"
                      ? d.enrichmentFailedAt
                      : null,
        }
    })

    const importFailures: ImportFailureRow[] = importFailuresSnap.docs
        .filter((doc) => doc.data().dismissed !== true)
        .map((doc) => {
            const d = doc.data()
            return {
                driveFileId: doc.id,
                driveName: (d.driveName as string | null) ?? null,
                driveMimeType: (d.driveMimeType as string | null) ?? null,
                parents: Array.isArray(d.parents)
                    ? (d.parents as string[])
                    : null,
                md5Checksum: (d.md5Checksum as string | null) ?? null,
                status: String(d.status ?? "unknown"),
                errorMessage: String(d.errorMessage ?? ""),
                attemptCount:
                    typeof d.attemptCount === "number" ? d.attemptCount : 1,
                firstSeenAt: String(d.firstSeenAt ?? ""),
                lastAttemptAt: String(d.lastAttemptAt ?? ""),
            }
        })

    const configData = configSnap.data() ?? {}
    return {
        aiReview,
        aiFailed,
        importFailures,
        config: {
            autoApplyEnabled: configData.enabled === true,
            threshold:
                typeof configData.threshold === "number" &&
                configData.threshold > 0 &&
                configData.threshold <= 1
                    ? configData.threshold
                    : DEFAULT_CONFIDENCE_THRESHOLD,
            anthropicConfigured:
                !!process.env.ANTHROPIC_API_KEY &&
                process.env.ANTHROPIC_API_KEY.length > 0,
        },
    }
}

// ─── Actions ───────────────────────────────────────────────────────────────

export type ActionResult =
    | { ok: true; rowId: string; status: string }
    | {
          ok: false
          code:
              | "row_not_found"
              | "invalid_state"
              | "queue_doc_missing"
              | "invalid_field"
          message: string
      }

/**
 * Apply the row's `aiSuggestion` to the library_index doc. Gap-fill only
 * — NEVER overwrites a field a human already set. `collection` is NEVER
 * overwritten (David's subfolder is source of truth — ADDENDUM-1 §3 #4).
 * Idempotent: re-running on an already-`enriched` row is a no-op apart
 * from the timestamp stamp.
 */
export async function acceptEnrichment(
    db: Firestore,
    rowId: string,
    actorUid: string,
): Promise<ActionResult> {
    const ref = db.collection("library_index").doc(rowId)
    const snap = await ref.get()
    if (!snap.exists) {
        return {
            ok: false,
            code: "row_not_found",
            message: `library_index row "${rowId}" not found.`,
        }
    }
    const data = snap.data() ?? {}
    const sug = (data.aiSuggestion ?? null) as EnrichmentOutput | null
    if (!sug) {
        return {
            ok: false,
            code: "invalid_state",
            message: `Row "${rowId}" has no AI suggestion to accept.`,
        }
    }

    const update: Record<string, unknown> = {
        enrichmentStatus: "enriched",
        enrichmentReviewedAt: new Date().toISOString(),
        enrichmentReviewedBy: actorUid,
    }
    if (isFieldEmpty(data.key) && sug.suggested_key) {
        update.key = sug.suggested_key
    }
    if (isFieldEmpty(data.bpm) && sug.suggested_bpm !== null) {
        update.bpm = sug.suggested_bpm
    }
    if (isFieldEmpty(data.leadMusician) && sug.suggested_lead) {
        update.leadMusician = sug.suggested_lead
    }
    if (
        (!Array.isArray(data.tags) || data.tags.length === 0) &&
        sug.suggested_tags.length > 0
    ) {
        update.tags = sug.suggested_tags
    }
    // suggested_title overrides only the auto-derived display name — and
    // only when the human hasn't already curated it (no `humanRenamedAt`
    // and the suggestion is non-null + different). Library convention
    // titles ("Shalom Rav (Frankel)") are exactly the gap-fill A4 wants.
    if (
        sug.suggested_title &&
        sug.suggested_title !== data.name &&
        !data.humanRenamedAt
    ) {
        update.name = sug.suggested_title
        update.nameLower = sug.suggested_title.toLowerCase()
    }

    await ref.update(update)
    return { ok: true, rowId, status: "enriched" }
}

export async function rejectEnrichment(
    db: Firestore,
    rowId: string,
    actorUid: string,
): Promise<ActionResult> {
    const ref = db.collection("library_index").doc(rowId)
    const snap = await ref.get()
    if (!snap.exists) {
        return {
            ok: false,
            code: "row_not_found",
            message: `library_index row "${rowId}" not found.`,
        }
    }
    await ref.update({
        enrichmentStatus: "human_rejected",
        enrichmentReviewedAt: new Date().toISOString(),
        enrichmentReviewedBy: actorUid,
    })
    // Tidy up: a rejected row with a pending retry doc would re-fire on
    // the next cron drain. Belt-and-suspenders cleanup.
    await db
        .collection("aiEnrichmentRetryQueue")
        .doc(rowId)
        .delete()
        .catch(() => {
            /* idempotent */
        })
    return { ok: true, rowId, status: "human_rejected" }
}

export async function editEnrichment(
    db: Firestore,
    rowId: string,
    edits: EditPayload,
    actorUid: string,
): Promise<ActionResult> {
    const ref = db.collection("library_index").doc(rowId)
    const snap = await ref.get()
    if (!snap.exists) {
        return {
            ok: false,
            code: "row_not_found",
            message: `library_index row "${rowId}" not found.`,
        }
    }

    const update: Record<string, unknown> = {
        enrichmentStatus: "human_curated",
        enrichmentReviewedAt: new Date().toISOString(),
        enrichmentReviewedBy: actorUid,
    }
    if (edits.title !== undefined) {
        const t = edits.title.trim()
        if (!t) {
            return {
                ok: false,
                code: "invalid_field",
                message: "title cannot be empty when supplied.",
            }
        }
        update.name = t
        update.nameLower = t.toLowerCase()
        update.humanRenamedAt = new Date().toISOString()
    }
    if (edits.collection !== undefined) {
        if (!ALLOWED_COLLECTIONS.includes(edits.collection)) {
            return {
                ok: false,
                code: "invalid_field",
                message: `collection must be one of: ${ALLOWED_COLLECTIONS.join(", ")}`,
            }
        }
        update.collection = edits.collection
    }
    if (edits.key !== undefined) {
        update.key = edits.key
    }
    if (edits.bpm !== undefined) {
        if (edits.bpm === null) {
            update.bpm = null
        } else if (typeof edits.bpm === "number" && edits.bpm > 0) {
            update.bpm = edits.bpm
        } else {
            return {
                ok: false,
                code: "invalid_field",
                message: "bpm must be a positive number or null.",
            }
        }
    }
    if (edits.leadMusician !== undefined) {
        update.leadMusician = edits.leadMusician
    }
    if (edits.tags !== undefined) {
        if (!Array.isArray(edits.tags) || edits.tags.some((t) => typeof t !== "string")) {
            return {
                ok: false,
                code: "invalid_field",
                message: "tags must be an array of strings.",
            }
        }
        update.tags = edits.tags
    }

    await ref.update(update)
    await db
        .collection("aiEnrichmentRetryQueue")
        .doc(rowId)
        .delete()
        .catch(() => {
            /* idempotent */
        })
    return { ok: true, rowId, status: "human_curated" }
}

export async function retryFailed(
    db: Firestore,
    rowId: string,
    kind: FailedKind,
    actorUid: string,
): Promise<ActionResult> {
    if (kind === "enrichment") {
        const queueRef = db.collection("aiEnrichmentRetryQueue").doc(rowId)
        const queueSnap = await queueRef.get()
        if (!queueSnap.exists) {
            return {
                ok: false,
                code: "queue_doc_missing",
                message: `aiEnrichmentRetryQueue/${rowId} not found — nothing to retry.`,
            }
        }
        const data = queueSnap.data() ?? {}
        const now = new Date().toISOString()
        const next: Record<string, unknown> = {
            ...data,
            attempts: 0,
            nextRetryAt: now,
            updatedAt: now,
            retryRequestedBy: actorUid,
            retryRequestedAt: now,
        }
        delete next.exhaustedAt
        delete next.lastError
        await queueRef.set(next)
        // Reset the library_index status so the next drain knows to act.
        await db
            .collection("library_index")
            .doc(rowId)
            .update({
                enrichmentStatus: "pending",
                enrichmentLastError: null,
                enrichmentRetryRequestedAt: now,
                enrichmentRetryRequestedBy: actorUid,
            })
            .catch((err) => {
                logger.warn(
                    `[review-queue] retryFailed library_index update failed for ${rowId}: ${err instanceof Error ? err.message : String(err)}`,
                )
            })
        return { ok: true, rowId, status: "pending" }
    }

    // kind === 'import'
    const importRef = db.collection("chartImportQueue").doc(rowId)
    const importSnap = await importRef.get()
    if (!importSnap.exists) {
        return {
            ok: false,
            code: "queue_doc_missing",
            message: `chartImportQueue/${rowId} not found — nothing to retry.`,
        }
    }
    await importRef.delete()
    return { ok: true, rowId, status: "deleted_for_retry" }
}

export async function dismissFailed(
    db: Firestore,
    rowId: string,
    kind: FailedKind,
    actorUid: string,
): Promise<ActionResult> {
    const now = new Date().toISOString()
    if (kind === "enrichment") {
        const rowRef = db.collection("library_index").doc(rowId)
        const rowSnap = await rowRef.get()
        if (!rowSnap.exists) {
            return {
                ok: false,
                code: "row_not_found",
                message: `library_index row "${rowId}" not found.`,
            }
        }
        await rowRef.update({
            enrichmentStatus: "human_rejected",
            enrichmentReviewedAt: now,
            enrichmentReviewedBy: actorUid,
        })
        await db
            .collection("aiEnrichmentRetryQueue")
            .doc(rowId)
            .delete()
            .catch(() => {
                /* idempotent */
            })
        return { ok: true, rowId, status: "human_rejected" }
    }

    // kind === 'import'
    const importRef = db.collection("chartImportQueue").doc(rowId)
    const importSnap = await importRef.get()
    if (!importSnap.exists) {
        return {
            ok: false,
            code: "queue_doc_missing",
            message: `chartImportQueue/${rowId} not found.`,
        }
    }
    await importRef.update({
        dismissed: true,
        dismissedAt: now,
        dismissedBy: actorUid,
    })
    return { ok: true, rowId, status: "dismissed" }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isFieldEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === ""
}
