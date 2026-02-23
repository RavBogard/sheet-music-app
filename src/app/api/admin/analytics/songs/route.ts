import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"
import { parseFirestoreDate } from "@/lib/firestore-utils"

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/analytics/songs
 *
 * Comprehensive song usage analytics for the admin dashboard.
 * Supports date range filtering and returns:
 *   - Song frequency over time (monthly buckets)
 *   - Top songs by usage count
 *   - Neglected songs (not played in 90+ days)
 *   - Repertoire diversity metrics
 *   - Per-setlist song counts over time
 *
 * Query params:
 *   from — ISO date string (default: 12 months ago)
 *   to   — ISO date string (default: today)
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'band_leader')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()
        const { searchParams } = new URL(req.url)

        const now = new Date()
        const defaultFrom = new Date(now)
        defaultFrom.setFullYear(defaultFrom.getFullYear() - 1)

        const fromDate = searchParams.get('from') ? new Date(searchParams.get('from')!) : defaultFrom
        const toDate = searchParams.get('to') ? new Date(searchParams.get('to')!) : now

        // ── 1. Fetch setlists with date range filter at query level (H3 fix) ──
        // Note: Firestore requires eventDate to be a proper field for range queries.
        // We filter by eventDate >= fromDate. For setlists with string dates, we still
        // need client-side filtering as a fallback.
        let setlistsSnap
        try {
            setlistsSnap = await db.collection('setlists')
                .where('eventDate', '>=', fromDate)
                .where('eventDate', '<=', toDate)
                .get()
        } catch {
            // Fallback: if eventDate field types are inconsistent, fetch all
            setlistsSnap = await db.collection('setlists').get()
        }

        const setlists = setlistsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Array<{
            id: string
            name?: string
            eventDate?: { toDate?: () => Date } | string
            tracks?: Array<{ fileId?: string; title?: string; key?: string; type?: string }>
            createdAt?: { toDate?: () => Date } | string
            status?: string
        }>

        // ── 2. Fetch songUsage summaries ──
        const usageSnap = await db.collection('songUsage').get()
        const usageSummaries = new Map<string, {
            fileId: string
            lastUsedDate: Date | null
            totalUses: number
            lastUsedSetlistName?: string
        }>()

        for (const doc of usageSnap.docs) {
            const data = doc.data()
            const lastDate = data.lastUsedDate?.toDate?.() || (data.lastUsedDate ? new Date(data.lastUsedDate) : null)
            usageSummaries.set(doc.id, {
                fileId: doc.id,
                lastUsedDate: lastDate,
                totalUses: data.totalUses || 0,
                lastUsedSetlistName: data.lastUsedSetlistName,
            })
        }

        // ── 3. Aggregate song usage from setlists within date range ──
        const songCounts: Record<string, { name: string; count: number; keys: string[]; setlists: string[] }> = {}
        const monthlyBuckets: Record<string, { month: string; totalSongs: number; uniqueSongs: number; setlistCount: number }> = {}
        // M10 fix: Track unique songs per month using Sets
        const monthlyUniqueSets: Record<string, Set<string>> = {}

        for (const setlist of setlists) {
            const eventDate = parseFirestoreDate(setlist.eventDate)
            if (!eventDate || eventDate < fromDate || eventDate > toDate) continue
            if (!setlist.tracks?.length) continue

            const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`

            if (!monthlyBuckets[monthKey]) {
                monthlyBuckets[monthKey] = {
                    month: monthKey,
                    totalSongs: 0,
                    uniqueSongs: 0,
                    setlistCount: 0,
                }
                monthlyUniqueSets[monthKey] = new Set()
            }
            monthlyBuckets[monthKey].setlistCount++

            for (const track of setlist.tracks) {
                if (track.type && track.type !== 'song') continue
                if (!track.title) continue

                const key = track.fileId || track.title.toLowerCase().trim()
                if (!songCounts[key]) {
                    songCounts[key] = { name: track.title, count: 0, keys: [], setlists: [] }
                }
                songCounts[key].count++
                if (track.key && !songCounts[key].keys.includes(track.key)) {
                    songCounts[key].keys.push(track.key)
                }
                if (!songCounts[key].setlists.includes(setlist.id)) {
                    songCounts[key].setlists.push(setlist.id)
                }

                monthlyBuckets[monthKey].totalSongs++
                monthlyUniqueSets[monthKey].add(key)
            }
        }

        // M10 fix: Set uniqueSongs from the per-month Set sizes
        for (const [monthKey, uniqueSet] of Object.entries(monthlyUniqueSets)) {
            monthlyBuckets[monthKey].uniqueSongs = uniqueSet.size
        }

        // ── 4. Build results ──

        // Top songs (sorted by count desc)
        const allSongs = Object.entries(songCounts)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count)

        const topSongs = allSongs.slice(0, 25)

        // Neglected songs (in usage summaries but not used in range, or not used in 90+ days)
        const ninetyDaysAgo = new Date(now)
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

        const neglectedSongs: Array<{ fileId: string; name: string; lastUsed: string | null; totalUses: number }> = []
        for (const [fileId, summary] of usageSummaries) {
            if (summary.lastUsedDate && summary.lastUsedDate < ninetyDaysAgo) {
                neglectedSongs.push({
                    fileId,
                    name: summary.lastUsedSetlistName || fileId,
                    lastUsed: summary.lastUsedDate.toISOString(),
                    totalUses: summary.totalUses,
                })
            }
        }
        neglectedSongs.sort((a, b) => (a.lastUsed || '').localeCompare(b.lastUsed || ''))

        // Monthly timeline (sorted chronologically)
        const timeline = Object.values(monthlyBuckets).sort((a, b) => a.month.localeCompare(b.month))

        // Repertoire diversity
        const totalUniqueSongs = allSongs.length
        const totalUses = allSongs.reduce((sum, s) => sum + s.count, 0)
        const songsUsedOnce = allSongs.filter(s => s.count === 1).length
        const songsUsed5Plus = allSongs.filter(s => s.count >= 5).length

        // Key distribution
        const keyDistribution: Record<string, number> = {}
        for (const song of allSongs) {
            for (const k of song.keys) {
                keyDistribution[k] = (keyDistribution[k] || 0) + 1
            }
        }

        return NextResponse.json({
            dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
            topSongs,
            neglectedSongs: neglectedSongs.slice(0, 20),
            timeline,
            diversity: {
                totalUniqueSongs,
                totalUses,
                songsUsedOnce,
                songsUsed5Plus,
                averageUsesPerSong: totalUniqueSongs > 0 ? Math.round((totalUses / totalUniqueSongs) * 10) / 10 : 0,
            },
            keyDistribution,
            totalSetlists: setlists.length,
        })
    } catch (error) {
        logger.error("[Analytics/Songs] Error:", error)
        return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 })
    }
}
