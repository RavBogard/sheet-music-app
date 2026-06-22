import { NextResponse } from "next/server"
import crypto from "crypto"

import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { uploadRecordingToStorage } from "@/lib/firebase-storage"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { coerceOrgId } from "@/lib/org/registry"

// Max recording size: 25MB (matches the library upload cap).
const MAX_FILE_SIZE = 25 * 1024 * 1024

// Audio mime → extension. Recordings are reference audio only.
const ALLOWED_AUDIO_TYPES: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
}

/** Resolve an extension from the mime type, falling back to the filename. */
function extForAudio(mimeType: string, fileName: string): string | null {
    if (ALLOWED_AUDIO_TYPES[mimeType]) return ALLOWED_AUDIO_TYPES[mimeType]
    const m = fileName.match(/\.(mp3|m4a|wav|ogg|webm|aac)$/i)
    return m ? m[1].toLowerCase() : null
}

/**
 * POST /api/recordings/upload
 *
 * Upload a reference recording for a song. Accepts multipart/form-data:
 *   - file: the audio file (required)
 *   - songId: the song this recording links to (required)
 *   - title: display name (optional; defaults to filename without extension)
 *   - notes: free-form attribution (optional)
 *
 * Band-leader / admin only — mirrors the recordings/{id} Firestore write rule.
 */
export const POST = createApiHandler(async (ctx) => {
    // Rate limit: shares the 'upload' bucket with library uploads.
    const limited = await checkRateLimit(ctx.req, 'upload')
    if (limited) return limited

    // Recordings are band-internal — only band-leaders and admins may write
    // (mirrors the recordings/{id} Firestore rule shipped in v70-02).
    if (!ctx.auth.isBandLeader && !ctx.auth.isAdmin) {
        return NextResponse.json(
            { error: "Only band leaders and admins can upload recordings." },
            { status: 403 },
        )
    }

    if (!initAdmin()) {
        return NextResponse.json(
            { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
            { status: 500 },
        )
    }
    const db = getFirestore()

    // v11.7-06-01: stamp the recording with the caller's host org, resolved
    // from the Edge-set x-org-id header (crc fallback for missing/unknown).
    // Same idiom as /api/library/list. Closes the v11.1-03 recordings tenancy gap.
    const hostOrg = coerceOrgId(ctx.req.headers.get("x-org-id"))

    const formData = await ctx.req.formData()
    const file = formData.get('file') as File | null
    const songId = (formData.get('songId') as string | null)?.trim()

    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!songId) {
        return NextResponse.json({ error: "songId is required" }, { status: 400 })
    }

    const mimeType = file.type || 'application/octet-stream'
    const ext = extForAudio(mimeType, file.name)
    if (!ext) {
        return NextResponse.json(
            { error: "Only audio files are supported (mp3, m4a, wav, ogg, webm, aac)" },
            { status: 400 },
        )
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
            { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
            { status: 400 },
        )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const recordingId = `rec-${crypto.randomUUID()}`
    const storagePath = await uploadRecordingToStorage(recordingId, buffer, mimeType, ext)

    const rawTitle = (formData.get('title') as string | null)?.trim()
    const title = rawTitle || file.name.replace(/\.[^/.]+$/, '')
    const notes = (formData.get('notes') as string | null)?.trim() || undefined

    // Matches the v70-02 Recording type. createdAt is an ISO string —
    // FirestoreDate accepts string (same convention as library/upload).
    const recordingDoc = {
        id: recordingId,
        // v11.7-06-01: tenant scope resolved from the host x-org-id header
        // (was hardcoded DEFAULT_ORG_ID). crc fallback via coerceOrgId.
        orgId: hostOrg,
        songId,
        title,
        fileName: file.name,
        mimeType,
        storagePath,
        ...(notes && { notes }),
        createdAt: new Date().toISOString(),
        createdBy: ctx.auth.uid,
    }
    await db.collection('recordings').doc(recordingId).set(recordingDoc)

    logger.info(
        `[RecordingUpload] "${title}" uploaded as ${recordingId} for song ${songId}`,
    )

    return NextResponse.json(
        { success: true, recordingId, title },
        { status: 201 },
    )
})
