import { describe, expect, it } from "vitest"
import {
    GENERIC_LITURGICAL_STEMS,
    STOP_AND_ASK_THRESHOLD,
    normalizeStem,
    titleSpecificity,
} from "./title-specificity"

describe("normalizeStem", () => {
    it("lowercases and collapses separators", () => {
        expect(normalizeStem("Hashkivenu")).toBe("hashkivenu")
        expect(normalizeStem("Shalom_Rav")).toBe("shalom rav")
        expect(normalizeStem("Shalom-Rav")).toBe("shalom rav")
        expect(normalizeStem("Shalom   Rav")).toBe("shalom rav")
    })

    it("folds diacritics", () => {
        expect(normalizeStem("Hashkīvēnu")).toBe("hashkivenu")
        expect(normalizeStem("Tzür Yisraēl")).toBe("tzur yisrael")
    })

    it("preserves apostrophes (Hebrew transliteration uses them as letters)", () => {
        expect(normalizeStem("V'ahavta")).toBe("v'ahavta")
        // Curly apostrophe also preserved
        expect(normalizeStem("V’ahavta")).toBe("v’ahavta")
    })

    it("strips other punctuation", () => {
        expect(normalizeStem("Oseh shalom!")).toBe("oseh shalom")
        expect(normalizeStem("Oseh shalom, please")).toBe("oseh shalom please")
    })

    it("returns empty string for empty/whitespace input", () => {
        expect(normalizeStem("")).toBe("")
        expect(normalizeStem("   ")).toBe("")
    })
})

describe("GENERIC_LITURGICAL_STEMS", () => {
    it("contains the canonical Reform liturgy pieces", () => {
        const required = [
            "hashkivenu",
            "veshamru",
            "mi chamocha",
            "oseh shalom",
            "adon olam",
            "niggun",
            "shalom rav",
            "lecha dodi",
        ]
        for (const stem of required) {
            expect(GENERIC_LITURGICAL_STEMS).toContain(stem)
        }
    })

    it("entries are pre-normalized (idempotent under normalizeStem)", () => {
        for (const stem of GENERIC_LITURGICAL_STEMS) {
            expect(normalizeStem(stem)).toBe(stem)
        }
    })
})

describe("titleSpecificity — AC-1 reference cases", () => {
    /**
     * Reference cases pinned from the W-02 scoring rule. The values below
     * supersede the W-02-01-PLAN.md AC-1 sums (which had arithmetic
     * typos — the math inside the parens was right, the sum-totals were
     * off). These tests are the contract.
     */

    it("Hashkivenu (generic, unique) → 0.40", () => {
        // base 0.5 + generic -0.3 + unique +0.2 = 0.40
        expect(titleSpecificity("Hashkivenu", 1)).toBe(0.4)
    })

    it("Hashkivenu (Klepper-Freelander) → 0.70", () => {
        // base 0.5 + parens +0.2 + generic -0.3 + unique +0.2 + 3+ tokens +0.1 = 0.70
        expect(titleSpecificity("Hashkivenu (Klepper-Freelander)", 1)).toBe(0.7)
    })

    it("Eitz Chayim - Weisenberg → 0.70", () => {
        // base 0.5 + hyphen-composer +0.2 + generic -0.3 + unique +0.2 + 3+ tokens +0.1 = 0.70
        expect(titleSpecificity("Eitz Chayim - Weisenberg", 1)).toBe(0.7)
    })

    it("shalom_rav (siblings=2) → 0.00 (clamped)", () => {
        // base 0.5 + generic -0.3 + shared -0.2 + low-effort -0.1 = -0.1, clamped to 0
        expect(titleSpecificity("shalom_rav", 2)).toBe(0)
    })
})

