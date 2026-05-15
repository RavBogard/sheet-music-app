import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"
import { scrapeChart } from "@/lib/chart-scrape"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"

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

/** Trusted-leader role — bypasses rate limits AND gates curated-catalog writes. */
function isTrustedLeader(roles: UploaderRoles): boolean {
    return roles.role === "admin" || roles.role === "band_leader"
}

function curatedCatalogGate(
    roles: UploaderRoles,
    collection: LibraryCollection | undefined,
): ToolError | null {
    // Curated catalogs ('core' = main CRC liturgy, 'supplemental' = Shireinu)
    // are reserved for admin AND band_leader. Musicians + canUpload-only users
    // still default to 'uploads'. Curated DELETE remains admin-only (handled
    // in deleteChart) — destructive ops on curated stay stricter.
    if (
        (collection === "core" || collection === "supplemental") &&
        !isTrustedLeader(roles)
    ) {
        return {
            error:
                `Writing to the '${collection}' catalog requires an admin or band leader account. ` +
                `Pick collection: 'uploads' (default) or ask an admin/band leader to add this to the curated catalog.`,
        }
    }
    return null
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

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return { error: limited.error }

    // G-8: Buffer.from(s, "base64") never throws — it just silently produces
    // a short/empty buffer for non-base64 input — so we need to format-check
    // before decoding. Standard RFC 4648 alphabet only (no url-safe `-_`,
    // which Buffer accepts but most MCP callers won't be sending).
    const stripped = args.fileBase64.replace(/\s/g, "")
    if (stripped.length === 0) {
        return { error: "Decoded file is empty" }
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped)) {
        return {
            error: "fileBase64 must be standard base64 (RFC 4648). Got non-base64 characters.",
        }
    }
    if (stripped.length % 4 !== 0) {
        return {
            error: "fileBase64 length must be a multiple of 4 (padded with '=').",
        }
    }
    const buffer = Buffer.from(stripped, "base64")
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

// ─── import_chart_from_drive ────────────────────────────────────────────────

export interface ImportChartFromDriveArgs {
    /** Google Drive file id (the segment after /file/d/ in a Drive URL). */
    driveFileId: string
    /** Optional display title override. Drive file name (sans extension) used otherwise. */
    title?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
}

/**
 * Pull a chart's bytes from Google Drive server-side, then run them through
 * the same `processChartUpload` pipeline as `upload_chart`. Closes the
 * 2026-05-15 cowork-reported `upload_chart` hang on base64 payloads — the
 * MCP request itself stays tiny (one Drive id, no base64), and the bytes
 * never round-trip through claude.ai → MCP transport → JSON envelope.
 *
 * Auth, curated-catalog gate, and rate-limit semantics mirror `upload_chart`
 * exactly. Google Docs / Sheets / Slides native types are rejected with a
 * clear "export to PDF first" message — those need .export(), not .get(),
 * and the conversion target is ambiguous (full doc? one slide? PDF? .docx?).
 */
