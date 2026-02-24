/**
 * Smart Musician Suggestion Engine
 *
 * Pure ranking function that scores and sorts musicians for setlist assignment.
 * Used by the suggest-band API endpoint. No Firestore calls — all data is pre-fetched.
 */

export interface MusicianCandidate {
    uid: string
    name: string
    email: string
    phone: string | null
    instrumentKey: string | null
    instrumentLabel: string | null
    schedulingTier: 'core' | 'regular' | 'guest'
    confirmedCount: number
    recentWindowSize: number
}

export interface RankingInput {
    candidates: MusicianCandidate[]
    alreadySelectedUids: Set<string>
    blockedUids: Set<string>
    currentInstrumentKeys: string[]
    rabbiProfile: { musicalRole: string; bandSizeGuidance: string; instruments?: string[] } | null
}

export interface SuggestedMusician {
    uid: string
    name: string
    email: string
    phone: string | null
    instrumentKey: string | null
    instrumentLabel: string | null
    schedulingTier: 'core' | 'regular' | 'guest'
    score: number
    reasons: string[]
    isBlocked: boolean
}

const REQUIRED_INSTRUMENTS = new Set([
    'acoustic_guitar', 'electric_bass', 'hand_drums', 'piano', 'voice'
])

const TIER_SCORE: Record<string, number> = { core: 20, regular: 12, guest: 4 }

export function rankMusicians(input: RankingInput): SuggestedMusician[] {
    const { candidates, alreadySelectedUids, blockedUids, currentInstrumentKeys, rabbiProfile } = input
    const currentInstrumentSet = new Set(currentInstrumentKeys)
    const coveredRequired = new Set([...currentInstrumentKeys].filter(k => REQUIRED_INSTRUMENTS.has(k)))
    const uncoveredRequired = new Set([...REQUIRED_INSTRUMENTS].filter(k => !coveredRequired.has(k)))

    const results: SuggestedMusician[] = candidates
        .filter(c => !alreadySelectedUids.has(c.uid))
        .map((c) => {
            let score = 0
            const reasons: string[] = []
            const isBlocked = blockedUids.has(c.uid)

            // Signal 1: Availability (30 pts)
            if (!isBlocked) {
                score += 30
                reasons.push('Available this date')
            } else {
                reasons.push('Blocked — conflicting date')
            }

            // Signal 2: Play frequency (25 pts)
            if (c.recentWindowSize > 0) {
                const freq = c.confirmedCount / c.recentWindowSize
                const freqScore = Math.round(freq * 25)
                score += freqScore
                if (c.confirmedCount > 0) {
                    reasons.push(`Played ${c.confirmedCount} of last ${c.recentWindowSize} services`)
                }
            }

            // Signal 3: Tier (20 pts)
            const tierScore = TIER_SCORE[c.schedulingTier] ?? 12
            score += tierScore

            // Signal 4: Coverage gap (15 pts)
            if (c.instrumentKey && uncoveredRequired.has(c.instrumentKey)) {
                score += 15
                reasons.push(`Fills missing ${c.instrumentLabel ?? c.instrumentKey} slot`)
            } else if (c.instrumentKey) {
                score += 5
            }

            // Signal 5: Rabbi band-size fit (10 pts / -10 penalty)
            if (rabbiProfile) {
                const rabbiInstruments = rabbiProfile.instruments ?? []
                if (
                    (rabbiProfile.musicalRole === 'band_leader' || rabbiProfile.musicalRole === 'strummer') &&
                    c.instrumentKey &&
                    rabbiInstruments.includes(c.instrumentKey) &&
                    currentInstrumentSet.has(c.instrumentKey)
                ) {
                    score -= 10
                    reasons.push(`Rabbi covers this instrument`)
                } else {
                    score += 10
                }
            }

            return {
                uid: c.uid,
                name: c.name,
                email: c.email,
                phone: c.phone,
                instrumentKey: c.instrumentKey,
                instrumentLabel: c.instrumentLabel,
                schedulingTier: c.schedulingTier,
                score: Math.max(0, score),
                reasons,
                isBlocked,
            }
        })

    // Sort: non-blocked by score desc, then blocked by score desc
    results.sort((a, b) => {
        if (a.isBlocked !== b.isBlocked) return a.isBlocked ? 1 : -1
        return b.score - a.score
    })

    return results
}
