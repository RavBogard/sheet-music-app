
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

/**
 * Normalize Unicode music accidentals to ASCII equivalents.
 * Must run BEFORE any regex filtering that expects ASCII # and b.
 * Covers: ♯ (U+266F), ♭ (U+266D), ♮ (U+266E), fullwidth variants.
 */
function normalizeAccidentals(text: string): string {
    return text
        .replace(/\u266F/g, '#')   // ♯ MUSIC SHARP SIGN
        .replace(/\u266D/g, 'b')   // ♭ MUSIC FLAT SIGN
        .replace(/\u266E/g, '')    // ♮ MUSIC NATURAL SIGN (strip)
        .replace(/\uFF03/g, '#')   // ＃ FULLWIDTH NUMBER SIGN
        .replace(/\uFE5F/g, '#')   // ﹟ SMALL NUMBER SIGN
}

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
    const pageRect = pageElement.getBoundingClientRect();

    // 1. Map to objects with coordinates
    const items = spans.map(span => {
        const rect = span.getBoundingClientRect();
        return {
            // Normalize Unicode accidentals (♯→#, ♭→b) immediately so all
            // downstream regex matching works with ASCII characters only
            text: normalizeAccidentals(span.textContent || ""),
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
            // Don't merge two chord roots (e.g. "A" + "B" are separate chords)
            const bothAreRoots = /^[A-G]$/.test(current.text.trim()) && /^[A-G]$/.test(next.text.trim());
            // Accidentals may be superscripted — use larger Y tolerance
            const isAccidental = /^[#b♯♭]+$/.test(next.text.trim());
            const yThreshold = isAccidental ? (current.h * 1.5) : (current.h * 0.5);
            const sameLine2 = Math.abs(current.y - next.y) < yThreshold;
            const maxGap = (isSingleChar && bothChordRelevant && !bothAreRoots) ? (current.h * 1.5) : (current.h * 0.3);
            const isClose = gap >= 0 && gap < maxGap;

            if ((sameLine || sameLine2) && isClose && (bothChordRelevant || !isSingleChar) && !bothAreRoots) {
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
        const current = { ...merged[i] }

        if (/^[A-G]$/.test(current.text.trim())) {
            let chordText = current.text.trim()
            let lastItem = current
            let j = i + 1

            while (j < merged.length) {
                const next = merged[j]
                const nextText = next.text.trim()

                const isSharpOrFlat = /^[#b♯♭]+$/.test(nextText)
                const isQuality = /^(m|M|maj|min|dim|aug|sus|add|no|alt|dom)+$/.test(nextText)
                const isNumber = /^[0-9]+$/.test(nextText)
                const isCombo = /^(m7|m9|m11|m13|maj7|maj9|min7|dim7|add9|add11|sus4|sus2|no3|no5|dom7)$/.test(nextText)
                const isParen = /^\([^)]*\)$/.test(nextText)
                // Also catch accidental+quality combos like "#m", "#m7", "bm"
                const isAccidentalCombo = /^[#b♯♭](m|M|maj|min|dim|aug|sus|add|no|alt|dom)?[0-9]*$/.test(nextText)

                if (!isSharpOrFlat && !isQuality && !isNumber && !isCombo && !isParen && !isAccidentalCombo) {
                    break
                }

                // Y tolerance: very generous for accidentals — music fonts often
                // render sharps/flats significantly above or below the baseline.
                // Use 2.5x height for accidentals, 2x for numbers, 1.5x for others.
                const yTolerance = (isSharpOrFlat || isAccidentalCombo)
                    ? (lastItem.h * 2.5)
                    : isNumber ? (lastItem.h * 2.0) : (lastItem.h * 1.5)
                if (Math.abs(lastItem.y - next.y) > yTolerance) {
                    break
                }

                // X tolerance: music PDFs often have generous spacing between
                // chord parts — allow up to 2.5x character height gap for
                // accidentals, 2x for numbers, 1.2x for others
                const gap = next.x - lastItem.r
                const maxGap = (isSharpOrFlat || isAccidentalCombo)
                    ? (lastItem.h * 2.5)
                    : isNumber ? (lastItem.h * 1.5) : (lastItem.h * 1.2)
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

    // 4.5. Reverse merge: catch orphaned fragments that should attach to preceding chord
    // Catches: accidentals (#m, #m7, b7), quality suffixes (m, dim, sus4),
    // extension numbers (7, 9, 11, 13), and combos (m7, maj7, sus4)
    const cleanedItems: typeof finalItems = []
    for (let i = 0; i < finalItems.length; i++) {
        const item = finalItems[i]
        const text = item.text.trim()

        // Check if this item is an orphaned fragment that belongs to the previous chord
        const isOrphanedAccidental = /^[#b♯♭](m|M|maj|min|dim|aug|sus|add|no|alt|dom)?[0-9]*$/.test(text)
            || /^[#b♯♭]$/.test(text)
        const isOrphanedNumber = /^[0-9]{1,2}$/.test(text) // "7", "9", "11", "13"
        const isOrphanedQuality = /^(m|dim|aug|sus|add|maj|min|no|alt|dom)[0-9]*$/.test(text) // "m7", "sus4"

        const isOrphaned = isOrphanedAccidental || isOrphanedNumber || isOrphanedQuality

        if (isOrphaned && cleanedItems.length > 0) {
            const prev = cleanedItems[cleanedItems.length - 1]
            const prevText = prev.text.trim()

            // Previous item should look like a chord (starts with A-G, possibly with accidental/quality)
            const prevIsChordLike = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus|add|no|alt|dom)?[0-9]*/.test(prevText)
            // For orphaned numbers, previous could also be a quality like "m" that's part of "Em"
            const prevEndsChordLike = /[A-Gm#b0-9]$/.test(prevText) && /^[A-G]/.test(prevText)

            if (prevIsChordLike || prevEndsChordLike) {
                // Check proximity
                const gap = item.x - prev.r
                const yDiff = Math.abs(prev.y - item.y)
                // Numbers are often superscripted, so use generous Y tolerance
                const maxGap = isOrphanedNumber ? (prev.h * 2.0) : (prev.h * 3.0)
                const maxYDiff = isOrphanedNumber ? (prev.h * 2.5) : (prev.h * 2.5)

                if (gap < maxGap && gap >= -prev.w && yDiff < maxYDiff) {
                    cleanedItems[cleanedItems.length - 1] = {
                        ...prev,
                        text: prevText + text,
                        r: item.r,
                        w: item.r - prev.x,
                        h: Math.max(prev.h, item.h),
                        b: Math.max(prev.b, item.b),
                    }
                    continue
                }
            }
        }
        cleanedItems.push(item)
    }

    // 5. Filter for chords
    for (const item of cleanedItems) {
        const text = item.text.trim();

        // Clean stray characters; strip isolated closing parens
        const cleanText = text.replace(/[^\w#b\/()\-]/g, '').replace(/^\)+|\)+$/g, '');
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
