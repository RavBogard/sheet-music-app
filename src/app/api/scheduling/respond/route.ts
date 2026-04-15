import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const respondSchema = z.object({
    assignmentId: z.string().min(1),
    action: z.enum(['accept', 'decline']),
    declineReason: z.string().optional(),
})

type SetlistMusicianEntry = { uid?: string; name?: string; email?: string; instrument?: string | null }

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-005: rate-limit accept/decline toggles to prevent notification spam
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { assignmentId, action, declineReason } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const newStatus = action === 'accept' ? 'confirmed' : 'declined'
        const assignmentRef = db.collection('scheduling_assignments').doc(assignmentId)
        let assignment: FirebaseFirestore.DocumentData

        // v4.4 DL-002: single transaction covers the assignment status flip
        // AND (on decline) the setlist.musicians / assignedUids removal, so
        // concurrent declines/assigns can't clobber each other's denorm writes.
        try {
            assignment = await db.runTransaction(async (transaction) => {
                const assignmentDoc = await transaction.get(assignmentRef)

                if (!assignmentDoc.exists) {
                    throw new Error('NOT_FOUND')
                }

                const data = assignmentDoc.data()!

                if (data.musicianUid !== ctx.auth.uid) {
                    throw new Error('FORBIDDEN')
                }

                if (data.status !== 'pending') {
                    throw new Error(`ALREADY_${data.status.toUpperCase()}`)
                }

                // For decline, read the setlist inside the same tx so the
                // filter baseline is coherent with any concurrent assign.
                if (action === 'decline' && typeof data.setlistId === 'string') {
                    const setlistRef = db.collection('setlists').doc(data.setlistId)
                    const setlistDoc = await transaction.get(setlistRef)
                    if (setlistDoc.exists) {
                        const musicians = ((setlistDoc.data()?.musicians ?? []) as SetlistMusicianEntry[])
                        const filtered = musicians.filter(m => m.uid !== ctx.auth.uid)
                        if (filtered.length !== musicians.length) {
                            transaction.update(setlistRef, {
                                musicians: filtered,
                                assignedUids: filtered.map(m => m.uid).filter(Boolean),
                            })
                        }
                    }
                }

                const updateData: Record<string, unknown> = {
                    status: newStatus,
                    respondedAt: FieldValue.serverTimestamp(),
                }
                if (action === 'decline' && declineReason) {
                    updateData.declineReason = declineReason
                }

                transaction.update(assignmentRef, updateData)
                return data
            })
        } catch (e) {
            if (e instanceof Error) {
                if (e.message === 'NOT_FOUND') {
                    return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
                }
                if (e.message === 'FORBIDDEN') {
                    return NextResponse.json({ error: "Not your assignment" }, { status: 403 })
                }
                if (e.message.startsWith('ALREADY_')) {
                    const currentStatus = e.message.replace('ALREADY_', '').toLowerCase()
                    return NextResponse.json({
                        error: `Assignment already ${currentStatus}`,
                        currentStatus,
                    }, { status: 400 })
                }
            }
            throw e
        }

        // Notify the assigner (band leader) about the response — side-effect,
        // kept post-commit so it doesn't bloat the transaction's contention set.
        try {
            const assignerUid = assignment.assignedBy
            if (assignerUid && assignerUid !== ctx.auth.uid) {
                const notifRef = db.collection('users').doc(assignerUid).collection('notifications')
                const musicianName = assignment.musicianName || 'A musician'
                const setlistName = assignment.setlistName || 'a service'

                await notifRef.add({
                    type: action === 'accept' ? 'scheduling_confirmed' : 'scheduling_declined',
                    title: action === 'accept' ? 'Assignment confirmed' : 'Assignment declined',
                    body: `${musicianName} ${newStatus} for "${setlistName}"${declineReason ? ` — "${declineReason}"` : ''}`,
                    link: `/setlists/${assignment.setlistId}`,
                    entityId: assignment.setlistId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            }
        } catch (e) {
            logger.warn('[Scheduling] Failed to notify assigner:', e)
        }

        return NextResponse.json({
            success: true,
            status: newStatus,
            assignmentId,
        })
    },
    { role: 'musician', schema: respondSchema }
)
