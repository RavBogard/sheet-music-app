import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { fetchFileById } from "@/lib/file-fetcher"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"

/**
 * MCP chart-download tool — return one chart's bytes (base64) + mimeType so
 * Claude Desktop can save or print it. Wraps the same `fetchFileById` path
 * the in-app file proxy / print pipeline use; Firebase Storage primary,
 * Google Drive fallback for legacy entries (`hasBrowserFetchMetadata`
 * heuristic intentionally allows public-read per Daniel's chart-access
 * policy — chart bytes are not security-sensitive).
 *
 * Auth model: any authenticated MCP token-holder may download. Per the
 * chart-access policy ([[feedback_chart_access_policy]] in auto-memory),
 * charts are intentionally accessible — there's no role gate beyond
 * "authenticated MCP request".
 *
 * Rate limit: `api` tier (60/min). Trusted leaders (admin / band_leader)
 * bypass — David Lazaroff bulk-downloading for a gig packet shouldn't get
 * 429'd. See [[feedback_admin_rate_limit_bypass]].
 */

type ToolError = { error: string }

/** Hard cap on raw bytes returned. ~20 MB ≈ ~27 MB base64 — well above any
 *  realistic single chart, but bounded so a runaway scan doesn't blow the
 *  MCP response budget. Caller gets a clear error suggesting they fetch a
 *  smaller version. */
export const DOWNLOAD_CHART_MAX_BYTES = 20 * 1024 * 1024

export interface DownloadChartArgs {
    fileId: string
}

export interface DownloadChartResult {
    ok: true
    fileId: string
    title: string
    fileName: string | null
    mimeType: string
    contentBase64: string
    sizeBytes: number
    source: "firebase-storage" | "google-drive-fallback"
}

async function readLeaderRole(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<"admin" | "band_leader" | "other"> {
    const snap = await db.collection("users").doc(uid).get()
    const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined
    if (role === "admin") return "admin"
    if (role === "band_leader") return "band_leader"
    return "other"
}

export async function downloadChart(
    uid: string,
    args: DownloadChartArgs,
): Promise<DownloadChartResult | ToolError> {
    if (!args.fileId?.trim()) return { error: "fileId is required" }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"

    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return { error: limited.error }

    const indexRef = db.collection("library_index").doc(args.fileId)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists) return { error: "Chart not found" }
    const indexData = indexSnap.data() as Record<string, unknown>

    const title =
        (typeof indexData.name === "string" && indexData.name) ||
        (typeof indexData.title === "string" && indexData.title) ||
        args.fileId
    const indexMimeHint =
        typeof indexData.mimeType === "string" ? indexData.mimeType : undefined
    const indexFileName =
        typeof indexData.fileName === "string" ? indexData.fileName : null

    let fetched
    try {
        fetched = await fetchFileById(args.fileId, indexMimeHint)
    } catch (err) {
        logger.warn("[mcp] download_chart fetch threw", {
            fileId: args.fileId,
            err: err instanceof Error ? err.message : err,
        })
        return { error: "Failed to fetch chart bytes" }
    }
    if (!fetched) {
        return {
            error:
                "Chart file not found in Storage or Drive — the library entry exists but the underlying bytes are missing",
        }
    }

    if (fetched.buffer.byteLength > DOWNLOAD_CHART_MAX_BYTES) {
        return {
            error:
                `Chart is ${fetched.buffer.byteLength} bytes — exceeds the ` +
                `${DOWNLOAD_CHART_MAX_BYTES}-byte download cap. Ask an admin to ` +
                `re-upload a compressed version, or fetch the original from the library URL directly.`,
        }
    }

    logger.info("[mcp] chart downloaded", {
        fileId: args.fileId,
        size: fetched.buffer.byteLength,
        source: fetched.source,
    })

    return {
        ok: true,
        fileId: args.fileId,
        title,
        fileName: indexFileName,
        mimeType: fetched.contentType,
        contentBase64: fetched.buffer.toString("base64"),
        sizeBytes: fetched.buffer.byteLength,
        source: fetched.source,
    }
}

