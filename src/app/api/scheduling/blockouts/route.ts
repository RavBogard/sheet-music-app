import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"

// POST: Create a new blockout date range
const createBlockoutSchema = z.object({
    action: z.enum(['create', 'delete']),
    // For create
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().max(200).optional(),
    // For delete
    blockoutId: z.string().optional(),
}).refine(
    (data) => {
        if (data.action === 'create') return !!data.startDate && !!data.endDate
        if (data.action === 'delete') return !!data.blockoutId
        return false
    },
    { message: 'create requires startDate + endDate; delete requires blockoutId' }
)

export const POST = createApiHandler(
    async (ctx) => {
        const { action, startDate, endDate, reason, blockoutId } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        if (action === 'create') {
            // Validate date range
            if (startDate! > endDate!) {
                return NextResponse.json(
                    { error: 'startDate must be before or equal to endDate' },
                    { status: 400 }
                )
            }

            const blockoutData = {
                musicianUid: ctx.auth.uid,
                startDate: startDate!,
                endDate: endDate!,
                reason: reason || null,
                recurring: false,
                createdAt: FieldValue.serverTimestamp(),
            }

            const ref = await db.collection('musician_availability').add(blockoutData)

            logger.info(`[Scheduling] Blockout created: ${ref.id} for ${ctx.auth.uid} (${startDate} to ${endDate})`)

            return NextResponse.json({
                success: true,
                blockoutId: ref.id,
            })
        }

        if (action === 'delete') {
            // Verify ownership
            const blockoutDoc = await db.collection('musician_availability').doc(blockoutId!).get()
            if (!blockoutDoc.exists) {
                return NextResponse.json({ error: 'Blockout not found' }, { status: 404 })
            }
            if (blockoutDoc.data()?.musicianUid !== ctx.auth.uid) {
                return NextResponse.json({ error: 'Cannot delete another musician\'s blockout' }, { status: 403 })
            }

            await db.collection('musician_availability').doc(blockoutId!).delete()

            logger.info(`[Scheduling] Blockout deleted: ${blockoutId} by ${ctx.auth.uid}`)

            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    },
    { role: 'musician', schema: createBlockoutSchema }
)

// GET: List my blockouts (or all if band leader)
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const url = new URL(ctx.req.url)
        const allMusicians = url.searchParams.get('all') === 'true'

        let query: FirebaseFirestore.Query = db.collection('musician_availability')

        if (allMusicians && (ctx.auth.role === 'band_leader' || ctx.auth.role === 'admin')) {
            // Band leaders can see all blockouts
            query = query.orderBy('startDate', 'asc')
        } else {
            // Musicians see only their own
            query = query
                .where('musicianUid', '==', ctx.auth.uid)
                .orderBy('startDate', 'asc')
        }

        const snap = await query.get()
        const blockouts = snap.docs.map(d => ({ id: d.id, ...d.data() }))

        return NextResponse.json({ success: true, blockouts })
    },
    { role: 'musician' }
)
