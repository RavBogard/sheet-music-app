import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { listSetlists, getSetlist } from "./setlists"
import { searchLibrary, getSong } from "./library"
import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    reorderSetlist,
    removeSetlistTrack,
    deleteSetlist,
    updateSetlistTrack,
    bulkUpdateSetlistTracks,
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
} from "./library-upload"
import { downloadChart } from "./library-download"

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
                "Search the song library by title text, with optional musical key and BPM-range filters. Use when the user wants to find songs to add to a setlist. BPMs are integers. Returns metadata only — never chart files. Pass an empty query (or omit it) to browse the first N library entries — useful for catalog discovery. Every result row carries `status` ('active' by default if the catalog row omits one).",
            inputSchema: {
                query: z
                    .string()
                    .describe("Title search text — substring match, case-insensitive"),
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

    // CF1 — per-row edit closure. Shared patch schema between the two tools.
    const trackPatchSchema = z.object({
        key: z.string().optional(),
        leadMusician: z.string().optional(),
        title: z.string().optional(),
        notes: z.string().optional(),
        type: z
            .enum(["song", "header", "reading", "prayer", "transition", "note"])
            .optional(),
        songId: z.string().optional(),
        referenceLink: z.string().optional(),
    })

    server.registerTool(
        "update_track",
        {
            description:
                "Update one track's metadata on a setlist (key, vocal lead, title, notes, type, bonded songId, referenceLink). Preserves trackId — unlike remove+add — so external references stay valid. Only fields you pass in `patch` get updated; omitted fields are untouched. Position/order cannot be changed via update_track — use reorder_setlist. Re-bonding: passing a new `songId` updates `fileId` automatically (the library is keyed by Drive file id). Returns the post-update row. Admins and band leaders only.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                trackId: z
                    .string()
                    .describe("Track id (from get_setlist tracks[].id)"),
                patch: trackPatchSchema.describe(
                    "Fields to update. At least one must be set. Pass `songId` to re-bond the row to a different library song (fileId follows automatically).",
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
                            patch: trackPatchSchema,
                        }),
                    )
                    .min(1)
                    .max(50)
                    .describe("Per-track patches; max 50"),
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
            },
        },
        async (args, extra) =>
            jsonResult(await uploadChart(uidFrom(extra), args)),
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
                "Download one chart's bytes from the library — returns base64-encoded content plus mimeType so Claude Desktop can save or print it. Charts are pulled from Firebase Storage first (fast), with Google Drive fallback for legacy entries. Hard cap at 20 MB per chart; oversized scans get a clear error suggesting re-upload as a compressed version. Use this when the user asks for a specific chart, wants to print one chart, or asks to see the actual notation. For a full setlist as a printable packet, use generate_gig_packet instead (coming soon).",
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
}