/* ─────────────────────────────────────────────────────────────────────────
 * generate_gig_packet — CF2-C
 *
 * Assemble a setlist's bonded charts into one merged PDF the band can print.
 * Without this, Daniel still has to fall back to the in-app gig-packet print
 * flow every Friday. Wraps the same `fetchFileById` path download_chart uses
 * (Storage primary, Drive fallback). Per-track type routing:
 *
 *   - application/pdf            → copyPages into the merged doc
 *   - image/jpeg | image/png     → embedded as a full letter-size page
 *   - image/heic | image/heif    → appendix entry (server normally converts
 *                                  HEIC → JPEG at upload time; a raw HEIC at
 *                                  packet time means the conversion was
 *                                  skipped, so direct embed isn't safe)
 *   - text/plain (scraped chord) → rendered as monospaced Courier pages
 *   - musicxml / musescore       → appendix entry (rendering not cheap)
 *   - other / unknown            → appendix entry with the content type
 *
 * Auth: any authenticated MCP token-holder may generate — charts are
 * intentionally public per [[feedback_chart_access_policy]]. Rate-limit on
 * the `api` tier with trusted-leader bypass (admin / band_leader).
 *
 * 20 MB output cap to stay under the MCP response budget. If the merged
 * document exceeds it, the tool errors with a hint to print sections
 * separately or use download_chart for individual files.
 * ───────────────────────────────────────────────────────────────────────── */

export const GIG_PACKET_MAX_BYTES = 20 * 1024 * 1024

/** Test-only override of the output cap. Constructing a real >20 MB merged
 *  PDF in an emulator test is prohibitively slow (PDF deflate compresses
 *  most inputs by ~50%, and pdf-lib page generation is not fast), so the
 *  oversize-cap test lowers the threshold instead of inflating the input.
 *  Production code never sets this; the registered MCP tool calls the
 *  zero-arg form which uses the real cap. */
let _gigPacketMaxBytesOverride: number | null = null
export function _setGigPacketMaxBytesForTest(n: number | null): void {
    _gigPacketMaxBytesOverride = n
}

export interface GenerateGigPacketArgs {
    setlistId: string
}

export interface MissingChartEntry {
    trackId: string
    title: string
    fileId: string
    reason: string
}

export interface GenerateGigPacketResult {
    ok: true
    fileId: string
    /** Source setlist name (e.g. "5/15 -- Shir Shabbat"). Kept for back-compat. */
    title: string
    /** PDF document title — matches the embedded PDF /Title metadata. */
    packetTitle: string
    contentBase64: string
    sizeBytes: number
    source: "merged"
    trackCount: number
    bondedCount: number
    appendedCount: number
    missingCharts: MissingChartEntry[]
}

