"use client"

import { db } from "@/lib/firebase"
import {
    doc, collection, addDoc, setDoc, deleteDoc, onSnapshot, updateDoc,
    serverTimestamp, Timestamp
} from "firebase/firestore"
import { logger } from "@/lib/logger"
import type { SetlistTrack } from "@/types/models"

// ── Presence ──

export interface PresenceEntry {
    uid: string
    displayName: string
    photoURL: string | null
    status: "editing" | "performing" | "viewing"
    currentSongIndex: number | null
    lastSeen: Timestamp | null
}

export function writePresence(
    setlistId: string,
    uid: string,
    data: Omit<PresenceEntry, "lastSeen">
) {
    const ref = doc(db, "setlists", setlistId, "presence", uid)
    return setDoc(ref, { ...data, lastSeen: serverTimestamp() })
}

export function removePresence(setlistId: string, uid: string) {
    const ref = doc(db, "setlists", setlistId, "presence", uid)
    return deleteDoc(ref).catch((e) => logger.warn("[Presence] cleanup failed:", e))
}

const STALE_PRESENCE_MS = 5 * 60 * 1000 // 5 minutes

export function subscribeToPresence(
    setlistId: string,
    callback: (entries: PresenceEntry[]) => void
) {
    const col = collection(db, "setlists", setlistId, "presence")
    return onSnapshot(col, (snap) => {
        // M8 fix: Filter out stale presence entries (browsers closed without cleanup)
        const now = Date.now()
        const entries = snap.docs
            .map((d) => ({ ...d.data() } as PresenceEntry))
            .filter(e => {
                if (!e.lastSeen) return false
                return now - e.lastSeen.toMillis() < STALE_PRESENCE_MS
            })
        callback(entries)
    })
}

// ── Live State ──

export interface LiveState {
    enabled: boolean
    currentTrackIndex: number
    updatedBy: string
    updatedByName: string
    updatedAt: Timestamp | null
    /** Last swap metadata — used for receiver-side toast notifications */
    lastSwap?: {
        trackIndex: number        // Which position was swapped
        previousTitle: string     // What was there before
        newTitle: string          // What replaced it
        swappedBy: string         // UID
        swappedByName: string     // Display name
        swappedAt: Timestamp | null
        swapId: string            // Unique ID to deduplicate toast rendering
    }
}

export function enableLiveMode(setlistId: string, enabled: boolean) {
    const ref = doc(db, "setlists", setlistId)
    if (!enabled) {
        // Clear stale track index when ending live mode (H8 fix)
        return updateDoc(ref, {
            "liveState.enabled": false,
            "liveState.currentTrackIndex": -1,
        })
    }
    return updateDoc(ref, { "liveState.enabled": enabled })
}

/**
 * Atomically start live mode and set the initial track in one write.
 * Prevents partial state where live is enabled but track index is stale (C3 fix).
 */
export function startLiveMode(
    setlistId: string,
    uid: string,
    displayName: string
) {
    const ref = doc(db, "setlists", setlistId)
    return updateDoc(ref, {
        "liveState.enabled": true,
        "liveState.currentTrackIndex": 0,
        "liveState.updatedBy": uid,
        "liveState.updatedByName": displayName,
        "liveState.updatedAt": serverTimestamp(),
    })
}

export function updateLiveTrack(
    setlistId: string,
    trackIndex: number,
    uid: string,
    displayName: string
) {
    const ref = doc(db, "setlists", setlistId)
    return updateDoc(ref, {
        "liveState.currentTrackIndex": trackIndex,
        "liveState.updatedBy": uid,
        "liveState.updatedByName": displayName,
        "liveState.updatedAt": serverTimestamp(),
    })
}

// ── Live Swap ──

export interface SwapLiveTrackParams {
    setlistId: string
    trackIndex: number
    currentTracks: SetlistTrack[]   // Current full tracks array (from snapshot)
    newTrack: SetlistTrack          // The replacement track
    previousTrack: SetlistTrack     // The track being replaced
    uid: string
    displayName: string
    reason?: string
}

/**
 * Atomically swap a track in a live setlist and record the change.
 *
 * Writes:
 * 1. setlists/{setlistId} — updated tracks array + liveState.lastSwap
 * 2. setlists/{setlistId}/swapHistory/{auto} — append-only audit entry (fire-and-forget)
 *
 * The tracks array is replaced in full (matching existing setlist save pattern).
 * liveState.lastSwap is updated via dot-notation for partial merge.
 */
export async function swapLiveTrack({
    setlistId,
    trackIndex,
    currentTracks,
    newTrack,
    previousTrack,
    uid,
    displayName,
    reason,
}: SwapLiveTrackParams): Promise<void> {
    const swapId = crypto.randomUUID()

    // Build new tracks array with the swap applied
    const updatedTracks = [...currentTracks]
    updatedTracks[trackIndex] = {
        ...newTrack,
        liturgicalSlot: previousTrack.liturgicalSlot, // Preserve the slot assignment
    }

    const setlistRef = doc(db, "setlists", setlistId)

    // Atomic setlist update: tracks + liveState.lastSwap
    await updateDoc(setlistRef, {
        tracks: updatedTracks,
        trackCount: updatedTracks.length,
        "liveState.lastSwap.trackIndex": trackIndex,
        "liveState.lastSwap.previousTitle": previousTrack.title,
        "liveState.lastSwap.newTitle": newTrack.title,
        "liveState.lastSwap.swappedBy": uid,
        "liveState.lastSwap.swappedByName": displayName,
        "liveState.lastSwap.swappedAt": serverTimestamp(),
        "liveState.lastSwap.swapId": swapId,
    })

    // Append audit trail (non-blocking — don't fail the swap if this errors)
    const historyRef = collection(db, "setlists", setlistId, "swapHistory")
    addDoc(historyRef, {
        trackIndex,
        liturgicalSlot: previousTrack.liturgicalSlot || previousTrack.title,
        previousFileId: previousTrack.fileId || "",
        previousTitle: previousTrack.title,
        newFileId: newTrack.fileId || "",
        newTitle: newTrack.title,
        newKey: newTrack.key || null,
        swappedBy: uid,
        swappedByName: displayName,
        swappedAt: serverTimestamp(),
        reason: reason || null,
    }).catch((e) => logger.warn("[SwapHistory] Failed to write audit entry:", e))
}
