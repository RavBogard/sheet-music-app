import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import {
    readReviewQueue,
    acceptEnrichment as acceptEnrichmentHelper,
    rejectEnrichment as rejectEnrichmentHelper,
    editEnrichment as editEnrichmentHelper,
    retryFailed as retryFailedHelper,
    dismissFailed as dismissFailedHelper,
    type ActionResult,
    type AiFailedRow,
    type AiReviewRow,
    type EditPayload,
    type FailedKind,
    type ImportFailureRow,
    type ReviewQueueResult,
} from "@/lib/library/review-queue"
import type { EnrichmentOutput } from "@/lib/library/ai-enrichment"
import { logger } from "@/lib/logger"

/**
 * Cycle-3 a5 — MCP-tool counterpart to a4's `/manage/library-review` admin UI.
 *
 * Mirrors the seven HTTP affordances over a4's shared
 * `src/lib/library/review-queue.ts` helper module so Daniel (or any admin
 * MCP caller) can triage `review_pending`, `failed`, and `chartImportQueue`
 * rows from Claude Desktop without opening the browser. The action helpers
 * are NOT reimplemented here — every write path calls into a4's exported
 * `acceptEnrichment` / `rejectEnrichment` / `editEnrichment` / `retryFailed`
 * / `dismissFailed` functions directly so the semantics stay locked to one
 * source of truth.
 *
 * Auth: admin-only at the tool layer (mirrors a4's HTTP gate; band_leader is
 * NOT trusted enough for review-queue actions per the a4 spec). Refusal is
 * the rich `forbidden_role` envelope.
 *
 * Write contract: F-05 standing rule — dryRun-default + force-gated. dryRun
 * runs the same upstream validation the helper would (row exists, suggestion
 * exists, edits well-formed) and returns the would-be `plannedStatus` without
 * writing. Real-run without `force: true` returns the rich force_required envelope (REG-003):
 * true` and still no writes. Pair `dryRun: false, force: true` for the
 * actual write — mirrors `reconcile_library` / `set_ai_auto_apply` /
 * `set_ai_threshold` / `backfill_setlist_test_flag` / `backfill_library_index`.
 *
 * Idempotence: re-running `accept_enrichment` on a row that's already
 * `enrichmentStatus: 'enriched'` succeeds (the helper just re-stamps the
 * reviewedAt/reviewedBy timestamps + gap-fill applies no further fields).
 * Same for the other writes — the helper functions are designed idempotent.
 */

// ─── Common shapes ─────────────────────────────────────────────────────────

const ALLOWED_KINDS = ["enrichment", "import", "all"] as const
const ALLOWED_STATUSES = ["review_pending", "failed"] as const
const ALLOWED_COLLECTIONS = ["core", "supplemental", "uploads"] as const
const ALLOWED_EDIT_FIELDS = new Set([
    "title",
    "collection",
    "key",
    "bpm",
    "leadMusician",
    "tags",
])
const ALLOWED_FAILED_KINDS = ["enrichment", "import"] as const

const LIST_DEFAULT_LIMIT = 50
const LIST_MAX_LIMIT = 200

interface AdminGateOk {
    ok: true
    db: FirebaseFirestore.Firestore
}

async function assertAdmin(
    uid: string,
): Promise<AdminGateOk | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true, db }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: "Library-review tools require an admin account.",
        hint: "Ask an admin to elevate your account, or use the read tools that don't require admin.",
    })
}

function liftActionResult(
    result: ActionResult,
    args: { rowId: string; extra?: Record<string, unknown> } = { rowId: "" },
): RichErrorEnvelope | null {
    if (result.ok) return null
    return richError(
        result.code,
        result.message,
        { rowId: args.rowId, ...(args.extra ?? {}) },
        hintFor(result.code),
    )
}

type ActionErrorCode =
    | "row_not_found"
    | "invalid_state"
    | "queue_doc_missing"
    | "invalid_field"

