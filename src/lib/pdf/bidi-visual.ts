/**
 * Single-line visual reordering for right-to-left text in a PDF.
 *
 * pdf-lib draws glyphs left-to-right in the order it is given, with no bidi
 * support, so Hebrew stored in logical order prints backwards. This module
 * turns ONE line of logical-order text into the left-to-right glyph order that
 * reads correctly on paper. It is a compact implementation of the parts of the
 * Unicode Bidirectional Algorithm (UAX #9) a printed list of names and titles
 * needs:
 *
 *  - paragraph direction from the first strong character (P2/P3) unless given;
 *  - weak types W1–W7 (combining marks inherit, "12", "p. 34", "3:30", "10%"
 *    stay together as numbers);
 *  - neutrals N1/N2 (spaces and punctuation take the direction of the text
 *    around them, else the paragraph direction);
 *  - implicit levels I1/I2, trailing-whitespace reset L1, reversal L2 and
 *    bracket mirroring L4.
 *
 * Not implemented (and not needed by anything that calls it today): explicit
 * embeddings/overrides/isolates (U+202A–U+202E, U+2066–U+2069 are dropped),
 * Arabic-letter (AL/AN) rules, and bracket-pair matching N0 (brackets resolve
 * as ordinary neutrals, which gives the same answer for brackets that sit
 * inside a single-direction run — the common case).
 *
 * Callers wrap text in LOGICAL order first (widths do not depend on order),
 * then reorder each wrapped line for drawing.
 */

export type Direction = "ltr" | "rtl"

type BidiClass = "L" | "R" | "EN" | "ES" | "ET" | "CS" | "NSM" | "WS" | "ON"

const HEBREW_RE = /[֐-׿יִ-ﭏ]/

/** True if the string contains any Hebrew-block character (letters or points). */
export function hasHebrew(s: string | null | undefined): boolean {
    return typeof s === "string" && HEBREW_RE.test(s)
}

const LRM = 0x200e
const RLM = 0x200f

function isHebrewNsm(cp: number): boolean {
    return (
        (cp >= 0x0591 && cp <= 0x05bd) ||
        cp === 0x05bf ||
        cp === 0x05c1 ||
        cp === 0x05c2 ||
        cp === 0x05c4 ||
        cp === 0x05c5 ||
        cp === 0x05c7 ||
        cp === 0xfb1e
    )
}

function isStrongR(cp: number): boolean {
    if (cp === RLM) return true
    if (cp >= 0x0590 && cp <= 0x05ff) return !isHebrewNsm(cp)
    if (cp >= 0xfb1d && cp <= 0xfb4f) return cp !== 0xfb1e
    return false
}

const LETTER = /\p{L}/u
const MARK = /\p{M}/u
const DIGIT = /\p{Nd}/u
const CURRENCY = /\p{Sc}/u

function classify(ch: string): BidiClass {
    const cp = ch.codePointAt(0)!
    if (isStrongR(cp)) return "R"
    if (isHebrewNsm(cp) || MARK.test(ch)) return "NSM"
    if (cp === LRM) return "L"
    if (DIGIT.test(ch)) return "EN"
    if (LETTER.test(ch)) return "L"
    if (ch === "+" || ch === "-" || ch === "−") return "ES"
    if (ch === "#" || ch === "%" || ch === "°" || ch === "‰" || CURRENCY.test(ch))
        return "ET"
    if (ch === "," || ch === "." || ch === "/" || ch === ":" || ch === " ") return "CS"
    if (/\s/.test(ch)) return "WS"
    return "ON"
}

function strongOf(ch: string): Direction | null {
    const c = classify(ch)
    return c === "R" ? "rtl" : c === "L" ? "ltr" : null
}

/** Direction of the first strong (L or R) character, or null if none. */
export function firstStrongDirection(s: string | null | undefined): Direction | null {
    if (typeof s !== "string") return null
    for (const ch of s) {
        const d = strongOf(ch)
        if (d) return d
    }
    return null
}

const MIRROR: Record<string, string> = {
    "(": ")",
    ")": "(",
    "[": "]",
    "]": "[",
    "{": "}",
    "}": "{",
    "<": ">",
    ">": "<",
    "«": "»",
    "»": "«",
    "‹": "›",
    "›": "‹",
}

// Explicit embedding / override / isolate controls: not supported, dropped.
const EXPLICIT_CONTROLS = /[‪-‮⁦-⁩]/g

export interface VisualOptions {
    /** Paragraph direction. Default: first strong character, else "ltr". */
    base?: Direction
    /**
     * Where a right-to-left letter's combining marks (niqqud) go in the output.
     * true (default): marks BEFORE their base letter in visual order — right for
     * fonts like Alef whose marks have zero advance and are drawn in the glyph
     * box that follows them. false: marks after the base (UAX #9 rule L3), for
     * fonts whose marks hang back over the preceding glyph.
     */
    marksBeforeBase?: boolean
}

interface Cluster {
    /** Base character followed by its combining marks, logical order. */
    chars: string[]
    level: number
}

/**
 * Reorder one line from logical to visual (left-to-right drawing) order.
 * A line with no right-to-left characters in an LTR paragraph is returned
 * unchanged.
 */
