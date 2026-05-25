/**
 * Pure-JS mirror of `src/lib/library/recompute-index-name-fields.ts` (and its
 * dep `src/lib/mcp/title-specificity.ts`) — used by
 * `scripts/backfill-library-normalizedname.mjs` to compute the four W-02
 * derivative fields (nameLower / normalizedName / stem / titleSpecificity)
 * without pulling the Next.js path-alias / TS toolchain into the .mjs ops
 * script.
 *
 * ★ MUST STAY IN SYNC with the canonical TS at
 *   `src/lib/library/recompute-index-name-fields.ts` +
 *   `src/lib/mcp/title-specificity.ts`.
 *
 * Parity is enforced by
 *   `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`
 * which imports BOTH this mirror AND the canonical TS helper, asserting
 * byte-for-byte equality on a fixture covering every branch (generic stem,
 * paren clarifier, hyphen-composer, ALL-CAPS, underscore-lowercase, multi-
 * token, sibling counts 1/2/5).
 *
 * If you edit the canonical TS, edit this mirror in the same commit + run
 * the parity vitest. If the parity test goes red, this file (or the TS) has
 * drifted — fix here, not by relaxing the test.
 *
 * The exported function shape matches `recomputeIndexNameFields(title,
 * siblingsInCatalog) → {nameLower, normalizedName, stem, titleSpecificity}`.
 */

// ---------- title-specificity.ts mirror ----------

export const GENERIC_LITURGICAL_STEMS = [
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

export const STOP_AND_ASK_THRESHOLD = 0.5

export function normalizeStem(title) {
    return title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // strip combining diacritics
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ")
        .replace(/[^\p{L}\p{N} '’]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
}

// Mirror of STRIPPABLE_EXTENSION_RE in src/lib/mcp/title-specificity.ts.
// Strip a trailing media extension before parens/hyphen drop so ingest
// paths that preserve the extension in `name` produce the same stem as
// paths that strip it upstream. Single trailing match (no /g flag).
const STRIPPABLE_EXTENSION_RE =
    /\.(pdf|musicxml|xml|mxl|jpg|png|webp|mp3|m4a|wav)$/i

export function bareStem(title) {
    const withoutExtension = title.replace(STRIPPABLE_EXTENSION_RE, "")
    const withoutParens = withoutExtension.replace(/\([^)]*\)/g, "").trim()
    const withoutComposer = withoutParens.split(/\s+-\s+/)[0] ?? withoutParens
    return normalizeStem(withoutComposer)
}

function extractFeatures(title, siblingsInCatalog) {
    const trimmed = title.trim()
    const hasParens = /\([^)]+\)/.test(trimmed)
    const hasHyphenComposer = /\s+-\s+\S+/.test(trimmed)
    const bareStemIsGeneric = GENERIC_LITURGICAL_STEMS.includes(bareStem(trimmed))
    const normalized = normalizeStem(trimmed)
    const tokenCount = normalized ? normalized.split(/\s+/).length : 0

    const original = trimmed
    const isAllCaps =
        original.length >= 3 &&
        original === original.toUpperCase() &&
        /[A-Z]/.test(original) &&
        !/[a-z]/.test(original)
    const isUnderscoreLowercase =
        /^[a-z0-9_]+$/.test(original) && original.includes("_")
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

export function titleSpecificity(title, siblingsInCatalog) {
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

// ---------- recompute-index-name-fields.ts mirror ----------

/**
 * Compute the four W-02 derivative fields for a `library_index` row.
 *
 * @param {string} title — canonical title (already trimmed by caller per
 *   `normalizeChartTitle`); helper does no further trimming.
 * @param {number} siblingsInCatalog — count of non-orphaned `library_index`
 *   rows sharing `bareStem(title)`, **including** the row being written.
 *   Pass 1 for the unique-stem case.
 * @returns {{nameLower: string, normalizedName: string, stem: string, titleSpecificity: number}}
 */
export function recomputeIndexNameFields(title, siblingsInCatalog) {
    const nameLower = title.toLowerCase()
    // Strip trailing media extension BEFORE alphanumeric collapse (mirror
    // of the canonical TS helper post 2026-05-25 normalizedname-pin lane).
    const normalizedName = nameLower
        .replace(STRIPPABLE_EXTENSION_RE, "")
        .replace(/[^a-z0-9]/g, "")
    const stem = bareStem(title)
    return {
        nameLower,
        normalizedName,
        stem,
        titleSpecificity: titleSpecificity(title, siblingsInCatalog),
    }
}
