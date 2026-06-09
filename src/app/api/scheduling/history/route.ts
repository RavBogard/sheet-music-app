import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { coerceOrgId } from "@/lib/org/registry"
import { rowOrg } from "@/lib/org/membership"

/**
 * GET /api/scheduling/history — Get scheduling history and analytics.
 * Query params: ?limit=50&musicianUid=xxx
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        // v11-05-03: scope history + analytics to the caller host org (rowOrg:
        // missing → 'crc'). band_leader route → host org via x-org-id.
        const org = coerceOrgId(ctx.req.headers.get('x-org-id'))
        const url = new URL(ctx.req.url)
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
        const musicianUid = url.searchParams.get('musicianUid')

        // Get history entries
        let query: FirebaseFirestore.Query = db.collection('scheduling_history')
            .orderBy('recordedAt', 'desc')
            .limit(limit)

        if (musicianUid) {
            query = query.where('musicianUid', '==', musicianUid)
        }

        const snap = await query.get()
        const history = snap.docs
            .filter(d => rowOrg(d.data().orgId) === org)
            .map(d => ({ id: d.id, ...d.data() }))

        // Compute basic analytics from recent assignments
        const assignmentsSnap = await db.collection('scheduling_assignments')
            .orderBy('assignedAt', 'desc')
            .limit(500)
            .get()

        const allAssignments = assignmentsSnap.docs
            .filter(d => rowOrg(d.data().orgId) === org)
            .map(d => d.data())

        // Musician play counts
        const musicianCounts = new Map<string, { name: string; confirmed: number; declined: number; pending: number }>()
        for (const a of allAssignments) {
            const key = a.musicianUid
            if (!musicianCounts.has(key)) {
                musicianCounts.set(key, { name: a.musicianName, confirmed: 0, declined: 0, pending: 0 })
            }
            const entry = musicianCounts.get(key)!
            if (a.status === 'confirmed') entry.confirmed++
            else if (a.status === 'declined') entry.declined++
            else if (a.status === 'pending') entry.pending++
        }

        // Instrument frequency
        const instrumentCounts = new Map<string, number>()
        for (const a of allAssignments) {
            if (a.instrument && a.status !== 'cancelled') {
                instrumentCounts.set(a.instrument, (instrumentCounts.get(a.instrument) || 0) + 1)
            }
        }

        // Response rate
        const totalAssigned = allAssignments.filter(a => !a.autoConfirmed).length
        const totalResponded = allAssignments.filter(a => !a.autoConfirmed && (a.status === 'confirmed' || a.status === 'declined')).length
        const responseRate = totalAssigned > 0 ? Math.round((totalResponded / totalAssigned) * 100) : 0

        return NextResponse.json({
            success: true,
            history,
            analytics: {
                musicianStats: Array.from(musicianCounts.entries())
                    .map(([uid, stats]) => ({ uid, ...stats }))
                    .sort((a, b) => b.confirmed - a.confirmed),
                instrumentFrequency: Array.from(instrumentCounts.entries())
                    .map(([instrument, count]) => ({ instrument, count }))
                    .sort((a, b) => b.count - a.count),
                responseRate,
                totalAssignments: allAssignments.length,
            },
        })
    },
    { role: 'band_leader' }
)
