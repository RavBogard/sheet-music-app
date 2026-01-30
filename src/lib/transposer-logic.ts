// Probabilistic Chord Detection Logic
// "Chord Confidence Engine"

// --- CONSTANTS & DICTIONARIES ---

// Valid Chord Suffixes (for scoring)
const VALID_SUFFIXES = new Set([
    'm', 'min', 'maj', 'dim', 'aug', 'sus', 'add',
    '7', '9', '11', '13', '6', '5',
    '+', '-', 'deg', 'o', 'M', 'Maj'
])

// Explicitly ignored words (Common lyrics/headers that might look vaguely like chords)
const IGNORED_WORDS = new Set([
    "a", "i", "intro", "verse", "chorus", "bridge", "coda", "outro", "refrain",
    "capo", "fret", "bpm", "time", "key", "copyright", "all", "rights", "reserved",
    "x2", "x3", "x4", "repeat", "play", "stop", "slowly", "fast"
])

// Nashville Number System Maps (Preserved)
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


// --- SCORING ENGINE ---

/**
 * Assigns a "Chord Confidence Score" to a token.
 * Range: -100 (Definitely Text) to +100 (Definitely Chord)
 */
function scoreToken(text: string): number {
    const raw = text.trim()
    const clean = raw.replace(/[.,:;()]/g, '') // Remove punctuation
    const lower = clean.toLowerCase()

    if (!clean) return 0

    // 1. Explicit Ignored Words
    if (IGNORED_WORDS.has(lower)) return -100

    // 2. RegEx patterns
    // Strict Chord: e.g. F#m7, Bb/C, Asus4
    // Must start with A-G. Can have #/b. Must have SOME suffix or complexity.
    // OR be just A-G with strict formatting (handled below)
    const strictChordRegex = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|\+|o|7|9|11|13|\/)/

    // Weak Chord: Just A-G.
    const weakChordRegex = /^[A-G](?:#|b)?$/

    // Lyric Characteristics
    // Contains lowercase characters that are NOT typical chord suffixes?
    // Typical suffixes: m, a, j, i, n, d, u, g, s...
    // Let's invert: If it contains [h, k, l, p, q, r, t, v, w, x, y, z], it's almost certainly a word.
    // (Note: 'o' is used in dim, 'b' is flat).
    if (/[hklpqrtvwxyz]/.test(clean)) return -100

    // Check Logic
    if (strictChordRegex.test(clean)) {
        // High confidence
        return 100
    }

    if (weakChordRegex.test(clean)) {
        // It's a single note (E, B, A, D#).
        // "A" is ambiguous, but "B-G" are usually chords in this context.
        if (clean === "A") return 40 // Slightly less than 50 to require context
        return 50
    }

    // Default Fallback: If it starts with Uppercase but didn't match chords?
    if (/^[A-Z]/.test(clean)) {
        // Might be "This" or "Modeh"
        return -20
    }

    // Default: Lowercase junk
    return -100
}


// --- CLUSTERING ENGINE ---

/**
 * Groups blocks into visual lines based on Y-coordinate clustering.
 * Handles "bouncy" text better than strict variance.
 */
function clusterLines(blocks: { text: string, poly: any }[]) {
    if (blocks.length === 0) return []

    // Sort by Y first
    const sorted = [...blocks].sort((a, b) => a.poly[0].y - b.poly[0].y)

    const clusters: { blocks: typeof blocks, ySum: number, count: number }[] = []

    // Dynamic Cluster Threshold: 
    // If two blocks are within N pixels vertically, they are the same line.
    // 25px is generous enough for bouncy handwriting but tight enough to separate lines.
    const CLUSTER_THRESHOLD = 25

    sorted.forEach(block => {
        const y = block.poly[0].y

        // Find closest cluster
        let bestCluster = -1
        let minDiff = Infinity

        clusters.forEach((c, idx) => {
            const avgY = c.ySum / c.count
            const diff = Math.abs(avgY - y)
            if (diff < minDiff) {
                minDiff = diff
                bestCluster = idx
            }
        })

        if (bestCluster !== -1 && minDiff < CLUSTER_THRESHOLD) {
            // Add to existing cluster
            clusters[bestCluster].blocks.push(block)
            clusters[bestCluster].ySum += y
            clusters[bestCluster].count++
        } else {
            // New cluster
            clusters.push({ blocks: [block], ySum: y, count: 1 })
        }
    })

    return clusters.map(c => c.blocks.sort((a, b) => a.poly[0].x - b.poly[0].x))
}


