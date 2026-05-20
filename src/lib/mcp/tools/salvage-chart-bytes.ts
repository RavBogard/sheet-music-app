import 'server-only'
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import {
    healChartBytes,
    inferChartExt,
    isAllowedChartMime,
    ALLOWED_CHART_MIME_PREFIXES,
} from "@/lib/chart-heal"

/**
 * Cycle-3 DATA-001 (Daniel-ratified 2026-05-18T18:45Z, decisions.md item 3)
 * — admin-only HEAL MCP tool that re-uploads chart bytes onto an EXISTING
 * orphaned `library_index/{fileId}` row, preserving every setlist/song
 * bond pointing at that fileId.
 *
 * Why this exists instead of "just re-upload through processChartUpload":
 *   - processChartUpload MINTS a fresh `upload-<uuid>` fileId. The original
 *     fileId would still exist in every setlist track + every song doc,
 *     pointing at dead bytes. The bond cannot be transferred without
 *     mass-rewriting every reference.
 *   - reconcile_library's force-run only mirrors when Drive has the bytes
 *     at the row's `driveFileId`. The 21 `upload-*` orphans have no Drive
 *     provenance — they came in via direct upload, not Drive sync, so a
 *     reconcile run cannot salvage them.
 *   - Marking orphan via `reconcile_library({force:true})` is irreversible
 *     per the dedupe orphan-status hide. Real song names (Ana B'Koach,
 *     Mizmor L'David, Tu Bishvat, ...) deserve a recovery path FIRST.
 *
 * Source-bytes resolution order:
 *   1. If `sourceUrl` is provided, fetch it (https only). Used when Daniel
 *      has a fresh copy of the chart in a different Drive folder, on his
 *      laptop served via tunnel, or anywhere else reachable over HTTP.
 *   2. Else if the row carries `driveFileId`, re-fetch from Drive (admin
 *      service account). Covers rows that DID come from Drive sync but
 *      whose Storage object was somehow lost.
 *   3. Else: refuse with `no_source_available`.
 *
 * HEAL contract (mirrors reconcile_library, NOT processChartUpload):
 *   1. Fetch bytes from sourceUrl or Drive
 *   2. Storage upload at the EXISTING fileId path (`library/{fileId}<ext>`)
 *   3. Read-verify by size — refuse to mutate Firestore on mismatch
 *   4. Firestore merge-update — preserves every curation field (key, bpm,
 *      tags, leadMusician, composer, bondCorrectionHistory, stem,
 *      titleSpecificity). Only sets: mimeType, fileSize, source:'salvage',
 *      status:'active', salvagedAt.
 *   5. Compensating-delete on Firestore failure — rolls Storage back so we
 *      never leave a reverse orphan (bytes-without-index-update).
 *   6. `library_signals/latest` broadcast — invalidates in-tab caches.
 *
 * Per [[feedback_upload_atomicity]] the contract above is the standing
 * rule for any chart-byte mutation path. Per [[feedback_dryrun_is_observability]]
 * dryRun returns the full plan without needing `force:true`; refusal-
 * without-force only fires on a real-run path. Per
 * [[feedback_admin_rate_limit_bypass]] admins bypass the per-uid rate
 * limiter (this tool inherits the trusted-leader bypass at the MCP
 * registration layer via `rateLimitBypass: isTrustedLeader`).
 *
 * Admin-only. band_leader is NOT trusted enough — salvage rewrites bytes
 * that every setlist using the bond will render, and the recovery
 * decision (which source URL, which Drive folder) needs operator-level
 * curation discipline.
 */

const MAX_FETCH_BYTES = 25 * 1024 * 1024 // 25 MB — matches processChartUpload's MAX_CHART_UPLOAD_BYTES

export interface SalvageChartBytesArgs {
    /** The orphaned library_index row's fileId — typically `upload-<uuid>`. */
    fileId: string
    /**
     * Optional HTTPS URL to fetch fresh bytes from. When omitted, the tool
     * falls back to re-fetching from Drive using the row's `driveFileId`
     * (if present). HTTP (non-TLS) URLs are refused.
     */
    sourceUrl?: string
    /** When true (default), do not write — return the plan only. F-05. */
    dryRun?: boolean
    /** Required for writes. Refuses with `refused:true` without `force:true`. */
    force?: boolean
}

export interface SalvageChartBytesOk {
    ok: true
    fileId: string
    /** What the row already carried — surfaced so the caller can sanity-check. */
    rowName: string
    /** Source the bytes came from on commit (dryRun reports the resolved plan). */
    source: "sourceUrl" | "drive" | "unknown"
    /** Mime that landed on the row (matches the source bytes). */
    mimeType: string
    /** Bytes written / would-be written. */
    sizeBytes: number
    /** Storage path written (library/{fileId}<ext>). */
    storagePath: string
    dryRun: boolean
    /** True when force omitted on a real-run — no writes happened. */
    refused?: boolean
}

export type SalvageChartBytesResult = SalvageChartBytesOk | RichErrorEnvelope

interface ResolvedSource {
    source: "sourceUrl" | "drive"
    buffer: Buffer
    mimeType: string
}

