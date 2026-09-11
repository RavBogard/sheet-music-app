import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { rowOrg, stampOrg } from "@/lib/mcp/org-context"
import { houseChartHtml, type HouseChart } from "@/lib/chart-render/house-chart-html"
import {
    isRenderFailure,
    renderViaRoute,
    type RenderedChart,
    type RenderFailure,
} from "@/lib/chart-render/render-client"
import {
    curatedCatalogGate,
    isTrustedLeader,
    isUploadAllowed,
    loadUploader,
    rateLimitEnvelope,
    uploadForbidden,
    type UploaderRoles,
} from "./uploader-roles"
import { uploadFailureEnvelope } from "./library-upload"
import { applySongMetadata } from "./song-metadata"
import { swapChart } from "./setlist-write"
import { findSetlistsReferencingChart } from "./setlists"
import { markChartStatus } from "./mark-chart-status"

/**
 * create_chart — Claude writes a chart, the server renders, files, and bonds it.
 *
 * The chart Claude built in a chat is text it already holds (chords + words,
 * house-style HTML, MusicXML, or a plain chord sheet). A plain chat cannot move
 * a file's bytes to the server, so the server builds the chart from that text:
 *
 *   preview → render, return the page as an image into the chat, write nothing
 *   commit  → render, file through processChartUpload, store the source on the
 *             row, bond to a setlist row, or supersede an earlier version
 *
 * Revisions ("revisionOf") mint a NEW fileId, re-bond every live setlist row
 * that referenced the old one, and archive the old row. Same-id byte overwrite
 * was rejected: chart bytes sit behind a 7-day CDN cache, a 1-day browser
 * cache, and an offline IndexedDB keyed by fileId — an overwrite would show
 * stale on iPads. A new id defeats every layer; to the user it is still "the
 * same chart, updated", because the bonds follow.
 */

export type ChartSource =
    | { kind: "chart"; chart: HouseChart }
    | { kind: "html"; html: string }
    | { kind: "musicxml"; musicxml: string }
    | { kind: "text"; content: string; artist?: string }

export interface CreateChartArgs {
    mode: "preview" | "commit"
    source: ChartSource
    /** Library title. Defaults to `source.chart.title` for the structured form. */
    title?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
    leadMusician?: string
    /** Bypass duplicate detection (a deliberate second arrangement). */
    force?: boolean
    /** Bond the committed chart onto this setlist row. */
    bondTo?: { setlistId: string; trackId: string }
    /** Supersede an earlier version of this chart (bonds follow, old row archived). */
    revisionOf?: string
    /** Preview only: device scale for the PNG (default 2). */
    previewScale?: number
}

export interface PreviewResult {
    ok: true
    mode: "preview"
    title: string
    kind: ChartSource["kind"]
    /** PNG bytes of the rendered page(s); absent for musicxml/text sources. */
    imagePng?: Buffer
    pageCount: number | null
    renderMs: number | null
    sizeBytes: number
    note: string
}

export interface CommitResult {
    ok: true
    mode: "commit"
    fileId: string
    title: string
    collection: LibraryCollection
    mimeType: string
    sizeBytes: number
    pageCount: number | null
    kind: ChartSource["kind"]
    bonded: Array<{ setlistId: string; trackId: string }>
    revisionOf: string | null
    /** Rows moved from the superseded chart to this one. */
    rebondedFromPrevious: number
    previousArchived: boolean
    warnings: string[]
}

export type CreateChartResult = PreviewResult | CommitResult | RichErrorEnvelope

const MAX_SOURCE_BYTES = 512 * 1024

interface CreateChartDeps {
    render: (html: string, format: "pdf" | "png", opts?: { scale?: number }) => Promise<RenderedChart | RenderFailure>
}

const prodDeps: CreateChartDeps = {
    render: (html, format, opts) => renderViaRoute(html, format, opts),
}

function safeFileName(title: string, ext: string): string {
    const safe = title.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "chart"
    return `${safe}${ext}`
}

function resolveTitle(args: CreateChartArgs): string {
    const explicit = args.title?.trim()
    if (explicit) return explicit
    if (args.source.kind === "chart") return args.source.chart.title?.trim() ?? ""
    return ""
}

