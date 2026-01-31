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

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm']);

export function normalizeChord(chord: string): string {
    return chord.trim();
}

export function transposeChord(chord: string, semitones: number, preferFlats?: boolean): string {
    if (!chord || typeof chord !== 'string') return chord;

    const trimmed = chord.trim();
    if (!trimmed) return chord;

    const match = trimmed.match(/^([A-G])([#b♯♭]?)(.*)$/);
    if (!match) return chord;

    let [, root, accidental, suffix] = match;

    accidental = accidental.replace('♯', '#').replace('♭', 'b');
    const fullRoot = root + accidental;

    let index = SHARP_SCALE.indexOf(fullRoot);
    if (index === -1) index = FLAT_SCALE.indexOf(fullRoot);
    if (index === -1) {
        const enharmonic = ENHARMONIC_MAP[fullRoot];
        if (enharmonic) {
            index = SHARP_SCALE.indexOf(enharmonic);
            if (index === -1) index = FLAT_SCALE.indexOf(enharmonic);
        }
    }
    if (index === -1) return chord;

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Determine flat vs sharp preference
    let useFlats = preferFlats ?? (accidental === 'b');

    const scale = useFlats ? FLAT_SCALE : SHARP_SCALE;
    let newRoot = scale[newIndex];

    // Handle slash chords
    let processedSuffix = suffix;
    const slashMatch = suffix.match(/^(.*)\/([A-G])([#b♯♭]?)$/);

    if (slashMatch) {
        const [, qualityPart, bassRoot, bassAccidental] = slashMatch;
        const normalizedBassAcc = bassAccidental.replace('♯', '#').replace('♭', 'b');
        const fullBass = bassRoot + normalizedBassAcc;

        let bassIndex = SHARP_SCALE.indexOf(fullBass);
        if (bassIndex === -1) bassIndex = FLAT_SCALE.indexOf(fullBass);
        if (bassIndex === -1) {
            const enh = ENHARMONIC_MAP[fullBass];
            if (enh) {
                bassIndex = SHARP_SCALE.indexOf(enh);
                if (bassIndex === -1) bassIndex = FLAT_SCALE.indexOf(enh);
            }
        }

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

    let kIndex = SHARP_SCALE.indexOf(originalKey);
    if (kIndex === -1) kIndex = FLAT_SCALE.indexOf(originalKey);

    let sIndex = SHARP_SCALE.indexOf(targetShape);
    if (sIndex === -1) sIndex = FLAT_SCALE.indexOf(targetShape);

    if (kIndex === -1 || sIndex === -1) return null;

    let diff = kIndex - sIndex;
    if (diff < 0) diff += 12;

    return { fret: diff, transposition: -diff };
}

export function estimateKey(chords: string[]): string | null {
    if (!chords || chords.length === 0) return null;

    const roots = chords.map(c => {
        const match = c.match(/^([A-G][b#]?)/);
        return match ? match[1] : null;
    }).filter(c => c !== null) as string[];

    if (roots.length === 0) return null;

    const scores: Record<string, number> = {};

    roots.forEach((root, i) => {
        const isFirst = i === 0;
        const isLast = i === roots.length - 1;
        scores[root] = (scores[root] || 0) + 1;
        if (isFirst) scores[root] += 5;
        if (isLast) scores[root] += 5;
    });

    let bestKey = null;
    let maxScore = -1;

    for (const [key, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestKey = key;
        }
    }

    return bestKey;
}
