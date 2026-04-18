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

type IncomingMusician = z.infer<typeof assignSchema>['musicians'][number]
type SetlistMusicianEntry = { uid?: string; name?: string; email?: string; instrument?: string | null }

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-003: rate-limit bulk assigns (each fires email + SMS + notification)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, setlistName, eventDate, serviceType, musicians } = ctx.body!
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        const baseUrl = BASE_URL
        const created: { musician: IncomingMusician; assignmentId: string; newSongs: { title: string; fileId: string }[] }[] = []
        const errors: string[] = []

        // Fetch setlist tracks once for new-song detection across all musicians.
        // Read-only — does NOT participate in the per-musician transaction.
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

        const setlistRef = db.collection('setlists').doc(setlistId)
        const activeAssignmentsQuery = db.collection('scheduling_assignments')
            .where('setlistId', '==', setlistId)
            .where('status', 'in', ['pending', 'confirmed'])

        for (const musician of musicians) {
            try {
                const isCore = musician.schedulingTier === 'core'

                // New-song detection BEFORE writing the assignment so the new
                // assignment doesn't appear in the musician's history yet.
                let newSongs: { title: string; fileId: string }[] = []
                if (setlistTracks.length > 0) {
                    try {
                        const detected = await detectNewSongs(db, musician.uid, setlistTracks)
                        newSongs = detected.filter(s => s.fileId).map(s => ({ title: s.title, fileId: s.fileId! }))
                    } catch (e) {
                        logger.warn(`[Scheduling] New song detection failed for ${musician.name}:`, e)
                    }
                }

                // v4.4 DL-001 + DL-012 + DL-013: single transaction covering
                //   1. Read the active assignments for this setlist (canonical source).
                //   2. Read the setlist doc.
                //   3. Dedup against active (pending/confirmed) assignments only —
                //      declined/cancelled rows are NOT blockers, allowing re-invite.
                //   4. Create the new assignment doc.
                //   5. Rebuild setlists/{id}.musicians + assignedUids from the
                //      canonical active-assignments snapshot (plus the new one),
                //      preserving uid-less guest entries verbatim.
                const txResult = await db.runTransaction(async (transaction) => {
                    const [activeSnap, setlistSnap] = await Promise.all([
                        transaction.get(activeAssignmentsQuery) as unknown as Promise<FirebaseFirestore.QuerySnapshot>,
                        transaction.get(setlistRef) as unknown as Promise<FirebaseFirestore.DocumentSnapshot>,
                    ])

                    const activeDocs = activeSnap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }))

                    const alreadyActive = activeDocs.some(d => d.data.musicianUid === musician.uid)
                    if (alreadyActive) {
                        return { skipped: true as const, reason: 'already_active' }
                    }

                    const newAssignmentRef = db.collection('scheduling_assignments').doc()
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
                    transaction.set(newAssignmentRef, assignmentData)

                    // Rebuild canonical musicians[] from active assignments + this new one.
                    // Preserve uid-less guest entries from the existing setlist.musicians
                    // (they're library-only guests outside the assignment flow).
                    const canonical: SetlistMusicianEntry[] = activeDocs.map(d => ({
                        uid: d.data.musicianUid as string | undefined,
                        name: (d.data.musicianName as string | undefined) ?? '',
                        email: (d.data.musicianEmail as string | undefined) ?? '',
                        instrument: (d.data.instrument as string | null | undefined) ?? null,
                    }))
                    canonical.push({
                        uid: musician.uid,
                        name: musician.name,
                        email: musician.email,
                        instrument: musician.instrument ?? null,
                    })

                    const existingMusicians = (setlistSnap.exists
                        ? ((setlistSnap.data()?.musicians ?? []) as SetlistMusicianEntry[])
                        : [])
                    const guests = existingMusicians.filter(m => !m.uid)

                    // Dedup by uid (canonical wins over guests); guests appended verbatim.
                    const seen = new Set<string>()
                    const finalMusicians: SetlistMusicianEntry[] = []
                    for (const entry of canonical) {
                        if (entry.uid && !seen.has(entry.uid)) {
                            seen.add(entry.uid)
                            finalMusicians.push(entry)
                        }
                    }
                    for (const g of guests) finalMusicians.push(g)

                    if (setlistSnap.exists) {
                        transaction.update(setlistRef, {
                            musicians: finalMusicians,
                            assignedUids: finalMusicians.map(m => m.uid).filter(Boolean),
                        })
                    }

                    return { skipped: false as const, assignmentId: newAssignmentRef.id }
                })

                if (txResult.skipped) {
                    errors.push(`${musician.name}: already has an active assignment`)
                    continue
                }

                created.push({ musician, assignmentId: txResult.assignmentId, newSongs })
            } catch (e) {
                logger.error(`[Scheduling] Failed to assign ${musician.name}:`, e)
                errors.push(`${musician.name}: ${e instanceof Error ? e.message : 'unknown error'}`)
            }
        }

        // Notification cascade — runs AFTER each musician's transaction commits.
        for (const { musician, assignmentId, newSongs } of created) {
            const isCore = musician.schedulingTier === 'core'

            // Check musician's notification preferences
            const musicianDoc = await db.collection('users').doc(musician.uid).get()
            const musicianData = musicianDoc.data()
            const notifPrefs = musicianData?.musicianProfile?.notificationPreferences || {}
            const emailEnabled = notifPrefs.email !== false // default true
            const smsEnabled = notifPrefs.sms === true // default false
            const pushEnabled = notifPrefs.push !== false // default true

            if (emailEnabled) {
                sendSchedulingEmail({
                    to: musician.email,
                    recipientName: musician.name,
                    setlistName,
                    eventDate: eventDate || 'TBD',
                    instrument: musician.instrument,
                    status: isCore ? 'confirmed' : 'pending',
                    scheduleUrl: `${baseUrl}/schedule`,
                    assignmentId,
                    newSongs: newSongs.length > 0 ? newSongs : undefined,
                }).then(result => {
                    if (result.ok) {
                        db.collection('scheduling_assignments').doc(assignmentId).update({
                            notifiedVia: FieldValue.arrayUnion('email')
                        }).catch(e => logger.warn(`[Scheduling] Failed to track email delivery for assignment ${assignmentId}:`, e))
                    }
                }).catch(e => {
                    logger.warn(`[Scheduling] Email failed for ${musician.email}:`, e)
                })
            }

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
                        db.collection('scheduling_assignments').doc(assignmentId).update({
                            notifiedVia: FieldValue.arrayUnion('sms')
                        }).catch(e => logger.warn(`[Scheduling] Failed to track SMS delivery for assignment ${assignmentId}:`, e))
                    }
                }).catch(e => {
                    logger.warn(`[Scheduling] SMS failed for ${musician.phone}:`, e)
                })
            }

            if (pushEnabled) {
                const instrumentText = musician.instrument ? ` on ${musician.instrument}` : ''
                try {
                    const notifRef = db.collection('users').doc(musician.uid).collection('notifications')
                    await notifRef.add({
                        type: isCore ? 'scheduling_confirmed' : 'scheduling_request',
                        title: isCore ? 'You\'re confirmed to play' : 'You\'re scheduled to play',
                        body: `You've been assigned${instrumentText} for "${setlistName}"`,
                        link: '/schedule',
                        entityId: assignmentId,
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    })
                    await db.collection('scheduling_assignments').doc(assignmentId).update({
                        notifiedVia: FieldValue.arrayUnion('in_app')
                    })
                } catch (e) {
                    logger.warn(`[Scheduling] In-app notification failed for ${musician.uid}:`, e)
                }

                sendPushToUsers([musician.uid], {
                    title: isCore ? 'You\'re confirmed to play' : 'You\'re scheduled to play',
                    body: `You've been assigned${musician.instrument ? ` on ${musician.instrument}` : ''} for "${setlistName}"`,
                    link: '/schedule',
                }).catch(err => logger.warn(`[Scheduling] FCM push failed for ${musician.uid}:`, err))
            }
        }

        return NextResponse.json({
            success: true,
            assigned: created.length,
            errors: errors.length > 0 ? errors : undefined,
        })
    },
    { role: 'band_leader', schema: assignSchema }
)

// Note: `mergeNewMusicians` in `@/lib/scheduling-merge` is no longer used by
// this route — the canonical rebuild above replaces it. The module remains in
// place; deprecation belongs in a later phase (DL-011, array-shape normalization).
