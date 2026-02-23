"use client"

import { db } from "@/lib/firebase"
import {
    doc, collection, setDoc, deleteDoc, onSnapshot, updateDoc,
    serverTimestamp, Timestamp
} from "firebase/firestore"
import { logger } from "@/lib/logger"

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
