import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"

const unassignSchema = z.object({
    assignmentId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        const { assignmentId } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // Fetch the assignment
        const assignmentRef = db.collection('scheduling_assignments').doc(assignmentId)
        const assignmentDoc = await assignmentRef.get()

        if (!assignmentDoc.exists) {
            return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
        }

        const assignment = assignmentDoc.data()!

        // Cancel the assignment
        await assignmentRef.update({
            status: 'cancelled',
            respondedAt: FieldValue.serverTimestamp(),
        })

        // Notify the musician about cancellation
        try {
            const musicianUid = assignment.musicianUid
            if (musicianUid) {
                const notifRef = db.collection('users').doc(musicianUid).collection('notifications')
                await notifRef.add({
                    type: 'scheduling_cancelled',
                    title: 'Service assignment cancelled',
                    body: `Your assignment for "${assignment.setlistName || 'a service'}" has been cancelled`,
                    link: '/schedule',
                    entityId: assignment.setlistId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            }
        } catch (e) {
            logger.warn('[Scheduling] Failed to notify musician of cancellation:', e)
        }

        // Remove from the setlist's musicians array
        try {
            const setlistRef = db.collection('setlists').doc(assignment.setlistId)
            const setlistDoc = await setlistRef.get()
            if (setlistDoc.exists) {
                const musicians = (setlistDoc.data()?.musicians || []) as Array<{ uid?: string }>
                const filtered = musicians.filter(m => m.uid !== assignment.musicianUid)
                await setlistRef.update({ musicians: filtered })
            }
        } catch (e) {
            logger.warn('[Scheduling] Failed to remove musician from setlist:', e)
        }

        return NextResponse.json({
            success: true,
            assignmentId,
        })
    },
    { role: 'band_leader', schema: unassignSchema }
)
