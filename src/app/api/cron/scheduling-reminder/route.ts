import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingReminderSMS } from "@/lib/sms"

/**
 * GET /api/cron/scheduling-reminder
 *
 * Cron job: sends reminders for pending assignments where the service is within 48 hours.
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(req: Request) {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.centralreform.live'

        // Get all pending assignments
        const snap = await db.collection('scheduling_assignments')
            .where('status', '==', 'pending')
            .get()

        const now = Date.now()
        const fortyEightHoursMs = 48 * 60 * 60 * 1000

        let reminded = 0
        let emailsSent = 0
        let smsSent = 0

        for (const doc of snap.docs) {
            const a = doc.data()

            // Parse event date
            let eventDateMs: number | null = null
            if (typeof a.eventDate === 'string') {
                eventDateMs = new Date(a.eventDate).getTime()
            } else if (a.eventDate?.seconds) {
                eventDateMs = a.eventDate.seconds * 1000
            }

            if (!eventDateMs) continue

            // Only remind for events within the next 48 hours (and not past)
            const hoursAway = (eventDateMs - now) / (1000 * 60 * 60)
            if (hoursAway <= 0 || hoursAway > 48) continue

            const eventDateStr = new Date(eventDateMs).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
            })

            // Send email
            try {
                const result = await sendSchedulingEmail({
                    to: a.musicianEmail,
                    recipientName: a.musicianName,
                    setlistName: a.setlistName,
                    eventDate: eventDateStr,
                    instrument: a.instrument,
                    status: 'pending',
                    scheduleUrl: `${baseUrl}/schedule`,
                    assignmentId: doc.id,
                })
                if (result.ok) emailsSent++
            } catch (e) {
                logger.warn(`[Cron/Reminder] Email failed for ${a.musicianEmail}`, e)
            }

            // Send SMS if phone available
            if (a.musicianPhone) {
                try {
                    const result = await sendSchedulingReminderSMS({
                        to: a.musicianPhone,
                        musicianName: a.musicianName,
                        setlistName: a.setlistName,
                        eventDate: eventDateStr,
                        instrument: a.instrument,
                        scheduleUrl: `${baseUrl}/schedule`,
                    })
                    if (result.ok) smsSent++
                } catch (e) {
                    logger.warn(`[Cron/Reminder] SMS failed for ${a.musicianPhone}`, e)
                }
            }

            // In-app notification
            try {
                await db.collection('users').doc(a.musicianUid).collection('notifications').add({
                    type: 'scheduling_reminder',
                    title: 'Service coming up!',
                    body: `Reminder: "${a.setlistName}" is ${hoursAway < 24 ? 'tomorrow' : 'in 2 days'}. Please confirm your attendance.`,
                    link: '/schedule',
                    entityId: doc.id,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            } catch (e) {
                logger.warn(`[Cron/Reminder] Notification failed for ${a.musicianUid}`, e)
            }

            reminded++
        }

        logger.info(`[Cron/Reminder] Reminded ${reminded} musicians (${emailsSent} emails, ${smsSent} SMS)`)

        return NextResponse.json({
            success: true,
            reminded,
            emailsSent,
            smsSent,
        })
    } catch (error) {
        logger.error('[Cron/Reminder] Failed:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
