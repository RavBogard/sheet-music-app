
/**
 * Scans the react-pdf Text Layer for chords.
 * 
 * Strategy:
 * 1. Find the text layer container.
 * 2. Iterate over all <span> elements (text items).
 * 3. Filter for items that look like Chords using Regex.
 * 4. Return their position and dimensions relative to the page.
 */

export interface ScannedChord {
    id: string;
    text: string;
    x: number; // percentage
    y: number; // percentage
    w: number; // percentage
    h: number; // percentage
    pxHeight: number;
}

// Strict Chord Regex
// Matches: A, Am, A#, Bb, F#m7, G/B, Dsus4, etc.
// Excludes: "Verse", "Chorus", "The", "And"
const CHORD_REGEX = /^[A-G][b#]?(m|min|maj|dim|aug|sus|add|M|5|6|7|9|11|13)*(\/[A-G][b#]?)?$/;

// We can also check for short length to avoid false positives like "Add" (though 'add' is usually lowercase in lyrics, chords are Title Case)
// But "A" is a word and a chord. 
// Context helps: Chords are usually properly capitalized. "a" is word, "A" is chord.
// "I" is a word. "I" is not a chord (Use Roman Numerals? No, strictly letters).
const EXCLUDED_WORDS = new Set(["I", "A", "Am"]); // "Am" is tricky. "I am". "Am" chord.
// Actually "Am" is a very common chord.
// "A" is a very common chord and word.
// In lyrics, "A" is usually followed by a word. In chords, it's isolated or followed by spaces.
// PDF Text Layer usually isolates words into spans. 

// Heuristic:
// If it matches CHORD_REGEX and...
// 1. Is capitalized? (Regex enforces [A-G])
// 2. "A" is the only dangerous one.
// Let's accept all for now and trust the user can ignore/edit (eventually).

export function scanTextLayer(pageElement: HTMLElement): ScannedChord[] {
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
        console.warn("Text layer not found");
        return [];
    }

    const chords: ScannedChord[] = [];
    const spans = textLayer.querySelectorAll('span');

    // Bounds of the container for % calcs
    const pageRect = pageElement.getBoundingClientRect();

    spans.forEach((span) => {
        const text = span.textContent?.trim();
        if (!text) return;

        // Split by space? Sometimes multiple chords are in one span "G  C"
        // But usually react-pdf splits them if kerning is large.
        // Let's handle single tokens for now.
        const tokens = text.split(/\s+/);

        // If span has multiple tokens, we can't easily get X for each sub-token without advanced measurement.
        // For accurate replacement, we only accept spans that ARE chords.
        // Or we assume the span is JUST the chord.

        if (tokens.length === 1 && CHORD_REGEX.test(text)) {
            // It's a single chord!
            const rect = span.getBoundingClientRect();

            // Calculate relative %
            const x = ((rect.left - pageRect.left) / pageRect.width) * 100;
            const y = ((rect.top - pageRect.top) / pageRect.height) * 100;
            const w = (rect.width / pageRect.width) * 100;
            const h = (rect.height / pageRect.height) * 100;

            chords.push({
                id: crypto.randomUUID(),
                text: text,
                x, y, w, h,
                pxHeight: rect.height
            });
        }
    });

    return chords;
}
