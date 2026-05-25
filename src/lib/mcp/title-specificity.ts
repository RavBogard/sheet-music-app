/**
 * Deterministic title specificity scorer (W-02 trust-calibration).
 *
 * Produces a 0..1 score expressing how unambiguously a chart title points to
 * one specific piece of music. The agent uses this score (via the
 * `STOP_AND_ASK_THRESHOLD`) to decide when to commit-and-flag a bond vs.
 * stop and ask the rabbi.
 *
 * The scoring rule is fully deterministic — no ML, no learned weights.
 * Inputs are the title string and the number of catalog entries sharing the
 * same normalized stem.
 *
 * See `.paul/research/w-plans/W-002-trust-calibration.md` §2 for the rule.
 */

/**
 * Hebrew liturgical pieces known to have multiple arrangement variants in
 * Reform-Jewish music libraries. When a title's normalized stem matches one
 * of these, specificity drops -0.3 — a bare "Hashkivenu" with no
 * arrangement disambiguator is the canonical low-specificity case.
 *
 * Add an entry by submitting a one-line PR; the list lives in code (vs. a
 * Firestore doc) because edits are quarterly at most and code-versioning
 * makes diffs reviewable. Stems are pre-normalized (lowercase, spaces).
 */
export const GENERIC_LITURGICAL_STEMS: readonly string[] = [
    "hashkivenu",
    "veshamru",
    "v'shamru",
    "mi chamocha",
    "oseh shalom",
    "adon olam",
    "niggun",
    "shalom rav",
    "lecha dodi",
    "yedid nefesh",
    "modeh ani",
    "kaddish",
    "v'ahavta",
    "vahavta",
    "eitz chayim",
    "halleluyah",
    "hallelujah",
    "ahavat olam",
    "sim shalom",
    "hineni",
    "shehecheyanu",
    "kiddush",
    "motzi",
    "hamotzi",
    "barchu",
    "shema",
    "avot",
    "g'vurot",
    "kedushah",
    "yotzer or",
    "ma'ariv aravim",
    "maariv aravim",
    "ahava raba",
    "ahavah raba",
    "mourner's kaddish",
    "kaddish yatom",
    "tzur yisrael",
    "hineh ma tov",
    "hineh mah tov",
]

/**
 * Specificity threshold below which the agent should stop and confirm
 * before bonding. Single source of truth — any downstream consumer that
 * needs to gate on confidence (W-01 propose tools, agent-side instructions)
 * imports this constant rather than hard-coding 0.5.
 *
 * Calibration plan: re-tune after the first 4 weeks of real use. If
 * flag-rate is >40% of bonds, tighten to 0.4; if wrong bonds still slip
 * through, loosen to 0.6.
 */
export const STOP_AND_ASK_THRESHOLD = 0.5

/**
 * Normalize a title to its comparison stem:
 *  - NFKD + strip combining diacritics (fold "Hashkīvēnu" → "hashkivenu")
 *  - lowercase
 *  - collapse runs of underscore / whitespace / hyphen to single space
 *  - drop punctuation that isn't a word boundary
 *  - trim
 *
 * Output is used to (a) test against GENERIC_LITURGICAL_STEMS, (b) group
 * library_index rows for sibling counting, (c) key into titleContextHints.
 * Stays in sync with the search-side normalizer in
 * `src/lib/mcp/tools/library.ts` (L-003) — both fold the same characters
 * so a normalized stem here matches a normalized search query there.
 */
