import "server-only"
import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import {
    processChartUpload,
    type LibraryCollection,
} from "@/lib/library-upload"
import { uploadFailureEnvelope } from "./library-upload"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { healChartBytes, isAllowedChartMime, ALLOWED_CHART_MIME_PREFIXES } from "@/lib/chart-heal"
import { stampOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"

/**
 * Chunked / signed-URL chart upload for cowork agents (B-001 from the
 * 2026-05-16 Bar Mitzvah session). The inline `upload_chart` tool takes
 * a base64 string in the tool argument — practical only for files under
 * ~50 KB because the MCP agent's Read tool has a 25K-token-per-call
 * limit. Real charts are 200 KB–5 MB; the agent has no way to ship them
 * through that surface.
 *
 * This module exposes a two-step flow that sidesteps the base64-in-args
 * limit entirely:
 *
 *   1. `request_chart_upload_url(args)` — server returns a Firebase
 *      Storage signed PUT URL valid for 10 minutes, plus an
 *      uploadSessionId. Session metadata (title, mimeType, collection,
 *      uploader uid, expiresAt) lives in Firestore at
 *      `upload_sessions/{sessionId}`.
 *
 *   2. Agent issues `curl -X PUT --data-binary @file.pdf <uploadUrl>`
 *      (or any HTTP PUT client). Storage receives the bytes at
 *      `upload-sessions/{sessionId}/raw`.
 *
 *   3. `finalize_chart_upload({uploadSessionId, force?})` — server
 *      downloads the staged bytes, runs the standard `processChartUpload`
 *      pipeline (mime validation, MuseScore/HEIC conversion, dedup,
 *      Storage write, library_index + songs write, library_signals
 *      broadcast), and returns the fileId. The staged blob is deleted
 *      after success or hard failure.
 *
 * `force?: boolean` on finalize matches the H-3 force-override semantic:
 * bypass dedup when the operator knows the chart is a legitimate variant.
 *
 * Signed-URL sessions auto-expire after 10 minutes (the Storage signed PUT URL
 * expires with them — a single PUT needs no more). The chunked inline flow
 * (begin/append/commit, below) uses a longer 60-minute window since it ships the
 * bytes through MCP tool args slice-by-slice. Cleanup of abandoned staged blobs
 * is opportunistic — a stale session doc is just a row; the staged blob deletes
 * on next finalize attempt or via the storage lifecycle policy.
 *
 * Same auth + curated-catalog gate + trusted-leader rate-limit-bypass
 * semantics as upload_chart / import_chart_from_drive.
 */

// Cycle-2 REG-001b: every error returns the canonical rich envelope.

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
    if (roles.role === "admin") return true
    if (roles.role === "band_leader") return true
    if (roles.role === "musician") return true
    return roles.canUpload
}

function isTrustedLeader(roles: UploaderRoles): boolean {
    return roles.role === "admin" || roles.role === "band_leader"
}

function curatedCatalogGate(
    roles: UploaderRoles,
    collection: LibraryCollection | undefined,
): RichErrorEnvelope | null {
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

const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000
// M-12 (v11.5-04-03): the chunked inline flow ships bytes THROUGH MCP tool args
// in sub-cap slices, so a multi-chunk file (a 5 MB chart ≈ 100 chunks at the
// agent's pace) needs a far longer window than the single-PUT signed-URL path.
// 60 min for chunked; the signed-URL path keeps UPLOAD_SESSION_TTL_MS (10 min),
// bounded anyway by the signed PUT URL's own expiry.
const CHUNKED_SESSION_TTL_MS = 60 * 60 * 1000
const STAGED_BUCKET_PREFIX = "upload-sessions"
const MAX_SESSION_SIZE_BYTES = 25 * 1024 * 1024

// v11.3-02-02 (BUG-cowork-chart-upload-2026-06-10): chunked inline upload caps.
// A single base64 tool arg/result is bounded by the agent's ~25K-token limit
// (~100 KB text). RECOMMENDED keeps a chunk's base64 (~4/3 of binary) under that
// with headroom; MAX is a hard per-chunk guard. Total is the session cap.
const MAX_CHUNK_BYTES = 256 * 1024
const RECOMMENDED_CHUNK_BYTES = 48 * 1024

function chunkObjectPath(sessionId: string, index: number): string {
    return `${STAGED_BUCKET_PREFIX}/${sessionId}/chunk-${String(index).padStart(6, "0")}`
}

/**
 * Strict RFC-4648 base64 decode (mirrors the upload_chart guard): Buffer.from
 * never throws on bad input — it silently truncates — so format-check first.
 */
function decodeBase64Strict(
    s: string,
): { ok: true; buffer: Buffer } | { ok: false; reason: string } {
    const stripped = s.replace(/\s/g, "")
    if (stripped.length === 0) return { ok: false, reason: "Decoded chunk is empty." }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped))
        return {
            ok: false,
            reason: "dataBase64 must be standard base64 (RFC 4648). Got non-base64 characters.",
        }
    if (stripped.length % 4 !== 0)
        return {
            ok: false,
            reason: "dataBase64 length must be a multiple of 4 (padded with '=').",
        }
    const buffer = Buffer.from(stripped, "base64")
    if (buffer.byteLength === 0)
        return { ok: false, reason: "Decoded chunk is empty." }
    return { ok: true, buffer }
}

