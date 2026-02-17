import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFirestore } from "@/lib/firebase-admin"
import { sendSetlistEmail } from "@/lib/email"
import { logger } from "@/lib/logger"

export const maxDuration = 120

/**
 * POST /api/setlist/email-packets
 *
 * Sends each active band member an email with a link to download
 * their personalized packet. Links hit /api/setlist/print/personal
 * which generates on demand with the user's transposition.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await withAuth(request)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const { setlistId, recipientUids } = await request.json()
        if (!setlistId) {
            return NextResponse.json({ error: 'setlistId required' }, { status: 400 })
        }

        const db = getFirestore()

        // Load setlist
        const setlistDoc = await db.collection('setlists').doc(setlistId).get()
        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }
        const setlist = setlistDoc.data()!

        // Verify auth: must be owner or leader/admin
        const isOwner = setlist.ownerId === auth.uid
        const isLeaderOrAdmin = auth.isAdmin || auth.role === 'leader'
        if (!isOwner && !isLeaderOrAdmin) {
            return NextResponse.json({ error: 'Must be owner or leader' }, { status: 403 })
        }

        // Load members
        const usersSnap = await db.collection('users')
            .where('role', 'in', ['admin', 'leader', 'member'])
            .get()

        interface MemberData { uid: string; email?: string; displayName?: string }
        const members: MemberData[] = usersSnap.docs
            .map(d => ({ uid: d.id, email: d.data().email, displayName: d.data().displayName }))
            .filter(u => u.email && (!recipientUids || recipientUids.includes(u.uid)))

        // Build base URL from request
        const url = new URL(request.url)
        const baseUrl = `${url.protocol}//${url.host}`

        // Get song list for email
        const songs = (setlist.tracks || [])
            .filter((t: { type?: string }) => !t.type || t.type === 'song')
            .map((t: { title: string; key?: string }) => ({
                title: t.title,
                key: t.key,
            }))

        // Get event date
        const eventDate = setlist.eventDate?.toDate?.()
            || (setlist.date ? new Date(setlist.date) : new Date())

        // Send emails
        let sent = 0
        let failed = 0

        for (const member of members) {
            try {
                const success = await sendSetlistEmail({
                    to: member.email!,
                    recipientName: member.displayName || 'Musician',
                    setlistName: setlist.name || 'Setlist',
                    eventDate,
                    setlistUrl: `${baseUrl}/setlists/${setlistId}`,
                    packetUrl: `${baseUrl}/api/setlist/print/personal?setlistId=${setlistId}`,
                    songs,
                    publisherName: auth.email || 'A band leader',
                })
                if (success) sent++
                else failed++
            } catch {
                failed++
            }
        }

        logger.info(`[EmailPackets] Sent ${sent}/${members.length} for ${setlist.name}`)

        return NextResponse.json({ sent, failed, total: members.length })
    } catch (error) {
        logger.error('[EmailPackets] Error:', error)
        return NextResponse.json({ error: 'Failed to send packet emails' }, { status: 500 })
    }
}
