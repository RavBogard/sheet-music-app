/**
 * v11.5-05-02 (Q5): strip a stray chart/document file extension from a title for
 * DISPLAY on consumer surfaces. Pure + dependency-free (client-safe) — no React,
 * no firebase. Anchored to a known extension set so a mid-title dot
 * ("Lecha Dodi (v2)") and a legitimate trailing word are preserved; only a real
 * trailing chart/doc/image extension is removed. Idempotent.
 *
 * Used at render time (e.g. SetlistRow) because some write paths (MCP, legacy
 * upload, .docx imports) stored the raw filename — including the extension — as
 * the track title. This is display-only; it does NOT mutate stored data.
 */
const TRAILING_CHART_EXT_RE =
    /\.(pdf|docx?|musicxml|mxl|xml|txt|rtf|pages|png|jpe?g|webp)$/i

export function displayChartTitle(name: unknown): string {
    if (typeof name !== "string") return ""
    return name.replace(TRAILING_CHART_EXT_RE, "").trim()
}
