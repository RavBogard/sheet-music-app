import { bareStem } from "@/lib/mcp/title-specificity"
import { classifyService, type RabbiSlotKey } from "./classify"

/**
 * Setlist memory, release 1 — "how have we done this song before?"
 *
 * Pure: takes already-loaded, tenant-scoped setlists + library rows and
 * reports what was done. It ranks nothing and recommends nothing; `byChart`
 * is a plain usage count, ordered by count.
 */

export interface HistoryTrack {
    id: string
    order: number
    type: string
    title: string
    fileId: string | null
    fileName: string | null
    key: string | null
    leadMusician: string | null
    notes: string | null
}

export interface HistorySetlist {
    id: string
    name: string
    eventDate: string | null
    templateType: string | null
    rabbi: string | null
    book: string | null
    ownerName: string | null
    isTest: boolean
    tracks: HistoryTrack[]
}

export interface LibraryLite {
    fileId: string
    name: string
    key: string | null
    setting: string | null
    partGroup: string | null
}

export interface SongHistoryQuery {
    title?: string
    fileId?: string
    serviceType?: string
    rabbiSlot?: RabbiSlotKey
    /** default true */
    includeSpecial?: boolean
    /** default 25, max 100 */
    limit?: number
}

export interface SongHistoryEntry {
    setlistId: string
    setlistName: string
    eventDate: string
    serviceType: string | null
    rabbiSlot: RabbiSlotKey | null
    special: boolean
    trackId: string
    title: string
    fileId: string | null
    chartName: string | null
    chartInLibrary: boolean
    setting: string | null
    playedKey: string | null
    writtenKey: string | null
    leadMusician: string | null
    notes: string | null
    author: string | null
}

export interface ChartTally {
    fileId: string | null
    chartName: string | null
    count: number
    /** played key → count; "" for no key */
    keys: Record<string, number>
    lastUsed: string
}

export interface SongHistoryResult {
    entries: SongHistoryEntry[]
    total: number
    /** count desc */
    byChart: ChartTally[]
}

export const SONG_HISTORY_DEFAULT_LIMIT = 25
export const SONG_HISTORY_MAX_LIMIT = 100

/** `bareStem` with one trailing standalone `pdf` token removed. */
export function historyStem(title: string): string {
    return bareStem(title).replace(/(^|\s)pdf$/, "").trim()
}

/**
 * Spelling-insensitive skeleton of a stem: apostrophes go, every vowel after
 * a word's first letter goes, doubled letters collapse, words join.
 * "shema" → "shm", "adonai s fatai" → "adnsft".
 */
export function songSkeleton(stem: string): string {
    return stem
        .replace(/['’]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
            const thinned = word[0] + word.slice(1).replace(/[aeiou]/g, "")
            return thinned.replace(/(.)\1+/g, "$1")
        })
        .join("")
}

const DELETABLE = new Set(["a", "e", "i", "o", "u", "h"])

