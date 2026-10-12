/**
 * Notification system.
 * 
 * Notifications are stored per-user in Firestore:
 *   users/{uid}/notifications/{notificationId}
 * 
 * Types:
 *   - setlist_published: A public setlist was created/published
 *   - setlist_updated: Tracks were added/removed from a setlist
 *   - chart_uploaded: A new chart was added to the library
 *   - role_changed: User's role was updated
 *   - scheduling_request: You've been scheduled for a service (accept/decline)
 *   - scheduling_confirmed: A musician confirmed their assignment
 *   - scheduling_declined: A musician declined their assignment
 *   - scheduling_reminder: Reminder about upcoming service assignment
 *   - scheduling_cancelled: A service assignment was cancelled
 */

import { getDb, subscribeWithDb, recoverFromFirestoreShutdown } from '@/lib/firebase'
import {
    collection, query, where, orderBy, limit,
    onSnapshot, doc, updateDoc, writeBatch,
    Timestamp, getDocs,
} from 'firebase/firestore'
import { logger } from '@/lib/logger'

export type NotificationType =
    | 'setlist_published' | 'setlist_updated' | 'chart_uploaded' | 'role_changed' | 'general'
    | 'scheduling_request' | 'scheduling_confirmed' | 'scheduling_declined'
    | 'scheduling_reminder' | 'scheduling_cancelled'

export interface Notification {
    id: string
    type: NotificationType
    title: string
    body: string
    read: boolean
    createdAt: Timestamp | null
    /** Link to navigate to when clicked */
    link?: string
    /** Related entity ID (setlist, file, etc.) */
    entityId?: string
    /** Action buttons for scheduling notifications (accept/decline links) */
    actions?: { label: string; url: string }[]
}

/**
 * Subscribe to a user's notifications (most recent 20, unread first).
 */
export function subscribeToNotifications(
    uid: string,
    callback: (notifications: Notification[]) => void
) {
    return subscribeWithDb((db) => {
        const q = query(
            collection(db, 'users', uid, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(20)
        )

        return onSnapshot(q, (snap) => {
            const notifs = snap.docs.map(d => ({
                id: d.id,
                ...d.data()
            }) as Notification)
            callback(notifs)
        }, (err) => {
            if (!recoverFromFirestoreShutdown(err)) {
                logger.warn('[Notifications] Subscribe failed:', err)
            }
            callback([])
        })
    })
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(uid: string, notificationId: string): Promise<void> {
    try {
        const db = await getDb()
        const ref = doc(db, 'users', uid, 'notifications', notificationId)
        await updateDoc(ref, { read: true })
    } catch (err) {
        logger.warn('[Notifications] markAsRead failed:', err)
    }
}

/**
 * Mark all notifications as read.
 * Note: Firestore rules enforce uid == request.auth.uid, so this
 * only succeeds for the caller's own notifications regardless of uid param.
 */
export async function markAllAsRead(uid: string): Promise<void> {
    // Defense-in-depth: ensure uid matches the authenticated user
    // Wrapped in try-catch because getAuth() throws if no Firebase app is initialized (e.g. tests)
    try {
        const { getAuth } = await import('firebase/auth')
        const currentUid = getAuth().currentUser?.uid
        if (currentUid && uid !== currentUid) {
            logger.warn('markAllAsRead called with mismatched uid:', { uid, currentUid })
            return
        }
    } catch {
        // No Firebase app (test environment) — skip the check, Firestore rules still enforce
    }

    try {
        const db = await getDb()
        const q = query(
            collection(db, 'users', uid, 'notifications'),
            where('read', '==', false)
        )
        const snap = await getDocs(q)
        if (snap.empty) return

        // M3 fix: Chunk batches to stay under Firestore's 500 operations limit
        const BATCH_LIMIT = 450
        for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db)
            snap.docs.slice(i, i + BATCH_LIMIT).forEach(d => {
                batch.update(d.ref, { read: true })
            })
            await batch.commit()
        }
    } catch (err) {
        logger.warn('[Notifications] markAllAsRead failed:', err)
    }
}

// Multi-tenant phase 2: the browser no longer writes other people's
// notifications (rules: users/{uid}/notifications create is server-only).
// Removed: createNotification, broadcastNotification, getActiveMemberUids,
// notifySetlistPublished (Publish is retired), notifyRoleChanged (the
// set-role route writes it), and the notifyScheduling* helpers (no callers;
// the scheduling routes notify server-side).

/**
 * Notify all members about a setlist track update.
 *
 * Delegates to POST /api/setlists/notify-updated — broadcast writes happen
 * server-side via Admin SDK. The previous client-side implementation read
 * the `users` collection, which Firestore rules block for non-privileged
 * roles. Fire-and-forget: caller ignores the promise.
 *
 * The `editorUid` argument is kept for signature compatibility with existing
 * callers (the server derives the caller from the Bearer token).
 */
export async function notifySetlistUpdated(
    setlistName: string,
    setlistId: string,
    trackCount: number,
    _editorUid?: string
): Promise<void> {
    try {
        const { apiFetch } = await import('@/lib/api-client')
        const res = await apiFetch('/api/setlists/notify-updated', {
            method: 'POST',
            body: JSON.stringify({ setlistId, setlistName, trackCount }),
        })
        if (!res.ok) {
            logger.warn('[Notifications] notify-updated responded non-2xx:', res.status)
        }
    } catch (e) {
        logger.warn('[Notifications] Failed to broadcast setlist_updated:', e)
    }
}
