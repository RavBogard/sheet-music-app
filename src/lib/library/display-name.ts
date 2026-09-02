/**
 * The ONE path both library read surfaces use to render a row's name
 * (R-0902-live-cw-1 §2).
 *
 * `library_index.name` is the raw Drive filename; the old `songs.title` was a
 * cleaned copy of it. Search used to read the cleaned copy and the browse the
 * raw one, so the two surfaces disagreed — the defect R-0901-live-cw-4 §5
 * repaired by pointing both at `library_index`. Both then showed the file
 * extension, and the extension is packaging, not part of the song's name.
 *
 * Ruled: hide it at DISPLAY, from one shared path, with no stored name
 * rewritten. A second, parallel stripper would rebuild the very divergence §5
 * closed, so every surface that renders a library name calls this.
 *
 * Display-side only. The extension stays **matchable**: callers strip when
 * they render, never when they filter, so a query for `Hashkivenu.pdf` still
 * finds the row.
 *
 * Kept dependency-free so it bundles into client components, same constraint
 * as `junk-filter.ts`.
 */

/**
 * Extensions that are packaging on a chart row. Deliberately a closed set, not
 * "any trailing dot-token": library names carry real dots (`Ps. 23`,
 * `V.2`, `Shalom Rav no. 2`) and a generic rule would eat them.
 */
const STRIPPABLE_DISPLAY_EXT = new Set([
    // chart bytes
    "pdf",
    "musicxml",
    "mxl",
    "xml",
    "txt",
    // images
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "heic",
    // audio / office — junk-filtered from consumer surfaces, but a row can
    // still surface via includeNonCharts on the hygiene paths.
    "mp3",
    "m4a",
    "wav",
    "aac",
    "flac",
    "ogg",
    "doc",
    "docx",
    "xls",
    "xlsx",
])

/**
 * The name a human should see for a library row. Strips one trailing media
 * extension; returns the input unchanged for anything else.
 */
export function libraryDisplayName(name: string | null | undefined): string {
    if (typeof name !== "string" || name.length === 0) return ""
    const m = name.match(/^(.+)\.([A-Za-z0-9]+)$/)
    if (!m) return name
    const [, stem, ext] = m
    // A leading-dot name (".hidden") has no stem to keep — leave it whole so
    // dotfiles stay recognisable to the hygiene surfaces that surface them.
    if (stem.trim().length === 0) return name
    return STRIPPABLE_DISPLAY_EXT.has(ext.toLowerCase()) ? stem : name
}
