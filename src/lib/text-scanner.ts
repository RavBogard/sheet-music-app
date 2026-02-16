
/**
 * Scans the react-pdf Text Layer for chords.
 * 
 * Strategy:
 * 1. Find the text layer container.
 * 2. Iterate over all <span> elements (text items).
 * 3. Filter for items that look like Chords using Regex.
 * 4. Return their position and dimensions relative to the page.
 */

import { CHORD_REGEX, EXCLUDED_WORDS, cleanChordText } from './chord-utils'

export interface ScannedChord {
    id: string;
    text: string;
    x: number; // percentage
    y: number; // percentage
    w: number; // percentage
    h: number; // percentage
    pxHeight: number;
}

// No single-letter chord roots are ambiguous in a dedicated music chart app.
// Lowercase "a" won't match the regex (requires uppercase A-G).

export function scanTextLayer(pageElement: HTMLElement): ScannedChord[] {
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
        return [];
    }

    const chords: ScannedChord[] = [];
    const spans = Array.from(textLayer.querySelectorAll('span'));

    // Bounds for percentage calculations
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

    // 1. Map to objects with coordinates
    const items = spans.map(span => {
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

    // 2. Sort by Y (Line) then X (Position)
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });

    // 3. Merge adjacent items that form a single chord
    // PDF text layers often split chords across spans: "F" + "#" + "m" + "7"
    const merged: typeof items = [];

    if (items.length > 0) {
        let current = { ...items[0] };

        for (let i = 1; i < items.length; i++) {
            const next = items[i];

            const sameLine = Math.abs(current.y - next.y) < (current.h * 0.5);
            const gap = next.x - current.r;
            const isSingleChar = current.text.trim().length === 1 || next.text.trim().length === 1;
            // Only merge single chars if both are chord-relevant (letters, accidentals, numbers)
            const isChordChar = (t: string) => /^[A-Ga-g#b♯♭0-9mMdiasugnol]+$/.test(t.trim());
            const bothChordRelevant = isChordChar(current.text) && isChordChar(next.text);
            const maxGap = (isSingleChar && bothChordRelevant) ? (current.h * 1.0) : (current.h * 0.3);
            const isClose = gap >= 0 && gap < maxGap;

            if (sameLine && isClose && (bothChordRelevant || !isSingleChar)) {
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

    // 4. Post-merge: aggressively combine chord parts on same line
    // Handles cases where G, #, m, 7 are all separate spans
    // Also handles superscript numbers (different Y)
    const finalItems: typeof merged = []

    for (let i = 0; i < merged.length; i++) {
        let current = { ...merged[i] }

        if (/^[A-G]$/.test(current.text.trim())) {
            let chordText = current.text.trim()
            let lastItem = current
            let j = i + 1

            while (j < merged.length) {
                const next = merged[j]
                const nextText = next.text.trim()

                const isSharpOrFlat = /^[#b♯♭]$/.test(nextText)
                const isQuality = /^(m|M|maj|min|dim|aug|sus|add|no|alt|dom)+$/.test(nextText)
                const isNumber = /^[0-9]+$/.test(nextText)
                const isCombo = /^(m7|m9|m11|m13|maj7|maj9|min7|dim7|add9|add11|sus4|sus2|no3|no5|dom7)$/.test(nextText)
                const isParen = /^\([^)]*\)$/.test(nextText)

                if (!isSharpOrFlat && !isQuality && !isNumber && !isCombo && !isParen) {
                    break
                }

                // Y tolerance: generous for all chord parts — music fonts often
                // render accidentals and qualities at slightly different baselines
                const yTolerance = isNumber ? (lastItem.h * 2.5) : (lastItem.h * 1.8)
                if (Math.abs(lastItem.y - next.y) > yTolerance) {
                    break
                }

                // X tolerance: music PDFs often have generous spacing between
                // chord parts — allow up to 2x character height gap
                const gap = next.x - lastItem.r
                const maxGap = isNumber ? (lastItem.h * 2.5) : (lastItem.h * 2.0)
                if (gap > maxGap || gap < -lastItem.w) {
                    break
                }

                chordText += nextText
                lastItem = next
                j++
            }

            const combinedItem = {
                ...current,
                text: chordText,
                r: lastItem.r,
                w: lastItem.r - current.x,
                y: Math.min(current.y, lastItem.y),
                h: Math.max(current.b, lastItem.b) - Math.min(current.y, lastItem.y),
            };
            finalItems.push(combinedItem);
            i = j - 1;
        } else {
            finalItems.push(current);
        }
    }

    // 5. Filter for chords
    for (const item of finalItems) {
        const text = item.text.trim();

        // Clean stray characters but preserve parentheses
        const cleanText = text.replace(/[^\w#b\/()\-]/g, '');
        if (!cleanText) continue;

        // Skip excluded words
        if (EXCLUDED_WORDS.has(cleanText)) continue;

        // Test against chord regex
        // Also test without parentheses for patterns like C(add9)
        const withoutParens = cleanText.replace(/[()]/g, '');
        if (!CHORD_REGEX.test(cleanText) && !CHORD_REGEX.test(withoutParens)) continue;

        // Calculate relative percentages
        let x = ((item.x - pageRect.left) / pageRect.width) * 100;
        let y = ((item.y - pageRect.top) / pageRect.height) * 100;
        const w = (item.w / pageRect.width) * 100;
        const h = (item.h / pageRect.height) * 100;

        // Clamp
        x = Math.min(Math.max(x, 0), 99);
        y = Math.min(Math.max(y, 0), 99);

        // Sanity check: chord width should be reasonable (< 15% of page)
        if (w > 15) {
            continue;
        }

        chords.push({
            id: crypto.randomUUID(),
            text: cleanChordText(withoutParens),
            x, y, w, h,
            pxHeight: item.h
        });
    }

    return chords;
}
