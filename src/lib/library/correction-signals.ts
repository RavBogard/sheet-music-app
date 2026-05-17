/**
 * Cycle-3 c3 — Correction-signal capture + aggregation.
 *
 * Observation infrastructure for a4's `/manage/library-review` action
 * handlers. Every accept / reject / edit / retry / dismiss on the review
 * queue persists a structured `aiCorrectionSignals/<signalId>` document
 * so future calibration phases (a c4-class auto-tuner — out of scope here)
 * can read aggregated counters from `aiCorrectionStats/latest` and
 * deterministically propose threshold or trigger adjustments grounded
 * in real review behavior.
 *
 * Standing rules honored:
 *  - [[feedback_learning_self_healing]] — agent-facing features with a
 *    human-correction step should record corrections as structured
 *    signals; the future self-healing layer uses deterministic
 *    counters, not ML.
 *  - [[feedback_upload_atomicity]] — emit fires AFTER the review action's
 *    Firestore write succeeds; the emit itself is fail-open. A signal
 *    write throw NEVER fails the user's review action.
 *  - Daniel-ratified 2026-05-18T17:20Z: ship now even without data;
 *    future reviews populate it.
 *
 * Hard scope discipline (msg-001):
 *  - This module ONLY observes. It does NOT propose tuning, mutate
 *    `aiConfig`, or call back into a3's enrichment pipeline.
 *  - Counters stay simple: count + mean + p50 + p90. No histograms,
 *    no learned models, no per-musician dashboards.
 */

import "server-only"

import { randomUUID } from "crypto"
import type { Firestore } from "firebase-admin/firestore"
import { z } from "zod"

import { logger } from "@/lib/logger"

// ─── Constants ─────────────────────────────────────────────────────────────

export const SIGNALS_COLLECTION = "aiCorrectionSignals"
export const STATS_COLLECTION = "aiCorrectionStats"
/** Singleton aggregate doc id — cron overwrites in place. */
export const STATS_DOC_ID = "latest"

/** Hard cap on signals scanned per aggregation pass. */
const AGGREGATE_SCAN_LIMIT = 5000

/** All review-queue action verbs that emit a signal. */
export const CORRECTION_ACTIONS = [
    "accept",
    "reject",
    "edit",
    "retry",
    "dismiss",
] as const
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number]

// ─── Schema ────────────────────────────────────────────────────────────────

/**
 * Shape captured at the moment the human acted. Mirrors the row state
 * the human saw in `/manage/library-review`, so the aggregator can
 * answer questions like "when collection_disagrees_with_folder fired,
 * what % did the human accept?" without re-reading the row.
 */
const BeforeStateSchema = z.object({
    /** The row's `enrichmentStatus` before the action — review_pending / failed / human_rejected / enriched / etc. */
    enrichmentStatus: z.string(),
    /** AI's self-assessed confidence; null when the row had no aiSuggestion (e.g. retry on a pure import failure). */
    confidence: z.number().nullable(),
    /** Full EnrichmentOutput blob persisted on the row by a3's `applyEnrichment`. May be null for import-failure rows. */
    aiSuggestion: z.unknown().nullable(),
    /** Snapshot of `library_index.aiReviewTriggers` so rejection-attribution doesn't need to re-read the row. */
    reviewTriggers: z.array(z.string()),
})

const AfterStateSchema = z.object({
    /** Resulting `enrichmentStatus` after the action — enriched / human_rejected / human_curated / pending / dismissed. */
    enrichmentStatus: z.string(),
    /**
     * Snapshot of the fields that were actually written by the action.
     * For `edit`: the operator's overrides. For `accept`: the AI suggestion
     * fields that landed on the row. For `reject` / `retry` / `dismiss`:
     * usually empty.
     */
    finalFields: z.record(z.string(), z.unknown()).optional(),
})

export const CorrectionSignalInputSchema = z.object({
    rowId: z.string().min(1),
    uid: z.string().min(1),
    action: z.enum(CORRECTION_ACTIONS),
    beforeState: BeforeStateSchema,
    afterState: AfterStateSchema,
    /** Fields the human edited on `edit` (e.g. `['title', 'key']`). Empty otherwise. */
    fieldsChanged: z.array(z.string()),
    /** AI-suggested fields that were applied on `accept`. Empty otherwise. */
    fieldsAccepted: z.array(z.string()),
})

export type CorrectionSignalInput = z.infer<typeof CorrectionSignalInputSchema>

export const CorrectionSignalSchema = CorrectionSignalInputSchema.extend({
    signalId: z.string().min(1),
    /** ISO-8601 string. Following project convention — every other library
     * doc stamps `new Date().toISOString()` rather than serverTimestamp(). */
    timestamp: z.string().min(1),
})