function sourceBytes(source: ChartSource): number {
    switch (source.kind) {
        case "chart":
            return Buffer.byteLength(JSON.stringify(source.chart), "utf8")
        case "html":
            return Buffer.byteLength(source.html, "utf8")
        case "musicxml":
            return Buffer.byteLength(source.musicxml, "utf8")
        case "text":
            return Buffer.byteLength(source.content, "utf8")
    }
}

function validate(args: CreateChartArgs): RichErrorEnvelope | null {
    if (args.mode !== "preview" && args.mode !== "commit") {
        return richError(
            "invalid_argument",
            "mode must be 'preview' or 'commit' — it is never defaulted.",
            { field: "mode" },
            "Preview until the user says the chart is right; commit only when they say to put it in.",
        )
    }
    const s = args.source
    if (!s || typeof s !== "object" || !("kind" in s)) {
        return richError("invalid_argument", "source is required.", { field: "source" })
    }
    if (s.kind === "chart") {
        if (!s.chart?.title?.trim() && !args.title?.trim()) {
            return richError("invalid_argument", "chart.title (or title) is required.", { field: "source.chart.title" })
        }
        if (!Array.isArray(s.chart?.sections) || s.chart.sections.length === 0) {
            return richError("invalid_argument", "chart.sections must have at least one section.", { field: "source.chart.sections" })
        }
    } else if (s.kind === "html") {
        if (!s.html?.trim()) return richError("invalid_argument", "html is required.", { field: "source.html" })
        if (!/<(html|body|div|p|h1)[\s>]/i.test(s.html)) {
            return richError("invalid_argument", "html does not look like a document.", { field: "source.html" })
        }
    } else if (s.kind === "musicxml") {
        if (!s.musicxml?.trim()) return richError("invalid_argument", "musicxml is required.", { field: "source.musicxml" })
        if (!/<score-partwise|<score-timewise/i.test(s.musicxml)) {
            return richError(
                "invalid_argument",
                "musicxml must contain a <score-partwise> or <score-timewise> root.",
                { field: "source.musicxml" },
            )
        }
    } else if (s.kind === "text") {
        if (!s.content?.trim()) return richError("invalid_argument", "content is required.", { field: "source.content" })
    } else {
        return richError("invalid_argument", `Unknown source.kind '${String((s as { kind: unknown }).kind)}'.`, { field: "source.kind" })
    }
    if (sourceBytes(s) > MAX_SOURCE_BYTES) {
        return richError(
            "payload_too_large",
            `source exceeds ${MAX_SOURCE_BYTES} bytes.`,
            { field: "source", errorCode: 413 },
            "Split a long chart into two, or drop embedded images from the HTML.",
        )
    }
    if (!resolveTitle(args)) {
        return richError("invalid_argument", "title is required for this source kind.", { field: "title" })
    }
    if (args.mode === "commit" && args.bondTo) {
        if (!args.bondTo.setlistId?.trim() || !args.bondTo.trackId?.trim()) {
            return richError("invalid_argument", "bondTo needs both setlistId and trackId.", { field: "bondTo" })
        }
    }
    return null
}

/** What the server will file. HTML-shaped sources render to PDF; the rest are stored as-is. */
function htmlFor(source: ChartSource): string | null {
    if (source.kind === "chart") return houseChartHtml(source.chart)
    if (source.kind === "html") return source.html
    return null
}

function renderEnvelope(f: RenderFailure): RichErrorEnvelope {
    return richError(
        f.machineCode,
        f.message,
        { errorCode: f.status },
        f.machineCode === "render_not_configured"
            ? "Set CRON_SECRET (or RENDER_SECRET) and INTAKE_INTERNAL_BASE_URL on the deployment."
            : "Retry once; if it persists the render function may be cold-starting slowly — check `[render/chart]` logs.",
    )
}

