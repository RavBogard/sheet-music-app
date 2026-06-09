import { NextRequest, NextResponse } from "next/server"
import { generatePrintPdf, PrintRequest } from "@/lib/print-pipeline"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { SetlistTrack } from "@/types/models"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { rowOrg } from "@/lib/org/membership"

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

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        // Load setlist
        const setlistDoc = await db.collection('setlists').doc(setlistId).get()
        if (!setlistDoc.exists) {
            return NextResponse.json({ error: 'Setlist not found' }, { status: 404 })
        }

        const setlist = setlistDoc.data()!

        // 2026-05-28: publishedAt-as-gate concept killed per Daniel's
        // err-public-not-gated binding invariant (decisions.md
        // 2026-05-28T~15:50Z + ~16:00Z). Every setlist is intentionally
        // public the moment it exists; the publishedAt field remains as
        // vestigial metadata (read for display elsewhere) but no longer
        // gates access. A musician sharing a public-link with a guest
        // before "publishing" should still be able to download it.

        // v60-04-02: hydration-aware read via shared helper. For hydrated
        // setlists, the embedded setlist.tracks[] is stale (engine writes
        // through top-level tracks/{id} only). Cast preserves SetlistTrack[]
        // for the downstream .map() PrintRequest builder.
        const tracks = (await getTracksForSetlist(db, setlistId, setlist)) as SetlistTrack[]
        const printReq: PrintRequest = {
            title: setlist.name || 'Setlist',
            date: setlist.eventDate?.toDate?.()?.toISOString?.() || setlist.date || '',
            // v11-05-04: per-org print footer from the setlist's tenant.
            org: rowOrg(setlist.orgId),
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
