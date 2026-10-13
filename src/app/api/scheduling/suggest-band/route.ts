import { getT } from "@/i18n/server"
import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { rankMusicians, REQUIRED_INSTRUMENTS, type MusicianCandidate } from "@/lib/musician-suggestions"
import { coerceOrgId, congregationDocId } from "@/lib/org/registry"
import { rowOrg } from "@/lib/org/membership"
import { scopeRowsToTenant } from "@/lib/org/tenant-query"
import { listTenantMembers } from "@/lib/org/access"

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

        const t = await getT()
        if (!setlistId) {
            return NextResponse.json({ error: t("api-scheduling.setlistIdRequired") }, { status: 400 })
        }

        try {
            // Parallel fetch: users, recent confirmed assignments, congregation config.
            // Multi-tenant phase 1: both reads are narrowed to this tenant in the
            // query for every tenant but crc (whose untagged rows keep the legacy
            // read + in-memory filter below until phase 2 stamps them).
            // Multi-tenant phase 2: the roster is the tenant's members whose
            // MEMBERSHIP role is musician+ (not the global users.role).
            const [members, recentAssignmentsSnap, configSnap] = await Promise.all([
                listTenantMembers(org, { roles: ['musician', 'band_leader', 'admin'] }),
                scopeRowsToTenant(db.collection('scheduling_assignments') as FirebaseFirestore.Query, org)
                    .where('status', '==', 'confirmed')
                    .orderBy('assignedAt', 'desc')
                    .limit(RECENT_WINDOW * 20) // Over-fetch to get per-musician window
                    .get(),
                // v11-05-04: congregation read scoped per-org (crc = bare doc).
                db.collection('config').doc(congregationDocId(org)).get(),
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

            // Tenant members with a users profile, in the legacy users-query
            // (doc-id) order. `data()` mirrors the old snapshot shape.
            const rosterDocs = members
                .filter(m => m.profile !== null)
                .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map(m => ({ id: m.uid, data: () => m.profile as Record<string, any> }))

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
                { error: t("api-scheduling.suggestionsFailed") },
                { status: 500 }
            )
        }
    },
    { role: 'band_leader' }
)
