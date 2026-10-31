import { getBook } from "@/lib/books/registry"
import { dayInZone } from "@/lib/org/locale"
import { OVERRIDE_WINDOW_DAYS } from "./standing"
import { PROMOTION_WEEKS, type Promotion, type Tier } from "./tiers"

/**
 * Setlist memory, release 3 — the readback: a draft or a setlist said aloud,
 * exceptions first. Pure: no Firestore.
 *
 * The headline names the service, the date and the book. The exceptions are
 * what the author has to hear: open slots, rows with no chart, a standard
 * set in the last 28 days, a promotion offer, and open items. Everything else
 * is one line. The voice text lists at most READBACK_VOICE_MAX row
 * exceptions, then every open item; `exceptions` always carries them all. It reports tiers and never suggests a
 * chart.
 */

export const READBACK_VOICE_MAX = 5

export interface ReadbackRow {
    index: number
    /** The row title, or the moment label for an open slot. */
    label: string
    isSong: boolean
    hasChart: boolean
    /** null: no profile, or not a song row. */
    tier: Tier | null
    /** The tier phrase, verbatim. */
    phrase: string | null
    keyOnRecord: boolean
    standing?: { byName: string; at: string } | null
    promotion?: Promotion
    /**
     * An existing setlist only: how this row differs from its standard or
     * usual chart ("Barchu (Walkdown) in Cm this week; usual is Barchu
     * (Walkdown) in Dm"). Listed as `differs`.
     */
    differs?: string
    /** Draft only: the chart is orphaned or archived. */
    deadChart?: string
    /** Draft only: played in a key other than the chart's written key. */
    keyMismatch?: string
    /**
     * Draft only (MCP-04, "fill it but say it"): a filled row and why it is
     * worth hearing. A filled row with no reasons stays folded in the rest line.
     */
    filled?: FilledNote
    /** Open slots: what the slot had before, said as a setting and a month (MCP-20). */
    recall?: { setting: string; key: string | null; date: string | null; serviceLabel?: string | null }
}

export type FilledReason =
    /** The usual chart was last played more than STALE_WEEKS before the service. */
    | { kind: "stale"; date: string }
    /** The latest regular service played something else in this slot. */
    | { kind: "differs"; date: string; setting: string }
    | { kind: "no_key" }
    /** The profile was learned from one service only. */
    | { kind: "single" }

export interface FilledNote {
    tier: "standard" | "usual"
    setting: string
    key: string | null
    reasons: FilledReason[]
}

export interface OpenItem {
    id: string
    text: string
    trackId: string | null
    createdAt: string
    createdByName: string
}

export interface ReadbackItem {
    kind:
        | "existing"
        | "book_differs"
        | "open_slot"
        | "filled"
        | "no_chart"
        | "differs"
        | "recent_standard"
        | "promotion"
        | "open_item"
        | "dead_chart"
        | "key_mismatch"
    index: number | null
    text: string
    /** What is said aloud when it differs from `text` (a setting, not a file name; a month). */
    voice?: string
}

export interface Readback {
    headline: string
    exceptions: ReadbackItem[]
    rest: string
    text: string
}

export interface ReadbackInput {
    profileLabel: string | null
    /** Headline name when there is no profile (the setlist's own name). */
    title?: string | null
    /** YYYY-MM-DD. */
    date: string | null
    /** A book slug; the headline says its title. */
    book: string | null
    special: boolean
    rows: ReadbackRow[]
    openItems: OpenItem[]
    now: Date
    /** Draft only: setlists already on this date for this service. Said first; never blocks. */
    existing?: { setlistId: string; name: string }[]
    /** IANA zone for the date a standard was set; UTC when absent. */
    timeZone?: string
    /** Draft only: where the running order came from, said after the headline (MCP-03). */
    origin?: string | null
    /** Said first, beside `existing` (e.g. the book differs from the profile's). Never blocks. */
    notices?: Array<{ kind: "book_differs"; text: string }>
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
const NUMBER_WORDS = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
    "Twenty",
]
/** A usual chart not played for longer than this is named in the readback. */
export const STALE_WEEKS = 8
/** In a long list, the voice says this many and offers the rest. */
export const READBACK_VOICE_FIRST = 3
const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_TIERS: ReadonlySet<Tier> = new Set<Tier>(["last_time", "other_service", "new"])

