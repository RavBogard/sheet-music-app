/**
 * Setlist Audit Trail
 * 
 * Logs changes to shared/public setlists for accountability.
 * Stores entries in a 'history' subcollection under each setlist doc.
 * 
 * Each entry records: who did what, when, and a snapshot of the change.
 * 
 * History entries are append-only and never modified or deleted by the app.
 */

import { db } from "./firebase"
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from "firebase/firestore"
import { logger } from "@/lib/logger"

export type AuditAction =
    | 'created'
    | 'tracks_updated'
    | 'renamed'
    | 'made_public'
    | 'made_private'
    | 'deleted'
    | 'tracks_reordered'
    | 'track_added'
    | 'track_removed'

export interface AuditEntry {
    action: AuditAction
    userId: string
    userName: string
    timestamp: ReturnType<typeof serverTimestamp>
    details?: Record<string, unknown>
}

/**
 * Log an audit entry for a setlist change.
 * Fire-and-forget — never blocks the main operation.
 */
export function logSetlistChange(
    setlistId: string,
    action: AuditAction,
    userId: string,
    userName: string,
    details?: Record<string, unknown>
): void {
    if (!setlistId || !userId) return

    const historyRef = collection(db, 'setlists', setlistId, 'history')

    addDoc(historyRef, {
        action,
        userId,
        userName: userName || 'Unknown',
        timestamp: serverTimestamp(),
        ...(details && { details: JSON.parse(JSON.stringify(details)) }),
    }).catch(err => {
        // Never let audit failures break the app
        logger.warn('[Audit] Failed to log setlist change:', err)
    })
}

/**
 * Get recent history for a setlist (most recent first).
 * Useful for admin/debugging views.
 */
export async function getSetlistHistory(
    setlistId: string,
    maxEntries: number = 50
): Promise<AuditEntry[]> {
    try {
        const historyRef = collection(db, 'setlists', setlistId, 'history')
        const q = query(historyRef, orderBy('timestamp', 'desc'), limit(maxEntries))
        const snapshot = await getDocs(q)

        return snapshot.docs.map(doc => ({
            ...doc.data(),
        })) as AuditEntry[]
    } catch (err) {
        logger.warn('[Audit] Failed to fetch setlist history:', err)
        return []
    }
}
