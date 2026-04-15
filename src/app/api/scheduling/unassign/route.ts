import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingCancellationSMS } from "@/lib/sms"
import { BASE_URL } from "@/lib/constants"
import { formatEventDate } from "@/lib/firestore-helpers"

const unassignSchema = z.object({
    assignmentId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-004: rate-limit cancellation cascade (email + SMS + push)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { assignmentId } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // Use transaction to prevent race with concurrent respond/unassign
        const assignmentRef = db.collection('scheduling_assignments').doc(assignmentId)
        let assignment: FirebaseFirestore.DocumentData

        try {
            assignment = await db.runTransaction(async (transaction) => {
                const assignmentDoc = await transaction.get(assignmentRef)

                if (!assignmentDoc.exists) {
                    throw new Error('NOT_FOUND')
                }

                const data = assignmentDoc.data()!
                transaction.update(assignmentRef, {
                    status: 'cancelled',
                    respondedAt: FieldValue.serverTimestamp(),
                })
                return data
            })
        } catch (e) {
            if (e instanceof Error && e.message === 'NOT_FOUND') {
                return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
            }
            throw e
        }

        // Check musician's notification preferences
        const musicianUid = assignment.musicianUid
        // v4.3 D06: re-read the user profile to get the current display name
        // so renamed users don't see a stale name in cancellation emails/SMS.
        let freshName: string | undefined
        if (musicianUid) {
            try {
                const userSnap = await db.collection('users').doc(musicianUid).get()
                const displayName = userSnap.data()?.displayName
                if (typeof displayName === 'string' && displayName.trim()) {
                    freshName = displayName.trim()
                }
            } catch { /* fall back to denormalized assignment.musicianName */ }
        }
        const musicianName = freshName || assignment.musicianName || 'Musician'
        let emailEnabled = true
        let smsEnabled = false
        let pushEnabled = true
        if (musicianUid) {
            try {
                const musicianDoc = await db.collection('users').doc(musicianUid).get()
                const prefs = musicianDoc.data()?.musicianProfile?.notificationPreferences
                if (prefs) {
                    emailEnabled = prefs.email !== false
                    smsEnabled = prefs.sms === true
                    pushEnabled = prefs.push !== false
                }
            } catch { /* use defaults */ }
        }

        const baseUrl = BASE_URL
        // v4.3 D05: route was handling string + {seconds} shapes but not the
        // native Timestamp from server-side Admin SDK reads. formatEventDate
        // already handles all three shapes uniformly.
        const eventDateStr = formatEventDate(assignment.eventDate) ?? 'TBD'

        // Send cancellation email (fire-and-forget)
        if (emailEnabled && assignment.musicianEmail) {
            sendSchedulingEmail({
                to: assignment.musicianEmail,
                recipientName: musicianName,
                setlistName: assignment.setlistName || 'a service',
                eventDate: eventDateStr,
                instrument: assignment.instrument,
                status: 'cancelled',
                scheduleUrl: `${baseUrl}/schedule`,
                assignmentId,
            }).catch(e => {
                logger.warn(`[Scheduling] Cancellation email failed for ${assignment.musicianEmail}:`, e)
            })
        }

        // Send cancellation SMS (fire-and-forget)
        if (smsEnabled && assignment.musicianPhone) {
            sendSchedulingCancellationSMS({
                to: assignment.musicianPhone,
                musicianName,
                setlistName: assignment.setlistName || 'a service',
                eventDate: eventDateStr,
            }).catch(e => {
                logger.warn(`[Scheduling] Cancellation SMS failed for ${assignment.musicianPhone}:`, e)
            })
        }

        // In-app notification
        if (pushEnabled && musicianUid) {
            try {
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
            } catch (e) {
                logger.warn('[Scheduling] Failed to notify musician of cancellation:', e)
            }
        }

        // Remove from the setlist's musicians array
        try {
            const setlistRef = db.collection('setlists').doc(assignment.setlistId)
            const setlistDoc = await setlistRef.get()
            if (setlistDoc.exists) {
                const musicians = (setlistDoc.data()?.musicians || []) as Array<{ uid?: string }>
                const filtered = musicians.filter(m => m.uid !== assignment.musicianUid)
                await setlistRef.update({
                    musicians: filtered,
                    assignedUids: filtered.map(m => m.uid).filter(Boolean),
                })
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
