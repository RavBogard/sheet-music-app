/**
 * Cycle-3 NEW-3 (A3) — AI enrichment subscriber.
 *
 * Post-import, fail-open, advisory-only Claude Sonnet pass that runs on
 * every `library.row.created` event (regardless of ingest path: HTTP
 * upload, MCP upload_chart, MCP import_chart_from_drive, Drive cron,
 * MCP reconcile_library).
 *
 * Architectural rules from ADDENDUM-1 §3 (load-bearing — do not violate):
 *
 *   1. Post-import placement. The row already exists in library_index
 *      and bytes are already in Storage before this module runs. We
 *      MUTATE library_index here; we do NOT undo the import.
 *   2. Fail-open. AI timeout / validation failure / network error →
 *      queue retry, row keeps raw metadata. Never throw back to the
 *      event bus. Never block an import.
 *   3. Path-agnostic. We subscribe to library.row.created — that's it.
 *      No per-ingest-path branching.
 *   4. Advisory on collection. David's subfolder choice is source of
 *      truth. We surface `collection_disagrees_with_folder` and route
 *      to review_pending, but never auto-overwrite `collection`.
 *   5. No format conversion. We inspect content (PDF first page, text,
 *      images) and emit suggestions; we never transform bytes.
 *   6. Deterministic by content hash. `aiEnrichmentCache/<sha256>` keeps
 *      the structured output keyed by file bytes — re-runs on the same
 *      bytes are zero-token replays.
 *   7. Never auto-delete on semantic duplicate. duplicate_candidates
 *      surface to the review queue (A4); existing hash + title-stem
 *      dedup at upload time keeps doing its auto-merge job for the
 *      safe cases.
 *
 * `autoApplyEnabled` (default false) forces every row to review_pending
 * for the calibration period (ADDENDUM-1 §6). Daniel flips the toggle
 * via Firebase Console when he's seen enough of the AI's calls in
 * `/manage/library-review` (NEW-4 — A4 lane).
 */

import "server-only"
import { Anthropic } from "@anthropic-ai/sdk"
import type { Firestore } from "firebase-admin/firestore"
import { z } from "zod"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { downloadFromStoragePath } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"
import {
    onLibraryRowCreated,
    type LibraryRowCreatedEvent,
} from "@/lib/library/library-events"

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Sonnet 4.7 has the strongest multi-modal grounding for chart content
 * (PDF documents, scanned images, handwritten lead sheets). The model id
 * is centralized here so prompt tuning + caching can swap it in one
 * place. If 4.7 becomes unavailable in the env, the call surfaces as a
 * provider error → retry queue.
 */
export const AI_ENRICHMENT_MODEL = "claude-sonnet-4-7"

/**
 * Hard cap on output tokens. The structured-output payload is tiny
 * (~200 tokens), so 1024 is a generous ceiling that keeps cost flat
 * while leaving headroom for `concerns: []` prose.
 */
const MAX_OUTPUT_TOKENS = 1024

/** Daniel-ratified default — config-driven via aiConfig/autoApplyEnabled. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7

/** Max retry attempts before marking enrichmentStatus: 'failed'. */
const MAX_RETRY_ATTEMPTS = 3

/** Backoff schedule in minutes — `attempts` indexes into this list. */
const BACKOFF_MINUTES = [5, 30, 120, 360]

const ALLOWED_COLLECTIONS = ["core", "supplemental", "uploads"] as const

// ─── Output schema ─────────────────────────────────────────────────────────

/**
 * Mirrors ADDENDUM-1 §3 "Structured output". Zod validates every Sonnet
 * tool_use payload — a malformed response counts as enrichment-failed
 * and enters the retry queue.
 */
export const EnrichmentOutputSchema = z.object({
    is_chart: z.boolean(),
    confidence: z.number().min(0).max(1),
    suggested_title: z.string().nullable(),
    suggested_collection: z.enum(ALLOWED_COLLECTIONS).nullable(),
    collection_disagrees_with_folder: z.boolean(),
    suggested_key: z.string().nullable(),
    suggested_bpm: z.number().nullable(),
    suggested_lead: z.string().nullable(),
    suggested_tags: z.array(z.string()),
    duplicate_candidates: z.array(z.string()),
    concerns: z.array(z.string()),
    review_required: z.boolean(),
})

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>

