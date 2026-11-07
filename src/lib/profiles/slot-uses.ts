import { setlistPart } from "@/lib/history/classify"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import type { OrgId } from "@/lib/org/types"
import { dayInZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { isSongType } from "@/lib/setlist-track-count"
import { chartOf, serviceLabelFor, slotKeyAliases, slotKeyFor, type SlotKeyOptions, type SlotTrack } from "./keys"
import { momentForTitle } from "./moment-key"
import { USUAL_WINDOW, type SlotUse } from "./tiers"
import { currentVersionOf, MAX_LINEAGE_HOPS } from "@/lib/library/lineage-pure"

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
    /** Only setlists before this day (YYYY-MM-DD) count: a past date's view. */
    before?: string
    /** These setlists do not count: the ones already on the date being drafted. */
    excludeIds?: readonly string[]
    serviceType: string
    /** null: any rabbi (a profile not split by rabbi). */
    rabbiSlot: string | null
    /** Slot keys look the moment up from the title. Default true; Brothers Lazaroff passes false. */
    byTitle?: boolean
}

export interface SlotUseIndex {
    /** Eligible setlists of the profile, newest first. */
    profileSetlists: HistorySetlist[]
    profileUses(slotKey: string): SlotUse[]
    otherUses(slotKey: string): SlotUse[]
    partGroupOf(fileId: string): string | null
    /** The one moment a chart has been played at, from the whole history (CRC only). */
    momentOfChart(chart: string): string | null
    /** The slot a row fills, keyed exactly as this index keys its uses. */
    slotKeyOf(track: SlotTrack): string
    /** Older keys a standing choice for this row may be stored under. */
    aliasesOf(track: SlotTrack, slotKey: string): string[]
}

/**
 * Per chart (partGroup, else fileId), the one moment its rows name — a stored
 * moment, else the title's clear moment — across every non-test setlist. A
 * chart whose rows name two moments, or none, maps to nothing. This is the
 * "then by chart" step of slot matching: "Oseh Shalom" and "Oseh shalom - Nava
 * tehila" on one chart are one slot.
 */
export function chartMomentsOf(
    setlists: HistorySetlist[],
    partGroupOf: (fileId: string) => string | null,
): (chart: string) => string | null {
    const seen = new Map<string, Set<string>>()
    for (const s of setlists) {
        if (s.isTest) continue
        for (const t of s.tracks) {
            if (!isSongType(t.type) || !t.fileId) continue
            const moment = t.momentId || momentForTitle(t.title, t.type)
            if (!moment) continue
            const chart = chartOf(t.fileId, partGroupOf)
            const set = seen.get(chart) ?? new Set<string>()
            set.add(moment)
            seen.set(chart, set)
        }
    }
    const out = new Map<string, string>()
    for (const [chart, set] of seen) if (set.size === 1) out.set(chart, [...set][0])
    return (chart) => out.get(chart) ?? null
}

export function partGroupLookup(library: Map<string, LibraryLite>): (fileId: string) => string | null {
    return (fileId) => library.get(fileId)?.partGroup ?? null
}

/**
 * MCP-02 left standing choices made earlier under `song:<partGroup>` keys. For
 * a moment slot, those are the song keys of every chart the slot's history
 * holds (whichever row that chart was on), so an older "keep it" on Mi Chamocha
 * is still found whatever setting the row now has.
 */
export function historyAliases(index: SlotUseIndex, slotKey: string): string[] {
    if (!slotKey.startsWith("moment:")) return []
    const out = new Set<string>()
    for (const u of index.profileUses(slotKey)) out.add(`song:${u.partGroup}`)
    return [...out]
}

/**
 * Dated, non-test, whole-band setlists that hold at least one song row, newest first.
 * A setlist with no song rows (an empty shell made for a date and never filled) is not a
 * service anyone played: counted, it takes a place in the learning window and starves the
 * running order (three empty Shabbat mornings of five left no row in three of five).
 */
export function eligibleSetlists(
    setlists: HistorySetlist[],
    before?: string,
    excludeIds: readonly string[] = [],
): HistorySetlist[] {
    return setlists
        .filter((s) => !s.isTest && !!s.eventDate && !setlistPart(s.name))
        .filter((s) => s.tracks.some((t) => isSongType(t.type)))
        .filter((s) => !before || s.eventDate!.slice(0, 10) < before)
        .filter((s) => !excludeIds.includes(s.id))
        .sort((a, b) => (a.eventDate! < b.eventDate! ? 1 : a.eventDate! > b.eventDate! ? -1 : 0))
}

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?/g

/** A setlist name with case, punctuation, month names and numbers removed. */
export function normalizedName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(MONTH_RE, " ")
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function serviceKey(s: HistorySetlist): string {
    return `${s.eventDate!.slice(0, 10)}|${s.serviceType}|${s.rabbiSlot ?? ""}|${normalizedName(s.name)}`
}

