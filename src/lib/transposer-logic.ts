// Regex for common chord patterns:
// Matches: A, Bb, F#m, G/B, Cmaj7, Ddim, E+
// We want to be strict to avoid detecting lyrics "The", "And" as chords.
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus[24])?(?:\/[A-G](?:#|b)?)?$/

// Nashville Number System Map
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS: { [key: string]: string } = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' }
const REVERSE_FLATS: { [key: string]: string } = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }

// Helper: Normalize note to Sharp (C#) for math
const toSemis = (note: string) => {
    // Handle flats
    if (FLATS[note]) note = FLATS[note]
    return NOTES.indexOf(note)
}

// Return new chord string transposed by N semitones
export function transposeChord(chord: string, semitones: number): string {
    const match = chord.match(/^([A-G](?:#|b)?)(.*)$/)
    if (!match) return chord

    const root = match[1]
    const suffix = match[2]

    let noteIndex = toSemis(root)
    if (noteIndex === -1) return chord

    let newIndex = (noteIndex + semitones) % 12
    if (newIndex < 0) newIndex += 12

    let newNote = NOTES[newIndex]

    // Simplified Flat logic: If original was flat, try to return flat if appropriate?
    // For now, let's stick to sharps/naturals unless we implement full key awareness.
    // MVP: If the original key was likely "Flat-heavy" (F, Bb, Eb), we should probably output flats.
    // For this beta, let's just use a simple lookup:
    // Prefer flats for: F (d-minor?), Bb (g-minor), Eb, Ab, Db

    // Quick Hack: If original was flat, maybe use flat for black keys?
    if (root.includes('b') && REVERSE_FLATS[newNote]) {
        newNote = REVERSE_FLATS[newNote]
    }

    // Handle Bass Note (Slash Chords like G/B)
    if (suffix.includes('/')) {
        const [rest, bass] = suffix.split('/')
        const bassIndex = toSemis(bass)
        if (bassIndex !== -1) {
            let newBassIndex = (bassIndex + semitones) % 12
            if (newBassIndex < 0) newBassIndex += 12
            let newBass = NOTES[newBassIndex]
            if (bass.includes('b') && REVERSE_FLATS[newBass]) {
                newBass = REVERSE_FLATS[newBass]
            }
            return `${newNote}${rest}/${newBass}`
        }
    }

    return newNote + suffix
}

export function identifyChords(blocks: { text: string, poly: any }[]) {
    // 1. Filter blocks that look like chords
    const chordBlocks = blocks.filter(b => {
        // remove trailing punctuation sometimes picked up
        const cleanText = b.text.replace(/[,\.]/g, '')
        return CHORD_REGEX.test(cleanText)
    })

    // 2. Simple Key Detection
    // Count root notes
    const counts: { [key: string]: number } = {}
    chordBlocks.forEach(b => {
        const match = b.text.match(/^([A-G](?:#|b)?)/)
        if (match) {
            const root = match[1]
            counts[root] = (counts[root] || 0) + 1
        }
    })

    // Naive: Most frequent chord is likely I, IV, or V.
    // Let's just find the most frequent start note.
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const detectedKey = sorted.length > 0 ? sorted[0][0] : 'C'

    return { chordBlocks, detectedKey }
}
