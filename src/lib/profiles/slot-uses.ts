import { setlistPart } from "@/lib/history/classify"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import type { OrgId } from "@/lib/org/types"
import { isSongType } from "@/lib/setlist-track-count"
import { serviceLabelFor, slotKeyFor } from "./keys"
import type { SlotUse } from "./tiers"

/**
 * Setlist memory, release 2 — past uses of each slot, for tiers.
 *
 * `buildSlotUses` is pure: from loaded setlists and library rows it gives,
 * for any slot key, the uses in the profile (same service type, and the same
 * rabbi slot when the profile has one) and in other service types. Test
 * setlists, undated setlists and per-instrument copies never count. Every
 * list is newest first and holds at most one use per setlist. Special weeks
 * are included and flagged; tiers decide what they may count toward.
 *
 * `loadSlotUses` is the Firestore wrapper used by get_service_profile, the
 * draft and the propose check.
 */

export interface ProfileFilter {
    serviceType: string
    /** null: any rabbi (a profile not split by rabbi). */
    rabbiSlot: string | null
}

export interface SlotUseIndex {
    /** Eligible setlists of the profile, newest first. */
    profileSetlists: HistorySetlist[]
    profileUses(slotKey: string): SlotUse[]
    otherUses(slotKey: string): SlotUse[]
    partGroupOf(fileId: string): string | null
}

export function partGroupLookup(library: Map<string, LibraryLite>): (fileId: string) => string | null {
    return (fileId) => library.get(fileId)?.partGroup ?? null
}

/** Dated, non-test, whole-band setlists, newest first. */
export function eligibleSetlists(setlists: HistorySetlist[]): HistorySetlist[] {
    return setlists
        .filter((s) => !s.isTest && !!s.eventDate && !setlistPart(s.name))
        .sort((a, b) => (a.eventDate! < b.eventDate! ? 1 : a.eventDate! > b.eventDate! ? -1 : 0))
}

export function matchesProfile(s: HistorySetlist, f: ProfileFilter): boolean {
    if (s.serviceType !== f.serviceType) return false
    return f.rabbiSlot === null || s.rabbiSlot === f.rabbiSlot
}

export function buildSlotUses(
    setlists: HistorySetlist[],
    library: Map<string, LibraryLite>,
    f: ProfileFilter,
): SlotUseIndex {
    const partGroupOf = partGroupLookup(library)
    const profile = new Map<string, SlotUse[]>()
    const other = new Map<string, SlotUse[]>()
    const profileSetlists: HistorySetlist[] = []

    for (const s of eligibleSetlists(setlists)) {
        const inProfile = matchesProfile(s, f)
        const isOther = !inProfile && s.serviceType !== null && s.serviceType !== f.serviceType
        if (inProfile) profileSetlists.push(s)
        if (!inProfile && !isOther) continue
        const target = inProfile ? profile : other
        const seen = new Set<string>()
        for (const t of s.tracks) {
            if (!isSongType(t.type) || !t.fileId) continue
            const slotKey = slotKeyFor(t, partGroupOf)
            if (seen.has(slotKey)) continue
            seen.add(slotKey)
            const lib = library.get(t.fileId)
            const use: SlotUse = {
                eventDate: s.eventDate!,
                fileId: t.fileId,
                partGroup: lib?.partGroup ?? t.fileId,
                chartName: lib?.name ?? t.fileName ?? t.title,
                key: t.key ?? null,
                special: s.special,
                serviceLabel: serviceLabelFor(s.serviceType) ?? "",
            }
            const list = target.get(slotKey)
            if (list) list.push(use)
            else target.set(slotKey, [use])
        }
    }

    return {
        profileSetlists,
        profileUses: (slotKey) => profile.get(slotKey) ?? [],
        otherUses: (slotKey) => other.get(slotKey) ?? [],
        partGroupOf,
    }
}

/** Load the org's history and library, then index slot uses for one profile. */
export async function loadSlotUses(
    org: OrgId,
    f: ProfileFilter,
): Promise<{
    index: SlotUseIndex
    setlists: HistorySetlist[]
    library: Map<string, LibraryLite>
    truncated: boolean
}> {
    const { loadHistorySetlists, loadLibraryLite } = await import("@/lib/history/load")
    const { setlists, truncated } = await loadHistorySetlists(org, {})
    const fileIds = setlists.flatMap((s) => s.tracks.map((t) => t.fileId).filter((x): x is string => !!x))
    const library = await loadLibraryLite(org, fileIds)
    return { index: buildSlotUses(setlists, library, f), setlists, library, truncated }
}