describe("titleSpecificity — feature isolation", () => {
    it("parenthesized clarifier adds +0.2", () => {
        expect(titleSpecificity("Foo (Bar)", 1)).toBe(0.9) // 0.5 +0.2 +0.2 = 0.9
        expect(titleSpecificity("Foo", 1)).toBe(0.7) // 0.5 +0.2 (unique)
    })

    it("hyphen-composer adds +0.2 (requires surrounding spaces)", () => {
        expect(titleSpecificity("Foo - Bar", 1)).toBe(0.9) // hyphen +0.2 + unique +0.2
        // No spaces around hyphen → not a composer pattern
        expect(titleSpecificity("Foo-Bar", 1)).toBe(0.7) // just unique +0.2
    })

    it("hyphen inside parens does NOT trigger hyphen-composer signal", () => {
        // "Klepper-Freelander" has a hyphen but it's inside the parens — that's
        // the composer-pair convention. We don't want to double-count
        // (parens already +0.2).
        const t = "Hashkivenu (Klepper-Freelander)"
        // Confirmed only one +0.2 boost (from parens), generic -0.3, unique +0.2,
        // 3-tokens +0.1 → 0.5 +0.2 -0.3 +0.2 +0.1 = 0.7
        expect(titleSpecificity(t, 1)).toBe(0.7)
    })

    it("generic stem penalty applies even with clarifier", () => {
        // "Hashkivenu (Klepper)" → 0.5 +0.2 parens -0.3 generic +0.2 unique = 0.6 (2 tokens, no token bonus)
        const generic = titleSpecificity("Hashkivenu (Klepper)", 1)
        // "Hava Nagilah (Klein)" → 0.5 +0.2 parens +0.2 unique +0.1 (3 tokens: hava nagilah klein) = 1.0
        const nonGeneric = titleSpecificity("Hava Nagilah (Klein)", 1)
        expect(generic).toBe(0.6)
        expect(nonGeneric).toBe(1)
    })

    it("3+ token bonus", () => {
        // 0.5 base + unique 0.2 + 3-tokens 0.1 = 0.8
        expect(titleSpecificity("Three Token Title", 1)).toBe(0.8)
        expect(titleSpecificity("Two Tokens", 1)).toBe(0.7) // no token bonus
    })

    it("siblings shared (>=2) penalty applies", () => {
        expect(titleSpecificity("Niggun", 1)).toBe(0.4) // -0.3 generic +0.2 unique = 0.4
        expect(titleSpecificity("Niggun", 2)).toBe(0) // -0.3 generic -0.2 shared = 0, clamp
        expect(titleSpecificity("Niggun", 5)).toBe(0) // same — penalty is binary at 2+
    })

    it("ALL CAPS detected as low-effort", () => {
        // "HALLELUJAH" → generic stem -0.3, unique +0.2, low-effort ALL CAPS -0.1 = 0.3
        // (one token, no token bonus)
        expect(titleSpecificity("HALLELUJAH", 1)).toBe(0.3)
        // Sanity: drop the low-effort signal by mixed-casing → should bump back to 0.4
        expect(titleSpecificity("Hallelujah", 1)).toBe(0.4)
    })

    it("underscore-lowercase detected as low-effort", () => {
        // "adon_olam" → matches /^[a-z0-9_]+$/ AND contains _ → low-effort -0.1
        expect(titleSpecificity("adon_olam", 1)).toBe(0.3) // -0.3 +0.2 -0.1 = -0.2 → wait
        // Actually: 0.5 base -0.3 generic +0.2 unique -0.1 low-effort = 0.3 ✓
    })

    it("clamps to [0, 1]", () => {
        // Extreme negative
        expect(titleSpecificity("hashkivenu", 5)).toBe(0) // -0.3 -0.2 -0.1 (lowercase but no underscore so NOT low-effort)
        // Actually "hashkivenu" lowercase letters only — does it match low-effort?
        // /^[a-z0-9_]+$/ matches lowercase letters; but it requires `.includes("_")` to be low-effort.
        // So "hashkivenu" is NOT low-effort. -0.3 -0.2 = 0.0 from 0.5.
        // For an extreme low test, use ALL CAPS shared generic
        expect(titleSpecificity("OSEH SHALOM", 3)).toBe(0) // -0.3 -0.2 -0.1 +0.0 token bonus none? "oseh shalom" = 2 tokens. = -0.6 from 0.5 → -0.1 → 0
        // Extreme positive — single match, parens, hyphen-composer, 4 tokens, non-generic
        expect(titleSpecificity("Hava Nagila (Friedman - Festive Version)", 1)).toBe(1)
        // 0.5 +0.2 parens +0.2 hyphen +0.2 unique +0.1 tokens = 1.2 → clamped 1.0
    })

    it("empty title returns 0", () => {
        expect(titleSpecificity("", 1)).toBe(0)
        expect(titleSpecificity("   ", 1)).toBe(0)
    })

    it("treats siblingsInCatalog < 1 as 1 (safe floor)", () => {
        // Defensive: if caller passes 0 by mistake, treat as unique (no double-penalty)
        expect(titleSpecificity("Foo (Bar)", 0)).toBe(0.9) // same as siblings=1
    })

    it("non-integer siblings rounded down", () => {
        expect(titleSpecificity("Foo (Bar)", 1.7)).toBe(0.9) // floor → 1
        expect(titleSpecificity("Foo (Bar)", 2.9)).toBe(0.5) // floor → 2, shared penalty
    })

    it("rounds to 2 decimals", () => {
        // Every computed value lands on a multiple of 0.1, so this is mostly a
        // future-proofing test. Re-run if the formula gains finer-grained weights.
        const s = titleSpecificity("Foo (Bar)", 1)
        expect(s).toBe(Math.round(s * 100) / 100)
    })
})

describe("STOP_AND_ASK_THRESHOLD", () => {
    it("is 0.5 (single source of truth)", () => {
        expect(STOP_AND_ASK_THRESHOLD).toBe(0.5)
    })

    it("bare generic title with unique catalog entry sits BELOW threshold", () => {
        // The canonical Bar Mitzvah failure: agent confidently bonds the only
        // "Hashkivenu" in the catalog. Threshold should catch this.
        expect(titleSpecificity("Hashkivenu", 1)).toBeLessThan(STOP_AND_ASK_THRESHOLD)
    })

    it("disambiguated generic title sits ABOVE threshold", () => {
        // Once disambiguated, agent should proceed without asking.
        expect(titleSpecificity("Hashkivenu (Klepper-Freelander)", 1))
            .toBeGreaterThanOrEqual(STOP_AND_ASK_THRESHOLD)
    })
})