// --- MAIN FUNCTION ---

export function identifyChords(blocks: { text: string, poly: any }[]) {
    // 1. Pre-process: Trim and clean blocks
    const cleanBlocks = blocks.map(b => ({
        ...b,
        text: b.text.trim()
    })).filter(b => b.text.length > 0)

    // 2. Cluster into Lines
    const lines = clusterLines(cleanBlocks)

    const finalChordBlocks: typeof blocks = []
    const keyVotes: { [key: string]: number } = {}

    // 3. Evaluate Rows
    lines.forEach(line => {
        let totalScore = 0
        let tokenCount = 0
        const linePotentials: { block: typeof blocks[0], score: number }[] = []

        // 3a. Merge Pass (Stitches "F" + "#m")
        const mergedLine: typeof blocks = []
        if (line.length > 0) {
            let curr = line[0]
            for (let i = 1; i < line.length; i++) {
                const next = line[i]

                // Poly 1 is TR of curr, Poly 0 is TL of next
                const gap = next.poly[0].x - curr.poly[1].x
                const isClose = gap < 15

                // If next is a modifier (#, m, 7) that wouldn't stand alone well?
                const looksLikeSuffix = /^[#bmsM791/d]/.test(next.text)

                if (isClose && looksLikeSuffix) {
                    curr = {
                        ...curr,
                        text: curr.text + next.text,
                        poly: [curr.poly[0], next.poly[1], next.poly[2], curr.poly[3]]
                    }
                } else {
                    mergedLine.push(curr)
                    curr = next
                }
            }
            mergedLine.push(curr)
        }

        // 3b. Score the Line
        mergedLine.forEach(block => {
            const score = scoreToken(block.text)
            totalScore += score
            tokenCount++
            linePotentials.push({ block, score })
        })

        const avgScore = totalScore / (tokenCount || 1)

        // 3c. Judgment Day
        // "Musical Line" Threshold: score > 20
        // (Remember: lyrics are -100. So one lyric drags down average massively).
        // e.g. E (+50) B (+50) -> Avg +50. PASS.
        // e.g. E (+50) Modeh (-100) -> Avg -25. FAIL.

        if (avgScore > 20) {
            // ACCEPT POSITIVE TOKENS
            linePotentials.forEach(item => {
                // We typically accept anything in a valid chord line that isn't expressly garbage.
                // But let's be safe: only accept things with non-negative score.
                // This allows "A" (+40) to pass because the line average is high.
                if (item.score > 0) {
                    finalChordBlocks.push(item.block)

                    // Key Vote
                    const match = item.block.text.match(/^([A-G](?:#|b)?)/)
                    if (match) {
                        const root = match[1]
                        keyVotes[root] = (keyVotes[root] || 0) + 1
                    }
                }
            })
        }
    })

    // 4. Determine Key
    const sortedKeys = Object.entries(keyVotes).sort((a, b) => b[1] - a[1])
    const detectedKey = sortedKeys.length > 0 ? sortedKeys[0][0] : 'C'

    return { chordBlocks: finalChordBlocks, detectedKey }
}


// --- UTILITIES (Preserved) ---

const toSemis = (note: string) => {
    if (FLATS[note]) note = FLATS[note]
    return NOTES.indexOf(note)
}

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

export function calculateCapo(originalKey: string, targetShape: string) {
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
