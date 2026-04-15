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

type SetlistMusicianEntry = { uid?: string; name?: string; email?: string; instrument?: string | null }

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-004: rate-limit cancellation cascade (email + SMS + push)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { assignmentId } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // v4.4 DL-003 + DL-014: single transaction covers the assignment status
        // flip AND the setlist.musicians / assignedUids mutation. State-machine
        // guard rejects transitions from terminal states (declined / cancelled)
        // so a late cancel click can't overwrite a valid decline.
        const assignmentRef = db.collection('scheduling_assignments').doc(assignmentId)
        let assignment: FirebaseFirestore.DocumentData

        try {
            assignment = await db.runTransaction(async (transaction) => {
                const assignmentDoc = await transaction.get(assignmentRef)

                if (!assignmentDoc.exists) {
                    throw new Error('NOT_FOUND')
                }

                const data = assignmentDoc.data()!

                if (data.status !== 'pending' && data.status !== 'confirmed') {
                    throw new Error(`INVALID_TRANSITION:${data.status}`)
                }

                const setlistId = data.setlistId as string | undefined
                const musicianUid = data.musicianUid as string | undefined

                // Read the setlist inside the same transaction so the filter
                // baseline is coherent with the concurrent-assign path.
                if (setlistId) {
                    const setlistRef = db.collection('setlists').doc(setlistId)
                    const setlistDoc = await transaction.get(setlistRef)
                    if (setlistDoc.exists) {
                        const musicians = ((setlistDoc.data()?.musicians ?? []) as SetlistMusicianEntry[])
                        const filtered = musicians.filter(m => m.uid !== musicianUid)
                        if (filtered.length !== musicians.length) {
                            transaction.update(setlistRef, {
                                musicians: filtered,
                                assignedUids: filtered.map(m => m.uid).filter(Boolean),
                            })
                        }
                    }
                }

                transaction.update(assignmentRef, {
                    status: 'cancelled',
                    respondedAt: FieldValue.serverTimestamp(),
                })
                return data
            })
        } catch (e) {
            if (e instanceof Error) {
                if (e.message === 'NOT_FOUND') {
                    return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
                }
                if (e.message.startsWith('INVALID_TRANSITION:')) {
                    const currentStatus = e.message.slice('INVALID_TRANSITION:'.length)
                    return NextResponse.json({
                        error: `Cannot cancel assignment in '${currentStatus}' state`,
                        currentStatus,
                    }, { status: 400 })
                }
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

        return NextResponse.json({
            success: true,
            assignmentId,
        })
    },
    { role: 'band_leader', schema: unassignSchema }
)
