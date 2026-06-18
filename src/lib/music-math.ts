const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SCALE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ENHARMONIC_MAP: Record<string, string> = {
    'C#': 'Db', 'Db': 'C#',
    'D#': 'Eb', 'Eb': 'D#',
    'F#': 'Gb', 'Gb': 'F#',
    'G#': 'Ab', 'Ab': 'G#',
    'A#': 'Bb', 'Bb': 'A#',
    'E#': 'F', 'Fb': 'E',
    'B#': 'C', 'Cb': 'B'
};

// Keys that conventionally use flats in their key signature
// Major keys: F, Bb, Eb, Ab, Db, Gb (and their relative minors)
// Sharp keys: G, D, A, E, B, F# (and their relative minors)
const FLAT_KEYS = new Set([
    // Major flat keys
    'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
    // Minor flat keys  
    'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm',
]);

const SHARP_KEYS = new Set([
    // Major sharp keys
    'G', 'D', 'A', 'E', 'B', 'F#',
    // Minor sharp keys
    'Em', 'Bm', 'F#m', 'C#m', 'G#m',
]);

/**
 * Determine whether a key conventionally uses flats.
 * Exported so SmartTransposer can derive flat preference from the target key.
 */
export function keyUsesFlats(key: string | null): boolean | undefined {
    if (!key) return undefined;
    if (FLAT_KEYS.has(key)) return true;
    if (SHARP_KEYS.has(key)) return false;
    // Natural keys (C, Am) — no strong preference
    return undefined;
}

// Given a root note index and whether we came from a flat/sharp context,
// determine if we should use flats or sharps for the result
function shouldUseFlats(newIndex: number, originalAccidental: string, preferFlats?: boolean): boolean {
    // Strong musical conventions that override preferFlats:
    // Bb is ALWAYS preferred over A# as a chord root (A# essentially never used)
    // Eb is strongly preferred over D# as a chord root
    if (newIndex === 10) return true;  // Always Bb, never A#
    if (newIndex === 3) return true;   // Always Eb, never D#

    // Explicit preference overrides (from musician profile or key context)
    if (preferFlats !== undefined) return preferFlats;

    // Preserve the convention of the source chord:
    if (originalAccidental === 'b') return true;
    if (originalAccidental === '#') return false;

    // For natural chords landing on an accidental, use music-theory convention
    const sharpName = SHARP_SCALE[newIndex];
    const flatName = FLAT_SCALE[newIndex];

    if (sharpName === flatName) return false;
    if (newIndex === 6) return false; // F# preferred over Gb

    // Db, Ab preferred over C#, G#
    return true;
}

function findNoteIndex(noteName: string): number {
    let index = SHARP_SCALE.indexOf(noteName);
    if (index !== -1) return index;

    index = FLAT_SCALE.indexOf(noteName);
    if (index !== -1) return index;

    const enharmonic = ENHARMONIC_MAP[noteName];
    if (enharmonic) {
        index = SHARP_SCALE.indexOf(enharmonic);
        if (index !== -1) return index;
        index = FLAT_SCALE.indexOf(enharmonic);
        if (index !== -1) return index;
    }

    return -1;
}

export function normalizeChord(chord: string): string {
    return chord.trim();
}

