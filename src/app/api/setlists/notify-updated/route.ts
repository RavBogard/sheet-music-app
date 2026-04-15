/**
 * POST /api/setlists/notify-updated
 *
 * Broadcasts an in-app "Setlist updated" notification to all active members
 * except the caller. Runs server-side (Admin SDK) so the client never reads
 * the `users` collection — Firestore rules only allow that read for
 * admin / band_leader / self, so the prior client-side `notifySetlistUpdated`
 * silently failed for everyone else (v4.2 Phase 3-03 fix).
 *
 * Fire-and-forget from the client; errors are logged here and returned as
 * standard apiError responses but the caller swallows them.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
    setlistId: z.string().min(1),
    setlistName: z.string().min(1).max(200),
    trackCount: z.number().int().nonnegative(),
})

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: shared `api` tier (60/min). Matches the tier Phase 2 P01
        // settled on for app-wide routes — no new tier needed.
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        // Fan-out broadcast: restrict to privileged roles (v2.5 P14 decision —
        // "Notification create restricted to admin/band_leader").
        if (!ctx.auth.isBandLeader) {
            return NextResponse.json(
                { error: 'Only band leaders and admins can broadcast setlist updates' },
                { status: 403 }
            )
        }

        const { setlistId, setlistName, trackCount } = ctx.body!

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        // Fetch active member UIDs (Admin SDK bypasses Firestore rules).
        const usersSnap = await db.collection('users')
            .where('role', 'in', ['admin', 'band_leader', 'musician', 'member'])
            .get()

        const recipientUids = usersSnap.docs
            .map(d => d.id)
            .filter(uid => uid !== ctx.auth.uid)

        if (recipientUids.length === 0) {
            return NextResponse.json({ ok: true, count: 0 })
        }

        // Batch notification writes. Mirror the shape `broadcastNotification`
        // writes client-side (and that publish/route.ts writes server-side).
        const BATCH_SIZE = 50
        let writtenCount = 0
        for (let i = 0; i < recipientUids.length; i += BATCH_SIZE) {
            const batch = db.batch()
            const chunk = recipientUids.slice(i, i + BATCH_SIZE)
            for (const uid of chunk) {
                const ref = db.collection('users').doc(uid).collection('notifications').doc()
                batch.set(ref, {
                    type: 'setlist_updated',
                    title: 'Setlist updated',
                    body: `"${setlistName}" was updated (${trackCount} tracks)`,
                    link: `/setlist/${setlistId}`,
                    entityId: setlistId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            }
            try {
                await batch.commit()
                writtenCount += chunk.length
            } catch (err) {
                logger.warn('[notify-updated] batch failed:', err)
                // Partial failure is acceptable — caller is fire-and-forget.
            }
        }

        return NextResponse.json({ ok: true, count: writtenCount })
    },
    { schema }
)
