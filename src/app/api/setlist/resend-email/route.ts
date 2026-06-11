/**
 * POST /api/setlist/resend-email
 *
 * Re-sends email notifications for a published setlist.
 * Used when the initial publish succeeded but email delivery failed.
 *
 * Auth: Requires owner, band_leader, or admin.
 * Rate limited: Uses 'api' tier to prevent email spam.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { emailAllMembers } from '@/lib/email'
import { rowOrg } from '@/lib/org/membership'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { getTracksForSetlist } from '@/lib/server-tracks'

const bodySchema = z.object({
    setlistId: z.string().min(1),
})

export async function POST(request: NextRequest) {
    try {
        // Auth
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        // Rate limit: uses 'api' tier (60 req/min) to prevent email spam
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        // Validate request body
        const parseResult = bodySchema.safeParse(await request.json())
        if (!parseResult.success) {
            return NextResponse.json(
                { error: 'Invalid request: setlistId is required' },
                { status: 400 }
            )
        }

        const { setlistId } = parseResult.data

        initAdmin()
        const db = getFirestore()

        // Load setlist
        const setlistRef = db.collection('setlists').doc(setlistId)
        const setlistDoc = await setlistRef.get()

        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }

        const setlist = setlistDoc.data()!

        // Authorization: owner, band leader, or admin
        const isOwner = setlist.ownerId === auth.uid
        if (!isOwner && !auth.isBandLeader) {
            return NextResponse.json(
                { error: 'Unauthorized — must be owner, band leader, or admin' },
                { status: 403 }
            )
        }

        // 2026-05-28: publishedAt-as-gate killed per Daniel's
        // err-public-not-gated binding invariant (decisions.md
        // 2026-05-28T~15:50Z + ~16:00Z). The owner/leader resend flow no
        // longer requires a publishedAt stamp — if a musician/leader
        // wants to email the band about a setlist, the only relevant
        // gate is "are you the owner/band-leader/admin?" (checked above).

        // Build email recipient list (same logic as publish route)
        const musicians: Array<{ uid?: string; name: string; email: string }> = Array.isArray(setlist.musicians) ? setlist.musicians : []
        const emailRecipients: Array<{ email: string; displayName: string }> = []

        // Fetch registered users to get their emails
        const registeredUids = musicians.filter(m => m.uid).map(m => m.uid!)
        if (registeredUids.length > 0) {
            const userDocs = await Promise.all(
                registeredUids.map(uid => db.collection('users').doc(uid).get())
            )
            for (const doc of userDocs) {
                if (doc.exists) {
                    const data = doc.data()!
                    if (data.email) {
                        emailRecipients.push({
                            email: data.email,
                            displayName: data.displayName || data.email.split('@')[0],
                        })
                    }
                }
            }
        }

        // Add guest musicians (no uid -- email comes from stored data)
        for (const m of musicians) {
            if (!m.uid && m.email) {
                emailRecipients.push({
                    email: m.email,
                    displayName: m.name || m.email.split('@')[0],
                })
            }
        }

        if (emailRecipients.length === 0) {
            return NextResponse.json(
                { error: 'No email recipients found for this setlist' },
                { status: 400 }
            )
        }

        // Get setlist metadata for the email
        const setlistName = setlist.name || 'Untitled Setlist'
        const eventDate = setlist.eventDate?.toDate?.() || setlist.date?.toDate?.() || new Date()
        const eventDateStr = eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        // v60-04-03: hydration-aware read via shared helper. Cast preserves
        // narrow shape for the songNames builder one line below. Embedded
        // setlist.tracks[] is stale post-hydration.
        const tracks = (await getTracksForSetlist(db, setlistId, setlist)) as Array<{
            title: string; type?: string
        }>

        const songNames = tracks.filter(t => !t.type || t.type === 'song').map(t => t.title)

        // Get publisher name
        const publisherDoc = await db.collection('users').doc(auth.uid).get()
        const publisherName = publisherDoc.data()?.displayName || auth.email?.split('@')[0] || 'A band member'

        const origin = request.headers.get('origin')
            || request.headers.get('referer')?.replace(/\/[^/]*$/, '')
            || 'https://centralreform.live'

        // Send emails — v11.4-02 (D8 item 4): brand by the setlist's own org.
        // note + subject stay defaulted; org is the trailing positional arg.
        const org = rowOrg(setlist.orgId)
        const result = await emailAllMembers(
            emailRecipients,
            setlistId,
            setlistName,
            eventDateStr,
            publisherName,
            songNames,
            origin,
            undefined,
            undefined,
            org,
        )

        return NextResponse.json({
            success: true,
            sent: result.sent,
            failed: result.failed,
            errors: result.errors,
        })
    } catch (err) {
        logger.error('[ResendEmail] Error:', err)
        return NextResponse.json(
            { error: 'Failed to resend emails' },
            { status: 500 }
        )
    }
}