export function transposeChord(chord: string, semitones: number, preferFlats?: boolean): string {
    if (!chord || typeof chord !== 'string') return chord;
    if (semitones === 0) return chord;

    const trimmed = chord.trim();
    if (!trimmed) return chord;

    // Match root note, accidental, and everything else (quality, extensions, slash bass)
    const match = trimmed.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) return chord;

    const [, root, rawAccidental, suffix] = match;

    // Normalize Unicode accidentals
    const accidental = rawAccidental.replace(String.fromCharCode(0x266F), '#').replace(String.fromCharCode(0x266D), 'b');
    const fullRoot = root + accidental;

    const index = findNoteIndex(fullRoot);
    if (index === -1) return chord;

    // Calculate new position
    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Determine flat vs sharp preference
    const useFlats = shouldUseFlats(newIndex, accidental, preferFlats);
    const scale = useFlats ? FLAT_SCALE : SHARP_SCALE;
    const newRoot = scale[newIndex];

    // Handle slash chords — transpose the bass note too
    let processedSuffix = suffix;
    const slashMatch = suffix.match(/^(.*)\/([A-G])([#b]?)$/);

    if (slashMatch) {
        const [, qualityPart, bassRoot, bassAccidental] = slashMatch;
        const normalizedBassAcc = bassAccidental.replace(String.fromCharCode(0x266F), '#').replace(String.fromCharCode(0x266D), 'b');
        const fullBass = bassRoot + normalizedBassAcc;

        const bassIndex = findNoteIndex(fullBass);
        if (bassIndex !== -1) {
            let newBassIndex = (bassIndex + semitones) % 12;
            if (newBassIndex < 0) newBassIndex += 12;
            // WS-25: spell the bass with its OWN flat/sharp decision rather than
            // blindly reusing the root's `scale`. Passing the root's `useFlats`
            // as the preferFlats hint keeps the bass in the chord's key context
            // (so e.g. G/B+2 stays A/C#, not A/Db), while shouldUseFlats's
            // unconditional 10→Bb / 3→Eb rules still fire — so a sharp-scale
            // root no longer forces the never-used A#/D# onto the bass
            // (F/A+1 → F#/Bb, not F#/A#).
            const bassUseFlats = shouldUseFlats(newBassIndex, normalizedBassAcc, useFlats);
            const newBass = (bassUseFlats ? FLAT_SCALE : SHARP_SCALE)[newBassIndex];
            processedSuffix = qualityPart + '/' + newBass;
        }
    }

    return newRoot + processedSuffix;
}

export function calculateCapo(originalKey: string, targetShape: string): { fret: number, transposition: number } | null {
    if (!originalKey || !targetShape) return null;

    const extractRoot = (key: string): string => {
        const match = key.match(/^([A-G][#b]?)/);
        return match ? match[1] : key;
    };

    const originalRoot = extractRoot(originalKey);
    const targetRoot = extractRoot(targetShape);

    const originalIndex = findNoteIndex(originalRoot);
    const targetIndex = findNoteIndex(targetRoot);

    if (originalIndex === -1 || targetIndex === -1) return null;

    // Capo fret = how many semitones to raise target to reach original
    let capoFret = originalIndex - targetIndex;
    if (capoFret < 0) capoFret += 12;

    return {
        fret: capoFret,
        transposition: -capoFret || 0
    };
}

/**
 * Estimate the key of a song based on chord progression.
 * Uses a weighted scoring system:
 * - First chord (strong indicator — songs usually start on the tonic)
 * - Last chord (moderate indicator — songs usually end on the tonic)
 * - Frequency of occurrence
 * - Presence of the dominant (V) suggests the root is a 5th below
 */
export function estimateKey(chords: string[]): string | null {
    if (!chords || chords.length === 0) return null;

    const roots = chords.map(c => {
        const match = c.match(/^([A-G][b#]?)/);
        return match ? match[1] : null;
    }).filter((c): c is string => c !== null);

    if (roots.length === 0) return null;

    // Check if it's minor (look for minor chords on the first/last position)
    const qualities = chords.map(c => {
        const match = c.match(/^[A-G][b#]?(m(?!aj)|min)/);
        return match ? 'minor' : 'major';
    });

    const scores: Record<string, number> = {};

    roots.forEach((root, i) => {
        const isFirst = i === 0;
        const isLast = i === roots.length - 1;

        // Base score for each occurrence
        scores[root] = (scores[root] || 0) + 1;

        // First chord is very strong indicator
        if (isFirst) scores[root] += 10;

        // Last chord is moderate indicator
        if (isLast) scores[root] += 3;

        // Second chord often returns to tonic
        if (i === 1) scores[root] += 2;
    });

    let bestKey: string | null = null;
    let maxScore = -1;

    for (const [key, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestKey = key;
        }
    }

    if (!bestKey) return null;

    // Check if the winning key's chord is minor in the first/last positions
    const firstChordIsMinor = qualities[0] === 'minor';
    const bestKeyIsFirstChord = roots[0] === bestKey;

    if (bestKeyIsFirstChord && firstChordIsMinor) {
        return bestKey + 'm';
    }

    return bestKey;
}

/**
 * Calculate semitone distance between two keys.
 * E.g., calculateSemitones("Dm", "Am") → 7
 * Normalizes to shortest path (-6..+5 range).
 */
export function calculateSemitones(fromKey: string, toKey: string): number {
    if (!fromKey || !toKey) return 0

    const extractRoot = (key: string): string => {
        const match = key.match(/^([A-G][#b]?)/)
        return match ? match[1] : key
    }

    const fromRoot = extractRoot(fromKey)
    const toRoot = extractRoot(toKey)
    const fromIndex = findNoteIndex(fromRoot)
    const toIndex = findNoteIndex(toRoot)

    if (fromIndex === -1 || toIndex === -1) return 0

    let diff = toIndex - fromIndex
    if (diff > 6) diff -= 12
    if (diff < -6) diff += 12
    return diff
}

/**
 * Get the display name for a transposition.
 * e.g., transposition=2 with original key "Em" -> "F#m (+2)"
 */
export function getTransposedKeyName(originalKey: string, semitones: number): string {
    if (!originalKey || semitones === 0) return originalKey || '';

    const transposed = transposeChord(originalKey, semitones);
    const direction = semitones > 0 ? '+' : '';
    return `${transposed} (${direction}${semitones})`;
}
