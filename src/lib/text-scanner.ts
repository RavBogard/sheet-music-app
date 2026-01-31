
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
// Also matches Unicode Sharp (♯) and Flat (♭)
const CHORD_REGEX = /^[A-G][b#\u266F\u266D]?(m|min|maj|dim|aug|sus|add|M|7|9|11|13|6|5|2|4)*(\/[A-G][b#\u266F\u266D]?)?$/;

const EXCLUDED_WORDS = new Set(["I", "II", "III", "IV", "V", "VI", "VII"]);

export function scanTextLayer(pageElement: HTMLElement): ScannedChord[] {
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
        console.warn("Text layer not found");
        return [];
    }

    const chords: ScannedChord[] = [];
    const spans = Array.from(textLayer.querySelectorAll('span'));

    // Bounds of the container for % calcs
    // Bounds of the container for % calcs
    // Use textLayer bounds instead of pageElement for more accurate measurement
    const textLayerRect = textLayer.getBoundingClientRect();
    const pageRect = {
        left: Math.min(pageElement.getBoundingClientRect().left, textLayerRect.left),
        right: Math.max(pageElement.getBoundingClientRect().right, textLayerRect.right),
        top: Math.min(pageElement.getBoundingClientRect().top, textLayerRect.top),
        bottom: Math.max(pageElement.getBoundingClientRect().bottom, textLayerRect.bottom),
        width: 0,
        height: 0
    };
    pageRect.width = pageRect.right - pageRect.left;
    pageRect.height = pageRect.bottom - pageRect.top;

    // Debug Text Scanner
    console.log('[TextScanner] Page rect:', {
        left: pageRect.left,
        right: pageRect.right,
        width: pageRect.width,
        top: pageRect.top,
        bottom: pageRect.bottom,
        height: pageRect.height
    });
    console.log('[TextScanner] Total spans found:', spans.length);

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

    console.log('[TextScanner] Items after filtering empty:', items.length);
    if (items.length > 0) {
        console.log('[TextScanner] Rightmost item x:', Math.max(...items.map(i => i.x)));

        // Log items near right edge
        const rightEdgeItems = items.filter(i => {
            const xPct = ((i.x - pageRect.left) / pageRect.width) * 100;
            return xPct > 80;
        });
        console.log('[TextScanner] Items with x > 80%:', rightEdgeItems.map(i => ({
            text: i.text,
            xPct: (((i.x - pageRect.left) / pageRect.width) * 100).toFixed(1)
        })));
    }

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
            const sameLine = Math.abs(current.y - next.y) < (current.h * 0.3); // robust line check (conservative)

            // Check spacing (horizontal gap)
            // If gap is small, it's likely one word/chord split by kerning
            const gap = next.x - current.r;

            // Smarter gap check: stricter for words, looser for single chars (like #, m, 7)
            const isSingleChar = current.text.trim().length === 1 || next.text.trim().length === 1;
            const maxGap = isSingleChar ? (current.h * 0.5) : (current.h * 0.2);
            const isClose = gap >= 0 && gap < maxGap;

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

    // Post-process: Aggressively combine chord parts that are on the same line
    // This handles cases where G, #, m are all separate spans
    const finalItems: typeof merged = [];

    for (let i = 0; i < merged.length; i++) {
        let current = merged[i];

        // If current starts with a chord root letter (A-G), try to build a complete chord
        if (/^[A-G]$/.test(current.text.trim())) {
            let chordText = current.text.trim();
            let lastItem = current;
            let j = i + 1;

            // Keep consuming adjacent items that look like chord parts
            while (j < merged.length) {
                const next = merged[j];

                // Must be on same line (within full height)
                if (Math.abs(current.y - next.y) > current.h) break;

                // Must be close horizontally (within 1x height gap)
                const gap = next.x - lastItem.r;
                if (gap > current.h) break;

                const nextText = next.text.trim();

                // Valid chord continuations: #, b, m, M, maj, min, dim, aug, sus, add, 7, 9, 11, 13, 6, 5, 2, 4
                if (/^[#b♯♭]$/.test(nextText) ||
                    /^(m|M|maj|min|dim|aug|sus|add|7|9|11|13|6|5|2|4)+$/.test(nextText) ||
                    /^m7$/.test(nextText) ||
                    /^maj7$/.test(nextText)) {

                    chordText += nextText;
                    lastItem = next;
                    j++;
                } else {
                    break;
                }
            }

            // Create combined item
            finalItems.push({
                ...current,
                text: chordText,
                r: lastItem.r,
                w: lastItem.r - current.x,
            });

            // Skip the items we consumed
            i = j - 1;
        } else {
            finalItems.push(current);
        }
    }

    const itemsToFilter = finalItems;

    console.log('[TextScanner] Items after merging:', itemsToFilter.length);
    if (itemsToFilter.length > 0) {
        // Log a sample to avoid flooding console, or all if debugging
        console.log('[TextScanner] Merged items sample:', merged.slice(0, 10).map(m => ({ text: m.text.substring(0, 10), x: m.x.toFixed(0) })));
        console.log('[TextScanner] Merged text samples:', merged.filter(m => m.text.length > 2).slice(0, 20).map(m => m.text));

        // Log potential chords that were NOT captured
        const missedChords = merged.filter(item => {
            const text = item.text.trim();
            const xPct = ((item.x - pageRect.left) / pageRect.width) * 100;
            // Check if it LOOKS like a chord but wasn't captured
            const looksLikeChord = /^[A-G]/.test(text) && text.length <= 6;
            const wasNotCaptured = !CHORD_REGEX.test(text.replace(/[^\w#b♯♭\/]/g, ''));
            return looksLikeChord && wasNotCaptured && xPct > 70;
        });
        if (missedChords.length > 0) {
            console.log('[TextScanner] Potential missed chords:', missedChords.map(m => ({
                text: m.text,
                xPct: (((m.x - pageRect.left) / pageRect.width) * 100).toFixed(1)
            })));
        }
    }

    // 4. Filter for Chords
    itemsToFilter.forEach(item => {
        const text = item.text.trim();

        // Check if it matches chord regex and isn't excluded
        const cleanText = text.replace(/[^\w#b♯♭\/]/g, '');  // Remove any stray characters
        if (CHORD_REGEX.test(cleanText) && !EXCLUDED_WORDS.has(cleanText)) {

            // Special check for "A" - removed as it was too aggressive
            // Using standard regex and exclusion list only.

            // Calculate relative % using the merged screen coordinates
            let x = ((item.x - pageRect.left) / pageRect.width) * 100;
            let y = ((item.y - pageRect.top) / pageRect.height) * 100;
            const w = (item.w / pageRect.width) * 100;
            const h = (item.h / pageRect.height) * 100;

            // Clamp x to valid range (items near edge might calculate slightly > 100)
            x = Math.min(Math.max(x, 0), 99);
            y = Math.min(Math.max(y, 0), 99);

            // Sanity check: chord width should be reasonable (< 15% of page)
            // If width is huge, the merge corrupted this item
            if (w > 15) {
                console.warn(`[TextScanner] Skipping chord with abnormal width: ${cleanText} w=${w.toFixed(1)}%`);
                return; // Skip this item
            }

            chords.push({
                id: crypto.randomUUID(),
                text: cleanText,  // Use cleaned text
                x, y, w, h,
                pxHeight: item.h
            });
        }
    });

    // Debug logging for text scanner
    console.log('[TextScanner] Total chords found:', chords.length);
    console.log('[TextScanner] Chord positions:', chords.map(c => ({ text: c.text, x: c.x.toFixed(1), y: c.y.toFixed(1) })));

    return chords;
}
