import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingReminderSMS } from "@/lib/sms"
import { BASE_URL } from "@/lib/constants"
import { env } from "@/env.mjs"
import { captureException } from "@/lib/error-reporting"
import { cronTenantIds } from "@/lib/org/cron-tenants"
import { reminderDue } from "@/lib/org/locale"
import { rowOrg } from "@/lib/org/membership"
import { scopeRowsToTenant } from "@/lib/org/tenant-query"
import type { OrgId } from "@/lib/org/types"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/scheduling-reminder
 *
 * Cron job: sends reminders for pending assignments where the service is within 48 hours.
 * Protected by CRON_SECRET bearer token.
 *
 * Multi-tenant phase 1: the cron runs HOURLY and each tenant is processed only
 * in the hour its reminder is due (reminderDue: a pinned `reminderUtcHour`,
 * else the tenant-local `reminderLocalHour`). CRC and Brothers Lazaroff pin
 * 10 UTC, the old daily slot, so they send exactly when they always did. A
 * tenant's run touches only its own pending assignments.
 */

/**
 * The tenant's pending assignments. crc keeps the legacy whole-status read and
 * filters in memory, because rows without an orgId are CRC's and are not
 * stamped until phase 2 (an `orgId == "crc"` query would drop them). Every
 * other tenant's rows carry their orgId, so they are queried directly.
 */
async function pendingAssignmentsFor(
    db: FirebaseFirestore.Firestore,
    org: OrgId,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const snap = await scopeRowsToTenant(
        db.collection('scheduling_assignments') as FirebaseFirestore.Query, org,
    )
        .where('status', '==', 'pending')
        .get()
    return snap.docs.filter(d => rowOrg(d.data().orgId) === org)
}
export async function GET(req: Request) {
    // Verify cron secret (constant-time comparison to prevent timing attacks)
    const authHeader = req.headers.get('authorization')
    const cronSecret = env.CRON_SECRET
    if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')
        const baseUrl = BASE_URL

        const now = Date.now()
        const fortyEightHoursMs = 48 * 60 * 60 * 1000

        let reminded = 0
        let emailsSent = 0
        let smsSent = 0

        for (const org of await cronTenantIds()) {
            if (!reminderDue(org, now)) continue

            // This tenant's pending assignments
            const docs = await pendingAssignmentsFor(db, org)

            // Batch-fetch musician preferences to avoid N+1 reads
            const uniqueUids = [...new Set(docs.map(d => d.data().musicianUid as string).filter(Boolean))]
            const prefsMap = new Map<string, { email: boolean; sms: boolean; push: boolean }>()
            if (uniqueUids.length > 0) {
                try {
                    const refs = uniqueUids.map(uid => db.collection('users').doc(uid))
                    const musicianDocs = await db.getAll(...refs)
                    for (const musicianDoc of musicianDocs) {
                        if (!musicianDoc.exists) continue
                        const prefs = musicianDoc.data()?.musicianProfile?.notificationPreferences
                        prefsMap.set(musicianDoc.id, {
                            email: prefs?.email !== false,
                            sms: prefs?.sms === true,
                            push: prefs?.push !== false,
                        })
                    }
                } catch {
                    // If batch fetch fails, defaults will be used
                }
            }

            for (const doc of docs) {
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

                // Skip if already reminded within the last 20 hours (prevents duplicate daily cron sends)
                if (a.lastRemindedAt) {
                    const lastRemindedMs = typeof a.lastRemindedAt === 'object' && a.lastRemindedAt.seconds
                        ? a.lastRemindedAt.seconds * 1000
                        : new Date(a.lastRemindedAt).getTime()
                    if (now - lastRemindedMs < 20 * 60 * 60 * 1000) continue
                }

                const eventDateStr = new Date(eventDateMs).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                })

                // Look up musician's notification preferences from batch result
                const musicianPrefs = prefsMap.get(a.musicianUid)
                const emailEnabled = musicianPrefs?.email ?? true
                const smsEnabled = musicianPrefs?.sms ?? false
                const pushEnabled = musicianPrefs?.push ?? true

                // Send email
                if (emailEnabled) try {
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

                // Send SMS if phone available and enabled
                if (a.musicianPhone && smsEnabled) {
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
                if (pushEnabled) {
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
                }

                // Mark this assignment as reminded so cron doesn't re-send
                try {
                    await doc.ref.update({ lastRemindedAt: FieldValue.serverTimestamp() })
                } catch (e) {
                    logger.warn(`[Cron/Reminder] Failed to update lastRemindedAt for ${doc.id}:`, e)
                }

                reminded++
            }
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
        captureException(error, { source: 'cron', location: 'scheduling-reminder' })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
