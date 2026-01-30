const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function normalizeChord(chord: string): string {
    return chord.trim();
}

export function transposeChord(chord: string, semitones: number): string {
    if (!chord) return chord;

    // Simple regex to split root from suffix (e.g. "Am7/G" -> "A", "m7", "/G")
    // This assumes standard formatting. Complex chords might need better parsing.
    const match = chord.match(/^([A-G][b#]?)(.*)$/);
    if (!match) return chord;

    const root = match[1];
    const suffix = match[2] || '';

    // Find index in NOTES (sharp preferred for internal calc)
    let index = NOTES.indexOf(root);
    if (index === -1) index = FLATS.indexOf(root);
    if (index === -1) return chord; // Unknown chord

    // Calc new index
    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Determine if we should output sharps or flats based on the new key context?
    // For now, simple logic: if original was flat, try to keep flat context if reasonable?
    // Actually, let's checking the original root.
    const isFlat = FLATS.includes(root) && !NOTES.includes(root); // strictly flat notation used?

    // Better heuristic: Key context would be ideal, but for single chord we guess.
    // If the target key tends to use flats (F, Bb, Eb...), use flats.
    // We don't know the key here easily without more context. 
    // Let's default to Sharps unless explicitly Flat-leaning.

    return NOTES[newIndex] + suffix;
}

export function calculateCapo(originalKey: string, targetShape: string): { fret: number, transposition: number } | null {
    if (!originalKey || !targetShape) return null;

    let kIndex = NOTES.indexOf(originalKey);
    if (kIndex === -1) kIndex = FLATS.indexOf(originalKey);

    let sIndex = NOTES.indexOf(targetShape);
    if (sIndex === -1) sIndex = FLATS.indexOf(targetShape);

    if (kIndex === -1 || sIndex === -1) return null;

    // Capo = Original - Shape (mod 12)
    // Example: Key E, Shape D. E(4) - D(2) = 2. Capo 2.
    // Example: Key G, Shape C. G(7) - C(0) = 7. Capo 7.
    let diff = kIndex - sIndex;
    if (diff < 0) diff += 12;

    return {
        fret: diff,
        transposition: -diff // To sound like Original using Shape, we effectively transpose DOWN visually by 'diff' semitones?
        // Wait. 
        // If I play G-shape with Capo 5, I am sounding C. 
        // Visual (Shape) = G. Sound (Key) = C. 
        // Diff = Sound(0) - Visual(7) = -7 => 5. Capo 5.
        // Transposition is the interval shift the READER logic needs to do. (Writer wrote C, we want to see G).
        // C to G is -5 semitones (or +7).
        // So transposition = -fret. 
    };
}