/** "Nov 7" in UTC, or null when the value is not a date. */
export function monthDay(value: string | null | undefined): string | null {
    if (!value) return null
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return null
    const d = new Date(t)
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** A timestamp as its YYYY-MM-DD day in `timeZone`; the value unchanged without one. */
function sinceDay(at: string, timeZone: string | undefined): string {
    const t = Date.parse(at)
    return timeZone && !Number.isNaN(t) ? dayInZone(t, timeZone) : at
}

/** "July" (UTC), or null. */
export function monthName(value: string | null | undefined): string | null {
    if (!value) return null
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
    const t = Date.parse(iso)
    return Number.isNaN(t) ? null : MONTH_NAMES[new Date(t).getUTCMonth()]
}

/**
 * The setting of a chart, said instead of its file name: the library's
 * `setting` when it has one, else the clarifier in the name ("Mi chamocha
 * (Moshav) morning.pdf" → "Moshav"; "Adon Olam - IWITW" → "IWITW"), else the
 * clean name.
 */
export function settingOf(chartName: string | null | undefined, setting?: string | null): string {
    if (setting && setting.trim()) return setting.trim()
    const name = (chartName ?? "")
        .trim()
        .replace(/\.(pdf|musicxml|mxl|xml|docx?|txt|png|jpe?g)$/i, "")
        .replace(/_/g, " ")
    const paren = /\(([^)]+)\)/.exec(name)
    if (paren && paren[1].trim()) return paren[1].trim()
    const dash = name.split(/\s+[—–-]\s+/)
    if (dash.length > 1 && dash[1].trim()) return dash[1].trim()
    return name.replace(/\s{2,}/g, " ").trim()
}

/**
 * A setlist name without a trailing date that only repeats the service date
 * ("Eliana Bat Mitzvah — Oct 31" on Oct 31 → "Eliana Bat Mitzvah").
 */
export function stripTrailingDate(name: string, date: string | null): string {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return name
    const [y, m, d] = date.split("-").map(Number)
    const mon = `(?:${MONTHS[m - 1]}|${MONTH_NAMES[m - 1]})\\.?`
    const forms = [
        `${mon}\\s+0?${d}(?:st|nd|rd|th)?(?:,?\\s+${y})?`,
        `0?${m}/0?${d}(?:/(?:${y}|${String(y).slice(2)}))?`,
        `${y}-0?${m}-0?${d}`,
    ]
    const re = new RegExp(`[\\s,;:—–-]*\\(?(?:${forms.join("|")})\\)?\\s*$`, "i")
    const out = name.replace(re, "").trim()
    return out || name
}

/** "Shabbat mornings" — the plural a learned-from line says. */
export function serviceNoun(serviceType: string, label: string, n: number): string {
    const nouns: Record<string, [string, string]> = {
        shabbat_morning: ["Shabbat morning", "Shabbat mornings"],
        friday_night: ["Friday night", "Friday nights"],
        shir_shabbat: ["Shir Shabbat", "Shir Shabbat services"],
        bnei_mitzvah_saturday: ["B'nei Mitzvah service", "B'nei Mitzvah services"],
        havdalah_bnei_mitzvah: ["Havdalah B'nei Mitzvah", "Havdalah B'nei Mitzvah services"],
    }
    const pair = nouns[serviceType] ?? [`${label} service`, `${label} services`]
    return n === 1 ? pair[0] : pair[1]
}

function filledText(label: string, f: FilledNote): string {
    const clauses = f.reasons.map((r) => {
        switch (r.kind) {
            case "differs":
                return `${monthDay(r.date) ?? r.date} was ${r.setting}`
            case "stale":
                return `last played in ${monthName(r.date) ?? r.date}`
            case "no_key":
                return "key not on record"
            case "single":
                return "learned from one service only"
        }
    })
    const inKey = f.key ? ` in ${f.key}` : ""
    return `${label}: ${f.setting}, your ${f.tier === "standard" ? "standard" : "usual"}${inKey}; ${clauses.join("; ")}`
}

function openVoice(r: ReadbackRow): string | undefined {
    if (!r.recall) return undefined
    const { setting, key, date, serviceLabel } = r.recall
    const inKey = key ? ` in ${key}` : ""
    const month = monthName(date)
    if (r.tier === "last_time") return `${r.label}: last time ${setting}${inKey}${month ? `, in ${month}` : ""}`
    if (r.tier === "other_service") return `${r.label}: done before at ${serviceLabel ?? "another service"}${month ? ` in ${month}` : ""}, not here`
    return undefined
}

function bookTitle(slug: string | null): string | null {
    if (!slug) return null
    return getBook(slug)?.title ?? slug
}

function isRecent(at: string | undefined, now: Date): boolean {
    if (!at) return false
    const t = Date.parse(at)
    if (Number.isNaN(t)) return false
    return now.getTime() - t < OVERRIDE_WINDOW_DAYS * DAY_MS
}

