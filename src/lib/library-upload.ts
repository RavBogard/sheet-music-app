// v70-08-04 guard: this module statically imports heic-convert + the
// MuseScore converter — heavy server-only deps that must never reach a
// browser bundle. Inherited from /api/library/upload's original guard
// when this body was factored out for HTTP + MCP to share.
import 'server-only'
import crypto from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    uploadToStorage,
    getStorageObjectSize,
    deleteStorageObjectAtPath,
} from "@/lib/firebase-storage"
import { processMuseScoreFile } from "@/lib/musescore-converter"
import { levenshteinDistance } from "@/lib/string-utils"
import { logger } from "@/lib/logger"
import heicConvert from "heic-convert"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"

/**
 * Shared library-upload pipeline. The single server-side codepath that:
 *  - validates buffer + mime + size
 *  - converts MuseScore → MusicXML and HEIC → JPEG (server-side, so storage
 *    holds universally-renderable bytes)
 *  - runs exact + fuzzy duplicate detection against `library_index.nameLower`
 *  - writes Firebase Storage + library_index/{fileId} + songs/{fileId}
 *
 * Wraps the body of POST /api/library/upload so HTTP + MCP share one
 * codepath — no risk of the two paths drifting on dedup, conversion, or
 * indexing semantics.
 */

export const MAX_CHART_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB — matches HTTP route

export type LibraryCollection = "core" | "supplemental" | "uploads"

export const ALLOWED_LIBRARY_COLLECTIONS: LibraryCollection[] = [
    "core",
    "supplemental",
    "uploads",
]

export interface ProcessChartUploadInput {
    buffer: Buffer
    originalFileName: string
    mimeType: string
    title?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
    uploaderUid: string
    uploaderEmail?: string
    /**
     * Bypass exact + fuzzy duplicate detection. Used when the caller knows
     * a near-name is a legitimate variant (different key, arrangement, or
     * composer suffix). H-3 dedup tradeoff per Daniel's call 2026-05-15:
     * keep the 0.85 threshold strict, but allow an explicit override.
     */
    force?: boolean
}

export interface ProcessChartUploadOk {
    ok: true
    fileId: string
    title: string
    mimeType: string
    storageUrl: string
    collection: LibraryCollection
}

export interface ProcessChartUploadError {
    ok: false
    /** HTTP status to surface (400/409/422/500). */
    status: number
    error: string
    /** Stable machine code for callers that want to switch on the reason. */
    code:
        | "invalid_type"
        | "too_large"
        | "empty_file"
        | "duplicate_exact"
        | "duplicate_similar"
        | "convert_failed"
        | "server_error"
}

export type ProcessChartUploadResult =
    | ProcessChartUploadOk
    | ProcessChartUploadError

const ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "application/vnd.recordare.musicxml+xml": ".musicxml",
    "application/vnd.recordare.musicxml": ".musicxml",
    "application/x-musescore": ".mscz",
    "application/x-musescore+xml": ".mscx",
    "text/plain": ".txt",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/heic": ".heic",
    "image/heif": ".heif",
}

function extForContentType(ct: string): string {
    if (ct.includes("pdf")) return ".pdf"
    if (ct.includes("text")) return ".txt"
    if (ct === "image/png") return ".png"
    if (ct === "image/jpeg") return ".jpg"
    return ".xml"
}

/**
 * Actual Storage path computed the SAME way firebase-storage.ts:getStoragePath
 * does — extension only for pdf/xml/audio. The library_index `storageUrl`
 * field uses extForContentType which adds .txt/.png/.jpg too, so the index
 * value can mismatch the real Storage path for text/image uploads (kept for
 * back-compat with existing readers). Use this for the atomic-guard's
 * read-verify so we look in the same place uploadToStorage wrote to.
 */
function actualStoragePath(fileId: string, contentType: string): string {
    const ext = contentType.includes("pdf")
        ? ".pdf"
        : contentType.includes("xml")
            ? ".xml"
            : contentType.includes("audio")
                ? ".mp3"
                : ""
    return `library/${fileId}${ext}`
}