function getBucket() {
    const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return getStorage().bucket(bucketName)
}

function stagedPath(sessionId: string): string {
    return `${STAGED_BUCKET_PREFIX}/${sessionId}/raw`
}

export interface RequestChartUploadUrlArgs {
    title: string
    mimeType: string
    fileName?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
    sizeBytes?: number
}

export interface RequestChartUploadUrlResult {
    ok: true
    uploadSessionId: string
    uploadUrl: string
    /** ISO timestamp at which the signed URL stops accepting PUTs. */
    expiresAt: string
    method: "PUT"
    requiredHeaders: Record<string, string>
}

export async function requestChartUploadUrl(
    uid: string,
    args: RequestChartUploadUrlArgs,
): Promise<RequestChartUploadUrlResult | RichErrorEnvelope> {
    if (!args.title?.trim())
        return richError("invalid_argument", "title is required.", { field: "title" })
    if (!args.mimeType?.trim())
        return richError("invalid_argument", "mimeType is required.", {
            field: "mimeType",
        })
    if (
        typeof args.sizeBytes === "number" &&
        args.sizeBytes > MAX_SESSION_SIZE_BYTES
    ) {
        return richError(
            "size_exceeds_cap",
            `sizeBytes ${args.sizeBytes} exceeds the per-session cap of ${MAX_SESSION_SIZE_BYTES}.`,
            { sizeBytes: args.sizeBytes, maxBytes: MAX_SESSION_SIZE_BYTES },
            "Split the file or compress it before uploading.",
        )
    }

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

    const uploadSessionId = `usess-${crypto.randomUUID()}`
    const expiresAtMs = Date.now() + UPLOAD_SESSION_TTL_MS
    const path = stagedPath(uploadSessionId)

    const bucket = getBucket()
    let signedUrl: string
    try {
        const [url] = await bucket.file(path).getSignedUrl({
            action: "write",
            version: "v4",
            expires: expiresAtMs,
            contentType: args.mimeType,
        })
        signedUrl = url
    } catch (err) {
        logger.warn("[mcp] request_chart_upload_url signing failed", {
            uid,
            err: err instanceof Error ? err.message : String(err),
        })
        return richError(
            "storage_signing_failed",
            `Could not mint signed upload URL: ${err instanceof Error ? err.message : err}`,
            undefined,
            "Retry; if the failure persists the Storage bucket may be misconfigured — surface to an admin.",
        )
    }

    await db
        .collection("upload_sessions")
        .doc(uploadSessionId)
        .set({
            ownerUid: uid,
            title: args.title,
            mimeType: args.mimeType,
            fileName: args.fileName ?? null,
            collection: args.collection ?? null,
            key: args.key ?? null,
            bpm: args.bpm ?? null,
            tags: args.tags ?? [],
            sizeBytes: args.sizeBytes ?? null,
            stagedPath: path,
            status: "awaiting-upload",
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(expiresAtMs),
        })

    return {
        ok: true,
        uploadSessionId,
        uploadUrl: signedUrl,
        expiresAt: new Date(expiresAtMs).toISOString(),
        method: "PUT",
        requiredHeaders: { "Content-Type": args.mimeType },
    }
}

