import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { rankMusicians, REQUIRED_INSTRUMENTS, type MusicianCandidate } from "@/lib/musician-suggestions"
import { coerceOrgId } from "@/lib/org/registry"
import { rowOrgIds, rowOrg } from "@/lib/org/membership"

const RECENT_WINDOW = 10

/**
 * GET /api/scheduling/suggest-band?setlistId=xxx&rabbiName=Rabbi+Daniel&selectedUids=uid1,uid2
 *
 * Smart band suggestion endpoint. Ranks all available musicians by:
 * 1. Play frequency (recent confirmed assignments)
 * 2. Scheduling tier (core > regular > guest)
 * 3. Instrument coverage (fills missing slots)
 * 4. Rabbi band-size fit (accounts for rabbi's musical role)
 *
 * Band leaders only.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const db = getFirestore()
        // v11-05-02: resolve the host org (proxy sets x-org-id on every route);
        // coerceOrgId validates an already-resolved org id (NOT a host) — see the
        // v11-03 coerceOrgId hotfix lesson. Roster is scoped to this org.
        const org = coerceOrgId(ctx.req.headers.get("x-org-id"))
        const url = new URL(ctx.req.url)
        const setlistId = url.searchParams.get('setlistId')
        const rabbiName = url.searchParams.get('rabbiName')
        const selectedUids = (url.searchParams.get('selectedUids') || '')
            .split(',').filter(Boolean)

        if (!setlistId) {
            return NextResponse.json({ error: 'setlistId is required' }, { status: 400 })
        }

        try {
            // Parallel fetch: users, recent confirmed assignments, congregation config
            const [usersSnap, recentAssignmentsSnap, configSnap] = await Promise.all([
                db.collection('users')
                    .where('role', 'in', ['musician', 'band_leader', 'admin'])
                    .get(),
                db.collection('scheduling_assignments')
                    .where('status', '==', 'confirmed')
                    .orderBy('assignedAt', 'desc')
                    .limit(RECENT_WINDOW * 20) // Over-fetch to get per-musician window
                    .get(),
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

            // v11-05-03: scope the play-count read to the caller org (rowOrg:
            // missing → 'crc') so a BL window never counts CRC services.
            const recentOrgDocs = recentAssignmentsSnap.docs.filter(
                d => rowOrg(d.data().orgId) === org
            )

            // Build play frequency map
            const playCountMap = new Map<string, number>()
            recentOrgDocs.forEach(d => {
                const uid = d.data().musicianUid
                playCountMap.set(uid, Math.min((playCountMap.get(uid) ?? 0) + 1, RECENT_WINDOW))
            })

            const totalRecentServices = new Set(
                recentOrgDocs.map(d => d.data().setlistId)
            ).size
            const windowSize = Math.min(totalRecentServices, RECENT_WINDOW)

            // v11-05-02: org membership filtered in-memory (rowOrgIds: missing → ['crc']).
            const rosterDocs = usersSnap.docs.filter(d => rowOrgIds(d.data().orgIds).includes(org))

            // Build candidates
            const candidates: MusicianCandidate[] = rosterDocs.map(d => {
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
            const selectedInstruments = rosterDocs
                .filter(d => selectedUids.includes(d.id))
                .map(d => d.data().musicianProfile?.instrument)
                .filter(Boolean) as string[]

            const ranked = rankMusicians({
                candidates,
                alreadySelectedUids: new Set(selectedUids),
                currentInstrumentKeys: selectedInstruments,
                rabbiProfile,
            })

            // Identify coverage gaps (REQUIRED_INSTRUMENTS is the single source of truth)
            const coverageGap = [...REQUIRED_INSTRUMENTS].filter(k => !selectedInstruments.includes(k))

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
