// Regex for strictly valid chords
// Matches: Bb, F#m, G/B, Cmaj7, Ddim, E+, Am7, Sus4, Asus
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus(?:2|4)?)?(?:\/[A-G](?:#|b)?)?$/

// Common English words that look like chords but shouldn't be treated as such unless surrounded by other chords
const FALSE_POSITIVES = new Set(["A", "a", "Am", "an", "An", "as", "As", "at", "At", "be", "Be", "by", "By", "do", "Do", "go", "Go", "he", "He", "hi", "Hi", "if", "If", "in", "In", "is", "Is", "it", "It", "me", "Me", "my", "My", "no", "No", "of", "Of", "on", "On", "or", "Or", "ox", "Ox", "so", "So", "to", "To", "up", "Up", "us", "Us", "we", "We"])

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

    // Preserve flats preference if original used flats or target is a "flat key"
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
    // 1. Group blocks into lines based on Y coordinate (with tolerance)
    const lines: { y: number, blocks: typeof blocks }[] = []
    const Y_TOLERANCE = 8 // Reduced from 15 to prevent merging chords with lyrics

    // Sort blocks by Y first
    const sortedBlocks = [...blocks].sort((a, b) => a.poly[0].y - b.poly[0].y)

    sortedBlocks.forEach(block => {
        const y = block.poly[0].y
        // Find existing line
        const line = lines.find(l => Math.abs(l.y - y) < Y_TOLERANCE)
        if (line) {
            line.blocks.push(block)
        } else {
            lines.push({ y, blocks: [block] })
        }
    })

    const finalChordBlocks: typeof blocks = []
    const keyVotes: { [key: string]: number } = {}

    // 2. Analyze each line
    lines.forEach(line => {
        const lineBlocks = line.blocks
        const totalTokens = lineBlocks.length

        let possibleChords = 0
        let strictChords = 0

        lineBlocks.forEach(b => {
            const txt = b.text.replace(/[,\.]/g, '') // remove punctuation
            if (CHORD_REGEX.test(txt) && !FALSE_POSITIVES.has(txt)) {
                possibleChords++
                // Check if it's a "Strict Chord" (has #, b, 7, m, sus, or slash)
                // These are almost certainly chords and not words
                if (txt.match(/[#b75913\+]|sus|maj|min|dim|aug|\//)) {
                    strictChords++
                }
            }
        })

        const density = possibleChords / totalTokens

        // HEURISTIC: A line is a "Chord Line" if:
        // A) Density is high (> 40% are potential chords)
        // B) Contains "Strict Chords" which justify the line even if sparse
        const isChordLine = (density > 0.4) || (strictChords > 0)

        lineBlocks.forEach(b => {
            const txt = b.text.replace(/[,\.]/g, '')

            // Check matching
            if (CHORD_REGEX.test(txt)) {

                const isFalsePositive = FALSE_POSITIVES.has(txt)
                const isStrict = txt.match(/[#b75913\+]|sus|maj|min|dim|aug|\//)

                let keep = false

                // Scenario 1: It's a high density chord line -> Keep everything that matches regex (except strict false positives)
                if (isChordLine && !isFalsePositive) {
                    keep = true
                }

                // Scenario 2: It's a "Strict Chord" (unambiguous) -> Keep it ALWAYS, even if line density is low
                // This rescues chords like "G#m" or "C#m" mixed into a lyric line by accident
                if (isStrict) {
                    keep = true
                }

                // Scenario 3: Single letters [B-G] are rarely words (unlike A). 
                // If we found ANY strict chords in this line, we might trust the single letters too?
                // Or just trust them? "E" is often missed.
                // Let's trust Single Letters B-G if the line has ANY chord-like qualities (density > 0.1 ?)
                // "I went to E" -> E is East?
                // "Modeh Ani... E" -> E is chord.
                if (['B', 'C', 'D', 'E', 'F', 'G'].includes(txt) && (density > 0.1 || strictChords > 0)) {
                    keep = true
                }

                if (keep) {
                    finalChordBlocks.push(b)

                    // Key Detection Voting
                    const match = txt.match(/^([A-G](?:#|b)?)/)
                    if (match) {
                        const root = match[1]
                        keyVotes[root] = (keyVotes[root] || 0) + 1
                    }
                }
            }
        })
    })

    // 3. Simple Key Detection
    const sortedKeys = Object.entries(keyVotes).sort((a, b) => b[1] - a[1])
    const detectedKey = sortedKeys.length > 0 ? sortedKeys[0][0] : 'C'

    return { chordBlocks: finalChordBlocks, detectedKey }
}

// Relative Major -> Minor map
const RELATIVE_KEYS: { [key: string]: string } = {
    'C': 'Am', 'C#': 'A#m', 'Db': 'Bbm',
    'D': 'Bm', 'D#': 'Cm', 'Eb': 'Cm',
    'E': 'C#m',
    'F': 'Dm', 'F#': 'D#m', 'Gb': 'Ebm',
    'G': 'Em', 'G#': 'Fm', 'Ab': 'Fm',
    'A': 'F#m', 'A#': 'Gm', 'Bb': 'Gm',
    'B': 'G#m'
}

export function calculateCapo(originalKey: string, targetShape: string) {
    // Returns { fret, transposition }

    // 0. Check for Relative Key Equivalence
    // If user says Orig: C, Target: Am -> Treat as 0 shift because they share the key signature.
    // This fixes the issue where the detector guesses 'C' for an 'Am' song, 
    // and the user selects 'Am', causing a weird transposition.

    // Normalize input to standard format just in case (e.g. ensure 'Am' is proper case)
    // But assuming strict matching from our button list:

    const isRelative =
        RELATIVE_KEYS[originalKey] === targetShape ||
        RELATIVE_KEYS[targetShape] === originalKey ||
        // Check fuzzy reverse (Am -> C)
        Object.entries(RELATIVE_KEYS).some(([major, minor]) =>
            (major === originalKey && minor === targetShape) ||
            (minor === originalKey && major === targetShape)
        )

    if (isRelative) {
        return { fret: 0, transposition: 0 }
    }

    // 1. Extract Roots (Strip 'm', 'maj', etc.)
    const extractRoot = (k: string) => {
        const match = k.match(/^([A-G](?:#|b)?)/)
        return match ? match[1] : ''
    }

    const origRoot = extractRoot(originalKey)
    const targetRoot = extractRoot(targetShape)

    const origIndex = toSemis(origRoot)
    const targetIndex = toSemis(targetRoot)

    if (origIndex === -1 || targetIndex === -1) return null

    let diff = origIndex - targetIndex
    if (diff < 0) diff += 12

    return {
        fret: diff,
        transposition: -diff
    }
}
