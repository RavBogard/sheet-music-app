import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'

interface PushPayload {
    /** User IDs to send push notifications to */
    targetUids: string[]
    /** Notification title */
    title: string
    /** Notification body text */
    body: string
    /** Optional deep link path (e.g., /setlists/abc123) */
    link?: string
    /** Optional icon URL */
    icon?: string
}

/**
 * POST /api/push/send
 *
 * Sends push notifications to specified users via FCM.
 * Requires admin or band_leader auth (handles legacy 'leader' role).
 *
 * Reads FCM tokens from each user's `fcmTokens` array in Firestore,
 * then dispatches via Firebase Admin Messaging.
 */
export async function POST(req: NextRequest) {
    try {
        // Verify auth — uses shared middleware that handles legacy 'leader' role
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        initAdmin()

        const payload: PushPayload = await req.json()
        const { targetUids, title, body, link } = payload

        if (!targetUids?.length || !title || !body) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // H6: Input validation — prevent abuse
        if (targetUids.length > 500) {
            return NextResponse.json({ error: "Too many target users (max 500)" }, { status: 400 })
        }
        if (title.length > 200 || body.length > 500) {
            return NextResponse.json({ error: "Title or body too long" }, { status: 400 })
        }
        if (link && !link.startsWith('/')) {
            return NextResponse.json({ error: "Link must be an internal path" }, { status: 400 })
        }

        const db = getFirestore()

        // Collect FCM tokens from all target users
        const allTokens: string[] = []
        const BATCH_SIZE = 30

        for (let i = 0; i < targetUids.length; i += BATCH_SIZE) {
            const batch = targetUids.slice(i, i + BATCH_SIZE)
            const refs = batch.map(uid => db.collection('users').doc(uid))
            const docs = await db.getAll(...refs)

            for (const userDoc of docs) {
                if (!userDoc.exists) continue
                const data = userDoc.data()
                const tokens = data?.fcmTokens as string[] | undefined
                if (tokens?.length) {
                    allTokens.push(...tokens)
                }
            }
        }

        if (allTokens.length === 0) {
            return NextResponse.json({ sent: 0, message: "No FCM tokens found" })
        }

        // Send via Firebase Admin Messaging
        const { getMessaging } = await import('firebase-admin/messaging')
        const messaging = getMessaging()

        const message = {
            notification: {
                title,
                body,
            },
            webpush: {
                fcmOptions: {
                    link: link ? `${process.env.NEXT_PUBLIC_BASE_URL || ''}${link}` : undefined,
                },
            },
        }

        // Send to each token (FCM sendEachForMulticast for batch)
        let successCount = 0
        let failureCount = 0
        const staleTokens: string[] = []

        // Send in batches of 500 (FCM limit)
        for (let i = 0; i < allTokens.length; i += 500) {
            const batch = allTokens.slice(i, i + 500)
            try {
                const result = await messaging.sendEachForMulticast({
                    tokens: batch,
                    notification: message.notification,
                    webpush: message.webpush,
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
            const { FieldValue } = await import('firebase-admin/firestore')
            for (const uid of targetUids) {
                try {
                    const userRef = db.collection('users').doc(uid)
                    const userDoc = await userRef.get()
                    const tokens = userDoc.data()?.fcmTokens as string[] | undefined
                    if (!tokens) continue

                    const staleForUser = tokens.filter(t => staleTokens.includes(t))
                    if (staleForUser.length > 0) {
                        await userRef.update({
                            fcmTokens: FieldValue.arrayRemove(...staleForUser),
                        })
                    }
                } catch {
                    // Best-effort cleanup
                }
            }
        }

        return NextResponse.json({
            sent: successCount,
            failed: failureCount,
            staleTokensCleaned: staleTokens.length,
        })
    } catch (err) {
        logger.error('[Push] Send failed:', err)
        return NextResponse.json(
            { error: "Failed to send notifications" },
            { status: 500 }
        )
    }
}
