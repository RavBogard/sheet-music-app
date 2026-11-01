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
import { isHostTenantDoc } from "@/lib/org/setlist-tenant"
import { getFormat, getT } from '@/i18n/server'
import { withAuth } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { emailAllMembers } from '@/lib/email'
import { rowOrg } from '@/lib/org/membership'
import { requireFeature } from '@/lib/org/features'
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
            const t = await getT()
            return NextResponse.json(
                { error: t("api-setlist.invalidRequestSetlistId") },
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
            const t = await getT()
            return NextResponse.json({ error: t("api-setlist.setlistNotFound") }, { status: 404 })
        }

        const setlist = setlistDoc.data()!
        // Another tenant's setlist answers exactly as a missing one.
        if (!isHostTenantDoc(setlist, auth.orgId)) {
            const t = await getT()
            return NextResponse.json({ error: t("api-setlist.setlistNotFound") }, { status: 404 })
        }

        // Authorization: owner, band leader, or admin
        const isOwner = setlist.ownerId === auth.uid
        if (!isOwner && !auth.isBandLeader) {
            const t = await getT()
            return NextResponse.json(
                { error: t("api-setlist.ownerLeaderOrAdminRequired") },
                { status: 403 }
            )
        }

        // Multi-tenant phase 6: a resend of the band notification (notifyBand).
        const off = await requireFeature(rowOrg(setlist.orgId), 'notifyBand')
        if (off) return off

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
            const t = await getT()
            return NextResponse.json(
                { error: t("api-setlist.noEmailRecipients") },
                { status: 400 }
            )
        }

        // Get setlist metadata for the email
        const setlistName = setlist.name || 'Untitled Setlist'
        const eventDate = setlist.eventDate?.toDate?.() || setlist.date?.toDate?.() || new Date()
        const eventDateStr = (await getFormat(rowOrg(setlist.orgId))).date(eventDate, { month: 'long', day: 'numeric', year: 'numeric' })
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
        const t = await getT()
        return NextResponse.json(
            { error: t("api-setlist.resendFailed") },
            { status: 500 }
        )
    }
}
