import { getT } from "@/i18n/server"
import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { coerceOrgId } from "@/lib/org/registry"
import { listTenantMembers } from "@/lib/org/access"

/**
 * GET /api/scheduling/suggest?setlistId=xxx&instrument=Guitar&date=2026-03-15
 *
 * Suggests available replacement musicians for a declined/empty slot.
 * Filters by instrument match and existing assignments.
 * Band leaders only.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const url = new URL(ctx.req.url)
        const setlistId = url.searchParams.get('setlistId')
        const instrument = url.searchParams.get('instrument')

        if (!setlistId) {
            const t = await getT()
            return NextResponse.json(
                { error: t("api-scheduling.setlistIdParamRequired") },
                { status: 400 }
            )
        }

        // 1. Get all musicians — multi-tenant phase 2: the host tenant's
        // members whose MEMBERSHIP role is musician+ (not the global users.role).
        // Sorted by uid to keep the legacy users-query (doc-id) order.
        const org = coerceOrgId(ctx.req.headers.get("x-org-id"))
        const roster = (await listTenantMembers(org, { roles: ['musician', 'band_leader', 'admin'] }))
            .filter(m => m.profile !== null)
            .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))

        const musicians = roster.map(m => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = m.profile as Record<string, any>
            return {
                uid: m.uid,
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

        // 3. Filter: available musicians not already assigned
        type MusicianSuggestion = typeof musicians[number] & { instrumentMatch?: boolean }
        let suggestions: MusicianSuggestion[] = musicians
            .filter(m => !assignedUids.has(m.uid))

        // 4. If instrument filter provided, try to match
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
                ...instrumentMatches.map(m => ({ ...m, instrumentMatch: true as const })),
                ...nonMatches.map(m => ({ ...m, instrumentMatch: false as const })),
            ]
        }

        // 5. Sort by scheduling tier (core > regular > guest)
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
                instrumentMatch: m.instrumentMatch ?? null,
            })),
        })
    },
    { role: 'band_leader' }
)
