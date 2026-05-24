/**
 * Wave-2 ingest-mutator-matrix F-7 — shared helper that recomputes the
 * five W-02 trust-calibration fields any time a `library_index` row's
 * `name` is mutated.
 *
 * The five fields a fresh upload writes (per `processChartUpload` at
 * `src/lib/library-upload.ts:540-545`) are:
 *
 *   1. `name`               — the canonical chart title (caller writes)
 *   2. `nameLower`          — `name.toLowerCase()`
 *   3. `normalizedName`     — alphanumeric-only lowercase form
 *   4. `stem`               — `bareStem(name)` (drops parens + composer)
 *   5. `titleSpecificity`   — 0..1 ranking signal derived from name + sibling count
 *
 * Pre-F-7, two post-upload write channels (`/api/library/rename` PATCH +
 * `editEnrichment` title-branch) skipped some or all of fields 2-5,
 * which makes PCU's exact + fuzzy dedup blind to the renamed row on
 * any subsequent ingest. See FINDINGS.md §F-7 + FINDINGS-AUDIT.md §F-7.
 *
 * This helper is **pure compute over its inputs** — the caller does the
 * `library_index.where("stem", "==", stem)` sibling query under its own
 * auth context (rename = band_leader; editEnrichment = admin) and
 * passes the resulting count in. That keeps the helper auth-agnostic +
 * keeps the cross-doc read at the call site where the auth gate lives.
 *
 * The caller is responsible for writing `name: title` alongside the
 * four fields this helper returns — the helper intentionally does not
 * round-trip `name` since callers typically have it under a different
 * binding (e.g. `displayName` for rename, `update.name` for
 * editEnrichment) and the type would force a redundant spread.
 *
 * MUST STAY IN SYNC WITH `processChartUpload`'s inline compute at
 * `src/lib/library-upload.ts:384,392,522,545`. PCU's compute is
 * interspersed with its exact + fuzzy dedup branches (`nameLower`
 * feeds exact dedup, `normalizedName` feeds fuzzy dedup, `stem` feeds
 * sibling-recount), so the cleanest contract is: this helper is the
 * one-source-of-truth, PCU keeps its inline values, and a regression
 * test in `__tests__/recompute-index-name-fields.test.ts` asserts
 * byte-for-byte parity between the two. If PCU's inline compute
 * drifts, the parity test fails loudly.
 */

import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"

export interface IndexNameFields {
    nameLower: string
    normalizedName: string
    stem: string
    titleSpecificity: number
}

/**
 * Compute the four W-02 derivative fields for a `library_index` row.
 *
 * @param title — canonical title to write to `library_index.name`. Caller
 *   should already have run this through `normalizeChartTitle` (the
 *   leading-whitespace dedup gate) — this helper does no trimming.
 * @param siblingsInCatalog — count of non-orphaned `library_index` rows
 *   sharing `bareStem(title)`, **including** the row being written. Pass
 *   1 for the unique-stem case. Matches `processChartUpload`'s convention
 *   at `library-upload.ts:537`.
 */
export function recomputeIndexNameFields(
    title: string,
    siblingsInCatalog: number,
): IndexNameFields {
    const nameLower = title.toLowerCase()
    const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
    const stem = bareStem(title)
    return {
        nameLower,
        normalizedName,
        stem,
        titleSpecificity: titleSpecificity(title, siblingsInCatalog),
    }
}
