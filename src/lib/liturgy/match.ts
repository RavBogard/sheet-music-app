import { levenshteinDistance } from "@/lib/string-utils"
import { bareStem } from "@/lib/mcp/title-specificity"
import {
    foldLiturgyName,
    liturgyLookup,
    type LiturgyLookupEntry,
} from "./lookup"
import { confirmedUnbound } from "./confirmed"

/**
 * Match a row TITLE against the liturgy lookup for one book.
 *
 * Same shape as the setlist-import matcher (`src/lib/setlist-import/resolve.ts`):
 * fold the strings, score by Levenshtein similarity, refuse a short string that
 * is not an exact hit. The thresholds are the ones the BIND-NOT-ADD handoff
 * names — `clear >= 80`, `plausible >= 45` on a 0..100 scale — rather than
 * that file's single 0.82 cut, because binding has two outcomes (write it /
 * show Daniel the alternatives) where importing has one.
 *
 * WHY CONTAINMENT IS CAPPED. "Mi Shebeirach" is contained in "Mi Shebeirach —
 * Healing", and "Sh'ma" is contained in half the table. A containment hit is
 * real evidence but never enough to write a page onto a lectern sheet
 * unwatched, so it scores into the plausible band and stops there. Only an
 * exact fold, or a near-exact spelling, is allowed to bind silently.
 */

export const CLEAR_SCORE = 80
export const PLAUSIBLE_SCORE = 45

export interface LiturgyMatch {
    /** 0..100. 100 is an exact fold of a known spelling. */
    score: number
    entry: LiturgyLookupEntry
    /** The alias that produced the score — what to show Daniel. */
    via: string
    how: "exact" | "near" | "contains"
}

export interface LiturgyMatchResult {
    /** Best match at or above `CLEAR_SCORE`, safe to bind. */
    clear: LiturgyMatch | null
    /** Matches in [PLAUSIBLE_SCORE, CLEAR_SCORE), best first. Never bound. */
    plausible: LiturgyMatch[]
}

const MAX_PLAUSIBLE = 5
/** Below this a fold is too short for similarity to mean anything. */
const MIN_FUZZY_LENGTH = 3
/**
 * Below this a NEAR match is refused outright; only an exact fold binds.
 *
 * At five characters a single typo is a fifth of the string, which clears the
 * 80 line on arithmetic alone — and this vocabulary is full of short
 * near-homonyms that are genuinely different moments: `Shem` against `Shema`,
 * `Modeh` against `Modim`, `Hodu` against `Hoda-ah`. A long name can afford a
 * misspelling; a short one cannot.
 */
const MIN_NEAR_LENGTH = 6
/** A containment hit can never reach the clear band. See the note above. */
const CONTAINMENT_CEILING = 70
/**
 * A title stripped down to its stem, or one half of a compound, is evidence
 * about the whole title but weaker than the whole title matching outright.
 */
const COMPOUND_PENALTY = 5

function similarity(a: string, b: string): number {
    const max = Math.max(a.length, b.length)
    if (!max) return 0
    return 1 - levenshteinDistance(a, b) / max
}

/**
 * Is one name a run of whole WORDS inside the other?
 *
 * Containment is checked on tokens, never on characters. Character
 * containment says "Sh'ma" is inside "K'dushat HaShem" if you squint at it
 * the wrong way, and a page number is not something to squint at. Whole
 * words also give an honest strength: "Nishmat" is one word of the three in
 * "Nishmat Kol Chai", "Mi Shebeirach" is two of the three in "Mi Shebeirach
 * Healing", and the second really is the better evidence.
 */
function tokenRunCoverage(a: string, b: string): number | null {
    const at = a.split(" ").filter(Boolean)
    const bt = b.split(" ").filter(Boolean)
    if (!at.length || !bt.length) return null
    const [short, long] =
        at.length <= bt.length ? [at, bt] : [bt, at]
    const joined = ` ${long.join(" ")} `
    if (!joined.includes(` ${short.join(" ")} `)) return null
    return short.length / long.length
}

