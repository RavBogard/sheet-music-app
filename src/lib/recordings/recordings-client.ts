// Client-side recordings module (v70-03). Thin by design — no caching layer,
// no store. RecordingBindPopover subscribes directly. Builds on the v70-02
// recordings/{id} collection + the songId+createdAt composite index.

import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore"

import { apiFetch } from "@/lib/api-client"
import { plainT } from "@/i18n/plain"
import { subscribeWithDb, recoverFromFirestoreShutdown } from "@/lib/firebase"
import type { OrgId } from "@/lib/org/types"
import { MAX_RECORDING_BYTES, MAX_RECORDING_MB, resolveAudioUpload } from "@/lib/recordings/upload-policy"
import type { Recording } from "@/types/models"

/**
 * Subscribe to the recordings linked to a song for the current tenant,
 * newest-first.
 *
 * v11.7-06-01: org-scoped. Filters on `orgId` (the viewer's host org) so a
 * recording never crosses the tenant wall — the upload stamps orgId from the
 * host x-org-id, this read filters on it. Uses the
 * `recordings: orgId ASC, songId ASC, createdAt DESC` composite index.
 * Returns the unsubscribe function — call it on popover close / unmount.
 */
export function subscribeRecordingsForSong(
    songId: string,
    orgId: OrgId,
    cb: (recordings: Recording[]) => void,
): () => void {
    return subscribeWithDb((db) => {
        const q = query(
            collection(db, "recordings"),
            where("orgId", "==", orgId),
            where("songId", "==", songId),
            orderBy("createdAt", "desc"),
        )
        return onSnapshot(
            q,
            (snap) => {
                const recordings = snap.docs.map((d) => ({
                    ...(d.data() as Recording),
                    id: d.id,
                }))
                cb(recordings)
            },
            (err) => {
                // Project-wide listener-resilience pattern: a multi-tab IDB
                // version change can kill the listener with "Firestore shutting
                // down" — reload once to recover.
                recoverFromFirestoreShutdown(err)
            },
        )
    })
}

/** Why an upload failed, so the UI can say it plainly. */
export type RecordingUploadErrorKind = "too_big" | "wrong_type" | "network" | "failed"

export class RecordingUploadError extends Error {
    constructor(
        public readonly kind: RecordingUploadErrorKind,
        message: string,
    ) {
        super(message)
        this.name = "RecordingUploadError"
    }
}

function uploadError(kind: RecordingUploadErrorKind, serverMessage?: string): RecordingUploadError {
    const t = plainT()
    const message =
        kind === "too_big"
            ? t("recordings.uploadTooBig", { maxMb: MAX_RECORDING_MB })
            : kind === "wrong_type"
              ? t("recordings.uploadWrongType")
              : kind === "network"
                ? t("recordings.uploadNetwork")
                : serverMessage || t("recordings.uploadFailed")
    return new RecordingUploadError(kind, message)
}

async function failure(res: Response): Promise<RecordingUploadError> {
    let body: { error?: string; code?: string } = {}
    try {
        body = await res.json()
    } catch {
        /* non-JSON error body */
    }
    if (res.status === 413 || body.code === "file_too_large") return uploadError("too_big")
    if (body.code === "unsupported_type") return uploadError("wrong_type")
    return uploadError("failed", body.error)
}

/** PUT the bytes to the signed URL, reporting progress 0..1. */
function putWithProgress(
    url: string,
    headers: Record<string, string>,
    file: File,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", url)
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(uploadError("failed"))
        }
        xhr.onerror = () => reject(uploadError("network"))
        xhr.ontimeout = () => reject(uploadError("network"))
        xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))
        signal?.addEventListener("abort", () => xhr.abort(), { once: true })
        xhr.send(file)
    })
}

/**
 * Upload a reference recording for a song. The bytes go straight to Storage
 * (Vercel refuses request bodies over 4.5 MB):
 *   1. POST /api/recordings/upload-url → a signed PUT for this exact file
 *   2. PUT the file to Storage, with progress
 *   3. POST /api/recordings/upload/complete → the recording doc
 * Errors are RecordingUploadError with a message ready to show.
 */
export async function uploadRecording(input: {
    file: File
    songId: string
    title?: string
    notes?: string
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
}): Promise<{ recordingId: string; title: string }> {
    const { file } = input
    if (!resolveAudioUpload(file.type, file.name)) throw uploadError("wrong_type")
    if (file.size > MAX_RECORDING_BYTES) throw uploadError("too_big")

    let res: Response
    try {
        res = await apiFetch("/api/recordings/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                songId: input.songId,
                fileName: file.name,
                mimeType: file.type,
                size: file.size,
                ...(input.title && { title: input.title }),
                ...(input.notes && { notes: input.notes }),
            }),
            signal: input.signal,
        })
    } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err
        throw uploadError("network")
    }
    if (!res.ok) throw await failure(res)
    const signed = (await res.json()) as {
        recordingId: string
        uploadUrl: string
        headers: Record<string, string>
    }

    await putWithProgress(signed.uploadUrl, signed.headers, file, input.onProgress, input.signal)

    // The bytes are in; finishing is idempotent, so retry once on a blip.
    let done: Response | null = null
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
        try {
            done = await apiFetch("/api/recordings/upload/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recordingId: signed.recordingId }),
                signal: input.signal,
            })
        } catch (err) {
            if ((err as Error)?.name === "AbortError") throw err
            if (attempt === 1) throw uploadError("network")
        }
    }
    if (!done!.ok) throw await failure(done!)
    return done!.json() as Promise<{ recordingId: string; title: string }>
}

/** Band leader: make this recording its song's one featured take. */
export async function featureRecording(recordingId: string): Promise<void> {
    const res = await apiFetch(`/api/recordings/${encodeURIComponent(recordingId)}/feature`, {
        method: "POST",
    })
    if (!res.ok) throw new Error(`feature failed (${res.status})`)
}

/** Playback URL for a recording (the public serving route). */
export function getRecordingPlaybackUrl(recording: Recording): string {
    return `/api/recordings/file/${recording.id}`
}
