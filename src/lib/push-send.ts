/**
 * Shared server-side FCM push helper.
 *
 * Sends push notifications using Firebase Admin messaging directly
 * (not via HTTP to /api/push/send). This avoids auth forwarding issues
 * since callers are already server-side API routes.
 *
 * Extracted from /api/push/send/route.ts logic.
 */

import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { logger } from '@/lib/logger'

interface PushNotification {
    title: string
    body: string
    /** Internal path, e.g. '/schedule' or '/perform/setlist/abc123' */
    link?: string
}

interface PushResult {
    sent: number
    failed: number
    staleTokensCleaned: number
}

/**
 * Send FCM push notifications to a list of users by UID.
 *
 * Reads each user's `fcmTokens` array from Firestore,
 * dispatches via Firebase Admin Messaging, and cleans up stale tokens.
 */
export async function sendPushToUsers(
    targetUids: string[],
    notification: PushNotification,
): Promise<PushResult> {
    if (targetUids.length === 0) {
        return { sent: 0, failed: 0, staleTokensCleaned: 0 }
    }

    const ready = initAdmin()
    if (!ready) {
        logger.warn('[Push] Firebase Admin not initialized — skipping push')
        return { sent: 0, failed: 0, staleTokensCleaned: 0 }
    }
    const db = getFirestore()

    // Collect FCM tokens from all target users
    const allTokens: string[] = []
    const TOKEN_BATCH = 30

    for (let i = 0; i < targetUids.length; i += TOKEN_BATCH) {
        const batch = targetUids.slice(i, i + TOKEN_BATCH)
        const refs = batch.map(uid => db.collection('users').doc(uid))
        if (refs.length === 0) continue
        const docs = await db.getAll(...refs)

        for (const userDoc of docs) {
            if (!userDoc.exists) continue
            const tokens = userDoc.data()?.fcmTokens as string[] | undefined
            if (tokens?.length) {
                allTokens.push(...tokens)
            }
        }
    }

    if (allTokens.length === 0) {
        return { sent: 0, failed: 0, staleTokensCleaned: 0 }
    }

    // Build FCM message
    const { getMessaging } = await import('firebase-admin/messaging')
    const messaging = getMessaging()

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
    const webpush = notification.link
        ? { fcmOptions: { link: `${baseUrl}${notification.link}` } }
        : undefined

    let successCount = 0
    let failureCount = 0
    const staleTokens: string[] = []

    // Send in batches of 500 (FCM limit)
    for (let i = 0; i < allTokens.length; i += 500) {
        const batch = allTokens.slice(i, i + 500)
        try {
            const result = await messaging.sendEachForMulticast({
                tokens: batch,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                webpush,
            })

            successCount += result.successCount
            failureCount += result.failureCount

            // Track stale tokens for cleanup
            result.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                    staleTokens.push(batch[idx])
                }
            })
        } catch (err) {
            logger.warn('[Push] Batch send failed:', err)
            failureCount += batch.length
        }
    }

    // Clean up stale tokens
    if (staleTokens.length > 0) {
        for (const uid of targetUids) {
            try {
                const userRef = db.collection('users').doc(uid)
                const userDoc = await userRef.get()
                const tokens = userDoc.data()?.fcmTokens as string[] | undefined
                if (!tokens) continue

                const staleForUser = tokens.filter(t => staleTokens.includes(t))
                if (staleForUser.length > 0) {
                    const updatedTokens = tokens.filter(t => !staleTokens.includes(t))
                    await userRef.update({ fcmTokens: updatedTokens })
                }
            } catch {
                // Best-effort cleanup
            }
        }
    }

    return { sent: successCount, failed: failureCount, staleTokensCleaned: staleTokens.length }
}
