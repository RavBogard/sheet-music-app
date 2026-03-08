/**
 * POST /api/setlist/publish
 *
 * Publishes a setlist and triggers notifications:
 * 1. Set isPublic: true, publishedAt timestamp
 * 2. Record song usage (fire-and-forget)
 * 3. In-app notifications to assigned musicians with accounts
 * 4. Email notifications to all assigned musicians
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { recordSongUsage } from '@/lib/song-usage'
import { emailAllMembers } from '@/lib/email'
import { sendPushToUsers } from '@/lib/push-send'
import { sendSMS } from '@/lib/sms'
import { logger } from '@/lib/logger'
import { revalidatePath } from 'next/cache'

interface MusicianPayload {
    uid?: string
    name: string
    email: string
    instrument?: string
}

export async function POST(request: NextRequest) {
    try {
        // Auth
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        // Rate limit: 5 publish requests per minute
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const { setlistId, musicians: rawMusicians, emailRecipients: rawEmailRecipients, note, subject } = await request.json()
        if (!setlistId || typeof setlistId !== 'string') {
            return NextResponse.json({ error: 'setlistId is required' }, { status: 400 })
        }

        // Validate musicians array
        const musicians: MusicianPayload[] = Array.isArray(rawMusicians) ? rawMusicians : []
        if (musicians.length === 0) {
            return NextResponse.json({ error: 'At least one musician must be assigned' }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        // Load setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistDoc = await setlistRef.get()

        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }

        const setlist = setlistDoc.data()!

        // Auth check: owner, band leader, or admin
        const isOwner = setlist.ownerId === auth.uid
        if (!isOwner && !auth.isBandLeader) {
            return NextResponse.json({ error: 'Unauthorized — must be owner, band leader, or admin' }, { status: 403 })
        }

        // Validate: must have at least one song
        const tracks: Array<{ fileId?: string; title: string; key?: string; type?: string }> = setlist.tracks || []
        const hasSongs = tracks.some(t => t.fileId && (!t.type || t.type === 'song'))
        if (!hasSongs) {
            return NextResponse.json({ error: 'Setlist must have at least one song with a linked chart' }, { status: 400 })
        }

        // Step 1: Publish (set isPublic + publishedAt + snapshot for change detection)
        const songTracks = tracks.filter((t: { type?: string }) => !t.type || t.type === 'song')
        const publishedSnapshot = songTracks.map((t: { title: string; key?: string; fileId?: string }) => ({
            title: t.title, key: t.key || '', fileId: t.fileId || ''
        }))
        const wasPublic = setlist.isPublic === true
        if (!wasPublic) {
            await setlistRef.update({
                isPublic: true,
                publishedAt: FieldValue.serverTimestamp(),
                publishedSnapshot,
                lastNotifiedAt: FieldValue.serverTimestamp(),
            })
        } else {
            // Re-notify: update snapshot and timestamp
            await setlistRef.update({
                publishedSnapshot,
                lastNotifiedAt: FieldValue.serverTimestamp(),
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
        const registeredMusicians = musicians.filter(m => m.uid && m.uid !== auth.uid)
        const notifBatchSize = 50
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
            batch.commit().catch(err => logger.warn('[Publish] In-app notification batch failed:', err))
        }

        // Step 3b: FCM push notifications (fire-and-forget, both publish and re-publish)
        const pushUids = registeredMusicians.map(m => m.uid!)
        if (pushUids.length > 0) {
            sendPushToUsers(pushUids, {
                title: 'New setlist published',
                body: `"${setlistName}" is now available`,
                link: `/perform/setlist/${setlistId}`,
            }).catch(err => logger.warn('[Publish] FCM push failed:', err))
        }

        // Step 4: Build email recipient list
        // Client sends emailRecipients — the subset of musicians who should receive email.
        // If not provided (backward compat), email all musicians.
        const clientEmailFilter: MusicianPayload[] | undefined = Array.isArray(rawEmailRecipients) ? rawEmailRecipients : undefined
        const emailableUids = clientEmailFilter ? new Set(clientEmailFilter.map(r => r.uid).filter(Boolean)) : null
        const emailableEmails = clientEmailFilter ? new Set(clientEmailFilter.map(r => r.email?.toLowerCase()).filter(Boolean)) : null

        const emailRecipients: Array<{ email: string; displayName: string }> = []

        // Batch-fetch registered user docs to get emails and SMS preferences
        const registeredUids = musicians.filter(m => m.uid).map(m => m.uid!)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://centralreform.live'
        // Use publisher's displayName from Firestore (respects custom names)
        const publisherDoc = await db.collection('users').doc(auth.uid).get()
        const publisherName = publisherDoc.data()?.displayName || auth.email?.split('@')[0] || 'A band member'
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

        // Step 4b: SMS notifications for musicians with SMS preference (fire-and-forget)
        // Only for initial publish, not re-publish (to control SMS costs)
        if (!wasPublic) {
            for (const musician of registeredMusicians) {
                try {
                    const userData = userDataMap.get(musician.uid!)
                    if (!userData) continue
                    const prefs = userData.musicianProfile?.notificationPreferences || {}
                    const phone = userData.musicianProfile?.phone || userData.phone
                    if (prefs.sms === true && phone) {
                        sendSMS(phone, `CRC Music: "${setlistName}" for ${eventDateStr} has been published. View it at ${origin}/perform/setlist/${setlistId}`)
                            .catch(err => logger.warn(`[Publish] SMS failed for ${musician.uid}:`, err))
                    }
                } catch (e) {
                    logger.warn(`[Publish] SMS pref check failed for ${musician.uid}:`, e)
                }
            }
        }

        // Step 5: Log audit entry (fire-and-forget)
        const historyRef = setlistRef.collection('history').doc()
        db.runTransaction(async () => {
            await historyRef.set({
                action: 'published',
                userId: auth.uid,
                userName: auth.email || 'unknown',
                timestamp: FieldValue.serverTimestamp(),
                details: {
                    wasAlreadyPublic: wasPublic,
                    musicianCount: musicians.length,
                    musicianNames: musicians.map(m => m.name),
                },
            })
        }).catch(err => logger.warn('[Publish] Audit log failed:', err))

        // Wait for usage + email results
        const [usageResult, emailResult] = await Promise.all([usagePromise, emailPromise])

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

        // Bust Next.js aggressive cache so it stops serving initialIsPublic: false on hard reloads
        try {
            revalidatePath('/setlists')
            revalidatePath(`/setlists/${setlistId}`)
            revalidatePath(`/perform/setlist/${setlistId}`)
        } catch (e) {
            logger.warn('[Publish] Cache revalidation failed (non-critical)', e)
        }

        return NextResponse.json({
            success: true,
            wasAlreadyPublic: wasPublic,
            notified: registeredMusicians.length, // in-app only (excludes publisher)
            musicianCount: musicians.length,
            emailed,
            emailError: emailError || undefined,
            emailTargets: emailRecipients.length,
            usageRecorded: usageResult.recorded,
        })
    } catch (err) {
        logger.error('[Publish] Error:', err)
        return NextResponse.json({ error: 'Failed to publish setlist' }, { status: 500 })
    }
}
