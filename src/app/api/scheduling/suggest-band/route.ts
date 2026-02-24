import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { rankMusicians, type MusicianCandidate } from "@/lib/musician-suggestions"

const RECENT_WINDOW = 10

/**
 * GET /api/scheduling/suggest-band?setlistId=xxx&date=2026-03-15&rabbiName=Rabbi+Daniel&selectedUids=uid1,uid2
 *
 * Smart band suggestion endpoint. Ranks all available musicians by:
 * 1. Availability (no blockout conflicts)
 * 2. Play frequency (recent confirmed assignments)
 * 3. Scheduling tier (core > regular > guest)
 * 4. Instrument coverage (fills missing slots)
 * 5. Rabbi band-size fit (accounts for rabbi's musical role)
 *
 * Band leaders only.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        const url = new URL(ctx.req.url)
        const setlistId = url.searchParams.get('setlistId')
        const date = url.searchParams.get('date') // 'YYYY-MM-DD'
        const rabbiName = url.searchParams.get('rabbiName')
        const selectedUids = (url.searchParams.get('selectedUids') || '')
            .split(',').filter(Boolean)

        if (!setlistId) {
            return NextResponse.json({ error: 'setlistId is required' }, { status: 400 })
        }

        try {
            // Parallel fetch: users, recent confirmed assignments, blockouts, congregation config
            const [usersSnap, recentAssignmentsSnap, blockoutsSnap, configSnap] = await Promise.all([
                db.collection('users')
                    .where('role', 'in', ['musician', 'band_leader', 'admin'])
                    .get(),
                db.collection('scheduling_assignments')
                    .where('status', '==', 'confirmed')
                    .orderBy('assignedAt', 'desc')
                    .limit(RECENT_WINDOW * 20) // Over-fetch to get per-musician window
                    .get(),
                date
                    ? db.collection('musician_availability')
                        .where('startDate', '<=', date)
                        .get()
                    : Promise.resolve(null),
                db.collection('config').doc('congregation').get(),
            ])

            // Resolve rabbi profile from congregation config
            const congData = configSnap.data()
            const rabbiProfiles = congData?.scheduling?.rabbiProfiles ?? []
            const rabbiProfile = rabbiName
                ? (rabbiProfiles.find((p: any) =>
                    rabbiName.toLowerCase().includes(p.name.toLowerCase()) ||
                    p.name.toLowerCase().includes(rabbiName.toLowerCase())
                ) ?? null)
                : null

            // Build blocked UIDs set
            const blockedUids = new Set<string>()
            if (date && blockoutsSnap) {
                blockoutsSnap.docs.forEach(d => {
                    const b = d.data()
                    if (b.endDate >= date) blockedUids.add(b.musicianUid)
                })
            }

            // Build play frequency map
            const playCountMap = new Map<string, number>()
            recentAssignmentsSnap.docs.forEach(d => {
                const uid = d.data().musicianUid
                playCountMap.set(uid, Math.min((playCountMap.get(uid) ?? 0) + 1, RECENT_WINDOW))
            })

            const totalRecentServices = new Set(
                recentAssignmentsSnap.docs.map(d => d.data().setlistId)
            ).size
            const windowSize = Math.min(totalRecentServices, RECENT_WINDOW)

            // Build candidates
            const candidates: MusicianCandidate[] = usersSnap.docs.map(d => {
                const data = d.data()
                const instrumentKey = data.musicianProfile?.instrument ?? null
                return {
                    uid: d.id,
                    name: data.displayName || data.email?.split('@')[0] || 'Unknown',
                    email: data.email || '',
                    phone: data.musicianProfile?.phone ?? null,
                    instrumentKey,
                    instrumentLabel: instrumentKey
                        ? (INSTRUMENT_PRESETS[instrumentKey]?.label ?? instrumentKey)
                        : null,
                    schedulingTier: data.musicianProfile?.schedulingTier ?? 'regular',
                    confirmedCount: playCountMap.get(d.id) ?? 0,
                    recentWindowSize: windowSize,
                }
            })

            // Get currently selected instruments for coverage gap calculation
            const selectedInstruments = usersSnap.docs
                .filter(d => selectedUids.includes(d.id))
                .map(d => d.data().musicianProfile?.instrument)
                .filter(Boolean) as string[]

            const ranked = rankMusicians({
                candidates,
                alreadySelectedUids: new Set(selectedUids),
                blockedUids,
                currentInstrumentKeys: selectedInstruments,
                rabbiProfile,
            })

            // Identify coverage gaps
            const REQUIRED = ['acoustic_guitar', 'electric_bass', 'hand_drums', 'piano', 'voice']
            const coverageGap = REQUIRED.filter(k => !selectedInstruments.includes(k))

            return NextResponse.json({
                success: true,
                rabbiGuidance: rabbiProfile?.bandSizeGuidance ?? null,
                coverageGap,
                suggestions: ranked.slice(0, 12),
            })
        } catch (err) {
            logger.error('[suggest-band] Failed:', err)
            return NextResponse.json(
                { error: 'Failed to generate suggestions' },
                { status: 500 }
            )
        }
    },
    { role: 'band_leader' }
)