function hintFor(code: ActionErrorCode | string): string {
    switch (code) {
        case "row_not_found":
            return "Call `list_review_queue` to see live rowIds, or pass a fresh `rowId` from `get_enrichment_suggestion`."
        case "invalid_state":
            return "Row has no AI suggestion to accept — fetch with `get_enrichment_suggestion` to inspect, or call `edit_enrichment` to set fields directly."
        case "queue_doc_missing":
            return "The retry / import queue doc is gone — the row may have already drained. Call `list_review_queue` to refresh."
        case "invalid_field":
            return "Adjust the `edits` payload to match the field constraints (title non-empty; collection ∈ core/supplemental/uploads; bpm > 0 or null; tags string[])."
        default:
            return "Call `list_review_queue` to refresh state, then retry."
    }
}

// ─── list_review_queue ─────────────────────────────────────────────────────

export interface ListReviewQueueArgs {
    kind?: "enrichment" | "import" | "all"
    status?: "review_pending" | "failed"
    limit?: number
}

export interface ListReviewQueueResult {
    ok: true
    kind: "enrichment" | "import" | "all"
    status: "review_pending" | "failed" | "all"
    aiReview: AiReviewRow[]
    aiFailed: AiFailedRow[]
    importFailures: ImportFailureRow[]
    counts: {
        aiReview: number
        aiFailed: number
        importFailures: number
        total: number
    }
    config: ReviewQueueResult["config"]
    /** True when any bucket was truncated by the caller's `limit`. */
    truncated: boolean
}

