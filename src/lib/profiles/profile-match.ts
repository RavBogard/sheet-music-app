import type { OrgId } from "@/lib/org/types"
import { profileKeyFor, rabbiRequired, slotKeyFor } from "./keys"
import type { SlotTier, StandingChoice } from "./tiers"

/**
 * Setlist memory, release 2 — one learning system. A proposal that binds the
 * chart a profile already holds for that slot (its standard, or its usual) is
 * high confidence: the profile replaces the old per-title bond-correction
 * hints. Nothing here picks a chart; it only recognises one the author chose.
 */

/** True when the slot's tier is standard or usual and its chart is `partGroup`. */
export function tierHoldsPartGroup(
    tier: SlotTier,
    standing: Pick<StandingChoice, "fileId" | "partGroup"> | null | undefined,
    partGroup: string,
    partGroupOf: (fileId: string) => string | null,
): boolean {
    if (tier.tier === "standard" && standing) {
        const group = standing.partGroup ?? partGroupOf(standing.fileId) ?? standing.fileId
        return group === partGroup
    }
    if (tier.tier === "usual" && tier.fileId) {
        return (partGroupOf(tier.fileId) ?? tier.fileId) === partGroup
    }
    return false
}

export interface ProfileMatchCandidate {
    /** Position in the caller's list. */
    position: number
    /** The chart being bound (a library fileId). */
    fileId: string
    /** Its partGroup, else the fileId. */
    partGroup: string
    /** The moment of the row it lands on, when the row names one. */
    momentId?: string | null
    title: string
}

/**
 * Positions of the candidates whose chart is the profile's standard or usual
 * chart for their slot. The setlist's class comes from its stored fields
 * only: no stored serviceType, or a rabbi-split service with no stored
 * rabbiSlot, matches nothing.
 */
export async function profileMatches(
    org: OrgId,
    setlist: { serviceType?: unknown; rabbiSlot?: unknown },
    candidates: ProfileMatchCandidate[],
): Promise<Set<number>> {
    const out = new Set<number>()
    const serviceType = typeof setlist.serviceType === "string" && setlist.serviceType ? setlist.serviceType : null
    if (!serviceType || candidates.length === 0) return out
    const storedRabbi = typeof setlist.rabbiSlot === "string" && setlist.rabbiSlot ? setlist.rabbiSlot : null
    if (rabbiRequired(serviceType) && !storedRabbi) return out
    const rabbiSlot = rabbiRequired(serviceType) ? storedRabbi : null
    const profileKey = profileKeyFor(serviceType, rabbiSlot)

    const { loadSlotUses } = await import("./slot-uses")
    const { readStanding, standingMapKey } = await import("./standing")
    const { computeSlotTier } = await import("./tiers")
    const { index } = await loadSlotUses(org, { serviceType, rabbiSlot })
    const groupOf = new Map(candidates.map((c) => [c.fileId, c.partGroup]))
    const partGroupOf = (fid: string) => groupOf.get(fid) ?? index.partGroupOf(fid)
    const slotKeys = candidates.map((c) =>
        slotKeyFor({ momentId: c.momentId ?? null, title: c.title, fileId: c.fileId }, partGroupOf),
    )
    const standing = await readStanding(org, [profileKey, serviceType], slotKeys)
    candidates.forEach((c, i) => {
        const slotKey = slotKeys[i]
        const choice =
            standing.get(standingMapKey(profileKey, slotKey)) ??
            (slotKey.startsWith("song:") ? standing.get(standingMapKey(serviceType, slotKey)) : undefined) ??
            null
        const tier = computeSlotTier({
            standing: choice,
            profileUses: index.profileUses(slotKey),
            otherUses: index.otherUses(slotKey),
        })
        if (tierHoldsPartGroup(tier, choice, c.partGroup, partGroupOf)) out.add(c.position)
    })
    return out
}
