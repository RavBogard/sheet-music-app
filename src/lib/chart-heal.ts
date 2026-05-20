import "server-only"
import {
    uploadToStorage,
    getStorageObjectSize,
    deleteStorageObjectAtPath,
} from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Shared HEAL contract for chart-byte mutation onto an EXISTING fileId
 * ([[feedback_upload_atomicity]] — the single guarded path).
 *
 * Extracted from `salvage_chart_bytes` (cycle-3 DATA-001) so that BOTH
 * salvage (bytes from sourceUrl / Drive) and `finalize_chart_upload`'s
 * heal-mode (bytes from a signed-URL staging session) write through the
 * identical atomic guard:
 *
 *   1. Storage upload at the EXISTING fileId path (`library/{fileId}<ext>`)
 *   2. read-verify by size — refuse to mutate Firestore on mismatch
 *   3. Firestore merge-update — preserves every curation field; only sets
 *      mimeType, fileSize, source:'salvage', status:'active', salvaged* meta
 *   4. compensating-delete on Firestore failure — never leave a reverse
 *      orphan (bytes-without-index-update)
 *   5. `library_signals/latest` broadcast — invalidates in-tab caches
 *
 * Healing onto the existing fileId preserves every setlist/song bond that
 * points at it — the reason recovery must heal rather than mint a new id.
 */

export const ALLOWED_CHART_MIME_PREFIXES = [
    "application/pdf",
    "application/xml",
    "text/xml",
    "application/vnd.recordare.musicxml",
    "image/png",
    "image/jpeg",
    "text/plain",
] as const

export function isAllowedChartMime(mime: string): boolean {
    const lower = mime.toLowerCase()
    return ALLOWED_CHART_MIME_PREFIXES.some((p) => lower.startsWith(p))
}

export function inferChartExt(mimeType: string): string {
    if (mimeType.includes("pdf")) return ".pdf"
    if (mimeType.includes("xml")) return ".xml"
    if (mimeType.includes("audio")) return ".mp3"
    return ""
}

export interface HealChartBytesOk {
    ok: true
    storagePath: string
    sizeBytes: number
}

/**
 * Write `buffer` onto `library_index/{fileId}` atomically. The caller is
 * responsible for: admin authorization, resolving the bytes, and the
 * dryRun/force gate. This function only performs the guarded write.
 *
 * `salvagedFrom` records provenance on the row (e.g. "sourceUrl", "drive",
 * "upload-session").
 */
export async function healChartBytes(
    db: FirebaseFirestore.Firestore,
    uid: string,
    fileId: string,
    buffer: Buffer,
    mimeType: string,
    salvagedFrom: string,
): Promise<HealChartBytesOk | RichErrorEnvelope> {
    const storagePath = `library/${fileId}${inferChartExt(mimeType)}`

    // ─── Storage upload + read-verify ──────────────────────────────────────
    try {
        await uploadToStorage(fileId, buffer, mimeType)
    } catch (err) {
        return richError(
            "storage_upload_failed",
            `Storage upload failed at ${storagePath}: ${err instanceof Error ? err.message : String(err)}`,
            { fileId, storagePath },
            "Retry the call; if the failure persists check Firebase Storage IAM.",
        )
    }

    const verifiedSize = await getStorageObjectSize(storagePath)
    if (verifiedSize === null || verifiedSize <= 0) {
        try {
            await deleteStorageObjectAtPath(storagePath)
        } catch {
            // best effort
        }
        return richError(
            "storage_verify_missing",
            `Storage write reported success but ${storagePath} is missing on read-verify.`,
            { fileId, storagePath },
            "Retry the call. Atomic-guard rolled back; the row is unchanged.",
        )
    }
    if (verifiedSize !== buffer.byteLength) {
        try {
            await deleteStorageObjectAtPath(storagePath)
        } catch {
            // best effort
        }
        return richError(
            "storage_size_mismatch",
            `Storage size mismatch at ${storagePath} (wrote ${buffer.byteLength}, read ${verifiedSize}).`,
            { fileId, storagePath, wrote: buffer.byteLength, read: verifiedSize },
            "Retry the call. Atomic-guard rolled back; the row is unchanged.",
        )
    }

    // ─── Firestore merge-update ────────────────────────────────────────────
    const nowIso = new Date().toISOString()
    const patch: Record<string, unknown> = {
        mimeType,
        fileSize: buffer.byteLength,
        source: "salvage",
        status: "active",
        salvagedAt: nowIso,
        salvagedBy: uid,
        salvagedFrom,
    }

    try {
        await db.collection("library_index").doc(fileId).set(patch, { merge: true })
        // Mirror status onto songs/{id} if present so search_library /
        // list_library reflect the flip. set+merge is safe — may not exist.
        await db
            .collection("songs")
            .doc(fileId)
            .set({ status: "active" }, { merge: true })
    } catch (err) {
        // Compensating-delete: roll Storage back so we never leave a reverse
        // orphan (bytes-without-index-update).
        try {
            await deleteStorageObjectAtPath(storagePath)
        } catch (rbErr) {
            logger.warn(
                `[healChartBytes] compensating-delete failed for ${storagePath}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
            )
        }
        return richError(
            "firestore_write_failed",
            `Firestore merge-update failed: ${err instanceof Error ? err.message : String(err)}`,
            { fileId, storagePath },
            "Atomic-guard rolled back; the row is unchanged. Retry.",
        )
    }

    // library_signals broadcast — fail-open (same pattern as the callers).
    try {
        await db.collection("library_signals").doc("latest").set({
            at: nowIso,
            fileId,
            op: "salvage",
            by: uid,
        })
    } catch (sigErr) {
        logger.warn(
            `[healChartBytes] library_signals broadcast failed (non-fatal): ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`,
        )
    }

    return { ok: true, storagePath, sizeBytes: buffer.byteLength }
}