export type CorrectionSignal = z.infer<typeof CorrectionSignalSchema>

// ─── Emit ──────────────────────────────────────────────────────────────────

/**
 * Persist a correction signal. **Fail-open** — every code path swallows
 * thrown errors and logs them. Callers (the review-queue action handlers)
 * MUST await this without wrapping in try/catch; the user's review action
 * is guaranteed to succeed regardless of this module's state.
 *
 * Idempotence: signals are append-only. Each call mints a fresh signalId
 * via randomUUID + action prefix, so retries from the UI (e.g. double-
 * click on accept) record two distinct signals — that's intentional, the
 * aggregator's edit-frequency counters want to see the duplicate.
 */
export async function emitCorrectionSignal(
    db: Firestore,
    input: CorrectionSignalInput,
): Promise<void> {
    try {
        const validated = CorrectionSignalInputSchema.safeParse(input)
        if (!validated.success) {
            logger.warn(
                `[correction-signals] input validation failed for ${input?.action ?? "?"} on ${input?.rowId ?? "?"}: ${validated.error.issues
                    .slice(0, 3)
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ")}`,
            )
            return
        }
        const now = new Date().toISOString()
        const signalId = `${validated.data.action}-${validated.data.rowId}-${now}-${randomUUID().slice(0, 8)}`
        const signal: CorrectionSignal = {
            ...validated.data,
            signalId,
            timestamp: now,
        }
        await db.collection(SIGNALS_COLLECTION).doc(signalId).set(signal)
    } catch (err) {
        logger.warn(
            `[correction-signals] persist failed for ${input?.action ?? "?"} on ${input?.rowId ?? "?"}: ${err instanceof Error ? err.message : String(err)}`,
        )
    }
}

// ─── Aggregation ───────────────────────────────────────────────────────────

export interface ConfidenceStat {
    count: number
    mean: number | null
    p50: number | null
    p90: number | null
}

export interface CorrectionStats {
    /** ISO when this aggregation snapshot was computed. */
    computedAt: string
    /** ISO floor of the scan window (exclusive lower bound omitted → null). */
    since: string | null
    /** ISO ceiling of the scan window (exclusive upper bound omitted → null). */
    until: string | null
    /** Was the AGGREGATE_SCAN_LIMIT hit (i.e. counters reflect a truncated view)? */
    truncated: boolean
    /** Total signals counted in this window. */
    totalSignals: number
    /** Count per action across the window. */
    actionDistribution: Record<CorrectionAction, number>
    /** Confidence stats bucketed by action — answers "do high-confidence rows get accepted more?". */
    confidenceDistributionByAction: Record<CorrectionAction, ConfidenceStat>
    /**
     * When `aiSuggestion.collection_disagrees_with_folder` was true at
     * action time: what fraction got accepted? `rate` is acceptedCount /
     * flaggedTotal (NaN-safe: rate is null when flaggedTotal is 0).
     */
    collectionMismatchAcceptanceRate: {
        flaggedTotal: number
        acceptedCount: number
        rate: number | null
    }
    /** On `edit` actions: how often each editable field was changed. */
    editFieldFrequency: Record<string, number>
    /**
     * On `reject` + `dismiss` actions: how often each review trigger
     * fired (e.g. `low_confidence` → 12, `is_chart_false` → 4).
     * Identifies which trigger drives the most rejections so future
     * calibration knows where to look.
     */
    rejectionTriggerAttribution: Record<string, number>
}

export interface AggregateOptions {
    /** ISO-8601 lower bound, inclusive. Omit for unlimited lookback. */
    since?: string
    /** ISO-8601 upper bound, exclusive. Omit for "up to now". */
    until?: string
    /** Override default scan cap. Capped at {@link AGGREGATE_SCAN_LIMIT}. */
    limit?: number
}

/**
 * Walk `aiCorrectionSignals` and compute the 6-axis counter set the
 * future c4-class auto-tuner will read. Deterministic + simple — count,
 * mean, p50, p90. No learned components.
 *
 * Idempotent: same window in → same counters out (modulo new signals
 * landing between calls).
 */
