import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { listSetlists, getSetlist } from "./setlists"
import { searchLibrary, getSong, listLibrary } from "./library"
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
} from "./setlist-write"
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
    uploadChart,
    scrapeChartFromUrl,
    saveScrapedChart,
    deleteChart,
    importChartFromDrive,
} from "./library-upload"
import { downloadChart, generateGigPacket } from "./library-download"
import { publishSetlist } from "./setlist-publish"
import { getChartStatus, verifySetlistCharts } from "./library-verify"
import {
    requestChartUploadUrl,
    finalizeChartUpload,
} from "./library-upload-session"

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
 * Track-patch field surface — common between update_track and
 * bulk_update_tracks. `position` is NOT in this base; it's added back
 * exclusively in updateTrackPatchSchema. bulkTrackPatchSchema instead
 * explicitly rejects `position` with a guidance message (H-2, 2026-05-15
 * stress test): the default Zod strip silently dropped the field and
 * the application layer then complained "patch must include at least
 * one field", which left the operator with no idea position was unsupported.
 */
const trackPatchFields = {
    key: z.string().optional(),
    leadMusician: z.string().optional(),
    title: z.string().optional(),
    notes: z.string().optional(),
    type: z
        .enum(["song", "header", "reading", "prayer", "transition", "note"])
        .optional(),
    songId: z.string().optional(),
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

function jsonResult(data: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
}

export function registerReadTools(server: McpServer): void {
    server.registerTool(
        "list_setlists",
        {
            description:
                "List the user's setlists, newest first. Use when the user asks about their upcoming or recent services/gigs. Dates are ISO strings; trackCount counts every row including section headers. Optional from/to filter by service date. For larger archives, paging via `offset` is supported up to the 200-record fetch cap — past that, slice with `from`/`to` instead.",
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
            },
        },
        async (args, extra) => jsonResult(await listSetlists(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_setlist",
        {
            description:
                "Get one setlist by id, including its tracks in performance order. Use after list_setlists to see what songs are on a specific service.",
            inputSchema: {
                id: z.string().describe("Setlist id"),
            },
        },
        async (args, extra) => {
            const setlist = await getSetlist(uidFrom(extra), args)
            if (!setlist) return jsonResult({ error: "Setlist not found" })
            return jsonResult(setlist)
        },
    )

    server.registerTool(
        "search_library",
        {
            description:
                "Search the song library by title text, with optional musical key and BPM-range filters. Title matching normalizes underscores, hyphens, spaces, and diacritics, so query \"Shalom Rav\" matches catalog entries like \"Shalom_rav\" and \"shalom-rav (camp)\". BPMs are integers. Returns metadata only — never chart files. Pass an empty query (or omit it) to browse the first N library entries — useful for catalog discovery. Rows with `status: 'orphaned'` are hidden by default; pass includeOrphaned: true to see them (e.g. while triaging library hygiene). Every result row carries `status` ('active' by default if the catalog row omits one).",
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
            },
        },
        async (args, extra) => jsonResult(await searchLibrary(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_song",
        {
            description:
                "Get one song's metadata by id — title, key, BPM, vocal lead. Returns metadata only, never chart PDF bytes.",
            inputSchema: {
                id: z.string().describe("Song id"),
            },
        },
        async (args, extra) => {
            const song = await getSong(uidFrom(extra), args)
            if (!song) return jsonResult({ error: "Song not found" })
            return jsonResult(song)
        },
    )

    server.registerTool(
        "list_library",
        {
            description:
                "Browse the chart-file index alphabetically — every chart in the library, with its collection ('core' | 'supplemental' | 'uploads'), mimeType, file size, and upload metadata. Use this when the user wants to SEE the catalog (\"what's in core?\", \"show me every chart I've uploaded\"); use search_library for targeted lookup by title/key/BPM. Optional collection filter narrows to one section. Paged via offset+limit (default limit 50; values above 200 are silently clamped to 200). Returns rows + a total count so the caller can detect whether more pages exist. Default browse hides folders, audio files, and dotfiles like .DS_Store (matches the in-app library). Pass includeNonCharts: true to see the raw library_index. Metadata only — to fetch chart bytes call download_chart, or to print a setlist's packet call generate_gig_packet.",
            inputSchema: {
                collection: z
                    .enum(["core", "supplemental", "uploads"])
                    .optional()
                    .describe(
                        "Library section to browse. 'core' matches the in-app CRC Charts tab (every row that is not 'supplemental' or 'uploads', including legacy rows with no collection field). Omit to list every chart across all collections.",
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
            },
        },
        async (args, extra) =>
            jsonResult(await listLibrary(uidFrom(extra), args)),
    )
}

export function registerWriteTools(server: McpServer): void {
    server.registerTool(
        "create_setlist",
        {
            description:
                "Create a new, empty setlist owned by the user. Use when the user wants to start a new service/gig. Returns the new setlist id, trackCount, and the owner's ownerId + ownerName — follow up with add_track_to_setlist to populate it. eventDate is an ISO date string. Requires an admin or band leader account.",
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
            },
        },
        async (args, extra) => jsonResult(await createSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "update_setlist",
        {
            description:
                "Update a setlist's metadata (name, date, service type, rabbi, notes). Metadata only — does NOT touch tracks; use the track tools for that. Admins and band leaders may update it. Returns the post-update setlist record (name, eventDate, rabbi, serviceType, serviceNotes) so callers can confirm the patch landed without a follow-up get_setlist.",
            inputSchema: {
                id: z.string().describe("Setlist id"),
                name: z.string().min(1).optional().describe("New setlist name"),
                eventDate: eventDateSchema.describe("New ISO event date"),
                serviceType: z.string().optional().describe("New service/template type"),
                rabbi: z.string().optional().describe("New rabbi leading the service"),
                serviceNotes: z.string().optional().describe("Free-text service notes"),
            },
        },
        async (args, extra) => jsonResult(await updateSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "add_track_to_setlist",
        {
            description:
                "Add one row to a setlist. Row types: 'song' (pass songId to pull title/key/vocal-lead from the library AND bond the song's chart so it renders on the row, or pass an explicit title for a free-text row), 'header' (section break with a title), 'reading' (Torah / scripture / D'var / responsive reading — title required), 'prayer' (silent or responsive prayer — title required), 'transition' (instrumental/transition moment), or 'note' (free-text annotation). position is a 0-based insert index; omit it to append at the end. Admins and band leaders may add tracks.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                songId: z
                    .string()
                    .optional()
                    .describe("Library song id — title/key/lead default from this song"),
                title: z
                    .string()
                    .optional()
                    .describe(
                        "Row title — required for header / reading / prayer / transition / note rows, or to override a song's title",
                    ),
                type: z
                    .enum([
                        "song",
                        "header",
                        "reading",
                        "prayer",
                        "transition",
                        "note",
                    ])
                    .optional()
                    .describe(
                        "Row type (default 'song'). 'header' = section break; 'reading' = Torah/scripture/responsive; 'prayer' = silent/responsive prayer; 'transition' = instrumental/transition; 'note' = free-text annotation.",
                    ),
                key: z.string().optional().describe("Musical key for this row"),
                leadMusician: z.string().optional().describe("Vocal Lead for this row"),
                referenceLink: z.string().optional().describe("Reference URL for this row"),
                notes: z.string().optional().describe("Free-text notes for this row"),
                position: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe("0-based insert index; omit to append"),
            },
        },
        async (args, extra) => jsonResult(await addTrackToSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "bulk_add_tracks",
        {
            description:
                "Add many tracks to one setlist in a single call — closes the weekly-flow N+1 ('9 sequential add_track_to_setlist calls'). The `tracks[]` array's order IS the performance order of the new rows. All rows are spliced in starting at `position` (or appended). For per-row positioning of arbitrary rearrangements, use reorder_setlist instead. mode='atomic' (default) wraps everything in one batch — all-or-nothing; mode='best-effort' inserts each row independently and accumulates per-row results. dryRun=true returns the plan without writing. RESPONSE: `committed: boolean` is the load-bearing signal — true iff writes actually landed. Per-row results include `index` (matches the input array), `ok`, `trackId`, `order`, and `error` (when ok=false). Max 50 rows per call. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                tracks: z
                    .array(
                        z.object({
                            songId: z
                                .string()
                                .optional()
                                .describe(
                                    "Library song id — title/key/lead default from this song",
                                ),
                            title: z
                                .string()
                                .optional()
                                .describe(
                                    "Row title — required for non-song rows or to override a song's title",
                                ),
                            type: z
                                .enum([
                                    "song",
                                    "header",
                                    "reading",
                                    "prayer",
                                    "transition",
                                    "note",
                                ])
                                .optional()
                                .describe("Row type (default 'song')"),
                            key: z.string().optional().describe("Musical key"),
                            leadMusician: z
                                .string()
                                .optional()
                                .describe("Vocal Lead"),
                            referenceLink: z
                                .string()
                                .optional()
                                .describe("Reference URL"),
                            notes: z
                                .string()
                                .optional()
                                .describe("Free-text notes"),
                        }),
                    )
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
            jsonResult(await bulkAddSetlistTracks(uidFrom(extra), args)),
    )

    server.registerTool(
        "reorder_setlist",
        {
            description:
                "Reorder a setlist's tracks. orderedTrackIds must list every current track id of the setlist exactly once, in the new performance order. Get the current ids from get_setlist first. Admins and band leaders may reorder.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                orderedTrackIds: z
                    .array(z.string())
                    .describe("All track ids of the setlist, in the new order"),
            },
        },
        async (args, extra) => jsonResult(await reorderSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "remove_track",
        {
            description:
                "Remove one track from a setlist by id. The remaining tracks are re-packed to stay contiguous. Admins and band leaders may remove tracks.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                trackId: z.string().describe("Id of the track to remove"),
            },
        },
        async (args, extra) => jsonResult(await removeSetlistTrack(uidFrom(extra), args)),
    )

    server.registerTool(
        "delete_setlist",
        {
            description:
                "Delete a setlist and all of its tracks. Only the setlist's owner or an admin may delete it. Use with care — this is irreversible and cascades to every track on the setlist.",
            inputSchema: {
                id: z.string().describe("Setlist id"),
            },
        },
        async (args, extra) => jsonResult(await deleteSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "update_track",
        {
            description:
                "Update one track's metadata on a setlist (key, vocal lead, title, notes, type, bonded songId, referenceLink) and optionally move it to a new position. Preserves trackId — unlike remove+add — so external references stay valid. Only fields you pass in `patch` get updated; omitted fields are untouched. Pass `position` to move the row in place (closes the 'must call reorder_setlist with the full ordered id list to move one row' gap). Re-bonding: passing a new `songId` updates `fileId` automatically (the library is keyed by Drive file id). Returns the post-update row. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                trackId: z
                    .string()
                    .describe("Track id (from get_setlist tracks[].id)"),
                patch: updateTrackPatchSchema.describe(
                    "Fields to update + optional `position` for in-place reorder. At least one field (or `position`) must be set. Pass `songId` to re-bond the row to a different library song (fileId follows automatically).",
                ),
            },
        },
        async (args, extra) =>
            jsonResult(await updateSetlistTrack(uidFrom(extra), args)),
    )

    server.registerTool(
        "bulk_update_tracks",
        {
            description:
                "Update many tracks on one setlist in a single call. mode='atomic' (default) wraps every patch in a Firestore transaction — all-or-nothing; mode='best-effort' applies each patch independently and returns per-row results (prefer atomic for >5 rows; best-effort is N round-trips). dryRun=true returns the plan without writing — useful for confirming a large change before committing. Max 50 patches per call (chunk longer lists). RESPONSE: the `committed` boolean is the load-bearing signal — true iff writes actually landed in Firestore. dryRun=true and atomic-mode-with-any-rejected-patch both return `committed: false` (per-row results explain which patch failed and which were rolled back). `updatedAt` in each row's `track` echo is returned as an ISO string. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                patches: z
                    .array(
                        z.object({
                            trackId: z.string(),
                            patch: bulkTrackPatchSchema,
                        }),
                    )
                    .min(1)
                    .max(50)
                    .describe("Per-track patches; max 50. `position` is not allowed here — use update_track for a single move or reorder_setlist for a multi-row reorder."),
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
            jsonResult(await bulkUpdateSetlistTracks(uidFrom(extra), args)),
    )

    server.registerTool(
        "publish_setlist",
        {
            description:
                "Publish a setlist to the band — snapshots song-row state, marks the setlist as published, and fans out notifications across in-app, FCM push, email, and SMS (SMS only on first publish, opt-in users only). Equivalent to clicking the in-app Publish button. Use when the user says \"send the setlist to the band\", \"publish tonight's service\", \"notify everyone\". By default, recipients are every active admin / band_leader / musician account (excluding the publisher); pass `audience: 'all'` to include `member` accounts, or pass an explicit `recipients` array to override entirely. `note` adds a free-text message above the song list in the email; `subject` overrides the email subject. `dryRun: true` returns the would-publish recipient set + snapshot without writing or sending — preview the blast before pulling the trigger. Re-publishing a setlist that was already published refreshes the snapshot + re-fans-out in-app/push/email but skips SMS (cost control). Admins and band leaders only.",
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
                        "Explicit recipient list. If omitted, auto-derives from active band roles. Each entry should have a `uid` (for in-app + push + SMS) and/or `email` (for email).",
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
                        "If true, returns the would-publish recipient list + snapshot + chart-health pre-flight report without writing or sending. Useful to confirm the blast list AND that every bonded chart will render before committing.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass the chart-health pre-flight check. Default: publish refuses if any bonded chart is missing or unreachable (the band would see 404s). Pass force: true to publish anyway — use when you've intentionally left rows with broken bonds (e.g. the band will lead-live those songs).",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await publishSetlist(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_chart_status",
        {
            description:
                "Probe a single chart's health (Storage + Drive fallback) without downloading bytes. Returns { status: 'ok' | 'missing' | 'unreachable' } plus source and mimeType when ok. Use to verify a bond is renderable before bonding it onto a setlist row, or to investigate why a published chart isn't loading for the band. Cheap — metadata-only, no byte transfer.",
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
                "List the personal-IEM monitor buses, their assignments, the hardware bridge status, and (for admins/sound engineers) the X32 matrix outputs. Always call this first to discover bus and channel indexes before adjusting faders. Response includes `bridge.clients` — the number of clients currently connected to the bridge daemon (iPads + this MCP session). `bridge.x32Connected` is an optimistic hint from the daemon; treat it as best-effort, not a guarantee the X32 hardware applied a write.",
            inputSchema: {},
        },
        async (_args, extra) =>
            jsonResult(await listMonitorBuses(uidFrom(extra))),
    )

    server.registerTool(
        "get_mix",
        {
            description:
                "Get the current fader, mute, and channel names for one monitor bus. Omit busIndex to default to the caller's first assigned bus — useful for 'show me my mix'. Channel names come from the live X32 state; use them to map a request like 'turn up my guitar' to a channelIndex.",
            inputSchema: {
                busIndex: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe(
                        "Bus index from list_monitor_buses (1-based); omit to use the caller's first assigned bus",
                    ),
            },
        },
        async (args, extra) => jsonResult(await getMix(uidFrom(extra), args)),
    )

    server.registerTool(
        "get_matrix",
        {
            description:
                "Read the current X32 matrix output state (fader + mute per matrix). Restricted to admins and sound engineers — matrices feed the FOH PA. Omit matrixIndex to return all matrices; pass 1–6 for a single matrix. Use this before set_matrix_fader / set_matrix_mute to capture the pre-write value so you can restore on revert.",
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
                "Set the fader level for one channel in one monitor bus. level is a normalized fader position in [0.0, 1.0] — NOT dB. To 'turn up by a bit', read get_mix first and write level + ~0.05–0.1. Musicians may only adjust buses assigned to them; admins/sound engineers may adjust any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee.",
            inputSchema: {
                busIndex: z.number().int().min(1).describe("Bus index (1-based)"),
                channelIndex: z
                    .number()
                    .int()
                    .min(1)
                    .describe("Channel index 1-based (from get_mix sends list)"),
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
                "Mute or unmute one channel in one monitor bus. muted=true silences the channel for that bus; muted=false unmutes. Affects only the bus, not the channel globally. Musicians may only mute on their own bus; admins/sound engineers may mute on any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee.",
            inputSchema: {
                busIndex: z.number().int().min(1).describe("Bus index (1-based)"),
                channelIndex: z
                    .number()
                    .int()
                    .min(1)
                    .describe("Channel index (1-based)"),
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
                "Set the bus master level — the overall in-ear volume for that monitor bus. Use when the user says 'turn up my whole mix' or 'I need more volume in my ears'. Musicians may only adjust their own bus; admins/sound engineers may adjust any bus. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_mix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee.",
            inputSchema: {
                busIndex: z.number().int().min(1).describe("Bus index (1-based)"),
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
                "Set the level of an X32 matrix output (mains, side-fills, sub-mix, etc). Restricted to admins and sound engineers — these outputs feed the FOH PA, not personal mixes. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_matrix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee.",
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
                "Mute or unmute one X32 matrix output. Restricted to admins and sound engineers. Writes are fire-and-forget: the bridge enqueues the command but cannot guarantee the X32 hardware applied it. Always re-read with get_matrix immediately after writing to confirm propagation. The bridge's x32Connected flag has been observed to be stale-true when the hardware is actually off — treat it as an optimistic hint, not a guarantee.",
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
 * Collection-aware: callers pick 'core' | 'supplemental' | 'uploads' just
 * like the in-app UploadDialog. Per-user rate limits keyed on the bearer-
 * token uid (not Claude's egress IP).
 */
const collectionSchema = z
    .enum(["core", "supplemental", "uploads"])
    .optional()
    .describe(
        "Which library section to file the chart under. 'uploads' is the user-uploaded section (default). 'core' is the main CRC catalog — admins and band leaders may write to it. 'supplemental' is the Shireinu songbook — admins and band leaders may write to it. Musicians and canUpload-only callers should leave this unset or pass 'uploads'. NOTE: deleting from 'core' or 'supplemental' still requires admin (delete_chart).",
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
            jsonResult(await uploadChart(uidFrom(extra), args)),
    )

    server.registerTool(
        "import_chart_from_drive",
        {
            description:
                "Import a chart into the library directly from a Google Drive file id — no base64 round-trip. PREFER THIS over upload_chart when the user already has the file in Drive (linked in a message, viewing it in Drive, or referencing a Drive URL): the MCP request body stays tiny (just the id), which sidesteps the upload payload limits that have caused upload_chart to hang. The same dedup, conversion (MuseScore→MusicXML, HEIC→JPEG), and indexing logic runs as upload_chart. Drive's native doc types (Google Docs / Sheets / Slides) are rejected — export to PDF in Drive first. The Drive id is the segment after /file/d/ in a Drive URL (e.g. 1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS). Title defaults to the Drive file name minus extension; pass `title` to override.",
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
            },
        },
        async (args, extra) =>
            jsonResult(await importChartFromDrive(uidFrom(extra), args)),
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
                "Step 2 of the chunked-upload flow (B-001). After PUTting bytes to the uploadUrl returned by request_chart_upload_url, call this with the uploadSessionId to run the bytes through processChartUpload (mime validation, MuseScore→MusicXML / HEIC→JPEG conversion, dedup, Storage write, library_index + songs write, library_signals broadcast). Returns the new fileId — bond it onto a setlist row via add_track_to_setlist / bulk_add_tracks. Pass `force: true` to bypass dedup (matches upload_chart's H-3 override).",
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
                        "Bypass duplicate detection (exact + fuzzy). Use when the chart is a legitimate variant that's tripping a 'similar name' error.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await finalizeChartUpload(uidFrom(extra), args)),
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
                "Save a chord chart's extracted text content into the library as a .txt entry. Use after scrape_chart_from_url (or with content the user pasted). Mirrors the in-app ScraperModal save path — the chart becomes immediately searchable, bondable to setlist tracks via add_track_to_setlist({songId: returned-fileId}), and visible in the library list under the chosen collection.",
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
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Bypass duplicate detection (exact + fuzzy). Use when saving a legitimate variant that's tripping a 'similar name' error. Default false.",
                    ),
            },
        },
        async (args, extra) =>
            jsonResult(await saveScrapedChart(uidFrom(extra), args)),
    )

    server.registerTool(
        "delete_chart",
        {
            description:
                "Delete a chart from the library. Only the chart's uploader or an admin may delete. Deleting from 'core' or 'supplemental' (curated catalogs) requires admin. Will REFUSE if any setlist track still references the chart — remove the tracks first via remove_track, then retry. Best-effort Storage cleanup. This action is irreversible.",
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
            jsonResult(await deleteChart(uidFrom(extra), args)),
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
                "Assemble a setlist's bonded charts into one merged PDF the band can print — base64-encoded, ready to save or send. Iterates tracks in performance order; each bonded row contributes its pages to the packet (PDF copied page-by-page; JPEG/PNG embedded as full-page images; scraped text/plain charts rendered as monospaced pages). Charts that can't be embedded (HEIC, MusicXML/MuseScore, missing bytes, unsupported types) are listed on a 'Missing Charts' appendix page at the end AND returned in the response's `missingCharts` array so the caller knows what to follow up on. Hard 20 MB output cap; if exceeded, the tool errors with a hint to print sections separately or fetch individual charts via download_chart. Use this when the user wants 'the packet for Friday', 'print the whole setlist', or 'send the band their music for the week'. Without this tool the only path is the in-app gig-packet print flow.",
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
}
