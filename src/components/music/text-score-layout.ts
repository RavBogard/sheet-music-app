/**
 * Pure layout math for `TextScoreViewer` Fit mode — extracted so the
 * width-measurement + font-size calc can be unit-tested without rendering
 * (jsdom computes neither container-query units nor `clamp()`).
 *
 * WS-03 (v11.6-02-02): the inline calc this replaces measured the auto-fit
 * font from text-only lines only, treating every chord-lyric line as a
 * constant 40 chars. A long chorded line therefore rendered too large and
 * clipped (the container was `overflow-x-hidden`), or — on the `min(15px,…)`
 * path — shrank below legibility with no floor.
 */

export type ChordLyricChunk = { chord: string; lyric: string; isChord: boolean }

export type LineWidthInput =
    | { type: 'text-only'; textLength: number }
    | { type: 'chord-lyric'; chunks: ChordLyricChunk[] }

/**
 * Rendered character width of a chord-lyric line. The lyric row defines the
 * column width (see WS-04 — chords are width-neutral in Fit mode), but a
 * chord-only line (empty lyrics) is governed by the chord row, so take the
 * max of the two summed widths to stay correct for both shapes.
 */
export function chordLyricLineWidth(chunks: ChordLyricChunk[]): number {
    let lyric = 0
    let chord = 0
    for (const c of chunks) {
        lyric += c.lyric.length
        chord += c.chord.length
    }
    return Math.max(lyric, chord)
}

/**
 * The widest rendered line across all parsed groups, used as the denominator
 * for the Fit-mode auto-fit. `floor` keeps a tiny chart from dividing by ~0
 * (and matches the prior behavior's `Math.max(..., 40)`).
 */
export function maxRenderedLineLength(groups: LineWidthInput[], floor = 40): number {
    const widths = groups.map(g =>
        g.type === 'text-only' ? g.textLength : chordLyricLineWidth(g.chunks),
    )
    return Math.max(floor, ...widths)
}

/**
 * The Fit-mode font-size CSS string. Keeps the container-query basis
 * (`100cqi / ((maxLen + 2) * 0.605)`, where 0.605 ≈ monospace width/height)
 * and the `maxPx` cap, but wraps it in a `clamp()` with a legibility FLOOR
 * (`minPx`) so the font never shrinks below readable size. All three bounds
 * scale with `zoom` so the user's zoom intent is preserved at every bound.
 *
 * When the computed size bottoms out at the floor and the content is still
 * wider than the container, the viewer's `overflow-x-auto` lets the player
 * scroll to the right edge (WS-03 reachability) — the floor + scroll replace
 * the old shrink-to-illegible-or-clip behavior.
 */
export function fitFontSize({
    maxLen,
    zoom,
    minPx = 11,
    maxPx = 15,
}: {
    maxLen: number
    zoom: number
    minPx?: number
    maxPx?: number
}): string {
    const denom = (maxLen + 2) * 0.605
    return `clamp(calc(${minPx}px * ${zoom}), calc(100cqi / ${denom} * ${zoom}), calc(${maxPx}px * ${zoom}))`
}
