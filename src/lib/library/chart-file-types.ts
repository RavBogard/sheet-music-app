/**
 * Shared chart file-type table.
 *
 * Pure TypeScript, zero Node/Firebase imports — this module is imported by
 * both server-side upload pipelines (`processChartUpload` and friends) AND
 * a browser bundle (the batch-intake picker UI), so it must stay safe to
 * ship to the client: no `server-only`, no `fs`, no Firebase Admin SDK.
 *
 * Extension → mime mapping mirrors the historical `ALLOWED_TYPES` table in
 * `src/lib/library-upload.ts` for every extension the two tables share
 * (pdf/png/jpg/jpeg/heic/heif/xml/musicxml/mxl/mscz/mscx/txt) — this module
 * does not replace that table, it is the new shared source batch-intake
 * code (server + browser) imports going forward.
 */

export const CHART_EXT_TO_MIME: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".xml": "application/xml",
    ".musicxml": "application/vnd.recordare.musicxml+xml",
    ".mxl": "application/vnd.recordare.musicxml",
    ".mscz": "application/x-musescore",
    ".mscx": "application/x-musescore+xml",
    ".txt": "text/plain",
}

/** `Object.keys(CHART_EXT_TO_MIME)` — kept as a named export for callers
 * that just want the accepted extension list (e.g. a file-picker `accept`
 * attribute) without importing the full mapping. */
export const ACCEPTED_CHART_EXTENSIONS: string[] = Object.keys(CHART_EXT_TO_MIME)

/** Every mime value the table maps to, for the "reportedMime is already an
 * accepted value" branch of `resolveChartMime`. */
const ACCEPTED_MIME_VALUES = new Set(Object.values(CHART_EXT_TO_MIME))

/**
 * Lowercase file extension including the leading dot (e.g. "Chart.PDF" →
 * ".pdf"). Returns "" when the filename has no extension (or is a dotfile
 * with nothing before the leading dot, e.g. ".gitignore").
 */
export function extOf(fileName: string): string {
    const lower = fileName.toLowerCase()
    const idx = lower.lastIndexOf(".")
    if (idx <= 0) return ""
    return lower.slice(idx)
}

/**
 * Resolve the mime type to trust for a chart upload.
 *
 * - `reportedMime` wins as-is when it is already one of `CHART_EXT_TO_MIME`'s
 *   values (a real, specific, accepted mime) — even if the filename's
 *   extension disagrees or is absent.
 * - Otherwise (reportedMime is empty/null/undefined, "application/octet-stream",
 *   or an unrecognized value) falls back to resolving a mime from the
 *   filename's extension via `CHART_EXT_TO_MIME`.
 * - Returns null when neither resolves — an unsupported file.
 */
export function resolveChartMime(
    fileName: string,
    reportedMime?: string | null,
): string | null {
    if (reportedMime && ACCEPTED_MIME_VALUES.has(reportedMime)) {
        return reportedMime
    }
    const ext = extOf(fileName)
    return CHART_EXT_TO_MIME[ext] ?? null
}

/** True when `resolveChartMime` resolves to a mime for this file. */
export function isAcceptedChartFile(
    fileName: string,
    reportedMime?: string | null,
): boolean {
    return resolveChartMime(fileName, reportedMime) !== null
}
