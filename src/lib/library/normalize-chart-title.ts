/**
 * Canonical title-normalization helper for every `library_index.name`
 * write boundary.
 *
 * Cycle-3 REG-001 added an outer `.trim()` to `processChartUpload`'s
 * final title. Cycle-4 cowork (C4-007) found two additional write
 * sites that bypassed that boundary and persisted leading-whitespace
 * names (" Ana B_Koach" / " Ana B_Koach.pdf"):
 *
 *   1. `POST /api/setlists/import/execute` — legacy setlist-importer
 *      writes a fresh `library_index/{newLibraryId}` row directly
 *      from `item.title` without trimming, then sets `track.fileName`
 *      to the same untrimmed value.
 *   2. `acceptEnrichment` — copies Gemini's `suggested_title` onto the
 *      row's `name` + `nameLower` without trimming.
 *
 * Both sites fork the dedupe bucket (`nameLower` / `normalizedName`
 * diverge from the whitespace-clean variant) and cause the chart-bind
 * picker to show two copies of the same chart.
 *
 * Rule: every site that writes `library_index.name` MUST run its raw
 * input through `normalizeChartTitle` first. The helper also collapses
 * internal whitespace runs (incl. NBSP U+00A0 — `\s` in JS regex
 * matches it) so " Ana  B'Koach" and "Ana B'Koach" land in the same
 * dedupe bucket.
 */

/**
 * Trim outer whitespace and collapse internal runs of whitespace to
 * a single space. Returns the normalized title; the caller decides
 * what to do with empty strings.
 *
 * Idempotent — re-running on an already-normalized title is a no-op.
 */
export function normalizeChartTitle(raw: string): string {
    return raw.replace(/\s+/g, " ").trim()
}
