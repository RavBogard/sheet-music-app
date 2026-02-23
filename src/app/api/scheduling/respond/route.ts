import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"

const respondSchema = z.object({
    assignmentId: z.string().min(1),
    action: z.enum(['accept', 'decline']),
    declineReason: z.string().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const { assignmentId, action, declineReason } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // Fetch the assignment
        const assignmentRef = db.collection('scheduling_assignments').doc(assignmentId)
        const assignmentDoc = await assignmentRef.get()

        if (!assignmentDoc.exists) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
        }

        const assignment = assignmentDoc.data()!

        // Verify the responding user is the assigned musician
        if (assignment.musicianUid !== ctx.auth.uid) {
            return NextResponse.json({ error: "Not your assignment" }, { status: 403 })
        }

        // Can only respond to pending assignments
        if (assignment.status !== 'pending') {
            return NextResponse.json({
                error: `Assignment already ${assignment.status}`,
                currentStatus: assignment.status,
            }, { status: 400 })
        }

        const newStatus = action === 'accept' ? 'confirmed' : 'declined'

        // Update assignment status
        const updateData: Record<string, unknown> = {
            status: newStatus,
            respondedAt: FieldValue.serverTimestamp(),
        }
        if (action === 'decline' && declineReason) {
            updateData.declineReason = declineReason
        }

        await assignmentRef.update(updateData)

        // Notify the assigner (band leader) about the response
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

        // If declined, remove from the setlist's musicians array
        if (action === 'decline') {
            try {
                const setlistRef = db.collection('setlists').doc(assignment.setlistId)
                const setlistDoc = await setlistRef.get()
                if (setlistDoc.exists) {
                    const musicians = (setlistDoc.data()?.musicians || []) as Array<{ uid?: string }>
                    const filtered = musicians.filter(m => m.uid !== ctx.auth.uid)
                    await setlistRef.update({ musicians: filtered })
                }
            } catch (e) {
                logger.warn('[Scheduling] Failed to remove declined musician from setlist:', e)
            }
        }

        return NextResponse.json({
            success: true,
            status: newStatus,
            assignmentId,
        })
    },
    { role: 'musician', schema: respondSchema }
)
