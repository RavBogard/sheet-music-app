/**
 * Parity test — `scripts/lib/index-name-fields-compute.mjs` (pure-JS mirror,
 * used by `scripts/backfill-library-normalizedname.mjs`) MUST produce
 * byte-for-byte identical output to the canonical TS helper at
 * `src/lib/library/recompute-index-name-fields.ts` (which in turn drives
 * `src/lib/library-upload.ts:490-495` PCU writes).
 *
 * Lane: `normalizedname-backfill-apply` (FINDING-4 backfill). The script
 * cannot import the TS helper without a tsx/ts-node toolchain, so it
 * carries an inlined JS mirror. Drift between mirror and canonical = a
 * silent backfill bug (would re-introduce dedup blindness). This test
 * exists to fail loudly the moment either side diverges.
 *
 * Fixture covers every branch of `titleSpecificity`'s feature extractor:
 * paren-clarifier, hyphen-composer, generic liturgical stem, sibling counts
 * 1/2/5, multi-token (≥3), ALL-CAPS low-effort, underscore-lowercase
 * low-effort, empty/whitespace, diacritics, Hebrew apostrophe (`'`), and
 * combinations.
 *
 * If you change the canonical TS, run this test; if it fails, mirror the
 * change into `scripts/lib/index-name-fields-compute.mjs` in the SAME
 * commit. Do not weaken the test to accommodate drift.
 */

import { describe, expect, it } from "vitest"

import {
    recomputeIndexNameFields as canonical,
} from "@/lib/library/recompute-index-name-fields"
// Mirror module — pure JS sibling of the canonical TS helper, used by the
// ops .mjs script which cannot import TS without a loader. Resolved via
// Node module resolution at vitest runtime.
import { recomputeIndexNameFields as mirror } from "../../../../scripts/lib/index-name-fields-compute.mjs"

interface Case {
    title: string
    siblings: number
    note: string
}

const FIXTURES: Case[] = [
    // ---- branch: generic liturgical stem, unique vs shared ----
    { title: "Hashkivenu", siblings: 1, note: "generic stem, unique" },
    { title: "Hashkivenu", siblings: 2, note: "generic stem, shared" },
    { title: "Hashkivenu (Klepper-Freelander)", siblings: 2, note: "generic stem + paren clarifier" },
    { title: "Hashkivenu - Friedman", siblings: 2, note: "generic stem + hyphen-composer" },
    { title: "Eitz Chayim - Weisenberg", siblings: 1, note: "generic stem + hyphen-composer + unique" },

    // ---- branch: non-generic stem ----
    { title: "Mizmor L'David", siblings: 1, note: "non-generic, unique" },
    { title: "Mizmor L'David", siblings: 5, note: "non-generic, shared (5 siblings)" },
    { title: "Ana B'Koach (Carlebach)", siblings: 1, note: "non-generic + paren" },

    // ---- branch: token count ----
    { title: "Eli", siblings: 1, note: "1 token" },
    { title: "Eli Eli", siblings: 1, note: "2 tokens" },
    { title: "Eli Eli Eli", siblings: 1, note: "3 tokens — +0.1 bonus" },
    { title: "Yedid Nefesh revised 1-1-26", siblings: 1, note: "multi-token w/ hyphenated date" },

    // ---- branch: low-effort signals ----
    { title: "ADON OLAM", siblings: 1, note: "ALL-CAPS — low-effort" },
    { title: "adon_olam_v2", siblings: 1, note: "underscore-lowercase — low-effort" },
    { title: "ABC", siblings: 1, note: "min-length ALL-CAPS" },
    { title: "ab", siblings: 1, note: "2-char (below ALL-CAPS floor)" },

    // ---- branch: edge cases ----
    { title: "", siblings: 1, note: "empty title" },
    { title: "   ", siblings: 1, note: "whitespace-only" },
    { title: "Hashkīvēnu", siblings: 1, note: "diacritics — NFKD fold" },
    { title: "Yedid Nefesh revised", siblings: 1, note: "sibling count floor (siblings=0 → safe=1)" },
    { title: "Foo", siblings: 0, note: "siblings=0 normalizes to 1 (Math.max guard)" },
    { title: "Foo", siblings: 1.7, note: "siblings non-integer normalizes via Math.floor" },

    // ---- branch: punctuation handling ----
    { title: "May the Memory - Full Score", siblings: 1, note: "hyphen-composer with multi-word suffix" },
    { title: "Tu Bishvat (Folk)", siblings: 1, note: "paren clarifier, non-generic stem" },
    { title: "Adonai S'fatai", siblings: 1, note: "Hebrew apostrophe (curly variant)" },
    { title: "Adonai S'fatai", siblings: 1, note: "Hebrew apostrophe (straight ASCII)" },
]

describe("script mirror parity — scripts/lib/index-name-fields-compute.mjs vs src/lib/library/recompute-index-name-fields.ts", () => {
    for (const { title, siblings, note } of FIXTURES) {
        it(`byte-for-byte parity: "${title}" siblings=${siblings} (${note})`, () => {
            const c = canonical(title, siblings)
            const m = mirror(title, siblings)
            expect(m).toEqual(c)
            // Defense in depth — assert each field's primitive type too so a
            // future stringly-typed drift can't sneak past `toEqual`.
            expect(typeof m.nameLower).toBe("string")
            expect(typeof m.normalizedName).toBe("string")
            expect(typeof m.stem).toBe("string")
            expect(typeof m.titleSpecificity).toBe("number")
        })
    }

    it("covers every titleSpecificity feature branch (smoke)", () => {
        // Touch each branch in extractFeatures so a regression touching only
        // one branch can't pass parity solely because the fixture missed it.
        const branchesSeen = {
            paren: false,
            hyphenComposer: false,
            generic: false,
            uniqueSibling: false,
            sharedSibling: false,
            threeTokens: false,
            allCaps: false,
            underscoreLower: false,
        }
        for (const { title, siblings } of FIXTURES) {
            const trimmed = title.trim()
            if (/\([^)]+\)/.test(trimmed)) branchesSeen.paren = true
            if (/\s+-\s+\S+/.test(trimmed)) branchesSeen.hyphenComposer = true
            if (
                trimmed.length >= 3 &&
                trimmed === trimmed.toUpperCase() &&
                /[A-Z]/.test(trimmed) &&
                !/[a-z]/.test(trimmed)
            )
                branchesSeen.allCaps = true
            if (/^[a-z0-9_]+$/.test(trimmed) && trimmed.includes("_"))
                branchesSeen.underscoreLower = true
            if (
                ["hashkivenu", "adon olam", "eitz chayim"].includes(
                    trimmed.toLowerCase().replace(/\([^)]*\)/g, "").trim(),
                )
            )
                branchesSeen.generic = true
            const sf = Math.max(1, Math.floor(siblings))
            if (sf === 1) branchesSeen.uniqueSibling = true
            if (sf >= 2) branchesSeen.sharedSibling = true
            const norm = trimmed
                .normalize("NFKD")
                .toLowerCase()
                .replace(/[_\s\-]+/g, " ")
                .replace(/[^\p{L}\p{N} '’]/gu, "")
                .trim()
            if (norm && norm.split(/\s+/).length >= 3) branchesSeen.threeTokens = true
        }
        for (const [branch, seen] of Object.entries(branchesSeen)) {
            expect(seen, `fixture missing coverage for ${branch}`).toBe(true)
        }
    })
})
