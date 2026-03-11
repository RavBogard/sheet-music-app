import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { z } from "zod"

export const dynamic = 'force-dynamic'

const schema = z.object({
    targetUids: z.array(z.string()).min(1).max(500),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
    link: z.string().startsWith('/').optional(),
    icon: z.string().optional(),
})

/**
 * POST /api/push/send
 *
 * Sends push notifications to specified users via FCM.
 * Requires admin or band_leader auth (handles legacy 'leader' role).
 *
 * Reads FCM tokens from each user's `fcmTokens` array in Firestore,
 * then dispatches via Firebase Admin Messaging.
 */
export const POST = createApiHandler(
    async (ctx) => {
        initAdmin()

        const { targetUids, title, body, link } = ctx.body!

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
    },
    { role: 'band_leader', schema }
)
