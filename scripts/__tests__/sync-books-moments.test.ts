import { describe, it, expect } from "vitest"
import { trimMoments } from "../ops/sync-books.mjs"

/**
 * Part E — consuming `moments.json`.
 *
 * `trimMoments` is the whole decision surface of the sync step: which artifact
 * is acceptable, and what of it reaches this repo. It is pure, so every branch
 * — including the refusals — is driven from fixtures here rather than from a
 * build in another repository.
 *
 * The refusals are the point. A moments file built from a different commit than
 * the feeds this repo's page numbers came from would pair one build's folios
 * with another build's unit ids, silently and permanently.
 */

const VOLUMES = [
    { slug: "shabbat-maariv", pin: "6f61874-LICENSED" },
    { slug: "shabbat-shacharit", pin: "6f61874-LICENSED" },
    { slug: "shirei-tshuvah", pin: "21417d9-LICENSED" },
]

const KNOWN = new Set([
    "crc-friday",
    "crc-saturday",
    "crc-machzor-2008",
    "shabbat-maariv",
    "shabbat-shacharit",
    "shirei-tshuvah",
])

function artifact(over: Record<string, unknown> = {}) {
    return {
        schemaVersion: 1,
        producedBy: "emit_moments.py",
        builtAt: "2026-09-14T15:00:00Z",
        sources: [
            { book: "shabbat-maariv", feed: "…", gitSha: "6f61874-LICENSED", pin: "press", pinValue: "6f61874-LICENSED" },
            { book: "shabbat-shacharit", feed: "…", gitSha: "6f61874-LICENSED", pin: "press", pinValue: "6f61874-LICENSED" },
            { book: "shirei-tshuvah", feed: "…", gitSha: "21417d9-LICENSED", pin: "press", pinValue: "21417d9-LICENSED" },
            { book: "legacy-slichot", feed: "…", gitSha: "abc1234", pin: "head", pinValue: "HEAD" },
        ],
        moments: [
            {
                id: "mi-chamocha",
                display: { en: "Mi Chamocha" },
                kind: "prayer",
                aliases: [],
                occurrences: [
                    {
                        book: "shabbat-maariv",
                        service: "shabbat-maariv",
                        section: { idx: 2, en: "Ma'ariv" },
                        unitId: "shma.mi-chamocha@shabbat-maariv",
                        folios: [28, 29],
                        foliosAre: "span",
                    },
                    {
                        book: "shirei-tshuvah",
                        service: "shirei-tshuvah",
                        section: { idx: 3, en: "Sh'ma" },
                        unitId: "shma.mi-chamocha@shirei-tshuvah",
                        folios: [61],
                        foliosAre: "span",
                    },
                    {
                        // A book this repo does not carry — must be dropped.
                        book: "legacy-slichot",
                        service: "legacy-slichot",
                        section: { idx: 1, en: "Slichot" },
                        unitId: "shma.mi-chamocha@legacy-slichot",
                        folios: [4],
                        foliosAre: "printed",
                    },
                ],
            },
            {
                // Every occurrence is in an unknown book — the whole moment goes.
                id: "slichot-only",
                display: { en: "Slichot Only" },
                kind: "prayer",
                aliases: [],
                occurrences: [
                    {
                        book: "legacy-slichot",
                        unitId: "x.slichot-only@legacy-slichot",
                        folios: [2],
                    },
                ],
            },
        ],
        ...over,
    }
}

describe("trimMoments — the pin guard", () => {
    it("refuses when a pinned volume's artifact was built from another commit", () => {
        const a = artifact()
        a.sources[2].gitSha = "deadbee-LICENSED" // shirei-tshuvah moved off its press pin
        expect(() => trimMoments(a, VOLUMES, KNOWN)).toThrow(/shirei-tshuvah/)
        expect(() => trimMoments(a, VOLUMES, KNOWN)).toThrow(/deadbee/)
        expect(() => trimMoments(a, VOLUMES, KNOWN)).toThrow(/press commit, never HEAD/)
    })

    it("refuses when the artifact carries no source row for a volume at all", () => {
        const a = artifact()
        a.sources = a.sources.filter((s) => s.book !== "shabbat-maariv")
        expect(() => trimMoments(a, VOLUMES, KNOWN)).toThrow(/no source row for 'shabbat-maariv'/)
    })

    it("accepts when the licence marker is present on one side only", () => {
        // `.live` pins `6f61874-LICENSED`; a producer that recorded the bare sha
        // is describing the SAME commit. Refusing there would be a false alarm.
        const a = artifact()
        a.sources[0].gitSha = "6f61874"
        expect(() => trimMoments(a, VOLUMES, KNOWN)).not.toThrow()
    })

    it("refuses an artifact from a different schema version", () => {
        expect(() => trimMoments(artifact({ schemaVersion: 2 }), VOLUMES, KNOWN)).toThrow(
            /schemaVersion 2/,
        )
    })
})

describe("trimMoments — what reaches this repo", () => {
    const { trimmed, occurrenceCount } = trimMoments(artifact(), VOLUMES, KNOWN)

    it("keeps only books this repo's registry carries", () => {
        const books = new Set(
            trimmed.moments.flatMap((m: { occurrences: { book: string }[] }) =>
                m.occurrences.map((o) => o.book),
            ),
        )
        expect([...books].sort()).toEqual(["shabbat-maariv", "shirei-tshuvah"])
        expect(occurrenceCount).toBe(2)
    })

    it("drops a moment whose every occurrence is in an unknown book", () => {
        expect(trimmed.moments.map((m: { id: string }) => m.id)).toEqual(["mi-chamocha"])
    })

    it("keeps exactly book, unitId and folios per occurrence — nothing else", () => {
        for (const m of trimmed.moments) {
            for (const o of m.occurrences) {
                expect(Object.keys(o).sort()).toEqual(["book", "folios", "unitId"])
            }
        }
    })

    it("carries no liturgical text and no Hebrew", () => {
        // The standing constraint: ids, names and pages cross into .live; text
        // never does. `section.en` and `service` are dropped by the trim above,
        // but this walks the RESULT rather than trusting that.
        const json = JSON.stringify(trimmed)
        expect(/[֐-׿]/.test(json)).toBe(false)
        expect(json).not.toContain("blocks")
        expect(json).not.toContain("caption")
    })

    it("refuses an artifact that yields nothing for this repo's books", () => {
        const a = artifact()
        a.moments = [a.moments[1]] // slichot-only
        expect(() => trimMoments(a, VOLUMES, KNOWN)).toThrow(
            /zero moments for the books this repo carries/,
        )
    })

    it("trims sources to this repo's books too", () => {
        expect(trimmed.sources.map((s: { book: string }) => s.book).sort()).toEqual([
            "shabbat-maariv",
            "shabbat-shacharit",
            "shirei-tshuvah",
        ])
    })
})
