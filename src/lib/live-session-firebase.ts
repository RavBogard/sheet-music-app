import { db } from "./firebase"
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    query,
    where,
    Timestamp
} from "firebase/firestore"
import { logger } from "./logger"

export interface LiveSession {
    id: string
    setlistId: string
    broadcasterId: string
    broadcasterName: string
    queueIndex: number
    currentVisiblePage: number
    updatedAt: Timestamp | null
}

const COLLECTION_PATH = "live_sessions"

/**
 * Update or create a live session broadcast for a given setlist and user.
 */
export async function broadcastLiveSession(
    setlistId: string,
    broadcasterId: string,
    broadcasterName: string,
    queueIndex: number,
    currentVisiblePage: number
) {
    if (!setlistId || !broadcasterId) return

    try {
        const sessionId = `${setlistId}_${broadcasterId}`
        const docRef = doc(db, COLLECTION_PATH, sessionId)

        await setDoc(docRef, {
            setlistId,
            broadcasterId,
            broadcasterName,
            queueIndex,
            currentVisiblePage,
            updatedAt: serverTimestamp(),
        }, { merge: true })
    } catch (e) {
        logger.error("Error broadcasting live session:", e)
    }
}

/**
 * End a live broadcast.
 */
export async function endLiveSession(setlistId: string, broadcasterId: string) {
    if (!setlistId || !broadcasterId) return

    try {
        const sessionId = `${setlistId}_${broadcasterId}`
        const docRef = doc(db, COLLECTION_PATH, sessionId)
        await deleteDoc(docRef)
    } catch (e) {
        logger.error("Error ending live session:", e)
    }
}

/**
 * Subscribe to all active broadcasts for a given setlist.
 * Filters out stale sessions (older than 4 hours).
 */
export function subscribeToLiveSessions(
    setlistId: string,
    callback: (sessions: LiveSession[]) => void
) {
    if (!setlistId) {
        callback([])
        return () => { }
    }

    const q = query(
        collection(db, COLLECTION_PATH),
        where("setlistId", "==", setlistId)
    )

    return onSnapshot(q, (snapshot) => {
        const now = Date.now()
        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

        const activeSessions = snapshot.docs
            .map(doc => {
                const data = doc.data() as LiveSession
                data.id = doc.id
                return data
            })
            // Filter out stale heartbeats gracefully
            .filter(session => {
                if (!session.updatedAt) return true // Probably just written (pending servertime)
                const updatedAtMs = session.updatedAt.toMillis()
                return (now - updatedAtMs) < FOUR_HOURS_MS
            })

        callback(activeSessions)
    }, (error) => {
        logger.error("Error subscribing to live sessions:", error)
        callback([])
    })
}