export async function generateGigPacket(
    uid: string,
    args: GenerateGigPacketArgs,
): Promise<GenerateGigPacketResult | ToolError> {
    if (!args.setlistId?.trim()) return { error: "setlistId is required" }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"

    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return { error: limited.error }

    const setlistDoc = await db.collection("setlists").doc(args.setlistId).get()
    if (!setlistDoc.exists) return { error: "Setlist not found" }
    const setlistData = setlistDoc.data() as Record<string, unknown>
    const setlistTitle =
        (typeof setlistData.name === "string" && setlistData.name) || args.setlistId

    const tracks = await getTracksForSetlist(db, args.setlistId, setlistData)
    const bondedTracks = tracks.filter((t) => {
        const fid = (t as Record<string, unknown>).fileId
        return typeof fid === "string" && fid.length > 0
    })

    if (bondedTracks.length === 0) {
        return {
            error:
                "No bonded charts on this setlist — every track is either a non-song row (header/reading/etc) or has no chart bound. Bond charts to the song rows first, then retry.",
        }
    }

    const packetTitle = `${setlistTitle} — Gig Packet`
    const mergedPdf = await PDFDocument.create()
    mergedPdf.setTitle(packetTitle)
    mergedPdf.setSubject("CRC Music Books gig packet")

    const missingCharts: MissingChartEntry[] = []
    let appendedCount = 0

    for (const track of bondedTracks) {
        const row = track as Record<string, unknown>
        const fileId = row.fileId as string
        const rawTitle = typeof row.title === "string" && row.title ? row.title : fileId
        const trackId = String(row.id ?? "")
        const indexMimeHint =
            typeof row.mimeType === "string" ? (row.mimeType as string) : undefined

        let fetched
        try {
            fetched = await fetchFileById(fileId, indexMimeHint)
        } catch (err) {
            missingCharts.push({
                trackId,
                title: rawTitle,
                fileId,
                reason: `Fetch failed: ${err instanceof Error ? err.message : "unknown error"}`,
            })
            continue
        }

        if (!fetched || fetched.buffer.byteLength === 0) {
            missingCharts.push({
                trackId,
                title: rawTitle,
                fileId,
                reason: "Chart bytes not found in Storage or Drive (orphan library entry)",
            })
            continue
        }

        const ct = (fetched.contentType || "").toLowerCase()
        try {
            if (ct.includes("pdf")) {
                const src = await PDFDocument.load(fetched.buffer, {
                    ignoreEncryption: true,
                })
                const pages = await mergedPdf.copyPages(src, src.getPageIndices())
                pages.forEach((p) => mergedPdf.addPage(p))
                appendedCount++
            } else if (/jpeg|jpg/.test(ct)) {
                await embedImageFullPage(mergedPdf, fetched.buffer, "jpeg")
                appendedCount++
            } else if (/png/.test(ct)) {
                await embedImageFullPage(mergedPdf, fetched.buffer, "png")
                appendedCount++
            } else if (/heic|heif/.test(ct)) {
                missingCharts.push({
                    trackId,
                    title: rawTitle,
                    fileId,
                    reason:
                        "HEIC/HEIF not embedded directly. Re-upload the chart to trigger server-side JPEG conversion.",
                })
            } else if (/musicxml|musescore|vnd\.recordare/.test(ct)) {
                missingCharts.push({
                    trackId,
                    title: rawTitle,
                    fileId,
                    reason:
                        "MusicXML/MuseScore charts aren't rendered into the packet. Export to PDF and re-upload to include.",
                })
            } else if (ct.startsWith("text/")) {
                const text = fetched.buffer.toString("utf-8")
                await renderTextChart(mergedPdf, rawTitle, text)
                appendedCount++
            } else {
                missingCharts.push({
                    trackId,
                    title: rawTitle,
                    fileId,
                    reason: `Unsupported content type: ${fetched.contentType}`,
                })
            }
        } catch (err) {
            missingCharts.push({
                trackId,
                title: rawTitle,
                fileId,
                reason: `Embed failed: ${err instanceof Error ? err.message : "unknown error"}`,
            })
        }
    }

    if (missingCharts.length > 0) {
        await renderMissingChartsAppendix(mergedPdf, missingCharts)
    }

    const finalBytes = await mergedPdf.save()
    const sizeBytes = finalBytes.byteLength

    const effectiveCap = _gigPacketMaxBytesOverride ?? GIG_PACKET_MAX_BYTES
    if (sizeBytes > effectiveCap) {
        return {
            error:
                `Generated packet is ${sizeBytes} bytes — exceeds the ${effectiveCap}-byte response cap. ` +
                `Print sections of the setlist separately, or fetch individual charts with download_chart and assemble client-side.`,
        }
    }

    const synthesizedId = `gig-packet-${args.setlistId}-${Date.now()}`
    logger.info("[mcp] gig packet generated", {
        setlistId: args.setlistId,
        size: sizeBytes,
        bonded: bondedTracks.length,
        appended: appendedCount,
        missing: missingCharts.length,
    })

    return {
        ok: true,
        fileId: synthesizedId,
        title: setlistTitle,
        packetTitle,
        contentBase64: Buffer.from(finalBytes).toString("base64"),
        sizeBytes,
        source: "merged",
        trackCount: tracks.length,
        bondedCount: bondedTracks.length,
        appendedCount,
        missingCharts,
    }
}

