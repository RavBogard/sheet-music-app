import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"
import { normalizeChartTitle } from "@/lib/library/normalize-chart-title"
import { scrapeChart } from "@/lib/chart-scrape"
import { DriveClient } from "@/lib/google-drive"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
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
 *
 * Cycle-2 REG-001b/MCP-003: every error returns the canonical rich envelope.
 */

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

function uploadForbidden(roles: UploaderRoles): RichErrorEnvelope {
    return forbiddenRoleEnvelope({
        callerRole: roles.role ?? null,
        requiredRoles: ["admin", "band_leader", "musician"],
        message:
            "Upload permission required. Ask an admin to enable uploads for your account.",
        hint: "Ask an admin to add you as admin / band_leader / musician, or set canUpload on your user doc.",
        context: { canUpload: roles.canUpload },
    })
}

function rateLimitEnvelope(reason: string): RichErrorEnvelope {
    return richError(
        "rate_limited",
        reason,
        undefined,
        "Retry after the cooldown window, or ask an admin to bypass via trusted-leader role.",
    )
}

function curatedCatalogGate(
    roles: UploaderRoles,
    collection: LibraryCollection | undefined,
): RichErrorEnvelope | null {
    // Curated catalogs ('core' = main CRC liturgy, 'supplemental' = Shireinu)
    // are reserved for admin AND band_leader. Musicians + canUpload-only users
    // still default to 'uploads'. Curated DELETE remains admin-only (handled
    // in deleteChart) — destructive ops on curated stay stricter.
    if (
        (collection === "core" || collection === "supplemental") &&
        !isTrustedLeader(roles)
    ) {
        return forbiddenRoleEnvelope({
            callerRole: roles.role ?? null,
            requiredRoles: ["admin", "band_leader"],
            message: `Writing to the '${collection}' catalog requires an admin or band leader account.`,
            hint: "Pick collection: 'uploads' (default) or ask an admin/band leader to add this to the curated catalog.",
            context: { collection },
        })
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
    /** Bypass dedup (exact + fuzzy). H-3 override for legitimate variants. */
    force?: boolean
}

export async function uploadChart(
    uid: string,
    args: UploadChartArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | RichErrorEnvelope
> {
    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    // G-8: Buffer.from(s, "base64") never throws — it just silently produces
    // a short/empty buffer for non-base64 input — so we need to format-check
    // before decoding. Standard RFC 4648 alphabet only (no url-safe `-_`,
    // which Buffer accepts but most MCP callers won't be sending).
    const stripped = args.fileBase64.replace(/\s/g, "")
    if (stripped.length === 0)
        return richError(
            "empty_file",
            "Decoded file is empty.",
            { field: "fileBase64" },
        )
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped))
        return richError(
            "invalid_base64",
            "fileBase64 must be standard base64 (RFC 4648). Got non-base64 characters.",
            { field: "fileBase64" },
        )
    if (stripped.length % 4 !== 0)
        return richError(
            "invalid_base64",
            "fileBase64 length must be a multiple of 4 (padded with '=').",
            { field: "fileBase64" },
        )
    const buffer = Buffer.from(stripped, "base64")
    if (buffer.byteLength === 0)
        return richError(
            "empty_file",
            "Decoded file is empty.",
            { field: "fileBase64" },
        )

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
        force: args.force,
    })

    if (!result.ok)
        return richError(
            "upload_failed",
            result.error,
            { tool: "upload_chart" },
            "Inspect the message; if dedup-related, retry with force: true.",
        )
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
    /** Bypass dedup (exact + fuzzy). H-3 override for legitimate variants. */
    force?: boolean
    /**
     * Cycle-5 C5C-008 — F-05 dryRun. When true, run all gates + Drive
     * metadata fetch + dedup probe but DO NOT download bytes or write to
     * Storage/Firestore. Returns the predicted shape so callers (supervisor
     * agents, Claude Desktop preview) can inspect a planned import before
     * committing. Pairs with the dryRun support on bulk_update_tracks /
     * publish_setlist / reconcile_library. Per
     * [[feedback_dryrun_is_observability]], dryRun is observability and
     * does NOT require force.
     */
    dryRun?: boolean
}

