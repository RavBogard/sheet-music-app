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
} from "./setlist-write"

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
                "List the user's setlists, newest first. Use when the user asks about their upcoming or recent services/gigs. Dates are ISO strings; trackCount counts every row including section headers. Optional from/to filter by service date.",
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
                    .max(50)
                    .optional()
                    .describe("Max results (default 20)"),
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
                "Search the song library by title text, with optional musical key and BPM-range filters. Use when the user wants to find songs to add to a setlist. BPMs are integers. Returns metadata only — never chart files.",
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
                "Create a new, empty setlist owned by the user. Use when the user wants to start a new service/gig. Returns the new setlist id — follow up with add_track_to_setlist to populate it. eventDate is an ISO date string.",
            inputSchema: {
                name: z.string().min(1).describe("Setlist name, e.g. 'Shabbat Morning — June 7'"),
                eventDate: z
                    .string()
                    .optional()
                    .describe("ISO date of the service, e.g. '2026-06-07'"),
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
                "Update a setlist's metadata (name, date, service type, rabbi, notes). Metadata only — does NOT touch tracks; use the track tools for that. Only the setlist's owner may update it.",
            inputSchema: {
                id: z.string().describe("Setlist id"),
                name: z.string().min(1).optional().describe("New setlist name"),
                eventDate: z.string().optional().describe("New ISO event date"),
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
                "Add one row to a setlist — either a song (pass songId to pull title/key/vocal-lead from the library AND bond the song's chart so it renders on the row, or pass an explicit title for a free-text row) or a section header (type:'header' with a title). position is a 0-based insert index; omit it to append at the end. Only the setlist's owner may add tracks.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                songId: z
                    .string()
                    .optional()
                    .describe("Library song id — title/key/lead default from this song"),
                title: z
                    .string()
                    .optional()
                    .describe("Row title — required for a header, or to override a song's title"),
                type: z
                    .enum(["song", "header"])
                    .optional()
                    .describe("Row type (default 'song')"),
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
                "Reorder a setlist's tracks. orderedTrackIds must list every current track id of the setlist exactly once, in the new performance order. Get the current ids from get_setlist first. Only the setlist's owner may reorder.",
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
                "Remove one track from a setlist by id. The remaining tracks are re-packed to stay contiguous. Only the setlist's owner may remove tracks.",
            inputSchema: {
                setlistId: z.string().describe("Setlist id"),
                trackId: z.string().describe("Id of the track to remove"),
            },
        },
        async (args, extra) => jsonResult(await removeSetlistTrack(uidFrom(extra), args)),
    )
}