function scoreAgainst(folded: string, alias: string): LiturgyMatch["how"] | null {
    const target = foldLiturgyName(alias)
    if (!target) return null
    if (folded === target) return "exact"
    if (folded.length < MIN_FUZZY_LENGTH || target.length < MIN_FUZZY_LENGTH) {
        return null
    }
    if (
        folded.length >= MIN_NEAR_LENGTH &&
        target.length >= MIN_NEAR_LENGTH &&
        similarity(folded, target) * 100 >= CLEAR_SCORE
    ) {
        return "near"
    }
    if (tokenRunCoverage(folded, target) !== null) return "contains"
    return null
}

function valueOf(folded: string, alias: string, how: LiturgyMatch["how"]): number {
    if (how === "exact") return 100
    const raw = similarity(folded, foldLiturgyName(alias)) * 100
    if (how === "near") return Math.round(raw)
    // Containment: how much of the longer name the shorter one covers, in
    // whole words, floored at the plausible line and capped out of the clear
    // band. Every word-run hit is worth showing Daniel; none of them is worth
    // writing a page unwatched.
    const covered = tokenRunCoverage(folded, foldLiturgyName(alias)) ?? 0
    return Math.min(
        CONTAINMENT_CEILING,
        PLAUSIBLE_SCORE + Math.round((CONTAINMENT_CEILING - PLAUSIBLE_SCORE) * covered),
    )
}

function rank(book: string, title: string): LiturgyMatch[] {
    const folded = foldLiturgyName(title)
    if (!folded) return []

    const best = new Map<LiturgyLookupEntry, LiturgyMatch>()
    for (const entry of liturgyLookup(book)) {
        for (const alias of entry.aliases) {
            const how = scoreAgainst(folded, alias)
            if (!how) continue
            const score = valueOf(folded, alias, how)
            const current = best.get(entry)
            if (!current || score > current.score) {
                best.set(entry, { score, entry, via: alias, how })
            }
        }
    }

    return [...best.values()].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        // A booklet PAGE outranks a page-less entry at equal score. The
        // Saturday table carries "Birkat Kohanim" twice — the Amidah one,
        // which Daniel ruled Never and which the booklet does not print, and
        // the concluding one at p.100 that ends every CRC service. The printed
        // one is the one a row means.
        const af = typeof a.entry.folio === "number"
        const bf = typeof b.entry.folio === "number"
        if (af !== bf) return af ? -1 : 1
        // A confirmed row outranks a bare booklet entry: Daniel ruled on the
        // first and merely printed the second.
        if (a.entry.source !== b.entry.source) {
            return a.entry.source === "confirmed" ? -1 : 1
        }
        return a.entry.label.localeCompare(b.entry.label)
    })
}

/**
 * Did Daniel rule this spelling stays unbound?
 *
 * The strongest ruling on the page: he saw the candidate and said no. A
 * niggun, "Od Yavo Shalom Aleinu", "Mi Chamocha Ana B'Koach" — the last is
 * the reason the STEM is checked too, because stripping it to "Mi Chamocha"
 * is exactly the inference he refused. Nothing below re-derives a match he
 * has already declined.
 */
function isRuledUnbound(book: string, title: string): boolean {
    const unbound = confirmedUnbound(book)
    if (!unbound.size) return false
    if (unbound.has(foldLiturgyName(title))) return true
    const stem = bareStem(title)
    return !!stem && unbound.has(foldLiturgyName(stem))
}

/** Split a compound slot title: `Modeh Ani / Morning Blessings`. */
function compoundParts(title: string): string[] {
    const parts = title
        .split("/")
        .map((p) => p.trim())
        .filter((p) => foldLiturgyName(p).length >= MIN_FUZZY_LENGTH)
    return parts.length > 1 ? parts : []
}