export interface ImportChartFromDriveDryRunResult {
    ok: true
    wouldCommit: false
    dryRun: true
    driveFileId: string
    driveName: string
    /** Title after the same `normalizeChartTitle` pass processChartUpload
     *  would apply (trim + collapse whitespace + NBSP). */
    predictedTitle: string
    /** Effective mimeType the index row would carry. */
    predictedMimeType: string
    predictedCollection: LibraryCollection
    /**
     * library-relative Storage path SHAPE. The actual `upload-<uuid>`
     * suffix is computed at commit time, so we surface the prefix +
     * predicted extension only.
     */
    targetStoragePath: string
    /** Highest similarity score (0..1) against an active library row, or
     *  null when no candidate matched the prefix index. */
    dedupScore: number | null
    /** Best-matching active library row, or null when no candidate hit. */
    dedupMatchedRow:
        | { fileId: string; name: string; matchKind: "exact" | "similar" }
        | null
    /** Whether the AI enrichment subscriber would run on the committed row. */
    aiEnrichmentPlan: { wouldRun: boolean; reason: string }
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
/**
 * Cycle-5 C5C-009 — Map a raw Drive API error onto a canonical rich-error
 * envelope distinguishing 404 (file not found), 403 (permission denied),
 * and other failures. Used by both the metadata probe and the byte fetch.
 *
 * Drive errors thrown by `googleapis` typically carry a numeric `.code` or
 * `.status`; some shapes only surface the failure mode in `.message`. Match
 * both so we don't regress on transport variants.
 */
function mapDriveError(
    err: unknown,
    driveFileId: string,
    op: "metadata" | "download",
): RichErrorEnvelope {
    const e = err as { code?: number; status?: number; message?: string }
    const statusCandidate =
        typeof e?.code === "number"
            ? e.code
            : typeof e?.status === "number"
              ? e.status
              : null
    const message = e?.message ?? String(err)

    const looksLike404 = statusCandidate === 404 || /not found|404/i.test(message)
    const looksLike403 =
        statusCandidate === 403 ||
        /permission|forbidden|403|insufficientPermissions/i.test(message)

    if (looksLike404) {
        return richError(
            "drive_file_not_found",
            `Drive file ${driveFileId} not found.`,
            { driveFileId, errorCode: 404 },
            "Verify the Drive id and that the file hasn't been deleted, moved out of a shared folder, or never existed.",
        )
    }
    if (looksLike403) {
        return richError(
            "drive_permission_denied",
            `Drive denied access to file ${driveFileId} for the service account.`,
            { driveFileId, errorCode: 403 },
            "Share the file or its containing folder with the service account (viewer access).",
        )
    }
    if (op === "metadata") {
        return richError(
            "drive_metadata_failed",
            `Could not read Drive file ${driveFileId} metadata: ${message}`,
            { driveFileId, errorCode: 502 },
            "Verify the file id and that the service account has at least viewer access.",
        )
    }
    return richError(
        "drive_download_failed",
        `Could not download Drive file ${driveFileId}: ${message}`,
        { driveFileId, errorCode: 502 },
        "Verify the file id and that the service account has at least viewer access.",
    )
}

/**
 * Levenshtein distance for the dryRun fuzzy-dedup probe. Mirrors the
 * implementation in `library-upload.ts` (the actual write-path source of
 * truth). Kept inline here to avoid widening the public surface of that
 * module; if a third caller needs it, factor out together.
 */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length
    const m = a.length
    const n = b.length
    const dp = new Array<number>(n + 1)
    for (let j = 0; j <= n; j++) dp[j] = j
    for (let i = 1; i <= m; i++) {
        let prev = i - 1
        dp[0] = i
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j]
            dp[j] =
                a[i - 1] === b[j - 1]
                    ? prev
                    : Math.min(prev, dp[j - 1], dp[j]) + 1
            prev = tmp
        }
    }
    return dp[n]
}