/**
 * One setlist per (eventDate day, serviceType, rabbiSlot, normalised name): duplicates of one service must not
 * count twice toward "usual". The newest version (`updatedAt`) wins; with no timestamps the
 * first in the input order does. The name keeps two different services of one day (a morning and a
 * Havdalah B'nei Mitzvah) apart. A setlist with no service type is never collapsed.
 */
export function dedupeServices(setlists: HistorySetlist[]): HistorySetlist[] {
    const winner = new Map<string, HistorySetlist>()
    const stamp = (s: HistorySetlist) => Date.parse(s.updatedAt ?? "") || 0
    for (const s of setlists) {
        if (s.serviceType === null) continue
        const key = serviceKey(s)
        const cur = winner.get(key)
        if (!cur || stamp(s) > stamp(cur)) winner.set(key, s)
    }
    return setlists.filter((s) => s.serviceType === null || winner.get(serviceKey(s)) === s)
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
    const byTitle = f.byTitle !== false
    const momentOfChart = byTitle ? chartMomentsOf(setlists, partGroupOf) : () => null
    const keyOpts: SlotKeyOptions = { byTitle, momentOfChart }
    const slotKeyOf = (t: SlotTrack) => slotKeyFor(t, partGroupOf, keyOpts)
    const profile = new Map<string, SlotUse[]>()
    const other = new Map<string, SlotUse[]>()
    const profileSetlists: HistorySetlist[] = []

    const eligible = dedupeServices(eligibleSetlists(setlists, f.before, f.excludeIds))
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
            const slotKey = slotKeyOf(t)
            if (seen.has(slotKey)) continue
            seen.add(slotKey)
            // Bet 2: memory follows lineage. A chart with a newer version is
            // recalled as its lineage's current version; the setlist itself
            // keeps the exact chart it had.
            let fileId = currentVersionOf(t.fileId, (id) => library.get(id))
            let lib = library.get(fileId)
            let dead = false
            if (isDeadChart(lib)) {
                // Recall the canonical chart when there is one; otherwise the dead chart is never filled.
                const canon = lib!.canonicalFileId ? library.get(lib!.canonicalFileId) : undefined
                if (canon && !isDeadChart(canon)) {
                    lib = canon
                    fileId = canon.fileId
                } else dead = true
            }
            const use: SlotUse = {
                eventDate: s.eventDate!,
                fileId,
                partGroup: lib?.partGroup ?? fileId,
                chartName: lib?.name ?? t.fileName ?? t.title,
                ...(lib?.setting ? { setting: lib.setting } : {}),
                ...(dead ? { dead: true } : {}),
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

    const index: SlotUseIndex = {
        profileSetlists,
        profileUses: (slotKey) => profile.get(slotKey) ?? [],
        otherUses: (slotKey) => other.get(slotKey) ?? [],
        partGroupOf,
        momentOfChart,
        slotKeyOf,
        aliasesOf: (t, slotKey) =>
            [...new Set([...slotKeyAliases(t, partGroupOf, slotKey, keyOpts), ...historyAliases(index, slotKey)])].filter(
                (a) => a !== slotKey,
            ),
    }
    return index
}

/**
 * The org's history as performed (MCP-23) and the library rows it names,
 * with the canonical twins of archived charts.
 */
export async function loadMemoryHistory(org: OrgId): Promise<{
    setlists: HistorySetlist[]
    library: Map<string, LibraryLite>
    truncated: boolean
}> {
    const { loadHistorySetlists, loadLibraryLite } = await import("@/lib/history/load")
    const { setlists, truncated } = await loadHistorySetlists(org, { asPerformed: true })
    const fileIds = setlists.flatMap((s) => s.tracks.map((t) => t.fileId).filter((x): x is string => !!x))
    const library = await loadLibraryLite(org, fileIds)
    // Newer versions (bet 2) and the canonical twins of archived charts are
    // recalled in their place: load those rows too, following each chain.
    for (let round = 0; round < MAX_LINEAGE_HOPS; round++) {
        const next = new Set<string>()
        for (const l of library.values()) {
            if (l.supersededBy && !library.has(l.supersededBy)) next.add(l.supersededBy)
            if (isDeadChart(l) && l.canonicalFileId && !library.has(l.canonicalFileId)) next.add(l.canonicalFileId)
        }
        if (next.size === 0) break
        const loaded = await loadLibraryLite(org, [...next])
        if (loaded.size === 0) break
        for (const [id, l] of loaded) library.set(id, l)
    }
    return { setlists, library, truncated }
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
    const { setlists, library, truncated } = await loadMemoryHistory(org)
    // Brothers Lazaroff keeps song slots: no title lookup outside CRC.
    const filter = { ...f, byTitle: f.byTitle ?? org === DEFAULT_ORG_ID }
    return { index: buildSlotUses(setlists, library, filter), setlists, library, truncated }
}
