// Regex for strictly valid chords
// Matches: Bb, F#m, G/B, Cmaj7, Ddim, E+, Am7, Sus4, Asus
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus(?:2|4)?)?(?:\/[A-G](?:#|b)?)?$/

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

    // TIGHT TOLERANCE: 10px
    // We prefer splitting rows over merging them incorrectly.
    const Y_TOLERANCE = 10

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

                const trueGap = next.poly[0].x - curr.poly[1].x
                const isClose = trueGap < 15

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

        // 2. TOKEN EVALUATION STRATEGY
        // We do NOT judge the "Row". We judge the tokens.

        const potentials: typeof blocks = []
        let hasStrongChord = false // Any chord that is NOT "A" (ambiguous)

        lineBlocks.forEach(b => {
            // Trim whitespace!
            const txt = b.text.replace(/[,\.]/g, '').trim()
            if (!txt) return

            if (CHORD_REGEX.test(txt)) {
                potentials.push(b)

                // "A" is the only ambiguous Weak Chord (article)
                // "Am", "A7", "A/C#" are Strong.
                // "B", "C", "D"... are Strong (rarely words in lyrics).
                if (txt !== "A") {
                    hasStrongChord = true
                }
            }
        })

        // 3. DECISION
        // If we have a Strong Chord, we trust the context and accept ALL chords (including "A").
        // If we ONLY have "A"s (hasStrongChord == false), we are suspicious.
        // ex: "A boy" -> hasStrong=false. Reject "A".
        // ex: "A" (single token line) -> Accept?

        const isPureA = potentials.length === lineBlocks.length && potentials.length > 0

        if (hasStrongChord || isPureA) {
            potentials.forEach(b => {
                finalChordBlocks.push(b)

                // Key Vote
                const txt = b.text.replace(/[,\.]/g, '').trim()
                const match = txt.match(/^([A-G](?:#|b)?)/)
                if (match) {
                    const root = match[1]
                    keyVotes[root] = (keyVotes[root] || 0) + 1
                }
            })
        }
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
