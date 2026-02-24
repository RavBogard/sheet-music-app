import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { sendSchedulingAssignmentSMS } from "@/lib/sms"
import { detectNewSongs, type TrackRef } from "@/lib/new-song-detector"

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
        const { setlistId, setlistName, eventDate, serviceType, musicians } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.centralreform.live'
        const created: string[] = []
        const errors: string[] = []

        // Fetch setlist tracks once for new-song detection across all musicians
        let setlistTracks: TrackRef[] = []
        try {
            const setlistDoc = await db.collection('setlists').doc(setlistId).get()
            if (setlistDoc.exists) {
                setlistTracks = ((setlistDoc.data()?.tracks ?? []) as any[]).map(
                    (t: any) => ({ fileId: t.fileId, title: t.title || '' })
                )
            }
        } catch (e) {
            logger.warn('[Scheduling] Failed to fetch setlist tracks for new-song detection:', e)
        }

        for (const musician of musicians) {
            try {
                // Check if assignment already exists
                const existing = await db.collection('scheduling_assignments')
                    .where('setlistId', '==', setlistId)
                    .where('musicianUid', '==', musician.uid)
                    .limit(1)
                    .get()

                if (!existing.empty) {
                    // Already assigned — skip (don't count as newly created)
                    continue
                }

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

                const ref = await db.collection('scheduling_assignments').add(assignmentData)
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
                        }).catch(() => { /* best effort */ })
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
                            }).catch(() => { /* best effort */ })
                        }
                    }).catch(e => {
                        logger.warn(`[Scheduling] SMS failed for ${musician.phone}:`, e)
                    })
                }

                // Create in-app notification — only if enabled
                if (pushEnabled) {
                    try {
                        const notifRef = db.collection('users').doc(musician.uid).collection('notifications')
                        const instrumentText = musician.instrument ? ` on ${musician.instrument}` : ''
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
                }
            } catch (e) {
                logger.error(`[Scheduling] Failed to assign ${musician.name}:`, e)
                errors.push(`${musician.name}: ${e instanceof Error ? e.message : 'unknown error'}`)
            }
        }

        // Also update the setlist's musicians array to keep it in sync
        try {
            const setlistRef = db.collection('setlists').doc(setlistId)
            // Re-fetch to get the latest musicians array (may have changed during assignment loop)
            const setlistDoc = await setlistRef.get()
            if (setlistDoc.exists) {
                const existingMusicians = (setlistDoc.data()?.musicians || []) as Array<{ uid?: string; name: string; email: string; instrument?: string }>
                const existingUids = new Set(existingMusicians.map(m => m.uid).filter(Boolean))

                const newMusicians = musicians
                    .filter(m => !existingUids.has(m.uid))
                    .map(m => ({
                        uid: m.uid,
                        name: m.name,
                        email: m.email,
                        instrument: m.instrument || null,
                    }))

                if (newMusicians.length > 0) {
                    await setlistRef.update({
                        musicians: [...existingMusicians, ...newMusicians],
                    })
                }
            }
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
