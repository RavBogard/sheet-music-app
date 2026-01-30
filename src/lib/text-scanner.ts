
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
const CHORD_REGEX = /^[A-G][b#]?(m|min|maj|dim|aug|sus|add|M|5|6|7|9|11|13)*(\/[A-G][b#]?)?$/;

const EXCLUDED_WORDS = new Set(["I", "A", "Am"]);

export function scanTextLayer(pageElement: HTMLElement): ScannedChord[] {
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
        console.warn("Text layer not found");
        return [];
    }

    const chords: ScannedChord[] = [];
    const spans = Array.from(textLayer.querySelectorAll('span'));

    // Bounds of the container for % calcs
    const pageRect = pageElement.getBoundingClientRect();

    // 1. Map to objects with coordinates
    const items = spans.map(span => {
        const rect = span.getBoundingClientRect();
        return {
            text: span.textContent || "",
            rect,
            // Relative coordinates for logic
            y: rect.top,
            x: rect.left,
            r: rect.right,
            b: rect.bottom,
            w: rect.width,
            h: rect.height,
            span
        };
    }).filter(i => i.text.trim().length > 0);

    // 2. Sort by Y (Line) then X (Position)
    // Tolerance for "Same Line": 5px
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });

    // 3. Merge adjacent items
    const merged: typeof items = [];

    if (items.length > 0) {
        let current = items[0];

        for (let i = 1; i < items.length; i++) {
            const next = items[i];

            // Check if on same line (vertical overlap or close Y)
            const sameLine = Math.abs(current.y - next.y) < (current.h / 2); // robust line check

            // Check spacing (horizontal gap)
            // If gap is small, it's likely one word/chord split by kerning
            const gap = next.x - current.r;
            const isClose = gap < (current.h * 0.5); // Gap smaller than half font height?

            if (sameLine && isClose) {
                // Merge
                current.text += next.text;
                current.r = next.r; // Extend right
                current.w = current.r - current.x;
                current.h = Math.max(current.h, next.h); // Max height
                current.b = Math.max(current.b, next.b);
                // Keep current.y and current.x as origin
            } else {
                // Push current and start new
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
    }

    // 4. Filter for Chords
    merged.forEach(item => {
        const text = item.text.trim();

        // Exclude common short words that match regex (I, A) - "A" is valid but risky.
        if (CHORD_REGEX.test(text) && !EXCLUDED_WORDS.has(text)) {
            // Calculate relative % using the merged screen coordinates
            const x = ((item.x - pageRect.left) / pageRect.width) * 100;
            const y = ((item.y - pageRect.top) / pageRect.height) * 100;
            const w = (item.w / pageRect.width) * 100;
            const h = (item.h / pageRect.height) * 100;

            chords.push({
                id: crypto.randomUUID(),
                text: text,
                x, y, w, h,
                pxHeight: item.h
            });
        }
    });

    return chords;
}
