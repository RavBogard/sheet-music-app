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
    serverTimestamp, addDoc, Timestamp, getDocs,
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

/**
 * Create a notification for a specific user.
 * Called server-side or from admin actions.
 */
export async function createNotification(
    uid: string,
    notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<void> {
    try {
        const db = await getDb()
        const ref = collection(db, 'users', uid, 'notifications')
        await addDoc(ref, {
            ...notification,
            read: false,
            createdAt: serverTimestamp(),
        })
    } catch (err) {
        logger.warn('[Notifications] createNotification failed:', err)
    }
}

/**
 * Broadcast a notification to all members.
 * Typically called when a public setlist is published.
 * Uses a Firestore transaction to batch-create across user docs.
 * Also dispatches push notifications via FCM for offline delivery.
 */
export async function broadcastNotification(
    memberUids: string[],
    notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<void> {
    // Batch write to avoid hitting transaction limits
    const db = await getDb()
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

    // Fire-and-forget: also send push notifications for offline delivery
    sendPushForBroadcast(memberUids, notification).catch(() => {
        // Push is best-effort — don't fail the in-app notification flow
    })
}

/**
 * Send push notifications alongside in-app notifications.
 * Best-effort — errors are swallowed to avoid breaking the in-app flow.
 */
async function sendPushForBroadcast(
    targetUids: string[],
    notification: Omit<Notification, 'id' | 'read' | 'createdAt'>
): Promise<void> {
    try {
        const { apiFetch } = await import('@/lib/api-client')
        await apiFetch('/api/push/send', {
            method: 'POST',
            body: JSON.stringify({
                targetUids,
                title: notification.title,
                body: notification.body,
                link: notification.link,
            }),
        })
    } catch {
        // Silent — push is supplementary to in-app notifications
    }
}

/**
 * Get all active member UIDs (role != 'pending' and not null).
 */
async function getActiveMemberUids(excludeUid?: string): Promise<string[]> {
    // M2 fix: Use filtered query instead of fetching all users
    const db = await getDb()
    const q = query(
        collection(db, 'users'),
        where('role', 'in', ['admin', 'band_leader', 'musician', 'member'])
    )
    const snap = await getDocs(q)
    const uids: string[] = []
    snap.docs.forEach(d => {
        if (d.id !== excludeUid) {
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

// ── Scheduling Notifications ──

/**
 * Notify a musician they've been scheduled for a service.
 */
export async function notifySchedulingRequest(
    musicianUid: string,
    setlistName: string,
    setlistId: string,
    instrument?: string,
    assignmentId?: string,
): Promise<void> {
    try {
        const instrumentText = instrument ? ` on ${instrument}` : ''
        await createNotification(musicianUid, {
            type: 'scheduling_request',
            title: 'You\'re scheduled to play',
            body: `You've been assigned${instrumentText} for "${setlistName}"`,
            link: `/schedule`,
            entityId: assignmentId || setlistId,
        })
    } catch (e) {
        logger.warn('[Notifications] Failed to notify scheduling_request:', e)
    }
}

/**
 * Notify the band leader that a musician confirmed/declined.
 */
export async function notifySchedulingResponse(
    leaderUid: string,
    musicianName: string,
    setlistName: string,
    action: 'confirmed' | 'declined',
    setlistId: string,
): Promise<void> {
    try {
        const type = action === 'confirmed' ? 'scheduling_confirmed' : 'scheduling_declined'
        await createNotification(leaderUid, {
            type,
            title: action === 'confirmed' ? 'Assignment confirmed' : 'Assignment declined',
            body: `${musicianName} ${action} for "${setlistName}"`,
            link: `/setlists/${setlistId}`,
            entityId: setlistId,
        })
    } catch (e) {
        logger.warn(`[Notifications] Failed to notify scheduling_${action}:`, e)
    }
}

/**
 * Send a scheduling reminder to a musician about an upcoming service.
 */
export async function notifySchedulingReminder(
    musicianUid: string,
    setlistName: string,
    setlistId: string,
    eventDateStr: string,
): Promise<void> {
    try {
        await createNotification(musicianUid, {
            type: 'scheduling_reminder',
            title: 'Upcoming service reminder',
            body: `Reminder: "${setlistName}" on ${eventDateStr}`,
            link: `/schedule`,
            entityId: setlistId,
        })
    } catch (e) {
        logger.warn('[Notifications] Failed to notify scheduling_reminder:', e)
    }
}
