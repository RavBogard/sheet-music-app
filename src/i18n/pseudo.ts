import type { Messages } from "@/i18n/core"

/**
 * Multi-tenant phase 7 — the pseudo-locale.
 *
 * `qps` (left to right) and `qps-rtl` (right to left) render every catalogue
 * string accented and wrapped in ⟦ ⟧, e.g. "Settings" → "⟦Šéţţîñĝš⟧". Any text
 * on screen WITHOUT the brackets did not come through `t()`: that is the
 * untranslated string. Placeholders (`{count}`, `%s`) are kept intact so
 * interpolation still works, and the text grows ~30% like real translations
 * do, which shows truncation early.
 */
export const PSEUDO_OPEN = "⟦"
export const PSEUDO_CLOSE = "⟧"

const ACCENTS: Record<string, string> = {
    a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
    n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
    A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ",
    N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
}

const PLACEHOLDER_RE = /(\{[A-Za-z_][A-Za-z0-9_]*\}|%s)/

/** Accent one template, leaving placeholders alone, and wrap it in the markers. */
export function pseudoize(template: string): string {
    const parts = template.split(PLACEHOLDER_RE)
    let letters = 0
    const body = parts
        .map((p, i) => {
            if (i % 2 === 1) return p // placeholder
            return p.replace(/[A-Za-z]/g, (ch) => {
                letters++
                return ACCENTS[ch] ?? ch
            })
        })
        .join("")
    // ~30% expansion, at least one pad char for short strings.
    const pad = letters > 0 ? "·".repeat(Math.max(1, Math.round(letters * 0.3))) : ""
    return `${PSEUDO_OPEN}${body}${pad}${PSEUDO_CLOSE}`
}

/** Pseudo catalogue derived from English. */
export function pseudoMessages(en: Messages): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(en)) out[k] = pseudoize(v)
    return out
}

/** True when a visible text fragment is fully inside pseudo markers (or carries no letters at all). */
export function isPseudoWrapped(text: string): boolean {
    const t = text.trim()
    if (!/\p{L}/u.test(t)) return true
    // Text outside every ⟦…⟧ span must carry no letters.
    // Innermost spans first, so a t() result interpolated into another nests fine.
    let outside = t
    let prev: string
    do {
        prev = outside
        outside = outside.replace(/⟦[^⟦⟧]*⟧/g, "")
    } while (outside !== prev)
    return !/\p{L}/u.test(outside)
}
