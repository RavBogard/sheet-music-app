/**
 * v11.7-05 — split a chart's display name into its title and an optional
 * composer/arrangement label carried in a TRAILING parenthetical.
 *
 * Charts in the library are named like `Hashkivenu (Klepper-Freelander)` — the
 * parenthetical is the arranger/composer disambiguator (the same token
 * `dedupeChartsByStem` preserves to keep distinct arrangements apart). The
 * library row mashes the whole string into one bold title; this helper lets the
 * row render the title as primary and the composer as a dimmed sub-label.
 *
 * Input is the ALREADY-CLEAN display name (caller passes `getCleanName` output —
 * extension + underscores already handled). This helper does NOT strip
 * extensions. Only the single trailing `(...)` group is treated as composer; an
 * inner parenthetical earlier in the title (e.g. `Adon Olam (fast)`) is left in
 * the title. An empty/whitespace-only parenthetical yields no composer.
 */
export function splitChartComposer(name: string): {
    title: string
    composer?: string
} {
    const raw = (name ?? "").trim()
    // Group 1: everything up to the trailing parenthetical (lazy).
    // Group 2: the contents of the LAST parenthetical, which must run to the
    // end of the string (no non-paren chars after it). `[^()]*` forbids nested
    // parens so only a flat trailing group matches.
    const match = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
    if (!match) {
        return { title: raw }
    }
    const title = match[1].trim()
    const composer = match[2].trim()
    // Sparse-safe: empty parens, or a parenthetical with no title before it,
    // fall back to the raw string as the title with no composer.
    if (!composer || !title) {
        return { title: raw }
    }
    return { title, composer }
}
