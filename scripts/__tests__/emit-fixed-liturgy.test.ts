import { describe, it, expect } from "vitest"
// @ts-expect-error — plain .mjs script, no types
import { norm, stemOf, matchPagemap, buildProposal } from "../emit-fixed-liturgy.mjs"
import { lookupBookPage } from "@/lib/books/lookup"
import { getBook, listBooks } from "@/lib/books/registry"
import allowlist from "../fixed-liturgy.json"

/**
 * The proposal generator is a plain .mjs script, so it cannot import the
 * TypeScript matcher in `src/lib/books/lookup.ts` — it carries a port of that
 * module's `norm()`. A comment saying "keep these in sync" is not a mechanism;
 * this file is. It runs both implementations over the whole shipped corpus and
 * fails the moment they disagree.
 */
describe("emit-fixed-liturgy — norm() parity with lookup.ts", () => {
    /**
     * `lookupBookPage` does not expose `norm`, so parity is asserted through
     * its observable behaviour: every entry name in every pagemap book must
     * resolve to its own page under both implementations. Names are the only
     * strings either one ever normalizes, so the corpus is the whole domain.
     */
    it("every pagemap entry name resolves the same way under both matchers", () => {
        const pagemapSlugs = listBooks()
            .filter((b) => b.tier === "pagemap")
            .map((b) => b.slug)
        expect(pagemapSlugs.length).toBeGreaterThan(0)

        for (const slug of pagemapSlugs) {
            const book = getBook(slug)
            expect(book?.entries, `${slug} has entries`).toBeTruthy()

            for (const entry of book!.entries!) {
                for (const name of [entry.name, ...entry.aliases]) {
                    const script = matchPagemap(book, name)
                    const lib = lookupBookPage(slug, name)
                    expect(lib.ok).toBe(true)
                    if (!lib.ok) continue

                    // The script only ever ADOPTS an unambiguous exact hit.
                    // Whenever it does, lookupBookPage must agree — same page,
                    // and 'high' confidence (its own word for "commit this").
                    if (script.status === "exact") {
                        const high = lib.matches.filter((m) => m.confidence === "high")
                        expect(
                            high.map((m) => m.folio),
                            `${slug} / "${name}"`,
                        ).toContain(script.page)
                    } else {
                        // Never adopted → lookupBookPage must not have been
                        // unanimously confident about a single page either.
                        const highPages = new Set(
                            lib.matches.filter((m) => m.confidence === "high").map((m) => m.folio),
                        )
                        expect(highPages.size, `${slug} / "${name}" — script refused`).not.toBe(1)
                    }
                }
            }
        }
    })

    it("folds the same characters lookup.ts folds", () => {
        expect(norm("Bar'chu")).toBe("barchu")
        expect(norm("Bar’chu")).toBe("barchu")
        expect(norm("  Mi   Chamochah!  ")).toBe("mi chamochah")
        expect(norm("L'chah Dodi")).toBe("lchah dodi")
    })
})

describe("emit-fixed-liturgy — matchPagemap refuses what it cannot prove", () => {
    const crcSaturday = getBook("crc-saturday")!

    it("does NOT take the Sh'ma's page for Nishmat Kol Chai", () => {
        // "ni-SHMA-t" contains the Sh'ma's normalized alias as a substring.
        // A substring matcher hands back p.63 here; this one must not.
        const res = matchPagemap(crcSaturday, "Nishmat Kol Chai")
        expect(res.status).toBe("ambiguous")
        expect(res.page).toBeUndefined()
    })

    it("reports a name with no entry as 'none', not as a guess", () => {
        expect(matchPagemap(crcSaturday, "Ein Keloheinu").status).toBe("none")
    })
})

describe("emit-fixed-liturgy — stemOf", () => {
    it("strips the @book suffix so a shared unit matches in both books", () => {
        // amidah.avot-vimahot is filed under @shabbat-maariv even inside the
        // shacharit feed; the allow-list is keyed by the stem for that reason.
        expect(stemOf("amidah.avot-vimahot@shabbat-maariv")).toBe("amidah.avot-vimahot")
        expect(stemOf("no-suffix")).toBe("no-suffix")
    })
})

describe("emit-fixed-liturgy — proposal order comes from the feed", () => {
    const friday = (allowlist as Record<string, never> & {
        services: Record<string, { stems: { stem: string }[]; feedBook: string; pagemapBook: string }>
    }).services.friday

    it("emits rows in the feed book's own unit order, never re-sorted by page", () => {
        const feed = getBook(friday.feedBook)!
        const pagemap = getBook(friday.pagemapBook)!
        const { rows } = buildProposal(friday, feed, pagemap)
        const kept = rows.filter((r: { skipped?: string }) => !r.skipped)
        expect(kept.length).toBeGreaterThan(20)

        const feedOrder = feed.units!.map((u) => u.id)
        const emitted = kept.map((r: { feedUnitId: string }) => r.feedUnitId)
        const expected = feedOrder.filter((id) => emitted.includes(id))
        expect(emitted).toEqual(expected)
    })

    it("every allow-listed stem is found in the feed", () => {
        const feed = getBook(friday.feedBook)!
        const pagemap = getBook(friday.pagemapBook)!
        const { missing } = buildProposal(friday, feed, pagemap)
        expect(missing).toEqual([])
    })

    it("every emitted feed folio validates against the registry", () => {
        // The proposal's feed-side pages go straight into a template, so a
        // folio the registry would refuse must never leave this script.
        for (const key of ["friday", "saturday"] as const) {
            const service = (
                allowlist as unknown as {
                    services: Record<string, { feedBook: string; pagemapBook: string; stems: { stem: string }[] }>
                }
            ).services[key]
            const feed = getBook(service.feedBook)!
            const pagemap = getBook(service.pagemapBook)!
            const { rows } = buildProposal(service, feed, pagemap)
            for (const r of rows.filter((x: { skipped?: string }) => !x.skipped)) {
                const row = r as { label: string; feedFolio: number; pagemapFolio: number | null }
                expect(lookupBookPage(service.feedBook, row.label).ok).toBe(true)
                const entry = listBooks().find((b) => b.slug === service.feedBook)!
                expect(row.feedFolio, `${service.feedBook} / ${row.label}`).toBeLessThanOrEqual(
                    entry.pages,
                )
                if (row.pagemapFolio !== null) {
                    const pm = listBooks().find((b) => b.slug === service.pagemapBook)!
                    expect(
                        row.pagemapFolio,
                        `${service.pagemapBook} / ${row.label}`,
                    ).toBeLessThanOrEqual(pm.pages)
                }
            }
        }
    })
})
