// Regex for strictly valid chords
// Matches: Bb, F#m, G/B, Cmaj7, Ddim, E+, Am7, Sus4, Asus
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus(?:2|4)?)?(?:\/[A-G](?:#|b)?)?$/

// Common English words that look like chords but shouldn't be treated as such unless surrounded by other chords
// "A" and "Am" are REMOVED from here because they are common chords and we want to count them for density.
// We will filter "a" (lowercase) and specific words.
const FALSE_POSITIVES = new Set([
    "a", "an", "An", "as", "As", "at", "At", "be", "Be", "by", "By", "do", "Do", "go", "Go", "he", "He",
    "hi", "Hi", "if", "If", "in", "In", "is", "Is", "it", "It", "me", "Me", "my", "My", "no", "No",
    "of", "Of", "on", "On", "or", "Or", "ox", "Ox", "so", "So", "to", "To", "up", "Up", "us", "Us", "we", "We"
])

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
    // 1. Group blocks into lines
    const lines: { y: number, blocks: typeof blocks }[] = []

    // INCREASED Tolerance (was 10, now 20) to capture "bouncy" handwritten fonts in single rows
    const Y_TOLERANCE = 20

    const sortedBlocks = [...blocks].sort((a, b) => a.poly[0].y - b.poly[0].y)

    sortedBlocks.forEach(block => {
        const y = block.poly[0].y
        const line = lines.find(l => Math.abs(l.y - y) < Y_TOLERANCE)
        if (line) {
            line.blocks.push(block)
        } else {
            lines.push({ y, blocks: [block] })
        }
    })

    const finalChordBlocks: typeof blocks = []
    const keyVotes: { [key: string]: number } = {}

    lines.forEach(line => {
        // 1a. Sort blocks x-wise
        line.blocks.sort((a, b) => a.poly[0].x - b.poly[0].x)

        // 1b. MERGE PASS
        const mergedBlocks: typeof blocks = []
        if (line.blocks.length > 0) {
            let curr = line.blocks[0]
            for (let i = 1; i < line.blocks.length; i++) {
                const next = line.blocks[i]

                // Gap Check (in pixels)
                const trueGap = next.poly[0].x - curr.poly[1].x
                const isClose = trueGap < 15

                // Merge Heuristics:
                const suffixLooksLikeModifier = /^[#bmsM791/d]/.test(next.text)

                if (isClose && suffixLooksLikeModifier) {
                    // MERGE
                    curr = {
                        text: curr.text + next.text,
                        poly: [
                            curr.poly[0], // TL
                            next.poly[1], // TR
                            next.poly[2], // BR
                            curr.poly[3]  // BL
                        ]
                    }
                } else {
                    mergedBlocks.push(curr)
                    curr = next
                }
            }
            mergedBlocks.push(curr)
        }

        const lineBlocks = mergedBlocks
        const totalTokens = lineBlocks.length

        let possibleChords = 0
        let strictChords = 0

        lineBlocks.forEach(b => {
            // CRITICAL FIX: Trim whitespace! OCR often returns "E " or " B".
            const txt = b.text.replace(/[,\.]/g, '').trim()

            // Check if it matches regex AND is not in explicit exclude list
            if (CHORD_REGEX.test(txt) && !FALSE_POSITIVES.has(txt)) {
                possibleChords++

                // STRICT CHORD DEFINITION
                // 1. Contains music chars (#, b, 7, etc.)
                // 2. OR is a single uppercase letter B-G
                const isMusicComplex = txt.match(/[#b75913\+]|sus|maj|min|dim|aug|\//)
                const isSingleLetterNote = ['B', 'C', 'D', 'E', 'F', 'G'].includes(txt)

                if (isMusicComplex || isSingleLetterNote) {
                    strictChords++
                }
            }
        })

        const density = possibleChords / totalTokens

        // HEURISTIC:
        // Accept if density > 40%
        // OR if we have Strict Chords and at least some density (15%)
        const isChordLine = (density > 0.4) || (strictChords > 0 && density > 0.15)

        lineBlocks.forEach(b => {
            // Trim here too!
            const txt = b.text.replace(/[,\.]/g, '').trim()

            if (CHORD_REGEX.test(txt)) {

                const isExplicitFalse = FALSE_POSITIVES.has(txt)
                // Re-calc strictness for individual block decision
                const isMusicComplex = txt.match(/[#b75913\+]|sus|maj|min|dim|aug|\//)
                const isSingleLetterNote = ['B', 'C', 'D', 'E', 'F', 'G'].includes(txt)
                const isStrict = isMusicComplex || isSingleLetterNote

                let keep = false

                // 1. If line is recognized as chords, keep ALL chords (unless explicit false positive)
                if (isChordLine && !isExplicitFalse) {
                    keep = true
                }

                // 2. Strict Rescue (Keep "G#m" or "B" even in lyric lines)
                if (isStrict && !isExplicitFalse) {
                    keep = true
                }

                // 3. Single Letter Rescue (Specific for "A")
                // If the line implies musical context (strict chords exist), we trust "A"
                if (txt === 'A' && strictChords > 0 && !isExplicitFalse) {
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

    // ... (Key Detection remains)
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
