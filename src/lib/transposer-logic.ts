// Regex for strictly valid chords
// Excludes single "I" or "A" which are common lyrics
// Matches: Bb, F#m, G/B, Cmaj7, Ddim, E+, Am7, Sus4
// We enforce that single letters must be followed by something OR be in a context where they look like chords (handled by logic)
// But to be safe, we'll allow single letters A-G, but filter them out later if they appear to be lyrics.
const CHORD_REGEX = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|\+)?(?:7|9|11|13)?(?:sus[24])?(?:\/[A-G](?:#|b)?)?$/

// Common English words that look like chords but shouldn't be treated as such unless surrounded by other chords
const FALSE_POSITIVES = new Set(["I", "A", "a", "Am", "To", "Be", "Is", "In", "On", "At", "No", "So", "Do", "Go", "Up", "Or", "If", "As", "By", "My", "We", "He", "Us"])

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
    const Y_TOLERANCE = 15 // pixels

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
        let strictChords = 0 // Chords that definitely aren't words (e.g. G7, F#m, Asus)

        lineBlocks.forEach(b => {
            const txt = b.text.replace(/[,\.]/g, '') // remove punctuation
            if (CHORD_REGEX.test(txt)) {
                possibleChords++
                // Check if it's a strict chord (has #, b, 7, m, sus, or slash)
                if (txt.match(/[#b7msu\/]/) && txt !== 'I') {
                    strictChords++
                }
            }
        })

        const density = possibleChords / totalTokens

        // HEURISTIC: A line is a "Chord Line" if:
        // A) Density is high (> 50% are potential chords)
        // B) Contains at least one "Strict Chord" (definitely not a word) AND density > 20%
        // C) It's a sparse line (few tokens) and they are all valid notes (e.g. "G   C   D")

        const isChordLine = (density > 0.5) || (strictChords > 0 && density > 0.2)

        if (isChordLine) {
            // Processing this line as chords
            lineBlocks.forEach(b => {
                const txt = b.text.replace(/[,\.]/g, '')
                // Even in a chord line, ignore obvious non-chords (e.g. "Chorus:", "Intro")
                // But include "I" or "A" if the line is determined to be chords
                if (CHORD_REGEX.test(txt)) {
                    // Filter out words that happen to be chord names if they appear in a mixed context?
                    // No, if the whole line is chords, assume they are chords.
                    // EXCEPT: standard exclusion list if density is borderline
                    if (density < 0.8 && FALSE_POSITIVES.has(txt) && txt !== 'A') {
                        // "I" might be a chord in a chord line? unlikely. "I" is not a chord. "A" is.
                        if (txt === 'I') return
                        // "A" is valid.
                    }

                    finalChordBlocks.push(b)

                    // Key Detection Voting
                    const match = txt.match(/^([A-G](?:#|b)?)/)
                    if (match) {
                        const root = match[1]
                        keyVotes[root] = (keyVotes[root] || 0) + 1
                    }
                }
            })
        }
    })

    // 3. Simple Key Detection
    const sortedKeys = Object.entries(keyVotes).sort((a, b) => b[1] - a[1])
    const detectedKey = sortedKeys.length > 0 ? sortedKeys[0][0] : 'C'

    return { chordBlocks: finalChordBlocks, detectedKey }
}

export function calculateCapo(originalKey: string, targetShape: string) {
    // Returns { fret, transposition }
    // e.g. Orig: F, Target: D -> F - D = 3 semitones. Capo 3. Transposition -3 (visual).
    // e.g. Orig: C, Target: G -> C - G = -7 -> +5 semitones. Capo 5. Transposition -5.

    const origIndex = toSemis(originalKey)
    const targetIndex = toSemis(targetShape)

    if (origIndex === -1 || targetIndex === -1) return null

    let diff = origIndex - targetIndex
    if (diff < 0) diff += 12

    // Capo shouldn't really go above 11 (or even 7-9 realistically, but math is math)
    return {
        fret: diff,
        transposition: -diff
    }
}
