import { describe, it, expect } from "vitest"
import { carryHeadersThrough, type HeaderCarryAdapter } from "../census-headers"

interface Row {
    title: string
    type?: string
    songId?: string
}

const adapter: HeaderCarryAdapter<Row> = {
    labelOf: (r) => r.title,
    typeOf: (r) => r.type,
}

/**
 * R4-a. The case is Shir Shabbat's, reproduced from the template as it stood
 * before the round-3 census refresh and as it stood after.
 */
const PREVIOUS: Row[] = [
    { title: "Kabbalat Shabbat", type: "header" },
    { title: "Dodi Li", type: "song" },
    { title: "L'Cha Dodi Dmin .pdf", type: "song" },
    { title: "Dvar torah", type: "reading" },
    { title: "Ma'ariv Service", type: "header" },
    { title: "Barchu (walkdown)", type: "song" },
    { title: "Shema (major).pdf", type: "song" },
    { title: "T'filah", type: "header" },
    { title: "Adonai sfatai (trad)", type: "song" },
    { title: "Silent Prayer", type: "prayer" },
]

const REFRESHED: Row[] = [
    { title: "Dodi Li", type: "song", songId: "c1" },
    { title: "L'Cha Dodi Dmin .pdf", type: "song", songId: "c2" },
    { title: "Dvar torah", type: "reading" },
    { title: "Barchu (walkdown)", type: "song", songId: "c3" },
    { title: "Shema (major).pdf", type: "song", songId: "c4" },
    { title: "Adonai sfatai (trad)", type: "song", songId: "c5" },
    { title: "Silent Prayer", type: "prayer" },
]

describe("carryHeadersThrough", () => {
    it("puts each header back in front of the row it introduced", () => {
        const out = carryHeadersThrough(PREVIOUS, REFRESHED, adapter)
        expect(out.rows.map((r) => r.title)).toEqual([
            "Kabbalat Shabbat",
            "Dodi Li",
            "L'Cha Dodi Dmin .pdf",
            "Dvar torah",
            "Ma'ariv Service",
            "Barchu (walkdown)",
            "Shema (major).pdf",
            "T'filah",
            "Adonai sfatai (trad)",
            "Silent Prayer",
        ])
        expect(out.carried.map((c) => c.outcome)).toEqual([
            "restored",
            "restored",
            "restored",
        ])
        expect(out.carried[1]).toEqual({
            label: "Ma'ariv Service",
            before: "Barchu (walkdown)",
            outcome: "restored",
        })
    })

    it("carries the refreshed row whole — it only ever inserts", () => {
        const out = carryHeadersThrough(PREVIOUS, REFRESHED, adapter)
        expect(out.rows.find((r) => r.title === "Dodi Li")?.songId).toBe("c1")
        expect(out.rows.filter((r) => r.type !== "header")).toEqual(REFRESHED)
    })

    it("anchors by name, not by index, because a refresh moves everything", () => {
        const reordered: Row[] = [
            { title: "Silent Prayer", type: "prayer" },
            { title: "Adonai sfatai (trad)", type: "song" },
            { title: "Barchu (walkdown)", type: "song" },
            { title: "Dodi Li", type: "song" },
        ]
        const out = carryHeadersThrough(PREVIOUS, reordered, adapter)
        const titles = out.rows.map((r) => r.title)
        expect(titles.indexOf("Kabbalat Shabbat")).toBe(titles.indexOf("Dodi Li") - 1)
        expect(titles.indexOf("T'filah")).toBe(titles.indexOf("Adonai sfatai (trad)") - 1)
    })

    it("changes nothing the second time it runs", () => {
        const once = carryHeadersThrough(PREVIOUS, REFRESHED, adapter)
        const twice = carryHeadersThrough(PREVIOUS, once.rows, adapter)
        expect(twice.rows).toEqual(once.rows)
        expect(twice.carried.every((c) => c.outcome === "already-present")).toBe(true)
    })

    it("reports a header whose whole section the census dropped", () => {
        // A sign over nothing is worse than no sign; it does not get parked at
        // the end of the list to make the count come out right.
        const withoutMaariv = REFRESHED.filter(
            (r) => !["Barchu (walkdown)", "Shema (major).pdf"].includes(r.title),
        )
        const out = carryHeadersThrough(PREVIOUS, withoutMaariv, adapter)
        const maariv = out.carried.find((c) => c.label === "Ma'ariv Service")
        expect(maariv?.outcome).toBe("appended-no-anchor")
        expect(out.rows.some((r) => r.title === "Ma'ariv Service")).toBe(false)
    })

    it("treats the Firestore spelling of a header as a header", () => {
        const prev: Row[] = [
            { title: "INTRO", type: "section" },
            { title: "Fiddley Tune", type: "song" },
        ]
        const out = carryHeadersThrough(prev, [{ title: "Fiddley Tune", type: "song" }], adapter)
        expect(out.rows.map((r) => r.title)).toEqual(["INTRO", "Fiddley Tune"])
    })

    it("does not stop at a header to find the next section's anchor", () => {
        // Two headers in a row: the first introduces nothing of its own, so it
        // must not steal the second's anchor.
        const prev: Row[] = [
            { title: "Opening", type: "header" },
            { title: "Service", type: "header" },
            { title: "Dodi Li", type: "song" },
        ]
        const out = carryHeadersThrough(prev, [{ title: "Dodi Li", type: "song" }], adapter)
        expect(out.carried.find((c) => c.label === "Opening")?.outcome).toBe(
            "appended-no-anchor",
        )
        expect(out.rows.map((r) => r.title)).toEqual(["Service", "Dodi Li"])
    })
})
