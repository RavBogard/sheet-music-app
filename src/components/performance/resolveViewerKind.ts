import type { SetlistTrack, DriveFile } from "@/types/models"

/**
 * The viewer kinds that PDFOverlay can render today. Returned by
 * {@link resolveViewerKind}.
 *
 * `'unknown'` is an explicit terminal — when the `library_index` row
 * carries a positive but unrecognized signal (e.g., a `.docx` bond or a
 * `mimeType` we don't render), PDFOverlay surfaces a "Can't render this
 * file type yet" message instead of silently falling through to
 * `PDFViewer` and 404ing on a non-PDF byte payload (the Adon Olam
 * shape; see `.paul/research/audio-render-type-discriminator/FINDINGS.md`).
 *
 * Bare Drive IDs / `upload-{uuid}` ids without any extension or mimetype
 * info do NOT return `'unknown'` — they default to `'pdf'` to preserve
 * the historical bind behavior; every legacy Drive bond that pre-dates
 * mimeType persistence relies on this default.
 */
export type ViewerKind =
    | "pdf"
    | "audio"
    | "text"
    | "musicxml"
    | "image"
    | "chordpro"
    | "unknown"

const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i
const MUSICXML_EXT = /\.(musicxml|xml|mxl)$/i
const IMAGE_EXT = /\.(png|jpe?g|heic|heif|webp)$/i
const TEXT_EXT = /\.txt$/i
const CHORDPRO_EXT = /\.(cho|chordpro|crd|chopro)$/i
const PDF_EXT = /\.pdf$/i
/** A "looks like it has an extension" probe — used only to detect the
 *  positively-unrecognized case (e.g., `.docx`). Independent of the
 *  KIND-specific regexes above so adding a new ext to one doesn't
 *  silently change the unknown-detection behavior. */
const EXTENSION_LIKE = /\.[a-z0-9]{1,8}$/i

function isPresent(s: string | undefined | null): s is string {
    return typeof s === "string" && s.length > 0
}

/** Map a mimeType (e.g. `application/pdf`) to a viewer kind. */
function kindFromMimeType(mt: string | undefined | null): ViewerKind | null {
    if (!isPresent(mt)) return null
    const lower = mt.toLowerCase()
    if (lower.startsWith("audio/")) return "audio"
    if (lower.startsWith("image/")) return "image"
    if (lower === "application/pdf") return "pdf"
    if (lower === "application/x-chordpro" || lower.endsWith("chordpro")) return "chordpro"
    if (lower.startsWith("text/")) return "text"
    if (lower.includes("xml") || lower === "application/vnd.recordare.musicxml+xml") return "musicxml"
    // `application/octet-stream` deliberately falls through here — it's the
    // documented MusicXML weak link (per [[project_musicxml_goal]]) and we
    // want the next priority tier (filename extension) to take over.
    return null
}

/** Map a filename / id string to a viewer kind based purely on extension. */
function kindFromExtension(s: string | undefined | null): ViewerKind | null {
    if (!isPresent(s)) return null
    const lower = s.toLowerCase()
    // db- prefix is the legacy MusicXML-from-Firestore handle used by
    // SmartScoreViewer's IDB-resolve path; matches the existing
    // `toQueueItem` convention.
    if (lower.startsWith("db-")) return "musicxml"
    if (AUDIO_EXT.test(lower)) return "audio"
    if (MUSICXML_EXT.test(lower)) return "musicxml"
    if (IMAGE_EXT.test(lower)) return "image"
    if (CHORDPRO_EXT.test(lower)) return "chordpro"
    if (TEXT_EXT.test(lower)) return "text"
    if (PDF_EXT.test(lower)) return "pdf"
    return null
}

/**
 * Resolve the viewer kind for a setlist track + its (optional) cached
 * library_index row.
 *
 * Priority — highest authority first — so a stamped `mimeType` always wins
 * over a filename guess, and a filename always wins over an id guess. See
 * `.paul/research/audio-render-type-discriminator/FINDINGS.md` for why each
 * tier exists (and which legacy bind path it covers):
 *
 *   1. `libraryRow.mimeType` — written by picker + MCP post-2026-05-20.
 *   2. `libraryRow.name` extension — survives even when `mimeType` is
 *      `application/octet-stream` (the MusicXML weak link).
 *   3. `track.mimeType` — v70-01-01 Task 4 cached value.
 *   4. `track.fileName` extension — only present on a subset of bind paths.
 *   5. `track.fileId` extension — only present on raw-name uploads.
 *   6. Terminal — `'unknown'` ONLY when the library_index row carried a
 *      positive but unrecognized signal (e.g. `.docx`); otherwise `'pdf'`,
 *      the legacy default for bare Drive IDs and `upload-{uuid}` ids that
 *      have no extension and no library_index hydration yet.
 *
 * Notably, the track row's `type` ("song" / "prayer" / etc.) is a SEMANTIC
 * label and is NOT consulted — a `type:"song"` track bonded to an `.mp3`
 * still routes to AudioViewer.
 */
export function resolveViewerKind(
    track: Pick<SetlistTrack, "fileId" | "fileName" | "mimeType"> | null | undefined,
    libraryRow: Pick<DriveFile, "name" | "mimeType"> | null | undefined,
): ViewerKind {
    if (!track) return "unknown"

    const fromLibraryMime = kindFromMimeType(libraryRow?.mimeType)
    if (fromLibraryMime) return fromLibraryMime

    const fromLibraryName = kindFromExtension(libraryRow?.name)
    if (fromLibraryName) return fromLibraryName

    const fromTrackMime = kindFromMimeType(track.mimeType)
    if (fromTrackMime) return fromTrackMime

    const fromTrackName = kindFromExtension(track.fileName)
    if (fromTrackName) return fromTrackName

    const fromTrackId = kindFromExtension(track.fileId)
    if (fromTrackId) return fromTrackId

    // Nothing matched. Distinguish "positively unrecognized" (the
    // library_index row says this is something, but it's not something we
    // can render — `.docx`, `application/x-weird`) from "no info at all"
    // (bare Drive ID / `upload-{uuid}` with no extension; the legacy
    // shape every pre-mimeType bond produces).
    const libMimeKnown = isPresent(libraryRow?.mimeType) // present-but-unmapped
    const libNameHasExt = isPresent(libraryRow?.name) && EXTENSION_LIKE.test(libraryRow.name)
    if (libMimeKnown || libNameHasExt) return "unknown"

    return "pdf"
}