async function embedImageFullPage(
    pdf: PDFDocument,
    buffer: Buffer,
    kind: "jpeg" | "png",
): Promise<void> {
    const image =
        kind === "jpeg" ? await pdf.embedJpg(buffer) : await pdf.embedPng(buffer)
    const PAGE_W = 612
    const PAGE_H = 792
    const MARGIN = 18
    const page = pdf.addPage([PAGE_W, PAGE_H])
    const dims = image.scaleToFit(PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2)
    page.drawImage(image, {
        x: (PAGE_W - dims.width) / 2,
        y: (PAGE_H - dims.height) / 2,
        width: dims.width,
        height: dims.height,
    })
}

/** pdf-lib's StandardFonts only encode WinAnsi. Pre-substitute the unicode
 *  characters that show up in scraped chord charts (smart quotes / em-dashes
 *  / ellipsis), then replace anything still outside the WinAnsi range with
 *  `?` so the chart still renders instead of throwing mid-page. */
function toWinAnsi(s: string): string {
    return s
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/ /g, " ")
        .replace(/[^\x00-\xff]/g, "?")
}

async function renderTextChart(
    pdf: PDFDocument,
    rawTitle: string,
    rawText: string,
): Promise<void> {
    const courier = await pdf.embedFont(StandardFonts.Courier)
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const PAGE_W = 612
    const PAGE_H = 792
    const MARGIN_L = 50
    const MARGIN_T = 60
    const MARGIN_B = 50
    const TITLE_SIZE = 14
    const BODY_SIZE = 10
    const LINE_H = BODY_SIZE * 1.2
    const usableW = PAGE_W - MARGIN_L * 2
    const charW = courier.widthOfTextAtSize("M", BODY_SIZE)
    const charsPerLine = Math.max(20, Math.floor(usableW / charW))

    const title = toWinAnsi(rawTitle)
    const text = toWinAnsi(rawText)

    const wrapped: string[] = []
    for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
        if (rawLine.length <= charsPerLine) {
            wrapped.push(rawLine)
        } else {
            let i = 0
            while (i < rawLine.length) {
                wrapped.push(rawLine.slice(i, i + charsPerLine))
                i += charsPerLine
            }
        }
    }

    let page = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN_T
    page.drawText(title, {
        x: MARGIN_L,
        y,
        size: TITLE_SIZE,
        font: helveticaBold,
        color: rgb(0, 0, 0),
    })
    y -= TITLE_SIZE + 12

    for (const line of wrapped) {
        if (y < MARGIN_B) {
            page = pdf.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN_T
        }
        if (line.length > 0) {
            page.drawText(line, {
                x: MARGIN_L,
                y,
                size: BODY_SIZE,
                font: courier,
                color: rgb(0.1, 0.1, 0.1),
            })
        }
        y -= LINE_H
    }
}

async function renderMissingChartsAppendix(
    pdf: PDFDocument,
    missing: MissingChartEntry[],
): Promise<void> {
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
    const helveticaOblique = await pdf.embedFont(StandardFonts.HelveticaOblique)
    const PAGE_W = 612
    const PAGE_H = 792
    const MARGIN_L = 50
    const MARGIN_T = 60
    const MARGIN_B = 50

    let page = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN_T

    page.drawText("Missing Charts", {
        x: MARGIN_L,
        y,
        size: 18,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
    })
    y -= 26

    page.drawText(
        "These setlist rows had a bonded chart that couldn't be included in this packet:",
        {
            x: MARGIN_L,
            y,
            size: 10,
            font: helveticaOblique,
            color: rgb(0.35, 0.35, 0.35),
        },
    )
    y -= 22

    for (const m of missing) {
        if (y < MARGIN_B + 32) {
            page = pdf.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN_T
        }
        page.drawText(`• ${toWinAnsi(m.title)}`, {
            x: MARGIN_L,
            y,
            size: 11,
            font: helveticaBold,
            color: rgb(0.1, 0.1, 0.1),
        })
        y -= 14
        page.drawText(toWinAnsi(m.reason), {
            x: MARGIN_L + 12,
            y,
            size: 9,
            font: helvetica,
            color: rgb(0.35, 0.35, 0.35),
        })
        y -= 18
    }
}
