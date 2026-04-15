import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingAssignmentSMS } from "@/lib/sms"
import { detectNewSongs, type TrackRef } from "@/lib/new-song-detector"
import { BASE_URL } from "@/lib/constants"
import { sendPushToUsers } from "@/lib/push-send"
import { mergeNewMusicians, type SetlistMusician } from "@/lib/scheduling-merge"

const assignSchema = z.object({
    setlistId: z.string().min(1),
    setlistName: z.string().min(1),
    eventDate: z.string().nullable().optional(), // ISO string or null
    serviceType: z.string().optional(),
    musicians: z.array(z.object({
        uid: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        instrument: z.string().optional(),
        schedulingTier: z.enum(['core', 'regular', 'guest']).optional(),
    })).min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-003: rate-limit bulk assigns (each fires email + SMS + notification)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, setlistName, eventDate, serviceType, musicians } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const baseUrl = BASE_URL
        const created: string[] = []
        const errors: string[] = []

        // Fetch setlist tracks once for new-song detection across all musicians
        let setlistTracks: TrackRef[] = []
        try {
            const setlistDoc = await db.collection('setlists').doc(setlistId).get()
            if (setlistDoc.exists) {
                setlistTracks = (setlistDoc.data()?.tracks ?? []).map(
                    (t: { fileId?: string; title?: string }) => ({ fileId: t.fileId, title: t.title || '' })
                )
            }
        } catch (e) {
            logger.warn('[Scheduling] Failed to fetch setlist tracks for new-song detection:', e)
        }

        for (const musician of musicians) {
            try {
                const isCore = musician.schedulingTier === 'core'

                // Detect new songs BEFORE writing the assignment (so the new assignment
                // doesn't appear in the musician's history and mark everything as "seen")
                let newSongs: { title: string; fileId: string }[] = []
                if (setlistTracks.length > 0) {
                    try {
                        const detected = await detectNewSongs(db, musician.uid, setlistTracks)
                        newSongs = detected.filter(s => s.fileId).map(s => ({ title: s.title, fileId: s.fileId! }))
                    } catch (e) {
                        logger.warn(`[Scheduling] New song detection failed for ${musician.name}:`, e)
                    }
                }

                // Use transaction to prevent duplicate assignments from concurrent requests
                const ref = await db.runTransaction(async (transaction) => {
                    const existing = await transaction.get(
                        db.collection('scheduling_assignments')
                            .where('setlistId', '==', setlistId)
                            .where('musicianUid', '==', musician.uid)
                            .limit(1)
                    )

                    if (!existing.empty) {
                        return null // Already assigned
                    }

                    const assignmentData = {
                        setlistId,
                        setlistName,
                        eventDate: eventDate || null,
                        serviceType: serviceType || null,
                        musicianUid: musician.uid,
                        musicianName: musician.name,
                        musicianEmail: musician.email,
                        musicianPhone: musician.phone || null,
                        instrument: musician.instrument || null,
                        status: isCore ? 'confirmed' : 'pending',
                        autoConfirmed: isCore,
                        assignedBy: ctx.auth.uid,
                        assignedByName: ctx.auth.email || 'Unknown',
                        assignedAt: FieldValue.serverTimestamp(),
                        notifiedVia: [] as string[],
                    }

                    const newRef = db.collection('scheduling_assignments').doc()
                    transaction.set(newRef, assignmentData)
                    return newRef
                })

                if (!ref) continue // Already assigned — skip
                created.push(musician.uid)

                // Check musician's notification preferences
                const musicianDoc = await db.collection('users').doc(musician.uid).get()
                const musicianData = musicianDoc.data()
                const notifPrefs = musicianData?.musicianProfile?.notificationPreferences || {}
                const emailEnabled = notifPrefs.email !== false // default true
                const smsEnabled = notifPrefs.sms === true // default false
                const pushEnabled = notifPrefs.push !== false // default true

                // Send email notification (fire-and-forget) — only if enabled
                if (emailEnabled) { sendSchedulingEmail({
                    to: musician.email,
                    recipientName: musician.name,
                    setlistName,
                    eventDate: eventDate || 'TBD',
                    instrument: musician.instrument,
                    status: isCore ? 'confirmed' : 'pending',
                    scheduleUrl: `${baseUrl}/schedule`,
                    assignmentId: ref.id,
                    newSongs: newSongs.length > 0 ? newSongs : undefined,
                }).then(result => {
                    if (result.ok) {
                        // Update notifiedVia
                        db.collection('scheduling_assignments').doc(ref.id).update({
                            notifiedVia: FieldValue.arrayUnion('email')
                        }).catch(e => logger.warn(`[Scheduling] Failed to track email delivery for assignment ${ref.id}:`, e))
                    }
                }).catch(e => {
                    logger.warn(`[Scheduling] Email failed for ${musician.email}:`, e)
                }) }

                // Send SMS notification if phone provided and enabled (fire-and-forget)
                if (musician.phone && smsEnabled) {
                    sendSchedulingAssignmentSMS({
                        to: musician.phone,
                        musicianName: musician.name,
                        setlistName,
                        eventDate: eventDate || 'TBD',
                        instrument: musician.instrument,
                        status: isCore ? 'confirmed' : 'pending',
                        scheduleUrl: `${baseUrl}/schedule`,
                        newSongs: newSongs.length > 0 ? newSongs.map(s => s.title) : undefined,
                    }).then(result => {
                        if (result.ok) {
                            db.collection('scheduling_assignments').doc(ref.id).update({
                                notifiedVia: FieldValue.arrayUnion('sms')
                            }).catch(e => logger.warn(`[Scheduling] Failed to track SMS delivery for assignment ${ref.id}:`, e))
                        }
                    }).catch(e => {
                        logger.warn(`[Scheduling] SMS failed for ${musician.phone}:`, e)
                    })
                }

                // Create in-app notification — only if enabled
                const instrumentText = musician.instrument ? ` on ${musician.instrument}` : ''
                if (pushEnabled) {
                    try {
                        const notifRef = db.collection('users').doc(musician.uid).collection('notifications')
                        await notifRef.add({
                            type: isCore ? 'scheduling_confirmed' : 'scheduling_request',
                            title: isCore ? 'You\'re confirmed to play' : 'You\'re scheduled to play',
                            body: `You've been assigned${instrumentText} for "${setlistName}"`,
                            link: '/schedule',
                            entityId: ref.id,
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        })
                        // Update notifiedVia
                        await db.collection('scheduling_assignments').doc(ref.id).update({
                            notifiedVia: FieldValue.arrayUnion('in_app')
                        })
                    } catch (e) {
                        logger.warn(`[Scheduling] In-app notification failed for ${musician.uid}:`, e)
                    }

                    // Send FCM push notification (fire-and-forget)
                    sendPushToUsers([musician.uid], {
                        title: isCore ? 'You\'re confirmed to play' : 'You\'re scheduled to play',
                        body: `You've been assigned${instrumentText} for "${setlistName}"`,
                        link: '/schedule',
                    }).catch(err => logger.warn(`[Scheduling] FCM push failed for ${musician.uid}:`, err))
                }
            } catch (e) {
                logger.error(`[Scheduling] Failed to assign ${musician.name}:`, e)
                errors.push(`${musician.name}: ${e instanceof Error ? e.message : 'unknown error'}`)
            }
        }

        // D03 fix: read + write under a transaction so concurrent assigns can't
        // both merge against the same stale baseline and drop each other's writes.
        try {
            const setlistRef = db.collection('setlists').doc(setlistId)
            await db.runTransaction(async (tx) => {
                const setlistDoc = await tx.get(setlistRef)
                if (!setlistDoc.exists) return
                const existingMusicians = (setlistDoc.data()?.musicians || []) as SetlistMusician[]
                const { merged, changed } = mergeNewMusicians(existingMusicians, musicians)
                if (!changed) return
                tx.update(setlistRef, {
                    musicians: merged,
                    assignedUids: merged.map(m => m.uid).filter(Boolean),
                })
            })
        } catch (e) {
            logger.warn('[Scheduling] Failed to sync setlist musicians array:', e)
        }

        return NextResponse.json({
            success: true,
            assigned: created.length,
            errors: errors.length > 0 ? errors : undefined,
        })
    },
    { role: 'band_leader', schema: assignSchema }
)