/** Hand-built JSON Schema for Anthropic's tool input — z@4 has no built-in emitter. */
const TOOL_INPUT_SCHEMA = {
    type: "object" as const,
    properties: {
        is_chart: {
            type: "boolean",
            description:
                "True if the file is a usable performance chart (chord sheet, lead sheet, MusicXML, sheet music PDF). False for non-musical content (e.g. accidental upload of receipt, photo of the room, blank scan).",
        },
        confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
                "Self-assessed confidence in this enrichment. Below 0.7 forces human review.",
        },
        suggested_title: {
            type: ["string", "null"],
            description:
                'Proposed display title following library conventions (e.g. "Shalom Rav (Frankel)"). null if no improvement over the current name.',
        },
        suggested_collection: {
            type: ["string", "null"],
            enum: [...ALLOWED_COLLECTIONS, null],
            description:
                'Proposed library collection (core / supplemental / uploads). NOTE: David\'s subfolder choice is source of truth — we surface disagreement, never overwrite.',
        },
        collection_disagrees_with_folder: {
            type: "boolean",
            description:
                "True if the chart content/style strongly suggests a different collection than the one currently set (e.g. file is in `uploads/` but is a clear Frankel chart that belongs in supplemental).",
        },
        suggested_key: {
            type: ["string", "null"],
            description:
                "Detected key, if visible on the chart (e.g. 'G', 'Em', 'Bb'). null if not determinable.",
        },
        suggested_bpm: {
            type: ["number", "null"],
            description:
                "Detected tempo in BPM, if visible. null if not determinable.",
        },
        suggested_lead: {
            type: ["string", "null"],
            description:
                'Vocal-lead annotation if hand-written on the chart (e.g. "Rabbi Daniel"). null otherwise. NEVER fabricate.',
        },
        suggested_tags: {
            type: "array",
            items: { type: "string" },
            description:
                "Short, kebab-case tags (e.g. 'friday-evening', 'high-holy-days', 'frankel'). Empty array if uncertain.",
        },
        duplicate_candidates: {
            type: "array",
            items: { type: "string" },
            description:
                "library_index doc ids that look like duplicates of this row (from the neighbor context). Empty array if none.",
        },
        concerns: {
            type: "array",
            items: { type: "string" },
            description:
                "Free-form notes for the human reviewer. Empty array if clean.",
        },
        review_required: {
            type: "boolean",
            description:
                "Set true if anything about this row would benefit from human eyes regardless of confidence (e.g. handwriting illegible, multiple songs on one page, ambiguous arrangement).",
        },
    },
    required: [
        "is_chart",
        "confidence",
        "suggested_title",
        "suggested_collection",
        "collection_disagrees_with_folder",
        "suggested_key",
        "suggested_bpm",
        "suggested_lead",
        "suggested_tags",
        "duplicate_candidates",
        "concerns",
        "review_required",
    ],
    additionalProperties: false,
} as const

const TOOL_NAME = "submit_chart_enrichment"

// ─── Library naming conventions (cached system-prompt block) ──────────────

const LIBRARY_CONVENTIONS = `Library naming conventions (CRC music library):

- Reform Jewish liturgical music + supplemental.
- Common naming: "Title (Composer)" or "Title (Arrangement)" — e.g.
  "Shalom Rav (Frankel)", "Mi Chamocha (Klepper)".
- Hebrew-Latin transliteration is the canonical form (NOT Hebrew script
  on chart titles, even if the chart itself is in Hebrew).
- Collections:
    - core: high-frequency liturgical music (Shabbat liturgy, Hatzi
      Kaddish, etc.) — used every week.
    - supplemental: niggunim, holiday-specific, occasional repertoire.
    - uploads: provisional landing zone; everything starts here unless
      David routed it explicitly via Drive subfolder.
- Tags are short, kebab-case, optional. Examples:
  "friday-evening", "shabbat-morning", "high-holy-days", "frankel",
  "klepper", "shireinu", "kavanah".

If you're not sure of a field, return null / [] — do NOT guess.`

