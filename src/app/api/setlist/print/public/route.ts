import { NextRequest, NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { SetlistTrack } from "@/types/models"

export const maxDuration = 120

/**
 * GET /api/setlist/print/public?setlistId=abc123
 *
 * Generates a generic PDF packet for a PUBLISHED setlist.
 * No authentication required — if the setlist is public, anyone with the link can download.
 * No personal transposition is applied (concert pitch only).
 *
 * Used in email notification links so musicians can download without signing in.
 */
export async function GET(request: NextRequest) {
    try {
        const limited = await checkRateLimit(request, 'api')
        if (limited) return limited

        const setlistId = request.nextUrl.searchParams.get('setlistId')
        if (!setlistId) {
            return NextResponse.json({ error: 'setlistId parameter required' }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        // Load setlist
        const setlistDoc = await db.collection('setlists').doc(setlistId).get()
        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }

        const setlist = setlistDoc.data()!

        // Security: only published setlists can be downloaded without auth
        if (!setlist.publishedAt) {
            return NextResponse.json({ error: 'Setlist is not published' }, { status: 403 })
        }

        // Build print request — generic (no personal transposition)
        const tracks = (setlist.tracks || []) as SetlistTrack[]
        const printReq: PrintRequest = {
            title: setlist.name || 'Setlist',
            date: setlist.eventDate?.toDate?.()?.toISOString?.() || setlist.date || '',
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
                transposition: t.transposition || 0,
            })),
        }

        const result = await generatePrintPdf(printReq)
        const filename = `${(setlist.name || 'Setlist').replace(/[^a-z0-9]/gi, '_')}.pdf`

        logger.info(`[PublicPacket] Generated for "${setlist.name}": ${result.stats.appendedTracks} tracks`)

        return new NextResponse(Buffer.from(result.pdf), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        })
    } catch (error) {
        logger.error('[PublicPacket] Error:', error)
        return NextResponse.json({ error: 'Failed to generate packet' }, { status: 500 })
    }
}
