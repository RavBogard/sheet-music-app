import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
    listSetlists,
    getSetlist,
    findSetlistsReferencingChart,
    searchSetlists,
    findSetlistsFromTemplate,
} from "./setlists"
import { getCongregationContext } from "./congregation"
import {
    searchLibrary,
    getSong,
    listLibrary,
    dedupeLibraryIndex,
    backfillLibraryIndex,
} from "./library"
import { searchChartText } from "./chart-text-search"
import { reconcileLibrary } from "./reconcile-library"
import { salvageChartBytes } from "./salvage-chart-bytes"
import { backfillHealMetadata } from "./backfill-heal-metadata"
import { backfillTrackMimetype } from "./backfill-track-mimetype"
import { archiveNonChartArtifacts } from "./archive-nonchart-artifacts"
import { getAiConfig, setAiAutoApply, setAiThreshold } from "./ai-config"
import { getCorrectionStats } from "./correction-stats"
import { testDeleteStorageObject } from "./test-delete-storage-object"
import { dumpCollectionSize } from "./dump-collection-size"
import { getWebVitalsSummary } from "./web-vitals-summary"
import { getAiSpendSummary } from "./ai-spend-summary"
import {
    listReviewQueue,
    getEnrichmentSuggestion,
    acceptEnrichment as acceptEnrichmentTool,
    rejectEnrichment as rejectEnrichmentTool,
    editEnrichment as editEnrichmentTool,
    retryEnrichment as retryEnrichmentTool,
    dismissFailure as dismissFailureTool,
} from "./library-review"
import { backfillSetlistTestFlag } from "./setlist-hygiene"
import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    reorderSetlist,
    removeSetlistTrack,
    deleteSetlist,
    updateSetlistTrack,
    bulkUpdateSetlistTracks,
    bulkAddSetlistTracks,
    swapChart,
    recomputeSetlistTrackCount,
} from "./setlist-write"
import { cloneSetlist } from "./clone-setlist"
import { isErrorEnvelope } from "./result-iserror"
import { serializeTimestamps } from "../serialize-timestamps"
import {
    listTemplates,
    getTemplate,
    createTemplate,
    createTemplateFromSetlist,
    updateTemplate,
    deleteTemplate,
    cloneSetlistFromTemplate,
} from "./templates"
import {
    listMonitorBuses,
    getMix,
    getMatrix,
    setSendLevel,
    setSendMute,
    setBusFader,
    setMatrixFader,
    setMatrixMute,
} from "./monitor"
import {
    getCommandStatus,
    assignMonitorBus,
    unassignMonitorBus,
} from "./monitor-observability"
import { getBridgeHealth } from "./bridge-health"
import {
    bridgeResync,
    bridgeReconnect,
    bridgeSelftest,
    bridgeRestart,
} from "./bridge-recovery"
import {
    bridgeClearAcks,
    bridgeClearPendingCommands,
    bridgeGetLog,
} from "./bridge-housekeeping"
import {
    uploadChart,
    scrapeChartFromUrl,
    saveScrapedChart,
    deleteChart,
    importChartFromDrive,
} from "./library-upload"
import { downloadChart, generateGigPacket } from "./library-download"
import { generateServiceSheet } from "./service-sheet"
import { publishSetlist } from "./setlist-publish"
import { getChartStatus, verifySetlistCharts } from "./library-verify"
import { reviewChartBonds } from "./chart-bond-audit"
import {
    requestChartUploadUrl,
    finalizeChartUpload,
    beginChunkedChartUpload,
    appendChartUploadChunk,
    commitChunkedChartUpload,
} from "./library-upload-session"
import {
    waitForSetlistChange,
    WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC,
    WAIT_FOR_SETLIST_CHANGE_DEFAULT_TIMEOUT_SEC,
} from "./wait-for-setlist-change"
import {
    proposeSetlistChanges,
    commitStagedChanges,
} from "./propose-changes"
import { previewPublish } from "./preview-publish"
import { listContacts, createContact, deleteContact, findContact } from "./contacts"
import {
    flagBond,
    reviewFlaggedBonds,
    recordBondCorrection,
} from "./bond-corrections"
import {
    listMusicians,
    findUser,
    getMusicianProfile,
    listMusiciansOnDate,
    listPendingAssignments,
    suggestMusicians,
    suggestBand,
    assignMusician,
    unassignMusician,
    respondToAssignment,
} from "./roster"
import { listServicePersonnel } from "./service-personnel"
import { updateSong } from "./song-metadata"
import { listBooksTool, lookupBookPageTool } from "./books"
import { richError, liftLegacyErrorEnvelope } from "@/lib/mcp/error-envelopes"
export { registerTestTokenTools } from "./test-tokens"
export { registerMintAdminBearerTools } from "./mint-admin-bearer"
// v11-02-01: the caller-org resolution seam. v11-02-02 read tools consume it to
// scope reads by tenant; re-exported so tools resolve org from the same import
// site they use for uid. Imported locally too (a bare re-export isn't in-scope).
import { orgFrom } from "@/lib/mcp/org-context"
export { orgFrom }

/**
 * Validate that an `eventDate` string is parseable as a date. Previously the
 * raw string flowed through to Firestore's Timestamp.fromDate(new Date(s)),
 * which throws an opaque `Value for argument "seconds" is not a valid integer.`
 * on bad input. The refine catches it at the MCP layer with a friendly message.
 */
export const eventDateSchema = z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), {
        message: "eventDate must be an ISO date string",
    })
    .optional()

/**
 * W-04 Plan 02 shared schema piece. Optional gate: omit to keep last-
 * writer-wins behavior; supply to reject the write with a structured
 * `stale_version` envelope when another writer has advanced the
 * resource's version. The value is whatever `version` field came back on
 * the previous `get_setlist` / `list_setlists` / `update_*` echo.
 */
export const lastSeenVersionSchema = z
    .number()
    .int()
    .min(0)
    .optional()

/**
 * Outline fields shared by every setlist-row write surface — add_track_to_setlist,
 * bulk_add_tracks, update_track, bulk_update_tracks and propose_setlist_changes.
 *
 * Defined once because these five schemas have drifted before (`position` is
 * accepted by update_track but rejected by bulk_update_tracks). The parity
 * test in __tests__/outline-schema-parity.test.ts safeParses SAMPLE against
 * all five surfaces directly: `updateTrackPatchSchema` and
 * `bulkTrackPatchSchema` below for update_track/bulk_update_tracks, and the
 * exported `addTrackToSetlistFields` / `bulkAddTrackRowSchema` /
 * `proposeChangeProposalSchema` (which all spread the sibling
 * `trackRowFields` fragment) for add_track_to_setlist, bulk_add_tracks and
 * propose_setlist_changes — the same exported objects `registerWriteTools`
 * actually registers, not lookalikes, so an accidental field drop at any of
 * the five call sites fails the test.
 */
export const outlineFields = {
    performer: z
        .string()
        .optional()
        .describe(
            "Who leads this moment: 'Rabbi', 'Cantor', 'Congregation', 'Band'. Printed on the rabbi's service sheet.",
        ),
    description: z
        .string()
        .optional()
        .describe(
            "Body text for readings/prayers — responsive reading text or stage directions. Printed under the row on the service sheet.",
        ),
    estimatedMinutes: z
        .number()
        .int()
        .min(0)
        .max(600)
        .optional()
        .describe("Rough duration of this moment, for run-sheet timing."),
    liturgyRef: z
        .object({
            book: z
                .string()
                .min(1)
                .describe("Book registry slug — call list_books for valid values."),
            unitId: z
                .string()
                .min(1)
                .optional()
                .describe(
                    "Stable liturgical unit id (feed-tier books only), e.g. 'shma.mi-chamocha@rh-shacharit'. Get it from lookup_book_page.",
                ),
            folio: z
                .number()
                .int()
                .min(1)
                .describe(
                    "PRINTED page number in that book. Resolve it with lookup_book_page rather than guessing — a wrong page prints on the rabbi's sheet.",
                ),
        })
        .optional()
        .describe(
            "Where this moment is in the service's liturgy book. Use lookup_book_page against the setlist's `book` to resolve it.",
        ),
    honors: z
        .array(
            z.object({
                name: z.string().min(1).max(120).describe("Person being honored."),
                note: z
                    .string()
                    .max(200)
                    .optional()
                    .describe("Why/what, e.g. 'birthday — candle lighting'."),
            }),
        )
        .max(12)
        .optional()
        .describe(
            "Named congregants honored at this moment. Printed prominently on the rabbi's sheet. Never copied by templates or clone_setlist — honors are per-service.",
        ),
} as const

/**
 * Row/proposal field surface shared by add_track_to_setlist, the per-row
 * shape inside bulk_add_tracks, and the per-proposal shape inside
 * propose_setlist_changes. Extracted for the same reason as
 * `trackPatchFields` below: these three were separate hand-maintained
 * z.object literals — the fix that first threaded `outlineFields` into all
 * three (spreading it independently at each call site) left the OTHER seven
 * fields (songId/title/type/key/leadMusician/referenceLink/notes) still
 * hand-duplicated three times, with nothing to catch one of the three
 * silently drifting from the others. Not merged with `trackPatchFields`:
 * that fragment's `songId` is nullable (supports the update-path unbond
 * gesture) where this one's is not — same field name, different contract.
 */
export const trackRowFields = {
    songId: z
        .string()
        .min(1)
        .optional()
        .describe(
            "Library song id — defaults title/key/lead from this song AND bonds its chart to the row. The library is keyed by Drive file id.",
        ),
    title: z
        .string()
        .optional()
        .describe(
            "Row title — required for header / reading / prayer / transition / note rows, or to override a song's title",
        ),
    type: z
        .enum(["song", "header", "reading", "prayer", "transition", "note"])
        .optional()
        .describe(
            "Row type (default 'song'). 'header' = section break; 'reading' = Torah/scripture/responsive; 'prayer' = silent/responsive prayer; 'transition' = instrumental/transition; 'note' = free-text annotation.",
        ),
    key: z.string().optional().describe("Musical key for this row"),
    leadMusician: z.string().optional().describe("Vocal Lead for this row"),
    referenceLink: z.string().optional().describe("Reference URL for this row"),
    notes: z.string().optional().describe("Free-text notes for this row"),
    ...outlineFields,
} as const

/**
 * add_track_to_setlist's full inputSchema (a raw ZodRawShape, not wrapped —
 * `registerTool`'s `inputSchema` takes the shape directly). Exported so the
 * parity test can `z.object(addTrackToSetlistFields).safeParse(...)` against
 * the EXACT shape the tool registers.
 */
export const addTrackToSetlistFields = {
    setlistId: z.string().min(1).describe("Setlist id"),
    ...trackRowFields,
    position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("0-based insert index; omit to append"),
    force: z
        .boolean()
        .optional()
        .describe(
            "Bind even if the chart's bytes are dead. By default a songId whose chart is missing (404) or an unembeddable Google Drive shortcut is REFUSED with chart_unbindable — binding it would render a broken row in Perform mode and drop from gig packets. Set true to override (e.g. you're re-uploading the bytes next, or the row will be reconciled).",
        ),
} as const

/** bulk_add_tracks' per-row schema — exported so the parity test targets the exact object registered in `tracks: z.array(bulkAddTrackRowSchema)`. */
export const bulkAddTrackRowSchema = z.object(trackRowFields)

/** propose_setlist_changes' per-proposal schema — exported so the parity test targets the exact object registered in `proposals: z.array(proposeChangeProposalSchema)`. */
export const proposeChangeProposalSchema = z.object({
    action: z
        .enum(["add", "update", "remove"])
        .describe(
            "Proposal action: add a new row, update an existing row's fields/bond, or remove a row.",
        ),
    trackId: z
        .string()
        .min(1)
        .optional()
        .describe("Required for update/remove; from get_setlist tracks[].id."),
    position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("For action='add': 0-based insert index; omit to append."),
    ...trackRowFields,
})

/**
 * Track-patch field surface — common between update_track and
 * bulk_update_tracks. `position` is NOT in this base; it's added back
 * exclusively in updateTrackPatchSchema. bulkTrackPatchSchema instead
 * explicitly rejects `position` with a guidance message (H-2, 2026-05-15
 * stress test): the default Zod strip silently dropped the field and
 * the application layer then complained "patch must include at least
 * one field", which left the operator with no idea position was unsupported.
 */
const trackPatchFields = {
    ...outlineFields,
    key: z.string().optional(),
    leadMusician: z.string().optional(),
    title: z.string().optional(),
    notes: z.string().optional(),
    type: z
        .enum(["song", "header", "reading", "prayer", "transition", "note"])
        .optional(),
    songId: z
        .string()
        .nullable()
        .optional()
        .describe(
            "Library song id to (re)bond this row's chart. Pass `null` to UNBOND — clears the chart (songId + fileId + fileName) while keeping the row and its title, key, position, lead, and notes intact. Omit to leave the existing bond unchanged.",
        ),
    referenceLink: z.string().optional(),
} as const

export const bulkTrackPatchSchema = z
    .object(trackPatchFields)
    .passthrough()
    .refine((val) => !("position" in val), {
        message:
            "position is not supported in bulk_update_tracks. Use update_track for a single move (combine with a field patch in one call), or reorder_setlist for a multi-row reorder.",
        path: ["position"],
    })

export const updateTrackPatchSchema = z.object({
    ...trackPatchFields,
    position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            "0-based target index for in-place reorder. Clamps into [0, trackCount-1]. Combine with field patches to move + edit in one call. NOT supported in bulk_update_tracks.",
        ),
})

/**
 * W-04 Plan 03 bulk-patch entry. Wraps the (`trackId`, `patch`) pair with
 * an optional per-row `lastSeenVersion` so atomic mode can pre-flight
 * every gated row's version inside the same Firestore transaction as the
 * writes. Best-effort honors it too — stale rows get skipped and reported
 * with `error: "stale_version"` while non-stale rows commit.
 *
 * MCP-002 (cycle-2): `trackId.min(1)` rejects empty-string inputs at the
 * SDK validation surface so the agent gets a `validation_error` rich
 * envelope instead of a raw Firestore docPath throw.
 */
export const bulkPatchEntrySchema = z.object({
    trackId: z.string().min(1),
    patch: bulkTrackPatchSchema,
    lastSeenVersion: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            "Optional per-row optimistic-concurrency gate. Atomic mode rejects the entire batch (staleRows[]) on any mismatch; best-effort skips just the stale row.",
        ),
})

/**
 * Registers the MCP tools. Each tool resolves the authenticated uid from
 * `extra.authInfo` (set by withMcpAuth → verifyBearer in the route) and
 * delegates to the plain functions in ./setlists, ./library, ./setlist-write.
 *
 * Phase 4a — read tools (registerReadTools). Phase 4b — write tools
 * (registerWriteTools), owner-scoped to the caller's own setlists.
 */

/** Minimal structural type — decoupled from the SDK's internal extra shape. */
type AuthExtra = { authInfo?: { extra?: Record<string, unknown> } }

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    return uid
}

/**
 * Cycle-3 REG-002 — uniform rich-error normalizer applied to every MCP
 * tool response. Canonical wire shape:
 *
 *   { ok: false,
 *     error: { code, machine_code, message, debug? },
 *     ...extras (hint, dryRunPlan, fileId, issues[], ...) }
 *
 * Three input shapes get handled:
 *
 *  1. Rich envelope already (richError / staleVersionEnvelope /
 *     trackNotFoundEnvelope / forbiddenRoleEnvelope / zodFormatter) —
 *     passthrough.
 *
 *  2. Legacy flat envelope `{ok:false, error:<string-slug>, message?,
 *     ...extras, hint?}` — lift to rich shape via
 *     `liftLegacyErrorEnvelope`. Catches the pre-cycle-3 b1 shape any
 *     emit path that bypasses `richError()` still produces.
 *
 *  3. Even older `{error:"prose"}` with no ok field — lift the same way
 *     (prose becomes both `machine_code` and `message`; downstream
 *     callers see a structurally valid rich envelope but with a prose
 *     machine_code that fails the snake_case regex test on PR review).
 *
 * This is defense-in-depth — every emit-error path SHOULD go through
 * `richError()` directly. The normalizer guarantees the wire shape is
 * uniform even when a future contributor skips the helper.
 */
function normalizeErrorEnvelope(data: unknown): unknown {
    return liftLegacyErrorEnvelope(data)
}

function jsonResult(data: unknown) {
    const normalized = normalizeErrorEnvelope(data)
    // F-001: propagate isError on runtime-error path per [[feedback_mcp_validation_shape]].
    // Zod failures already set isError via the SDK remap; ok:false runtime
    // rejections must too. Decision extracted to ./result-iserror for testing.
    const isErrorResult = isErrorEnvelope(normalized)
    // v11.2-05-02 (BUG-8): normalize every Firestore timestamp to ISO at this
    // single boundary so no tool leaks a raw {_seconds,_nanoseconds}. isError is
    // computed from the un-mutated envelope above; the pass is idempotent over
    // already-ISO values, so error envelopes are unaffected in shape.
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(serializeTimestamps(normalized), null, 2),
            },
        ],
        ...(isErrorResult ? { isError: true as const } : {}),
    }
}

