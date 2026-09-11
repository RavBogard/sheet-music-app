import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { orgFrom, type AuthExtra } from "@/lib/mcp/org-context"
import { isErrorEnvelope } from "./result-iserror"
import { createChart, type CreateChartArgs, type CreateChartResult } from "./authored-chart"

/**
 * create_chart — MCP registration.
 *
 * The one tool that lets Claude put a chart it has just written into the
 * library on its own, from any Claude client, for any music director. The
 * description carries the two-step contract (preview until the user approves;
 * commit only when they say so) because a fresh conversation learns the
 * workflow from `tools/list` alone.
 */

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) throw new Error("Unauthenticated MCP request")
    return uid
}

const chordProLine = z
    .string()
    .max(400)
    .describe(
        "One lyric line with inline chords in ChordPro brackets placed immediately before the syllable they sound on: `[Cm]Modeh ani l'fa[G]necha`. Chords are the ACTUAL sounding chords — never capo shapes. Use ♭ and ♯.",
    )

const houseChartSchema = z
    .object({
        title: z.string().min(1).max(120).describe("Song title as it should appear in the header and library."),
        keyMeter: z.string().max(40).optional().describe("Right-hand header text, e.g. 'Cm · 4/4'."),
        subtitle: z
            .string()
            .max(200)
            .optional()
            .describe("Italic line under the title: book page, occasion, style — e.g. \"Shirei T'shuvah p. 42 · Rosh HaShanah morning · folk\"."),
        progressions: z
            .array(
                z.object({
                    label: z.string().max(24).describe("Box label: 'A', 'B  ×2', 'Intro'."),
                    bars: z.array(z.string().max(40)).min(1).max(16).describe("One entry per bar: ['Cm','Cm','B♭','A♭ B♭ Cm']."),
                    repeat: z.boolean().optional().describe("Wrap in repeat signs (default true)."),
                }),
            )
            .max(4)
            .optional()
            .describe("Progression boxes across the top, side by side (A and B both go at the top when a song has two sections)."),
        caption: z.string().max(300).optional().describe("Italic roadmap line under the boxes: 'A ×2, then B ×2, back to A'."),
        sections: z
            .array(
                z.object({
                    label: z.string().max(40).optional().describe("Section label: 'A', 'B', 'Chorus'."),
                    stanzas: z
                        .array(z.object({ lines: z.array(chordProLine).min(1).max(40) }))
                        .min(1)
                        .max(30),
                }),
            )
            .min(1)
            .max(20),
        note: z.string().max(400).optional().describe("Closing italic performance note."),
    })
    .describe("The house-style chord chart (the 'Ki Anu Amecha (Trad)' look): chords anchored over syllables, progression boxes on top.")

const sourceSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chart"), chart: houseChartSchema }).describe("Structured house-style chord chart — the normal form from a chat."),
    z
        .object({ kind: z.literal("html"), html: z.string().min(20).max(512 * 1024) })
        .describe("A complete house-style chart HTML document you authored yourself (the chart_lib.py template). Rendered as-is with DejaVu Sans."),
    z
        .object({ kind: z.literal("musicxml"), musicxml: z.string().min(50).max(512 * 1024) })
        .describe("MusicXML notation (score-partwise). Stored as notation; the app renders and transposes it."),
    z
        .object({ kind: z.literal("text"), content: z.string().min(1).max(64 * 1024), artist: z.string().max(120).optional() })
        .describe("Plain monospace chord chart text (same as save_scraped_chart)."),
])

const collectionSchema = z
    .enum(["core", "supplemental", "uploads", "nava"])
    .optional()
    .describe("Library section (default 'uploads'). 'core', 'supplemental' and 'nava' are curated — admins and band leaders only.")

export function toToolResult(result: CreateChartResult) {
    if (result && typeof result === "object" && "ok" in result && result.ok === true && result.mode === "preview") {
        const { imagePng, ...rest } = result
        const content: Array<
            | { type: "image"; data: string; mimeType: string }
            | { type: "text"; text: string }
        > = []
        if (imagePng) content.push({ type: "image", data: imagePng.toString("base64"), mimeType: "image/png" })
        content.push({ type: "text", text: JSON.stringify(rest) })
        return { content, structuredContent: rest as unknown as Record<string, unknown>, isError: false }
    }
    return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: isErrorEnvelope(result),
    }
}

export function registerAuthoredChartTools(server: McpServer): void {
    server.registerTool(
        "create_chart",
        {
            title: "Create a chart from what you wrote (preview, then commit)",
            description:
                "Turn a chart YOU wrote in this conversation into a library chart, rendered server-side in the house style, and bond it to a setlist row — with no file on anyone's device and no upload panel. TWO STEPS, ALWAYS: (1) mode:'preview' renders the chart and returns the page as an IMAGE in this chat plus the page count; show it to the user and revise until they say it is right. Nothing is saved. (2) mode:'commit' — ONLY when the user says to put it in / bond it — renders the same source to PDF, files it in the library, and, if bondTo is given, bonds it to that setlist row so it is on the iPads. Never commit without the user's word; never default the mode. REVISIONS: when the user changes a chart that is already filed, call commit again with the full updated source and revisionOf:<the earlier fileId>; the new version takes over every setlist row the old one was on and the old one is archived — to the user it is the same chart, updated. Source forms: 'chart' (structured house style with ChordPro lines — the normal form), 'html' (a house-style HTML document you authored), 'musicxml' (notation), 'text' (plain chord sheet). Chords are always the actual sounding chords, never capo shapes. Requires upload permission; curated collections need admin/band leader.",
            inputSchema: {
                mode: z.enum(["preview", "commit"]).describe("'preview' = render and show, save nothing. 'commit' = file it (and bond). Never defaulted."),
                source: sourceSchema,
                title: z.string().min(1).max(120).optional().describe("Library title. Defaults to chart.title for the 'chart' form; required for the others."),
                collection: collectionSchema,
                key: z.string().max(12).optional().describe("Sounding key, e.g. 'Cm'. Mirrored to the song's defaults."),
                bpm: z.number().int().min(20).max(300).optional(),
                tags: z.array(z.string().max(40)).max(12).optional(),
                leadMusician: z.string().max(80).optional().describe("Vocal Lead."),
                force: z.boolean().optional().describe("Bypass duplicate detection for a deliberate second arrangement of an existing title."),
                bondTo: z
                    .object({
                        setlistId: z.string().min(1),
                        trackId: z.string().min(1).describe("Track id from get_setlist tracks[].id."),
                    })
                    .optional()
                    .describe("Commit only: bond the new chart onto this setlist row (swap_chart semantics: title/key refreshed, notes and lead kept)."),
                revisionOf: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("Commit only: the fileId of the earlier version this replaces. Its setlist bonds move to the new chart and it is archived."),
                previewScale: z.number().min(1).max(3).optional().describe("Preview only: image scale (default 2)."),
            },
        },
        async (args, extra) =>
            toToolResult(
                await createChart(
                    uidFrom(extra as AuthExtra),
                    args as unknown as CreateChartArgs,
                    orgFrom(extra as AuthExtra),
                ),
            ),
    )
}
