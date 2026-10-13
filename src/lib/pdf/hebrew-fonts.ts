/**
 * Loads the vendored Alef TTFs (Latin + Hebrew, SIL OFL 1.1 — fonts/OFL.txt)
 * for PDFs that print Hebrew.
 *
 * The bytes live in generated base64 modules (fonts/alef-*.ts, regenerate with
 * fonts/generate-font-modules.mjs) rather than being read with fs at runtime:
 * an import()ed module is traced into whichever serverless function renders
 * the sheet (today /api/mcp) with no next.config outputFileTracingIncludes
 * entry. The import is dynamic and only reached on the Hebrew path, so an
 * English-only render never loads the ~240 KB of base64.
 */

export interface AlefFontBytes {
    regular: Uint8Array
    bold: Uint8Array
}

let cache: Promise<AlefFontBytes> | null = null

function decode(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"))
}

export function loadAlefFonts(): Promise<AlefFontBytes> {
    if (!cache) {
        cache = Promise.all([import("./fonts/alef-regular"), import("./fonts/alef-bold")])
            .then(([r, b]) => ({
                regular: decode(r.ALEF_REGULAR_B64),
                bold: decode(b.ALEF_BOLD_B64),
            }))
            .catch((err) => {
                cache = null
                throw err
            })
    }
    return cache
}