export function registerReadTools(server: McpServer): void {
    server.registerTool(
        "list_setlists",
        {
            description:
                "List the user's setlists, newest first. Use when the user asks about their upcoming or recent services/gigs. Dates are ISO strings; trackCount counts every row including section headers. Each row carries `publishedAt: string | null` (ISO timestamp of first publish, null for never-published). Optional from/to filter by service date. `sort:'recent_write'` (default — backward-compat, orders by the doc's write timestamp) vs. `sort:'recent_event'` (orders by service `eventDate` desc — David's 'next service to plan' lookup). For larger archives, paging via `offset` is supported up to the 200-record fetch cap — past that, slice with `from`/`to` instead.",
            inputSchema: {
                from: z
                    .string()
                    .optional()
                    .describe("ISO date — only setlists on or after this date"),
                to: z
                    .string()
                    .optional()
                    .describe("ISO date — only setlists on or before this date"),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .max(200)
                    .optional()
                    .describe("Max results (default 20, max 200)"),
                offset: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "Skip this many records before returning results (for paging). offset + limit must not exceed 200; for windows beyond that, use `from`/`to` filtering.",
                    ),
                sort: z
                    .enum(["recent_write", "recent_event"])
                    .optional()
                    .describe(
                        "Sort order. 'recent_write' (default) orders by the doc's write timestamp — back-compat. 'recent_event' orders by service `eventDate` descending — use to find the most recent service to plan.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listSetlists(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_setlist",
        {
            description:
                "Get one setlist by id, including its tracks in performance order. Use after list_setlists to see what songs are on a specific service.",
            inputSchema: {
                id: z.string().min(1).describe("Setlist id"),
            },
        },
        async (args, extra) => {
            const setlist = await getSetlist(uidFrom(extra), args, orgFrom(extra))
            if (!setlist)
                return jsonResult(
                    richError(
                        "setlist_not_found",
                        `Setlist '${args.id}' was not found.`,
                        { setlistId: args.id },
                        "Verify the id via list_setlists.",
                    ),
                )
            return jsonResult(setlist)
        },
    )

    server.registerTool(
        "list_books",
        {
            description:
                "List the liturgy books (siddurim and machzorim) this system can reference. Returns each book's `slug` (use it for a setlist's `book` and for liturgyRef.book), title, `tier` ('feed' = generated from the Shirei Typst pipeline with stable unit ids; 'pagemap' = hand-verified page list for a legacy book), and page count. Call this before setting a setlist's book or resolving page numbers with lookup_book_page.",
            inputSchema: {},
        },
        async () => jsonResult(listBooksTool()),
    )

    server.registerTool(
        "lookup_book_page",
        {
            description:
                "Resolve a prayer or liturgical moment to its PRINTED page number in one book. Use this when adding rows to a setlist that has a `book` set — never guess a page number, because it prints on the rabbi's service sheet. Returns `matches` (each with `folio` = printed page, `unitId` = feed-tier books only, pass it through to liturgyRef so the reference survives a re-pagination, and `confidence`), plus `totalMatches` (the count before truncation) and `truncated` (true when more matches exist than are returned — currently capped at 8). Confidence handling: 'high' — commit the page silently. 'medium' — commit, but mention it when you summarize the change. 'low' — several candidates (including same-name entries that print at different pages); ask which one is meant rather than guessing. A query that matches nothing returns `{ok:true, matches:[]}`, not an error. When `truncated` is true, tell the user how many total matched and that the list shown is partial rather than exhaustive.",
            inputSchema: {
                book: z
                    .string()
                    .min(1)
                    .describe("Book slug from list_books, e.g. 'crc-friday'."),
                query: z
                    .string()
                    .min(1)
                    .describe(
                        "Prayer/moment name, e.g. 'Mi Chamocha'. Case- and punctuation-insensitive; aliases are matched.",
                    ),
            },
        },
        async (args) => jsonResult(lookupBookPageTool(args)),
    )

    server.registerTool(
        "find_setlists_referencing_chart",
        {
            description:
                "Reverse lookup: which LIVE setlists bond a given chart? The read partner to delete_chart's chart_in_use refusal — pass `fileId` (or `songId`) and get back every live setlist that references it, with the matching track. Tracks whose parent setlist was deleted (dangling) are excluded and counted in `danglingTracksIgnored`. Tenant-scoped to your org. Use BEFORE delete_chart to see what would block the delete, or to answer 'where is this chart used?'. Returns `{ok, fileId, songId, setlists: [{setlistId, name, date, eventDate, trackId, trackTitle, order}], count, danglingTracksIgnored, truncated?}`.",
            inputSchema: {
                fileId: z
                    .string()
                    .optional()
                    .describe(
                        "Chart fileId (e.g. 'upload-<uuid>' or a Drive id). Discover via list_library/search_library.",
                    ),
                songId: z
                    .string()
                    .optional()
                    .describe(
                        "Bonded songId (alternative to fileId). Pass one of fileId/songId.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(
                await findSetlistsReferencingChart(
                    uidFrom(extra),
                    args,
                    orgFrom(extra),
                ),
            ),
    )

    server.registerTool(
        "search_setlists",
        {
            description:
                "Find your org's setlists by track content or service type. `trackTitle` (case-insensitive substring of a track title) and `leadMusician` (case-insensitive substring of a track's vocal lead) match per-track and return the matching tracks; `templateType` (e.g. 'friday_night', 'shabbat_morning') filters by service type. Combine filters with AND. App-side search over your org's setlists. Use to answer 'which services included <song>?' or 'what has <musician> led?'. Returns `{ok, setlists: [{id, name, date, eventDate, templateType, matchedTracks: [{trackId, title, leadMusician}]}], count}`.",
            inputSchema: {
                trackTitle: z
                    .string()
                    .optional()
                    .describe(
                        "Case-insensitive substring of a track title to match.",
                    ),
                leadMusician: z
                    .string()
                    .optional()
                    .describe(
                        "Case-insensitive substring of a track's leadMusician (vocal lead) to match.",
                    ),
                templateType: z
                    .string()
                    .optional()
                    .describe(
                        "Service template type to filter by (e.g. 'friday_night', 'shabbat_morning').",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(
                await searchSetlists(uidFrom(extra), args, orgFrom(extra)),
            ),
    )

    server.registerTool(
        "find_setlists_from_template",
        {
            description:
                "Reverse lookup: which LIVE setlists were cloned from a given template? The read partner to clone_setlist_from_template — pass `templateId` (from list_templates) and get back every setlist in your org whose `sourceTemplateId` matches, with its name and dates. Tenant-scoped to your org. Use to answer 'which services came from the Randy Shabbat template?' or to see a template's usage before editing/deleting it. Returns `{ok, templateId, setlists: [{setlistId, name, date, eventDate, sourceTemplateId}], count, truncated?}`.",
            inputSchema: {
                templateId: z
                    .string()
                    .optional()
                    .describe(
                        "Template id from list_templates. Returns the setlists cloned from it.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(
                await findSetlistsFromTemplate(
                    uidFrom(extra),
                    args,
                    orgFrom(extra),
                ),
            ),
    )

    server.registerTool(
        "search_library",
        {
            description:
                "Search the song library by title text, with optional musical key and BPM-range filters. Title matching normalizes underscores, hyphens, spaces, and diacritics, so query \"Shalom Rav\" matches catalog entries like \"Shalom_rav\" and \"shalom-rav (camp)\". BPMs are integers. Returns metadata only — never chart files. Pass an empty query (or omit it) to browse the first N library entries — useful for catalog discovery. Rows with `status: 'orphaned'` are hidden by default; pass includeOrphaned: true to see them (e.g. while triaging library hygiene). Non-chart artifacts (audio, spreadsheets, folders, dotfiles like .DS_Store) are hidden by default — same posture as list_library — pass includeNonCharts: true to see them (e.g. library-hygiene audits). Every result row carries `status` ('active' by default if the catalog row omits one). **Known limitation (C7I1-012, deferred):** Hebrew phonetic transliteration is NOT fuzzy-matched. Variant spellings of the same song (e.g. `Lechu Nranina` / `Lchu Neranena` / `Lekhu Neranena` for לכו נרננה) are treated as distinct substrings; only one will match a given catalog entry. Workaround: if a search returns 0 results, retry with 2–3 common transliteration variants (sub-stems like `Lechu` / `Lchu` / `Lekhu` typically suffice). A proper phonetic search layer (Levenshtein with Hebrew-aware weights OR Soundex-for-transliteration) is out of cycle-7 scope.",
            inputSchema: {
                query: z
                    .string()
                    .describe("Title search text — normalized substring match (underscore/hyphen/space/diacritic insensitive)"),
                key: z
                    .string()
                    .optional()
                    .describe("Exact musical key, e.g. 'G' or 'Am'"),
                bpmMin: z.number().int().optional().describe("Minimum BPM"),
                bpmMax: z.number().int().optional().describe("Maximum BPM"),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .max(50)
                    .optional()
                    .describe("Max results (default 20)"),
                includeOrphaned: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include rows whose underlying chart file was previously confirmed missing (status: 'orphaned'). Default false.",
                    ),
                includeNonCharts: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, include non-chart artifacts (audio files, spreadsheets, Drive folders, dotfiles like .DS_Store) that the in-app library and list_library hide. Default false.",
                    ),
                includeUnbindable: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, include rows whose chart bytes are dead — missing (404 in both Storage and Drive) or an unembeddable Google Drive shortcut — that are hidden by default. Surfaced rows carry chartHealth.bindable:false so you can triage/heal/re-bond them. Default false (binding such a row 404s in Perform mode, so search hides them).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await searchLibrary(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_song",
        {
            description:
                "Get one song's metadata by id — title, key, BPM, vocal lead. Returns metadata only, never chart PDF bytes.",
            inputSchema: {
                id: z.string().min(1).describe("Song id"),
            },
        },
        async (args, extra) => {
            const song = await getSong(uidFrom(extra), args, orgFrom(extra))
            if (!song)
                return jsonResult(
                    richError(
                        "song_not_found",
                        `Library song '${args.id}' was not found.`,
                        { songId: args.id },
                        "Verify the songId via search_library / list_library.",
                    ),
                )
            return jsonResult(song)
        },
    )

    server.registerTool(
        "list_library",
        {
            description:
                "Browse the chart-file index alphabetically — every chart in the library, with its collection ('core' | 'supplemental' | 'nava' | 'uploads'), mimeType, file size, and upload metadata. Use this when the user wants to SEE the catalog (\"what's in core?\", \"show me every chart I've uploaded\"); use search_library for targeted lookup by title/key/BPM. Optional collection filter narrows to one section. Paged via offset+limit (default limit 50; values above 200 are silently clamped to 200). Returns rows + a total count so the caller can detect whether more pages exist. Default browse hides folders, audio files, dotfiles like .DS_Store, AND rows the dedupe pass has marked status:'duplicate' / Drive-side status:'orphaned' — same hidden-set as search_library and the in-app /library catalog, so counts surfaced here match what Daniel sees in the browser. Pass includeNonCharts: true for raw artifacts (folders/audio/junk); pass includeNonChartHealthy: true to also include duplicate/orphaned rows (audit/reconciliation only). Metadata only — to fetch chart bytes call download_chart, or to print a setlist's packet call generate_gig_packet. Cycle-3 DATA-002: response carries a uniform `coverage:{total, eligible, scanned, filteredOut:{byStatus, byCollection, byOther}}` field that matches the same shape returned by dedupe_library / backfill_library_index / reconcile_library — letting operators correlate scan totals across the four hygiene tools without spelunking into source.",
            inputSchema: {
                collection: z
                    .enum(["core", "supplemental", "uploads", "nava"])
                    .optional()
                    .describe(
                        "Library section to browse. 'core' matches the in-app CRC Charts tab (every row that is not 'supplemental', 'nava' or 'uploads', including legacy rows with no collection field). 'nava' is the Nava Tehila corpus. Omit to list every chart across all collections.",
                    ),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        "Max rows (default 50). Values above 200 are silently clamped to 200.",
                    ),
                offset: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "Skip this many rows before returning results (for paging). Pass `offset + limit < total` to fetch the next page.",
                    ),
                includeNonCharts: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, include non-chart artifacts (folders, audio files, .DS_Store) that the in-app library hides. Default false.",
                    ),
                includeNonChartHealthy: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, include rows the dedupe pass has marked status:'duplicate' / Drive-side status:'orphaned' that the in-app /library catalog hides. Default false — surfaced counts match what Daniel sees in the browser. Use only for audit/reconciliation flows.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listLibrary(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_congregation_context",
        {
            description:
                "Get the congregation's standing context in one call so you don't have to be re-told it each authoring session: WHO the congregation is (name, location, the rabbi profiles, and the standing/core band roster) plus WHO has led recently. Use at the start of a weekly-setlist authoring session to ground yourself on the rabbis, the band, and the recent service cadence. Returns `congregation` (from the config/congregation doc; falls back to defaults with usingDefaults:true when absent) and `leadHistory` — the most-recent setlists each with the rabbi who led ('Led by'), the band that played, the service type, and dates. `historyLimit` (default 10, max 50) and `orderBy` ('eventDate' default = most-recent service day, or 'date' = doc write time) tune the history window. For the per-song Vocal Lead on a specific service, call get_setlist on that setlist id — this tool stays a single cheap read.",
            inputSchema: {
                historyLimit: z
                    .number()
                    .int()
                    .positive()
                    .max(50)
                    .optional()
                    .describe(
                        "How many recent setlists to summarize in leadHistory (default 10, max 50).",
                    ),
                orderBy: z
                    .enum(["eventDate", "date"])
                    .optional()
                    .describe(
                        "Order leadHistory by service day ('eventDate', default) or doc write timestamp ('date'). Only setlists carrying the chosen field are returned.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getCongregationContext(uidFrom(extra), args, orgFrom(extra))),
    )

    // F4 (2026-05-26): Tier-1 full-text search across PERSISTED
    // chart-text surfaces. Two scopes — metadata (title + nameLower +
    // aiSuggestion.{suggested_title, suggested_lead, suggested_tags,
    // concerns}), chords (collectionGroup('chordData') on chords[].text),
    // and all (union). Replaces the silent-broken
    // `/api/library/search-content` endpoint (deleted in F4-A).
    server.registerTool(
        "search_chart_text",
        {
            description:
                "Search inside the PERSISTED text content of charts in the library — useful when title alone doesn't surface the chart, e.g. you remember David annotated Rabbi Daniel as the lead, or that the AI flagged a concern, or the chart uses a `Bm7b5`. Two scopes: `metadata` (default — searches `library_index/{id}.{title, nameLower}` + `aiSuggestion.{suggested_title, suggested_lead, suggested_tags, concerns}`); `chords` (searches the per-page chord-symbol cache at `chordData/page_<n>.chords[].text`/`.originalText` — finds charts by chord progression, e.g. query 'Bm7b5'); `all` (union of both). Returns `{ok, scope, query, results:[{chartId, title, field, page?, snippet?, matchPosition}], totalScanned, capped}`. Substring scan is case-insensitive; results limited to top `limit` (default 20, max 100); the underlying Firestore scan is capped at 1000 docs per scope. `capped: true` means more matches likely exist beyond what's returned — narrow the query or widen `limit`. Role gate: admin or band_leader only (full-text search is an authoring surface). Use `search_library` for the role-ungated title+key+bpm search the wider band has access to.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe(
                        "Substring to search for, case-insensitive. Required and non-empty.",
                    ),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .max(100)
                    .optional()
                    .describe(
                        "Maximum results to return (default 20, max 100). When more matches exist, the response carries `capped: true`.",
                    ),
                includeSnippets: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), each result carries a `snippet` field with ±40 characters of context around the match. Pass false to omit snippets (smaller payload).",
                    ),
                scope: z
                    .enum(["metadata", "chords", "all"])
                    .optional()
                    .describe(
                        "Search scope. 'metadata' (default) — library_index titles + aiSuggestion fields. 'chords' — per-page chord-symbol cache (find by chord progression). 'all' — union.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await searchChartText(uidFrom(extra), args, orgFrom(extra))),
    )
}

export function registerWriteTools(server: McpServer): void {
    server.registerTool(
        "create_setlist",
        {
            description:
                "Create a new, empty setlist owned by the user. Use when the user wants to start a new service/gig. Returns the new setlist id, trackCount, and the owner's ownerId + ownerName — follow up with add_track_to_setlist to populate it. eventDate is an ISO date string. Requires an admin or band leader account. Pass `isTest:true` to flag the setlist as test traffic (drops out of /perform public listing) regardless of name/owner heuristics — useful for autonomous cycles whose setlists carry real-looking names like 'test-rehearsal'.",
            inputSchema: {
                name: z.string().min(1).describe("Setlist name, e.g. 'Shabbat Morning — June 7'"),
                eventDate: eventDateSchema.describe(
                    "ISO date of the service, e.g. '2026-06-07'",
                ),
                serviceType: z
                    .string()
                    .optional()
                    .describe("Service/template type, e.g. 'shabbat-morning'"),
                rabbi: z.string().optional().describe("Rabbi leading the service"),
                isTest: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true, stamp the setlist doc with `isTest:true` so /perform filters it out. Default false; no heuristic on `test-` prefixes is applied at the MCP layer (the underlying writer still falls back to the standard name/owner heuristic when this is omitted).",
                    ),
                book: z
                    .string()
                    .optional()
                    .describe(
                        "Liturgy book slug used at this service (one book per service), e.g. 'crc-friday'. Call list_books for valid slugs. Page references on this setlist's rows resolve against it.",
                    ),
            },
        },
        async (args, extra) => jsonResult(await createSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "clone_setlist",
        {
            description:
                "GAP-002 — Clone an existing setlist into a brand-new one owned by the caller. Daniel's weekly authoring flow is 90% 'clone last week + tweak a few songs', so this short-circuits the get_setlist → create_setlist → bulk_add_tracks round trip. Reads the source's metadata (name → 'Copy of <source>' unless newName given; templateType, rabbi, serviceNotes travel with the clone) and every track (type, title, key, bpm, leadMusician, referenceLink, notes, songId, fileId, fileName — chart bonds copied verbatim, contiguous `order` from 0). Returns `{setlistId, sourceSetlistId, trackCount, ownerId, ownerName, version: 1}` plus two advisory reports since clones inherit the source's bonds + metadata verbatim: `bondReviewCount` (rows whose song title diverges from the bonded chart filename — if >0, run review_chart_bonds to walk them) with `bondReviewRows` listing each flagged row's `{position, trackId, fileId, chartFileName, overlapScore}` so you can target a swap_chart / review_chart_bonds follow-up directly without re-fetching the clone, and `staleMetadataCandidates` (track titles / clone name / serviceNotes carrying occasion-specific parsha/holiday/date tokens that may belong to the SOURCE's date — double-check them for the new service). Both are hints only; the clone still wrote everything verbatim. eventDate does NOT auto-copy — pass `newEventDate` for the new service day (omit to leave undated; pass null to be explicit). `copyServiceNotes` defaults to true. Admins and band leaders may clone (same gate as create_setlist) — band_leader may clone setlists owned by others. Trusted-leader rate-limit bypass applies.",
            inputSchema: {
                sourceSetlistId: z
                    .string()
                    .min(1)
                    .describe("Source setlist id to clone."),
                newName: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Name for the new setlist. Default: 'Copy of <source name>'.",
                    ),
                newEventDate: eventDateSchema
                    .nullable()
                    .describe(
                        "ISO date for the new event. Omit (default) to leave the clone without an eventDate — most weekly clones need a fresh date anyway. Pass null to be explicit about no-date.",
                    ),
                copyServiceNotes: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true (default), copy the source's serviceNotes onto the clone. Pass false to start with a clean notes field.",
                    ),
            },
        },
        async (args, extra) => jsonResult(await cloneSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    // ─── Setlist templates (cycle-6 Lane 2) ──────────────────────────────
    // Templates encode the SERVICE KIND ("Shabbat morning", "B'nai Mitzvah",
    // "Shir Shabbat") distinct from any one calendar date. Daniel + David's
    // weekly authoring pattern is "start from the template, fill in the date
    // and a few song tweaks". `clone_setlist` is for short-cycle copies of
    // last week's actual service; `clone_setlist_from_template` is for the
    // weekly-flow service-kind starting point. Closes the
    // [[feedback_mcp_template_management]] memory gap. Data model:
    // setlistTemplates/{templateId} with tracks embedded — templates are
    // small (10-30 rows), never broadcast, never queried by setlistId.

    server.registerTool(
        "list_templates",
        {
            description:
                "List setlist templates. Returns summaries (templateId, name, templateType, trackCount, ownerId, ownerName, updatedAt, version), most-recently-updated first. Optional filters: `templateType` (e.g. 'shabbat-morning'), `ownerUid`. Admin + band_leader only — templates are an authoring surface. Use this before clone_setlist_from_template to pick a starting point.",
            inputSchema: {
                templateType: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Filter by templateType (e.g. 'shabbat-morning', 'bnai-mitzvah', 'shir-shabbat'). Free-text — whatever was set at create_template time.",
                    ),
                ownerUid: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("Filter to templates created by a specific uid."),
            },
        },
        async (args, extra) =>
            jsonResult(await listTemplates(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_template",
        {
            description:
                "Read a setlist template by id. Returns the full doc: name, templateType, serviceNotes, tracks[] (each with type, title, key, bpm, leadMusician, referenceLink, notes, songId, fileId, fileName), owner + version + timestamps. Admin + band_leader only. Use before update_template to fetch current state.",
            inputSchema: {
                templateId: z
                    .string()
                    .min(1)
                    .describe("Template id from list_templates."),
            },
        },
        async (args, extra) =>
            jsonResult(await getTemplate(uidFrom(extra), args.templateId, orgFrom(extra))),
    )

    server.registerTool(
        "create_template",
        {
            description:
                "Create a new setlist template. Templates are re-usable starting points for `clone_setlist_from_template` — they encode the service kind, not a calendar date. `name` is required; `templateType` is a free-text classifier (e.g. 'shabbat-morning'); `serviceNotes` is the pastoral note that travels with every clone; `tracks[]` is the starting track list (each with optional type, title, key, bpm, leadMusician, referenceLink, notes, songId, fileId, fileName). Tracks default to empty — fill them in via update_template or by editing a clone. Admin + band_leader only. Returns `{templateId, name, ownerId, ownerName, trackCount, version: 1}`. Trusted-leader rate-limit bypass.",
            inputSchema: {
                name: z
                    .string()
                    .min(1)
                    .describe("Template name (required)."),
                templateType: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Free-text service-kind classifier (e.g. 'shabbat-morning', 'bnai-mitzvah', 'shir-shabbat'). Used as the list_templates filter key.",
                    ),
                serviceNotes: z
                    .string()
                    .optional()
                    .describe(
                        "Pastoral / liturgical notes that travel with the service kind. Cloned setlists copy this by default (override via clone_setlist_from_template `copyServiceNotes: false`).",
                    ),
                tracks: z
                    .array(
                        z.object({
                            type: z.string().optional(),
                            title: z.string().optional(),
                            key: z.string().nullable().optional(),
                            bpm: z.number().nullable().optional(),
                            leadMusician: z.string().nullable().optional(),
                            referenceLink: z.string().nullable().optional(),
                            notes: z.string().nullable().optional(),
                            songId: z.string().nullable().optional(),
                            fileId: z.string().nullable().optional(),
                            fileName: z.string().nullable().optional(),
                        }),
                    )
                    .optional()
                    .describe(
                        "Initial track list. Each row defaults to type='song' + title='' if omitted. Chart bonds (fileId/fileName/songId) copy verbatim into cloned setlists.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await createTemplate(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "update_template",
        {
            description:
                "Patch a setlist template. `patch` may include any of: `name` (non-empty string), `templateType` (string or null to clear), `serviceNotes` (string or null to clear), `tracks` (full replacement of the array). Idempotent — if the patch yields no actual change, returns `{templateId, changed: false, version}` without bumping. Otherwise bumps `version` + `updatedAt`. Admin + band_leader only.",
            inputSchema: {
                templateId: z
                    .string()
                    .min(1)
                    .describe("Template id to patch."),
                patch: z
                    .object({
                        name: z.string().min(1).optional(),
                        templateType: z.string().nullable().optional(),
                        serviceNotes: z.string().nullable().optional(),
                        tracks: z
                            .array(
                                z.object({
                                    type: z.string().optional(),
                                    title: z.string().optional(),
                                    key: z.string().nullable().optional(),
                                    bpm: z.number().nullable().optional(),
                                    leadMusician: z.string().nullable().optional(),
                                    referenceLink: z.string().nullable().optional(),
                                    notes: z.string().nullable().optional(),
                                    songId: z.string().nullable().optional(),
                                    fileId: z.string().nullable().optional(),
                                    fileName: z.string().nullable().optional(),
                                }),
                            )
                            .optional(),
                    })
                    .describe(
                        "Fields to patch. Pass null on templateType/serviceNotes to clear them; pass a new tracks[] to fully replace the existing list.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await updateTemplate(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "delete_template",
        {
            description:
                "Delete a setlist template. Idempotent — `{templateId, deleted: false}` if the template was already gone, `{templateId, deleted: true}` on a real deletion. Does NOT touch any setlists previously cloned from this template (they carry a `sourceTemplateId` snapshot; downstream setlists are independent). Admin + band_leader only.",
            inputSchema: {
                templateId: z
                    .string()
                    .min(1)
                    .describe("Template id to delete."),
            },
        },
        async (args, extra) =>
            jsonResult(await deleteTemplate(uidFrom(extra), args.templateId, orgFrom(extra))),
    )

    server.registerTool(
        "clone_setlist_from_template",
        {
            description:
                "Create a new setlist from a template. The new setlist gets `sourceTemplateId` (snapshot of which template seeded it), the template's `templateType` + `serviceNotes` (unless `copyServiceNotes: false`), and one track row per `template.tracks[i]` (each with a fresh trackId, contiguous `order` from 0, version: 1, chart bonds copied verbatim). `newName` is required; `newEventDate` (YYYY-MM-DD or full ISO) is optional — pass null to leave the new setlist undated. The new setlist's `ownerId` is the caller. Returns `{setlistId, sourceTemplateId, trackCount, ownerId, ownerName, version:1}` plus `bondReviewCount` + `bondReviewRows` (parity with clone_setlist — template bonds copy verbatim, so this flags any cloned row whose title diverges from its bonded chart filename; each `bondReviewRows` entry carries `{position, trackId, fileId, chartFileName, overlapScore}` to target a swap_chart / review_chart_bonds follow-up). Admin + band_leader only. Trusted-leader rate-limit bypass.",
            inputSchema: {
                templateId: z
                    .string()
                    .min(1)
                    .describe("Source template id."),
                newName: z
                    .string()
                    .min(1)
                    .describe("Name for the new setlist."),
                newEventDate: z
                    .string()
                    .nullable()
                    .optional()
                    .describe(
                        "ISO date for the new event (YYYY-MM-DD or full ISO). Pass null to leave the new setlist without an eventDate.",
                    ),
                copyServiceNotes: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true (default), copy the template's serviceNotes onto the new setlist.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await cloneSetlistFromTemplate(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "create_template_from_setlist",
        {
            description:
                "Snapshot an existing setlist's tracks into a new setlist template (inverse of clone_setlist_from_template). Use this to turn a real service that worked well into a reusable starting point. `setlistId` is the source setlist; `name` is the new template name (required). `templateType` is optional — pass a string to override, or omit to carry over the source setlist's templateType. `copyServiceNotes: true` (default) carries the source setlist's serviceNotes onto the template. The caller (NOT the source setlist owner) becomes the new template's owner. Admin + band_leader only. Trusted-leader rate-limit bypass. Returns `{templateId, sourceSetlistId, name, templateType, ownerId, ownerName, trackCount, version: 1}`.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe("Source setlist id."),
                name: z
                    .string()
                    .min(1)
                    .describe("Name for the new template."),
                templateType: z
                    .string()
                    .nullable()
                    .optional()
                    .describe(
                        "Optional free-text classifier (e.g. 'shabbat-morning'). Omit to carry over the source setlist's templateType.",
                    ),
                copyServiceNotes: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true (default), copy the source setlist's serviceNotes onto the template.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await createTemplateFromSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "update_setlist",
        {
            description:
                "Update a setlist's metadata (name, date, service type, rabbi, notes). Metadata only — does NOT touch tracks; use the track tools for that. Admins and band leaders may update it — band_leader can update setlists owned by others (collaborate), but only the owner or admin may delete (see delete_setlist). Returns the post-update setlist record (name, eventDate, rabbi, serviceType, serviceNotes) so callers can confirm the patch landed without a follow-up get_setlist. Pass `lastSeenVersion` (the `version` from your last get_setlist / list_setlists) to reject with `{error: 'stale_version', currentVersion, ...}` when another writer has changed the setlist since you read it (W-04 optimistic concurrency).",
            inputSchema: {
                id: z.string().min(1).describe("Setlist id"),
                name: z.string().min(1).optional().describe("New setlist name"),
                eventDate: eventDateSchema.describe("New ISO event date"),
                serviceType: z.string().optional().describe("New service/template type"),
                rabbi: z.string().optional().describe("New rabbi leading the service"),
                serviceNotes: z.string().optional().describe("Free-text service notes"),
                book: z
                    .string()
                    .optional()
                    .describe(
                        "Liturgy book slug used at this service (one book per service), e.g. 'crc-friday'. Call list_books for valid slugs. Page references on this setlist's rows resolve against it.",
                    ),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional optimistic-concurrency gate: pass the setlist's `version` from your last get_setlist / list_setlists. The write rejects with `{error: 'stale_version', currentVersion, lastSeenVersion, hint, ...}` if it doesn't match — call get_setlist and retry.",
                ),
            },
        },
        async (args, extra) => jsonResult(await updateSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "add_track_to_setlist",
        {
            description:
                "Add one row to a setlist. Row types: 'song' (pass songId to pull title/key/vocal-lead from the library AND bond the song's chart so it renders on the row, or pass an explicit title for a free-text row), 'header' (section break with a title), 'reading' (Torah / scripture / D'var / responsive reading — title required), 'prayer' (silent or responsive prayer — title required), 'transition' (instrumental/transition moment), or 'note' (free-text annotation). position is a 0-based insert index; omit it to append at the end. Admins and band leaders may add tracks — band_leader may add to setlists owned by others (collaborate), but only the owner or admin may delete the setlist itself (see delete_setlist).",
            inputSchema: addTrackToSetlistFields,
        },
        async (args, extra) => jsonResult(await addTrackToSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "bulk_add_tracks",
        {
            description:
                "Add many tracks to one setlist in a single call — closes the weekly-flow N+1 ('9 sequential add_track_to_setlist calls'). The `tracks[]` array's order IS the performance order of the new rows. All rows are spliced in starting at `position` (or appended). For per-row positioning of arbitrary rearrangements, use reorder_setlist instead. mode='atomic' (default) wraps everything in one batch — all-or-nothing; mode='best-effort' inserts each row independently and accumulates per-row results. dryRun=true returns the plan without writing. RESPONSE: `committed: boolean` is the load-bearing signal — true iff writes actually landed. Per-row results include `index` (matches the input array), `ok`, `trackId`, `order`, and `error` (when ok=false). Max 50 rows per call. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                tracks: z
                    .array(bulkAddTrackRowSchema)
                    .min(1)
                    .max(50)
                    .describe("Rows to insert, in performance order; max 50"),
                position: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "0-based insert anchor; omit to append at the end of the setlist",
                    ),
                mode: z
                    .enum(["atomic", "best-effort"])
                    .optional()
                    .describe(
                        "atomic (default): all-or-nothing batch. best-effort: per-row results, partial success allowed.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, return the plan without writing. Useful for confirming a large insert before committing.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await bulkAddSetlistTracks(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "reorder_setlist",
        {
            description:
                "Reorder a setlist's tracks. orderedTrackIds must list every current track id of the setlist exactly once, in the new performance order. Get the current ids from get_setlist first. Admins and band leaders may reorder. Reorder gates on the SETLIST-level `lastSeenVersion` (a reorder touches every row's order — racing at the setlist scope is the natural granularity).",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                orderedTrackIds: z
                    .array(z.string().min(1))
                    .describe("All track ids of the setlist, in the new order"),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional setlist-level optimistic-concurrency gate. Pass the `version` from get_setlist; rejects with `{error: 'stale_version', ...}` when another writer has changed the setlist since you read it.",
                ),
            },
        },
        async (args, extra) => jsonResult(await reorderSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "remove_track",
        {
            description:
                "Remove one track from a setlist by id. The remaining tracks are re-packed to stay contiguous. Admins and band leaders may remove tracks. Pass `lastSeenVersion` (the track's `version` from your last get_setlist) to reject with `{error: 'stale_version', ...}` when another writer has changed that specific track since you read it. Track-not-found returns `{error: 'track_not_found', setlistVersion, ...}` so the agent can refresh by trackId resolution.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                trackId: z.string().min(1).describe("Id of the track to remove"),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional track-level optimistic-concurrency gate. Pass the track's `version` from get_setlist; rejects with `{error: 'stale_version', currentVersion, ...}` on mismatch.",
                ),
            },
        },
        async (args, extra) => jsonResult(await removeSetlistTrack(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "delete_setlist",
        {
            description:
                "Delete a setlist and all of its tracks. Only the setlist's owner or an admin may delete it — band_leader can update/add tracks on others' setlists (see update_setlist, add_track_to_setlist) but cannot delete them. This asymmetry is intentional: delete is destructive and irreversible, so it's narrower than the collaboration-friendly editing surface. Use with care — cascades to every track on the setlist. Pass `lastSeenVersion` (from get_setlist) to reject with `{error: 'stale_version', ...}` when another writer has changed the setlist since you read it.",
            inputSchema: {
                id: z.string().min(1).describe("Setlist id"),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional setlist-level optimistic-concurrency gate. Pass the `version` from get_setlist; rejects with `{error: 'stale_version', ...}` on mismatch.",
                ),
            },
        },
        async (args, extra) => jsonResult(await deleteSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "recompute_setlist_track_count",
        {
            description:
                "Cycle-7-fixes Lane 3 — admin-only repair for a stale denormalized `setlists/{id}.trackCount` counter. Recomputes from the actual `tracks/{*}` top-level subcollection and writes the corrected count when drifted. Idempotent (no-op when already in sync). The /api/cron/verify-chart-bond-health daily run auto-heals upcoming-published setlists; this tool is the manual backstop for past services + drafts. Returns `{setlistId, declared, actual, drifted, written}`.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id whose trackCount counter to recompute."),
            },
        },
        async (args, extra) =>
            jsonResult(await recomputeSetlistTrackCount(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "update_track",
        {
            description:
                "Update one track's metadata on a setlist (key, vocal lead, title, notes, type, bonded songId, referenceLink) and optionally move it to a new position. Preserves trackId — unlike remove+add — so external references stay valid. Only fields you pass in `patch` get updated; omitted fields are untouched. Pass `position` to move the row in place (closes the 'must call reorder_setlist with the full ordered id list to move one row' gap). Re-bonding: passing a new `songId` updates `fileId` automatically (the library is keyed by Drive file id). Unbonding: pass `songId: null` to clear the chart (songId + fileId + fileName) while keeping the row, its title/key/position/notes, and dropping the chart from the setlist's fileIds aggregate — no need to delete + re-add a free-text row. Returns the post-update row. Admins and band leaders only. Every successful write bumps the setlist's `version` and echoes the row back; chain the returned `version` into the next call's `lastSeenVersion` rather than re-reading a stale get_setlist value. Pass `lastSeenVersion` (the track's `version` from your last get_setlist) for W-04 optimistic concurrency: rejects with `{error: 'stale_version', currentVersion, ...}` if another writer changed THIS track first, or `{error: 'track_not_found', setlistVersion, ...}` if the row was deleted out from under you.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                trackId: z
                    .string()
                    .min(1)
                    .describe("Track id (from get_setlist tracks[].id)"),
                patch: updateTrackPatchSchema.describe(
                    "Fields to update + optional `position` for in-place reorder. At least one field (or `position`) must be set. Pass `songId` to re-bond the row to a different library song (fileId follows automatically), or `songId: null` to unbond — clear the chart while keeping the row.",
                ),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional track-level optimistic-concurrency gate. Pass the track's `version` from get_setlist; rejects with `{error: 'stale_version', currentVersion, lastSeenVersion, hint, ...}` on mismatch. Omit to keep last-writer-wins.",
                ),
            },
        },
        async (args, extra) =>
            jsonResult(await updateSetlistTrack(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "swap_chart",
        {
            description:
                "Atomically swap the chart bonded to one row — refreshes fileId + fileName + title + key from the new song's catalog record in a single call. Preserves leadMusician, notes, referenceLink, and position. Pass `syncMetadata: false` to leave title (NOTE-1 fallback) and key alone; default true means a clean swap. Use this instead of bare update_track({songId}) whenever the operator wants the row's display metadata to match the new chart.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                trackId: z
                    .string()
                    .min(1)
                    .describe("Track id (from get_setlist tracks[].id)"),
                newSongId: z
                    .string()
                    .min(1)
                    .describe("New library songId — the row will bond to this chart"),
                syncMetadata: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true (default), title + key are force-synced from the new song. If false, title falls back to NOTE-1 (only auto-refreshes when the row was using the OLD song's title) and key stays untouched.",
                    ),
            },
        },
        async (args, extra) => jsonResult(await swapChart(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "bulk_update_tracks",
        {
            description:
                "Update many tracks on one setlist in a single call. mode='atomic' (default) wraps every patch in a Firestore transaction — all-or-nothing; mode='best-effort' applies each patch independently and returns per-row results (prefer atomic for >5 rows; best-effort is N round-trips). dryRun=true returns the plan without writing — useful for confirming a large change before committing. Max 50 patches per call (chunk longer lists). Each patch may pass `songId: null` to UNBOND that row (clears its chart but keeps the row); a string `songId` re-bonds it. RESPONSE: the `committed` boolean is the load-bearing signal — true iff writes actually landed in Firestore. dryRun=true and atomic-mode-with-any-rejected-patch both return `committed: false` (per-row results explain which patch failed and which were rolled back). `updatedAt` in each row's `track` echo is returned as an ISO string. Every successful commit bumps the setlist's `version`; chain the returned version into your next `lastSeenVersion` rather than re-reading a stale get_setlist. W-04 Plan 03: each patch entry accepts an optional `lastSeenVersion` (the track's version from your last get_setlist). Atomic mode rejects the whole batch with `staleRows[]` on any mismatch — the previously-valid rows are NOT applied; each row's `error` is `'stale_version'` (with `currentVersion` + `lastSeenVersion`) for the stale ones and a rollback message for the rest. Best-effort skips just the stale row (`error: 'stale_version'`) and commits the others. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                patches: z
                    .array(bulkPatchEntrySchema)
                    .min(1)
                    .max(50)
                    .describe("Per-track patches; max 50. Each entry may carry an optional `lastSeenVersion` (W-04 Plan 03 per-row stale-version gate). `position` is not allowed inside `patch` here — use update_track for a single move or reorder_setlist for a multi-row reorder."),
                mode: z
                    .enum(["atomic", "best-effort"])
                    .optional()
                    .describe(
                        "atomic (default): all-or-nothing transaction. best-effort: per-row results, partial success allowed.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, return the plan without writing. Useful for confirming a >5-row change before committing.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await bulkUpdateSetlistTracks(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "publish_setlist",
        {
            description:
                "Publish a setlist to the band — snapshots song-row state, marks the setlist as published, and fans out notifications across in-app, FCM push, email, and SMS (SMS only on first publish, opt-in users only). Equivalent to clicking the in-app Publish button. Use when the user says \"send the setlist to the band\", \"publish tonight's service\", \"notify everyone\". By default, recipients are every active admin / band_leader / musician account (excluding the publisher); pass `audience: 'all'` to include `member` accounts, or pass an explicit `recipients` array to override entirely. A `recipients` entry is one of two kinds: an account holder (`uid` → in-app + push + SMS) or an ad-hoc person with no app account (`name` + `email` → email only); reuse a leader's remembered ad-hoc people via their saved contacts (`list_contacts` / `create_contact`, surfaced as `preview_publish.savedContacts`). `note` adds a free-text message above the song list in the email; `subject` overrides the email subject. `dryRun: true` returns the would-publish recipient set + snapshot without writing or sending — preview the blast before pulling the trigger. Re-publishing a setlist that was already published refreshes the snapshot + re-fans-out in-app/push/email but skips SMS (cost control). Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                recipients: z
                    .array(
                        z.object({
                            uid: z.string().optional(),
                            name: z.string().optional(),
                            email: z.string().optional(),
                            instrument: z.string().optional(),
                        }),
                    )
                    .optional()
                    .describe(
                        "Explicit recipient list. If omitted, auto-derives from active band roles (see `audience`). Each entry is one of two kinds: (1) an account holder — pass `uid` (receives in-app + push + SMS) and optionally `email`; or (2) an ad-hoc recipient with NO app account — pass `name` + `email` (email only). Reuse a leader's saved contacts (from `list_contacts` / `create_contact`) by passing each as a `{name, email}` entry here; `preview_publish` returns them as `savedContacts`. Note: the publisher's own uid is filtered out of the final fanout EVEN when listed explicitly — you don't get a publish notification for the publish you just sent. If you call `publish_setlist({recipients: [{uid: self}]})` you'll see `recipientCount: 0` and `delivery.inApp.sent: 0`; that's intentional, not a bug.",
                    ),
                audience: z
                    .enum(["band", "all"])
                    .optional()
                    .describe(
                        "Default-audience preset, only used when `recipients` is omitted. 'band' (default) = admin + band_leader + musician. 'all' = + member accounts (full congregation, use sparingly).",
                    ),
                note: z
                    .string()
                    .max(2000)
                    .optional()
                    .describe(
                        "Free-text note to include in the email body above the song list (max 2000 chars).",
                    ),
                subject: z
                    .string()
                    .max(200)
                    .optional()
                    .describe("Override the email subject (max 200 chars)."),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, returns the would-publish recipient list + snapshot + chart-health pre-flight report without writing or sending. Useful to confirm the blast list AND that every bonded chart will render before committing. chartHealth carries `{bondedCount, okCount, missingCount, unreachableCount, unhealthy[]}` — same shape preview_publish returns (F-006 unified).",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass the chart-health pre-flight check. Default: publish refuses if any bonded chart is missing or unreachable (the band would see 404s). Pass force: true to publish anyway — use when you've intentionally left rows with broken bonds (e.g. the band will lead-live those songs).",
                    ),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional setlist-level optimistic-concurrency gate (W-04 Plan 03). Pass the setlist's `version` from your last get_setlist; rejects with `{error: 'stale_version', currentVersion, ...}` if another writer changed the setlist after you read it. The check runs before the chart-health pre-flight and recipient resolution, so a stale call is cheap. Omit to skip the gate — useful for HTTP callers or for a publish that intentionally races a concurrent edit.",
                ),
            },
        },
        async (args, extra) =>
            jsonResult(await publishSetlist(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_chart_status",
        {
            description:
                "Probe a single chart's health (Storage + Drive fallback) without downloading bytes. Returns { ok: true, fileId, health } where `health` is one of: { status: 'ok', source: 'firebase-storage'|'google-drive', mimeType? }, { status: 'missing', reason }, or { status: 'unreachable', error }. Use to verify a bond is renderable before bonding it onto a setlist row, or to investigate why a published chart isn't loading for the band. Cheap — metadata-only, no byte transfer.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "Chart fileId — same id returned by upload_chart / import_chart_from_drive, or the songId on a bonded setlist track.",
                    ),
                mimeType: z
                    .string()
                    .optional()
                    .describe(
                        "Optional mimeType hint to short-circuit Storage path probing. Inferred from library_index when omitted.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getChartStatus(uidFrom(extra), args)),
    )

    server.registerTool(
        "wait_for_setlist_change",
        {
            description:
                "W-04 long-poll setlist change observer. Blocks server-side until either the setlist's `version` (or any of its tracks') advances past `sinceVersion`, or `timeoutSec` elapses. Use to passively watch for concurrent edits from the web app or another agent — chain successive calls if you need to wait longer than 60 seconds. Returns `{changed: true, currentVersion, changes: [...], setlist?}` on a real change, or `{changed: false, currentVersion, timedOut: true}` on timeout. The `version` to pass is the one returned by `get_setlist` or `list_setlists`. Cheap: no byte transfer, single subscribe + race against a setTimeout.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                sinceVersion: z
                    .number()
                    .int()
                    .min(0)
                    .describe(
                        "The version you last observed. Pass 0 if you've never read the setlist before — the call will return immediately with the current state.",
                    ),
                timeoutSec: z
                    .number()
                    .int()
                    .min(1)
                    .max(WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC)
                    .optional()
                    .describe(
                        `How long to wait before returning {changed: false, timedOut: true} (default ${WAIT_FOR_SETLIST_CHANGE_DEFAULT_TIMEOUT_SEC}s, max ${WAIT_FOR_SETLIST_CHANGE_MAX_TIMEOUT_SEC}s)`,
                    ),
                includeFullState: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, the response includes a `setlist` field with the full post-change setlist + tracks (saves a follow-up get_setlist call). Default false.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await waitForSetlistChange(uidFrom(extra), args)),
    )

    server.registerTool(
        "propose_setlist_changes",
        {
            description:
                "W-01 — STAGE a batch of setlist edits for chat-native review BEFORE committing. Returns `{stageId, ...}` (pass the same uuid as `stageId` to `commit_staged_changes`) plus a per-proposal envelope with `confidence` ('high' | 'medium' | 'low', derived from W-02 titleSpecificity), `flags` (e.g. 'generic_title' for specificity < 0.5; 'orphan_risk'; 'no_library_record'), and a one-sentence `explanation` per proposal. The response also carries a duplicate `id` field with the same uuid — that's the W-01 wire-shape name; prefer `stageId`. NO writes against the setlist yet — that happens via `commit_staged_changes`. Use this when assembling a multi-row change (typical: 5-30 proposals for a weekly Shabbat setlist) so the rabbi can confirm the bonds before they land. Each proposal has `action: 'add' | 'update' | 'remove'`; `reorder` is NOT supported as a stage proposal — use the dedicated reorder_setlist tool for full permutations. Default TTL 600s (10 min), max 3600s. Stages are one-shot — commit deletes the doc.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                proposals: z
                    .array(proposeChangeProposalSchema)
                    .min(1)
                    .max(50)
                    .describe("1–50 proposals to stage."),
                ttlSec: z
                    .number()
                    .int()
                    .min(1)
                    .max(3600)
                    .optional()
                    .describe(
                        "Time-to-live in seconds before the stage expires (default 600, max 3600). After expiry, commit_staged_changes returns `stage_expired`.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await proposeSetlistChanges(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "commit_staged_changes",
        {
            description:
                "W-01 — COMMIT a previously-staged batch from `propose_setlist_changes` atomically. Reads the stage, version-gates the setlist (W-04 optimistic concurrency), applies every proposal in one Firestore transaction (adds + updates + removes; track-order re-packed contiguous on success), then deletes the stage doc. Returns `{ok, setlistVersion, addedTrackIds, updatedTrackIds, removedTrackIds}`. Returns `{error: 'stale_version', currentVersion, ...}` if the setlist drifted past `lastSeenVersion` (or past the version captured when the stage was created, if lastSeenVersion omitted) — re-fetch state and re-stage. Returns `{error: 'stage_expired', ...}` if the TTL fired. Returns `{error: 'Stage not found, ...'}` if the stage was already committed or never existed (one-shot semantic).",
            inputSchema: {
                stageId: z
                    .string()
                    .min(1)
                    .describe(
                        "Stage id from propose_setlist_changes response.",
                    ),
                lastSeenVersion: lastSeenVersionSchema.describe(
                    "Optional W-04 setlist-level optimistic-concurrency gate. Pass the setlist `version` you saw last; commit rejects with `stale_version` on mismatch. Omit to fall back to the version captured when the stage was created.",
                ),
            },
        },
        async (args, extra) =>
            jsonResult(await commitStagedChanges(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "preview_publish",
        {
            description:
                "W-01 — PREVIEW a publish before pulling the trigger. Wraps publish_setlist({dryRun: true}) and reformats the response into the four signals the agent needs for chat-native confirm: chartHealth (`{bondedCount, okCount, missingCount, unreachableCount, unhealthy[]}` — same shape publish_setlist returns post-F-006), audience (recipient count + role breakdown across admin/band_leader/musician/member), snapshotDiff vs. the last `publishedSnapshot` (added / removed / modified track rows), flaggedBonds (count of open bond_flags awaiting review via review_flagged_bonds), and `recommendation`: 'hard_block' if any chart status is 'missing' (the band would 404), 'review_first' if flaggedBonds > 0 (walk them first via review_flagged_bonds + record_bond_correction), 'publish' otherwise. Use this between the propose→commit cycle and the actual publish_setlist call. Read-only — no writes, no notifications, no rate-limited charge.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                audience: z
                    .enum(["band", "all"])
                    .optional()
                    .describe(
                        "Audience preset forwarded to publish_setlist. 'band' (default) = admin + band_leader + musician. 'all' = + member accounts.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await previewPublish(uidFrom(extra), args, orgFrom(extra))),
    )

    // ── Contacts (v11.4-03, D8 item 3): remembered ad-hoc recipients ──────────
    server.registerTool(
        "list_contacts",
        {
            description:
                "List your saved contacts — remembered ad-hoc recipients (people with no app account, just a name + email/phone) for this org. Use to offer reusable recipients when publishing. To actually send to one, pass it as a `recipients` entry (name + email) on publish_setlist.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await listContacts(uidFrom(extra), {}, orgFrom(extra))),
    )

    server.registerTool(
        "find_contact",
        {
            description:
                "Look up a saved contact by email or name — the read partner to create_contact/delete_contact, so you don't have to list_contacts and scan. `email` matches exactly (case-insensitive); `nameContains` is a case-insensitive substring of the contact's name. Combine with AND. Org-scoped, leaders only. Returns `{ok, contacts: [{id, name, email, phone}], count}`.",
            inputSchema: {
                email: z
                    .string()
                    .optional()
                    .describe(
                        "Exact email to match (case-insensitive). Pass email and/or nameContains.",
                    ),
                nameContains: z
                    .string()
                    .optional()
                    .describe(
                        "Case-insensitive substring of the contact's name to match.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await findContact(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "create_contact",
        {
            description:
                "Remember an ad-hoc recipient for next time — a person the system has no account for (e.g. a guest musician or a parent). Saves a contact (name + email and/or phone) scoped to your org. Use this after a publish where the leader wanted to email someone who isn't a band member, so you don't have to retype them next week. Deduplicates by email (returns the existing contact instead of a duplicate). Does NOT send anything — to notify a contact, pass it as a `recipients` entry on publish_setlist.",
            inputSchema: {
                name: z.string().min(1).describe("Display name, e.g. 'Jane Cohen'"),
                email: z
                    .string()
                    .optional()
                    .describe("Email address (at least one of email/phone is required)"),
                phone: z
                    .string()
                    .optional()
                    .describe("Phone number (stored for the future; SMS is not sent yet)"),
            },
        },
        async (args, extra) =>
            jsonResult(await createContact(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "delete_contact",
        {
            description:
                "Delete a saved contact by id (from list_contacts). Scoped to your org — a contact in another tenant returns contact_not_found.",
            inputSchema: {
                id: z.string().min(1).describe("Contact id from list_contacts"),
            },
        },
        async (args, extra) =>
            jsonResult(await deleteContact(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "flag_bond",
        {
            description:
                "W-01 — Flag a setlist row for batch review (typically because the bonded song was committed at low confidence and the rabbi should double-check before publish). Upserts `bond_flags/{setlistId}_{trackId}` with the reason, flaggedAt, flaggedBy. Idempotent — re-flagging the same row updates the reason. Pair with `review_flagged_bonds` at end of authoring to walk the queue, then `record_bond_correction` per resolution.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                trackId: z.string().min(1).describe("Track id to flag"),
                reason: z
                    .string()
                    .min(1)
                    .describe(
                        "Short rationale, e.g. 'generic title, only one search hit' or 'wrong arrangement, sounds like the other Hashkivenu'.",
                    ),
            },
        },
        async (args, extra) => jsonResult(await flagBond(uidFrom(extra), args)),
    )

    server.registerTool(
        "review_flagged_bonds",
        {
            description:
                "W-01 — Return every open bond_flag for a setlist, joined with the current track state and up to 5 alternative songIds ranked by W-02 signals (titleSpecificity, bondCorrectionHistory bias, contextHint boost when the setlist has a templateType). Use at end of authoring to walk the batch with the rabbi; for each correction the rabbi confirms, follow with record_bond_correction.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
            },
        },
        async (args, extra) =>
            jsonResult(await reviewFlaggedBonds(uidFrom(extra), args)),
    )

    server.registerTool(
        "record_bond_correction",
        {
            description:
                "W-01 — Record a rabbi-confirmed bond correction as the system's training signal. In one Firestore transaction: writes `bond_corrections/{id}` (audit trail), bumps library_index.{fromSongId}.bondCorrectionHistory.correctedAwayFrom + library_index.{toSongId}.bondCorrectionHistory.correctedTo, deletes the matching `bond_flags/{setlistId}_{trackId}` doc, and — when correctedTo for the (toSongId stem, setlist contextKey) pair hits the 3-pick threshold — upserts `titleContextHints/{stem}_{contextKey}` so search_library biases future calls toward `toSongId`. contextKey is derived from the setlist's templateType (e.g. 'shabbat-morning'). Re-bonding the actual track is a separate call — use update_track / swap_chart to flip the row's songId. record_bond_correction is the LEARNING signal, not the row mutation.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                trackId: z.string().min(1).describe("Track id corrected"),
                fromSongId: z
                    .string()
                    .min(1)
                    .describe("The songId the row WAS bonded to (the wrong one)."),
                toSongId: z
                    .string()
                    .min(1)
                    .describe(
                        "The songId the rabbi picked instead. Must differ from fromSongId.",
                    ),
                reason: z
                    .string()
                    .optional()
                    .describe(
                        "Optional rationale ('wrong arrangement', 'composer mismatch') — surfaces in the audit trail.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await recordBondCorrection(uidFrom(extra), args)),
    )

    server.registerTool(
        "verify_setlist_charts",
        {
            description:
                "HEAD-check every bonded chart on a setlist in parallel and return per-row health (ok / missing / unreachable / unbonded). Use BEFORE publish_setlist to catch broken bonds — publish_setlist runs this same check internally and refuses by default if anything is broken. Use AFTER bulk_add_tracks to confirm every new bond is renderable. Returns `rows[]` with trackId, title, songId, fileId, and per-row health; plus aggregate counts (bondedCount, okCount, missingCount, unreachableCount, orphanedMarked). Pass `markOrphaned: true` to also persist `status: 'orphaned'` on every catalog row whose underlying file was definitively missing — those rows then drop out of search_library by default. Read-only otherwise; cheap, no byte transfer.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
                markOrphaned: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, persist `status: 'orphaned'` on library_index + songs for every row whose health is `missing` (definitively not-found; never on transient `unreachable`). Default false — opt in when you're confident the missing rows are truly dead and want them swept from future search results.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await verifySetlistCharts(uidFrom(extra), args)),
    )

    server.registerTool(
        "review_chart_bonds",
        {
            description:
                "Detect WRONG bonds on a setlist — rows where the song title and the bonded chart's filename diverge (e.g. a 'Barchu' row bonded to 'Ahava Raba.pdf'). Complements verify_setlist_charts: that tool checks whether a chart is REACHABLE; this one checks whether the reachable chart is the RIGHT song. For each bonded track it compares the normalized title against `library_index/{fileId}.name` (the raw chart filename) via conservative token-overlap and returns per-row `{trackId, title, fileId, chartFileName, overlapScore (0-1), mismatch}` plus aggregate `mismatchCount` / `bondedCount`. Run it after clone_setlist (clones inherit the source's bonds verbatim) or before publish to catch a mis-bond the band would otherwise see. Read-only — it reports; remediate a flagged row with swap_chart, then record_bond_correction to train ranking. A null `chartFileName` means the fileId has no catalog row (a byte-health issue — run verify_setlist_charts).",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id"),
            },
        },
        async (args, extra) =>
            jsonResult(await reviewChartBonds(uidFrom(extra), args)),
    )

    server.registerTool(
        "dedupe_library",
        {
            description:
                "Admin-only one-shot idempotent library_index hygiene sweep — finds active rows whose normalized names collide (e.g. `\" Ana B_Koach.pdf\"` leading-space dupes; or two uploads of the same chart name) and marks all-but-one `status: \"duplicate\"`. Canonical row is the one with the earliest `uploadedAt` (fileId asc as tiebreak); losers also get the status mirrored into `songs/{id}` when that doc exists. searchLibrary + list_library hide `status: \"duplicate\"` from their default surface, so the practical effect is collapsing dupes to one visible row without deleting any bytes. Already-`duplicate` and `archived` rows are skipped → safe to re-run. CYCLE-3 MCP-001 (Daniel-ratified 2026-05-18T18:45Z): F-05 contract aligned with reconcile/backfill — dryRun-default; a real run without `force: true` returns the plan with `refused: true` and no writes. Optional `forceScore` (0..1) enables an ADDITIONAL fuzzy-similarity grouping pass on top of the default exact-normalize: Levenshtein-similarity > threshold clusters rows that survived exact-grouping. PER-CALL TUNING ONLY — the standing 0.85 strict threshold elsewhere in the codebase is unchanged. Omitting `forceScore` preserves the historical exact-normalize-only behavior. Returns `{scanned, groupsFound, wouldMark, committed, songsMirrored, groups[], dryRun, refused?, threshold, coverage:{total,eligible,scanned,filteredOut}}` — `wouldMark` is the planned loser count (surfaced on every path); `committed` is the count actually marked this call (0 on dryRun/refused, equals `wouldMark` on a committed real-run).",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true, returns the dedupe plan (every group + losers) without writing. F-05 standing rule: dryRun does NOT require force. Default false — but a real run still requires `force: true`.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Cycle-3 MCP-001 — required for real writes. Pair with `dryRun: false`. Omitting it returns the plan with `refused: true` and no writes. Matches the F-05 standing rule on every other hygiene tool.",
                    ),
                forceScore: z
                    .number()
                    .min(0)
                    .max(1)
                    .optional()
                    .describe(
                        "Cycle-3 MCP-001 — optional per-call similarity threshold. When provided, a fuzzy-similarity pass groups rows whose dedupe-normalized name similarity exceeds this value AFTER the default exact-normalize grouping has run. 0.85 is the standing-rule strict default ([[feedback_dedup_force_override]]); 0.84 is the cycle-4 §7.B.4 boundary probe. PER-CALL TUNING ONLY — does NOT change the persisted dedup threshold anywhere else (upload_chart's force-override semantics are unaffected). Omit to preserve exact-normalize-only behavior.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await dedupeLibraryIndex(uidFrom(extra), args)),
    )

    server.registerTool(
        "backfill_setlist_test_flag",
        {
            description:
                "Admin-only one-shot setlist hygiene pass (cycle-2 SEC-004). Walks every `setlists/*` doc and classifies each as `isTest: true` when owner uid starts with `test-` (provisioned by `create_test_account`) OR the name matches `^\\[(TEST|CYCLE\\d+-|CF\\d+-)`. Going forward, `create_setlist` stamps `isTest` at write time — this tool exists exclusively to backfill legacy rows that pre-date the SEC-004 commit so the `/perform` public listing's `isTest === false` filter is sound across the whole collection. Defaults `dryRun:true`; pass `force:true` for real writes. A real run without `force:true` returns the rich `force_required` envelope (REG-003: `{ok:false, error:{machine_code:'force_required'}, dryRunPlan:<the plan>}`) and no writes. On success returns `{scanned, rowsChanged, flaggedTest, flaggedReal, deltas, deltasTruncated, dryRun}`; `deltas` is capped at 500 entries with `deltasTruncated:true` past that.",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the diff plan only — every setlist whose `isTest` would change, with before/after values — without writing. F-05 standing rule.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await backfillSetlistTestFlag(uidFrom(extra), args)),
    )

    server.registerTool(
        "backfill_library_index",
        {
            description:
                "Admin-only one-shot library_index hygiene backfill (cycle-2 DATA-001). Walks every row; for each, (a) strips leading/trailing whitespace from `name` (and rebuilds `nameLower`) so future Drive re-scans don't fork into duplicate rows the way ' Ana B_Koach.pdf' once did, and (b) hydrates `fileSize` from the Firebase Storage object (probes `library/{fileId}` + `.pdf` / `.xml` / image extensions) for rows whose `fileSize` is null. Rows with `status: \"orphaned\"` or `status: \"duplicate\"` skip the size hydration (no Storage object to probe). Defaults `dryRun: true` per the F-05 dry-run-is-observability rule — the caller MUST pass `force: true` to actually write. Returns `{scanned, rowsChanged, namesNormalized, fileSizesHydrated, fileSizesUnresolved, deltas, deltasTruncated, dryRun, coverage:{total,eligible,scanned,filteredOut}}` on success — the cycle-3 DATA-002 coverage field is identical in shape across list_library / dedupe_library / reconcile_library so operators can correlate totals across the four tools. `deltas` is capped at 500 rows (set `deltasTruncated:true` past that — the totals stay accurate). Real run without `force:true` returns the rich `force_required` envelope (REG-003: `{ok:false, error:{machine_code:'force_required'}, dryRunPlan:<the plan>}`) and no writes.",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the diff plan only — every row that would change, with before/after values — without writing. F-05 standing rule.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes — even after `dryRun: false` is set.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await backfillLibraryIndex(uidFrom(extra), args)),
    )

    server.registerTool(
        "reconcile_library",
        {
            description:
                "Admin-only one-shot bootstrap reconciliation for `library_index` rows under the storage-canonical direction (cycle-3 ADDENDUM-1 NEW-2). Walks every active row; for any whose Storage object 404s, probes Drive: Drive 200 + chart-shape → mirror the bytes into Storage at the EXISTING fileId (preserving every setlist/song bond) and flip `status: 'active'`; Drive 200 + non-chart mime (folder / audio / .DS_Store / Office doc) → route to `skippedNonChart` bucket and leave untouched (cycle-3 BUG-001 — prevents force-writes of 0-byte garbage at the existing fileId); Drive 404 → mark `status: 'orphaned'`; canonical mime is a Drive shortcut → route to the `needsRebond` bucket (C9I3-002), and on a force-run auto-resolve the shortcut TARGET's bytes in place at the same fileId (preserving bonds) — a target that 404s escalates to `orphan`, a shortcut chain / unresolvable target stays `needsRebond` for a manual re-bond; Drive 5xx / timeout → leave the row untouched and surface in the `transient` bucket so the operator can re-run later. Drains the ~250 dead-looking rows from the pre-NEW-1 era. Idempotent: rows already `status: 'orphaned'` or `status: 'duplicate'` are skipped, so a second run after a successful force-run leaves nothing to do. Defaults `dryRun: true` per the F-05 dry-run-is-observability rule — caller MUST pass `force: true` to actually write. dryRun returns the full plan (bucket counts + per-row preview, capped at 500 rows per bucket) without writes. Real run without `force: true` returns the rich `force_required` envelope (REG-003: `{ok:false, error:{machine_code:'force_required'}, dryRunPlan:<the plan>}`) and no writes. Mirror operation preserves processChartUpload's atomic-guard contract (read-verify + compensating-delete + library_signals broadcast). Returns `{scanned, alreadyHealthy, driveMirror:{count,rows,truncated}, orphan:{count,rows,truncated}, transient:{count,rows,truncated}, skippedNonChart:{count,rows,truncated}, needsRebond:{count,rows,truncated}, coverage, dryRun, committed}` on success.",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the bucket counts + per-row plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes — even after `dryRun: false` is set.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await reconcileLibrary(uidFrom(extra), args)),
    )

    server.registerTool(
        "salvage_chart_bytes",
        {
            description:
                "Admin-only HEAL tool — re-upload chart bytes onto an EXISTING orphaned `library_index/{fileId}` row, preserving every setlist/song bond pointing at that fileId (cycle-3 DATA-001). Use this BEFORE `reconcile_library({force:true})` would mark a row orphaned, when the song is load-bearing (the 24-orphan triage surfaced names like Ana B'Koach, Mizmor L'David, Tu Bishvat, Yedid Nefesh, May the Memory). Source-bytes resolution: (1) if `sourceUrl` is provided, fetch it (https only, 25MB cap); (2) else if the row carries `driveFileId`, re-fetch from Drive via the service account; (3) else refuse with `no_source_available`. HEAL contract (NOT a fresh-mint upload): bytes land at the SAME fileId, mimeType + fileSize + source:'salvage' + salvagedAt + status:'active' are merge-updated, every curation field (key, bpm, tags, leadMusician, composer, arranger, bondCorrectionHistory) is preserved, and the derived dedup/search fields (normalizedName, stem, titleSpecificity) are RECOMPUTED + enrichmentStatus reset to 'pending' so the AI enrichment pass re-runs on the new bytes. Atomic-guard: read-verify + compensating-delete on Firestore failure + library_signals broadcast — same contract as reconcile_library and processChartUpload. Defaults `dryRun: true` per the F-05 dry-run-is-observability rule; the dryRun plan resolves bytes (and may fail at this stage if the source is broken) but writes nothing. Real run without `force: true` returns the plan with `refused: true`. Refusal envelopes (rich): `forbidden_role` (admin-only), `row_not_found`, `no_source_available`, `invalid_source_url`, `invalid_source_mime`, `source_fetch_failed`, `source_fetch_empty`, `source_too_large`, `storage_upload_failed`, `storage_verify_missing`, `storage_size_mismatch`, `firestore_write_failed`. Returns `{ok:true, fileId, rowName, source:'sourceUrl'|'drive', mimeType, sizeBytes, storagePath, dryRun, refused?}`.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "The orphaned library_index row's fileId (typically `upload-<uuid>`). Discover via reconcile_library({dryRun:true}).orphan.rows[].",
                    ),
                sourceUrl: z
                    .string()
                    .url()
                    .optional()
                    .describe(
                        "Optional https:// URL to fetch fresh bytes from. Omit to fall back to the row's `driveFileId` (Drive re-fetch via the service account). When provided, the mime is taken from the response Content-Type header and must be one of: pdf, xml, musicxml, png, jpeg, text. 25MB cap.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), resolves source bytes + returns the plan without writing to Storage / Firestore. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the plan with `refused: true` and no writes — even after `dryRun: false` is set.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await salvageChartBytes(uidFrom(extra), args)),
    )

    server.registerTool(
        "backfill_heal_metadata",
        {
            description:
                "Admin-only ONE-TIME backfill — for a single already-healed `library_index/{fileId}` row, recompute the derived dedup/search fields (`normalizedName`, `stem`, `titleSpecificity`) from the row's title and re-trigger the AI enrichment pass on its bytes. Use this ONLY for rows healed before the chart-heal metadata fix (the 271 Shireinu rows in heal-run-report.json `action:'healed'`) — fresh heals (salvage_chart_bytes / finalize_chart_upload) now stamp these fields inline. Skips (action:'skipped') any row whose status is not 'active' (an orphaned/missing-bytes row must be healed first, not metadata-papered). `dryRun` defaults true: it computes + returns the would-be fields (and the row's prior values) WITHOUT writing or spending Gemini tokens. On `dryRun:false` it merge-sets the four fields then runs the enrichment pass (awaited; deterministic) — this DOES spend a Gemini call per row, so drive it from the operator script after reviewing the dry-run. Returns `{ok:true, fileId, name, dryRun, action:'would-stamp'|'stamped'|'skipped', reason?, computed:{normalizedName, stem, titleSpecificity, enrichmentStatus}, prior:{...}, enrichmentStatus?, enrichment?:'ran'|'skipped_no_bytes'}`. Refusals (rich): `forbidden_role`, `row_not_found`, `invalid_argument`, `internal_error`.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "The healed library_index row's fileId (from heal-run-report.json action:'healed' targetFileId).",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), compute + return the plan + prior values without writing or enriching. Set false to stamp the fields + run the Gemini enrichment pass (token spend).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await backfillHealMetadata(uidFrom(extra), args)),
    )

    server.registerTool(
        "backfill_track_mimetype",
        {
            description:
                "Trusted-leader (admin / band_leader) one-shot hygiene backfill — heal the denormalized `mimeType` cache on LEGACY setlist `tracks` rows ([[project_track_mimetype_gotcha]], cowork #2/#7). The in-app chart picker and (since 2026-05-20) the MCP bind path both stamp `mimeType` onto a track from its bonded `library_index/{fileId}` row, and Perform's viewer routing (queue-utils.toQueueItem) keys on it — so a scraped/text/image chart bonded BEFORE those fixes carries no `mimeType`, renders as the wrong 'sub-attached doc' / broken-PDF until re-bonded. This walks every `tracks` row that is bonded (`fileId` present) but missing `mimeType` and stamps the value from the bonded library_index entry (same source the live bind paths read). Does NOT touch the bond (`fileId`) — only the denormalized render-routing field. `dryRun` defaults TRUE (F-05): returns the full would-change report (counts + per-row before/after) WITHOUT writing. A real run (`dryRun:false`) still requires `force:true` or it returns the plan with `refused:true` and no writes. Idempotent — a second force-run finds zero candidates. Returns `{ok:true, scannedTracks, bondedTracks, alreadyHealthy, heal:{count,rows:[{trackId,setlistId,title,fileId,before:null,after}],truncated}, skipped:{count,rows:[{trackId,fileId,reason}],truncated}, dryRun, committed, refused?, forceWithoutCommit?}` (rows capped at 500 with `truncated:true`). NOTE: `force:true` WITHOUT `dryRun:false` still dry-runs (dryRun defaults true) and returns `forceWithoutCommit:true, committed:0` so you know no write landed — pair `dryRun:false, force:true` to actually heal. `skipped` rows are bonded-but-missing-mime tracks whose library_index entry is absent (`library_entry_not_found`) or itself carries no mimeType (`library_entry_no_mimetype`) — those need a chart heal, not a metadata stamp. ★ Run dryRun-first; the apply is a single-owner step.",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the per-row would-change plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the plan with `refused: true` and no writes — even after `dryRun: false` is set.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await backfillTrackMimetype(uidFrom(extra), args)),
    )

    // library-bulk-archive-nonchart (Tier-1 P2 2026-05-27, data-health dh-20260527a
    // Class 3): bulk soft-archive the UNAMBIGUOUS non-chart residents of
    // library_index (Drive folders + Google Sheets). Google Docs are HELD for
    // per-row triage.
    server.registerTool(
        "archive_nonchart_artifacts",
        {
            description:
                "Admin-only bulk soft-archive of the UNAMBIGUOUS non-chart residents of `library_index` (data-health dh-20260527a Class 3). Legacy Drive scans seeded the catalog with rows that are not embeddable charts — Google Drive *folders* (`application/vnd.google-apps.folder`) and Google *Sheets* (`application/vnd.google-apps.spreadsheet`). This flips their `status` to `'archived'` (the same reversible soft-delete as the in-app `/api/library/archive` route: sets `archivedBy`/`archivedAt`, mirrors `songs/{id}.status` ONLY if a songs doc already exists), so they vanish from `list_library` AND from `reconcile_library` scans (this lane also added `archived` to reconcile's status-skip set). ★ NARROW: only folder + sheet mimeTypes are eligible (expect exactly 24 in prod — 23 folders + 1 sheet). Google *Docs* (`application/vnd.google-apps.document`) are NEVER archived — they surface in `heldGoogleDocs` with a HOLD recommendation for per-row triage (some are single-song docs already re-uploaded as PDFs). The guard refuses any fileId whose mimeType is not folder/sheet, even one passed explicitly via `fileIds` — a chart fileId can never be archived. F-05: `dryRun` defaults TRUE — returns the full plan (would-archive set + held docs + alreadyArchived + notMatched) WITHOUT writing. A real run (`dryRun:false`) still requires `force:true` or returns the plan with `refused:true`. Idempotent: eligible rows already at `status:'archived'` are counted in `alreadyArchived` and skipped. Each archived row is read-verified post-commit (`verified` count). Returns `{ok, scanned, toArchive:{count,rows:[{fileId,name,mimeType,kind:'folder'|'sheet'}],truncated}, heldGoogleDocs:{count,rows:[{fileId,name,mimeType,recommendation}],truncated}, alreadyArchived, notMatched:[fileId], dryRun, committed, verified, refused?}`. Refusals (rich): `forbidden_role`, `internal_error`. ★ Single-owner apply per [[feedback_single_owner_destructive_runs]]: dryRun-first, confirm count==24, get Daniel's 'go', then `dryRun:false, force:true`.",
            inputSchema: {
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the would-archive plan without writing. F-05: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun:false`. Omitting it returns the plan with `refused:true` and no writes.",
                    ),
                fileIds: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Optional — restrict to this explicit fileId set (e.g. the 24 from the dh-20260527a report) instead of scanning the whole catalog. Each id is still mimeType-guarded; missing or non-folder/sheet ids land in `notMatched` and are never archived.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await archiveNonChartArtifacts(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_ai_config",
        {
            description:
                "Admin-only — read the current AI enrichment config (cycle-3 c2). Returns `{ok: true, autoApplyEnabled: boolean, threshold: number, subscriberActive: boolean, provider: 'gemini'|'anthropic'|null}` where `autoApplyEnabled` is the gate that lets the a3 subscriber auto-apply provider suggestions onto fresh library_index rows (false during the calibration phase forces every row into /manage/library-review) and `threshold` is the confidence floor below which any row enters review_pending regardless of the gate. `subscriberActive` is true when the active provider's API key is present in the environment (today: `GEMINI_API_KEY`). `provider` is the active provider discriminant — `'gemini'` post-a3-gemini-swap, `null` when no key is set; the union keeps `'anthropic'` as a forward-compat slot. Both Firestore-backed values live on the single doc `aiConfig/autoApplyEnabled` — this tool is the read counterpart of set_ai_auto_apply + set_ai_threshold. Defaults surface when the doc is missing or fields are out of range: autoApplyEnabled false, threshold 0.7 (Daniel-ratified per ADDENDUM-1). Read-only — no writes.",
            inputSchema: {},
        },
        async (_args, extra) => jsonResult(await getAiConfig(uidFrom(extra))),
    )

    server.registerTool(
        "set_ai_auto_apply",
        {
            description:
                "Admin-only — flip `aiConfig.autoApplyEnabled` (cycle-3 c2). Controls whether the a3 AI enrichment subscriber auto-applies Sonnet's suggestions onto new library_index rows (true → auto-fill empty key/bpm/tags/leadMusician when confidence ≥ threshold; false → every row lands in /manage/library-review for human triage regardless of confidence). Pair `dryRun: false, force: true` for the actual write — F-05 standing rule: dryRun-default + force-required for real writes. dryRun returns the would-be `{previous, new, changed}` without writing. A real run without `force: true` returns the rich `force_required` envelope (REG-003) and still no writes. Idempotent: flipping to the current value returns `changed: false` without surprise side-effects. Returns `{ok: true, previous: boolean, new: boolean, changed: boolean, dryRun}`.",
            inputSchema: {
                enabled: z
                    .boolean()
                    .describe(
                        "Desired state for the auto-apply gate. `true` enables auto-apply on high-confidence rows; `false` forces every fresh row into /manage/library-review.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes. Pair with clear user intent (e.g. \"flip auto-apply on\") — the dryRun → real-run flow is the safety contract.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await setAiAutoApply(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_ai_threshold",
        {
            description:
                "Admin-only — set `aiConfig.threshold` (cycle-3 c2). Confidence floor in `[0, 1]` used by the a3 AI enrichment subscriber: any row whose Sonnet self-assessed `confidence` is below this threshold lands in /manage/library-review regardless of autoApplyEnabled. Default 0.7 (Daniel-ratified per ADDENDUM-1 §3 NEW-3). Use lower values (e.g. 0.5) to let more borderline AI calls auto-apply during calibration; higher values (e.g. 0.85) to be more conservative once the queue stabilises. Zod-validated: out-of-range values return `validation_error` with hint. Same dryRun/force contract as set_ai_auto_apply: dryRun-default, force-required for writes. Idempotent. Returns `{ok: true, previous: number, new: number, changed: boolean, dryRun}`.",
            inputSchema: {
                value: z
                    .number()
                    .min(0)
                    .max(1)
                    .describe(
                        "New confidence threshold in [0, 1]. 0.7 is the Daniel-ratified default; 0.5 is loose; 0.85 is conservative.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await setAiThreshold(uidFrom(extra), args)),
    )

    // ─── Library review queue (cycle-3 a5) ───────────────────────────────
    // Admin-only MCP-tool counterpart to a4's `/manage/library-review` UI.
    // Wraps a4's `src/lib/library/review-queue.ts` helper so Daniel can
    // triage AI enrichment + Drive import failures from Claude Desktop.

    server.registerTool(
        "list_review_queue",
        {
            description:
                "Admin-only — list the three review queues backing a4's `/manage/library-review` UI (cycle-3 a5). Returns `aiReview` (library_index rows at `enrichmentStatus: 'review_pending'` — Sonnet/Gemini flagged for human triage), `aiFailed` (rows that hit the retry ceiling — joined with `aiEnrichmentRetryQueue/{rowId}` for `lastError`/`attempts`/`exhaustedAt` forensics), and `importFailures` (a1's `chartImportQueue/{driveFileId}` rows from the every-5-min Drive sync cron, excluding dismissed). Per-row shape mirrors the HTTP `/api/admin/library-review/queue` payload — `current` (existing human-set fields), `suggestion` (the AI's structured-output snapshot), `triggers` (which review flags fired), and `duplicateCandidates` (sibling rows hydrated via batched getAll). `config` carries the calibration banner state (autoApplyEnabled + threshold + aiProviderConfigured — true when the active provider's API key is in the env; post-a3-gemini-swap this reads `GEMINI_API_KEY`) so the operator sees the same context the UI shows. Filter with `kind: 'enrichment' | 'import' | 'all'` (default 'all') and `status: 'review_pending' | 'failed'` (omit for both). `limit` defaults 50, max 200. Read-only.",
            inputSchema: {
                kind: z
                    .enum(["enrichment", "import", "all"])
                    .optional()
                    .describe(
                        "'enrichment' returns aiReview + aiFailed only. 'import' returns importFailures only. 'all' (default) returns every bucket.",
                    ),
                status: z
                    .enum(["review_pending", "failed"])
                    .optional()
                    .describe(
                        "Optional library_index status filter — 'review_pending' returns only the AI review queue, 'failed' returns only the AI failed queue + Drive import failures.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(200)
                    .optional()
                    .describe(
                        "Per-bucket row cap. Default 50, max 200. `truncated: true` in the response when any bucket exceeded the cap.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listReviewQueue(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_enrichment_suggestion",
        {
            description:
                "Admin-only — fetch the full AI suggestion + duplicate-candidates context for one `library_index` row (cycle-3 a5). Returns `suggestion` (the Sonnet/Gemini structured-output snapshot: is_chart, confidence, suggested_title/key/bpm/lead/tags, collection_disagrees_with_folder, duplicate_candidates), `triggers` (which review-pending checks fired), `current` (existing human-set fields so the caller can diff before acting), and `duplicateCandidates` hydrated with title + collection. Use before `accept_enrichment` / `edit_enrichment` to confirm what's actually in the doc — the `list_review_queue` row carries the same fields but capped to 50/page. Read-only; no writes.",
            inputSchema: {
                rowId: z
                    .string()
                    .min(1)
                    .describe(
                        "library_index document id (visible in every `list_review_queue` row).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getEnrichmentSuggestion(uidFrom(extra), args)),
    )

    server.registerTool(
        "accept_enrichment",
        {
            description:
                "Admin-only — apply the AI suggestion to a `library_index` row (cycle-3 a5). Calls a4's shared `acceptEnrichment` helper: gap-fill only (never overwrites human-set key/bpm/leadMusician/tags), NEVER overwrites `collection` (David's-subfolder authority — operator must use `edit_enrichment` to override), and only renames the row's `name` when the suggestion differs AND `humanRenamedAt` isn't already set. Sets `enrichmentStatus: 'enriched'` + stamps `enrichmentReviewedAt`/`enrichmentReviewedBy`. F-05 contract: `dryRun: true` (default) returns the would-be `plannedStatus` + `plannedPatch` (the fields that would actually flip) without writing. Real-run without `force: true` returns the rich `force_required` envelope (REG-003) and no writes. Pair `dryRun: false, force: true` for the actual flip. Idempotent: re-running on an already-enriched row succeeds (gap-fill applies nothing new). Returns `{ok: true, rowId, status, plannedStatus, plannedPatch?, dryRun}`. Refusals carry rich `row_not_found` / `invalid_state` envelopes.",
            inputSchema: {
                rowId: z
                    .string()
                    .min(1)
                    .describe(
                        "library_index document id from `list_review_queue` or `get_enrichment_suggestion`.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await acceptEnrichmentTool(uidFrom(extra), args)),
    )

    server.registerTool(
        "reject_enrichment",
        {
            description:
                "Admin-only — discard the AI suggestion for one `library_index` row (cycle-3 a5). Calls a4's shared `rejectEnrichment` helper: leaves all field values untouched, flips `enrichmentStatus` to `'human_rejected'`, stamps reviewedAt/reviewedBy, and tidies the `aiEnrichmentRetryQueue/{rowId}` doc so the next cron drain doesn't re-fire enrichment for this row. F-05 contract: `dryRun: true` (default) returns the plan without writing; real-run without `force: true` returns the rich `force_required` envelope (REG-003). Pair `dryRun: false, force: true` for the actual write. Idempotent: re-running on an already-`human_rejected` row is a no-op modulo the timestamp re-stamp. Returns `{ok: true, rowId, status: 'human_rejected', plannedStatus, dryRun}`.",
            inputSchema: {
                rowId: z
                    .string()
                    .min(1)
                    .describe(
                        "library_index document id from `list_review_queue`.",
                    ),
                dryRun: z.boolean().optional(),
                force: z.boolean().optional(),
            },
        },
        async (args, extra) =>
            jsonResult(await rejectEnrichmentTool(uidFrom(extra), args)),
    )

    // Cowork #4 — shared input schema for edit_enrichment + its edit_library_entry
    // alias. The "enrichment" name undersold the tool: it works on ANY
    // library_index row, not just AI-review-queue rows. The clearer-named alias +
    // the description note below close that discoverability gap without breaking
    // the existing `edit_enrichment` name.
    const editLibraryEntryInputSchema = {
        rowId: z
            .string()
            .min(1)
            .describe(
                "ANY library_index document id — from list_library / search_library / get_song (the fileId) OR list_review_queue. The row does NOT need to be in the AI review queue.",
            ),
        edits: z
            .object({
                title: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("Display title; non-empty when supplied."),
                collection: z
                    .enum(["core", "supplemental", "uploads", "nava"])
                    .optional()
                    .describe(
                        "Library collection. Operator override is permitted here (David's-subfolder authority does NOT bind operator edits, only AI).",
                    ),
                key: z
                    .string()
                    .optional()
                    .describe("Musical key (e.g. 'Em', 'G')."),
                bpm: z
                    .number()
                    .positive()
                    .nullable()
                    .optional()
                    .describe(
                        "Beats per minute, or null to clear an incorrect value.",
                    ),
                leadMusician: z
                    .string()
                    .optional()
                    .describe("Vocal Lead for this chart."),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Tag list (replaces existing tags)."),
            })
            .describe(
                "At least one field required. The helper rejects empty / unknown fields with a rich invalid_field envelope.",
            ),
        dryRun: z.boolean().optional(),
        force: z.boolean().optional(),
    }

    server.registerTool(
        "edit_enrichment",
        {
            description:
                "Admin + band-leader — operator edit of a `library_index` row (cycle-3 a5; also available under the clearer alias `edit_library_entry`). DESPITE THE NAME, this works on ANY library_index row, not just AI-review-queue rows — a row with `enrichmentStatus: null` (never enriched) is editable too. Calls a4's shared `editEnrichment` helper: applies the supplied `edits` payload directly to the doc (including `collection` — the operator override path IS allowed even though the AI's acceptEnrichment is NOT), sets `enrichmentStatus: 'human_curated'`, stamps reviewedAt/reviewedBy, and sets `humanRenamedAt` whenever `title` is changed (so future enrichment runs won't re-rename). Editable fields: title (non-empty), collection (core|supplemental|nava|uploads), key (string), bpm (positive number or null to clear), leadMusician (string), tags (string[]). At least one field required. v11.5-01-03 (H9): band leaders may edit tags/title/key/bpm/leadMusician on rows in THEIR OWN tenant (a row in another org returns row_not_found) but cannot change `collection` (admin-only, returns forbidden_field); admins are unscoped. For just a key/bpm fix, update_song also works. F-05 contract: `dryRun: true` (default) validates the edits payload + checks the row exists, returns `plannedPatch` without writing; real-run without `force: true` refuses. Validation failures surface as `invalid_field` rich envelopes. Returns `{ok: true, rowId, status: 'human_curated', plannedStatus, plannedPatch, dryRun}`.",
            inputSchema: editLibraryEntryInputSchema,
        },
        async (args, extra) =>
            jsonResult(await editEnrichmentTool(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "edit_library_entry",
        {
            description:
                "Admin + band-leader — operator edit of ANY `library_index` row (clearer-named alias for `edit_enrichment`; identical behavior). Use this to set/correct a chart's title, collection (core|supplemental|nava|uploads), key, bpm, leadMusician, or tags on any library entry — the row does NOT need to be in the AI review queue. Sets `enrichmentStatus: 'human_curated'`, stamps reviewedAt/reviewedBy, and `humanRenamedAt` on a title change. v11.5-01-03 (H9): band leaders may edit tags/title/key/bpm/leadMusician on rows in THEIR OWN tenant (a row in another org returns row_not_found) but cannot change `collection` (admin-only, returns forbidden_field); admins are unscoped. For a key/bpm-only fix, update_song also works. F-05 contract: `dryRun: true` (default) returns `plannedPatch` without writing; real run needs `dryRun: false, force: true`. Returns `{ok: true, rowId, status: 'human_curated', plannedStatus, plannedPatch, dryRun}`.",
            inputSchema: editLibraryEntryInputSchema,
        },
        async (args, extra) =>
            jsonResult(await editEnrichmentTool(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "retry_enrichment",
        {
            description:
                "Admin-only — re-enqueue a `failed` enrichment or `chartImportQueue` row (cycle-3 a5). Calls a4's shared `retryFailed` helper. `kind: 'enrichment'` (default) rewinds the `aiEnrichmentRetryQueue/{rowId}` doc to `attempts: 0, nextRetryAt: now`, clears `lastError`/`exhaustedAt`, and flips the library_index status back to `'pending'` so the next 30-min `/api/cron/ai-enrich-retry` tick re-runs enrichment. `kind: 'import'` deletes the `chartImportQueue/{driveFileId}` doc so the next 5-min `/api/cron/drive-sync` tick re-imports the file fresh from David's Drop folder. F-05 contract: `dryRun: true` (default) checks the queue doc exists + returns `plannedStatus` without writing. Real-run without `force: true` refuses with the rich `force_required` envelope (REG-003). `queue_doc_missing` rich envelope when the row already drained. Returns `{ok: true, rowId, status, plannedStatus, plannedPatch:{kind}, dryRun}`.",
            inputSchema: {
                rowId: z
                    .string()
                    .min(1)
                    .describe(
                        "For kind='enrichment', the library_index id (matches aiEnrichmentRetryQueue doc). For kind='import', the driveFileId (chartImportQueue id).",
                    ),
                kind: z
                    .enum(["enrichment", "import"])
                    .optional()
                    .describe(
                        "Which queue to re-enqueue. 'enrichment' (default) rewinds the AI retry doc. 'import' deletes the chartImportQueue doc so the Drive cron re-imports.",
                    ),
                dryRun: z.boolean().optional(),
                force: z.boolean().optional(),
            },
        },
        async (args, extra) =>
            jsonResult(await retryEnrichmentTool(uidFrom(extra), args)),
    )

    server.registerTool(
        "dismiss_failure",
        {
            description:
                "Admin-only — mark a `failed` enrichment or `chartImportQueue` row as handled without re-trying (cycle-3 a5). Calls a4's shared `dismissFailed` helper. `kind: 'enrichment'` flips library_index `enrichmentStatus` to `'human_rejected'`, stamps reviewedAt/reviewedBy, and deletes the `aiEnrichmentRetryQueue/{rowId}` doc so cron stops re-firing. `kind: 'import'` sets `dismissed: true` on the `chartImportQueue/{driveFileId}` doc — this is the dismissed-until-next-failure semantic; the next failure overwrite from the poller resets the flag so the row re-surfaces if the underlying problem recurs. F-05 contract: `dryRun: true` (default) checks the row/queue doc exists + returns `plannedStatus` without writing. Real-run without `force: true` refuses. Returns `{ok: true, rowId, status, plannedStatus, plannedPatch:{kind}, dryRun}`.",
            inputSchema: {
                rowId: z
                    .string()
                    .min(1)
                    .describe(
                        "For kind='enrichment', the library_index id. For kind='import', the driveFileId.",
                    ),
                kind: z
                    .enum(["enrichment", "import"])
                    .describe(
                        "Which queue the row lives on. 'enrichment' touches library_index + aiEnrichmentRetryQueue. 'import' touches chartImportQueue only.",
                    ),
                dryRun: z.boolean().optional(),
                force: z.boolean().optional(),
            },
        },
        async (args, extra) =>
            jsonResult(await dismissFailureTool(uidFrom(extra), args)),
    )

    server.registerTool(
        "__test_delete_storage_object",
        {
            description:
                "Cycle-N cowork instrumentation only. Admin-only synthetic Storage-only delete used to construct the 'Drive 200 + Storage 404 → health: needs_storage_sync' scenario cycle-4 §7.B.1 needs to test substantively. Refuses unless ALL conditions hold: (1) fileId matches `upload-<uuid>` (no Drive ids, no other synthetic id prefixes); (2) library_index/{fileId} exists; (3) library_index/{fileId}.isTest === true (SEC-004 stamp on test-fixture-owned rows). On success: deletes ONLY the Storage object at the resolved canonical path; library_index row + any Drive ref are UNTOUCHED (the row keeps claiming the fileId so subsequent verify_setlist_charts / get_chart_status reads observe the asymmetric state). Do NOT call from prod workflows. Rich envelope on every refusal: forbidden_role / invalid_argument / row_not_found / not_test_row / storage_delete_failed. No dryRun — operator intent is explicit; F-05 contract does not apply to destructive instrumentation.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "Storage fileId to delete. Must match the upload-<uuid> pattern (the tool refuses Drive ids by design).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await testDeleteStorageObject(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_correction_stats",
        {
            description:
                "Admin-only — read the latest aggregated `/manage/library-review` correction signals (cycle-3 c3). Returns deterministic 6-axis counters captured at every accept/reject/edit/retry/dismiss action: `totalSignals`, `actionDistribution` (count per action), `confidenceDistributionByAction` (count + mean + p50 + p90 per action — answers 'do high-confidence rows get accepted more?'), `collectionMismatchAcceptanceRate` (when AI flagged collection_disagrees_with_folder, what fraction did the human accept?), `editFieldFrequency` (which fields get edited most — title vs key vs bpm vs tags vs leadMusician), `rejectionTriggerAttribution` (which review trigger fired on rejected rows — low_confidence vs collection_disagrees_with_folder vs is_chart_false vs duplicate_candidates vs review_required). Default (no args) returns the latest cron-aggregated snapshot from `aiCorrectionStats/latest` (refreshed every 6h); if the cron hasn't populated it yet, computes inline + sets `snapshotMissing: true` so callers always see a concrete shape. Pass ISO-8601 `since` / `until` for a windowed on-demand aggregation. Read-only, no writes. Observation infrastructure only — a future c4-class auto-tuner reads this same shape to deterministically propose threshold adjustments (out of c3 scope). Returns `{ok: true, onDemand: boolean, snapshotMissing?, totalSignals, actionDistribution, confidenceDistributionByAction, collectionMismatchAcceptanceRate, editFieldFrequency, rejectionTriggerAttribution, computedAt, since, until, truncated}`.",
            inputSchema: {
                since: z
                    .string()
                    .optional()
                    .describe(
                        "ISO-8601 UTC lower bound (inclusive), e.g. '2026-05-01T00:00:00Z'. Omit to read the latest cron snapshot.",
                    ),
                until: z
                    .string()
                    .optional()
                    .describe(
                        "ISO-8601 UTC upper bound (exclusive), e.g. '2026-06-01T00:00:00Z'. Omit to scan up to 'now'.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getCorrectionStats(uidFrom(extra), args)),
    )
}

/**
 * Monitor-control tools. The /monitor route's WebSocket-style mix surface
 * exposed via MCP so an AI agent can adjust faders, mutes, and bus masters
 * on the user's behalf ("turn up my guitar, mute the vocalists"). Commands
 * append to monitor-live/commands/pending — the same path the iPad UI uses —
 * so the hardware bridge propagation is unchanged.
 *
 * Auth mirrors useMonitorAccess: admin, sound engineer, or someone with at
 * least one assigned bus may use the read tools and adjust THEIR OWN bus.
 * Touching another user's bus, the bus master of another bus, or matrix
 * outputs requires admin or the soundEngineer flag.
 */
export function registerMonitorTools(server: McpServer): void {
    server.registerTool(
        "list_monitor_buses",
        {
            description:
                "List the personal-IEM monitor buses, their assignments, the hardware bridge status, and (for admins/sound engineers) the X32 matrix outputs. Always call this first to discover bus and channel indexes before adjusting faders. Response includes `bridge.clients` — the number of WebSocket-attached clients currently connected to the bridge daemon (iPads on /monitor). MCP API callers (this session) go through the HTTP path and are NOT counted in this number; 0 here doesn't mean the bridge is unused, just that no iPads are open. `bridge.x32Connected` is an optimistic hint from the daemon; treat it as best-effort, not a guarantee the X32 hardware applied a write. Each bus carries `active` — true when the bus is configured/in use (has a name OR fader>0 OR any send on); false marks a never-set-up bus, so you can tell a deliberately pulled-down-but-named bus apart from an unused one. `bridge.stateStale` + `bridge.stateAgeSeconds` report whether the live mixer snapshot is fresh: the snapshot (monitor-live/state, where the fader/mute values come from) can FREEZE while `bridge.status`/`bridge.x32Connected` still read green — if `bridge.stateStale` is true the mixer values are NOT live and writes should not be assumed to apply.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await listMonitorBuses(uidFrom(extra))),
    )

    server.registerTool(
        "get_mix",
        {
            description:
                "Get the current fader, mute, and channel names for one monitor bus. Omit busIndex to default to the caller's first assigned bus — useful for 'show me my mix'. Channel names come from the live X32 state; use them to map a request like 'turn up my guitar' to a channelIndex. Each send carries BOTH `on` (true = unmuted) and `muted` (= !on); pass `muted` straight to set_send_mute without inverting. The response carries `bridge.stateStale` + `bridge.stateAgeSeconds`: if `stateStale` is true the fader/mute values here are NOT live — the bridge stopped refreshing monitor-live/state even though `bridge.status`/`bridge.x32Connected` may read green — so do not trust the values or assume a subsequent write applies.",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .optional()
                    .describe(
                        "Bus index 1-5 from list_monitor_buses (1-based); omit to use the caller's first assigned bus",
                    ),
            },
        },
        async (args, extra) => jsonResult(await getMix(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_matrix",
        {
            description:
                "Read the current X32 matrix output state (fader + mute per matrix). Restricted to admins and sound engineers — matrices feed the FOH PA. Omit matrixIndex to return all matrices; pass 1–6 for a single matrix. Use this before set_matrix_fader / set_matrix_mute to capture the pre-write value so you can restore on revert. Each matrix carries BOTH `on` (true = unmuted) and `muted` (= !on); pass `muted` straight to set_matrix_mute without inverting. The response carries `bridge.stateStale` + `bridge.stateAgeSeconds`: if `stateStale` is true the matrix fader/mute values are NOT live — the bridge stopped refreshing monitor-live/state even though `bridge.status`/`bridge.x32Connected` may read green.",
            inputSchema: {
                matrixIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(6)
                    .optional()
                    .describe("Matrix output index 1–6; omit for all"),
            },
        },
        async (args, extra) =>
            jsonResult(await getMatrix(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_send_level",
        {
            description:
                "Set the fader level for one channel in one monitor bus. level is a normalized fader position in [0.0, 1.0] — NOT dB. To 'turn up by a bit', read get_mix first and write level + ~0.05–0.1. Musicians may only adjust buses assigned to them; admins/sound engineers may adjust any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee. On success the response carries `confidence:\"queued\"` — the command was accepted into the bridge queue for send, NOT confirmed applied on the X32 (the app side cannot read an OSC ack).",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe("Bus index 1-5 (1-based, from list_monitor_buses)"),
                channelIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(32)
                    .describe(
                        "Channel index 1-32 (X32 input bank; from get_mix sends list)",
                    ),
                level: z
                    .number()
                    .min(0)
                    .max(1)
                    .describe("Normalized fader position 0.0 (off) to 1.0 (max)"),
            },
        },
        async (args, extra) =>
            jsonResult(await setSendLevel(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_send_mute",
        {
            description:
                "Mute or unmute one channel in one monitor bus. muted=true silences the channel for that bus; muted=false unmutes. Affects only the bus, not the channel globally. Musicians may only mute on their own bus; admins/sound engineers may mute on any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee. On success the response carries `confidence:\"queued\"` — the command was accepted into the bridge queue for send, NOT confirmed applied on the X32 (the app side cannot read an OSC ack).",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe("Bus index 1-5 (1-based, from list_monitor_buses)"),
                channelIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(32)
                    .describe("Channel index 1-32 (X32 input bank)"),
                muted: z.boolean().describe("true = muted; false = unmuted"),
            },
        },
        async (args, extra) =>
            jsonResult(await setSendMute(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_bus_fader",
        {
            description:
                "Set the bus master level — the overall in-ear volume for that monitor bus. Use when the user says 'turn up my whole mix' or 'I need more volume in my ears'. Musicians may only adjust their own bus; admins/sound engineers may adjust any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee. On success the response carries `confidence:\"queued\"` — the command was accepted into the bridge queue for send, NOT confirmed applied on the X32 (the app side cannot read an OSC ack).",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe("Bus index 1-5 (1-based, from list_monitor_buses)"),
                level: z
                    .number()
                    .min(0)
                    .max(1)
                    .describe("Normalized fader position 0.0 to 1.0"),
            },
        },
        async (args, extra) =>
            jsonResult(await setBusFader(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_matrix_fader",
        {
            description:
                "Set the level of an X32 matrix output (mains, side-fills, sub-mix, etc). Restricted to admins and sound engineers — these outputs feed the FOH PA, not personal mixes. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_matrix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee. On success the response carries `confidence:\"queued\"` — the command was accepted into the bridge queue for send, NOT confirmed applied on the X32 (the app side cannot read an OSC ack).",
            inputSchema: {
                matrixIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(6)
                    .describe("Matrix output index 1–6"),
                level: z.number().min(0).max(1).describe("Normalized fader position 0.0 to 1.0"),
            },
        },
        async (args, extra) =>
            jsonResult(await setMatrixFader(uidFrom(extra), args)),
    )

    server.registerTool(
        "set_matrix_mute",
        {
            description:
                "Mute or unmute one X32 matrix output. Restricted to admins and sound engineers. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_matrix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee. On success the response carries `confidence:\"queued\"` — the command was accepted into the bridge queue for send, NOT confirmed applied on the X32 (the app side cannot read an OSC ack).",
            inputSchema: {
                matrixIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(6)
                    .describe("Matrix output index 1–6"),
                muted: z.boolean().describe("true = muted; false = unmuted"),
            },
        },
        async (args, extra) =>
            jsonResult(await setMatrixMute(uidFrom(extra), args)),
    )

    // ─── Phase 2 (P2-B) — observability + bus-assignment ─────────────────

    server.registerTool(
        "get_command_status",
        {
            description:
                "Check the result of a monitor command you issued (set_bus_fader / set_send_level / set_send_mute / set_matrix_fader / set_matrix_mute). Those write tools are fire-and-forget and return `confidence:\"queued\"` — they do NOT tell you whether the X32 actually applied the change. Pass the `commandId` they returned to read the bridge's confirmation: `status` is 'applied' (the desk confirmed the value), 'rejected' (the bridge refused it), 'timeout' (the desk never confirmed), 'pending' (no confirmation yet — the bridge hasn't reported), or 'unknown' (a result exists but in an unrecognized shape). When the bridge confirmed a value it rides on `confirmedValue`; rejections/timeouts carry a `reason`; `at` is the ISO time of the ack; `found` is whether a result record existed. Same access as the other monitor read tools (admin, sound engineer, or anyone with an assigned bus). The bridge ack-writer is LIVE (shipped in the v10.0.3 bridge release), so a real `applied`/`rejected`/`timeout` ack normally appears within a couple of seconds; `status:'pending', found:false` means the bridge hasn't reported yet (or is offline — check get_bridge_health). Acks are TTL-swept after ~5 minutes, so read the status soon after issuing the command.",
            inputSchema: {
                commandId: z
                    .string()
                    .min(1)
                    .describe(
                        "The commandId returned by a monitor write tool (set_bus_fader, set_send_level, set_send_mute, set_matrix_fader, set_matrix_mute).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getCommandStatus(uidFrom(extra), args)),
    )

    server.registerTool(
        "assign_monitor_bus",
        {
            description:
                "Assign a band member to a personal-IEM monitor bus so they can control their own in-ear mix (on /monitor and via the monitor MCP tools). Admin / band_leader only. busIndex is 1-5; uid is the member's user id (discover via list_musicians). The member's display name is denormalized onto the bus automatically. Co-ownership is supported — several members can share one bus (e.g. a shared wedge). Idempotent: re-assigning someone already on the bus is a no-op (`changed:false`), except to refresh a changed display name. Unlike assign_musician this fires NO email/SMS/push and is trivially reversible (unassign_monitor_bus), so `dryRun` defaults to FALSE — the call commits by default; pass `dryRun:true` to preview the plan (resolved name, resulting bus roster, alreadyAssigned) without writing. Returns `{ok, busIndex, uid, userName, assignedTo, alreadyAssigned, changed, configuredBus, dryRun, committed, warning?}`. `warning` appears when the bus is valid (1-5) but not yet in config.monitorBuses.",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe("Monitor bus index 1-5 to assign the user to."),
                uid: z
                    .string()
                    .min(1)
                    .describe(
                        "User id of the band member to assign — discover via list_musicians.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true, return the plan without writing. Defaults to FALSE (commit) — bus assignment has no notification side-effects and is reversible.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await assignMonitorBus(uidFrom(extra), args)),
    )

    server.registerTool(
        "unassign_monitor_bus",
        {
            description:
                "Remove a band member from a personal-IEM monitor bus (revokes their control of that bus's mix). Admin / band_leader only. busIndex is 1-5; uid is the member to remove. The member is NOT existence-checked, so you can clean up an assignment for a deleted user. Idempotent: removing someone who isn't on the bus is a safe no-op (`changed:false`). `dryRun` defaults to FALSE (commit); pass `dryRun:true` to preview. When the last user is removed the bus slot is cleared. Returns `{ok, busIndex, uid, assignedTo, previouslyAssigned, changed, dryRun, committed}`.",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .describe("Monitor bus index 1-5 to remove the user from."),
                uid: z
                    .string()
                    .min(1)
                    .describe(
                        "User id of the band member to remove — see list_monitor_buses for who's currently assigned.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true, return the plan without writing. Defaults to FALSE (commit).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await unassignMonitorBus(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_bridge_health",
        {
            description:
                "Probe the X32 monitor bridge's health remotely (admin / band_leader). One call returns a DERIVED `alive` verdict computed from how long ago the bridge last checked in — because the raw `status`/`x32Connected` fields are last-write-wins with NO expiry and keep reading \"online\"/true for hours after the bridge has actually died. Use this (not the raw fields) to know whether the bridge is up. Returns `{alive, lastSeenAgeS, stateAgeS, stateStale, leaseExpired, status, x32Connected, socketAlive, unconfirmedCount, queueDepth, version, clients, uptimeMs, errCount, lastError, summary}`. `alive` = last heartbeat within ~2 minutes; `stateStale` = the live mixer-values snapshot is older than ~90s (values not current); `socketAlive`/`unconfirmedCount`/`queueDepth`/`uptimeMs`/`errCount`/`lastError` are the v10.0.4 diagnostics (null against an older bridge) that split socket-dead from state-wedged and surface the most recent error. `summary` is a one-line human verdict.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await getBridgeHealth(uidFrom(extra))),
    )

    // v10.0.5 item 3 — bridge-recovery wrappers. Each writes one row of
    // config/monitor.bridgeControl (action + server-minted nonce + serverTimestamp
    // requestedAt + requestedBy). The bridge's existing dispatcher picks it up on
    // the next snapshot. Trusted-leader for the safe ops; admin-only for restart.
    server.registerTool(
        "bridge_resync",
        {
            description:
                "Tell the X32 monitor bridge to re-read the desk and re-publish state without dropping the socket — non-disruptive recovery for when monitor-live/state has wedged but the bridge itself is alive. Trusted-leader (admin / band_leader). Server-mints the dedup nonce + requestedAt so the bridge's nonce-dedup + cross-process stale-request guards apply automatically. Returns `{ok:true, action:'resync', nonce, note}`; verify outcome with get_bridge_health (stateAgeS should drop within a few seconds).",
            inputSchema: {},
        },
        async (_args, extra) => jsonResult(await bridgeResync(uidFrom(extra))),
    )

    server.registerTool(
        "bridge_reconnect",
        {
            description:
                "Tell the X32 monitor bridge to drop and re-establish the X32 socket — recovers a wedged socket where x32Connected reads true but no commands apply. Trusted-leader (admin / band_leader). Brief gap (~1s) where fader writes won't land; existing fader values stay on the desk. Server-mints nonce + requestedAt. Returns `{ok:true, action:'reconnect', nonce, note}`; verify with get_bridge_health.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await bridgeReconnect(uidFrom(extra))),
    )

    server.registerTool(
        "bridge_selftest",
        {
            description:
                "Ask the X32 monitor bridge to write a fresh diagnostic snapshot to monitor-live/selftest — captures socketAlive, queueDepth, unconfirmedCount, uptimeMs, errCount, lastError without affecting the desk. Trusted-leader (admin / band_leader). Non-disruptive. Server-mints nonce + requestedAt. Returns `{ok:true, action:'selftest', nonce, note}`; read monitor-live/selftest to see the result.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await bridgeSelftest(uidFrom(extra))),
    )

    server.registerTool(
        "bridge_restart",
        {
            description:
                "Relaunch the X32 monitor bridge process (Electron app.relaunch + exit) — last-resort recovery when resync / reconnect haven't unwedged the bridge. ADMIN ONLY (band_leader cannot call this) — restart causes a brief monitor outage (~3–8s) and is the most disruptive recovery action. Server-mints nonce + requestedAt so the bridge's cross-process boot-loop guards (item 1 of v10.0.5) catch any post-restart re-fire. Returns `{ok:true, action:'restart', nonce, note}`; verify alive via get_bridge_health after a few seconds.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await bridgeRestart(uidFrom(extra))),
    )

    // FINDINGS §4 Lane #7 — bridge housekeeping. Three admin-only ops on the
    // bridge's transient Firestore surface (ack receipts, pending-command queue,
    // ring-buffer log). Cleanup + remote forensics without firing Firebase MCP.
    server.registerTool(
        "bridge_clear_acks",
        {
            description:
                "Sweep the monitor-live/commands/acks subcollection — the bridge already TTL-sweeps acks at 5-minute intervals (ack-writer.ts), but if it stalls and acks pile up, this is the manual flush. ADMIN ONLY (housekeeping op on a shared singleton). Batched-delete in pages of 250 to stay under Firestore's 500-op batch cap. Returns `{ok:true, action:'clear_acks', cleared:<n>}` — `cleared:0` means nothing was queued (no-op, idempotent).",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await bridgeClearAcks(uidFrom(extra))),
    )

    server.registerTool(
        "bridge_clear_pending_commands",
        {
            description:
                "Sweep the monitor-live/commands/pending subcollection — the manual-flush complement to the bridge's automatic STANDBY drop (bridge-standby-ack-cleanup `b5583eb90`). Use when the queue wedged with nobody to drain it (active bridge crashed mid-burst OR writes landed while no bridge was alive). Each deleted pending doc loses its chance to apply to the X32 — there is NO compensating ack-write here (use sparingly; usually bridge_resync recovers first). ADMIN ONLY. Batched-delete in pages of 250. Returns `{ok:true, action:'clear_pending_commands', cleared:<n>}`.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await bridgeClearPendingCommands(uidFrom(extra))),
    )

    server.registerTool(
        "bridge_get_log",
        {
            description:
                "Read the bridge's ring-buffer log doc (monitor-live/bridgeLog, capped at 50 entries by remote-log.ts) without a Firebase MCP round-trip — gives an admin the recent error/warn lines + running errCount + most-recent lastError in one call. ADMIN ONLY. Startup-noise (`[DEPnnnn]`, `entering STANDBY`) is filtered out of errCount/lastError by the bridge's ingest (v10.0.5 item 2) but the raw entries are preserved in the ring for forensics. Returns `{ok:true, entries:[{level,msg,ts}...], errCount, lastError, bridgeVersion}`; `entries:[]` + `errCount:0` when the doc doesn't exist yet (cold bridge, nothing logged).",
            inputSchema: {},
        },
        async (_args, extra) => jsonResult(await bridgeGetLog(uidFrom(extra))),
    )
}

/**
 * Chart-ingestion tools. Three ways to add a chart to the library, all
 * sharing the same server-side codepath as the HTTP routes — no parallel
 * pipelines that could drift on dedup/conversion/indexing.
 *
 *  - upload_chart            — direct file upload (PDF / image / MusicXML / MuseScore / text).
 *  - scrape_chart_from_url   — Gemini-extract chord chart from a URL or raw text.
 *  - save_scraped_chart      — save scraped text content into the library.
 *
 * Collection-aware: callers pick 'core' | 'supplemental' | 'nava' | 'uploads' just
 * like the in-app UploadDialog. Per-user rate limits keyed on the bearer-
 * token uid (not Claude's egress IP).
 */
const collectionSchema = z
    .enum(["core", "supplemental", "uploads", "nava"])
    .optional()
    .describe(
        "Which library section to file the chart under. 'uploads' is the user-uploaded section (default). 'core' is the main CRC catalog — admins and band leaders may write to it. 'supplemental' is the Shireinu songbook and 'nava' is the Nava Tehila corpus — admins and band leaders may write to both. Musicians and canUpload-only callers should leave this unset or pass 'uploads'. NOTE: deleting from 'core', 'supplemental' or 'nava' still requires admin (delete_chart).",
    )

export function registerChartUploadTools(server: McpServer): void {
    server.registerTool(
        "upload_chart",
        {
            description:
                "Upload a chart file (PDF, image, MusicXML, MuseScore, text) to the library. Send the bytes base64-encoded with a mimeType. Returns the new fileId, which can be passed as songId to add_track_to_setlist to bond the chart onto a setlist row. The same dedup, conversion (MuseScore→MusicXML, HEIC→JPEG), and indexing logic as the in-app upload runs.",
            inputSchema: {
                title: z
                    .string()
                    .min(1)
                    .describe("Display title for the chart (will dedup against existing library entries)"),
                fileBase64: z
                    .string()
                    .min(1)
                    .describe(
                        "File bytes encoded as base64. Max 25 MB after decoding.",
                    ),
                mimeType: z
                    .string()
                    .min(1)
                    .describe(
                        "MIME type, e.g. 'application/pdf', 'image/png', 'application/vnd.recordare.musicxml+xml', 'application/x-musescore', 'text/plain'.",
                    ),
                fileName: z
                    .string()
                    .optional()
                    .describe(
                        "Optional original filename including extension. Derived from title + mimeType if omitted.",
                    ),
                collection: collectionSchema,
                key: z
                    .string()
                    .optional()
                    .describe("Optional musical key (e.g. 'G' or 'Am')"),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Optional tempo in BPM"),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Optional list of tags"),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when uploading a legitimate variant (different key, arrangement, or composer suffix) that's tripping a 'similar name' error. Default false.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await uploadChart(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "import_chart_from_drive",
        {
            description:
                "Import a chart into the library directly from a Google Drive file id — no base64 round-trip. PREFER THIS over upload_chart when the user already has the file in Drive (linked in a message, viewing it in Drive, or referencing a Drive URL): the MCP request body stays tiny (just the id), which sidesteps the upload payload limits that have caused upload_chart to hang. The same dedup, conversion (MuseScore→MusicXML, HEIC→JPEG), and indexing logic runs as upload_chart. Google Docs/Sheets/Slides AND uploaded Word/Excel/PowerPoint files (.docx/.xlsx/.pptx) are converted to PDF server-side automatically — just pass the id, no manual export needed. Only folders and unsupported binary types are rejected. The Drive id is the segment after /file/d/ in a Drive URL (e.g. 1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS). Title defaults to the Drive file name minus extension; pass `title` to override.",
            inputSchema: {
                driveFileId: z
                    .string()
                    .min(1)
                    .describe(
                        "Google Drive file id — the segment after /file/d/ in a Drive URL. Service account must have at least viewer access to the file.",
                    ),
                title: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Display title for the chart. Defaults to the Drive file name with its extension stripped.",
                    ),
                collection: collectionSchema,
                key: z
                    .string()
                    .optional()
                    .describe("Optional musical key (e.g. 'G' or 'Am')"),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Optional tempo in BPM"),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Optional list of tags"),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when importing a legitimate variant (different key, arrangement, or composer suffix) that's tripping a 'similar name' error. Default false.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "Cycle-5 C5C-008 F-05 dry-run. When true, runs all auth/curated/rate-limit gates plus Drive metadata + dedup probe but does NOT download bytes or write to Storage/Firestore. Returns { ok:true, wouldCommit:false, predictedTitle, predictedMimeType, predictedCollection, targetStoragePath (with `<new-uuid>` placeholder), dedupScore, dedupMatchedRow, aiEnrichmentPlan }. Per [[feedback_dryrun_is_observability]], dryRun is observability and does NOT require force.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await importChartFromDrive(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "request_chart_upload_url",
        {
            description:
                "Step 1 of the chunked-upload flow for cowork agents (B-001). Returns a signed Firebase Storage PUT URL valid for 10 minutes plus an uploadSessionId. Use this when the chart file is too large for upload_chart's inline base64 surface (anything over ~50 KB hits the agent Read tool's 25K-token limit). After this call: PUT the file bytes to `uploadUrl` (e.g. `curl -X PUT --data-binary @file.pdf -H 'Content-Type: application/pdf' <uploadUrl>`), then call finalize_chart_upload({uploadSessionId}) to run the chart through the normal dedup/conversion/index pipeline. Curated-catalog + role auth + rate-limit semantics match upload_chart.",
            inputSchema: {
                title: z
                    .string()
                    .min(1)
                    .describe("Display title for the chart"),
                mimeType: z
                    .string()
                    .min(1)
                    .describe(
                        "MIME type the agent will PUT (must match the Content-Type header on the upload, e.g. 'application/pdf').",
                    ),
                fileName: z
                    .string()
                    .optional()
                    .describe(
                        "Optional original filename incl. extension. Derived from title + mimeType if omitted.",
                    ),
                collection: collectionSchema,
                key: z
                    .string()
                    .optional()
                    .describe("Optional musical key (e.g. 'G' or 'Am')"),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Optional tempo in BPM"),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Optional list of tags"),
                sizeBytes: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        "Expected size in bytes (advisory; helps the server reject oversize uploads early). Max 25 MB.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await requestChartUploadUrl(uidFrom(extra), args)),
    )

    server.registerTool(
        "finalize_chart_upload",
        {
            description:
                "Step 2 of the chunked-upload flow (B-001). After PUTting bytes to the uploadUrl returned by request_chart_upload_url, call this with the uploadSessionId to run the bytes through processChartUpload (mime validation, MuseScore→MusicXML / HEIC→JPEG conversion, dedup, Storage write, library_index + songs write, library_signals broadcast). Returns the new fileId — bond it onto a setlist row via add_track_to_setlist / bulk_add_tracks. Pass `force: true` to bypass dedup (matches upload_chart's H-3 override). HEAL mode (admin-only): pass `targetFileId` to write the staged bytes onto an EXISTING orphaned library_index id instead of minting a new one — preserves every setlist bond (used by storage-recovery to re-supply pre-atomic-guard orphan bytes). In heal mode there is no dedup or format conversion; the staged mime must be a renderable chart type.",
            inputSchema: {
                uploadSessionId: z
                    .string()
                    .min(1)
                    .describe(
                        "Session id returned by request_chart_upload_url. Sessions are single-use and expire 10 minutes after creation.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when the chart is a legitimate variant that's tripping a 'similar name' error. Ignored in heal mode (targetFileId).",
                    ),
                targetFileId: z
                    .string()
                    .optional()
                    .describe(
                        "HEAL mode (admin-only). Write the staged bytes onto this EXISTING library_index fileId (e.g. an orphaned upload-<uuid> / bare-UUID row), preserving all setlist bonds, instead of creating a new chart. No dedup or conversion is applied; the staged mime must be a renderable chart type (pdf/png/jpeg/musicxml/text).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(
                await finalizeChartUpload(uidFrom(extra), args, orgFrom(extra)),
            ),
    )

    server.registerTool(
        "begin_chunked_chart_upload",
        {
            description:
                "FALLBACK upload path. The PRIMARY agent upload path is import_chart_from_drive — stage the file in the app's Google Drive folder and import it in one call (it also converts Google Docs / .docx / Office formats to PDF server-side). Use this INLINE chunked flow ONLY when Drive staging isn't possible AND the file is too big for upload_chart's inline base64 (>~50 KB hits the 25K-token tool cap) AND you can't PUT to a signed URL — e.g. inside the Cowork sandbox, whose egress proxy 403s storage.googleapis.com so request_chart_upload_url's PUT fails. This ships the bytes THROUGH the MCP tool args: begin returns an uploadSessionId (valid ~60 minutes) + recommended chunk size; then call append_chart_upload_chunk for each ~48 KB slice (chunkIndex 0..N-1), then commit_chunked_chart_upload. Same role / curated-catalog / rate-limit semantics as upload_chart (only begin + commit are metered, not each append).",
            inputSchema: {
                title: z.string().min(1).describe("Display title for the chart"),
                mimeType: z
                    .string()
                    .min(1)
                    .describe(
                        "MIME type of the file being uploaded (e.g. 'application/pdf').",
                    ),
                fileName: z
                    .string()
                    .optional()
                    .describe(
                        "Optional original filename incl. extension. Derived from title + mimeType if omitted.",
                    ),
                collection: collectionSchema,
                key: z
                    .string()
                    .optional()
                    .describe("Optional musical key (e.g. 'G' or 'Am')"),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Optional tempo in BPM"),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Optional list of tags"),
                totalChunks: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        "Optional advisory: total number of chunks you will send. If provided, commit_chunked_chart_upload rejects unless exactly this many contiguous chunks were appended.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await beginChunkedChartUpload(uidFrom(extra), args)),
    )

    server.registerTool(
        "append_chart_upload_chunk",
        {
            description:
                "Step 2 of the inline chunked-upload flow. Send ONE base64-encoded slice of the file. Keep each slice ≤ ~48 KB of binary (~64 KB base64) to stay under the agent's 25K-token tool-result cap; hard per-chunk cap is 256 KB. chunkIndex is 0-based and must be contiguous (0,1,2,…); re-sending the same index overwrites it. Returns receivedChunks + receivedBytes so far. Call commit_chunked_chart_upload once every slice is sent.",
            inputSchema: {
                uploadSessionId: z
                    .string()
                    .min(1)
                    .describe(
                        "Session id from begin_chunked_chart_upload. Expires ~60 minutes after begin.",
                    ),
                chunkIndex: z
                    .number()
                    .int()
                    .min(0)
                    .describe("0-based, contiguous chunk index."),
                dataBase64: z
                    .string()
                    .min(1)
                    .describe(
                        "Standard RFC-4648 base64 of this chunk's raw bytes.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await appendChartUploadChunk(uidFrom(extra), args)),
    )

    server.registerTool(
        "commit_chunked_chart_upload",
        {
            description:
                "Step 3 of the inline chunked-upload flow. Reassembles the appended chunks in index order and runs them through the normal pipeline (mime validation, MuseScore→MusicXML / HEIC→JPEG conversion, dedup, Storage write, library_index + songs write, library_signals broadcast) — identical to finalize_chart_upload. Returns the new fileId; bond it onto a setlist row via add_track_to_setlist / bulk_add_tracks. Pass force:true to bypass dedup (matches upload_chart's H-3 override). Fails with missing_chunk if any index 0..max is absent.",
            inputSchema: {
                uploadSessionId: z
                    .string()
                    .min(1)
                    .describe(
                        "Session id from begin_chunked_chart_upload. Single-use; expires ~60 minutes after begin.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when the chart is a legitimate variant tripping a 'similar name' error.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(
                await commitChunkedChartUpload(
                    uidFrom(extra),
                    args,
                    orgFrom(extra),
                ),
            ),
    )

    server.registerTool(
        "scrape_chart_from_url",
        {
            description:
                "Extract a chord chart from a public webpage URL (or raw HTML/text). Uses Gemini to identify the song title, artist, and lyrics+chords with their monospaced alignment preserved. Falls back to Google Search extraction if the page is Cloudflare-blocked. Returns {title, artist, content} — pipe the result into save_scraped_chart to commit it to the library.",
            inputSchema: {
                url: z
                    .string()
                    .url()
                    .optional()
                    .describe(
                        "URL of a page containing a chord chart, e.g. Ultimate Guitar",
                    ),
                rawText: z
                    .string()
                    .optional()
                    .describe(
                        "Raw HTML or text to extract from instead of a URL",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await scrapeChartFromUrl(uidFrom(extra), args)),
    )

    server.registerTool(
        "save_scraped_chart",
        {
            description:
                "Save a chord chart's extracted text content into the library as a .txt entry. Use after scrape_chart_from_url (or with content the user pasted). Mirrors the in-app ScraperModal save path — the chart becomes immediately searchable, bondable to setlist tracks via add_track_to_setlist({songId: returned-fileId}), and visible in the library list under the chosen collection. Accepts optional key / bpm / leadMusician (parity with upload_chart) so you don't need a base64 detour just to set them — they're written to BOTH the songs catalog AND the library index so a bonded row picks them up.",
            inputSchema: {
                title: z.string().min(1).describe("Chart title"),
                content: z
                    .string()
                    .min(1)
                    .describe(
                        "Chord chart body — keep monospaced alignment of chord lines over lyric lines",
                    ),
                artist: z
                    .string()
                    .optional()
                    .describe("Optional artist name, prepended to the saved file"),
                collection: collectionSchema,
                key: z
                    .string()
                    .optional()
                    .describe("Optional musical key (e.g. 'Em' or 'G')"),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Optional tempo in BPM"),
                leadMusician: z
                    .string()
                    .optional()
                    .describe("Optional Vocal Lead for this chart"),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when saving a legitimate variant that's tripping a 'similar name' error. Default false.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await saveScrapedChart(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "update_song",
        {
            description:
                "Fix a library entry's musical key or BPM without going through admin-only enrichment (cowork #5). Use when the catalog has a wrong/missing key or bpm — e.g. a chart saved with no key so bonded rows pull `key: null`. Admins, band leaders, AND musicians (the same accounts that may add charts) can call this; it is NOT admin-only like edit_enrichment. Writes BOTH the songs catalog (`defaults.key`/`defaults.bpm` — read by get_song / search_library and by bond resolution when you add the song to a setlist) AND the library_index row (read by list_library and the in-app catalog), so the fix shows up everywhere. Pass at least one of key/bpm. Idempotent. dryRun:true returns the before/after plan without writing (observability) — no `force` needed for the real write since this is a single-row, non-destructive metadata edit. Returns `{ok, id, dryRun, fieldsChanged, before, after, songWritten, indexWritten}`. To change a chart's collection / title / tags as well, use the admin-only edit_enrichment / edit_library_entry.",
            inputSchema: {
                id: z
                    .string()
                    .min(1)
                    .describe(
                        "Library entry id (the fileId from search_library / list_library — same id used as add_track_to_setlist's songId).",
                    ),
                key: z
                    .string()
                    .optional()
                    .describe("New musical key (e.g. 'Em' or 'G')."),
                bpm: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("New tempo in BPM (positive integer)."),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true, return the before/after plan without writing. Default false (writes directly — no force gate for this single-row metadata edit).",
                    ),
            },
        },
        async (args, extra) => jsonResult(await updateSong(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "delete_chart",
        {
            description:
                "Delete a chart from the library. Only the chart's uploader or an admin may delete. Deleting from 'core', 'supplemental' or 'nava' (curated catalogs) requires admin. Will REFUSE if any setlist track still references the chart — remove the tracks first via remove_track, then retry. Best-effort Storage cleanup. This action is irreversible.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "Chart fileId (the upload-{uuid} id returned by upload_chart, or another library_index doc id)",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await deleteChart(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "download_chart",
        {
            description:
                "Download one chart's bytes from the library — returns base64-encoded content plus mimeType so Claude Desktop can save or print it. Charts are pulled from Firebase Storage first (fast), with Google Drive fallback for legacy entries. Hard cap at 20 MB per chart; oversized scans get a clear error suggesting re-upload as a compressed version. Use this when the user asks for a specific chart, wants to print one chart, or asks to see the actual notation. For a full setlist as a printable packet, use generate_gig_packet instead.",
            inputSchema: {
                fileId: z
                    .string()
                    .min(1)
                    .describe(
                        "Chart fileId (upload-{uuid} id from upload_chart, or any library_index doc id; same id used as add_track_to_setlist's songId).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await downloadChart(uidFrom(extra), args)),
    )

    server.registerTool(
        "generate_gig_packet",
        {
            description:
                "Assemble a setlist's bonded charts into one merged PDF the band can print — returns a 10-minute Firebase Storage signed download URL (`downloadUrl`, `expiresAt`, `sizeBytes`, `pageCount`, `storagePath`). Inline base64 was retired in cycle-1 F-012: a real Friday packet is 200KB+ which blew past the ~25KB MCP wire/token budget. Iterates tracks in performance order; each bonded row contributes its pages (PDF copied page-by-page; JPEG/PNG embedded as full-page images; scraped text/plain charts rendered as monospaced pages). Charts that can't be embedded (HEIC, MusicXML/MuseScore, missing bytes, unsupported types) appear on a 'Missing Charts' appendix page AND in the response's `missingCharts[]` so the caller knows what to follow up on. Hard 20 MB merged-PDF cap; if exceeded, the tool returns the standardized error envelope (`{ok:false, error:'packet_too_large', message, sizeBytes, maxBytes, hint}`) suggesting sections or individual download_chart calls. Use this when the user wants 'the packet for Friday', 'print the whole setlist', or 'send the band their music for the week'. The download URL expires fast — fetch it promptly or re-call to mint a fresh one.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe(
                        "Setlist id (from list_setlists or create_setlist). Every bonded track on the setlist contributes to the packet, in performance order.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await generateGigPacket(uidFrom(extra), args)),
    )

    server.registerTool(
        "generate_service_sheet",
        {
            description:
                "Render the RABBI's printed service sheet for a setlist — the order of the service, the printed page number in that day's siddur/machzor for each row (from liturgyRef), who leads/performs each moment, and named honors. This is the paper that goes on the shtender for the rabbi to read from; it deliberately omits charts, keys and BPM — use generate_gig_packet instead for the band's charts. Returns a 10-minute Firebase Storage signed download URL (`downloadUrl`, `expiresAt`, `sizeBytes`, `pageCount`, `storagePath`). Works for any setlist: rows with no page reference (no liturgyRef) simply print without a page number, and a setlist with no `book` set still produces a sheet. Use this when the rabbi or an assistant says 'make the service sheet', 'print the order of service', or 'give me the page numbers for Friday'.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe(
                        "Setlist id (from list_setlists or create_setlist). Every row on the setlist appears on the sheet in performance order.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await generateServiceSheet(uidFrom(extra), args)),
    )
}

/**
 * Cycle-3 c1 — roster + scheduling MCP tools. Wraps the existing in-app
 * scheduling system (six HTTP routes + state machine + ranking engine)
 * so Daniel + David can manage rosters, assignments, and "who's playing
 * tonight" via Claude Desktop instead of opening the in-app /schedule
 * page. Read + assignment tools only — no set_unavailability (deferred
 * to c1.5).
 *
 * Auth model:
 *   - Trusted-leader (admin OR band_leader) on every tool except
 *     respond_to_assignment.
 *   - respond_to_assignment is musician-self-write — any authenticated
 *     user may accept/decline their OWN pending assignment. The
 *     own-assignment gate is `assignment.musicianUid === callerUid`.
 *   - assign_musician + unassign_musician default `dryRun: true` and
 *     require `force: true` for real writes (F-05 standing rule — these
 *     trigger email + SMS + push fan-out).
 *   - Trusted-leader rate-limit bypass per
 *     [[feedback_admin_rate_limit_bypass]] on writes.
 */
export function registerRosterTools(server: McpServer): void {
    server.registerTool(
        "list_musicians",
        {
            description:
                "Admin/band_leader only — enumerate every user with a configured `musicianProfile.instrument`. The canonical 'who is in the band' query, returning displayName, role, instrument (slug + label), schedulingTier ('core' | 'regular' | 'guest'), phone, and notification preferences (email/sms/push booleans with sensible defaults: email=true, sms=false, push=true). Optional filters: `instrument` (slug key like 'acoustic_guitar' OR a fragment that matches the preset label/slug like 'guitar') narrows to one instrument; `schedulingTier` narrows to one tier. Sorted alphabetically by displayName. Use this BEFORE assign_musician to find the right uid. Returns `{ok: true, musicians: [...], count}`.",
            inputSchema: {
                instrument: z
                    .string()
                    .optional()
                    .describe(
                        "Filter by instrument slug key ('acoustic_guitar', 'electric_bass', 'voice', etc.) or a substring of the preset label. Loose matching mirrors the in-app /schedule picker.",
                    ),
                schedulingTier: z
                    .enum(["core", "regular", "guest"])
                    .optional()
                    .describe(
                        "Filter by scheduling tier. 'core' = always-invite (auto-confirmed on assign); 'regular' = standard pending; 'guest' = occasional.",
                    ),
                includeProfileless: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include users with NO instrument set (e.g. band leaders who never filled a musicianProfile). Default false (instrument-bearing musicians only). For a full directory search by name/email, prefer find_user.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listMusicians(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "find_user",
        {
            description:
                "Admin/band_leader only — the user DIRECTORY search: resolve a person's uid (and profile row) by email, name fragment, or role. Unlike list_musicians, this returns EVERY user in your org INCLUDING those with no instrument set (band leaders, admins) — use it to find the uid you need BEFORE assign_musician, assign_monitor_bus, or get_musician_profile when you only know someone's name or email. Filters (all optional, combine with AND): `email` (exact, case-insensitive), `nameContains` (case-insensitive substring of displayName), `role` (musician|band_leader|admin), `includeProfileless` (default TRUE — pass false to narrow to instrument-bearing musicians). An empty call returns the whole org directory, sorted by displayName. Tenant-scoped: only your org's users, never the other tenant's. Returns `{ok: true, users: [{uid, displayName, email, role, instrument|null, instrumentLabel|null, schedulingTier, phone, notificationPreferences}], count}`.",
            inputSchema: {
                email: z
                    .string()
                    .optional()
                    .describe(
                        "Exact email match (case-insensitive). Best when you know the person's address.",
                    ),
                nameContains: z
                    .string()
                    .optional()
                    .describe(
                        "Case-insensitive substring of the displayName (e.g. 'lazaroff').",
                    ),
                role: z
                    .enum(["musician", "band_leader", "admin"])
                    .optional()
                    .describe("Narrow to a single role."),
                includeProfileless: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include users with no instrument set. Default TRUE (this is a directory). Pass false to narrow to instrument-bearing musicians only.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await findUser(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "get_musician_profile",
        {
            description:
                "Admin/band_leader only — read one user's musicianProfile by uid. Returns the same shape as list_musicians but for a single user. Use after list_musicians or suggest_musicians to inspect details (phone, notification prefs, full preset label) before assigning. Returns rich `not_found` envelope when the uid has no profile or doesn't exist as a user.",
            inputSchema: {
                uid: z
                    .string()
                    .min(1)
                    .describe(
                        "Firebase user uid. Get from list_musicians, suggest_musicians, or list_pending_assignments.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getMusicianProfile(uidFrom(extra), args)),
    )

    server.registerTool(
        "list_musicians_on_date",
        {
            description:
                "Admin/band_leader only — answer 'who's playing on date X'. Queries setlists whose `eventDate` falls on the given UTC day (optionally narrowed by `templateType` like 'shabbat_morning' or 'friday_night'), then groups every `scheduling_assignments` row for those setlists by status: `pending` (awaiting musician response), `confirmed` (responded yes OR auto-confirmed core musician), `declined` (responded no), `cancelled` (band leader cancelled). Each entry carries `{assignmentId, setlistId, setlistName, musicianUid, musicianName, instrument, status, autoConfirmed}`. Use for the weekly 'who's playing tonight' check. Returns `{ok: true, eventDate, matchedSetlists, grouped:{pending,confirmed,declined,cancelled}, total}`.",
            inputSchema: {
                eventDate: z
                    .string()
                    .min(1)
                    .describe(
                        "Date to query. Accepts YYYY-MM-DD (interpreted as a UTC day) or a full ISO timestamp.",
                    ),
                templateType: z
                    .enum([
                        "shabbat_morning",
                        "friday_night",
                        "rosh_hashanah",
                        "yom_kippur",
                        "festival",
                        "other",
                    ])
                    .optional()
                    .describe(
                        "Narrow to one service template when multiple services share a date (e.g., 'friday_night' for the Erev Shabbat service).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listMusiciansOnDate(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "list_service_personnel",
        {
            description:
                "Admin/band_leader only — unified 'who's playing & leading this week' pivot (cycle-5 C5C-014). Joins `list_musicians_on_date`'s scheduled-band-roster lookup with `get_setlist`'s per-track `leadMusician` vocal-lead read so authors don't need two round trips to answer the weekly-flow question. Accepts EITHER `setlistId` (one specific service) OR `eventDate` (every setlist on the given UTC day). Returns `scheduling_assignments` grouped by status (pending/confirmed/declined/cancelled — same shape as list_musicians_on_date) AND `vocal_leads`: distinct non-null `track.leadMusician` strings across every bonded track on the matched setlists, sorted alphabetically. Returns `{ok: true, setlistId, eventDate, matchedSetlists, scheduling_assignments, vocal_leads, total}`.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Direct setlist lookup. One of `setlistId` or `eventDate` is required.",
                    ),
                eventDate: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "UTC-day window across every setlist on the date. Accepts YYYY-MM-DD or a full ISO timestamp. One of `setlistId` or `eventDate` is required.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listServicePersonnel(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "list_pending_assignments",
        {
            description:
                "Admin/band_leader only — list every `scheduling_assignments` row currently in `status: 'pending'`. Optional `uid` filter narrows to one musician's pending invitations. Use to find the queue of un-responded invites that may need a nudge (or to confirm a swap candidate isn't already pending elsewhere). Sorted by setlistName then musicianName. Returns `{ok: true, assignments: [...], count}`.",
            inputSchema: {
                uid: z
                    .string()
                    .optional()
                    .describe(
                        "Optional musician uid filter — only pending assignments for this musician.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await listPendingAssignments(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "suggest_musicians",
        {
            description:
                "Admin/band_leader only — suggest available replacement musicians for a declined/empty slot on the given setlist. Filters out anyone already actively assigned (pending OR confirmed) to the setlist, then optionally surfaces instrument matches first (the `instrument` argument matches the preset slug like 'acoustic_guitar' OR a label fragment like 'guitar' — loose match parity with the in-app /schedule picker). Sorted by scheduling tier (core > regular > guest), capped at 10 suggestions. Returns `{ok: true, suggestions: [{uid, name, email, instrument, instrumentLabel, schedulingTier, phone, instrumentMatch}]}` — `instrumentMatch` is true/false when an instrument filter was supplied, null otherwise.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe(
                        "Setlist id — defines the 'already assigned' set to exclude.",
                    ),
                instrument: z
                    .string()
                    .optional()
                    .describe(
                        "Optional instrument filter for 'fill THIS slot' searches (slug or label fragment).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await suggestMusicians(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "suggest_band",
        {
            description:
                "Admin/band_leader only — full-band rabbi-aware ranking for the given setlist. Uses the smart suggestion engine (recent play frequency, scheduling tier, instrument coverage gap against the REQUIRED_INSTRUMENTS core set, rabbi musical-role fit). Reads the setlist's `rabbi` field + `config/congregation.scheduling.rabbiProfiles[]` to surface rabbi-specific band-size guidance and avoid double-stacking the rabbi's own instrument. Already-assigned musicians (per `setlist.assignedUids`) drop out of the candidate pool but their instruments count toward coverage. Returns `{ok: true, rabbiGuidance, coverageGap, suggestions: [{uid, name, email, instrumentKey, instrumentLabel, schedulingTier, score, reasons[]}]}` — top 12 ranked.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe(
                        "Setlist id — the rabbi + already-assigned musicians are read from this setlist's fields.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await suggestBand(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "assign_musician",
        {
            description:
                "Admin/band_leader only — assign one musician to a setlist. dryRun-default + force-gated per the F-05 dry-run-is-observability rule: a real run requires `dryRun: false, force: true`. dryRun returns the plan with the projected status ('confirmed' for core musicians who auto-confirm; 'pending' otherwise), the resolved musician profile (denormalized name/email/instrument/tier), and `alreadyAssigned: true` when an active assignment already exists (the real run becomes a no-op in that case — idempotent). Force-run commits the assignment AND triggers the notification cascade (email + SMS + push + in-app), honoring the musician's notification preferences. The musician's instrument defaults to their `musicianProfile.instrument` unless overridden via the `instrument` argument (e.g., booking a multi-instrumentalist on their secondary). Trusted-leader (admin/band_leader) bypasses the per-uid rate limiter — non-trusted callers hit the standard 'api' tier limit. Returns `{ok: true, setlistId, setlistName, musician, projectedStatus, alreadyAssigned, dryRun, committed}`.",
            inputSchema: {
                setlistId: z
                    .string()
                    .min(1)
                    .describe("Setlist id from list_setlists / create_setlist."),
                uid: z
                    .string()
                    .min(1)
                    .describe(
                        "Musician uid — discover via list_musicians or suggest_musicians.",
                    ),
                instrument: z
                    .string()
                    .optional()
                    .describe(
                        "Optional override of the musician's default instrument (slug key or human-readable label). Useful for multi-instrumentalists.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the plan without writing. F-05 standing rule: dryRun does NOT require force.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Omitting it returns the rich `force_required` envelope (REG-003) and no writes. The notification cascade fires on commit — make sure intent is clear before forcing.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await assignMusician(uidFrom(extra), args)),
    )

    server.registerTool(
        "unassign_musician",
        {
            description:
                "Admin/band_leader only — cancel a musician's active assignment on a setlist (flips status `pending|confirmed → cancelled`). Resolves the assignmentId from `(setlistId, uid)` so the agent never has to fetch it first. dryRun-default + force-gated per F-05: a real run requires `dryRun: false, force: true`. dryRun returns the plan with the previous status (null when no active assignment exists — the real run is a safe no-op). Force-run commits the cancellation, removes the musician from `setlists/{id}.musicians[]` + `assignedUids[]` in the same transaction, and fires the cancellation notification cascade (email + SMS + in-app). Cancelling an assignment already in a terminal state (declined or cancelled) returns the rich `validation_error` envelope. Trusted-leader rate-limit bypass applies. Returns `{ok: true, setlistId, uid, assignmentId, previousStatus, dryRun, committed}`.",
            inputSchema: {
                setlistId: z.string().min(1).describe("Setlist id."),
                uid: z
                    .string()
                    .min(1)
                    .describe(
                        "Musician uid — the active assignment for (setlistId, uid) will be cancelled.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the plan without writing. F-05 standing rule.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required for real writes. Pair with `dryRun: false`. Cancellation notifications fire on commit — make sure intent is clear.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await unassignMusician(uidFrom(extra), args)),
    )

    server.registerTool(
        "respond_to_assignment",
        {
            description:
                "Musician-self-write — accept or decline YOUR OWN pending assignment. The own-assignment gate is enforced via `assignment.musicianUid === callerUid` — there is no admin/band_leader role gate, so any authenticated musician can call this for their own invites. Accepting flips the status to 'confirmed'; declining flips to 'declined' and removes the musician from the setlist's denormalized `musicians[]` + `assignedUids[]` in the same transaction. The assigning band leader gets an in-app notification post-commit so they can react. Calling on an assignment in a terminal state (already confirmed/declined/cancelled) returns the rich `validation_error` envelope with `currentStatus`. Calling on someone else's assignment returns `forbidden_assignment`. Returns `{ok: true, assignmentId, status}`.",
            inputSchema: {
                assignmentId: z
                    .string()
                    .min(1)
                    .describe(
                        "Assignment id — discover via list_pending_assignments({uid: yourUid}).",
                    ),
                status: z
                    .enum(["confirmed", "declined"])
                    .describe(
                        "The new status. 'confirmed' accepts the invitation; 'declined' refuses it.",
                    ),
                declineReason: z
                    .string()
                    .optional()
                    .describe(
                        "Optional free-form reason — surfaced to the assigner in the post-commit notification when status='declined'.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await respondToAssignment(uidFrom(extra), args)),
    )
}

/**
 * Cycle-5 C5D-013 — admin-only Firestore sizing probe. Returns a doc-count
 * + UTF-8-encoded byte estimate + oldest/newest `timestamp` for any
 * top-level collection. Pairs with the `webVitalsObservations` 90-day TTL
 * (firestore.indexes.json fieldOverride on `ttlAt`).
 */
export function registerObservabilityTools(server: McpServer): void {
    server.registerTool(
        "dump_collection_size",
        {
            description:
                "Admin-only Firestore sizing probe — returns `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp, truncated}` for any top-level collection. Pass `since` (ISO datetime) to filter on the `timestamp` field for trend probes. `maxDocs` caps the scan (default 50000, hard max 200000); `truncated:true` means the collection has more docs than the cap. The byte estimate is an UPPER bound on wire encoding (JSON.stringify per doc + path overhead), LOWER bound on real Firestore storage — useful for trend-spotting, not authoritative billing.",
            inputSchema: {
                collection: z
                    .string()
                    .min(1)
                    .max(120)
                    .describe(
                        "Top-level collection name. Subcollection paths (`a/b/c`) are not supported.",
                    ),
                since: z
                    .string()
                    .optional()
                    .describe(
                        "ISO 8601 datetime cutoff. When set, only docs with a `timestamp` field >= this value are scanned. Collections without a `timestamp` field return docCount:0.",
                    ),
                maxDocs: z
                    .number()
                    .int()
                    .positive()
                    .max(200_000)
                    .optional()
                    .describe(
                        "Safety cap on docs scanned. Defaults to 50000; max 200000.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await dumpCollectionSize(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_web_vitals_summary",
        {
            description:
                "Admin-only — read-projection over the `webVitalsObservations` field-RUM sink populated by `/api/web-vitals`. Returns p75 LCP / CLS / INP / FCP / TTFB per `surface` (route) across the lookback window, sorted by sample count. Use this to spot Core Web Vitals regressions per route without leaving Claude. Args: `surface?` filters to one route exact-match; `sinceDays?` (default 7, max 90 = sink TTL); `maxDocs?` safety cap on scan (default 20000, hard max 100000); `topRoutes?` cap on routes returned when no surface filter is set (default 5). Returns `{ok:true, sinceDays, since, sampleCount, truncated, routes:[{surface, sampleCount, metrics:{LCP:{p75, sampleCount}, ...}}]}`. p75 is null when a metric has zero samples for that route in-window.",
            inputSchema: {
                surface: z
                    .string()
                    .min(1)
                    .max(200)
                    .optional()
                    .describe(
                        "Exact-match filter on the `surface` field (typically the route path, e.g. '/perform'). Omit to return the top-N routes by sample count.",
                    ),
                sinceDays: z
                    .number()
                    .positive()
                    .max(90)
                    .optional()
                    .describe(
                        "Lookback window in days. Default 7. Max 90 (the field-data sink TTL).",
                    ),
                maxDocs: z
                    .number()
                    .int()
                    .positive()
                    .max(100_000)
                    .optional()
                    .describe(
                        "Safety cap on docs scanned. Default 20000; hard max 100000. `truncated:true` means more observations match than fit under the cap.",
                    ),
                topRoutes: z
                    .number()
                    .int()
                    .positive()
                    .max(50)
                    .optional()
                    .describe(
                        "When no `surface` filter is set, return at most this many routes (sorted by sample count). Default 5.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getWebVitalsSummary(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_ai_spend_summary",
        {
            description:
                "Admin-only — trailing 7-day + 30-day rollup of AI enrichment token spend + estimated USD, read from the `aiSpend` sink (one doc per Gemini enrichment call). Use this to snapshot the AI-cost baseline without leaving Claude. REPORT-ONLY: there is no spend ceiling — Daniel's standing rule is 'AI cost is report, not ceiling'. Args: `maxDocs?` safety cap on docs scanned (default 20000, hard max 100000). Returns `{ok:true, generatedAt, truncated, windows:{last7Days, last30Days}}` where each window is `{sinceDays, since, sampleCount, totalTokens, totalCostUsd, byModel:{<model>:{sampleCount, totalTokens, totalCostUsd}}}`. Cost is an estimate from per-1M-token pricing constants, not billing-grade.",
            inputSchema: {
                maxDocs: z
                    .number()
                    .int()
                    .positive()
                    .max(100_000)
                    .optional()
                    .describe(
                        "Safety cap on aiSpend docs scanned. Default 20000; hard max 100000. `truncated:true` means more docs match the 30-day scan window than fit under the cap.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await getAiSpendSummary(uidFrom(extra), args)),
    )
}