// ─── Config + dependency injection ────────────────────────────────────────

export interface AiEnrichmentConfig {
    /** Master switch — false when ANTHROPIC_API_KEY is missing. */
    enabled: boolean
    /** aiConfig/autoApplyEnabled. Default false (calibration phase). */
    autoApplyEnabled: boolean
    /** aiConfig/threshold. Default 0.7. */
    threshold: number
}

export interface AiEnrichmentDeps {
    db: Firestore
    /**
     * Returns a Sonnet structured-output. Tests inject a deterministic
     * mock; prod uses {@link callSonnetForEnrichment}.
     */
    callModel: (args: {
        event: LibraryRowCreatedEvent
        fileBytes: Buffer | null
        neighborTitles: string[]
    }) => Promise<EnrichmentOutput>
    /** Returns the file bytes (post-conversion) for AI inspection. */
    fetchBytes: (storagePath: string) => Promise<Buffer | null>
    /** Loads the aiConfig flag set. */
    loadConfig: (db: Firestore) => Promise<AiEnrichmentConfig>
}

// ─── Public API: enrichment driver + retry drain ───────────────────────────

/**
 * Run the AI enrichment pipeline for one library row. Used by both the
 * event subscriber and the cron retry queue. ALWAYS fail-open — every
 * thrown error from the model / network / Firestore is caught and
 * routed to the retry queue. Never throws.
 */
export async function enrichLibraryRow(
    event: LibraryRowCreatedEvent,
    deps: AiEnrichmentDeps,
): Promise<void> {
    const { db, callModel, fetchBytes, loadConfig } = deps

    let config: AiEnrichmentConfig
    try {
        config = await loadConfig(db)
    } catch (err) {
        logger.warn(
            `[ai-enrichment] config load failed for ${event.rowId}; leaving status:'pending' — ${describeError(err)}`,
        )
        return
    }

    if (!config.enabled) {
        // ANTHROPIC_API_KEY unset — leave row at 'pending'. The cron drain
        // re-checks on each tick; once the key is set, queued rows pick
        // up. No row movement here means the failed status stays clean.
        return
    }

    // ─── Cache lookup ────────────────────────────────────────────────────
    let output: EnrichmentOutput | null = null
    try {
        output = await readCache(db, event.contentHash)
    } catch (err) {
        logger.warn(
            `[ai-enrichment] cache read failed for ${event.contentHash.slice(0, 8)}: ${describeError(err)}`,
        )
    }

    if (!output) {
        // ─── Model call (with retry-queue routing on failure) ────────────
        try {
            const fileBytes = await fetchBytes(event.storagePath)
            const neighborTitles = await fetchNeighborTitles(db, event)
            output = await callModel({ event, fileBytes, neighborTitles })

            // Validate before any persistence — schema drift = retry-eligible failure.
            const validated = EnrichmentOutputSchema.safeParse(output)
            if (!validated.success) {
                throw new Error(
                    `Sonnet output failed schema validation: ${validated.error.issues
                        .slice(0, 3)
                        .map((i) => `${i.path.join(".")}: ${i.message}`)
                        .join("; ")}`,
                )
            }
            output = validated.data

            await writeCache(db, event.contentHash, output)
        } catch (err) {
            await queueRetry(db, event, err)
            return
        }
    }

    // ─── Apply the output (auto-apply gate + review-trigger logic) ────────
    try {
        await applyEnrichment(db, event, output, config)
        await clearRetry(db, event.rowId)
    } catch (err) {
        await queueRetry(db, event, err)
    }
}

/**
 * Drain the AI retry queue. Called from /api/cron/ai-enrich-retry every
 * 30 minutes. Replays rows whose `nextRetryAt` has passed.
 */
