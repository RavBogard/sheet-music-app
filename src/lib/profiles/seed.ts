import { getMoment } from "@/lib/books/moments"
import { validateLiturgyRef } from "@/lib/books/registry"
import { historyStem, type HistorySetlist, type HistoryTrack, type LibraryLite } from "@/lib/history/song-history"
import { isSongType } from "@/lib/setlist-track-count"
import type { CoreProfile, SlotKeyOptions } from "./keys"
import { slotKeyFor } from "./keys"
import { buildSlotUses } from "./slot-uses"
import { cleanLabel, computeSlotTier, USUAL_WINDOW, type Tier } from "./tiers"

/**
 * Setlist memory — learn a profile from its own past setlists. Pure.
 *
 * Bet 1 (MCP-03): a profile is a cache, re-learned on every draft. The running
 * order is the modal order of the profile's last LEARN_WINDOW regular services
 * (never a special week; B'nei Mitzvah is its own service type, so it never
 * feeds a regular profile). With fewer than 3 regular services the order is simply the
 * newest one's. Otherwise a row is in the order when it is in at least half
 * of them, and two rows keep the order most of those services gave them.
 *
 * A song's place in the order is its moment, else its position (the n-th
 * song after the last moment or non-song row), so a slot whose song changes
 * every week keeps its place and is drafted open; its slot (what tiers read) is still
 * its moment or chart. Rows of one slot in one service (a moment's piano, lyrics and lead-sheet
 * rows, or the instrument copies of one arrangement) collapse into one row,
 * and the per-part charts are kept as `parts` (MCP-14).
 *
 * Non-song rows (headers, readings…) are copied. Each song row is tiered over
 * the profile's history: a `usual` row keeps its chart and key and is marked
 * `house`; every other row becomes an open slot with its moment or title as
 * the label, and is listed in `unsure`. Nothing is filled by guess.
 */

/** How many regular services a running order is learned from. */
export const LEARN_WINDOW = USUAL_WINDOW

export type SlotKind = "moment" | "song" | "open"

export interface HouseMark {
    source: "history"
    /** Regular weeks in the window that used this chart. */
    count: number
    /** Regular weeks in the window. */
    of: number
    seededAt: string
}

export interface SlotPart {
    fileId: string
    chartName: string
    title: string
}

export interface SeededTrack {
    type: string
    title: string
    notes?: string
    momentId?: string
    /**
     * The base row's page, keyed by its book (template `liturgyRefs` shape),
     * so a setlist made from the profile is bound to the profile's book the
     * way clone_setlist_from_template binds it; a row with no page for that
     * book is reported as unresolved, never given another book's page.
     */
    liturgyRefs?: Record<string, { unitId?: string; folio: number }>
    fileId?: string
    fileName?: string
    key?: string
    slotKind?: SlotKind
    slotKey?: string
    house?: HouseMark | null
    /** MCP-14: the per-part charts of a slot that had several rows in one service. */
    parts?: SlotPart[]
}

export interface SeedUnsure {
    label: string
    /** The slot's tier: last_time, other_service or new. */
    reason: Tier
    phrase: string
}

/** The regular services a running order was learned from, newest first. */
export interface LearnedFrom {
    count: number
    setlists: Array<{ setlistId: string; name: string; eventDate: string }>
}

export interface SeedResult {
    tracks: SeededTrack[]
    unsure: SeedUnsure[]
    /** The newest of the services the order was learned from. */
    basedOn: { setlistId: string; eventDate: string } | null
    learnedFrom?: LearnedFrom | null
    /**
     * Rows of the newest regular service that the learned order leaves out
     * (in fewer than half of the services). Said in the readback, never silent.
     */
    dropped?: Array<{ label: string; count: number; of: number }>
}

export interface LearnOptions {
    /** Only setlists before this day (YYYY-MM-DD) are history. */
    before?: string
    /** Slot keys look the moment up from the title (CRC). Default true. */
    byTitle?: boolean
}

