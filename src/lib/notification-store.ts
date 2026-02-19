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
 */

import { db } from '@/lib/firebase'
import {
    collection, query, where, orderBy, limit,
    onSnapshot, doc, updateDoc, writeBatch,
    serverTimestamp, addDoc, Timestamp, getDocs,
} from 'firebase/firestore'
import { logger } from '@/lib/logger'

export interface Notification {
    id: string
    type: 'setlist_published' | 'setlist_updated' | 'chart_uploaded' | 'role_changed' | 'general'
    title: string
    body: string
    read: boolean
    createdAt: Timestamp | null
    /** Link to navigate to when clicked */
    link?: string
    /** Related entity ID (setlist, file, etc.) */
    entityId?: string
}

/**
 * Subscribe to a user's notifications (most recent 20, unread first).
 */
export function subscribeToNotifications(
    uid: string,
    callback: (notifications: Notification[]) => void
) {
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
        logger.warn('[Notifications] Subscribe failed:', err)
        callback([])
    })
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(uid: string, notificationId: string): Promise<void> {
    const ref = doc(db, 'users', uid, 'notifications', notificationId)
    await updateDoc(ref, { read: true })
}

/**
 * Mark all notifications as read.
 * Note: Firestore rules enforce uid == request.auth.uid, so this
 * only succeeds for the caller's own notifications regardless of uid param.
 */
export async function markAllAsRead(uid: string): Promise<void> {
    const q = query(
        collection(db, 'users', uid, 'notifications'),
        where('read', '==', false)
    )
    const snap = await getDocs(q)
    if (snap.empty) return

    const batch = writeBatch(db)
    snap.docs.forEach(d => {
        batch.update(d.ref, { read: true })
    })
    await batch.commit()
}

/**
 * Create a notification for a specific user.
 * Called server-side or from admin actions.
 */
export async function createNotification(
    uid: string,
    notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<void> {
    const ref = collection(db, 'users', uid, 'notifications')
    await addDoc(ref, {
        ...notification,
        read: false,
        createdAt: serverTimestamp(),
    })
}

/**
 * Broadcast a notification to all members.
 * Typically called when a public setlist is published.
 * Uses a Firestore transaction to batch-create across user docs.
 */
export async function broadcastNotification(
    memberUids: string[],
    notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<void> {
    // Batch write to avoid hitting transaction limits
    const batchSize = 50
    for (let i = 0; i < memberUids.length; i += batchSize) {
        const batch = writeBatch(db)
        const chunk = memberUids.slice(i, i + batchSize)

        for (const uid of chunk) {
            const ref = doc(collection(db, 'users', uid, 'notifications'))
            batch.set(ref, {
                ...notification,
                read: false,
                createdAt: serverTimestamp(),
            })
        }

        await batch.commit()
    }
}

/**
 * Get all active member UIDs (role != 'pending' and not null).
 */
async function getActiveMemberUids(excludeUid?: string): Promise<string[]> {
    const snap = await getDocs(collection(db, 'users'))
    const uids: string[] = []
    snap.docs.forEach(d => {
        const role = d.data().role
        if (role && role !== 'pending' && d.id !== excludeUid) {
            uids.push(d.id)
        }
    })
    return uids
}

/**
 * Notify all members about a setlist event.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function notifySetlistPublished(
    setlistName: string,
    setlistId: string,
    publisherUid?: string
): Promise<void> {
    try {
        const uids = await getActiveMemberUids(publisherUid)
        if (uids.length === 0) return
        await broadcastNotification(uids, {
            type: 'setlist_published',
            title: 'New setlist published',
            body: `"${setlistName}" is now available`,
            link: `/setlist/${setlistId}`,
            entityId: setlistId,
        })
    } catch (e) {
        logger.warn('[Notifications] Failed to broadcast setlist_published:', e)
    }
}

/**
 * Notify all members about a setlist track update.
 */
export async function notifySetlistUpdated(
    setlistName: string,
    setlistId: string,
    trackCount: number,
    editorUid?: string
): Promise<void> {
    try {
        const uids = await getActiveMemberUids(editorUid)
        if (uids.length === 0) return
        await broadcastNotification(uids, {
            type: 'setlist_updated',
            title: 'Setlist updated',
            body: `"${setlistName}" was updated (${trackCount} tracks)`,
            link: `/setlist/${setlistId}`,
            entityId: setlistId,
        })
    } catch (e) {
        logger.warn('[Notifications] Failed to broadcast setlist_updated:', e)
    }
}

/**
 * Notify a user that their role was changed.
 */
export async function notifyRoleChanged(
    targetUid: string,
    newRole: string
): Promise<void> {
    try {
        await createNotification(targetUid, {
            type: 'role_changed',
            title: 'Role updated',
            body: `Your role has been changed to ${newRole}`,
        })
    } catch (e) {
        logger.warn('[Notifications] Failed to notify role change:', e)
    }
}
