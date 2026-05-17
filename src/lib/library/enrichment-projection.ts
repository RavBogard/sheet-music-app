import "server-only"

import type { Firestore } from "firebase-admin/firestore"

// Type-only — never pulls the `@google/genai` runtime into callers'
// import graphs (mirrors the `import type` posture used in
// `src/lib/library/review-queue.ts`).
import type { EnrichmentOutput } from "@/lib/library/ai-enrichment"

/**
 * Cycle-3 AI-001 (cowork-2026-05-17 finding) — read-tool projection of the AI
 * enrichment subscriber's state so any MCP-side library inspection
 * (`get_song` / `search_library` / `list_library` / `get_chart_status`) shows
 * what the AI thought of a row inline. a4 + a5 ship the dedicated review-queue
 * surfaces (HTTP + MCP); this projection closes the gap that AI state was
 * invisible to standard read tools (Daniel + David's MCP-first authoring
 * surface — see [[user_mcp_is_primary_author_workflow]]).
 *
 * The four projection fields are sourced from two Firestore locations:
 *  - `library_index/{fileId}` — `enrichmentStatus`, `aiSuggestion` (the full
 *    EnrichmentOutput blob persisted by a3's `applyEnrichment`). The blob is
 *    typically ~200 tokens of structured JSON; inline is the established norm
 *    (mirrors a5's `get_enrichment_suggestion` hydration in
 *    `src/lib/mcp/tools/library-review.ts`).
 *  - `aiEnrichmentRetryQueue/{fileId}` — existence ⇒ `retryQueued: true`.
 *    Lets Daniel see at a glance that a retry pass is still in flight (the
 *    `/api/cron/ai-enrich-retry` cron will replay).
 *
 * `enrichmentConfidence` is denormalized from `aiSuggestion.confidence`
 * because callers usually want the bare number for filtering/sorting and
 * shouldn't have to plumb through the full suggestion blob.
 */

export type EnrichmentStatus =
    | "pending"
    | "review_pending"
    | "enriched"
    | "failed"
    | "human_curated"
    | "human_rejected"

export interface EnrichmentProjection {
    enrichmentStatus: EnrichmentStatus | null
    enrichmentConfidence: number | null
    aiSuggestion: EnrichmentOutput | null
    retryQueued: boolean
}

export const EMPTY_ENRICHMENT_PROJECTION: EnrichmentProjection = {
    enrichmentStatus: null,
    enrichmentConfidence: null,
    aiSuggestion: null,
    retryQueued: false,
}

const ALLOWED_ENRICHMENT_STATUSES: ReadonlySet<EnrichmentStatus> = new Set([
    "pending",
    "review_pending",
    "enriched",
    "failed",
    "human_curated",
    "human_rejected",
])

/**
 * Pure projection from a raw `library_index/{fileId}` doc data blob +
 * retry-queue presence boolean. Used by tools that already have the
 * library_index data in hand (list_library iterates every row; search_library
 * pre-joins via loadLibraryW02Map). Unknown / malformed enrichmentStatus
 * values collapse to `null` so the wire contract stays narrow.
 */
export function projectionFromLibraryIndexData(
    data: Record<string, unknown> | undefined | null,
    retryQueued: boolean,
): EnrichmentProjection {
    if (!data) {
        return { ...EMPTY_ENRICHMENT_PROJECTION, retryQueued }
    }
    const rawStatus =
        typeof data.enrichmentStatus === "string" ? data.enrichmentStatus : null
    const status =
        rawStatus && ALLOWED_ENRICHMENT_STATUSES.has(rawStatus as EnrichmentStatus)
            ? (rawStatus as EnrichmentStatus)
            : null
    const suggestion =
        data.aiSuggestion && typeof data.aiSuggestion === "object"
            ? (data.aiSuggestion as EnrichmentOutput)
            : null
    const confidence =
        suggestion && typeof suggestion.confidence === "number"
            ? suggestion.confidence
            : null
    return {
        enrichmentStatus: status,
        enrichmentConfidence: confidence,
        aiSuggestion: suggestion,
        retryQueued,
    }
}

/**
 * Single-fileId projection — used by `get_song` + `get_chart_status` which
 * read one row at a time and don't otherwise touch `library_index`. Two
 * parallel reads (library_index/{id} + aiEnrichmentRetryQueue/{id}).
 */
export async function loadEnrichmentProjection(
    db: Firestore,
    fileId: string,
): Promise<EnrichmentProjection> {
    const [indexSnap, retrySnap] = await Promise.all([
        db.collection("library_index").doc(fileId).get(),
        db.collection("aiEnrichmentRetryQueue").doc(fileId).get(),
    ])
    return projectionFromLibraryIndexData(
        indexSnap.exists ? (indexSnap.data() ?? null) : null,
        retrySnap.exists,
    )
}

/**
 * Bulk fetch of every retry-queue doc id. Used by `searchLibrary` /
 * `listLibrary` which already fan over `library_index` and can merge the
 * retry set in a single pass. Returns the id set rather than full docs
 * because callers only need existence. Bounded by retry-queue size
 * (≤ row count failing AI enrichment within the BACKOFF_MINUTES window).
 */
export async function loadRetryQueueIds(
    db: Firestore,
): Promise<Set<string>> {
    const snap = await db
        .collection("aiEnrichmentRetryQueue")
        .select() // ids only — no field bodies pulled
        .get()
    return new Set(snap.docs.map((d) => d.id))
}