export async function processChartUpload(
    input: ProcessChartUploadInput,
): Promise<ProcessChartUploadResult> {
    initAdmin()
    const db = getFirestore()

    // Per-call correlation id + stage timing — observability for the 2026-05-15
    // cowork-reported `upload_chart` hang. Each stage logs entry and elapsed
    // time so Vercel runtime logs reveal which stage stalls when a future
    // upload doesn't return. No behavior change.
    const traceId = crypto.randomUUID().slice(0, 8)
    const t0 = Date.now()
    const stage = (name: string, extra?: Record<string, unknown>) => {
        logger.info(
            `[Upload ${traceId}] ${name} (+${Date.now() - t0}ms)` +
                (extra ? ` ${JSON.stringify(extra)}` : ""),
        )
    }
    stage("start", {
        bytes: input.buffer?.byteLength ?? 0,
        mimeType: input.mimeType,
        collection: input.collection ?? "uploads",
        uploader: input.uploaderUid,
    })

    // ─── 0. Size + type validation ─────────────────────────────────────────

    if (!input.buffer || input.buffer.byteLength === 0) {
        return {
            ok: false,
            status: 400,
            code: "empty_file",
            error: "No file content provided",
        }
    }

    if (input.buffer.byteLength > MAX_CHART_UPLOAD_BYTES) {
        return {
            ok: false,
            status: 400,
            code: "too_large",
            error: `File too large. Maximum size is ${MAX_CHART_UPLOAD_BYTES / 1024 / 1024}MB`,
        }
    }

    const fileName = input.originalFileName
    const mimeType = input.mimeType || "application/octet-stream"

    // G-7: a real mimeType is required. Previously `mimeType OR a recognized
    // file extension` was accepted, but that let octet-stream + .pdf-named
    // garbage through and stored unknown bytes as "application/pdf". MCP
    // callers control both fields — they can always send a real mime — and
    // the in-app UploadDialog uses <input type="file"> which surfaces a real
    // mime from the OS. Tightening to mime-required closes the bypass.
    if (mimeType === "application/octet-stream") {
        return {
            ok: false,
            status: 400,
            code: "invalid_type",
            error:
                "mimeType must be specific (e.g. application/pdf, image/png, application/vnd.recordare.musicxml+xml). 'application/octet-stream' provides no type information and is rejected.",
        }
    }
    if (!ALLOWED_TYPES[mimeType]) {
        return {
            ok: false,
            status: 400,
            code: "invalid_type",
            error: `Unsupported mimeType '${mimeType}'. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}`,
        }
    }

    const collection: LibraryCollection = input.collection ?? "uploads"
    if (!ALLOWED_LIBRARY_COLLECTIONS.includes(collection)) {
        return {
            ok: false,
            status: 400,
            code: "invalid_type",
            error: `Unknown collection "${collection}". Allowed: ${ALLOWED_LIBRARY_COLLECTIONS.join(", ")}`,
        }
    }

    let buffer = input.buffer
    const fileId = `upload-${crypto.randomUUID()}`

    // ─── 1. Server-side conversion: MuseScore → MusicXML; HEIC → JPEG ──────

    const msExt = fileName.match(/\.(mscz|mscx)$/i)?.[1]?.toLowerCase() as
        | "mscz"
        | "mscx"
        | undefined
    const isHeic =
        mimeType === "image/heic" ||
        mimeType === "image/heif" ||
        /\.(heic|heif)$/i.test(fileName)

    let originalStorageUrl: string | undefined
    let sourceFormat: string | undefined
    let effectiveContentType: string = mimeType

    if (msExt) {
        stage("convert-musescore:start", { ext: msExt })
        try {
            const { musicXml, originalContent } = await processMuseScoreFile(
                buffer,
                msExt,
            )
            await uploadToStorage(
                `originals/${fileId}.${msExt}`,
                originalContent,
                "application/octet-stream",
            )
            originalStorageUrl = `library/originals/${fileId}.${msExt}`
            sourceFormat = msExt
            buffer = Buffer.from(musicXml, "utf-8")
            stage("convert-musescore:done")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            return {
                ok: false,
                status: 422,
                code: "convert_failed",
                error: `Failed to convert MuseScore file: ${message}`,
            }
        }
    } else if (isHeic) {
        stage("convert-heic:start")
        try {
            const originalBuffer = buffer
            const heicArrayBuffer = originalBuffer.buffer.slice(
                originalBuffer.byteOffset,
                originalBuffer.byteOffset + originalBuffer.byteLength,
            )
            const jpegBytes = await heicConvert({
                buffer: heicArrayBuffer,
                format: "JPEG",
                quality: 0.9,
            })
            const heicExt = /\.(heif)$/i.test(fileName) ? "heif" : "heic"
            await uploadToStorage(
                `originals/${fileId}.${heicExt}`,
                originalBuffer,
                "image/heic",
            )
            originalStorageUrl = `library/originals/${fileId}.${heicExt}`
            sourceFormat = heicExt
            buffer = Buffer.from(jpegBytes)
            effectiveContentType = "image/jpeg"
            stage("convert-heic:done")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            return {
                ok: false,
                status: 422,
                code: "convert_failed",
                error: `Failed to convert HEIC image: ${message}`,
            }
        }
    }

    // ─── 2. Title + content-type derivation ────────────────────────────────

    const title =
        input.title?.trim() || fileName.replace(/\.[^/.]+$/, "")

    const contentType = msExt
        ? "application/xml"
        : isHeic
            ? effectiveContentType
            : effectiveContentType.startsWith("image/")
                ? effectiveContentType
                : effectiveContentType.includes("pdf")
                    ? "application/pdf"
                    : effectiveContentType.includes("xml") ||
                      /\.(xml|musicxml|mxl)$/i.test(fileName)
                        ? "application/xml"
                        : effectiveContentType

    // ─── 3. Duplicate prevention (exact + fuzzy) ───────────────────────────
    //
    // H-3 (2026-05-15 Daniel call): callers may bypass both layers with
    // `force: true` when uploading a legitimate variant (different key,
    // arrangement, composer suffix) that trips the 0.85 fuzzy threshold.
    // The 0.85 threshold stays strict by default — force is the escape
    // hatch, not the new normal.

    const nameLower = title.toLowerCase()
    // G-5: prefix-range query needs to run against an alphanumeric-only
    // field, not `nameLower`. For a title like "⚠️ STRESS TEST — Adon Olam",
    // `nameLower` starts with "⚠️ stress..." but `prefix` is "stress" (the
    // alphanumeric-only form), so a range query against `nameLower` skips
    // emoji-prefixed candidates entirely. Index a `normalizedName` field and
    // query that. Backfill is optional — without it, new uploads still won't
    // fuzzy-match against pre-G-5 entries that lack `normalizedName`.
    const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
    if (!input.force) {
        stage("dedup-exact:start")
        const exactMatch = await db
            .collection("library_index")
            .where("nameLower", "==", nameLower)
            .limit(5)
            .get()
        stage("dedup-exact:done", { matches: exactMatch.size })
        const activeExactMatch = exactMatch.docs.find(
            (d) => d.data().status === "active",
        )
        if (activeExactMatch) {
            const existingName = activeExactMatch.data().name
            return {
                ok: false,
                status: 409,
                code: "duplicate_exact",
                error: `A chart with the same name ("${existingName}") already exists. Pass force: true to override if this is a legitimate variant.`,
            }
        }
    } else {
        stage("dedup-skip", { reason: "force" })
    }

    const prefix = normalizedName.slice(0, 6)
    if (!input.force && prefix.length >= 3) {
        stage("dedup-fuzzy:start", { prefix })
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
        stage("dedup-fuzzy:done", { candidates: similarSnap.size })

        for (const doc of similarSnap.docs) {
            if (doc.data().status !== "active") continue
            const existingName = doc.data().name as string
            const normalizedExisting =
                (doc.data().normalizedName as string | undefined) ??
                existingName.toLowerCase().replace(/[^a-z0-9]/g, "")
            const distance = levenshteinDistance(
                normalizedName,
                normalizedExisting,
            )
            const maxLength = Math.max(
                normalizedName.length,
                normalizedExisting.length,
            )
            const similarity = 1 - distance / maxLength
            if (similarity > 0.85) {
                return {
                    ok: false,
                    status: 409,
                    code: "duplicate_similar",
                    error: `A chart with a similar name ("${existingName}") already exists in the library. Pass force: true to override if this is a legitimate variant.`,
                }
            }
        }
    }

    // ─── 4. Write to Storage + library_index + songs ───────────────────────
    //
    // Atomic-guard pattern (added 2026-05-15 after the 3-orphan incident):
    // 1) write to Storage
    // 2) READ-VERIFY: re-fetch the blob's metadata and confirm size matches
    //    the buffer. If Storage silently dropped bytes, we abort BEFORE the
    //    Firestore write — no orphan index entry.
    // 3) write Firestore (library_index + songs)
    // 4) if step 3 throws for any reason, compensating-delete the Storage
    //    blob so we don't leave reverse orphans (bytes without an index).
    // 5) bump library_signals/latest to broadcast cache invalidation to all
    //    in-browser library views (MCP-driven uploads need this — they don't
    //    fire the in-tab BroadcastChannel).

    stage("storage-upload:start", {
        fileId,
        kb: Number((buffer.byteLength / 1024).toFixed(1)),
        contentType,
    })
    await uploadToStorage(fileId, buffer, contentType)
    stage("storage-upload:done")

    const storageUrl = `library/${fileId}${extForContentType(contentType)}`

    // Read-verify: confirm the blob exists with non-zero size at the path we
    // just wrote to. Catches any silent-failure class where `file.save()`
    // resolved but no bytes landed. Bucket-name resolution mirrors
    // firebase-storage.ts:getBucket().
    stage("storage-verify:start")
    const realStoragePath = actualStoragePath(fileId, contentType)
    const verifiedSize = await getStorageObjectSize(realStoragePath)
    if (verifiedSize === null || verifiedSize <= 0) {
        stage("storage-verify:missing", { realStoragePath })
        return {
            ok: false,
            status: 500,
            code: "server_error",
            error: `Storage write reported success but the blob is missing at ${realStoragePath} — refusing to write index entry (would create an orphan).`,
        }
    }
    if (verifiedSize !== buffer.byteLength) {
        stage("storage-verify:size-mismatch", {
            wrote: buffer.byteLength,
            got: verifiedSize,
        })
        return {
            ok: false,
            status: 500,
            code: "server_error",
            error: `Storage size mismatch (wrote ${buffer.byteLength}, read back ${verifiedSize}) — refusing to write index entry.`,
        }
    }
    stage("storage-verify:ok", { size: verifiedSize })

    // W-02 trust-calibration: compute stem + specificity at write time so
    // the search-side ranking has a deterministic confidence signal. Query
    // existing siblings sharing this stem (excluding orphans) to compute
    // the count this row gets scored against — and to cascade-recount their
    // specificity in the same batch when the new row changes their count.
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
                  d.id !== fileId && // exclude self if we're replacing an upload (rare)
                  (d.data().status as string | undefined) !== "orphaned",
          )
        : []
    const siblingsInCatalog = existingSiblings.length + 1
    stage("specificity:computed", { stem, siblingsInCatalog })

    const indexEntry: Record<string, unknown> = {
        name: title,
        nameLower,
        normalizedName,
        stem,
        titleSpecificity: titleSpecificity(title, siblingsInCatalog),
        bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        originalName: fileName,
        mimeType: contentType,
        fileSize: buffer.byteLength,
        source: "upload",
        uploadedBy: input.uploaderUid,
        uploadedByEmail: input.uploaderEmail || "unknown",
        uploadedAt: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        collection,
        storageUrl,
        status: "active",
    }
    if (input.key) indexEntry.key = input.key
    if (input.bpm) indexEntry.bpm = input.bpm
    if (input.tags && input.tags.length > 0) indexEntry.tags = input.tags
    if (originalStorageUrl) indexEntry.originalStorageUrl = originalStorageUrl
    if (sourceFormat) indexEntry.sourceFormat = sourceFormat

    stage("firestore-write:start")
    try {
        const batch = db.batch()
        batch.set(db.collection("library_index").doc(fileId), indexEntry)
        batch.set(
            db.collection("songs").doc(fileId),
            {
                title,
                normalizedTitle: title.toLowerCase(),
                status: "active",
                updatedAt: Date.now(),
            },
            { merge: true },
        )
        // W-02 sibling-recount cascade: each existing sibling now sees
        // siblingsInCatalog = existingSiblings.length + 1, so their score
        // may shift (e.g. unique-bonus +0.2 drops to shared-penalty -0.2
        // when their count goes from 1 to 2). Bounded to entries already
        // sharing the stem — no full-collection scan.
        for (const sibling of existingSiblings) {
            const sibName = (sibling.data().name as string | undefined) ?? ""
            if (!sibName) continue
            batch.update(sibling.ref, {
                titleSpecificity: titleSpecificity(sibName, siblingsInCatalog),
            })
        }
        await batch.commit()
        stage("firestore-write:done", { siblingsRecomputed: existingSiblings.length })
    } catch (err) {
        // Compensating delete: take the Storage blob down so the failed
        // upload doesn't leave a reverse orphan (bytes-without-index).
        const message = err instanceof Error ? err.message : "Unknown error"
        stage("firestore-write:failed", { message })
        try {
            await deleteStorageObjectAtPath(realStoragePath)
            stage("firestore-write:storage-rolled-back")
        } catch (rbErr) {
            const rbMessage =
                rbErr instanceof Error ? rbErr.message : "Unknown error"
            stage("firestore-write:rollback-failed", { rbMessage })
            logger.error(
                `[Upload ${traceId}] Storage rollback failed for ${storageUrl}: ${rbMessage}`,
            )
        }
        return {
            ok: false,
            status: 500,
            code: "server_error",
            error: `Firestore index write failed (${message}); Storage rolled back.`,
        }
    }

    // Best-effort cache-invalidation signal — open-tab library views listen
    // on this single doc and refetch the React Query cache when it changes.
    // A failure here MUST NOT fail the upload (the chart is fully written).
    try {
        await db.collection("library_signals").doc("latest").set({
            at: new Date().toISOString(),
            fileId,
            op: "upload",
            by: input.uploaderUid,
        })
    } catch (sigErr) {
        const message =
            sigErr instanceof Error ? sigErr.message : "Unknown error"
        stage("signal-write:failed", { message })
        logger.warn(
            `[Upload ${traceId}] library_signals write failed (non-fatal): ${message}`,
        )
    }

    stage("complete")

    return {
        ok: true,
        fileId,
        title,
        mimeType: contentType,
        storageUrl,
        collection,
    }
}