export async function importChartFromDrive(
    uid: string,
    args: ImportChartFromDriveArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | ToolError
> {
    if (!args.driveFileId?.trim()) {
        return { error: "driveFileId is required" }
    }

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return {
            error: "Upload permission required. Ask an admin to enable uploads for your account.",
        }
    }

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return { error: limited.error }

    const driveFileId = args.driveFileId.trim()
    const drive = new DriveClient()

    let metadata: { name?: string | null; mimeType?: string | null } | undefined
    try {
        metadata = (await drive.getFileMetadata(driveFileId)) as {
            name?: string | null
            mimeType?: string | null
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        logger.warn(
            `[import_chart_from_drive] metadata fetch failed for ${driveFileId}: ${message}`,
        )
        return {
            error: `Could not read Drive file ${driveFileId} metadata: ${message}`,
        }
    }

    const driveMime = (metadata?.mimeType || "").toLowerCase()
    if (driveMime.startsWith("application/vnd.google-apps.")) {
        return {
            error:
                `Drive file ${driveFileId} is a native Google ${driveMime.replace(
                    "application/vnd.google-apps.",
                    "",
                )} document — export it to PDF in Drive first, then import the exported file.`,
        }
    }

    let buffer: Buffer
    try {
        const bytes = await drive.getFile(driveFileId)
        // DriveClient returns arraybuffer (responseType: 'arraybuffer'); Node
        // sees it as ArrayBuffer or Buffer depending on transport. Normalize.
        buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        logger.warn(
            `[import_chart_from_drive] bytes fetch failed for ${driveFileId}: ${message}`,
        )
        return {
            error: `Could not download Drive file ${driveFileId}: ${message}`,
        }
    }

    if (buffer.byteLength === 0) {
        return { error: `Drive file ${driveFileId} is empty` }
    }

    const driveName = (metadata?.name || `drive-${driveFileId}`).trim()
    const title =
        args.title?.trim() || driveName.replace(/\.[^/.]+$/, "")
    const mimeType = driveMime || "application/pdf"

    const result = await processChartUpload({
        buffer,
        originalFileName: driveName,
        mimeType,
        title,
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

// ─── delete_chart ───────────────────────────────────────────────────────────

export interface DeleteChartArgs {
    fileId: string
}

/**
 * Delete a chart from the library. Closes the asymmetric "anyone can upload
 * but no MCP path to delete" gap the 2026-05-15 stress test surfaced.
 *
 * Auth model:
 *  - admin OR chart uploader may delete (mirrors delete_setlist's stricter gate).
 *  - core/supplemental deletes require admin even if the caller uploaded it.
 *  - Refuses if ANY setlist track still references this fileId — caller must
 *    clear the bonds via remove_track first. Auto-unbinding would silently
 *    break the perform view for any published setlist using the chart.
 *
 * Storage cleanup is best-effort: the library_index doc is the source of
 * truth, so an orphan blob is harmless and shouldn't fail the operation.
 */
export async function deleteChart(
    uid: string,
    args: DeleteChartArgs,
): Promise<{ ok: true; deletedTracks: number } | ToolError> {
    if (!args.fileId?.trim()) return { error: "fileId is required" }

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) {
        return {
            error: "Upload permission required. Ask an admin to enable uploads for your account.",
        }
    }

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return { error: limited.error }

    const indexRef = db.collection("library_index").doc(args.fileId)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists) return { error: "Chart not found" }
    const indexData = indexSnap.data() as Record<string, unknown>

    if (roles.role !== "admin" && indexData.uploadedBy !== uid) {
        return {
            error: "Only the chart's uploader or an admin may delete a chart",
        }
    }

    const collection = indexData.collection as string | undefined
    if (
        (collection === "core" || collection === "supplemental") &&
        roles.role !== "admin"
    ) {
        return {
            error: `Deleting from the '${collection}' catalog requires an admin account`,
        }
    }

    const tracksSnap = await db
        .collection("tracks")
        .where("fileId", "==", args.fileId)
        .limit(50)
        .get()
    if (!tracksSnap.empty) {
        return {
            error:
                `Cannot delete: this chart is bonded to ${tracksSnap.size} setlist ` +
                `track(s). Remove the tracks first via remove_track, then retry.`,
        }
    }

    const songRef = db.collection("songs").doc(args.fileId)
    const batch = db.batch()
    batch.delete(indexRef)
    batch.delete(songRef)
    await batch.commit()

    // Bump the library cache-invalidation signal so any open library views
    // refetch — same channel processChartUpload writes to on success. Best-
    // effort; never fail the delete on this.
    try {
        await db.collection("library_signals").doc("latest").set({
            at: new Date().toISOString(),
            fileId: args.fileId,
            op: "delete",
            by: uid,
        })
    } catch (sigErr) {
        logger.warn(
            `[delete_chart] library_signals write failed (non-fatal): ` +
                (sigErr instanceof Error ? sigErr.message : sigErr),
        )
    }

    const storagePaths: string[] = []
    if (typeof indexData.storageUrl === "string" && indexData.storageUrl) {
        storagePaths.push(indexData.storageUrl)
    }
    if (
        typeof indexData.originalStorageUrl === "string" &&
        indexData.originalStorageUrl
    ) {
        storagePaths.push(indexData.originalStorageUrl)
    }
    if (storagePaths.length > 0) {
        try {
            const { getStorage } = await import("firebase-admin/storage")
            const bucket = getStorage().bucket()
            await Promise.all(
                storagePaths.map((p) =>
                    bucket
                        .file(p)
                        .delete()
                        .catch((err) => {
                            logger.warn(
                                `[delete_chart] storage cleanup failed for ${p}: ${
                                    err instanceof Error ? err.message : err
                                }`,
                            )
                        }),
                ),
            )
        } catch (err) {
            logger.warn(
                `[delete_chart] storage module unavailable: ${
                    err instanceof Error ? err.message : err
                }`,
            )
        }
    }

    return { ok: true, deletedTracks: 0 }
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
    const limited = await checkUserRateLimit(uid, "ai", {
        bypass: isTrustedLeader(roles),
    })
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

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
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
