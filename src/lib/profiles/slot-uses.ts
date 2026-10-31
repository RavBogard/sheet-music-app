import { setlistPart } from "@/lib/history/classify"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import type { OrgId } from "@/lib/org/types"
import { dayInZone } from "@/lib/org/locale"
import { isSongType } from "@/lib/setlist-track-count"
import { serviceLabelFor, slotKeyFor } from "./keys"
import { USUAL_WINDOW, type SlotUse } from "./tiers"

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

/**
 * One setlist per (eventDate day, serviceType, rabbiSlot): duplicates of one service must not
 * count twice toward "usual". The newest version (`updatedAt`) wins; with no timestamps the
 * first in the input order does. A setlist with no service type is never collapsed.
 */
export function dedupeServices(setlists: HistorySetlist[]): HistorySetlist[] {
    const winner = new Map<string, HistorySetlist>()
    const stamp = (s: HistorySetlist) => Date.parse(s.updatedAt ?? "") || 0
    for (const s of setlists) {
        if (s.serviceType === null) continue
        const key = `${s.eventDate!.slice(0, 10)}|${s.serviceType}|${s.rabbiSlot ?? ""}`
        const cur = winner.get(key)
        if (!cur || stamp(s) > stamp(cur)) winner.set(key, s)
    }
    return setlists.filter((s) => s.serviceType === null || winner.get(`${s.eventDate!.slice(0, 10)}|${s.serviceType}|${s.rabbiSlot ?? ""}`) === s)
}

/** Setlists already on `date` (YYYY-MM-DD in `timeZone`) of this service type. */
export function existingOnDate(
    setlists: HistorySetlist[],
    date: string,
    serviceType: string,
    timeZone: string,
): { setlistId: string; name: string }[] {
    return setlists
        .filter((s) => !s.isTest && !!s.eventDate && !setlistPart(s.name) && s.serviceType === serviceType)
        .filter((s) => dayInZone(Date.parse(s.eventDate!), timeZone) === date)
        .map((s) => ({ setlistId: s.id, name: s.name }))
}

/** True for a chart that is orphaned or archived: it is never filled into a draft. */
export function isDeadChart(lib: LibraryLite | undefined): boolean {
    return !!lib && (lib.status === "orphaned" || lib.status === "archived")
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

    const eligible = dedupeServices(eligibleSetlists(setlists))
    // The profile's last USUAL_WINDOW regular services: one entry per day.
    const recentDays = new Set<string>()
    for (const s of eligible) {
        if (!matchesProfile(s, f) || s.special) continue
        if (recentDays.size >= USUAL_WINDOW) break
        recentDays.add(s.eventDate!.slice(0, 10))
    }

    for (const s of eligible) {
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
            let lib = library.get(t.fileId)
            let fileId = t.fileId
            if (isDeadChart(lib)) {
                // Recall the canonical chart when there is one; otherwise the dead chart is never filled.
                const canon = lib!.canonicalFileId ? library.get(lib!.canonicalFileId) : undefined
                if (!canon || isDeadChart(canon)) continue
                lib = canon
                fileId = canon.fileId
            }
            const use: SlotUse = {
                eventDate: s.eventDate!,
                fileId,
                partGroup: lib?.partGroup ?? fileId,
                chartName: lib?.name ?? t.fileName ?? t.title,
                recent: inProfile ? recentDays.has(s.eventDate!.slice(0, 10)) : undefined,
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
    // An archived chart with a canonical twin recalls the twin: load those rows too.
    const canon = [...library.values()].filter(isDeadChart).map((l) => l.canonicalFileId).filter((x): x is string => !!x && !library.has(x))
    if (canon.length > 0) for (const [id, l] of await loadLibraryLite(org, canon)) library.set(id, l)
    return { index: buildSlotUses(setlists, library, f), setlists, library, truncated }
}