/** Stem with spaces and apostrophes removed: the form spelling match compares. */
function compact(stem: string): string {
    return stem.replace(/['’\s]/g, "")
}

/**
 * True when one stem turns into the other purely by deleting vowels,
 * apostrophes or `h`, or by adding/removing spaces. Swapping one vowel for
 * another never matches, so Kaddish/Kiddush and Kadosh/Kedusha stay apart
 * even though they share a skeleton. `songSkeleton` equality is the cheap
 * pre-filter; this is the decision.
 */
export function spellingVariants(a: string, b: string): boolean {
    if (!a || !b) return false
    const x = compact(a)
    const y = compact(b)
    if (x === y) return true
    const [long, short] = x.length >= y.length ? [x, y] : [y, x]
    // reach[j]: short[0..j) can be produced from the long prefix read so far.
    let reach = new Array<boolean>(short.length + 1).fill(false)
    reach[0] = true
    for (const ch of long) {
        const next = new Array<boolean>(short.length + 1).fill(false)
        for (let j = 0; j <= short.length; j++) {
            if (!reach[j]) continue
            if (DELETABLE.has(ch)) next[j] = true
            if (j < short.length && short[j] === ch) next[j + 1] = true
        }
        reach = next
    }
    return reach[short.length]
}

function clampLimit(limit: number | undefined): number {
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
        return SONG_HISTORY_DEFAULT_LIMIT
    }
    return Math.min(Math.floor(limit), SONG_HISTORY_MAX_LIMIT)
}

export function buildSongHistory(
    setlists: HistorySetlist[],
    library: Map<string, LibraryLite>,
    q: SongHistoryQuery,
): SongHistoryResult {
    const includeSpecial = q.includeSpecial !== false
    const title = q.title?.trim() || undefined
    const fileId = q.fileId?.trim() || undefined
    const qStem = title ? historyStem(title) : null
    const qSkeleton = qStem ? songSkeleton(qStem) : null
    const qPartGroup = fileId ? (library.get(fileId)?.partGroup ?? null) : null

    const matchesTrack = (t: HistoryTrack): boolean => {
        if (fileId && t.fileId) {
            if (t.fileId === fileId) return true
            if (qPartGroup) {
                const pg = library.get(t.fileId)?.partGroup ?? null
                if (pg && pg === qPartGroup) return true
            }
        }
        if (qStem !== null) {
            const stem = historyStem(t.title ?? "")
            if (stem && stem === qStem) return true
            if (
                qSkeleton &&
                songSkeleton(stem) === qSkeleton &&
                spellingVariants(stem, qStem)
            ) {
                return true
            }
        }
        return false
    }

    const entries: SongHistoryEntry[] = []
    if (!title && !fileId) return { entries, total: 0, byChart: [] }

    for (const s of setlists) {
        if (s.isTest || !s.eventDate) continue
        const cls = classifyService({
            name: s.name,
            templateType: s.templateType,
            rabbi: s.rabbi,
        })
        if (cls.part) continue
        if (!includeSpecial && cls.special) continue
        if (q.serviceType && cls.serviceType !== q.serviceType) continue
        if (q.rabbiSlot && cls.rabbiSlot !== q.rabbiSlot) continue

        for (const t of s.tracks) {
            if (t.type !== "song") continue
            if (!matchesTrack(t)) continue
            const row = t.fileId ? library.get(t.fileId) : undefined
            entries.push({
                setlistId: s.id,
                setlistName: s.name,
                eventDate: s.eventDate,
                serviceType: cls.serviceType,
                rabbiSlot: cls.rabbiSlot,
                special: cls.special,
                trackId: t.id,
                title: t.title,
                fileId: t.fileId,
                chartName: row ? row.name : t.fileId ? t.fileName : null,
                chartInLibrary: !!row,
                setting: row?.setting ?? null,
                playedKey: t.key || null,
                writtenKey: row?.key || null,
                leadMusician: t.leadMusician,
                notes: t.notes,
                author: s.ownerName,
            })
        }
    }

    entries.sort((a, b) =>
        a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0,
    )

    const tallies = new Map<string, ChartTally>()
    for (const e of entries) {
        const k = e.fileId ?? ""
        let tally = tallies.get(k)
        if (!tally) {
            tally = { fileId: e.fileId, chartName: e.chartName, count: 0, keys: {}, lastUsed: e.eventDate }
            tallies.set(k, tally)
        }
        tally.count += 1
        const pk = e.playedKey ?? ""
        tally.keys[pk] = (tally.keys[pk] ?? 0) + 1
        if (e.eventDate > tally.lastUsed) tally.lastUsed = e.eventDate
    }
    const byChart = [...tallies.values()].sort(
        (a, b) =>
            b.count - a.count ||
            (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0),
    )

    return {
        entries: entries.slice(0, clampLimit(q.limit)),
        total: entries.length,
        byChart,
    }
}
