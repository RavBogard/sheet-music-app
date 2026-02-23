import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"
import { parseFirestoreDate, sanitizeCsvCell } from "@/lib/firestore-utils"

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/analytics/export
 *
 * Exports song usage data as CSV for board/committee reporting.
 * Includes: Song Name, Total Uses, Last Used Date, Keys Used, Setlist Count
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()

        // Fetch setlists and build song usage
        const setlistsSnap = await db.collection('setlists').get()
        const songData: Record<string, {
            name: string
            totalUses: number
            keys: Set<string>
            setlistIds: Set<string>
            lastEventDate: Date | null
        }> = {}

        for (const doc of setlistsSnap.docs) {
            const data = doc.data()
            const tracks = data.tracks as Array<{ fileId?: string; title?: string; key?: string; type?: string }> | undefined
            if (!tracks?.length) continue

            const eventDate = parseFirestoreDate(data.eventDate)

            for (const track of tracks) {
                if (track.type && track.type !== 'song') continue
                if (!track.title) continue

                const key = track.fileId || track.title.toLowerCase().trim()
                if (!songData[key]) {
                    songData[key] = {
                        name: track.title,
                        totalUses: 0,
                        keys: new Set(),
                        setlistIds: new Set(),
                        lastEventDate: null,
                    }
                }
                songData[key].totalUses++
                if (track.key) songData[key].keys.add(track.key)
                songData[key].setlistIds.add(doc.id)
                if (eventDate && (!songData[key].lastEventDate || eventDate > songData[key].lastEventDate)) {
                    songData[key].lastEventDate = eventDate
                }
            }
        }

        // Build CSV with formula injection protection (M4 fix)
        const rows = Object.values(songData)
            .sort((a, b) => b.totalUses - a.totalUses)

        const csvLines = [
            'Song Name,Total Uses,Unique Setlists,Keys Used,Last Event Date',
            ...rows.map(r => {
                const name = sanitizeCsvCell(r.name)
                const keys = sanitizeCsvCell(Array.from(r.keys).join('; '))
                const lastDate = r.lastEventDate ? r.lastEventDate.toISOString().split('T')[0] : 'N/A'
                return `${name},${r.totalUses},${r.setlistIds.size},${keys},${lastDate}`
            })
        ]

        const csv = csvLines.join('\n')

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="song-usage-report-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        })
    } catch (error) {
        logger.error("[Analytics/Export] Error:", error)
        return NextResponse.json({ error: "Failed to export data" }, { status: 500 })
    }
}
