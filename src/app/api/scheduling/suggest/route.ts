import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"

/**
 * GET /api/scheduling/suggest?setlistId=xxx&instrument=Guitar&date=2026-03-15
 *
 * Suggests available replacement musicians for a declined/empty slot.
 * Filters by instrument match and availability (no blockouts, not already assigned).
 * Band leaders only.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const url = new URL(ctx.req.url)
        const setlistId = url.searchParams.get('setlistId')
        const instrument = url.searchParams.get('instrument')
        const date = url.searchParams.get('date')

        if (!setlistId) {
            return NextResponse.json(
                { error: 'setlistId parameter is required' },
                { status: 400 }
            )
        }

        // 1. Get all musicians
        const usersSnap = await db.collection('users')
            .where('role', 'in', ['musician', 'band_leader', 'admin'])
            .get()

        const musicians = usersSnap.docs.map(d => {
            const data = d.data()
            return {
                uid: d.id,
                name: data.displayName || data.email?.split('@')[0] || 'Unknown',
                email: data.email || '',
                instrumentKey: data.musicianProfile?.instrument || null,
                instrumentLabel: null as string | null, // Will resolve below
                schedulingTier: data.musicianProfile?.schedulingTier || 'regular',
                phone: data.musicianProfile?.phone || null,
            }
        })

        // 2. Get existing assignments for this setlist (to exclude already assigned musicians)
        const assignmentsSnap = await db.collection('scheduling_assignments')
            .where('setlistId', '==', setlistId)
            .where('status', 'in', ['pending', 'confirmed'])
            .get()

        const assignedUids = new Set(assignmentsSnap.docs.map(d => d.data().musicianUid))

        // 3. Get blockouts for the date (if provided)
        let blockedUids = new Set<string>()
        if (date) {
            const blockoutsSnap = await db.collection('musician_availability')
                .where('startDate', '<=', date)
                .get()

            blockedUids = new Set(
                blockoutsSnap.docs
                    .filter(d => d.data().endDate >= date)
                    .map(d => d.data().musicianUid)
            )
        }

        // 4. Filter: available musicians not already assigned and not blocked
        let suggestions = musicians
            .filter(m => !assignedUids.has(m.uid))
            .filter(m => !blockedUids.has(m.uid))

        // 5. If instrument filter provided, try to match
        // Instrument in the request could be the display label (e.g., "Acoustic Guitar")
        // Musician profile stores the key (e.g., "acoustic_guitar")
        if (instrument) {
            const instrumentLower = instrument.toLowerCase()

            // Try matching by key or label
            const instrumentMatches = suggestions.filter(m => {
                if (!m.instrumentKey) return false
                // Match by key (e.g., "acoustic_guitar")
                if (m.instrumentKey.toLowerCase() === instrumentLower) return true
                // Match by label containing the search term
                const keyWords = m.instrumentKey.replace(/_/g, ' ').toLowerCase()
                return keyWords.includes(instrumentLower) || instrumentLower.includes(keyWords)
            })

            // Sort: exact instrument matches first, then others
            const nonMatches = suggestions.filter(m =>
                !instrumentMatches.some(im => im.uid === m.uid)
            )

            suggestions = [
                ...instrumentMatches.map(m => ({ ...m, instrumentMatch: true })),
                ...nonMatches.map(m => ({ ...m, instrumentMatch: false })),
            ] as any
        }

        // 6. Sort by scheduling tier (core > regular > guest)
        const tierOrder = { core: 0, regular: 1, guest: 2 }
        suggestions.sort((a, b) =>
            (tierOrder[a.schedulingTier as keyof typeof tierOrder] || 1) -
            (tierOrder[b.schedulingTier as keyof typeof tierOrder] || 1)
        )

        return NextResponse.json({
            success: true,
            suggestions: suggestions.slice(0, 10).map(m => ({
                uid: m.uid,
                name: m.name,
                email: m.email,
                instrument: m.instrumentKey,
                schedulingTier: m.schedulingTier,
                phone: m.phone,
                instrumentMatch: (m as any).instrumentMatch ?? null,
            })),
        })
    },
    { role: 'band_leader' }
)