export function seedProfile(
    def: Pick<CoreProfile, "serviceType" | "rabbiSlot">,
    setlists: HistorySetlist[],
    library: Map<string, LibraryLite>,
    now: Date = new Date(),
    opts: LearnOptions = {},
): SeedResult {
    const keyOpts: SlotKeyOptions = { byTitle: opts.byTitle !== false }
    const index = buildSlotUses(setlists, library, {
        serviceType: def.serviceType,
        rabbiSlot: def.rabbiSlot,
        before: opts.before,
        byTitle: keyOpts.byTitle,
    })
    const window = regularWindow(index.profileSetlists)
    if (window.length === 0) return { tracks: [], unsure: [], basedOn: null }

    const services = window.map((s) => collapseService(s, index.partGroupOf, library, keyOpts))
    const order = modalOrder(services.map((items) => items.map((i) => i.key)))
    const seededAt = now.toISOString()
    const tracks: SeededTrack[] = []
    const unsure: SeedUnsure[] = []

    for (const key of order) {
        // The newest service that has the row speaks for it.
        const item = services.map((items) => items.find((i) => i.key === key)).find((i): i is ServiceItem => !!i)!
        const t = item.track
        const title = t.title ?? ""
        const refs = pageOf(t)
        if (!isSongType(t.type)) {
            const row: SeededTrack = { type: t.type, title }
            if (t.notes) row.notes = t.notes
            if (t.momentId) row.momentId = t.momentId
            if (refs) row.liturgyRefs = refs
            tracks.push(row)
            continue
        }
        const slotKey = item.slotKey ?? key
        // The slot's moment names the row; only a stored momentId is written onto it (a moment
        // found from a title or a page is memory's grouping, never the row's identity).
        const slotMoment = slotKey.startsWith("moment:") ? slotKey.slice("moment:".length) : null
        const momentId = t.momentId ?? null
        const profileUses = index.profileUses(slotKey)
        const tier = computeSlotTier({ standing: null, profileUses, otherUses: index.otherUses(slotKey) })
        const parts = item.parts.length > 1 ? item.parts : null
        if (tier.tier === "usual" && tier.fileId) {
            const usualWindow = profileUses.filter((u) => !u.special && u.recent !== false).slice(0, USUAL_WINDOW)
            const group = usualWindow.find((u) => u.fileId === tier.fileId)?.partGroup
            const row: SeededTrack = {
                type: "song",
                // Named by its moment, else the week's title without a file extension.
                title: getMoment(slotMoment)?.display.en ?? (cleanLabel(title) || title),
                fileId: tier.fileId,
                slotKind: slotKey.startsWith("moment:") ? "moment" : "song",
                slotKey,
                house: {
                    source: "history",
                    count: usualWindow.filter((u) => u.partGroup === group).length,
                    of: usualWindow.length,
                    seededAt,
                },
            }
            if (momentId) row.momentId = momentId
            if (refs) row.liturgyRefs = refs
            if (t.fileId === tier.fileId && t.fileName) row.fileName = t.fileName
            if (tier.key) row.key = tier.key
            if (parts) row.parts = parts
            tracks.push(row)
            continue
        }
        // An open slot is labelled by its moment ("Mi Chamocha"), never by the one week's song
        // that happened to fill it, or the profile would read as if that song were the usual.
        const openLabel = getMoment(slotMoment)?.display.en ?? positionalLabel(key, services) ?? songLabel(title)
        const row: SeededTrack = { type: "song", title: openLabel, slotKind: "open", slotKey, house: null }
        if (momentId) row.momentId = momentId
        if (refs) row.liturgyRefs = refs
        if (parts) row.parts = parts
        tracks.push(row)
        unsure.push({ label: openLabel === title ? title : `${openLabel} (last: ${title})`, reason: tier.tier, phrase: tier.phrase })
    }

    const kept = new Set(order)
    const dropped = services[0]
        .filter((i) => !kept.has(i.key))
        .map((i) => ({
            label: i.slotKey ? songLabel(i.track.title ?? "") : i.track.title ?? "",
            count: services.filter((items) => items.some((x) => x.key === i.key)).length,
            of: services.length,
        }))
    const newest = window[0]
    return {
        ...(dropped.length > 0 ? { dropped } : {}),
        tracks,
        unsure,
        basedOn: { setlistId: newest.id, eventDate: newest.eventDate! },
        learnedFrom: {
            count: window.length,
            setlists: window.map((s) => ({ setlistId: s.id, name: s.name, eventDate: s.eventDate! })),
        },
    }
}

