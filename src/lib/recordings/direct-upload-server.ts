import "server-only"

import { getStorage } from "firebase-admin/storage"
import { Timestamp, type Firestore } from "firebase-admin/firestore"

import { initAdmin } from "@/lib/firebase-admin"
import { rowOrg } from "@/lib/org/membership"

/**
 * Direct-to-Storage recording uploads (2026-11-02). Vercel refuses request
 * bodies over 4.5 MB before our code runs, so the browser PUTs the bytes
 * straight to a v4 signed Storage URL and then asks the server to finish.
 *
 * Between the two steps a pending record, `recording_uploads/{recordingId}`,
 * holds what was signed: who asked, for which congregation and song, and the
 * exact size and Content-Type. Only that same person in that same
 * congregation can complete it. The collection is server-only (the rules'
 * deny-all fallback covers it).
 */

export const PENDING_COLLECTION = "recording_uploads"
/** A signed PUT must START within this window; a slow upload still finishes. */
export const SIGNED_PUT_TTL_MS = 15 * 60 * 1000
/** Open (uncompleted, unexpired) uploads one person may have at once. */
export const MAX_OPEN_UPLOADS_PER_USER = 5
/** The sweep removes an uncompleted upload this long after its signed URL expired. */
export const SWEEP_GRACE_MS = 60 * 60 * 1000
export const RECORDING_ID_RE = /^rec-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface PendingRecordingUpload {
    recordingId: string
    orgId: string
    uid: string
    songId: string
    storagePath: string
    contentType: string
    size: number
    fileName: string
    title: string
    notes?: string
    createdAt: string
    /** When the signed PUT stops being accepted (a Timestamp, for the sweep's range query). */
    expiresAt: Timestamp
    completedAt?: string
}

function bucket() {
    initAdmin()
    const name =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
    return getStorage().bucket(name)
}

/**
 * A v4 signed PUT for exactly this object, Content-Type and byte count. The
 * returned headers must be sent with the PUT as-is (they are in the signature).
 */
export async function signRecordingPut(
    storagePath: string,
    contentType: string,
    size: number,
    expiresAtMs: number,
): Promise<{ url: string; headers: Record<string, string> }> {
    const lengthRange = `${size},${size}`
    const [url] = await bucket().file(storagePath).getSignedUrl({
        action: "write",
        version: "v4",
        expires: expiresAtMs,
        contentType,
        extensionHeaders: { "x-goog-content-length-range": lengthRange },
    })
    return {
        url,
        headers: { "Content-Type": contentType, "x-goog-content-length-range": lengthRange },
    }
}

/** Size and Content-Type of the uploaded object, or null when it isn't there. */
export async function statRecordingObject(
    storagePath: string,
): Promise<{ size: number; contentType: string } | null> {
    const file = bucket().file(storagePath)
    const [exists] = await file.exists()
    if (!exists) return null
    const [meta] = await file.getMetadata()
    return { size: Number(meta.size ?? 0) || 0, contentType: String(meta.contentType ?? "") }
}

/** Remove a rejected upload; a missing object is fine. */
export async function deleteRecordingObject(storagePath: string): Promise<void> {
    try {
        await bucket().file(storagePath).delete()
    } catch (err) {
        if ((err as { code?: number })?.code === 404) return
        throw err
    }
}

/** True when `songs/{songId}` exists and belongs to `orgId`. */
export async function songBelongsToOrg(db: Firestore, songId: string, orgId: string): Promise<boolean> {
    const snap = await db.collection("songs").doc(songId).get()
    if (!snap.exists) return false
    return rowOrg((snap.data() ?? {}).orgId) === orgId
}

function millis(v: unknown): number {
    if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as Timestamp).toMillis()
    if (typeof v === "string") return Date.parse(v)
    return NaN
}

/** How many uploads this person has started and not finished, whose signed URL is still live. */
export async function countOpenUploads(db: Firestore, uid: string, nowMs: number): Promise<number> {
    const snap = await db.collection(PENDING_COLLECTION).where("uid", "==", uid).get()
    return snap.docs.filter((d) => {
        const data = d.data() as Partial<PendingRecordingUpload>
        return !data.completedAt && millis(data.expiresAt) > nowMs
    }).length
}

/**
 * Remove pending uploads whose signed URL expired more than an hour ago. An
 * uncompleted one also loses its `recordings/` object (bytes nobody finished);
 * a completed one is only the leftover record, and its recording stays. Never
 * deletes an object a recording doc exists for.
 */
export async function sweepExpiredRecordingUploads(
    db: Firestore,
    nowMs: number,
    deleteObject: (path: string) => Promise<void> = deleteRecordingObject,
    limit = 200,
): Promise<{ removed: number; objectsDeleted: number }> {
    const cutoff = Timestamp.fromMillis(nowMs - SWEEP_GRACE_MS)
    const snap = await db.collection(PENDING_COLLECTION).where("expiresAt", "<", cutoff).limit(limit).get()
    let removed = 0
    let objectsDeleted = 0
    for (const d of snap.docs) {
        const data = d.data() as Partial<PendingRecordingUpload>
        if (!data.completedAt && typeof data.storagePath === "string" && data.storagePath.startsWith("recordings/")) {
            const rec = await db.collection("recordings").doc(d.id).get()
            if (!rec.exists) {
                await deleteObject(data.storagePath)
                objectsDeleted++
            }
        }
        await d.ref.delete()
        removed++
    }
    return { removed, objectsDeleted }
}