export function toVisual(line: string, options: VisualOptions = {}): string {
    const text = line.replace(EXPLICIT_CONTROLS, "")
    const chars = Array.from(text)
    if (chars.length === 0) return ""
    const base: Direction = options.base ?? firstStrongDirection(text) ?? "ltr"
    if (base === "ltr" && !chars.some((c) => classify(c) === "R")) {
        return chars.filter((c) => c !== "‎" && c !== "‏").join("")
    }
    const marksBeforeBase = options.marksBeforeBase ?? true
    const baseLevel = base === "rtl" ? 1 : 0
    const sos: BidiClass = base === "rtl" ? "R" : "L"
    const n = chars.length
    const orig = chars.map(classify)
    const types = orig.slice()

    // W1: NSM takes the type of the previous character (sos at the start).
    for (let i = 0; i < n; i++) {
        if (types[i] === "NSM") types[i] = i === 0 ? sos : types[i - 1]
    }
    // W2 (AL→AN) and W3 do not apply without Arabic letters.
    // W4: a single ES/CS between two ENs becomes EN.
    for (let i = 1; i < n - 1; i++) {
        if ((types[i] === "ES" || types[i] === "CS") && types[i - 1] === "EN" && types[i + 1] === "EN") {
            types[i] = "EN"
        }
    }
    // W5: a sequence of ETs adjacent to an EN becomes EN.
    for (let i = 0; i < n; i++) {
        if (types[i] !== "ET") continue
        let j = i
        while (j < n && types[j] === "ET") j++
        const touches = (i > 0 && types[i - 1] === "EN") || (j < n && types[j] === "EN")
        if (touches) for (let k = i; k < j; k++) types[k] = "EN"
        i = j - 1
    }
    // W6: remaining separators/terminators are neutral.
    for (let i = 0; i < n; i++) {
        if (types[i] === "ES" || types[i] === "ET" || types[i] === "CS") types[i] = "ON"
    }
    // W7: EN after an L context (or sos L) is L.
    let lastStrong: BidiClass = sos
    for (let i = 0; i < n; i++) {
        if (types[i] === "L" || types[i] === "R") lastStrong = types[i]
        else if (types[i] === "EN" && lastStrong === "L") types[i] = "L"
    }
    // N1/N2: neutrals between same-direction text take it; else the base.
    const dirOf = (t: BidiClass): "L" | "R" | null =>
        t === "L" ? "L" : t === "R" || t === "EN" ? "R" : null
    for (let i = 0; i < n; i++) {
        if (types[i] !== "ON" && types[i] !== "WS") continue
        let j = i
        while (j < n && (types[j] === "ON" || types[j] === "WS")) j++
        const before = i === 0 ? sos : dirOf(types[i - 1])
        const after = j === n ? sos : dirOf(types[j])
        const resolved: BidiClass = before && before === after ? before : sos
        for (let k = i; k < j; k++) types[k] = resolved
        i = j - 1
    }
    // I1/I2: implicit levels.
    const levels = types.map((t) => {
        if (baseLevel === 0) return t === "R" ? 1 : t === "EN" ? 2 : 0
        return t === "L" || t === "EN" ? 2 : 1
    })
    // L1: trailing whitespace (and marks riding on it) returns to the base level.
    for (let i = n - 1; i >= 0; i--) {
        if (orig[i] === "WS" || (orig[i] === "NSM" && i > 0 && /\s/.test(chars[i - 1]))) {
            levels[i] = baseLevel
        } else break
    }

    // Cluster each base character with its following combining marks so the
    // marks travel with their letter through every reversal.
    const clusters: Cluster[] = []
    for (let i = 0; i < n; i++) {
        if (orig[i] === "NSM" && clusters.length > 0) {
            clusters[clusters.length - 1].chars.push(chars[i])
        } else {
            clusters.push({ chars: [chars[i]], level: levels[i] })
        }
    }

    // L2: from the highest level down to the lowest odd level, reverse every
    // maximal run at or above that level.
    let maxLevel = 0
    let minOdd = Infinity
    for (const c of clusters) {
        maxLevel = Math.max(maxLevel, c.level)
        if (c.level % 2 === 1) minOdd = Math.min(minOdd, c.level)
    }
    for (let lvl = maxLevel; lvl >= minOdd && lvl >= 1; lvl--) {
        for (let i = 0; i < clusters.length; i++) {
            if (clusters[i].level < lvl) continue
            let j = i
            while (j < clusters.length && clusters[j].level >= lvl) j++
            const run = clusters.slice(i, j).reverse()
            clusters.splice(i, j - i, ...run)
            i = j - 1
        }
    }

    // L4 mirroring + mark placement, then drop the directional marks.
    let out = ""
    for (const c of clusters) {
        const rtl = c.level % 2 === 1
        const [head, ...marks] = c.chars
        const glyph = rtl && MIRROR[head] ? MIRROR[head] : head
        out += rtl && marksBeforeBase ? marks.join("") + glyph : glyph + marks.join("")
    }
    return out.replace(/[‎‏]/g, "")
}
