import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFirestore } from "@/lib/firebase-admin"
import { sendSetlistEmail } from "@/lib/email"
import { rowOrg } from "@/lib/org/membership"
import { requireFeature } from "@/lib/org/features"
import { listTenantMembers } from "@/lib/org/access"
import { logger } from "@/lib/logger"
import { z } from "zod"
import { getTracksForSetlist } from "@/lib/server-tracks"

export const maxDuration = 120

const schema = z.object({
    setlistId: z.string().min(1),
    recipientUids: z.array(z.string()).optional(),
})

/**
 * POST /api/setlist/email-packets
 *
 * Sends each active band member an email with a link to download
 * their personalized packet. Links hit /api/setlist/print/personal
 * which generates on demand with the user's transposition.
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { setlistId, recipientUids } = ctx.body!

        const db = getFirestore()

        // Load setlist
        const setlistDoc = await db.collection('setlists').doc(setlistId).get()
        if (!setlistDoc.exists) {
            const t = await getT()
            return NextResponse.json({ error: t("api-setlist.setlistNotFound") }, { status: 404 })
        }
        const setlist = setlistDoc.data()!
        // v11.4-02 (D8 item 4): brand the packet email by the setlist's org.
        const org = rowOrg(setlist.orgId)

        // Verify auth: must be owner or leader/admin
        const isOwner = setlist.ownerId === ctx.auth.uid
        const isBandLeaderOrAdmin = ctx.auth.isAdmin || ctx.auth.isBandLeader
        if (!isOwner && !isBandLeaderOrAdmin) {
            const t = await getT()
            return NextResponse.json({ error: t("api-setlist.ownerOrLeaderRequired") }, { status: 403 })
        }

        // Multi-tenant phase 6: emailing the band is notifyBand.
        const off = await requireFeature(org, 'notifyBand')
        if (off) return off

        // Load band members (musicians and above — not plain community members).
        // Multi-tenant phase 2: the setlist tenant's members by MEMBERSHIP role
        // (not the global users.role), in the legacy doc-id order.
        const roster = (await listTenantMembers(org, { roles: ['admin', 'band_leader', 'musician'] }))
            .filter(m => m.profile !== null)
            .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))

        interface MemberData { uid: string; email?: string; displayName?: string }
        const members: MemberData[] = roster
            .map(m => ({
                uid: m.uid,
                email: m.profile!.email as string | undefined,
                displayName: m.profile!.displayName as string | undefined,
            }))
            .filter(u => u.email && (!recipientUids || recipientUids.includes(u.uid)))

        // Build base URL from request
        const url = new URL(ctx.req.url)
        const baseUrl = `${url.protocol}//${url.host}`

        // v60-04-03: hydration-aware read via shared helper. Embedded
        // setlist.tracks[] is stale post-hydration. The strict typing on
        // `tracks` surfaces a latent type mismatch — sendSetlistEmail.songs
        // is typed `string[]` (lib/email.ts:36), but the prior chain passed
        // `{title, key}[]` via any-passthrough. Mirror the resend-email
        // route (line 119) and pass just titles.
        const tracks = (await getTracksForSetlist(db, setlistId, setlist)) as Array<{
            title: string; type?: string
        }>
        const songs = tracks
            .filter(t => !t.type || t.type === 'song')
            .map(t => t.title)

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
                    publisherName: ctx.auth.email || 'A band leader',
                    org,
                })
                if (success) sent++
                else failed++
            } catch {
                failed++
            }
        }

        logger.info(`[EmailPackets] Sent ${sent}/${members.length} for ${setlist.name}`)

        return NextResponse.json({ sent, failed, total: members.length })
    },
    { schema }
)