const ORDINALS: Record<number, string> = { 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth" }

/** A sentence for the voice text: the item's text with a closing stop. */
function spoken(text: string): string {
    return /[.?!]$/.test(text) ? text : `${text}.`
}

export function buildReadback(input: ReadbackInput): Readback {
    const { profileLabel, rows, openItems, now } = input

    const title = input.title ? stripTrailingDate(input.title, input.date) : null
    const parts = [profileLabel ?? title ?? null, monthDay(input.date), bookTitle(input.book)].filter((p): p is string => !!p)
    let headline = parts.length > 0 ? `${parts.join(", ")}.` : ""
    if (input.origin) headline = `${headline} ${input.origin}`.trim()
    if (input.special) {
        headline = `${headline} Marked special: changes are for this week only.`.trim()
    }

    const exceptions: ReadbackItem[] = []
    const listed = new Set<number>()
    for (const e of input.existing ?? []) {
        exceptions.push({ kind: "existing", index: null, text: `There is already a setlist on this date: ${e.name}` })
    }
    for (const n of input.notices ?? []) exceptions.push({ kind: n.kind, index: null, text: n.text })
    const leading = exceptions.length
    for (const r of rows) {
        if (!r.isSong) continue
        const before = exceptions.length
        if (r.tier && OPEN_TIERS.has(r.tier)) {
            const item: ReadbackItem = { kind: "open_slot", index: r.index, text: `${r.label}: ${r.phrase ?? ""}`.trim() }
            const voice = r.tier === "new" ? `${r.label}: new, which chart?` : openVoice(r)
            if (voice && voice !== item.text) item.voice = voice
            exceptions.push(item)
        } else if (r.filled && r.filled.reasons.length > 0 && r.hasChart) {
            exceptions.push({ kind: "filled", index: r.index, text: filledText(r.label, r.filled) })
        } else if (!r.hasChart) {
            exceptions.push({ kind: "no_chart", index: r.index, text: `${r.label}: no chart yet` })
        } else if (r.differs) {
            exceptions.push({ kind: "differs", index: r.index, text: `${r.label}: ${r.differs}` })
        }
        if (r.tier === "standard" && r.standing && isRecent(r.standing.at, now)) {
            const since = monthDay(sinceDay(r.standing.at, input.timeZone))
            exceptions.push({
                kind: "recent_standard",
                index: r.index,
                text: `${r.label}: your standard${since ? ` since ${since}` : ""} (set by ${r.standing.byName})`,
            })
        }
        if (r.promotion) {
            const inKey = r.promotion.key ? ` in ${r.promotion.key}` : ""
            exceptions.push({
                kind: "promotion",
                index: r.index,
                text: `${r.label}: ${ORDINALS[PROMOTION_WEEKS] ?? `${PROMOTION_WEEKS}th`} week of ${r.promotion.chartName}${inKey}. Make it standard?`,
            })
        }
        if (r.deadChart) exceptions.push({ kind: "dead_chart", index: r.index, text: r.deadChart })
        if (r.keyMismatch) exceptions.push({ kind: "key_mismatch", index: r.index, text: r.keyMismatch })
        if (exceptions.length > before) listed.add(r.index)
    }
    const rowExceptions = exceptions.length
    for (const item of openItems) {
        exceptions.push({ kind: "open_item", index: null, text: `Open: ${item.text}` })
    }

    const others = rows.filter((r) => r.isSong && r.hasChart && !listed.has(r.index))
    const n = others.length
    const noKey = others.filter((r) => !r.keyOnRecord).length
    const keyNote = noKey > 0 ? ` (${noKey} with no key on record)` : ""
    let rest = ""
    if (n > 0 && exceptions.length === 0) {
        if (profileLabel) {
            rest = n === 1 ? `The one song is your usual ${profileLabel}${keyNote}.` : `All ${n} songs are your usual ${profileLabel}${keyNote}.`
        } else {
            rest = n === 1 ? "The one song has a chart." : `All ${n} songs have charts.`
        }
    } else if (n > 0) {
        if (profileLabel) {
            rest = `Everything else is your usual ${profileLabel}, ${n} ${n === 1 ? "song" : "songs"}${keyNote}.`
        } else {
            rest = `${n} other ${n === 1 ? "song has a chart" : "songs have charts"}.`
        }
    }

    // Said first: an existing setlist and notices. Then the row exceptions: all of them up to
    // READBACK_VOICE_MAX, else a count, the first few, and an offer of the rest (MCP-20).
    // Open items are always said.
    const say = (e: ReadbackItem) => spoken(e.voice ?? e.text)
    const said = exceptions.slice(0, leading).map(say)
    const rowItems = exceptions.slice(leading, rowExceptions)
    if (rowItems.length <= READBACK_VOICE_MAX) {
        said.push(...rowItems.map(say))
    } else {
        const n = rowItems.length
        const noun = rowItems.every((e) => e.kind === "open_slot") ? "open slots" : "things to check"
        const first = rowItems.slice(0, READBACK_VOICE_FIRST)
        said.push(`${NUMBER_WORDS[n] ?? String(n)} ${noun}. First ${NUMBER_WORDS[first.length].toLowerCase()}:`)
        said.push(...first.map(say))
        said.push("Want the rest?")
    }
    for (const e of exceptions.slice(rowExceptions)) said.push(say(e))
    const text = [headline, ...said, rest].filter((s) => s.length > 0).join(" ")

    return { headline, exceptions, rest, text }
}
