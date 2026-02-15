/**
 * Shared chord detection utilities.
 *
 * The chord regex and detection logic was previously duplicated in:
 * - text-scanner.ts (client-side, scans PDF text layers)
 * - pdf-chord-extractor.ts (server-side, extracts chords from PDFs)
 *
 * Now both import from this shared module.
 */

/**
 * Regex for matching chord symbols commonly found in lead sheets.
 * Handles: A-G root notes, sharps/flats, qualities (m, maj, dim, aug, sus, add),
 * extensions (7, 9, 11, 13), alterations in parens, and slash bass notes.
 */
export const CHORD_REGEX = /^[A-G][b#]?(?:m|min|maj|dim|aug|sus|add|M|no|alt|dom)?(?:\d{0,2})?(?:(?:sus|add|no|maj|min|dim|aug|dom)\d{0,2})*(?:\([^)]*\))?(?:\/[A-G][b#]?)?$/

/**
 * Words that match the chord regex but aren't actually chords.
 * Note: "A" is NOT excluded — in a music chart app, uppercase "A"
 * in the text layer is virtually always A major. Lowercase "a"
 * (the English article) won't match the chord regex anyway.
 * Roman numerals appear as section markers in lead sheets.
 */
export const EXCLUDED_WORDS = new Set([
    "I", "II", "III", "IV", "V", "VI", "VII",
    "D.C", "D.S", "Fine", "Coda",
    "Da", "Dal",  // D.C./D.S. fragments
])

/**
 * Section markers that appear in lead sheets and should not be treated as chords.
 */
export const SECTION_MARKERS = new Set([
    "Verse", "Chorus", "Bridge", "Intro", "Outro", "Tag",
    "Pre", "Post", "Interlude", "Solo", "Ending", "Coda",
    "Refrain", "Hook", "Turnaround", "Vamp",
    "V1", "V2", "V3", "V4", "Ch", "Br",
    "DC", "DS", "CODA", "FINE",  // Uppercase variants from PDF scores
])

/**
 * Tests whether a text string represents a chord symbol.
 * Normalizes Unicode accidentals and cleans non-chord characters before testing.
 */
export function isChord(text: string): boolean {
    // First normalize Unicode sharp/flat to ASCII
    let clean = text.replace(/\u266F/g, "#").replace(/\u266D/g, "b")
    // Then strip remaining non-chord characters
    clean = clean.replace(/[^\w#b\/]/g, "")
    if (!clean) return false
    if (EXCLUDED_WORDS.has(clean)) return false
    if (SECTION_MARKERS.has(clean)) return false
    if (clean.length > 10) return false
    return CHORD_REGEX.test(clean)
}

/**
 * Cleans a chord string by normalizing Unicode sharp/flat symbols
 * and removing non-chord characters.
 */
export function cleanChordText(text: string): string {
    let clean = text.replace(/\u266F/g, "#").replace(/\u266D/g, "b")
    clean = clean.replace(/[^\w#b\/]/g, "")
    return clean
}
