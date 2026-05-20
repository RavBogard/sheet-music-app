import "server-only"
import {
    uploadToStorage,
    getStorageObjectSize,
    deleteStorageObjectAtPath,
} from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"
import {
    emitLibraryRowCreated,
    type LibraryRowCreatedEvent,
} from "@/lib/library/library-events"
import { createHash } from "node:crypto"

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
 *   3. Firestore merge-update — preserves every CURATION field (key, bpm,
 *      tags, leadMusician, composer, arranger, bondCorrectionHistory) and
 *      RECOMPUTES the derived dedup/search fields (normalizedName, stem,
 *      titleSpecificity) from the row's title so a healed row carries the
 *      same keys a fresh upload would; sets mimeType, fileSize,
 *      source:'salvage', status:'active', salvaged* meta, and
 *      enrichmentStatus:'pending'
 *   4. compensating-delete on Firestore failure — never leave a reverse
 *      orphan (bytes-without-index-update)
 *   5. `library_signals/latest` broadcast — invalidates in-tab caches
 *   6. `library.row.created` emit — re-triggers the AI enrichment pass on
 *      the freshly-healed bytes. The heal path was previously enrichment-
 *      blind, so the recovered catalog never got a Gemini pass (coder-1 §3
 *      delta + [[feedback_learning_self_healing]]).
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

    // ─── Read the row for title + collection ───────────────────────────────
    // Drives the dedup/search metadata recompute and the enrichment event.
    // The callers already verified the row exists; we re-read here so the
    // shared helper is self-contained (one cheap get per heal).
    const rowSnap = await db.collection("library_index").doc(fileId).get()
    const rowData = rowSnap.data() ?? {}
    const title =
        (typeof rowData.name === "string" && rowData.name) ||
        (typeof rowData.title === "string" && rowData.title) ||
        fileId
    const collection =
        typeof rowData.collection === "string" ? rowData.collection : "uploads"

    // Recompute the derived dedup/search metadata from the title so a healed
    // row carries the SAME keys a fresh upload would (coder-1 §3 delta: the
    // heal path previously left these unset → fuzzy-dedup blind + no AI).
    const meta = await computeHealRowMetadata(db, fileId, title)

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
        normalizedName: meta.normalizedName,
        stem: meta.stem,
        titleSpecificity: meta.titleSpecificity,
        enrichmentStatus: meta.enrichmentStatus,
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

    // library.row.created — re-trigger AI enrichment on the freshly-healed
    // bytes. Fire-and-forget + fully wrapped (atomic-guard contract: an
    // enrichment failure NEVER rolls back a successful heal).
    try {
        emitLibraryRowCreated(
            buildHealRowCreatedEvent({
                fileId,
                title,
                collection,
                mimeType,
                buffer,
                uid,
                storagePath,
            }),
        )
    } catch (emitErr) {
        logger.warn(
            `[healChartBytes] library.row.created emit failed (non-fatal): ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`,
        )
    }

    return { ok: true, storagePath, sizeBytes: buffer.byteLength }
}

export interface HealRowMetadata {
    /** Alphanumeric-only lowercase title — the fuzzy-dedup prefix-range key. */
    normalizedName: string
    /** Bare liturgical stem (parens + composer suffix stripped, normalized). */
    stem: string
    /** 0..1 deterministic specificity score (W-02), scored against siblings. */
    titleSpecificity: number
    /** Always 'pending' on heal so the AI enrichment subscriber re-runs. */
    enrichmentStatus: "pending"
}

/**
 * Recompute the derived dedup/search metadata for a row from its title —
 * mirrors the upload path (`library-upload.ts` §4) exactly so heal-recovered
 * rows carry the SAME `normalizedName` / `stem` / `titleSpecificity` keys as
 * a freshly-uploaded chart. Queries sibling rows sharing the bare stem
 * (excluding orphans + self) to score `titleSpecificity` with the same
 * `siblingsInCatalog = activeSiblings + 1` formula `processChartUpload` uses.
 *
 * Shared by `healChartBytes` (forward path) and the `backfill_heal_metadata`
 * MCP tool (one-time backfill of rows healed before this fix landed).
 */
export async function computeHealRowMetadata(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    title: string,
): Promise<HealRowMetadata> {
    const normalizedName = title.toLowerCase().replace(/[^a-z0-9]/g, "")
    const stem = bareStem(title)
    const siblingSnap = stem
        ? await db
              .collection("library_index")
              .where("stem", "==", stem)
              .select("stem", "name", "status")
              .get()
        : null
    const existingSiblings = siblingSnap
        ? siblingSnap.docs.filter(
              (d) =>
                  d.id !== fileId &&
                  (d.data().status as string | undefined) !== "orphaned",
          )
        : []
    const siblingsInCatalog = existingSiblings.length + 1
    return {
        normalizedName,
        stem,
        titleSpecificity: titleSpecificity(title, siblingsInCatalog),
        enrichmentStatus: "pending",
    }
}

/**
 * Build the `library.row.created` event for a healed row. `source` is tagged
 * `'upload'` (the closest existing `LibraryRowSource`; the field is advisory —
 * it only labels the AI prompt's metadata block). `contentHash` is the
 * sha256 of the canonical bytes so the AI enrichment cache keys on the
 * post-heal content. Shared by the forward heal path + the backfill tool.
 */
export function buildHealRowCreatedEvent(args: {
    fileId: string
    title: string
    collection: string
    mimeType: string
    buffer: Buffer
    uid: string
    storagePath: string
}): LibraryRowCreatedEvent {
    const contentHash = createHash("sha256").update(args.buffer).digest("hex")
    return {
        rowId: args.fileId,
        fileId: args.fileId,
        source: "upload",
        nameLower: args.title.toLowerCase(),
        title: args.title,
        mimeType: args.mimeType,
        sizeBytes: args.buffer.byteLength,
        collection: args.collection,
        storagePath: args.storagePath,
        contentHash,
        uploaderUid: args.uid,
    }
}