export async function createChart(
    uid: string,
    args: CreateChartArgs,
    org: OrgId = DEFAULT_ORG_ID,
    deps: CreateChartDeps = prodDeps,
): Promise<CreateChartResult> {
    const invalid = validate(args)
    if (invalid) return invalid
    const title = resolveTitle(args)

    initAdmin()
    const db = getFirestore()
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)
    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial
    const limited = await checkUserRateLimit(uid, "upload", { bypass: isTrustedLeader(roles) })
    if (limited) return rateLimitEnvelope(limited.error)

    const html = htmlFor(args.source)

    // ─── preview ────────────────────────────────────────────────────────
    if (args.mode === "preview") {
        if (html) {
            const r = await deps.render(html, "png", { scale: args.previewScale ?? 2 })
            if (isRenderFailure(r)) return renderEnvelope(r)
            return {
                ok: true,
                mode: "preview",
                title,
                kind: args.source.kind,
                imagePng: r.bytes,
                pageCount: r.pageCount,
                renderMs: r.renderMs,
                sizeBytes: r.bytes.byteLength,
                note:
                    r.pageCount > 1
                        ? `Renders as ${r.pageCount} pages. Nothing was saved. Show the user the image; when they approve, call again with mode:'commit' and the SAME source.`
                        : "Renders as one page. Nothing was saved. Show the user the image; when they approve, call again with mode:'commit' and the SAME source.",
            }
        }
        const bytes = sourceBytes(args.source)
        return {
            ok: true,
            mode: "preview",
            title,
            kind: args.source.kind,
            pageCount: null,
            renderMs: null,
            sizeBytes: bytes,
            note:
                args.source.kind === "musicxml"
                    ? "MusicXML is stored as notation and rendered by the app's score viewer; no image preview is produced here. Nothing was saved."
                    : "Plain chord text is stored as-is and rendered by the app's text viewer; no image preview is produced here. Nothing was saved.",
        }
    }

    // ─── commit ─────────────────────────────────────────────────────────
    const warnings: string[] = []

    // Revision guard: the previous row must exist, be ours, and be revisable by this caller.
    let previous: { id: string; data: Record<string, unknown> } | null = null
    if (args.revisionOf?.trim()) {
        const prevSnap = await db.collection("library_index").doc(args.revisionOf.trim()).get()
        if (!prevSnap.exists) {
            return richError(
                "row_not_found",
                `revisionOf ${args.revisionOf} does not exist.`,
                { revisionOf: args.revisionOf, errorCode: 404 },
                "Pass the fileId returned by the earlier create_chart commit, or drop revisionOf to file a new chart.",
            )
        }
        const data = prevSnap.data() ?? {}
        if (rowOrg(data.orgId) !== org) {
            return richError(
                "row_not_found",
                `revisionOf ${args.revisionOf} is not in your organization.`,
                { revisionOf: args.revisionOf, errorCode: 404 },
            )
        }
        const authoredBy = typeof data.authoredBy === "string" ? data.authoredBy : null
        if (!isTrustedLeader(roles) && authoredBy !== uid) {
            return richError(
                "forbidden",
                "Only the chart's author, an admin, or a band leader may revise it.",
                { revisionOf: args.revisionOf, errorCode: 403 },
            )
        }
        previous = { id: prevSnap.id, data }
    }

    // Bytes to file.
    let buffer: Buffer
    let mimeType: string
    let fileName: string
    let pageCount: number | null = null
    if (html) {
        const r = await deps.render(html, "pdf")
        if (isRenderFailure(r)) return renderEnvelope(r)
        buffer = r.bytes
        mimeType = "application/pdf"
        fileName = safeFileName(title, ".pdf")
        pageCount = r.pageCount
    } else if (args.source.kind === "musicxml") {
        buffer = Buffer.from(args.source.musicxml, "utf8")
        mimeType = "application/vnd.recordare.musicxml+xml"
        fileName = safeFileName(title, ".musicxml")
    } else {
        // Same payload shape as save_scraped_chart / ScraperModal.
        const artist = args.source.kind === "text" ? args.source.artist ?? "" : ""
        const content = args.source.kind === "text" ? args.source.content : ""
        buffer = Buffer.from(`${title}\n${artist}\n\n${content}`, "utf8")
        mimeType = "text/plain"
        fileName = safeFileName(title, ".txt")
    }

    const result = await processChartUpload({
        buffer,
        originalFileName: fileName,
        mimeType,
        title,
        collection: args.collection ?? (previous?.data.collection as LibraryCollection | undefined),
        key: args.key,
        bpm: args.bpm,
        tags: args.tags,
        uploaderUid: uid,
        uploaderEmail: roles.email,
        // A revision keeps the title, which the strict dedupe would refuse — the
        // caller has told us on purpose that this is the same chart, updated.
        force: args.force || Boolean(previous),
    })
    if (!result.ok) return uploadFailureEnvelope(result, { tool: "create_chart" })
    const fileId = result.fileId

    await stampOrg(db, fileId, org)

    // Authored provenance + the source itself, so the chart can be re-rendered
    // or transposed later without anyone finding the original conversation.
    try {
        await db.collection("library_index").doc(fileId).set(
            {
                authoredBy: uid,
                authoredAt: new Date().toISOString(),
                authoredKind: args.source.kind,
                authoredSource: args.source,
                ...(previous ? { revisionOf: previous.id } : {}),
                ...(pageCount !== null ? { pageCount } : {}),
            },
            { merge: true },
        )
    } catch (err) {
        warnings.push(`authoredSource not stored: ${err instanceof Error ? err.message : String(err)}`)
        logger.warn("[create_chart] authoredSource write failed", { fileId, err })
    }

    if (args.key !== undefined || args.bpm !== undefined || args.leadMusician !== undefined) {
        try {
            await applySongMetadata(db, fileId, {
                key: args.key,
                bpm: args.bpm,
                leadMusician: args.leadMusician,
            })
        } catch (err) {
            warnings.push(`song metadata mirror failed: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    // Revision: move every live bond from the previous chart to this one, then archive it.
    const bonded: Array<{ setlistId: string; trackId: string }> = []
    let rebonded = 0
    let previousArchived = false
    if (previous) {
        const refs = await findSetlistsReferencingChart(uid, { fileId: previous.id }, org)
        if ("ok" in refs && refs.ok) {
            for (const ref of refs.setlists) {
                const swapped = await swapChart(uid, { setlistId: ref.setlistId, trackId: ref.trackId, newSongId: fileId }, org)
                if ("ok" in swapped && swapped.ok) {
                    rebonded++
                    bonded.push({ setlistId: ref.setlistId, trackId: ref.trackId })
                } else {
                    warnings.push(`could not re-bond ${ref.setlistId}/${ref.trackId} from ${previous.id}`)
                }
            }
            if (refs.truncated) warnings.push("referencing-setlist list was truncated; some rows may still point at the previous version")
        } else {
            warnings.push(`could not enumerate rows bonded to ${previous.id}; they were not moved`)
        }
        const archived = await markChartStatus(
            uid,
            {
                fileId: previous.id,
                toStatus: "archived",
                canonicalFileId: fileId,
                reason: `Superseded by revision ${fileId} via create_chart`,
                force: true,
            },
            org,
        )
        previousArchived = "toStatus" in archived
        if (!previousArchived) warnings.push(`previous version ${previous.id} was not archived`)
    }

    if (args.bondTo) {
        const already = bonded.some(
            (b) => b.setlistId === args.bondTo!.setlistId && b.trackId === args.bondTo!.trackId,
        )
        if (!already) {
            const swapped = await swapChart(
                uid,
                { setlistId: args.bondTo.setlistId, trackId: args.bondTo.trackId, newSongId: fileId },
                org,
            )
            if ("ok" in swapped && swapped.ok) bonded.push({ ...args.bondTo })
            else {
                const msg =
                    "error" in swapped && swapped.error && typeof swapped.error === "object" && "message" in swapped.error
                        ? String((swapped.error as { message?: unknown }).message)
                        : "bond failed"
                warnings.push(`chart filed but NOT bonded to ${args.bondTo.setlistId}/${args.bondTo.trackId}: ${msg}`)
            }
        }
    }

    return {
        ok: true,
        mode: "commit",
        fileId,
        title: result.title,
        collection: result.collection,
        mimeType,
        sizeBytes: buffer.byteLength,
        pageCount,
        kind: args.source.kind,
        bonded,
        revisionOf: previous?.id ?? null,
        rebondedFromPrevious: rebonded,
        previousArchived,
        warnings,
    }
}

export type { UploaderRoles }
