import { classifyService } from "@/lib/history/classify"
import type { OrgId } from "@/lib/org/types"
import { memoryServiceType, profileKeyFor, rabbiRequired, slotKeyFor } from "./keys"
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

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/**
 * Positions of the candidates whose chart is the profile's standard or usual
 * chart for their slot. The setlist's class is read with classifyService, the
 * same classification history, standing choices and profiles use: no service
 * type, or a rabbi-split service with no rabbi, matches nothing.
 */
export async function profileMatches(
    org: OrgId,
    setlist: Record<string, unknown>,
    candidates: ProfileMatchCandidate[],
): Promise<Set<number>> {
    const out = new Set<number>()
    if (candidates.length === 0) return out
    const cls = classifyService({
        name: typeof setlist.name === "string" ? setlist.name : "",
        templateType: str(setlist.templateType),
        rabbi: str(setlist.rabbi),
        serviceType: str(setlist.serviceType),
        rabbiSlot: str(setlist.rabbiSlot),
        special: typeof setlist.special === "boolean" ? setlist.special : null,
    })
    // The same scope `set_standing_choice` remembers under, so a BrosLaz gig's
    // "keep it" is recognised on the next gig.
    const serviceType = memoryServiceType(org, cls.serviceType, str(setlist.serviceType))
    if (!serviceType) return out
    if (rabbiRequired(serviceType) && !cls.rabbiSlot) return out
    const rabbiSlot = rabbiRequired(serviceType) ? cls.rabbiSlot : null
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
    const standing = await readStanding(org, [profileKey], slotKeys)
    candidates.forEach((c, i) => {
        const slotKey = slotKeys[i]
        const choice = standing.get(standingMapKey(profileKey, slotKey)) ?? null
        const tier = computeSlotTier({
            standing: choice,
            profileUses: index.profileUses(slotKey),
            otherUses: index.otherUses(slotKey),
        })
        if (tierHoldsPartGroup(tier, choice, c.partGroup, partGroupOf)) out.add(c.position)
    })
    return out
}
