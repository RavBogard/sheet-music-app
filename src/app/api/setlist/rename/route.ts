import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { chunkBatchUpdate } from "@/lib/firestore-batch"
import { z } from "zod"

// v4.4 DL-010: setlist rename with fan-out of the denormalized
// setlistName copies across every scheduling_assignments doc pointing at it.
const setlistRenameSchema = z.object({
    setlistId: z.string().min(1),
    name: z.string().min(1).max(200),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, name } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistSnap = await setlistRef.get()
        if (!setlistSnap.exists) {
            return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
        }

        const setlist = setlistSnap.data()!
        const isOwner = setlist.ownerId === ctx.auth.uid
        if (!isOwner && !ctx.auth.isBandLeader && !ctx.auth.isAdmin) {
            return NextResponse.json({ error: "Not allowed to rename this setlist" }, { status: 403 })
        }

        // No-op short-circuit.
        if (setlist.name === name) {
            return NextResponse.json({ success: true, updated: { assignments: 0 } })
        }

        await setlistRef.update({
            name,
            updatedAt: FieldValue.serverTimestamp(),
        })

        // Fan-out: every assignment with this setlistId needs the denormalized copy refreshed.
        const snap = await db.collection('scheduling_assignments')
            .where('setlistId', '==', setlistId)
            .get()

        let updated = 0
        const errors: string[] = []
        if (!snap.empty) {
            const refs = snap.docs.map(d => d.ref)
            const result = await chunkBatchUpdate(db, refs, { setlistName: name })
            updated = result.updated
            for (const err of result.errors) errors.push(err.message)
        }

        logger.info(`[Setlist] rename fan-out setlistId=${setlistId} assignments=${updated}`)

        return NextResponse.json({
            success: true,
            updated: { assignments: updated },
            errors: errors.length > 0 ? errors : undefined,
        })
    },
    { role: 'band_leader', schema: setlistRenameSchema }
)
