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

// Given a root note index and whether we came from a flat/sharp context,
// determine if we should use flats or sharps for the result
function shouldUseFlats(newIndex: number, originalAccidental: string, preferFlats?: boolean): boolean {
    // Explicit preference overrides
    if (preferFlats !== undefined) return preferFlats;

    // If the original chord used a flat, prefer flats
    if (originalAccidental === 'b') return true;

    // Check what key the resulting root would naturally belong to
    const sharpName = SHARP_SCALE[newIndex];
    const flatName = FLAT_SCALE[newIndex];

    // If the note is natural (same in both scales), use convention:
    // F uses flats, everything else uses sharps by default
    if (sharpName === flatName) {
        return sharpName === 'F';
    }

    // For accidental notes, prefer the more common enharmonic:
    // Db > C#, Eb > D#, Ab > G#, Bb > A# (flats are more common in popular/worship music)
    // F# > Gb (F# is more common)
    if (newIndex === 6) return false; // F# preferred over Gb
    return true; // Prefer flats for Db, Eb, Ab, Bb
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

    let [, root, accidental, suffix] = match;

    // Normalize Unicode accidentals
    accidental = accidental.replace(String.fromCharCode(0x266F), '#').replace(String.fromCharCode(0x266D), 'b');
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
            const newBass = scale[newBassIndex];
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
        transposition: -capoFret
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
 * Get the display name for a transposition.
 * e.g., transposition=2 with original key "Em" -> "F#m (+2)"
 */
export function getTransposedKeyName(originalKey: string, semitones: number): string {
    if (!originalKey || semitones === 0) return originalKey || '';

    const transposed = transposeChord(originalKey, semitones);
    const direction = semitones > 0 ? '+' : '';
    return `${transposed} (${direction}${semitones})`;
}
