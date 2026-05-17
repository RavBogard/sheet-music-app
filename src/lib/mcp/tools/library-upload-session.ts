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
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
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
 * Sessions auto-expire after 10 minutes (Storage signed URL also
 * expires). Cleanup of abandoned staged blobs is opportunistic — a stale
 * session doc is just a row; the staged blob deletes on next finalize
 * attempt or via the storage lifecycle policy.
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
const STAGED_BUCKET_PREFIX = "upload-sessions"
const MAX_SESSION_SIZE_BYTES = 25 * 1024 * 1024

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
}

export interface FinalizeChartUploadResult {
    ok: true
    fileId: string
    title: string
    collection: LibraryCollection
    sizeBytes: number
}

export async function finalizeChartUpload(
    uid: string,
    args: FinalizeChartUploadArgs,
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
        return richError(
            "upload_failed",
            result.error,
            { tool: "finalize_chart_upload", uploadSessionId: args.uploadSessionId },
            "Inspect the message; if dedup-related, retry with force: true.",
        )
    }

    await sessionRef.update({
        status: "finalized",
        finalizedAt: FieldValue.serverTimestamp(),
        resultFileId: result.fileId,
    })

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