export interface FinalizeChartUploadArgs {
    uploadSessionId: string
    /** Bypass dedup (exact + fuzzy). Same semantic as upload_chart's force. */
    force?: boolean
    /**
     * HEAL mode (admin-only, storage-recovery Lane B). When set, the staged
     * bytes are written onto this EXISTING orphaned `library_index/{fileId}`
     * via the shared atomic guard ([[feedback_upload_atomicity]]) instead of
     * minting a new fileId — preserving every setlist bond. No dedup, no
     * MuseScore/HEIC conversion: the staged mime must be a renderable chart
     * type. Used to re-supply bytes for pre-atomic-guard orphans.
     */
    targetFileId?: string
}

export interface FinalizeChartUploadResult {
    ok: true
    fileId: string
    title: string
    collection: LibraryCollection
    sizeBytes: number
    /** True when this finalize healed an existing orphan in place (targetFileId). */
    healed?: boolean
}

export async function finalizeChartUpload(
    uid: string,
    args: FinalizeChartUploadArgs,
    // v11.7-06-02: optional caller host org. When given, the NEW chart is
    // org-stamped (heal mode returns earlier, so an existing chart is never
    // re-tenanted). OPTIONAL/no-default on purpose — absent means "don't stamp"
    // so the chunked-commit path (which stamps externally) isn't double-stamped.
    org?: OrgId,
): Promise<FinalizeChartUploadResult | RichErrorEnvelope> {
    if (!args.uploadSessionId?.trim()) {
        return richError(
            "invalid_argument",
            "uploadSessionId is required.",
            { field: "uploadSessionId" },
        )
    }

    initAdmin()
    const db = getFirestore()

    const sessionRef = db
        .collection("upload_sessions")
        .doc(args.uploadSessionId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) {
        return richError(
            "upload_session_not_found",
            `Upload session '${args.uploadSessionId}' was not found.`,
            { uploadSessionId: args.uploadSessionId },
            "Request a new session via request_chart_upload_url.",
        )
    }
    const session = sessionSnap.data() as Record<string, unknown>

    if (session.ownerUid !== uid) {
        return richError(
            "upload_session_owner_mismatch",
            "Upload session does not belong to caller.",
            { uploadSessionId: args.uploadSessionId },
            "Request a new session under your own bearer token.",
        )
    }
    if (session.status === "finalized") {
        return richError(
            "upload_session_already_finalized",
            "Session already finalized — request a new uploadSessionId for a new upload.",
            { uploadSessionId: args.uploadSessionId },
            "Request a fresh session via request_chart_upload_url.",
        )
    }

    const expires = session.expiresAt as { toMillis?: () => number } | undefined
    if (expires?.toMillis && expires.toMillis() < Date.now()) {
        return richError(
            "upload_session_expired",
            "Upload session expired.",
            { uploadSessionId: args.uploadSessionId },
            "Request a new uploadSessionId and re-upload the bytes.",
        )
    }

    const roles = await loadUploader(db, uid)
    // Auth was checked on init; re-check here so a role change between
    // init and finalize doesn't sneak through.
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)
    const limited = await checkUserRateLimit(uid, "upload", {
        bypass: isTrustedLeader(roles),
    })
    if (limited) return rateLimitEnvelope(limited.error)

    const bucket = getBucket()
    const stagedFile = bucket.file(session.stagedPath as string)

    const [exists] = await stagedFile.exists()
    if (!exists) {
        return richError(
            "staged_bytes_missing",
            "No bytes found at the staged path. Did you PUT the file to the uploadUrl before calling finalize?",
            { uploadSessionId: args.uploadSessionId },
            "PUT the bytes to the uploadUrl from request_chart_upload_url first.",
        )
    }

    let buffer: Buffer
    try {
        const [bytes] = await stagedFile.download()
        buffer = Buffer.from(bytes)
    } catch (err) {
        return richError(
            "staged_bytes_unreadable",
            `Could not read staged bytes: ${err instanceof Error ? err.message : err}`,
            { uploadSessionId: args.uploadSessionId },
            "Retry; if the failure persists request a fresh session.",
        )
    }

    if (buffer.byteLength === 0) {
        await stagedFile.delete().catch(() => undefined)
        return richError(
            "empty_file",
            "Staged upload is empty.",
            { uploadSessionId: args.uploadSessionId },
            "PUT the file bytes to the uploadUrl, then retry finalize_chart_upload.",
        )
    }
    if (buffer.byteLength > MAX_SESSION_SIZE_BYTES) {
        await stagedFile.delete().catch(() => undefined)
        return richError(
            "size_exceeds_cap",
            `Staged upload is ${buffer.byteLength} bytes; cap is ${MAX_SESSION_SIZE_BYTES}.`,
            {
                uploadSessionId: args.uploadSessionId,
                sizeBytes: buffer.byteLength,
                maxBytes: MAX_SESSION_SIZE_BYTES,
            },
            "Split the file or compress it.",
        )
    }

    const title = String(session.title)
    const mimeType = String(session.mimeType)
    const fileName =
        (session.fileName as string | undefined) ||
        deriveFileName(title, mimeType)

    // ─── HEAL mode (admin-only): write staged bytes onto an EXISTING orphan ──
    if (args.targetFileId) {
        const targetFileId = args.targetFileId
        if (roles.role !== "admin") {
            await stagedFile.delete().catch(() => undefined)
            return forbiddenRoleEnvelope({
                callerRole: roles.role ?? null,
                requiredRoles: ["admin"],
                message:
                    "Heal mode (targetFileId) is admin-only — it rewrites the bytes every setlist bonded to that chart will render.",
                hint: "Drop targetFileId to upload as a new chart, or ask an admin to run the heal.",
                context: { targetFileId },
            })
        }
        if (!isAllowedChartMime(mimeType)) {
            await stagedFile.delete().catch(() => undefined)
            return richError(
                "invalid_source_mime",
                `Heal mode requires a renderable chart mime; got '${mimeType}' (no conversion in heal mode).`,
                { targetFileId, mimeType, errorCode: 422 },
                `Allowed: ${ALLOWED_CHART_MIME_PREFIXES.join(", ")}. Pre-convert MuseScore/HEIC, or upload as a new chart (no targetFileId).`,
            )
        }
        const targetSnap = await db.collection("library_index").doc(targetFileId).get()
        if (!targetSnap.exists) {
            await stagedFile.delete().catch(() => undefined)
            return richError(
                "row_not_found",
                `library_index/${targetFileId} does not exist — nothing to heal.`,
                { targetFileId, errorCode: 422 },
                "Verify the orphan fileId via the orphan-recovery manifest or list_library.",
            )
        }
        const healed = await healChartBytes(db, uid, targetFileId, buffer, mimeType, "upload-session")
        await stagedFile.delete().catch((err) => {
            logger.warn("[mcp] finalize_chart_upload (heal) staged cleanup failed", {
                uploadSessionId: args.uploadSessionId,
                err: err instanceof Error ? err.message : String(err),
            })
        })
        if (!("ok" in healed) || !healed.ok) {
            await sessionRef.update({
                status: "failed",
                failedAt: FieldValue.serverTimestamp(),
                failureReason: healed.error?.message ?? "heal_failed",
            })
            return healed
        }
        const targetData = targetSnap.data() ?? {}
        const rowName =
            (typeof targetData.name === "string" && targetData.name) ||
            (typeof targetData.title === "string" && targetData.title) ||
            title
        const rowCollection =
            (targetData.collection as LibraryCollection | undefined) ?? "uploads"
        await sessionRef.update({
            status: "finalized",
            finalizedAt: FieldValue.serverTimestamp(),
            resultFileId: targetFileId,
            healedTarget: true,
        })
        return {
            ok: true,
            fileId: targetFileId,
            title: rowName,
            collection: rowCollection,
            sizeBytes: buffer.byteLength,
            healed: true,
        }
    }

    const result = await processChartUpload({
        buffer,
        originalFileName: fileName,
        mimeType,
        title,
        collection: (session.collection as LibraryCollection | undefined) ?? undefined,
        key: (session.key as string | undefined) ?? undefined,
        bpm: (session.bpm as number | undefined) ?? undefined,
        tags: (session.tags as string[] | undefined) ?? undefined,
        uploaderUid: uid,
        uploaderEmail: roles.email,
        force: args.force,
    })

    // Clear the staged blob whether we succeeded or failed — the session
    // is one-shot. Best-effort; storage lifecycle policy is the long-tail
    // cleanup.
    await stagedFile.delete().catch((err) => {
        logger.warn("[mcp] finalize_chart_upload staged cleanup failed", {
            uploadSessionId: args.uploadSessionId,
            err: err instanceof Error ? err.message : String(err),
        })
    })

    if (!result.ok) {
        await sessionRef.update({
            status: "failed",
            failedAt: FieldValue.serverTimestamp(),
            failureReason: result.error,
        })
        // v11.2-03 (BUG-2): shared upload-failure mapping (dedup→409, status
        // passthrough) instead of a blanket upload_failed (500).
        return uploadFailureEnvelope(result, {
            tool: "finalize_chart_upload",
            uploadSessionId: args.uploadSessionId,
        })
    }

    await sessionRef.update({
        status: "finalized",
        finalizedAt: FieldValue.serverTimestamp(),
        resultFileId: result.fileId,
    })

    // v11.7-06-02: org-stamp the NEW chart from the caller's host org (heal mode
    // returned earlier, so this only ever stamps a freshly-created chart).
    if (org) await stampOrg(db, result.fileId, org)

    return {
        ok: true,
        fileId: result.fileId,
        title: result.title,
        collection: result.collection,
        sizeBytes: buffer.byteLength,
    }
}

