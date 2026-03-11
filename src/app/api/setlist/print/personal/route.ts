import { NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { MusicianProfile, SetlistTrack } from "@/types/models"

export const maxDuration = 120

/**
 * GET /api/setlist/print/personal?setlistId=abc123
 *
 * Generates a personalized PDF packet for the authenticated user,
 * applying their musician profile (transposition, capo, flats).
 */
export const GET = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const setlistId = ctx.req.nextUrl.searchParams.get('setlistId')
        if (!setlistId) {
            return NextResponse.json({ error: 'setlistId parameter required' }, { status: 400 })
        }

        const db = getFirestore()

        // Load setlist
        const setlistDoc = await db.collection('setlists').doc(setlistId).get()
        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }
        const setlist = setlistDoc.data()!

        // Verify access: must be public, owned by user, or user is a band leader
        if (setlist.isPublic !== true && setlist.ownerId !== ctx.auth.uid && !ctx.auth.isBandLeader) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        // Load user profile for musician preferences
        const userDoc = await db.collection('users').doc(ctx.auth.uid).get()
        const profile: MusicianProfile = userDoc.data()?.musicianProfile || {}
        const userName = userDoc.data()?.displayName || userDoc.data()?.email || 'Musician'

        // Build print request with user's transposition applied
        const tracks = (setlist.tracks || []) as SetlistTrack[]
        const printReq: PrintRequest = {
            title: setlist.name || 'Setlist',
            date: setlist.eventDate?.toDate?.()?.toISOString?.() || setlist.date || '',
            musicianName: userName,
            tracks: tracks.map(t => ({
                title: t.title,
                key: t.key || '',
                notes: t.notes || '',
                leadMusician: t.leadMusician || '',
                fileId: t.fileId,
                type: t.type,
                performer: t.performer,
                estimatedMinutes: t.estimatedMinutes,
                description: t.description,
                // Apply musician profile transposition
                transposition: (t.transposition || 0) + (profile.defaultTransposition || 0),
                preferFlats: profile.preferFlats,
                capoFret: profile.preferCapo ? (profile.preferredCapoFret || 0) : undefined,
            })),
        }

        const result = await generatePrintPdf(printReq)
        const filename = `${(setlist.name || 'Setlist').replace(/[^a-z0-9]/gi, '_')}_${userName.replace(/[^a-z0-9]/gi, '_')}.pdf`

        logger.info(`[PersonalPacket] Generated for ${userName}: ${result.stats.appendedTracks} tracks, ${result.stats.transposedTracks} transposed`)

        return new NextResponse(Buffer.from(result.pdf), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    }
)