export async function processAiEnrichmentRetryQueue(
    deps: AiEnrichmentDeps,
    options: { limit?: number; now?: () => Date } = {},
): Promise<{ scanned: number; retried: number; skipped: number; failed: number }> {
    const { db } = deps
    const limit = options.limit ?? 25
    const now = (options.now ?? (() => new Date()))()

    const snap = await db
        .collection("aiEnrichmentRetryQueue")
        .where("nextRetryAt", "<=", now.toISOString())
        .limit(limit)
        .get()

    let retried = 0
    let skipped = 0
    let failed = 0

    for (const doc of snap.docs) {
        const data = doc.data() as {
            rowId: string
            event?: LibraryRowCreatedEvent
            attempts?: number
        }
        if (!data.event) {
            // Pre-rehydration row (or hand-seeded). Skip — we can't replay
            // without the original event payload.
            skipped++
            continue
        }
        try {
            await enrichLibraryRow(data.event, deps)
            retried++
        } catch (err) {
            failed++
            logger.error(
                `[ai-enrichment] retry replay threw for ${data.rowId}: ${describeError(err)}`,
            )
        }
    }

    return { scanned: snap.size, retried, skipped, failed }
}

// ─── Default-deps wiring (production subscriber) ──────────────────────────

/**
 * Build the default dependency set. Production code uses this; tests
 * supply their own mocks via {@link enrichLibraryRow} directly.
 */
export function buildDefaultDeps(): AiEnrichmentDeps {
    initAdmin()
    return {
        db: getFirestore(),
        callModel: callSonnetForEnrichment,
        fetchBytes: defaultFetchBytes,
        loadConfig: defaultLoadConfig,
    }
}

/**
 * Subscribe the AI enrichment handler to library.row.created. Idempotent
 * via the registered flag — safe to call multiple times (instrumentation
 * may re-register on hot reload in dev).
 */
let registered = false
export function registerAiEnrichmentSubscriber(
    depsOverride?: AiEnrichmentDeps,
): void {
    if (registered) return
    registered = true
    const deps = depsOverride ?? buildDefaultDeps()
    onLibraryRowCreated((event) => {
        return enrichLibraryRow(event, deps).catch((err) => {
            // enrichLibraryRow is supposed to never throw; this is the
            // outermost safety net. We log and swallow.
            logger.error(
                `[ai-enrichment] handler caught (should never happen): ${describeError(err)}`,
            )
        })
    })
}

/** Test-only — let tests reset registration between cases. */
export function __resetRegisteredForTesting(): void {
    registered = false
}

// ─── Default implementations ──────────────────────────────────────────────

async function defaultLoadConfig(db: Firestore): Promise<AiEnrichmentConfig> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const enabled = !!apiKey && apiKey.length > 0

    const snap = await db.collection("aiConfig").doc("autoApplyEnabled").get()
    const data = snap.data() ?? {}
    return {
        enabled,
        autoApplyEnabled: data.enabled === true, // default false
        threshold:
            typeof data.threshold === "number" &&
            data.threshold > 0 &&
            data.threshold <= 1
                ? data.threshold
                : DEFAULT_CONFIDENCE_THRESHOLD,
    }
}

async function defaultFetchBytes(storagePath: string): Promise<Buffer | null> {
    const r = await downloadFromStoragePath(storagePath)
    if (!r.success) return null
    return r.data.buffer
}

// ─── Anthropic call ───────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
    if (anthropicClient) return anthropicClient
    anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    })
    return anthropicClient
}

/** Test-only — reset the client so a fresh apiKey is picked up. */
export function __resetAnthropicClientForTesting(): void {
    anthropicClient = null
}