function deriveFileName(title: string, mimeType: string): string {
    const safe =
        title.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "chart"
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

// ─── chunked inline upload (begin / append / commit) ─────────────────────────
//
// v11.3-02-02 (BUG-cowork-chart-upload-2026-06-10): the signed-URL flow
// (request_chart_upload_url → PUT) is blocked when the agent's environment can't
// egress to storage.googleapis.com (the Cowork sandbox proxy 403s the CONNECT),
// and inline upload_chart base64 exceeds the ~25K-token tool surface above ~50 KB.
// This flow ships the bytes THROUGH MCP tool args in sub-cap slices: begin creates
// a session, append writes each slice to Storage server-side, commit reassembles
// in index order and delegates to the SAME finalizeChartUpload pipeline.
//
// Rate-limiting note: only begin + commit (via finalize) consume an upload-tier
// token — NOT each append. Per-chunk metering would exhaust the 10/min cap on any
// multi-chunk file (a 5 MB chart ≈ 100 chunks). Append re-checks the role gate
// (revocation mid-flow) but is not separately metered; the operation is already
// authorized at begin.

export interface BeginChunkedChartUploadArgs {
    title: string
    mimeType: string
    fileName?: string
    collection?: LibraryCollection
    key?: string
    bpm?: number
    tags?: string[]
    /** Optional advisory: total chunk count, enforced for exactness at commit. */
    totalChunks?: number
}

export interface BeginChunkedChartUploadResult {
    ok: true
    uploadSessionId: string
    status: "awaiting-chunks"
    expiresAt: string
    maxChunkBytes: number
    recommendedChunkBytes: number
    maxTotalBytes: number
}

export async function beginChunkedChartUpload(
    uid: string,
    args: BeginChunkedChartUploadArgs,
): Promise<BeginChunkedChartUploadResult | RichErrorEnvelope> {
    if (!args.title?.trim())
        return richError("invalid_argument", "title is required.", { field: "title" })
    if (!args.mimeType?.trim())
        return richError("invalid_argument", "mimeType is required.", {
            field: "mimeType",
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

    const uploadSessionId = `usess-${crypto.randomUUID()}`
    // M-12: chunked sessions get the longer 60-min window (see CHUNKED_SESSION_TTL_MS).
    const expiresAtMs = Date.now() + CHUNKED_SESSION_TTL_MS

    await db
        .collection("upload_sessions")
        .doc(uploadSessionId)
        .set({
            ownerUid: uid,
            title: args.title,
            mimeType: args.mimeType,
            fileName: args.fileName ?? null,
            collection: args.collection ?? null,
            key: args.key ?? null,
            bpm: args.bpm ?? null,
            tags: args.tags ?? [],
            sizeBytes: null,
            // finalizeChartUpload reads `stagedPath` — commit assembles the chunks
            // into this exact path, so finalize downloads the reassembled bytes.
            stagedPath: stagedPath(uploadSessionId),
            mode: "chunked",
            status: "awaiting-chunks",
            totalChunks: args.totalChunks ?? null,
            // Per-index decoded byte sizes — keyed map so a retransmitted index
            // overwrites rather than double-counts toward the total cap.
            chunkBytes: {},
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(expiresAtMs),
        })

    return {
        ok: true,
        uploadSessionId,
        status: "awaiting-chunks",
        expiresAt: new Date(expiresAtMs).toISOString(),
        maxChunkBytes: MAX_CHUNK_BYTES,
        recommendedChunkBytes: RECOMMENDED_CHUNK_BYTES,
        maxTotalBytes: MAX_SESSION_SIZE_BYTES,
    }
}

export interface AppendChartUploadChunkArgs {
    uploadSessionId: string
    /** 0-based, contiguous. Re-sending the same index overwrites it. */
    chunkIndex: number
    /** Base64-encoded slice of the file (standard RFC-4648). */
    dataBase64: string
}

export interface AppendChartUploadChunkResult {
    ok: true
    chunkIndex: number
    receivedChunks: number
    receivedBytes: number
}

export async function appendChartUploadChunk(
    uid: string,
    args: AppendChartUploadChunkArgs,
): Promise<AppendChartUploadChunkResult | RichErrorEnvelope> {
    if (!args.uploadSessionId?.trim())
        return richError("invalid_argument", "uploadSessionId is required.", {
            field: "uploadSessionId",
        })
    if (
        typeof args.chunkIndex !== "number" ||
        !Number.isInteger(args.chunkIndex) ||
        args.chunkIndex < 0
    )
        return richError(
            "invalid_argument",
            "chunkIndex must be a non-negative integer.",
            { field: "chunkIndex" },
        )
    if (!args.dataBase64)
        return richError("invalid_argument", "dataBase64 is required.", {
            field: "dataBase64",
        })

    initAdmin()
    const db = getFirestore()

    const sessionRef = db.collection("upload_sessions").doc(args.uploadSessionId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists)
        return richError(
            "upload_session_not_found",
            `Upload session '${args.uploadSessionId}' was not found.`,
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session via begin_chunked_chart_upload.",
        )
    const session = sessionSnap.data() as Record<string, unknown>

    if (session.ownerUid !== uid)
        return richError(
            "upload_session_owner_mismatch",
            "Upload session does not belong to caller.",
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session under your own bearer token.",
        )
    if (session.mode !== "chunked")
        return richError(
            "invalid_session_state",
            "This session is not a chunked-upload session.",
            { uploadSessionId: args.uploadSessionId },
            "Use begin_chunked_chart_upload to start a chunked upload.",
        )
    if (session.status !== "awaiting-chunks")
        return richError(
            "invalid_session_state",
            `Session is '${String(session.status)}', not accepting chunks.`,
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session; a finalized/failed session can't take more chunks.",
        )
    const expires = session.expiresAt as { toMillis?: () => number } | undefined
    if (expires?.toMillis && expires.toMillis() < Date.now())
        return richError(
            "upload_session_expired",
            "Upload session expired.",
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session and re-send the chunks.",
        )

    // Re-check role (revocation mid-flow); NOT separately rate-limited (see note).
    const roles = await loadUploader(db, uid)
    if (!isUploadAllowed(roles)) return uploadForbidden(roles)

    const decoded = decodeBase64Strict(args.dataBase64)
    if (!decoded.ok)
        return richError("invalid_base64", decoded.reason, {
            field: "dataBase64",
            chunkIndex: args.chunkIndex,
        })
    if (decoded.buffer.byteLength > MAX_CHUNK_BYTES)
        return richError(
            "chunk_too_large",
            `Chunk ${args.chunkIndex} is ${decoded.buffer.byteLength} bytes; per-chunk cap is ${MAX_CHUNK_BYTES}.`,
            {
                uploadSessionId: args.uploadSessionId,
                chunkIndex: args.chunkIndex,
                maxChunkBytes: MAX_CHUNK_BYTES,
            },
            "Send smaller slices (~48 KB recommended).",
        )

    // Cumulative cap — recompute from the per-index map so a retransmit of the
    // same index doesn't double-count. Reject BEFORE writing if over cap.
    const chunkBytes = {
        ...((session.chunkBytes as Record<string, number>) ?? {}),
    }
    chunkBytes[String(args.chunkIndex)] = decoded.buffer.byteLength
    const receivedBytes = Object.values(chunkBytes).reduce((a, b) => a + b, 0)
    if (receivedBytes > MAX_SESSION_SIZE_BYTES)
        return richError(
            "size_exceeds_cap",
            `Cumulative upload would be ${receivedBytes} bytes; session cap is ${MAX_SESSION_SIZE_BYTES}.`,
            {
                uploadSessionId: args.uploadSessionId,
                receivedBytes,
                maxBytes: MAX_SESSION_SIZE_BYTES,
            },
            "Stop appending and split the file, or compress it.",
        )

    const bucket = getBucket()
    try {
        await bucket
            .file(chunkObjectPath(args.uploadSessionId, args.chunkIndex))
            .save(decoded.buffer, {
                contentType: "application/octet-stream",
                resumable: false,
            })
    } catch (err) {
        return richError(
            "chunk_store_failed",
            `Could not store chunk ${args.chunkIndex}: ${err instanceof Error ? err.message : err}`,
            { uploadSessionId: args.uploadSessionId, chunkIndex: args.chunkIndex },
            "Retry the append; if it persists the Storage bucket may be misconfigured.",
        )
    }

    await sessionRef.update({ chunkBytes, receivedBytes })

    return {
        ok: true,
        chunkIndex: args.chunkIndex,
        receivedChunks: Object.keys(chunkBytes).length,
        receivedBytes,
    }
}

export interface CommitChunkedChartUploadArgs {
    uploadSessionId: string
    /** Bypass dedup (exact + fuzzy). Same semantic as upload_chart's force. */
    force?: boolean
}

export async function commitChunkedChartUpload(
    uid: string,
    args: CommitChunkedChartUploadArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<FinalizeChartUploadResult | RichErrorEnvelope> {
    if (!args.uploadSessionId?.trim())
        return richError("invalid_argument", "uploadSessionId is required.", {
            field: "uploadSessionId",
        })

    initAdmin()
    const db = getFirestore()

    const sessionRef = db.collection("upload_sessions").doc(args.uploadSessionId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists)
        return richError(
            "upload_session_not_found",
            `Upload session '${args.uploadSessionId}' was not found.`,
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session via begin_chunked_chart_upload.",
        )
    const session = sessionSnap.data() as Record<string, unknown>

    if (session.ownerUid !== uid)
        return richError(
            "upload_session_owner_mismatch",
            "Upload session does not belong to caller.",
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session under your own bearer token.",
        )
    if (session.mode !== "chunked")
        return richError(
            "invalid_session_state",
            "This session is not a chunked-upload session.",
            { uploadSessionId: args.uploadSessionId },
            "Use begin_chunked_chart_upload / finalize_chart_upload appropriately.",
        )
    if (session.status === "finalized")
        return richError(
            "upload_session_already_finalized",
            "Session already finalized — begin a new chunked upload for a new chart.",
            { uploadSessionId: args.uploadSessionId },
            "Begin a fresh session via begin_chunked_chart_upload.",
        )
    if (session.status !== "awaiting-chunks")
        return richError(
            "invalid_session_state",
            `Session is '${String(session.status)}', not committable.`,
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session.",
        )
    const expires = session.expiresAt as { toMillis?: () => number } | undefined
    if (expires?.toMillis && expires.toMillis() < Date.now())
        return richError(
            "upload_session_expired",
            "Upload session expired.",
            { uploadSessionId: args.uploadSessionId },
            "Begin a new session and re-send the chunks.",
        )

    // Resolve the chunk set from the per-index byte map and require contiguity.
    const chunkBytes = (session.chunkBytes as Record<string, number>) ?? {}
    const indices = Object.keys(chunkBytes)
        .map((k) => Number(k))
        .sort((a, b) => a - b)
    if (indices.length === 0)
        return richError(
            "no_chunks_uploaded",
            "No chunks were appended to this session.",
            { uploadSessionId: args.uploadSessionId },
            "Append at least one chunk via append_chart_upload_chunk before committing.",
        )
    const maxIndex = indices[indices.length - 1]
    for (let i = 0; i <= maxIndex; i++) {
        if (!(String(i) in chunkBytes))
            return richError(
                "missing_chunk",
                `Chunk index ${i} is missing (have 0..${maxIndex} minus gaps). Re-append it before committing.`,
                {
                    uploadSessionId: args.uploadSessionId,
                    missingIndex: i,
                    receivedChunks: indices.length,
                },
                "Re-send the missing chunk via append_chart_upload_chunk.",
            )
    }
    if (
        typeof session.totalChunks === "number" &&
        indices.length !== session.totalChunks
    )
        return richError(
            "chunk_count_mismatch",
            `Expected ${session.totalChunks} chunks (declared at begin); have ${indices.length}.`,
            {
                uploadSessionId: args.uploadSessionId,
                expected: session.totalChunks,
                received: indices.length,
            },
            "Append the remaining chunks, or begin a new session without totalChunks.",
        )

    // Download + concatenate in ascending index order.
    const bucket = getBucket()
    const parts: Buffer[] = []
    for (let i = 0; i <= maxIndex; i++) {
        const chunkFile = bucket.file(chunkObjectPath(args.uploadSessionId, i))
        const [chunkExists] = await chunkFile.exists()
        if (!chunkExists)
            return richError(
                "missing_chunk",
                `Chunk ${i} byte object is missing from staging (expired or swept).`,
                { uploadSessionId: args.uploadSessionId, missingIndex: i },
                "Re-append the chunk, or begin a new session.",
            )
        try {
            const [bytes] = await chunkFile.download()
            parts.push(Buffer.from(bytes))
        } catch (err) {
            return richError(
                "staged_bytes_unreadable",
                `Could not read chunk ${i}: ${err instanceof Error ? err.message : err}`,
                { uploadSessionId: args.uploadSessionId, chunkIndex: i },
                "Retry commit; if it persists begin a fresh session.",
            )
        }
    }
    const assembled = Buffer.concat(parts)
    if (assembled.byteLength === 0)
        return richError(
            "empty_file",
            "Reassembled upload is empty.",
            { uploadSessionId: args.uploadSessionId },
            "Append the file bytes, then commit.",
        )
    if (assembled.byteLength > MAX_SESSION_SIZE_BYTES)
        return richError(
            "size_exceeds_cap",
            `Reassembled upload is ${assembled.byteLength} bytes; cap is ${MAX_SESSION_SIZE_BYTES}.`,
            {
                uploadSessionId: args.uploadSessionId,
                sizeBytes: assembled.byteLength,
                maxBytes: MAX_SESSION_SIZE_BYTES,
            },
            "Split the file or compress it.",
        )

    // Write the reassembled bytes to the staged `raw` path finalize expects, then
    // delegate to the shared pipeline (mime validation, conversion, dedup→409,
    // Storage + library_index + songs write, library_signals broadcast).
    try {
        await bucket.file(stagedPath(args.uploadSessionId)).save(assembled, {
            contentType:
                typeof session.mimeType === "string"
                    ? session.mimeType
                    : "application/octet-stream",
            resumable: false,
        })
    } catch (err) {
        return richError(
            "staged_write_failed",
            `Could not stage the reassembled upload: ${err instanceof Error ? err.message : err}`,
            { uploadSessionId: args.uploadSessionId },
            "Retry commit; if it persists the Storage bucket may be misconfigured.",
        )
    }

    const result = await finalizeChartUpload(uid, {
        uploadSessionId: args.uploadSessionId,
        force: args.force,
    })

    // Best-effort: drop the chunk byte objects (finalize already cleared `raw`).
    await Promise.all(
        Array.from({ length: maxIndex + 1 }, (_, i) =>
            bucket
                .file(chunkObjectPath(args.uploadSessionId, i))
                .delete()
                .catch(() => undefined),
        ),
    )

    if (!("ok" in result) || result.ok !== true) {
        // finalize already marked the session failed + mapped the error envelope.
        return result
    }

    // v11-02-03 parity: org-stamp the new chart. finalizeChartUpload does NOT
    // stamp (the signed-URL path shares that gap — logged as a deferred issue),
    // so the chunked commit stamps here from the caller's resolved org.
    await stampOrg(db, result.fileId, org)

    return result
}
