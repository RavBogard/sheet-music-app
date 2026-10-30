import { getBook } from "@/lib/books/registry"
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
}

export interface OpenItem {
    id: string
    text: string
    trackId: string | null
    createdAt: string
    createdByName: string
}

export interface ReadbackItem {
    kind: "open_slot" | "no_chart" | "differs" | "recent_standard" | "promotion" | "open_item"
    index: number | null
    text: string
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
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
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

    const parts = [profileLabel ?? input.title ?? null, monthDay(input.date), bookTitle(input.book)].filter((p): p is string => !!p)
    let headline = parts.length > 0 ? `${parts.join(", ")}.` : ""
    if (input.special) {
        headline = `${headline} Marked special: changes are for this week only.`.trim()
    }

    const exceptions: ReadbackItem[] = []
    const listed = new Set<number>()
    for (const r of rows) {
        if (!r.isSong) continue
        const before = exceptions.length
        if (r.tier && OPEN_TIERS.has(r.tier)) {
            exceptions.push({ kind: "open_slot", index: r.index, text: `${r.label}: ${r.phrase ?? ""}`.trim() })
        } else if (!r.hasChart) {
            exceptions.push({ kind: "no_chart", index: r.index, text: `${r.label}: no chart yet` })
        } else if (r.differs) {
            exceptions.push({ kind: "differs", index: r.index, text: `${r.label}: ${r.differs}` })
        }
        if (r.tier === "standard" && r.standing && isRecent(r.standing.at, now)) {
            const since = monthDay(r.standing.at)
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

    // The cap is for row exceptions; open items are always said.
    const said = exceptions.slice(0, Math.min(rowExceptions, READBACK_VOICE_MAX)).map((e) => spoken(e.text))
    const more = rowExceptions - READBACK_VOICE_MAX
    if (more > 0) said.push(`And ${more} more on screen.`)
    for (const e of exceptions.slice(rowExceptions)) said.push(spoken(e.text))
    const text = [headline, ...said, rest].filter((s) => s.length > 0).join(" ")

    return { headline, exceptions, rest, text }
}