export async function callSonnetForEnrichment(args: {
    event: LibraryRowCreatedEvent
    fileBytes: Buffer | null
    neighborTitles: string[]
}): Promise<EnrichmentOutput> {
    const { event, fileBytes, neighborTitles } = args
    const client = getAnthropicClient()

    const userContent = buildUserContent(event, fileBytes, neighborTitles)

    const response = await client.messages.create({
        model: AI_ENRICHMENT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Stable preamble — wins prompt caching on repeat calls.
        system: [
            {
                type: "text",
                text: `You are an enrichment assistant for the Central Reform Congregation music library. You inspect a chart file plus its current library_index metadata and emit a structured enrichment report via the ${TOOL_NAME} tool. You NEVER refuse — you always emit the tool call. If you're uncertain, return low confidence, populate \`concerns\`, and set \`review_required: true\`. Do NOT fabricate fields you can't determine from the input.\n\n${LIBRARY_CONVENTIONS}`,
                cache_control: { type: "ephemeral" },
            },
        ],
        tools: [
            {
                name: TOOL_NAME,
                description:
                    "Submit the structured enrichment report for this library row. ALWAYS call this exactly once.",
                // The Anthropic SDK's InputSchema type is `{ type: 'object', ... }`;
                // our hand-built constant is structurally identical, but the
                // SDK's stricter typing on indexed-access doesn't admit our
                // const-asserted literal map. Cast through unknown is fine —
                // the runtime payload is the JSON we want.
                input_schema:
                    TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool["input_schema"],
            },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
            {
                role: "user",
                content: userContent,
            },
        ],
    })

    // The tool_choice above forces a tool_use block.
    const toolUseBlock = response.content.find((b) => b.type === "tool_use")
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        throw new Error(
            `Sonnet returned no tool_use block (stop_reason=${response.stop_reason}); falling back to retry queue.`,
        )
    }
    if (toolUseBlock.name !== TOOL_NAME) {
        throw new Error(
            `Sonnet returned unexpected tool '${toolUseBlock.name}' (expected '${TOOL_NAME}').`,
        )
    }
    // Schema validation happens in the caller.
    return toolUseBlock.input as unknown as EnrichmentOutput
}

type SupportedImageMediaType =
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp"

type UserContentBlock =
    | { type: "text"; text: string }
    | {
          type: "image"
          source: {
              type: "base64"
              media_type: SupportedImageMediaType
              data: string
          }
      }
    | {
          type: "document"
          source: { type: "base64"; media_type: "application/pdf"; data: string }
      }

function asSupportedImageMediaType(
    mime: string,
): SupportedImageMediaType | null {
    switch (mime) {
        case "image/jpeg":
        case "image/png":
        case "image/gif":
        case "image/webp":
            return mime
        default:
            return null
    }
}

function buildUserContent(
    event: LibraryRowCreatedEvent,
    fileBytes: Buffer | null,
    neighborTitles: string[],
): UserContentBlock[] {
    const blocks: UserContentBlock[] = []

    // File representation (per ADDENDUM-1 §3 "Input to AI").
    if (fileBytes) {
        if (event.mimeType === "application/pdf") {
            // Sonnet supports PDF document blocks natively. Sends the
            // whole PDF (multi-page) up to the per-request size limit
            // — Sonnet handles page-by-page interpretation.
            blocks.push({
                type: "document",
                source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: fileBytes.toString("base64"),
                },
            })
        } else if (
            event.mimeType.startsWith("image/") &&
            asSupportedImageMediaType(event.mimeType) !== null
        ) {
            // HEIC/HEIF inputs have already been converted to JPEG by
            // processChartUpload before we get here, so the mimeType
            // we see is image/jpeg in that case. Other image mimes the
            // Anthropic API doesn't accept fall through to metadata-only.
            const mt = asSupportedImageMediaType(event.mimeType)
            if (mt) {
                blocks.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: mt,
                        data: fileBytes.toString("base64"),
                    },
                })
            }
        } else if (
            event.mimeType.includes("xml") ||
            event.mimeType.startsWith("text/")
        ) {
            // MusicXML / text: send as text, truncated to keep token
            // cost predictable. 12K chars ≈ 3K tokens.
            const text = fileBytes.toString("utf-8").slice(0, 12_000)
            blocks.push({
                type: "text",
                text: `File content (mime: ${event.mimeType}):\n\n${text}`,
            })
        } else {
            // Unsupported mime → metadata-only fallback (per addendum §3).
            blocks.push({
                type: "text",
                text: `File mime: ${event.mimeType} — content not inspected (unsupported binary). Enrich from metadata only.`,
            })
        }
    } else {
        blocks.push({
            type: "text",
            text: `File bytes unavailable from Storage at ${event.storagePath}. Enrich from metadata only.`,
        })
    }

    // Metadata + neighbor context.
    const metadata = [
        `Current library_index metadata for fileId=${event.fileId}:`,
        `- title: ${event.title}`,
        `- collection: ${event.collection}`,
        `- mimeType: ${event.mimeType}`,
        `- sizeBytes: ${event.sizeBytes}`,
        `- source: ${event.source}`,
        event.subfolder
            ? `- driveSubfolder: ${event.subfolder} (this is David's routing signal — source of truth for collection)`
            : `- driveSubfolder: (none — direct upload, not a Drive cron import)`,
    ].join("\n")

    const neighbors =
        neighborTitles.length > 0
            ? `Nearby titles in this folder/collection (for naming convention reference):\n${neighborTitles
                  .map((t) => `  - ${t}`)
                  .join("\n")}`
            : `(No neighbor titles available — this may be the first chart in its collection.)`

    blocks.push({
        type: "text",
        text: `${metadata}\n\n${neighbors}\n\nEmit your enrichment via ${TOOL_NAME}. Remember: David's Drive subfolder choice is source of truth for collection — if you think the collection is wrong, set \`collection_disagrees_with_folder: true\` and surface in \`concerns\` rather than overriding via \`suggested_collection\`.`,
    })

    return blocks
}

