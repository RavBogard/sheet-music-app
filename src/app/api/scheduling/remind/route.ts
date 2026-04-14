import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingReminderSMS } from "@/lib/sms"
import { BASE_URL } from "@/lib/constants"
import { formatEventDate } from "@/lib/firestore-helpers"

const remindSchema = z.object({
    setlistId: z.string().min(1),
}).optional()

/**
 * POST /api/scheduling/remind — Send reminders to pending musicians for a setlist.
 * If no setlistId, sends reminders for all pending assignments within the next 48 hours.
 */
export const POST = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')
        const baseUrl = BASE_URL

        const setlistId = ctx.body?.setlistId

        // Get pending assignments
        let query: FirebaseFirestore.Query = db.collection('scheduling_assignments')
            .where('status', '==', 'pending')

        if (setlistId) {
            query = query.where('setlistId', '==', setlistId)
        }

        const snap = await query.get()
        interface PendingAssignment {
            id: string
            eventDate: unknown
            musicianEmail: string
            musicianName: string
            musicianPhone: string | null
            musicianUid: string
            setlistName: string
            instrument: string | undefined
        }
        const pending: PendingAssignment[] = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PendingAssignment)

        // If no setlistId, filter to assignments within the next 48 hours
        const filtered = setlistId
            ? pending
            : pending.filter(a => {
                if (!a.eventDate) return false
                let dateMs: number
                if (typeof a.eventDate === 'string') {
                    dateMs = new Date(a.eventDate).getTime()
                } else if (hasSeconds(a.eventDate)) {
                    dateMs = a.eventDate.seconds * 1000
                } else {
                    return false
                }
                const hoursAway = (dateMs - Date.now()) / (1000 * 60 * 60)
                return hoursAway > 0 && hoursAway <= 48
            })

        let emailsSent = 0
        let smsSent = 0

        for (const assignment of filtered) {
            // Send email reminder
            try {
                const eventDateStr = formatEventDateForEmail(assignment.eventDate)
                const result = await sendSchedulingEmail({
                    to: assignment.musicianEmail,
                    recipientName: assignment.musicianName,
                    setlistName: assignment.setlistName,
                    eventDate: eventDateStr,
                    instrument: assignment.instrument,
                    status: 'pending',
                    scheduleUrl: `${baseUrl}/schedule`,
                    assignmentId: assignment.id,
                })
                if (result.ok) emailsSent++
            } catch (e) {
                logger.warn(`[Scheduling] Reminder email failed for ${assignment.musicianEmail}:`, e)
            }

            // Send SMS reminder if phone available
            if (assignment.musicianPhone) {
                try {
                    const eventDateStr = formatEventDateForEmail(assignment.eventDate)
                    const result = await sendSchedulingReminderSMS({
                        to: assignment.musicianPhone,
                        musicianName: assignment.musicianName,
                        setlistName: assignment.setlistName,
                        eventDate: eventDateStr,
                        instrument: assignment.instrument,
                        scheduleUrl: `${baseUrl}/schedule`,
                    })
                    if (result.ok) smsSent++
                } catch (e) {
                    logger.warn(`[Scheduling] Reminder SMS failed for ${assignment.musicianPhone}:`, e)
                }
            }

            // Create in-app reminder notification
            try {
                const instrumentText = assignment.instrument ? ` on ${assignment.instrument}` : ''
                await db.collection('users').doc(assignment.musicianUid).collection('notifications').add({
                    type: 'scheduling_reminder',
                    title: 'Service reminder',
                    body: `Reminder: You're scheduled${instrumentText} for "${assignment.setlistName}". Please confirm.`,
                    link: '/schedule',
                    entityId: assignment.id,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            } catch (e) {
                logger.warn(`[Scheduling] Reminder notification failed for ${assignment.musicianUid}:`, e)
            }
        }

        logger.info(`[Scheduling] Sent ${emailsSent} reminder emails and ${smsSent} SMS for ${filtered.length} pending assignments`)

        return NextResponse.json({
            success: true,
            reminded: filtered.length,
            emailsSent,
            smsSent,
        })
    },
    { role: 'band_leader', schema: remindSchema }
)

function hasSeconds(v: unknown): v is { seconds: number } {
    return typeof v === 'object' && v !== null && 'seconds' in v && typeof (v as Record<string, unknown>).seconds === 'number'
}

function formatEventDateForEmail(eventDate: unknown): string {
    // Thin wrapper around the canonical helper with an email-friendly 'TBD'
    // fallback. Format ("Friday, February 14") is identical to the canonical —
    // previously duplicated inline here.
    return formatEventDate(eventDate as Parameters<typeof formatEventDate>[0]) ?? 'TBD'
}