export function normalizeStem(title: string): string {
    return title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // strip combining diacritics
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ") // unify token separators
        .replace(/[^\p{L}\p{N} '’]/gu, "") // drop punctuation, keep apostrophes
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Trailing media file extensions that get stripped before bare-stem
 * computation. Chart titles often arrive with these baked into the name
 * (`Hodu (Silver).pdf`, `V'Shamru.musicxml`, `Adon Olam.mp3`) but the
 * extension is packaging, not part of the canonical stem — pinning it as
 * a known set keeps the sibling-recount equality lookup stable across
 * Drive/Storage/scrape ingest paths that may or may not preserve the
 * extension in the `name` field.
 *
 * Case-insensitive. Only the TRAILING extension is stripped (no `g`
 * flag) — a `song.pdf.pdf` input strips one extension, normalizeStem
 * folds the inner period away.
 *
 * Extend by adding a token; downstream parity test
 * (`src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`)
 * will catch any drift from the mirror at
 * `scripts/lib/index-name-fields-compute.mjs`.
 */
export const STRIPPABLE_EXTENSION_RE =
    /\.(pdf|musicxml|xml|mxl|jpg|png|webp|mp3|m4a|wav)$/i

/**
 * Strip the parenthesized clarifier portion (and anything after a hyphen-
 * separator composer pattern) so the stem reflects just the core liturgy
 * name. Used by the generic-stem check so "Hashkivenu (Klepper-Freelander)"
 * still tests against the generic "hashkivenu" stem (and still earns the
 * -0.3 penalty), and so the +0.2 unique-clarifier bonus stacks correctly.
 *
 * Also strips a trailing media extension (`.pdf`, `.musicxml`, `.mp3`, …)
 * BEFORE the parens/hyphen drop, so ingest paths that preserve the
 * extension in `name` (Drive sync, some scrape paths) produce the same
 * stem as paths that strip it upstream. See STRIPPABLE_EXTENSION_RE.
 *
 * EXPORTED — `library_index` write path stores this as a `stem` field at
 * upload time so the sibling-recount query is a single equality lookup
 * (`stem == myStem`) rather than a fuzzy join. Two entries share a stem
 * iff they're arrangement variants of the same liturgical piece.
 */
export function bareStem(title: string): string {
    // strip trailing media extension (single match; case-insensitive)
    const withoutExtension = title.replace(STRIPPABLE_EXTENSION_RE, "")
    // drop parenthesized clarifier(s)
    const withoutParens = withoutExtension.replace(/\([^)]*\)/g, "").trim()
    // drop hyphen-composer suffix: "Eitz Chayim - Weisenberg" → "Eitz Chayim"
    const withoutComposer = withoutParens.split(/\s+-\s+/)[0] ?? withoutParens
    return normalizeStem(withoutComposer)
}

interface SpecificityFeatures {
    hasParens: boolean
    hasHyphenComposer: boolean
    bareStemIsGeneric: boolean
    siblingsInCatalog: number
    tokenCount: number
    isLowEffortLooking: boolean
}

function extractFeatures(title: string, siblingsInCatalog: number): SpecificityFeatures {
    const trimmed = title.trim()
    const hasParens = /\([^)]+\)/.test(trimmed)
    const hasHyphenComposer = /\s+-\s+\S+/.test(trimmed)
    const bareStemIsGeneric = GENERIC_LITURGICAL_STEMS.includes(bareStem(trimmed))
    const normalized = normalizeStem(trimmed)
    const tokenCount = normalized ? normalized.split(/\s+/).length : 0

    // Low-effort signal: ALL CAPS, all-lowercase-with-underscores, all-digit,
    // or matches plain [a-z0-9_]+ (no real wording).
    const original = trimmed
    const isAllCaps = original.length >= 3 && original === original.toUpperCase() &&
        /[A-Z]/.test(original) && !/[a-z]/.test(original)
    const isUnderscoreLowercase = /^[a-z0-9_]+$/.test(original) && original.includes("_")
    const isLowEffortLooking = isAllCaps || isUnderscoreLowercase

    return {
        hasParens,
        hasHyphenComposer,
        bareStemIsGeneric,
        siblingsInCatalog,
        tokenCount,
        isLowEffortLooking,
    }
}

/**
 * Compute a 0..1 specificity score for a chart title.
 *
 * Base 0.5. Then deterministic adjustments per W-02 §2:
 *   +0.2  if title has a parenthesized clarifier — "Foo (Composer)"
 *   +0.2  if title has hyphen-composer pattern — "Foo - Composer"
 *   -0.3  if bare stem matches GENERIC_LITURGICAL_STEMS
 *   +0.2  if siblingsInCatalog === 1 (unique normalized stem)
 *   -0.2  if siblingsInCatalog >= 2 (shared stem)
 *   +0.1  if normalized title has >=3 word tokens
 *   -0.1  if title is ALL CAPS, all-lowercase-with-underscore, or
 *         matches /^[a-z0-9_]+$/ (low-effort upload signal)
 *
 * Final score clamped to [0, 1] and rounded to 2 decimals.
 *
 * @param title — original title string as written in `library_index.name`.
 * @param siblingsInCatalog — count of non-orphaned `library_index` entries
 *   sharing the same `normalizeStem(title)`, INCLUDING the row this score
 *   is for. Pass 1 for the unique case.
 */
export function titleSpecificity(title: string, siblingsInCatalog: number): number {
    if (!title || !title.trim()) return 0
    const safeSiblings = Math.max(1, Math.floor(siblingsInCatalog))
    const f = extractFeatures(title, safeSiblings)

    let score = 0.5
    if (f.hasParens) score += 0.2
    if (f.hasHyphenComposer) score += 0.2
    if (f.bareStemIsGeneric) score -= 0.3
    if (f.siblingsInCatalog === 1) score += 0.2
    else if (f.siblingsInCatalog >= 2) score -= 0.2
    if (f.tokenCount >= 3) score += 0.1
    if (f.isLowEffortLooking) score -= 0.1

    const clamped = Math.min(1, Math.max(0, score))
    return Math.round(clamped * 100) / 100
}
