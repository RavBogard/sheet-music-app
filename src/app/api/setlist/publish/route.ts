/**
 * POST /api/setlist/publish
 *
 * Publishes a setlist and triggers notifications:
 * 1. Stamp publishedAt + snapshot
 * 2. Record song usage (fire-and-forget)
 * 3. In-app notifications to assigned musicians with accounts
 * 4. Email notifications to all assigned musicians
 */

import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-wrapper'
import { checkRateLimit } from '@/lib/rate-limit'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { recordSongUsage } from '@/lib/song-usage'
import { getTracksForSetlist } from '@/lib/server-tracks'
import { emailAllMembers } from '@/lib/email'
import { sendPushToUsers } from '@/lib/push-send'
import { sendSMS } from '@/lib/sms'
import { logger } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const musicianSchema = z.object({
    uid: z.string().optional(),
    name: z.string(),
    email: z.string(),
    instrument: z.string().optional(),
})

const schema = z.object({
    setlistId: z.string().min(1),
    musicians: z.array(musicianSchema),
    emailRecipients: z.array(musicianSchema).optional(),
    note: z.string().optional(),
    subject: z.string().optional(),
})

interface MusicianPayload {
    uid?: string
    name: string
    email: string
    instrument?: string
}

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 5 publish requests per minute
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, musicians: rawMusicians, emailRecipients: rawEmailRecipients, note, subject } = ctx.body!

        // Validate musicians array
        const musicians: MusicianPayload[] = Array.isArray(rawMusicians) ? rawMusicians : []
        if (musicians.length === 0) {
            return NextResponse.json({ error: 'At least one musician must be assigned' }, { status: 400 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        // Load setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistDoc = await setlistRef.get()

        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }

        const setlist = setlistDoc.data()!

        // Auth check: owner, band leader, or admin
        const isOwner = setlist.ownerId === ctx.auth.uid
        if (!isOwner && !ctx.auth.isBandLeader) {
            return NextResponse.json({ error: 'Unauthorized — must be owner, band leader, or admin' }, { status: 403 })
        }

        // Validate: must have at least one song
        // v60-04-01: hydration-aware read via shared helper. For hydrated
        // setlists, the embedded `setlist.tracks[]` is stale (engine writes
        // through top-level `tracks/{id}` only); helper queries the live
        // source. Cast preserves the narrow shape used by downstream
        // consumers (publishedSnapshot, recordSongUsage, email body).
        const tracks = (await getTracksForSetlist(db, setlistId, setlist)) as Array<{
            fileId?: string; title: string; key?: string; type?: string
        }>
        const hasSongs = tracks.some(t => t.fileId && (!t.type || t.type === 'song'))
        if (!hasSongs) {
            return NextResponse.json({ error: 'Setlist must have at least one song with a linked chart' }, { status: 400 })
        }

        // Step 1: Publish (stamp publishedAt + snapshot for change detection).
        // Intentionally skips the concurrent-edit precondition used by
        // updateSetlist — publish is a user-initiated action that bumps a
        // snapshot + notification state; it's OK if it races with a recent
        // edit (the snapshot captures whatever tracks are in the doc right now).
        // We still advance `updatedAt` so open editors see the change.
        const songTracks = tracks.filter((t: { type?: string }) => !t.type || t.type === 'song')
        const publishedSnapshot = songTracks.map((t: { title: string; key?: string; fileId?: string }) => ({
            title: t.title, key: t.key || '', fileId: t.fileId || ''
        }))
        const wasPublished = !!setlist.publishedAt
        if (!wasPublished) {
            await setlistRef.update({
                publishedAt: FieldValue.serverTimestamp(),
                publishedSnapshot,
                lastNotifiedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            })
        } else {
            // Re-notify: update snapshot and timestamp
            await setlistRef.update({
                publishedSnapshot,
                lastNotifiedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            })
        }

        // Get event date
        const eventDate = setlist.eventDate?.toDate?.() || setlist.date?.toDate?.() || new Date()
        const eventDateStr = eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        const setlistName = setlist.name || 'Untitled Setlist'

        // Step 2: Record song usage (fire-and-forget)
        const usagePromise = recordSongUsage(setlistId, setlistName, eventDate, tracks)
            .catch(err => {
                logger.warn('[Publish] Song usage recording failed:', err)
                return { recorded: 0, skipped: 0 }
            })

        // Step 3: In-app notifications — only for registered musicians (with uid), excluding publisher
        const registeredMusicians = musicians.filter(m => m.uid && m.uid !== ctx.auth.uid)
        const notifBatchSize = 50
        const inAppResults = { sent: 0, failed: 0 }
        const inAppPromises: Promise<void>[] = []
        for (let i = 0; i < registeredMusicians.length; i += notifBatchSize) {
            const batch = db.batch()
            const chunk = registeredMusicians.slice(i, i + notifBatchSize)
            for (const musician of chunk) {
                const ref = db.collection('users').doc(musician.uid!).collection('notifications').doc()
                batch.set(ref, {
                    type: 'setlist_published',
                    title: 'New setlist published',
                    body: `"${setlistName}" is now available`,
                    link: `/setlist/${setlistId}`,
                    entityId: setlistId,
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                })
            }
            inAppPromises.push(
                batch.commit()
                    .then(() => { inAppResults.sent += chunk.length })
                    .catch(err => {
                        logger.warn('[Publish] In-app notification batch failed:', err)
                        inAppResults.failed += chunk.length
                    })
            )
        }

        // Step 3b: FCM push notifications (tracked, both publish and re-publish)
        const pushResults = { sent: 0, failed: 0 }
        const pushUids = registeredMusicians.map(m => m.uid!)
        const pushPromise = pushUids.length > 0
            ? sendPushToUsers(pushUids, {
                title: 'New setlist published',
                body: `"${setlistName}" is now available`,
                link: `/perform/setlist/${setlistId}`,
            })
                .then(result => {
                    pushResults.sent = result?.sent ?? 0
                    pushResults.failed = result?.failed ?? 0
                })
                .catch(err => {
                    logger.warn('[Publish] FCM push failed:', err)
                    pushResults.failed = pushUids.length
                })
            : Promise.resolve()

        // Step 4: Build email recipient list
        // Client sends emailRecipients — the subset of musicians who should receive email.
        // If not provided (backward compat), email all musicians.
        const clientEmailFilter: MusicianPayload[] | undefined = Array.isArray(rawEmailRecipients) ? rawEmailRecipients : undefined
        const emailableUids = clientEmailFilter ? new Set(clientEmailFilter.map(r => r.uid).filter(Boolean)) : null
        const emailableEmails = clientEmailFilter ? new Set(clientEmailFilter.map(r => r.email?.toLowerCase()).filter(Boolean)) : null

        const emailRecipients: Array<{ email: string; displayName: string }> = []

        // Batch-fetch registered user docs to get emails and SMS preferences
        const registeredUids = musicians.filter(m => m.uid).map(m => m.uid!)

        const userDataMap = new Map<string, Record<string, any>>()
        if (registeredUids.length > 0) {
            const userDocs = await Promise.all(
                registeredUids.map(uid => db.collection('users').doc(uid).get())
            )
            for (const doc of userDocs) {
                if (doc.exists) {
                    const data = doc.data()!
                    userDataMap.set(doc.id, data)
                    if (data.email) {
                        // If client sent a filter, only include musicians in that filter
                        if (emailableUids && !emailableUids.has(doc.id) && !emailableEmails?.has(data.email.toLowerCase())) {
                            continue
                        }
                        emailRecipients.push({
                            email: data.email,
                            displayName: data.displayName || data.email.split('@')[0],
                        })
                    }
                }
            }
        }

        // Add guest musicians (no uid — email comes from payload)
        for (const m of musicians) {
            if (!m.uid && m.email) {
                if (emailableEmails && !emailableEmails.has(m.email.toLowerCase())) {
                    continue
                }
                emailRecipients.push({
                    email: m.email,
                    displayName: m.name || m.email.split('@')[0],
                })
            }
        }

        // Determine base URL and publisher name
        const origin = process.env.NEXT_PUBLIC_BASE_URL || 'https://centralreform.live'
        // Use publisher's displayName from Firestore (respects custom names)
        const publisherDoc = await db.collection('users').doc(ctx.auth.uid).get()
        const publisherName = publisherDoc.data()?.displayName || ctx.auth.email?.split('@')[0] || 'A band member'
        const songNames = tracks.filter(t => !t.type || t.type === 'song').map(t => t.title)
        const publishNote = typeof note === 'string' ? note.trim().slice(0, 2000) : undefined
        const publishSubject = typeof subject === 'string' ? subject.trim().slice(0, 200) : undefined

        // Combine publisher's custom note with service-level notes
        const serviceNotes = setlist.serviceNotes ? String(setlist.serviceNotes).trim() : undefined
        const combinedNote = [publishNote, serviceNotes].filter(Boolean).join('\n\n') || undefined

        const emailPromise = emailRecipients.length > 0
            ? emailAllMembers(
                emailRecipients, setlistId, setlistName, eventDateStr,
                publisherName, songNames, origin, combinedNote, publishSubject
            ).catch(err => {
                logger.warn('[Publish] Email sending failed:', err)
                return { sent: 0, failed: 0, errors: [], messageIds: [], error: err instanceof Error ? err.message : String(err) }
            })
            : Promise.resolve({ sent: 0, failed: 0, errors: [] as string[], messageIds: [] as Array<{ email: string; messageId: string }> })

        // Step 4b: SMS notifications for musicians with SMS preference (tracked)
        // Only for initial publish, not re-publish (to control SMS costs)
        const smsResults = { sent: 0, failed: 0 }
        const smsPromises: Promise<void>[] = []
        if (!wasPublished) {
            for (const musician of registeredMusicians) {
                try {
                    const userData = userDataMap.get(musician.uid!)
                    if (!userData) continue
                    const prefs = userData.musicianProfile?.notificationPreferences || {}
                    const phone = userData.musicianProfile?.phone || userData.phone
                    if (prefs.sms === true && phone) {
                        smsPromises.push(
                            sendSMS(phone, `CRC Music: "${setlistName}" for ${eventDateStr} has been published. View it at ${origin}/perform/setlist/${setlistId}`)
                                .then(() => { smsResults.sent++ })
                                .catch(err => {
                                    logger.warn(`[Publish] SMS failed for ${musician.uid}:`, err)
                                    smsResults.failed++
                                })
                        )
                    }
                } catch (e) {
                    logger.warn(`[Publish] SMS pref check failed for ${musician.uid}:`, e)
                    smsResults.failed++
                }
            }
        }

        // Step 5: Log audit entry (fire-and-forget)
        const historyRef = setlistRef.collection('history').doc()
        historyRef.set({
            action: 'published',
            userId: ctx.auth.uid,
            userName: ctx.auth.email || 'unknown',
            timestamp: FieldValue.serverTimestamp(),
            details: {
                wasAlreadyPublished: wasPublished,
                musicianCount: musicians.length,
                musicianNames: musicians.map(m => m.name),
            },
        }).catch(err => logger.warn('[Publish] Audit log failed:', err))

        // Wait for usage + email + all notification results
        const [usageResult, emailResult] = await Promise.all([usagePromise, emailPromise])
        // Await tracked notification promises (best-effort — failures already caught)
        await Promise.allSettled([...inAppPromises, pushPromise, ...smsPromises])

        const emailed = 'sent' in emailResult ? emailResult.sent : 0
        const emailError = 'error' in emailResult && emailResult.error
            ? String(emailResult.error)
            : 'errors' in emailResult && emailResult.errors.length > 0
                ? `Failed for: ${emailResult.errors.join(', ')}`
                : undefined

        // Step 6: Store email delivery events for tracking (fire-and-forget)
        const msgIds = 'messageIds' in emailResult ? emailResult.messageIds : []
        if (msgIds.length > 0) {
            const emailEventsRef = setlistRef.collection('emailEvents')
            const batch = db.batch()
            for (const { email, messageId } of msgIds) {
                const docRef = emailEventsRef.doc(messageId)
                batch.set(docRef, {
                    recipientEmail: email,
                    resendMessageId: messageId,
                    status: 'sent',
                    timestamp: FieldValue.serverTimestamp(),
                })
            }
            batch.commit().catch(err => logger.warn('[Publish] Email events write failed:', err))
        }

        // Bust Next.js cache so listings reflect the new publishedAt snapshot
        try {
            revalidatePath('/setlists')
            revalidatePath(`/setlists/${setlistId}`)
            revalidatePath(`/perform/setlist/${setlistId}`)
        } catch (e) {
            logger.warn('[Publish] Cache revalidation failed (non-critical)', e)
        }

        return NextResponse.json({
            success: true,
            wasAlreadyPublished: wasPublished,
            notified: registeredMusicians.length, // in-app only (excludes publisher)
            musicianCount: musicians.length,
            emailed,
            emailError: emailError || undefined,
            emailTargets: emailRecipients.length,
            usageRecorded: usageResult.recorded,
            notificationResults: {
                inApp: inAppResults,
                push: pushResults,
                email: { sent: emailed, failed: emailRecipients.length - emailed },
                sms: smsResults,
            },
        })
    },
    { schema }
)