async function fetchFromSourceUrl(
    sourceUrl: string,
): Promise<
    | { ok: true; resolved: ResolvedSource }
    | { ok: false; envelope: RichErrorEnvelope }
> {
    let parsed: URL
    try {
        parsed = new URL(sourceUrl)
    } catch {
        // Cycle-5 C5D-011 — client-precondition failures land at 422
        // (Unprocessable Entity), reserving 500 for genuine server faults
        // (storage_upload_failed / firestore_write_failed). Pass
        // `errorCode: 422` so the envelope's `error.code` matches the
        // semantic; the machine_code isn't in ERROR_CODE_MAP so the
        // helper would otherwise default to 500.
        return {
            ok: false,
            envelope: richError(
                "invalid_source_url",
                `sourceUrl is not a valid URL: ${sourceUrl}`,
                { sourceUrl, errorCode: 422 },
                "Pass a fully-qualified https:// URL or omit sourceUrl to fall back to Drive.",
            ),
        }
    }
    if (parsed.protocol !== "https:") {
        return {
            ok: false,
            envelope: richError(
                "invalid_source_url",
                `sourceUrl must use https:// (got ${parsed.protocol}).`,
                { sourceUrl, protocol: parsed.protocol, errorCode: 422 },
                "Re-fetch from an https:// origin or omit sourceUrl to use Drive.",
            ),
        }
    }
    let res: Response
    try {
        res = await fetch(sourceUrl, { redirect: "follow" })
    } catch (err) {
        return {
            ok: false,
            envelope: richError(
                "source_fetch_failed",
                `Failed to fetch sourceUrl: ${err instanceof Error ? err.message : String(err)}`,
                { sourceUrl },
                "Verify the URL is reachable, or omit sourceUrl to fall back to Drive.",
            ),
        }
    }
    if (!res.ok) {
        return {
            ok: false,
            envelope: richError(
                "source_fetch_failed",
                `sourceUrl returned HTTP ${res.status}.`,
                { sourceUrl, httpStatus: res.status },
                "Verify the URL is reachable and serves the chart bytes.",
            ),
        }
    }
    const contentTypeHeader =
        res.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
    const mimeType = contentTypeHeader || "application/octet-stream"
    if (!isAllowedChartMime(mimeType)) {
        return {
            ok: false,
            envelope: richError(
                "invalid_source_mime",
                `sourceUrl served an unsupported mime '${mimeType}'.`,
                { sourceUrl, mimeType, errorCode: 422 },
                `Allowed: ${ALLOWED_CHART_MIME_PREFIXES.join(", ")}.`,
            ),
        }
    }
    const arrayBuf = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)
    if (buffer.byteLength === 0) {
        return {
            ok: false,
            envelope: richError(
                "source_fetch_empty",
                "sourceUrl returned 0 bytes.",
                { sourceUrl },
                "Verify the URL actually serves the chart payload.",
            ),
        }
    }
    if (buffer.byteLength > MAX_FETCH_BYTES) {
        return {
            ok: false,
            envelope: richError(
                "source_too_large",
                `sourceUrl payload (${buffer.byteLength} bytes) exceeds the ${MAX_FETCH_BYTES} byte limit.`,
                {
                    sourceUrl,
                    sizeBytes: buffer.byteLength,
                    maxBytes: MAX_FETCH_BYTES,
                    errorCode: 422,
                },
                "Trim the source file or upload via processChartUpload (fresh fileId) instead.",
            ),
        }
    }
    return { ok: true, resolved: { source: "sourceUrl", buffer, mimeType } }
}

async function fetchFromDrive(
    driveFileId: string,
    currentMimeType: string | null,
): Promise<
    | { ok: true; resolved: ResolvedSource }
    | { ok: false; envelope: RichErrorEnvelope }
> {
    const drive = new DriveClient()
    let raw: unknown
    try {
        raw = await drive.getFile(driveFileId)
    } catch (err) {
        return {
            ok: false,
            envelope: richError(
                "source_fetch_failed",
                `Drive fetch failed for ${driveFileId}: ${err instanceof Error ? err.message : String(err)}`,
                { driveFileId },
                "Pass an explicit sourceUrl, or confirm the Drive file is still shared with the service account.",
            ),
        }
    }
    const buffer = Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(raw as ArrayBuffer)
    if (buffer.byteLength === 0) {
        return {
            ok: false,
            envelope: richError(
                "source_fetch_empty",
                "Drive returned 0 bytes — surfacing as transient rather than overwriting Storage with nothing.",
                { driveFileId },
                "Re-run after the Drive blip, or pass sourceUrl with a fresh copy.",
            ),
        }
    }
    if (buffer.byteLength > MAX_FETCH_BYTES) {
        return {
            ok: false,
            envelope: richError(
                "source_too_large",
                `Drive payload (${buffer.byteLength} bytes) exceeds the ${MAX_FETCH_BYTES} byte limit.`,
                {
                    driveFileId,
                    sizeBytes: buffer.byteLength,
                    maxBytes: MAX_FETCH_BYTES,
                    errorCode: 422,
                },
                "Trim the source file or upload via processChartUpload (fresh fileId) instead.",
            ),
        }
    }
    // Drive doesn't return mime on download; reuse the row's stored mime
    // (which Drive sync populated) or default to PDF (the dominant chart type).
    const mimeType = currentMimeType || "application/pdf"
    if (!isAllowedChartMime(mimeType)) {
        return {
            ok: false,
            envelope: richError(
                "invalid_source_mime",
                `Drive payload has unsupported mime '${mimeType}'.`,
                { driveFileId, mimeType, errorCode: 422 },
                `Allowed: ${ALLOWED_CHART_MIME_PREFIXES.join(", ")}.`,
            ),
        }
    }
    return { ok: true, resolved: { source: "drive", buffer, mimeType } }
}