// ─── Firestore helpers ─────────────────────────────────────────────────────

async function readCache(
    db: Firestore,
    contentHash: string,
): Promise<EnrichmentOutput | null> {
    const snap = await db.collection("aiEnrichmentCache").doc(contentHash).get()
    if (!snap.exists) return null
    const data = snap.data()
    if (!data?.output) return null
    const parsed = EnrichmentOutputSchema.safeParse(data.output)
    return parsed.success ? parsed.data : null
}

async function writeCache(
    db: Firestore,
    contentHash: string,
    output: EnrichmentOutput,
): Promise<void> {
    await db
        .collection("aiEnrichmentCache")
        .doc(contentHash)
        .set({
            contentHash,
            output,
            model: AI_ENRICHMENT_MODEL,
            cachedAt: new Date().toISOString(),
        })
}

async function fetchNeighborTitles(
    db: Firestore,
    event: LibraryRowCreatedEvent,
): Promise<string[]> {
    // Cheap query — pull up to 10 active siblings in the same collection.
    // For Drive-sourced rows, we'd ideally filter by `driveParents.includes(subfolder)`,
    // but Firestore array-contains + range doesn't compose cleanly with our
    // existing indexes. Collection-level neighbors are a good-enough proxy
    // for naming-convention context.
    try {
        const snap = await db
            .collection("library_index")
            .where("collection", "==", event.collection)
            .where("status", "==", "active")
            .limit(10)
            .get()
        return snap.docs
            .filter((d) => d.id !== event.rowId)
            .map((d) => (d.data().name as string | undefined) ?? "")
            .filter((t) => t.length > 0)
            .slice(0, 10)
    } catch (err) {
        logger.warn(
            `[ai-enrichment] neighbor titles fetch failed for ${event.rowId}: ${describeError(err)}`,
        )
        return []
    }
}

// ─── Apply rules (auto-apply gate + review triggers) ───────────────────────

/**
 * Translates a Sonnet output into a library_index update. The crux of
 * NEW-3: when to auto-apply, when to flag for review, how to honor
 * David's-subfolder-is-truth + don't-overwrite-humans.
 */
