import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { listSetlists, getSetlist } from "./setlists"
import { searchLibrary, getSong } from "./library"

/**
 * Registers the MCP read tools (Phase 4a). Each tool resolves the
 * authenticated uid from `extra.authInfo` (set by withMcpAuth → verifyBearer
 * in the route) and delegates to the plain functions in ./setlists + ./library.
 * Write tools (Phase 4b) are added only after these are verified end-to-end.
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