export async function listReviewQueue(
    uid: string,
    args: ListReviewQueueArgs = {},
): Promise<ListReviewQueueResult | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate

    const kind = args.kind ?? "all"
    if (!ALLOWED_KINDS.includes(kind)) {
        return richError(
            "invalid_argument",
            `kind must be one of: ${ALLOWED_KINDS.join(", ")}`,
            { kind },
            "Omit `kind` to return everything, or pass 'enrichment' / 'import' / 'all'.",
        )
    }
    const status = args.status
    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        return richError(
            "invalid_argument",
            `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
            { status },
            "Omit `status` to return everything, or pass 'review_pending' / 'failed'.",
        )
    }
    const rawLimit = args.limit ?? LIST_DEFAULT_LIMIT
    if (
        typeof rawLimit !== "number" ||
        !Number.isFinite(rawLimit) ||
        rawLimit < 1
    ) {
        return richError(
            "invalid_argument",
            "limit must be a positive integer.",
            { limit: rawLimit },
            `Default is ${LIST_DEFAULT_LIMIT}; max is ${LIST_MAX_LIMIT}.`,
        )
    }
    const limit = Math.min(Math.floor(rawLimit), LIST_MAX_LIMIT)

    try {
        const full = await readReviewQueue(gate.db)
        const reviewSource = status === "failed" ? [] : full.aiReview
        const failedSource = status === "review_pending" ? [] : full.aiFailed
        const importSource = status === "review_pending" ? [] : full.importFailures

        const showAiReview = kind === "enrichment" || kind === "all"
        const showAiFailed = kind === "enrichment" || kind === "all"
        const showImport = kind === "import" || kind === "all"

        const aiReview = showAiReview ? reviewSource.slice(0, limit) : []
        const aiFailed = showAiFailed ? failedSource.slice(0, limit) : []
        const importFailures = showImport ? importSource.slice(0, limit) : []

        const truncated =
            (showAiReview && reviewSource.length > aiReview.length) ||
            (showAiFailed && failedSource.length > aiFailed.length) ||
            (showImport && importSource.length > importFailures.length)

        return {
            ok: true,
            kind,
            status: status ?? "all",
            aiReview,
            aiFailed,
            importFailures,
            counts: {
                aiReview: aiReview.length,
                aiFailed: aiFailed.length,
                importFailures: importFailures.length,
                total:
                    aiReview.length +
                    aiFailed.length +
                    importFailures.length,
            },
            config: full.config,
            truncated,
        }
    } catch (err) {
        return richError(
            "review_queue_read_failed",
            `Failed to read review queue: ${err instanceof Error ? err.message : String(err)}`,
            {},
            "Retry shortly. If the failure persists, check the AI enrichment subscriber + drive-sync poller logs.",
        )
    }
}

// ─── get_enrichment_suggestion ─────────────────────────────────────────────

export interface GetEnrichmentSuggestionArgs {
    rowId: string
}

export interface GetEnrichmentSuggestionResult {
    ok: true
    rowId: string
    title: string
    collection: string
    enrichmentStatus: string
    suggestion: EnrichmentOutput | null
    triggers: string[]
    current: AiReviewRow["current"]
    duplicateCandidates: AiReviewRow["duplicateCandidates"]
    enrichmentRanAt: string | null
    enrichmentLastError: string | null
}

export async function getEnrichmentSuggestion(
    uid: string,
    args: GetEnrichmentSuggestionArgs,
): Promise<GetEnrichmentSuggestionResult | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate

    if (typeof args?.rowId !== "string" || !args.rowId.trim()) {
        return richError(
            "invalid_argument",
            "rowId is required.",
            { rowId: args?.rowId ?? null },
            "Pass a library_index document id (visible on every row in `list_review_queue`).",
        )
    }

    try {
        const ref = gate.db.collection("library_index").doc(args.rowId)
        const snap = await ref.get()
        if (!snap.exists) {
            return richError(
                "row_not_found",
                `library_index row "${args.rowId}" not found.`,
                { rowId: args.rowId },
                hintFor("row_not_found"),
            )
        }
        const data = snap.data() ?? {}
        const sug = (data.aiSuggestion ?? null) as EnrichmentOutput | null

        // Hydrate duplicate_candidates titles in one batched read so the
        // caller can see what stems collided without a second round-trip.
        const candidateIds = Array.isArray(sug?.duplicate_candidates)
            ? (sug!.duplicate_candidates as string[]).slice(0, 50)
            : []
        const duplicateCandidates: AiReviewRow["duplicateCandidates"] = []
        if (candidateIds.length > 0) {
            const refs = candidateIds.map((id) =>
                gate.db.collection("library_index").doc(id),
            )
            const snaps = await gate.db.getAll(...refs)
            for (const s of snaps) {
                if (!s.exists) continue
                const d = s.data() ?? {}
                duplicateCandidates.push({
                    rowId: s.id,
                    title: String(d.name ?? s.id),
                    collection: String(d.collection ?? ""),
                })
            }
        }

        return {
            ok: true,
            rowId: args.rowId,
            title: String(data.name ?? args.rowId),
            collection: String(data.collection ?? "uploads"),
            enrichmentStatus: String(data.enrichmentStatus ?? "unknown"),
            suggestion: sug,
            triggers: Array.isArray(data.aiReviewTriggers)
                ? (data.aiReviewTriggers as string[])
                : [],
            current: {
                title: String(data.name ?? args.rowId),
                collection: String(data.collection ?? "uploads"),
                ...(data.key ? { key: String(data.key) } : {}),
                ...(typeof data.bpm === "number" ? { bpm: data.bpm } : {}),
                ...(data.leadMusician
                    ? { leadMusician: String(data.leadMusician) }
                    : {}),
                ...(Array.isArray(data.tags)
                    ? { tags: data.tags as string[] }
                    : {}),
            },
            duplicateCandidates,
            enrichmentRanAt:
                typeof data.enrichmentRanAt === "string"
                    ? data.enrichmentRanAt
                    : null,
            enrichmentLastError:
                typeof data.enrichmentLastError === "string"
                    ? data.enrichmentLastError
                    : null,
        }
    } catch (err) {
        return richError(
            "review_queue_read_failed",
            `Failed to read library_index/${args.rowId}: ${err instanceof Error ? err.message : String(err)}`,
            { rowId: args.rowId },
            "Retry shortly; check Firestore connectivity.",
        )
    }
}

// ─── Write tools — shared dryRun/force scaffolding ─────────────────────────

interface WriteCommon {
    rowId?: string
    dryRun?: boolean
    force?: boolean
}

export interface WriteSuccessEnvelope {
    ok: true
    rowId: string
    /** Final library_index.enrichmentStatus (or chartImportQueue posture) after the action. */
    status: string
    dryRun: boolean
    /** Human-readable preview of what the write would do. Always populated. */
    plannedStatus: string
    /** Optional context (e.g. fields the helper would gap-fill for `accept`). */
    plannedPatch?: Record<string, unknown>
}

function requireRowId(rowId: unknown): RichErrorEnvelope | null {
    if (typeof rowId !== "string" || !rowId.trim()) {
        return richError(
            "invalid_argument",
            "rowId is required.",
            { rowId: rowId ?? null },
            "Pass a library_index id (visible in `list_review_queue`).",
        )
    }
    return null
}

interface WriteOutcome<TStatus extends string> {
    ok: true
    rowId: string
    finalStatus: TStatus
    plannedPatch?: Record<string, unknown>
}

/**
 * Common dryRun/force orchestrator. The caller passes:
 *
 *  - `validate(db)` — runs every check the helper does (row exists, etc.)
 *    and returns either a rich envelope OR a `{ plannedStatus, plannedPatch? }`
 *    preview. Called on BOTH dryRun + real-run paths so dryRun catches the
 *    same refusals the real-run would.
 *  - `commit(db)` — only invoked on `dryRun: false, force: true`; calls
 *    a4's helper, then lifts `ActionResult` into the rich envelope.
 */
async function runWrite<TStatus extends string>(
    db: FirebaseFirestore.Firestore,
    args: WriteCommon,
    validate: () =>
        | Promise<
              | { ok: true; plannedStatus: TStatus; plannedPatch?: Record<string, unknown> }
              | RichErrorEnvelope
          >
        | { ok: true; plannedStatus: TStatus; plannedPatch?: Record<string, unknown> }
        | RichErrorEnvelope,
    commit: () => Promise<RichErrorEnvelope | WriteOutcome<TStatus>>,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    void db
    const dryRun = args.dryRun !== false
    const force = args.force === true

    const preview = await validate()
    if (!preview.ok) return preview

    const planned = preview

    if (dryRun) {
        return {
            ok: true,
            rowId: String(args.rowId ?? ""),
            status: planned.plannedStatus,
            plannedStatus: planned.plannedStatus,
            plannedPatch: planned.plannedPatch,
            dryRun: true,
        }
    }

    if (!force) {
        // Cycle-3 REG-003: real-run without force → rich force_required.
        return richError(
            "force_required",
            "Pass force:true to commit library-review writes.",
            {
                rowId: String(args.rowId ?? ""),
                dryRunPlan: {
                    plannedStatus: planned.plannedStatus,
                    plannedPatch: planned.plannedPatch,
                },
            },
            "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
        )
    }

    const committed = await commit()
    if (!isWriteOutcome(committed)) return committed
    return {
        ok: true,
        rowId: committed.rowId,
        status: committed.finalStatus,
        plannedStatus: planned.plannedStatus,
        plannedPatch: planned.plannedPatch,
        dryRun: false,
    }
}

function isWriteOutcome<TStatus extends string>(
    v: WriteOutcome<TStatus> | RichErrorEnvelope,
): v is WriteOutcome<TStatus> {
    return (v as { error?: unknown }).error === undefined
}

// ─── accept_enrichment ─────────────────────────────────────────────────────

export interface AcceptEnrichmentArgs extends WriteCommon {
    rowId: string
}

export async function acceptEnrichment(
    uid: string,
    args: AcceptEnrichmentArgs,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    return runWrite(
        gate.db,
        args,
        async () => {
            const snap = await gate.db
                .collection("library_index")
                .doc(args.rowId)
                .get()
            if (!snap.exists) {
                return richError(
                    "row_not_found",
                    `library_index row "${args.rowId}" not found.`,
                    { rowId: args.rowId },
                    hintFor("row_not_found"),
                )
            }
            const data = snap.data() ?? {}
            const sug = (data.aiSuggestion ?? null) as EnrichmentOutput | null
            if (!sug) {
                return richError(
                    "invalid_state",
                    `Row "${args.rowId}" has no AI suggestion to accept.`,
                    { rowId: args.rowId },
                    hintFor("invalid_state"),
                )
            }
            // Preview the gap-fill the helper would apply (mirrors
            // acceptEnrichment in review-queue.ts).
            const plannedPatch: Record<string, unknown> = {}
            if (isEmpty(data.key) && sug.suggested_key) {
                plannedPatch.key = sug.suggested_key
            }
            if (isEmpty(data.bpm) && sug.suggested_bpm !== null) {
                plannedPatch.bpm = sug.suggested_bpm
            }
            if (isEmpty(data.leadMusician) && sug.suggested_lead) {
                plannedPatch.leadMusician = sug.suggested_lead
            }
            if (
                (!Array.isArray(data.tags) || data.tags.length === 0) &&
                sug.suggested_tags.length > 0
            ) {
                plannedPatch.tags = sug.suggested_tags
            }
            if (
                sug.suggested_title &&
                sug.suggested_title !== data.name &&
                !data.humanRenamedAt
            ) {
                plannedPatch.name = sug.suggested_title
            }
            return {
                ok: true as const,
                plannedStatus: "enriched" as const,
                plannedPatch,
            }
        },
        async () => {
            const result = await acceptEnrichmentHelper(
                gate.db,
                args.rowId,
                uid,
            )
            const err = liftActionResult(result, { rowId: args.rowId })
            if (err) return err
            logger.info("[mcp] accept_enrichment committed", {
                uid,
                rowId: args.rowId,
            })
            return {
                ok: true,
                rowId: args.rowId,
                finalStatus: "enriched" as const,
            }
        },
    )
}

// ─── reject_enrichment ─────────────────────────────────────────────────────

export interface RejectEnrichmentArgs extends WriteCommon {
    rowId: string
}

export async function rejectEnrichment(
    uid: string,
    args: RejectEnrichmentArgs,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    return runWrite(
        gate.db,
        args,
        async () => {
            const snap = await gate.db
                .collection("library_index")
                .doc(args.rowId)
                .get()
            if (!snap.exists) {
                return richError(
                    "row_not_found",
                    `library_index row "${args.rowId}" not found.`,
                    { rowId: args.rowId },
                    hintFor("row_not_found"),
                )
            }
            return {
                ok: true as const,
                plannedStatus: "human_rejected" as const,
            }
        },
        async () => {
            const result = await rejectEnrichmentHelper(
                gate.db,
                args.rowId,
                uid,
            )
            const err = liftActionResult(result, { rowId: args.rowId })
            if (err) return err
            logger.info("[mcp] reject_enrichment committed", {
                uid,
                rowId: args.rowId,
            })
            return {
                ok: true,
                rowId: args.rowId,
                finalStatus: "human_rejected" as const,
            }
        },
    )
}

// ─── edit_enrichment ───────────────────────────────────────────────────────

export interface EditEnrichmentArgs extends WriteCommon {
    rowId: string
    edits: EditPayload
}

export async function editEnrichment(
    uid: string,
    args: EditEnrichmentArgs,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    const edits = (args?.edits ?? {}) as EditPayload
    const editValidation = validateEditPayload(edits)
    if (editValidation) return editValidation

    return runWrite(
        gate.db,
        args,
        async () => {
            const snap = await gate.db
                .collection("library_index")
                .doc(args.rowId)
                .get()
            if (!snap.exists) {
                return richError(
                    "row_not_found",
                    `library_index row "${args.rowId}" not found.`,
                    { rowId: args.rowId },
                    hintFor("row_not_found"),
                )
            }
            return {
                ok: true as const,
                plannedStatus: "human_curated" as const,
                plannedPatch: { ...edits },
            }
        },
        async () => {
            const result = await editEnrichmentHelper(
                gate.db,
                args.rowId,
                edits,
                uid,
            )
            const err = liftActionResult(result, {
                rowId: args.rowId,
                extra: { edits },
            })
            if (err) return err
            logger.info("[mcp] edit_enrichment committed", {
                uid,
                rowId: args.rowId,
                fields: Object.keys(edits),
            })
            return {
                ok: true,
                rowId: args.rowId,
                finalStatus: "human_curated" as const,
            }
        },
    )
}

function validateEditPayload(edits: EditPayload): RichErrorEnvelope | null {
    if (!edits || typeof edits !== "object") {
        return richError(
            "invalid_argument",
            "edits must be an object.",
            { edits: edits ?? null },
            hintFor("invalid_field"),
        )
    }
    const keys = Object.keys(edits)
    if (keys.length === 0) {
        return richError(
            "invalid_argument",
            "edits must include at least one field.",
            { edits },
            "Pass any subset of: title, collection, key, bpm, leadMusician, tags.",
        )
    }
    for (const k of keys) {
        if (!ALLOWED_EDIT_FIELDS.has(k)) {
            return richError(
                "invalid_field",
                `Unknown edit field "${k}".`,
                { field: k, allowed: [...ALLOWED_EDIT_FIELDS] },
                "Drop the unknown field and retry. The helper rejects unknown fields at write time too.",
            )
        }
    }
    if (edits.title !== undefined) {
        if (typeof edits.title !== "string" || !edits.title.trim()) {
            return richError(
                "invalid_field",
                "title cannot be empty when supplied.",
                { field: "title" },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.collection !== undefined) {
        if (!ALLOWED_COLLECTIONS.includes(edits.collection)) {
            return richError(
                "invalid_field",
                `collection must be one of: ${ALLOWED_COLLECTIONS.join(", ")}`,
                { field: "collection", allowed: [...ALLOWED_COLLECTIONS] },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.bpm !== undefined) {
        if (
            edits.bpm !== null &&
            !(typeof edits.bpm === "number" && edits.bpm > 0)
        ) {
            return richError(
                "invalid_field",
                "bpm must be a positive number or null.",
                { field: "bpm" },
                hintFor("invalid_field"),
            )
        }
    }
    if (edits.tags !== undefined) {
        if (
            !Array.isArray(edits.tags) ||
            edits.tags.some((t) => typeof t !== "string")
        ) {
            return richError(
                "invalid_field",
                "tags must be an array of strings.",
                { field: "tags" },
                hintFor("invalid_field"),
            )
        }
    }
    if (
        edits.key !== undefined &&
        typeof edits.key !== "string"
    ) {
        return richError(
            "invalid_field",
            "key must be a string.",
            { field: "key" },
            hintFor("invalid_field"),
        )
    }
    if (
        edits.leadMusician !== undefined &&
        typeof edits.leadMusician !== "string"
    ) {
        return richError(
            "invalid_field",
            "leadMusician must be a string.",
            { field: "leadMusician" },
            hintFor("invalid_field"),
        )
    }
    return null
}

// ─── retry_enrichment ──────────────────────────────────────────────────────

export interface RetryEnrichmentArgs extends WriteCommon {
    rowId: string
    /** Defaults to 'enrichment'; pass 'import' to re-enqueue a chartImportQueue failure. */
    kind?: FailedKind
}

export async function retryEnrichment(
    uid: string,
    args: RetryEnrichmentArgs,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    const kind = (args?.kind ?? "enrichment") as FailedKind
    if (!ALLOWED_FAILED_KINDS.includes(kind)) {
        return richError(
            "invalid_argument",
            `kind must be one of: ${ALLOWED_FAILED_KINDS.join(", ")}`,
            { kind },
            "Pass 'enrichment' to rewind the aiEnrichmentRetryQueue doc, or 'import' to delete the chartImportQueue doc.",
        )
    }

    return runWrite(
        gate.db,
        args,
        async () => {
            const collection =
                kind === "enrichment"
                    ? "aiEnrichmentRetryQueue"
                    : "chartImportQueue"
            const snap = await gate.db
                .collection(collection)
                .doc(args.rowId)
                .get()
            if (!snap.exists) {
                return richError(
                    "queue_doc_missing",
                    `${collection}/${args.rowId} not found — nothing to retry.`,
                    { rowId: args.rowId, kind },
                    hintFor("queue_doc_missing"),
                )
            }
            return {
                ok: true as const,
                plannedStatus:
                    kind === "enrichment"
                        ? ("pending" as const)
                        : ("deleted_for_retry" as const),
                plannedPatch: { kind },
            }
        },
        async () => {
            const result = await retryFailedHelper(
                gate.db,
                args.rowId,
                kind,
                uid,
            )
            const err = liftActionResult(result, {
                rowId: args.rowId,
                extra: { kind },
            })
            if (err) return err
            logger.info("[mcp] retry_enrichment committed", {
                uid,
                rowId: args.rowId,
                kind,
            })
            return {
                ok: true,
                rowId: args.rowId,
                finalStatus:
                    kind === "enrichment"
                        ? ("pending" as const)
                        : ("deleted_for_retry" as const),
            }
        },
    )
}

// ─── dismiss_failure ───────────────────────────────────────────────────────

export interface DismissFailureArgs extends WriteCommon {
    rowId: string
    kind: FailedKind
}

export async function dismissFailure(
    uid: string,
    args: DismissFailureArgs,
): Promise<WriteSuccessEnvelope | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate
    const bad = requireRowId(args?.rowId)
    if (bad) return bad

    const kind = args?.kind as FailedKind
    if (!ALLOWED_FAILED_KINDS.includes(kind)) {
        return richError(
            "invalid_argument",
            `kind must be one of: ${ALLOWED_FAILED_KINDS.join(", ")}`,
            { kind: kind ?? null },
            "Pass 'enrichment' to mark the library_index row human_rejected, or 'import' to dismiss the chartImportQueue doc.",
        )
    }

    return runWrite(
        gate.db,
        args,
        async () => {
            if (kind === "enrichment") {
                const snap = await gate.db
                    .collection("library_index")
                    .doc(args.rowId)
                    .get()
                if (!snap.exists) {
                    return richError(
                        "row_not_found",
                        `library_index row "${args.rowId}" not found.`,
                        { rowId: args.rowId, kind },
                        hintFor("row_not_found"),
                    )
                }
                return {
                    ok: true as const,
                    plannedStatus: "human_rejected" as const,
                    plannedPatch: { kind },
                }
            }
            // kind === 'import'
            const snap = await gate.db
                .collection("chartImportQueue")
                .doc(args.rowId)
                .get()
            if (!snap.exists) {
                return richError(
                    "queue_doc_missing",
                    `chartImportQueue/${args.rowId} not found.`,
                    { rowId: args.rowId, kind },
                    hintFor("queue_doc_missing"),
                )
            }
            return {
                ok: true as const,
                plannedStatus: "dismissed" as const,
                plannedPatch: { kind },
            }
        },
        async () => {
            const result = await dismissFailedHelper(
                gate.db,
                args.rowId,
                kind,
                uid,
            )
            const err = liftActionResult(result, {
                rowId: args.rowId,
                extra: { kind },
            })
            if (err) return err
            logger.info("[mcp] dismiss_failure committed", {
                uid,
                rowId: args.rowId,
                kind,
            })
            return {
                ok: true,
                rowId: args.rowId,
                finalStatus:
                    kind === "enrichment"
                        ? ("human_rejected" as const)
                        : ("dismissed" as const),
            }
        },
    )
}

// ─── helpers ───────────────────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === ""
}