export async function salvageChartBytes(
    uid: string,
    args: SalvageChartBytesArgs,
): Promise<SalvageChartBytesResult> {
    const dryRun = args.dryRun !== false
    const force = args.force === true
    const fileId = args.fileId

    if (!fileId || typeof fileId !== "string") {
        return richError(
            "invalid_argument",
            "fileId is required and must be a string.",
            { argument: "fileId" },
            "Pass the orphaned library_index row's id (typically upload-<uuid>).",
        )
    }

    try {
        initAdmin()
        const db = getFirestore()

        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "salvage_chart_bytes is admin-only.",
                {
                    callerRole: role ?? null,
                    requiredRoles: ["admin"],
                },
                "Ask an admin to run this tool.",
            )
        }

        const rowSnap = await db.collection("library_index").doc(fileId).get()
        if (!rowSnap.exists) {
            return richError(
                "row_not_found",
                `library_index/${fileId} does not exist.`,
                { fileId },
                "Verify the fileId via reconcile_library({dryRun:true}).orphan.rows[] or list_library.",
            )
        }
        const rowData = rowSnap.data() ?? {}
        const rowName =
            (typeof rowData.name === "string" && rowData.name) ||
            (typeof rowData.title === "string" && rowData.title) ||
            fileId
        const currentMimeType =
            typeof rowData.mimeType === "string" ? rowData.mimeType : null
        const driveFileId =
            typeof rowData.driveFileId === "string" ? rowData.driveFileId : null

        // Resolve source bytes. sourceUrl wins; fall back to Drive; else
        // surface no_source_available so the caller knows what to do.
        let resolved: ResolvedSource | null = null
        if (args.sourceUrl) {
            const r = await fetchFromSourceUrl(args.sourceUrl)
            if (!r.ok) return r.envelope
            resolved = r.resolved
        } else if (driveFileId) {
            const r = await fetchFromDrive(driveFileId, currentMimeType)
            if (!r.ok) return r.envelope
            resolved = r.resolved
        } else {
            return richError(
                "no_source_available",
                `library_index/${fileId} has no driveFileId and no sourceUrl was provided. Cannot resolve bytes.`,
                { fileId, hasDriveFileId: false, errorCode: 422 },
                "Pass an explicit sourceUrl (https URL serving the chart bytes).",
            )
        }

        const storagePath = `library/${fileId}${inferChartExt(resolved.mimeType)}`

        if (dryRun) {
            return {
                ok: true,
                fileId,
                rowName,
                source: resolved.source,
                mimeType: resolved.mimeType,
                sizeBytes: resolved.buffer.byteLength,
                storagePath,
                dryRun: true,
            }
        }

        if (!force) {
            // Real-run without force — F-05 refusal. Uses the legacy
            // `{ok:true, refused:true}` shape for consistency with sibling
            // hygiene tools (reconcile_library / backfill_library_index /
            // backfill_setlist_test_flag). The cycle3-envelope agent's
            // REG-003 sweep migrates this to the rich `force_required`
            // envelope across all F-05 tools in one pass.
            return {
                ok: true,
                fileId,
                rowName,
                source: resolved.source,
                mimeType: resolved.mimeType,
                sizeBytes: resolved.buffer.byteLength,
                storagePath,
                dryRun: false,
                refused: true,
            }
        }

        // ─── HEAL via the shared atomic guard ([[feedback_upload_atomicity]]) ─
        const healed = await healChartBytes(
            db,
            uid,
            fileId,
            resolved.buffer,
            resolved.mimeType,
            resolved.source,
        )
        if (!("ok" in healed) || !healed.ok) return healed

        logger.info("[mcp] salvage_chart_bytes committed", {
            uid,
            fileId,
            source: resolved.source,
            sizeBytes: resolved.buffer.byteLength,
            mimeType: resolved.mimeType,
        })

        return {
            ok: true,
            fileId,
            rowName,
            source: resolved.source,
            mimeType: resolved.mimeType,
            sizeBytes: resolved.buffer.byteLength,
            storagePath: healed.storagePath,
            dryRun: false,
        }
    } catch (err) {
        logger.warn(
            `[mcp] salvage_chart_bytes failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "internal_error",
            "Failed to salvage chart bytes.",
            { fileId, tool: "salvage_chart_bytes" },
            "Retry; if the failure persists check Firestore + Storage IAM.",
        )
    }
}
