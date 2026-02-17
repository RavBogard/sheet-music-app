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

export function subscribeToPresence(
    setlistId: string,
    callback: (entries: PresenceEntry[]) => void
) {
    const col = collection(db, "setlists", setlistId, "presence")
    return onSnapshot(col, (snap) => {
        const entries = snap.docs.map((d) => ({ ...d.data() } as PresenceEntry))
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
    return updateDoc(ref, { "liveState.enabled": enabled })
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