interface DedupProbeResult {
    score: number | null
    matchedRow:
        | { fileId: string; name: string; matchKind: "exact" | "similar" }
        | null
}

async function probeDedup(
    db: FirebaseFirestore.Firestore,
    title: string,
): Promise<DedupProbeResult> {
    const nameLower = title.toLowerCase()
    const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")

    const exactSnap = await db
        .collection("library_index")
        .where("nameLower", "==", nameLower)
        .limit(5)
        .get()
    const exactHit = exactSnap.docs.find(
        (d) => (d.data() as Record<string, unknown>).status === "active",
    )
    if (exactHit) {
        const data = exactHit.data() as Record<string, unknown>
        return {
            score: 1,
            matchedRow: {
                fileId: exactHit.id,
                name: typeof data.name === "string" ? data.name : exactHit.id,
                matchKind: "exact",
            },
        }
    }

    const prefix = normalizedName.slice(0, 6)
    if (prefix.length < 3) return { score: null, matchedRow: null }

    const prefixEnd =
        prefix.slice(0, -1) +
        String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
    const similarSnap = await db
        .collection("library_index")
        .where("normalizedName", ">=", prefix)
        .where("normalizedName", "<", prefixEnd)
        .select("name", "normalizedName", "status")
        .limit(20)
        .get()

    let bestScore = 0
    let bestRow: DedupProbeResult["matchedRow"] = null
    for (const doc of similarSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        if (data.status !== "active") continue
        const existingName = typeof data.name === "string" ? data.name : doc.id
        const normalizedExisting =
            (typeof data.normalizedName === "string"
                ? data.normalizedName
                : existingName.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? ""
        const distance = levenshtein(normalizedName, normalizedExisting)
        const maxLength = Math.max(
            normalizedName.length,
            normalizedExisting.length,
        )
        if (maxLength === 0) continue
        const similarity = 1 - distance / maxLength
        if (similarity > bestScore) {
            bestScore = similarity
            bestRow = {
                fileId: doc.id,
                name: existingName,
                matchKind: similarity > 0.85 ? "similar" : "exact",
            }
        }
    }
    if (!bestRow) return { score: null, matchedRow: null }
    // Demote a `<= 0.85` best match to "no actionable hit" but still
    // surface the score so callers can see the dedup probe's verdict.
    if (bestScore <= 0.85) {
        return { score: bestScore, matchedRow: null }
    }
    return {
        score: bestScore,
        matchedRow: bestRow ? { ...bestRow, matchKind: "similar" } : null,
    }
}

function predictedExtensionFor(mimeType: string, fallbackName: string): string {
    const mt = mimeType.toLowerCase()
    if (mt.includes("pdf")) return ".pdf"
    if (mt === "image/png") return ".png"
    if (mt === "image/jpeg") return ".jpg"
    if (mt === "image/heic") return ".heic"
    if (mt === "image/heif") return ".heif"
    if (mt.includes("musescore")) return ".mscz"
    if (mt.includes("musicxml")) return ".musicxml"
    if (mt.includes("xml")) return ".xml"
    if (mt.startsWith("text/")) return ".txt"
    const fileExt = fallbackName.match(/\.([a-z0-9]+)$/i)?.[1]
    return fileExt ? `.${fileExt.toLowerCase()}` : ""
}

export async function importChartFromDrive(
    uid: string,
    args: ImportChartFromDriveArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | ImportChartFromDriveDryRunResult
    | RichErrorEnvelope
> {
    if (!args.driveFileId?.trim())
        return richError(
            "invalid_argument",
            "driveFileId must be a non-empty string.",
            { field: "driveFileId" },
        )

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const driveFileId = args.driveFileId.trim()
    const drive = new DriveClient()

    let metadata: { name?: string | null; mimeType?: string | null } | undefined
    try {
        metadata = (await drive.getFileMetadata(driveFileId)) as {
            name?: string | null
            mimeType?: string | null
        }
    } catch (err) {
        logger.warn(
            `[import_chart_from_drive] metadata fetch failed for ${driveFileId}: ${err instanceof Error ? err.message : "Unknown error"}`,
        )
        return mapDriveError(err, driveFileId, "metadata")
    }

    const driveMime = (metadata?.mimeType || "").toLowerCase()
    // Cycle-5 C5C-015 — folder vs Docs branch. The pre-fix error told users
    // to "export to PDF" even when they passed a folder id, which is
    // nonsensical (folders aren't documents). Distinguish folders explicitly.
    if (driveMime === "application/vnd.google-apps.folder") {
        return richError(
            "drive_invalid_target",
            `Drive id ${driveFileId} points to a folder, not a chart file.`,
            { driveFileId, mimeType: driveMime, errorCode: 400 },
            "Open the folder in Drive, pick a chart PDF (or other supported file) inside, and pass that file's id (the segment after /file/d/ in the URL).",
        )
    }
    if (driveMime.startsWith("application/vnd.google-apps.")) {
        return richError(
            "unsupported_drive_native_type",
            `Drive file ${driveFileId} is a native Google ${driveMime.replace(
                "application/vnd.google-apps.",
                "",
            )} document — export it to PDF in Drive first, then import the exported file.`,
            { driveFileId, mimeType: driveMime, errorCode: 400 },
            "In Drive: File → Download → PDF; then import_chart_from_drive on the exported file.",
        )
    }

    const driveName = (metadata?.name || `drive-${driveFileId}`).trim()
    const title = normalizeChartTitle(
        args.title?.trim() || driveName.replace(/\.[^/.]+$/, ""),
    )
    const mimeType = driveMime || "application/pdf"
    const predictedCollection: LibraryCollection = args.collection ?? "uploads"

    // ─── C5C-008 dryRun branch: probe, don't write ──────────────────────────
    if (args.dryRun === true) {
        const dedup = await probeDedup(db, title)
        const ext = predictedExtensionFor(mimeType, driveName)
        const targetStoragePath = `library/upload-<new-uuid>${ext}`
        const wouldRunAi = !!process.env.GEMINI_API_KEY
        return {
            ok: true,
            wouldCommit: false,
            dryRun: true,
            driveFileId,
            driveName,
            predictedTitle: title,
            predictedMimeType: mimeType,
            predictedCollection,
            targetStoragePath,
            dedupScore: dedup.score,
            dedupMatchedRow: dedup.matchedRow,
            aiEnrichmentPlan: {
                wouldRun: wouldRunAi,
                reason: wouldRunAi
                    ? "GEMINI_API_KEY is configured; the post-import subscriber will run."
                    : "GEMINI_API_KEY is not set; the post-import subscriber will skip enrichment (status stays 'pending').",
            },
        }
    }

    let buffer: Buffer
    try {
        const bytes = await drive.getFile(driveFileId)
        // DriveClient returns arraybuffer (responseType: 'arraybuffer'); Node
        // sees it as ArrayBuffer or Buffer depending on transport. Normalize.
        buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
    } catch (err) {
        logger.warn(
            `[import_chart_from_drive] bytes fetch failed for ${driveFileId}: ${err instanceof Error ? err.message : "Unknown error"}`,
        )
        return mapDriveError(err, driveFileId, "download")
    }

    if (buffer.byteLength === 0)
        return richError(
            "empty_file",
            `Drive file ${driveFileId} is empty.`,
            { driveFileId, errorCode: 400 },
        )

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
        force: args.force,
    })

    if (!result.ok) {
        // Cycle-5 C5C-009 — surface dedup-class failures as 409
        // `duplicate_detected_in_library` so callers can distinguish a
        // legitimate-variant escape-hatch case (resolve with force:true)
        // from a real upload failure.
        if (result.code === "duplicate_exact" || result.code === "duplicate_similar") {
            return richError(
                "duplicate_detected_in_library",
                result.error,
                {
                    tool: "import_chart_from_drive",
                    driveFileId,
                    matchKind: result.code === "duplicate_exact" ? "exact" : "similar",
                    errorCode: 409,
                },
                "If this is a legitimate variant (different key, arrangement, composer suffix), retry with force: true. Otherwise rename the file in Drive before re-importing.",
            )
        }
        return richError(
            "upload_failed",
            result.error,
            {
                tool: "import_chart_from_drive",
                driveFileId,
                errorCode: result.status ?? 500,
            },
            "Inspect the message; if dedup-related, retry with force: true.",
        )
    }
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
): Promise<{ ok: true; deletedTracks: number } | RichErrorEnvelope> {
    if (!args.fileId?.trim())
        return richError(
            "invalid_argument",
            "fileId must be a non-empty string.",
            { field: "fileId" },
        )

    initAdmin()
    const db = getFirestore()

    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const indexRef = db.collection("library_index").doc(args.fileId)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists)
        return richError(
            "chart_not_found",
            `Chart '${args.fileId}' was not found in library_index.`,
            { fileId: args.fileId },
            "Verify the fileId via list_library / search_library.",
        )
    const indexData = indexSnap.data() as Record<string, unknown>

    if (roles.role !== "admin" && indexData.uploadedBy !== uid) {
        return forbiddenRoleEnvelope({
            callerRole: roles.role ?? null,
            requiredRoles: ["admin"],
            message:
                "Only the chart's uploader or an admin may delete a chart.",
            hint: "Ask the uploader or an admin to delete the chart.",
            context: {
                fileId: args.fileId,
                uploadedBy:
                    typeof indexData.uploadedBy === "string"
                        ? indexData.uploadedBy
                        : null,
            },
        })
    }

    const collection = indexData.collection as string | undefined
    if (
        (collection === "core" || collection === "supplemental") &&
        roles.role !== "admin"
    ) {
        return forbiddenRoleEnvelope({
            callerRole: roles.role ?? null,
            requiredRoles: ["admin"],
            message: `Deleting from the '${collection}' catalog requires an admin account.`,
            hint: "Ask an admin to delete this curated-catalog chart.",
            context: { fileId: args.fileId, collection },
        })
    }

    const tracksSnap = await db
        .collection("tracks")
        .where("fileId", "==", args.fileId)
        .limit(50)
        .get()
    if (!tracksSnap.empty) {
        return richError(
            "chart_in_use",
            `Cannot delete: this chart is bonded to ${tracksSnap.size} setlist track(s).`,
            { fileId: args.fileId, boundTracks: tracksSnap.size },
            "Remove the tracks first via remove_track, then retry delete_chart.",
        )
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
    | RichErrorEnvelope
> {
    if (!args.url && !args.rawText)
        return richError(
            "invalid_argument",
            "Either url or rawText is required.",
            { fields: ["url", "rawText"] },
        )

    initAdmin()
    const db = getFirestore()
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    // Scrape uses Gemini, so meter it under the 'ai' bucket to bound spend.
    const limited = await checkUserRateLimit(uid, "ai", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const result = await scrapeChart(args)
    if (!result.ok)
        return richError(
            "scrape_failed",
            result.error,
            { tool: "scrape_chart_from_url" },
            "Try again, paste the chart text via rawText, or use upload_chart with a downloaded copy.",
        )
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
    /** Bypass dedup (exact + fuzzy). H-3 override for legitimate variants. */
    force?: boolean
}

export async function saveScrapedChart(
    uid: string,
    args: SaveScrapedChartArgs,
): Promise<
    | { ok: true; fileId: string; title: string; collection: LibraryCollection }
    | RichErrorEnvelope
> {
    if (!args.title?.trim())
        return richError("invalid_argument", "title is required.", {
            field: "title",
        })
    if (!args.content?.trim())
        return richError("invalid_argument", "content is required.", {
            field: "content",
        })

    initAdmin()
    const db = getFirestore()
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const curatedDenial = curatedCatalogGate(roles, args.collection)
    if (curatedDenial) return curatedDenial

    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

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
        force: args.force,
    })

    if (!result.ok)
        return richError(
            "upload_failed",
            result.error,
            { tool: "save_scraped_chart" },
            "Inspect the message; if dedup-related, retry with force: true.",
        )
    return {
        ok: true,
        fileId: result.fileId,
        title: result.title,
        collection: result.collection,
    }
}