export async function aggregateCorrectionSignals(
    db: Firestore,
    options: AggregateOptions = {},
): Promise<CorrectionStats> {
    const limit = Math.min(options.limit ?? AGGREGATE_SCAN_LIMIT, AGGREGATE_SCAN_LIMIT)
    const since = options.since ?? null
    const until = options.until ?? null

    let query: FirebaseFirestore.Query = db.collection(SIGNALS_COLLECTION)
    if (since) query = query.where("timestamp", ">=", since)
    if (until) query = query.where("timestamp", "<", until)
    // Order by timestamp so a truncated scan returns a contiguous prefix.
    // Firestore requires an orderBy on the range field; this is consistent.
    query = query.orderBy("timestamp", "asc").limit(limit)

    const snap = await query.get()
    const truncated = snap.size >= limit

    const actionDistribution: Record<CorrectionAction, number> = {
        accept: 0,
        reject: 0,
        edit: 0,
        retry: 0,
        dismiss: 0,
    }
    const confidenceByAction: Record<CorrectionAction, number[]> = {
        accept: [],
        reject: [],
        edit: [],
        retry: [],
        dismiss: [],
    }
    let mismatchFlagged = 0
    let mismatchAccepted = 0
    const editFieldFrequency: Record<string, number> = {}
    const rejectionTriggerAttribution: Record<string, number> = {}

    for (const doc of snap.docs) {
        const parsed = CorrectionSignalSchema.safeParse(doc.data())
        if (!parsed.success) {
            // Tolerate one malformed row — it's signal, not config. Log and skip.
            logger.warn(
                `[correction-signals] skipping malformed signal ${doc.id}: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            )
            continue
        }
        const sig = parsed.data
        actionDistribution[sig.action] += 1

        if (typeof sig.beforeState.confidence === "number") {
            confidenceByAction[sig.action].push(sig.beforeState.confidence)
        }

        const sug = sig.beforeState.aiSuggestion as
            | { collection_disagrees_with_folder?: unknown }
            | null
        if (sug && sug.collection_disagrees_with_folder === true) {
            mismatchFlagged += 1
            if (sig.action === "accept") mismatchAccepted += 1
        }

        if (sig.action === "edit") {
            for (const field of sig.fieldsChanged) {
                editFieldFrequency[field] = (editFieldFrequency[field] ?? 0) + 1
            }
        }

        if (sig.action === "reject" || sig.action === "dismiss") {
            for (const trigger of sig.beforeState.reviewTriggers) {
                rejectionTriggerAttribution[trigger] =
                    (rejectionTriggerAttribution[trigger] ?? 0) + 1
            }
        }
    }

    const confidenceDistributionByAction = Object.fromEntries(
        CORRECTION_ACTIONS.map((a) => [a, summarizeConfidence(confidenceByAction[a])]),
    ) as Record<CorrectionAction, ConfidenceStat>

    return {
        computedAt: new Date().toISOString(),
        since,
        until,
        truncated,
        totalSignals: snap.size,
        actionDistribution,
        confidenceDistributionByAction,
        collectionMismatchAcceptanceRate: {
            flaggedTotal: mismatchFlagged,
            acceptedCount: mismatchAccepted,
            rate: mismatchFlagged === 0 ? null : mismatchAccepted / mismatchFlagged,
        },
        editFieldFrequency,
        rejectionTriggerAttribution,
    }
}

/**
 * Persist the latest aggregate snapshot at the singleton stats doc.
 * Cron path: `/api/cron/aggregate-corrections` calls this every 6h.
 * Read path: `get_correction_stats` MCP tool reads the same doc.
 */
export async function writeCorrectionStats(
    db: Firestore,
    stats: CorrectionStats,
): Promise<void> {
    await db.collection(STATS_COLLECTION).doc(STATS_DOC_ID).set(stats)
}

/**
 * Read the most recent aggregate snapshot. Returns null when the cron
 * hasn't populated it yet — admin tool surfaces that as the empty
 * shape rather than an error.
 */
export async function readCorrectionStats(
    db: Firestore,
): Promise<CorrectionStats | null> {
    const snap = await db.collection(STATS_COLLECTION).doc(STATS_DOC_ID).get()
    if (!snap.exists) return null
    const data = snap.data()
    if (!data) return null
    // Best-effort coerce — the aggregator wrote the shape, and we don't want
    // a stale-shape upgrade to lock readers out. Pass through on success.
    return data as CorrectionStats
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function summarizeConfidence(values: number[]): ConfidenceStat {
    if (values.length === 0) {
        return { count: 0, mean: null, p50: null, p90: null }
    }
    const sorted = [...values].sort((a, b) => a - b)
    const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length
    return {
        count: sorted.length,
        mean: roundTo(mean, 4),
        p50: roundTo(percentile(sorted, 0.5), 4),
        p90: roundTo(percentile(sorted, 0.9), 4),
    }
}

/**
 * Linear-interpolated percentile over a pre-sorted array. p=0 returns
 * min, p=1 returns max. Empty input is caller's responsibility (we
 * short-circuit in summarizeConfidence).
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 1) return sorted[0]
    const idx = (sorted.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    const frac = idx - lo
    return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

function roundTo(value: number, digits: number): number {
    const m = 10 ** digits
    return Math.round(value * m) / m
}
