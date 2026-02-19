/**
 * POST /api/setlist/publish
 *
 * Publishes a setlist and triggers notifications:
 * 1. Set isPublic: true, publishedAt timestamp
 * 2. Record song usage (fire-and-forget)
 * 3. In-app notifications to all members (fire-and-forget)
 * 4. Email notifications to all members with emails (fire-and-forget)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { recordSongUsage } from '@/lib/song-usage'
import { emailAllMembers } from '@/lib/email'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
    try {
        // Auth
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        // Rate limit: 5 publish requests per minute
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const { setlistId } = await request.json()
        if (!setlistId || typeof setlistId !== 'string') {
            return NextResponse.json({ error: 'setlistId is required' }, { status: 400 })
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

        // Auth check: owner, leader, or admin
        const isOwner = setlist.ownerId === auth.uid
        if (!isOwner && !auth.isAdmin) {
            // Check if user is a leader
            const userDoc = await db.collection('users').doc(auth.uid).get()
            const role = userDoc.data()?.role
            if (role !== 'leader' && role !== 'admin') {
                return NextResponse.json({ error: 'Unauthorized — must be owner, leader, or admin' }, { status: 403 })
            }
        }

        // Validate: must have eventDate and at least one song
        const tracks: Array<{ fileId?: string; title: string; key?: string; type?: string }> = setlist.tracks || []
        const hasSongs = tracks.some(t => t.fileId && (!t.type || t.type === 'song'))
        if (!hasSongs) {
            return NextResponse.json({ error: 'Setlist must have at least one song with a linked chart' }, { status: 400 })
        }

        // Step 1: Publish (set isPublic + publishedAt)
        const wasPublic = setlist.isPublic === true
        if (!wasPublic) {
            await setlistRef.update({
                isPublic: true,
                publishedAt: FieldValue.serverTimestamp(),
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

        // Step 3: In-app notifications (server-side via admin SDK)
        // Must be server-side because client Firestore rules prevent reading all user docs
        const membersSnap = await db.collection('users').get()
        const memberUids = membersSnap.docs
            .filter(doc => {
                const role = doc.data().role
                return role && role !== 'pending' && doc.id !== auth.uid
            })
            .map(doc => doc.id)

        const notifBatchSize = 50
        for (let i = 0; i < memberUids.length; i += notifBatchSize) {
            const batch = db.batch()
            const chunk = memberUids.slice(i, i + notifBatchSize)
            for (const uid of chunk) {
                const ref = db.collection('users').doc(uid).collection('notifications').doc()
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

        // Step 4: Email notifications
        const members: Array<{ email: string; displayName: string }> = []
        membersSnap.docs.forEach(doc => {
            const data = doc.data()
            const role = data.role
            if (role && role !== 'pending' && doc.id !== auth.uid && data.email) {
                members.push({
                    email: data.email,
                    displayName: data.displayName || data.email.split('@')[0],
                })
            }
        })

        // Determine base URL
        const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://centralreform.live'
        const publisherName = auth.email?.split('@')[0] || 'A band member'
        const songNames = tracks.filter(t => !t.type || t.type === 'song').map(t => t.title)

        const emailPromise = emailAllMembers(
            members, setlistId, setlistName, eventDateStr,
            publisherName, songNames, origin
        ).catch(err => {
            logger.warn('[Publish] Email sending failed:', err)
            return 0
        })

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
                    memberCount: members.length,
                },
            })
        }).catch(err => logger.warn('[Publish] Audit log failed:', err))

        // Wait for usage + email results
        const [usageResult, emailsSent] = await Promise.all([usagePromise, emailPromise])

        return NextResponse.json({
            success: true,
            wasAlreadyPublic: wasPublic,
            notified: members.length,
            emailed: emailsSent,
            usageRecorded: usageResult.recorded,
        })
    } catch (err) {
        logger.error('[Publish] Error:', err)
        return NextResponse.json({ error: 'Failed to publish setlist' }, { status: 500 })
    }
}
