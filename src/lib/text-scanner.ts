
/**
 * Scans the react-pdf Text Layer for chords.
 * 
 * Strategy:
 * 1. Find the text layer container.
 * 2. Iterate over all <span> elements (text items).
 * 3. Merge adjacent spans that belong to the same token (handles kerning, superscripts).
 * 4. Filter for items that look like Chords using Regex.
 * 5. Return their position and dimensions relative to the page.
 * 
 * v2: Improved chord detection for real-world lead sheets
 * - Expanded regex: handles add9, sus2/4, aug, dim, parenthetical extensions, double-sharps/flats
 * - Better merging: handles superscripts (7, 9, 11, 13) and accidentals split across spans
 * - Heuristic filtering: rejects common false positives (A, Am when likely lyrics)
 * - Reduced console noise in production
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

// ---- Chord Detection ----

// Core chord pattern:
// Root: A-G
// Accidental: #, b, ♯, ♭ (or double: ##, bb)
// Quality: m, min, maj, M, dim, aug, °, +, Δ
// Extensions: 2, 4, 5, 6, 7, 9, 11, 13
// Modifiers: sus, add, no, alt
// Compound qualities: m7, maj7, dim7, m7b5, 7#9, etc.
// Bass note: /X or /X# or /Xb
// Parenthetical: (add9), (b5), (#11), etc.
const CHORD_REGEX = /^[A-G][b#\u266F\u266D]?(?:m(?:in|aj)?|M(?:aj)?|dim|aug|°|\+|Δ)?(?:sus[24]?|add)?(?:2|4|5|6|7|9|11|13)?(?:[b#\u266F\u266D]?(?:5|9|11|13))?(?:\(.*?\))?(?:\/[A-G][b#\u266F\u266D]?)?$/;

// Simpler test for "starts with a chord root and has chord-like content"
// Used as a pre-filter before the strict regex
const CHORD_PREFILTER = /^[A-G][b#\u266F\u266D]?/;

// Things that look like chords but aren't
const EXCLUDED_WORDS = new Set([
    "A", "Am", // Single "A" or "Am" could be articles — handled by context heuristic below
    "I", "II", "III", "IV", "V", "VI", "VII",
    "D.C.", "D.S.", "Da", "Dal",
    "Fine", "Fade",
    "Freely",
]);

// These ARE valid even though they're short — only exclude "A" and "Am" contextually
const ALWAYS_VALID_SHORT = new Set([
    "Ab", "A#", "Am7", "A7", "A2", "A9", "Adim", "Aaug", "Asus", "Asus2", "Asus4",
    "Bb", "B", "Bm", "Bm7", "B7",
    "C", "Cm", "C7", "Cm7", "C#", "C#m",
    "D", "Dm", "D7", "Dm7", "D#",
    "E", "Em", "E7", "Em7", "Eb",
    "F", "Fm", "F7", "F#", "F#m", "F#m7",
    "G", "Gm", "G7", "Gm7", "G#", "G#m",
]);

// Extended chord regex for the strict pass — handles the full grammar
function isChord(text: string): boolean {
    const clean = text.trim().replace(/[^\w#b♯♭°+Δ\/()]/g, '');
    if (!clean || clean.length === 0) return false;

    // Quick reject: must start with A-G
    if (!CHORD_PREFILTER.test(clean)) return false;

    // Always-valid known chords
    if (ALWAYS_VALID_SHORT.has(clean)) return true;

    // Excluded words (exact match)
    if (EXCLUDED_WORDS.has(clean)) return false;

    // Try strict regex
    if (CHORD_REGEX.test(clean)) return true;

    // Fallback: more permissive pattern for complex chords like Fm7b5, G7#9, Bbmaj9, etc.
    const permissive = /^[A-G][b#\u266F\u266D]?(?:m|min|maj|M|dim|aug|°|\+|Δ)?(?:sus)?(?:add)?(?:\d{1,2})?(?:[b#\u266F\u266D]\d{1,2})?(?:\(.*?\))?(?:\/[A-G][b#\u266F\u266D]?)?$/;
    return permissive.test(clean);
}

// Contextual filter: is "A" or "Am" actually a chord here?
// Heuristic: if it's on a line where other clear chords exist, it's probably a chord
function isAmbiguousChord(text: string): boolean {
    const clean = text.trim();
    return clean === "A" || clean === "Am";
}

// ---- Span Processing ----

interface SpanItem {
    text: string;
    rect: DOMRect;
    y: number;
    x: number;
    r: number; // right edge
    b: number; // bottom edge
    w: number;
    h: number;
    span: HTMLSpanElement;
}

export function scanTextLayer(pageElement: HTMLElement): ScannedChord[] {
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return [];

    const chords: ScannedChord[] = [];
    const spans = Array.from(textLayer.querySelectorAll('span'));

    // Page bounds for percentage calculations
    const textLayerRect = textLayer.getBoundingClientRect();
    const pageElRect = pageElement.getBoundingClientRect();
    const pageRect = {
        left: Math.min(pageElRect.left, textLayerRect.left),
        right: Math.max(pageElRect.right, textLayerRect.right),
        top: Math.min(pageElRect.top, textLayerRect.top),
        bottom: Math.max(pageElRect.bottom, textLayerRect.bottom),
        width: 0,
        height: 0
    };
    pageRect.width = pageRect.right - pageRect.left;
    pageRect.height = pageRect.bottom - pageRect.top;

    if (pageRect.width === 0 || pageRect.height === 0) return [];

    // 1. Map spans to items with coordinates
    const items: SpanItem[] = spans.map(span => {
        const rect = span.getBoundingClientRect();
        return {
            text: span.textContent || "",
            rect,
            y: rect.top,
            x: rect.left,
            r: rect.right,
            b: rect.bottom,
            w: rect.width,
            h: rect.height,
            span
        };
    }).filter(i => i.text.trim().length > 0);

    if (items.length === 0) return [];

    // 2. Sort by Y (line) then X (position within line)
    const LINE_TOLERANCE = 5; // px
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) < LINE_TOLERANCE) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });

    // 3. First pass: merge adjacent spans on same line (handles kerning splits)
    const merged: SpanItem[] = [];
    if (items.length > 0) {
        let current = { ...items[0] };

        for (let i = 1; i < items.length; i++) {
            const next = items[i];
            const sameLine = Math.abs(current.y - next.y) < (current.h * 0.3);
            const gap = next.x - current.r;
            const isSingleChar = current.text.trim().length === 1 || next.text.trim().length === 1;
            const maxGap = isSingleChar ? (current.h * 0.5) : (current.h * 0.2);
            const isClose = gap >= -2 && gap < maxGap; // Allow tiny overlap (-2px)

            if (sameLine && isClose) {
                current = {
                    ...current,
                    text: current.text + next.text,
                    r: next.r,
                    w: next.r - current.x,
                    h: Math.max(current.h, next.h),
                    b: Math.max(current.b, next.b),
                };
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);
    }

    // 4. Second pass: build complete chords from root + modifiers/extensions
    // Handles cases where G, #, m, 7 are separate spans, including superscript numbers
    const assembled: SpanItem[] = [];
    for (let i = 0; i < merged.length; i++) {
        const current = merged[i];
        const trimmed = current.text.trim();

        // If current is a single chord root letter (A-G), try to assemble a full chord
        if (/^[A-G]$/.test(trimmed)) {
            let chordText = trimmed;
            let lastItem = current;
            let j = i + 1;

            while (j < merged.length) {
                const next = merged[j];
                const nextText = next.text.trim();

                // Classify what this fragment could be
                const isAccidental = /^[#b♯♭]+$/.test(nextText);
                const isQuality = /^(m|M|maj|min|dim|aug|sus|add|°|\+|Δ)+$/.test(nextText);
                const isNumber = /^\d+$/.test(nextText);
                const isCombo = /^(m\d|maj\d|min\d|dim\d|sus\d|add\d|m7|maj7|min7|dim7|aug7|add9|sus4|sus2|7sus|7#|7b|b5|#5|b9|#9|#11|b13)/.test(nextText);
                const isSlash = /^\/[A-G][#b♯♭]?$/.test(nextText);
                const isParen = /^\(.*\)$/.test(nextText);

                if (!isAccidental && !isQuality && !isNumber && !isCombo && !isSlash && !isParen) {
                    break;
                }

                // Vertical tolerance: very permissive for superscripts (numbers), normal for others
                const yTolerance = isNumber ? (lastItem.h * 2.5) : (lastItem.h * 1.2);
                if (Math.abs(lastItem.y - next.y) > yTolerance) break;

                // Horizontal tolerance
                const gap = next.x - lastItem.r;
                const maxGap = (isNumber || isAccidental) ? (lastItem.h * 1.5) : (lastItem.h * 1.0);
                if (gap > maxGap || gap < -lastItem.w) break;

                chordText += nextText;
                lastItem = next;
                j++;
            }

            // Build the assembled item with expanded bounds
            assembled.push({
                ...current,
                text: chordText,
                r: lastItem.r,
                w: lastItem.r - current.x,
                y: Math.min(current.y, lastItem.y),
                h: Math.max(current.b, lastItem.b) - Math.min(current.y, lastItem.y),
                b: Math.max(current.b, lastItem.b),
            });
            i = j - 1; // Skip consumed items
        } else {
            assembled.push(current);
        }
    }

    // 5. Group items by line for contextual filtering
    const lines: SpanItem[][] = [];
    let currentLine: SpanItem[] = [];
    let currentLineY = assembled.length > 0 ? assembled[0].y : 0;

    for (const item of assembled) {
        if (Math.abs(item.y - currentLineY) > LINE_TOLERANCE * 2) {
            if (currentLine.length > 0) lines.push(currentLine);
            currentLine = [];
            currentLineY = item.y;
        }
        currentLine.push(item);
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // 6. Filter for chords with contextual awareness
    for (const line of lines) {
        const lineChords: { item: SpanItem; text: string }[] = [];
        const hasUnambiguousChords = line.some(item => {
            const clean = item.text.trim().replace(/[^\w#b♯♭°+Δ\/()]/g, '');
            return isChord(clean) && !isAmbiguousChord(clean);
        });

        for (const item of line) {
            const text = item.text.trim();
            const clean = text.replace(/[^\w#b♯♭°+Δ\/()]/g, '');

            if (!isChord(clean)) continue;

            // For ambiguous chords (A, Am): only include if line has other clear chords
            if (isAmbiguousChord(clean) && !hasUnambiguousChords) continue;

            // Width sanity check — chord should be less than 15% of page width
            const wPct = (item.w / pageRect.width) * 100;
            if (wPct > 15) continue;

            // Calculate percentage coordinates
            let x = ((item.x - pageRect.left) / pageRect.width) * 100;
            let y = ((item.y - pageRect.top) / pageRect.height) * 100;
            const w = wPct;
            const h = (item.h / pageRect.height) * 100;

            // Clamp to valid range
            x = Math.min(Math.max(x, 0), 99);
            y = Math.min(Math.max(y, 0), 99);

            chords.push({
                id: crypto.randomUUID(),
                text: clean,
                x, y, w, h,
                pxHeight: item.h
            });
        }
    }

    return chords;
}