/** A song row's title said as a slot label: before any clarifier, no file extension. */
function songLabel(title: string): string {
    return cleanLabel(title.split(/\s+[—–-]\s+|\s*\(/)[0]) || cleanLabel(title) || title
}

/**
 * The label of a positional slot whose song changes week to week: never one
 * week's song ("Opening song", "Song after Bar'chu"). One song every week keeps
 * its own name.
 */
function positionalLabel(key: string, services: ServiceItem[][]): string | null {
    if (!key.startsWith("pos:")) return null
    const titles = new Set(
        services.flatMap((items) => items.filter((i) => i.key === key).map((i) => songLabel(i.track.title ?? "").toLowerCase())),
    )
    if (titles.size === 1) return null
    const m = /^pos:(.*)#(\d+)$/.exec(key)
    const anchor = m?.[1] ?? "start"
    const nth = Number(m?.[2] ?? 1)
    const ordinal = nth === 1 ? "" : `${["", "", "second ", "third ", "fourth "][nth] ?? `${nth}th `}`
    if (anchor === "start") return nth === 1 ? "Opening song" : `${ordinal[0].toUpperCase()}${ordinal.slice(1)}opening song`
    const anchorItem = services.flatMap((items) => items).find((i) => i.key === anchor)
    const anchorLabel = anchor.startsWith("moment:")
        ? (getMoment(anchor.slice("moment:".length))?.display.en ?? anchor.slice("moment:".length))
        : (anchorItem?.track.title ?? "the last row")
    return nth === 1 ? `Song after ${anchorLabel}` : `${ordinal[0].toUpperCase()}${ordinal.slice(1)}song after ${anchorLabel}`
}

/** The profile's last LEARN_WINDOW regular services, one per day, newest first. */
export function regularWindow(profileSetlists: HistorySetlist[]): HistorySetlist[] {
    const out: HistorySetlist[] = []
    const days = new Set<string>()
    for (const s of profileSetlists) {
        if (s.special || !s.eventDate) continue
        const day = s.eventDate.slice(0, 10)
        if (days.has(day)) continue
        days.add(day)
        out.push(s)
        if (out.length >= LEARN_WINDOW) break
    }
    return out
}

interface ServiceItem {
    /** The order key: the moment, else the song's position after its anchor, so a song keeps its place when it changes. */
    key: string
    /** Song rows: the slot the tiers read. */
    slotKey: string | null
    track: HistoryTrack
    parts: SlotPart[]
}

/**
 * One service's rows as order items: rows of one song slot collapse into the
 * first (their charts kept as parts); repeated non-song rows are numbered.
 */
export function collapseService(
    s: HistorySetlist,
    partGroupOf: (fileId: string) => string | null,
    library: Map<string, LibraryLite> = new Map(),
    opts: SlotKeyOptions = {},
): ServiceItem[] {
    const items: ServiceItem[] = []
    const bySlot = new Map<string, ServiceItem>()
    const rowCount = new Map<string, number>()
    // A song row with no moment holds a place by position: the n-th such song after the last
    // anchor (a moment row or a non-song row). A rotating opening song is one slot.
    let anchor = "start"
    let sinceAnchor = 0
    let prevSong: ServiceItem | null = null
    for (const t of s.tracks) {
        if (isSongType(t.type)) {
            const slotKey = slotKeyFor(t, partGroupOf, opts)
            const part = t.fileId
                ? { fileId: t.fileId, chartName: library.get(t.fileId)?.name ?? t.fileName ?? t.title, title: t.title }
                : null
            // Rows of one slot (a moment, or one arrangement's instrument copies), or an adjacent
            // row of the same song (its lyrics after its piano part), are one item with parts.
            const cur =
                bySlot.get(slotKey) ??
                (prevSong && sameSongLead(prevSong.track.title, t.title) && !slotKey.startsWith("moment:") ? prevSong : undefined)
            if (cur) {
                if (part && !cur.parts.some((p) => p.fileId === part.fileId)) cur.parts.push(part)
                continue
            }
            let key: string
            if (slotKey.startsWith("moment:")) {
                key = slotKey
                anchor = slotKey
                sinceAnchor = 0
            } else {
                sinceAnchor += 1
                key = `pos:${anchor}#${sinceAnchor}`
            }
            const item: ServiceItem = { key, slotKey, track: t, parts: part ? [part] : [] }
            bySlot.set(slotKey, item)
            items.push(item)
            prevSong = item
            continue
        }
        const base = `row:${t.type}:${t.momentId ?? (historyStem(t.title ?? "") || (t.title ?? "").trim().toLowerCase())}`
        const n = (rowCount.get(base) ?? 0) + 1
        rowCount.set(base, n)
        const key = n === 1 ? base : `${base}#${n}`
        items.push({ key, slotKey: null, track: t, parts: [] })
        anchor = key
        sinceAnchor = 0
        prevSong = null
    }
    return items
}

/** True when two row titles start with the same two words (a song's piano and lyrics rows). */
function sameSongLead(a: string | null | undefined, b: string | null | undefined): boolean {
    const lead = (x: string | null | undefined) =>
        (x ?? "")
            .toLowerCase()
            .replace(/['‘’]/g, "")
            .split(/[^a-z0-9]+/)
            .filter(Boolean)
            .slice(0, 2)
            .join(" ")
    const la = lead(a)
    return la.split(" ").length === 2 && la === lead(b)
}

/**
 * The modal order of several services' rows (newest first). A row is kept
 * when at least half the services have it. The newest service's order is the
 * start; each other kept row goes where it disagrees least with the services
 * that have it; then neighbours swap while more services put them the other
 * way round.
 */
export function modalOrder(services: string[][]): string[] {
    if (services.length === 0) return []
    // Fewer than 3 regular services is too little to call a mode: the newest one speaks, whole,
    // rather than a union of every row either service had.
    if (services.length < 3) return [...new Set(services[0])]
    const need = Math.ceil(services.length / 2)
    const count = new Map<string, number>()
    const firstSeen: string[] = []
    for (const keys of services) {
        for (const k of new Set(keys)) {
            if (!count.has(k)) firstSeen.push(k)
            count.set(k, (count.get(k) ?? 0) + 1)
        }
    }
    const kept = new Set(firstSeen.filter((k) => (count.get(k) ?? 0) >= need))
    const pos = services.map((keys) => new Map(keys.map((k, i) => [k, i])))
    // before(a, b): how many services have both and put a first.
    const before = (a: string, b: string): number => {
        let n = 0
        for (const p of pos) {
            const pa = p.get(a)
            const pb = p.get(b)
            if (pa !== undefined && pb !== undefined && pa < pb) n++
        }
        return n
    }
    const order = services[0].filter((k) => kept.has(k))
    const rest = firstSeen
        .filter((k) => kept.has(k) && !order.includes(k))
        .sort((a, b) => count.get(b)! - count.get(a)!)
    for (const k of rest) {
        let best = 0
        let bestCost = Infinity
        for (let p = 0; p <= order.length; p++) {
            let cost = 0
            for (let j = 0; j < order.length; j++) cost += j < p ? before(k, order[j]) : before(order[j], k)
            if (cost < bestCost) {
                bestCost = cost
                best = p
            }
        }
        order.splice(best, 0, k)
    }
    for (let pass = 0; pass < order.length; pass++) {
        let swapped = false
        for (let i = 0; i + 1 < order.length; i++) {
            const [a, b] = [order[i], order[i + 1]]
            if (before(b, a) > before(a, b)) {
                order[i] = b
                order[i + 1] = a
                swapped = true
            }
        }
        if (!swapped) break
    }
    return order
}

/** A row's valid, current page as per-book refs; null when it has none. */
function pageOf(t: HistorySetlist["tracks"][number]): SeededTrack["liturgyRefs"] | null {
    const ref = t.liturgyRef
    if (!ref || ref.stale) return null
    if (!validateLiturgyRef({ book: ref.book, folio: ref.folio, ...(ref.unitId ? { unitId: ref.unitId } : {}) }).ok) return null
    return { [ref.book]: ref.unitId ? { unitId: ref.unitId, folio: ref.folio } : { folio: ref.folio } }
}