function assemble(ranked: LiturgyMatch[]): LiturgyMatchResult {
    const top = ranked[0]
    // Ambiguity is not confidence. Two entries tied at the top of the clear
    // band on DIFFERENT pages is exactly the case where a silent bind would
    // print a wrong page for years, so both drop to plausible.
    const tiedOnAnotherPage =
        ranked.length > 1 &&
        ranked[1].score === top?.score &&
        ranked[1].entry.folio !== top?.entry.folio

    if (top && top.score >= CLEAR_SCORE && !tiedOnAnotherPage) {
        return {
            clear: top,
            plausible: ranked
                .slice(1)
                .filter((m) => m.score >= PLAUSIBLE_SCORE)
                .slice(0, MAX_PLAUSIBLE),
        }
    }
    return {
        clear: null,
        plausible: ranked
            .filter((m) => m.score >= PLAUSIBLE_SCORE)
            .slice(0, MAX_PLAUSIBLE),
    }
}

/**
 * Match one title. Returns at most one `clear` and up to five `plausible`.
 *
 * Never throws and never guesses: an empty or unusable title, or a book with
 * no table, comes back with nothing matched rather than with a default.
 *
 * COMPOUND TITLES. Several of the site's slots name two moments with a slash
 * — "Modeh Ani / Morning Blessings", "Adon Olam / Ein Keloheinu". When the
 * whole title matches nothing, each part is tried. If the parts agree on one
 * entry it binds (at a small penalty, because a part is weaker evidence than
 * the whole); if they land on DIFFERENT entries the row really is naming two
 * moments and nothing binds — that is Daniel's call, not a coin toss.
 */
export function matchLiturgyTitle(
    book: string,
    title: string,
): LiturgyMatchResult {
    const empty: LiturgyMatchResult = { clear: null, plausible: [] }
    if (typeof title !== "string") return empty
    if (!foldLiturgyName(title)) return empty
    if (isRuledUnbound(book, title)) return empty

    const whole = assemble(rank(book, title))
    if (whole.clear) return whole

    // A row's title here is very often a CHART FILE NAME — `Shema (major).pdf`,
    // `Barchu (walkdown)`, `Eitz Chayim - Weisenberg`. The extension is
    // packaging and the clarifier names an arrangement, and neither changes
    // which page of the booklet the congregation turns to. `bareStem` is the
    // repo's existing answer to exactly this (it is what `library_index`
    // stores), so reuse it rather than inventing a second normalizer that
    // would drift from it.
    const stem = bareStem(title)
    const stemmed = stem && foldLiturgyName(stem) !== foldLiturgyName(title)
        ? assemble(
              rank(book, stem).map((m) => ({
                  ...m,
                  score: Math.max(0, m.score - COMPOUND_PENALTY),
              })),
          )
        : null
    if (stemmed?.clear) return stemmed

    const parts = compoundParts(title)
    if (!parts.length) return stemmed ?? whole

    const byEntry = new Map<LiturgyLookupEntry, LiturgyMatch>()
    for (const part of parts) {
        for (const m of rank(book, part)) {
            const score = Math.max(0, m.score - COMPOUND_PENALTY)
            const current = byEntry.get(m.entry)
            if (!current || score > current.score) {
                byEntry.set(m.entry, { ...m, score })
            }
        }
    }
    for (const m of stemmed?.plausible ?? []) {
        const current = byEntry.get(m.entry)
        if (!current || m.score > current.score) byEntry.set(m.entry, m)
    }
    const ranked = [...byEntry.values()].sort((a, b) => b.score - a.score)
    const clearCount = ranked.filter((m) => m.score >= CLEAR_SCORE).length
    if (clearCount > 1) {
        return {
            clear: null,
            plausible: ranked
                .filter((m) => m.score >= PLAUSIBLE_SCORE)
                .slice(0, MAX_PLAUSIBLE),
        }
    }
    return assemble(ranked)
}
