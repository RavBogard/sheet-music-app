// "Radical Simplicity" Chord Detection
// Prioritizes RECALL over Precision.
// If it looks like a chord, we keep it. We do not try to "outsmart" the document by analyzing context.

// Regex for strictly valid chords
// Matches: Bb, F#m, G/B, Cmaj7, Ddim, E+, Am7, Sus4, Asus
// BY DESIGN: This matches single letters "A", "B", "C"... etc.
// We accept "A" even if it might be a word, because missing an "A" chord is worse than finding an "A" word.
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus(?:2|4)?)?(?:\/[A-G](?:#|b)?)?$/

// Dictionary of definitely ignored words that might accidentally match (very few match the regex, but for safety)
// "A" is NOT in here.
const EXPLICIT_BLOCKLIST = new Set([
    "a", // lowercase 'a' is a word
    "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z" // Non-musical caps
])

// Nashville Number System Maps
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS: { [key: string]: string } = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' }
const REVERSE_FLATS: { [key: string]: string } = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
const RELATIVE_KEYS: { [key: string]: string } = {
    'C': 'Am', 'C#': 'A#m', 'Db': 'Bbm',
    'D': 'Bm', 'D#': 'Cm', 'Eb': 'Cm',
    'E': 'C#m',
    'F': 'Dm', 'F#': 'D#m', 'Gb': 'Ebm',
    'G': 'Em', 'G#': 'Fm', 'Ab': 'Fm',
    'A': 'F#m', 'A#': 'Gm', 'Bb': 'Gm',
    'B': 'G#m'
}

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

    // Y_TOLERANCE: 15px 
    // Enough to group slight misalignment, but small enough to separate lyrical lines from chord lines.
    const Y_TOLERANCE = 15

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

        // 1b. MERGE PASS (Stitches "F" + "#m" -> "F#m")
        const mergedBlocks: typeof blocks = []
        if (line.blocks.length > 0) {
            let curr = line.blocks[0]
            for (let i = 1; i < line.blocks.length; i++) {
                const next = line.blocks[i]

                // Poly 1 is TR of curr, Poly 0 is TL of next
                const gap = next.poly[0].x - curr.poly[1].x
                const isClose = gap < 15

                // Heuristic: If next token starts with a Modifier (#, b, m, 7, /)...
                // We merge it.
                // ALSO: If next token is "m" or "maj", we merge.
                // We do NOT check for noise. We trust the merge.
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

        // 2. TOKEN EVALUATION (Radical Simplicity)
        // No line density check. No noise check.
        // Iterate tokens. If it matches Regex, keep it.

        lineBlocks.forEach(b => {
            // Trim whitespace is CRITICAL. OCR returns "E ". Regex ^E$ fails without trim.
            const txt = b.text.replace(/[,\.]/g, '').trim()
            if (!txt) return

            // Explicit filters
            if (EXPLICIT_BLOCKLIST.has(txt)) return

            // Regex Match
            if (CHORD_REGEX.test(txt)) {
                // It's a chord. Keep it.
                // We keep "A". We keep "E". We keep "B".
                finalChordBlocks.push(b)

                // Key Vote
                const match = txt.match(/^([A-G](?:#|b)?)/)
                if (match) {
                    const root = match[1]
                    keyVotes[root] = (keyVotes[root] || 0) + 1
                }
            }
        })
    })

    // 3. Simple Key Detection
    const sortedKeys = Object.entries(keyVotes).sort((a, b) => b[1] - a[1])
    const detectedKey = sortedKeys.length > 0 ? sortedKeys[0][0] : 'C'

    return { chordBlocks: finalChordBlocks, detectedKey }
}

export function calculateCapo(originalKey: string, targetShape: string) {
    // Returns { fret, transposition }

    // 0. Check for Relative Key Equivalence
    const isRelative =
        RELATIVE_KEYS[originalKey] === targetShape ||
        RELATIVE_KEYS[targetShape] === originalKey ||
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