export async function applyEnrichment(
    db: Firestore,
    event: LibraryRowCreatedEvent,
    output: EnrichmentOutput,
    config: AiEnrichmentConfig,
): Promise<void> {
    const ref = db.collection("library_index").doc(event.rowId)
    const snap = await ref.get()
    if (!snap.exists) {
        // Row deleted between import and enrichment — nothing to update.
        return
    }
    const currentRaw = snap.data() ?? {}

    const triggers = collectReviewTriggers(output, config.threshold)
    const needsReview = !config.autoApplyEnabled || triggers.length > 0

    const update: Record<string, unknown> = {
        enrichmentStatus: needsReview ? "review_pending" : "enriched",
        enrichmentRanAt: new Date().toISOString(),
        enrichmentModel: AI_ENRICHMENT_MODEL,
        // Always persist the full report so A4's review UI can show
        // reasoning even when we auto-applied.
        aiSuggestion: output,
        aiReviewTriggers: triggers,
    }

    if (!needsReview) {
        // Auto-apply gap-fillers only — NEVER overwrite human-set fields.
        // `collection` is NEVER overwritten regardless (David's subfolder
        // is source of truth — ADDENDUM-1 §3 rule #4).
        if (isFieldEmpty(currentRaw.key) && output.suggested_key) {
            update.key = output.suggested_key
        }
        if (isFieldEmpty(currentRaw.bpm) && output.suggested_bpm !== null) {
            update.bpm = output.suggested_bpm
        }
        if (isFieldEmpty(currentRaw.leadMusician) && output.suggested_lead) {
            update.leadMusician = output.suggested_lead
        }
        if (
            (!Array.isArray(currentRaw.tags) || currentRaw.tags.length === 0) &&
            output.suggested_tags.length > 0
        ) {
            update.tags = output.suggested_tags
        }
    }

    await ref.update(update)
}

function isFieldEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === ""
}

export function collectReviewTriggers(
    output: EnrichmentOutput,
    threshold: number,
): string[] {
    const triggers: string[] = []
    if (!output.is_chart) triggers.push("is_chart_false")
    if (output.review_required) triggers.push("review_required")
    if (output.confidence < threshold) triggers.push("low_confidence")
    if (output.collection_disagrees_with_folder)
        triggers.push("collection_disagrees_with_folder")
    if (output.duplicate_candidates.length > 0)
        triggers.push("duplicate_candidates")
    return triggers
}

// ─── Retry queue ───────────────────────────────────────────────────────────

async function queueRetry(
    db: Firestore,
    event: LibraryRowCreatedEvent,
    err: unknown,
): Promise<void> {
    const ref = db.collection("aiEnrichmentRetryQueue").doc(event.rowId)
    const prior = await ref.get()
    const attempts = ((prior.data()?.attempts as number | undefined) ?? 0) + 1
    const errorMsg = describeError(err)

    if (attempts > MAX_RETRY_ATTEMPTS) {
        // Give up — mark row failed, leave a forensic doc behind in the
        // retry queue (don't delete) so A4 can render it.
        await ref.set({
            rowId: event.rowId,
            fileId: event.fileId,
            event,
            attempts,
            lastError: errorMsg,
            exhaustedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
        try {
            await db
                .collection("library_index")
                .doc(event.rowId)
                .update({
                    enrichmentStatus: "failed",
                    enrichmentFailedAt: new Date().toISOString(),
                    enrichmentLastError: errorMsg.slice(0, 1000),
                })
        } catch (updateErr) {
            logger.warn(
                `[ai-enrichment] failed-status write failed for ${event.rowId}: ${describeError(updateErr)}`,
            )
        }
        return
    }

    const backoffMin = BACKOFF_MINUTES[attempts - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]
    const nextRetryAt = new Date(Date.now() + backoffMin * 60_000).toISOString()

    await ref.set({
        rowId: event.rowId,
        fileId: event.fileId,
        event,
        attempts,
        lastError: errorMsg,
        nextRetryAt,
        updatedAt: new Date().toISOString(),
    })
    logger.info(
        `[ai-enrichment] queued retry for ${event.rowId} (attempts=${attempts}, next=${nextRetryAt})`,
    )
}

async function clearRetry(db: Firestore, rowId: string): Promise<void> {
    try {
        await db.collection("aiEnrichmentRetryQueue").doc(rowId).delete()
    } catch (err) {
        // Non-fatal — leftover retry doc will be skipped on next drain
        // because the row already shows enrichmentStatus !== 'failed'.
        logger.warn(
            `[ai-enrichment] retry queue cleanup failed for ${rowId}: ${describeError(err)}`,
        )
    }
}

function describeError(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`
    return String(err)
}
