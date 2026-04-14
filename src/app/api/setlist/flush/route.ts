/**
 * POST /api/setlist/flush
 *
 * Unload-safe save path. Called from the setlist editor's pagehide/beforeunload
 * handler via `fetch(..., { keepalive: true })` because the in-page Firestore
 * SDK write is a Promise that the browser will kill when the page unloads.
 *
 * Writes via Admin SDK with the same StaleWriteError-safe precondition that
 * `setlist-firebase.ts#updateSetlistWithVersion` enforces for the in-page path
 * (added in Phase 1.1). A stale remote returns 409 so the client can surface a
 * merge banner on the next visit.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"
import { z } from "zod"
import { flushMusicianSchema, flushTrackSchema } from "@/lib/flush-schema"

// Write boundary — strict schemas reject unknown fields so clients can't
// silently inject into Firestore via tracks[*] or musicians[*]. See
// src/lib/flush-schema.ts for the full allowlists.
const schema = z.object({
    setlistId: z.string().min(1),
    // Client sends the `updatedAt` millis it last observed. Null skips the
    // precondition (only used for legacy docs with no updatedAt yet).
    expectedUpdatedAtMs: z.number().int().nullable(),
    data: z.object({
        name: z.string().min(1),
        tracks: z.array(flushTrackSchema),
        trackCount: z.number().int().nonnegative(),
        eventDate: z.string().optional(),
        rabbi: z.string().optional(),
        serviceNotes: z.string().optional(),
        musicians: z.array(flushMusicianSchema).optional(),
    }),
})

const MAX_BODY_BYTES = 512 * 1024

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: shared `api` tier (60/min). Flush fires once per unload,
        // well under the cap for any real editor session.
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        // Size guard — guard against a runaway client shipping a huge payload
        // to a keepalive-eligible endpoint.
        const contentLength = Number(ctx.req.headers.get('content-length') || 0)
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
        }

        const { setlistId, expectedUpdatedAtMs, data } = ctx.body!

        initAdmin()
        const db = getFirestore()
        const ref = db.collection('setlists').doc(setlistId)

        try {
            const result = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref)
                if (!snap.exists) return { kind: 'not-found' as const }

                const remote = snap.data()!

                // Role gate inside the transaction for atomic consistency
                const isOwner = remote.ownerId === ctx.auth.uid
                if (!isOwner && !ctx.auth.isBandLeader) {
                    return { kind: 'forbidden' as const }
                }

                // Precondition — mirror setlist-firebase.ts#updateSetlistWithVersion
                if (expectedUpdatedAtMs !== null) {
                    const remoteUpdatedAt = remote.updatedAt instanceof Timestamp ? remote.updatedAt : null
                    const remoteMs = remoteUpdatedAt ? remoteUpdatedAt.toMillis() : null
                    if (remoteMs !== null && remoteMs !== expectedUpdatedAtMs) {
                        return { kind: 'stale' as const, remoteUpdatedAtMs: remoteMs }
                    }
                }

                // Strip any server-controlled keys the schema let through the shape check
                const patch: Record<string, unknown> = {
                    name: data.name,
                    tracks: data.tracks,
                    trackCount: data.trackCount,
                    updatedAt: FieldValue.serverTimestamp(),
                }
                if (data.eventDate !== undefined) patch.eventDate = data.eventDate
                if (data.rabbi !== undefined) patch.rabbi = data.rabbi
                if (data.serviceNotes !== undefined) patch.serviceNotes = data.serviceNotes
                if (data.musicians !== undefined) patch.musicians = data.musicians

                tx.update(ref, patch)
                return { kind: 'ok' as const }
            })

            if (result.kind === 'not-found') {
                return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
            }
            if (result.kind === 'forbidden') {
                return NextResponse.json({ error: 'Not authorized to edit this setlist' }, { status: 403 })
            }
            if (result.kind === 'stale') {
                return NextResponse.json(
                    { error: 'stale', remoteUpdatedAtMs: result.remoteUpdatedAtMs },
                    { status: 409 }
                )
            }
            return NextResponse.json({ ok: true })
        } catch (err) {
            logger.error('[setlist/flush] write failed:', err)
            return NextResponse.json({ error: 'Flush failed' }, { status: 500 })
        }
    },
    { schema }
)
