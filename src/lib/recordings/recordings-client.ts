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
import { subscribeWithDb, recoverFromFirestoreShutdown } from "@/lib/firebase"
import type { OrgId } from "@/lib/org/types"
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

/**
 * Upload a reference recording for a song via POST /api/recordings/upload.
 * apiFetch attaches the Firebase Bearer token and leaves Content-Type unset
 * for the FormData body so the browser sets the multipart boundary.
 */
export async function uploadRecording(input: {
    file: File
    songId: string
    title?: string
    notes?: string
}): Promise<{ recordingId: string; title: string }> {
    const formData = new FormData()
    formData.append("file", input.file)
    formData.append("songId", input.songId)
    if (input.title) formData.append("title", input.title)
    if (input.notes) formData.append("notes", input.notes)

    const res = await apiFetch("/api/recordings/upload", {
        method: "POST",
        body: formData,
    })
    if (!res.ok) {
        let message = "Failed to upload recording"
        try {
            const body = await res.json()
            if (body?.error) message = String(body.error)
        } catch {
            /* non-JSON error body — keep the default message */
        }
        throw new Error(message)
    }
    return res.json() as Promise<{ recordingId: string; title: string }>
}

/** Playback URL for a recording — the auth-gated serving route. */
export function getRecordingPlaybackUrl(recording: Recording): string {
    return `/api/recordings/file/${recording.id}`
}
