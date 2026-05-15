import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"
import { scrapeChart } from "@/lib/chart-scrape"

/**
 * MCP chart-ingestion tools — three ways to add a chart to the library, all
 * shared with the corresponding HTTP routes (no parallel codepaths).
 *
 *  - upload_chart       — direct file upload (PDF / image / MusicXML / etc).
 *                          Wraps @/lib/library-upload :: processChartUpload,
 *                          same path /api/library/upload uses.
 *  - scrape_chart_from_url — wraps @/lib/chart-scrape :: scrapeChart, returns
 *                          Gemini-extracted {title, artist, content}. No
 *                          write yet — discovery only.
 *  - save_scraped_chart — packages chord-chart text as a .txt and uploads
 *                          via processChartUpload. Mirrors the in-app
 *                          ScraperModal flow exactly (which also lands in
 *                          library/upload as text/plain).
 *
 * Per-user rate limits on the writes (`upload` tier, 10/min/user) — request-
 * based limits would conflate all CRC users on Claude's egress IPs.
 */

type ToolError = { error: string }

interface UploaderRoles {
    role: string | undefined
    canUpload: boolean
    email: string | undefined
}

async function loadUploader(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<UploaderRoles> {
    const snap = await db.collection("users").doc(uid).get()
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    return {
        role: typeof d.role === "string" ? d.role : undefined,
        canUpload: d.canUpload === true,
        email: typeof d.email === "string" ? d.email : undefined,
    }
}

function isUploadAllowed(roles: UploaderRoles): boolean {
    // Mirror the HTTP route's gate: admin / band_leader / musician roles all
    // get upload by default; anyone else needs the explicit canUpload flag.
    if (roles.role === "admin") return true
    if (roles.role === "band_leader") return true
    if (roles.role === "musician") return true
    return roles.canUpload
}

// ─── upload_chart ───────────────────────────────────────────────────────────

export interface UploadChartArgs {
    title: string
    /** Base64-encoded file bytes — PDF, MusicXML, MuseScore, image, HEIC, text. */
    fileBase64: string
    /** MIME type of the file as sent. */
    mimeType: string
    /** Optional filename — used for ext detection on conversion paths. */
    fileName?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
}

export async function uploadChart(
    uid: string,
    args: UploadChartArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | ToolError
> {
    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return {
            error: "Upload permission required. Ask an admin to enable uploads for your account.",
        }
    }

    const limited = await checkUserRateLimit(uid, "upload")
    if (limited) return { error: limited.error }

    let buffer: Buffer
    try {
        buffer = Buffer.from(args.fileBase64, "base64")
    } catch {
        return { error: "fileBase64 is not valid base64 data" }
    }
    if (buffer.byteLength === 0) {
        return { error: "Decoded file is empty" }
    }

    const fileName =
        args.fileName?.trim() ||
        deriveFileName(args.title, args.mimeType)

    const result = await processChartUpload({
        buffer,
        originalFileName: fileName,
        mimeType: args.mimeType,
        title: args.title,
        collection: args.collection,
        key: args.key,
        bpm: args.bpm,
        tags: args.tags,
        uploaderUid: uid,
        uploaderEmail: roles.email,
    })

    if (!result.ok) return { error: result.error }
    return {
        ok: true,
        fileId: result.fileId,
        title: result.title,
        collection: result.collection,
    }
}

function deriveFileName(title: string, mimeType: string): string {
    const safe = title.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "chart"
    const ext = mimeType.includes("pdf")
        ? ".pdf"
        : mimeType === "image/png"
            ? ".png"
            : mimeType === "image/jpeg"
                ? ".jpg"
                : mimeType === "image/heic"
                    ? ".heic"
                    : mimeType === "image/heif"
                        ? ".heif"
                        : mimeType.includes("musescore")
                            ? ".mscz"
                            : mimeType.includes("musicxml")
                                ? ".musicxml"
                                : mimeType.includes("xml")
                                    ? ".xml"
                                    : ".txt"
    return `${safe}${ext}`
}

// ─── scrape_chart_from_url ──────────────────────────────────────────────────

export interface ScrapeChartFromUrlArgs {
    url?: string
    rawText?: string
}

export async function scrapeChartFromUrl(
    uid: string,
    args: ScrapeChartFromUrlArgs,
): Promise<
    | { ok: true; title: string; artist: string; content: string }
    | ToolError
> {
    if (!args.url && !args.rawText) {
        return { error: "Either url or rawText is required" }
    }

    initAdmin()
    const db = getFirestore()
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return {
            error: "Upload permission required. Ask an admin to enable uploads for your account.",
        }
    }

    // Scrape uses Gemini, so meter it under the 'ai' bucket to bound spend.
    const limited = await checkUserRateLimit(uid, "ai")
    if (limited) return { error: limited.error }

    const result = await scrapeChart(args)
    if (!result.ok) return { error: result.error }
    return {
        ok: true,
        title: result.title,
        artist: result.artist,
        content: result.content,
    }
}

// ─── save_scraped_chart ─────────────────────────────────────────────────────

export interface SaveScrapedChartArgs {
    title: string
    /** Chord chart text content (monospace-aligned). */
    content: string
    /** Optional artist — prepended to the saved file as a second line, matching
     *  the in-app ScraperModal format. */
    artist?: string
    collection?: LibraryCollection
}

export async function saveScrapedChart(
    uid: string,
    args: SaveScrapedChartArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | ToolError
> {
    if (!args.title?.trim()) return { error: "title is required" }
    if (!args.content?.trim()) return { error: "content is required" }

    initAdmin()
    const db = getFirestore()
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return {
            error: "Upload permission required. Ask an admin to enable uploads for your account.",
        }
    }

    const limited = await checkUserRateLimit(uid, "upload")
    if (limited) return { error: limited.error }

    // Match the ScraperModal payload shape: title + artist + blank line + content.
    const textContent = `${args.title}\n${args.artist ?? ""}\n\n${args.content}`
    const buffer = Buffer.from(textContent, "utf-8")
    const fileName =
        args.title.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase() + ".txt"

    const result = await processChartUpload({
        buffer,
        originalFileName: fileName,
        mimeType: "text/plain",
        title: args.title,
        collection: args.collection,
        uploaderUid: uid,
        uploaderEmail: roles.email,
    })

    if (!result.ok) return { error: result.error }
    return {
        ok: true,
        fileId: result.fileId,
        title: result.title,
        collection: result.collection,
    }
}
