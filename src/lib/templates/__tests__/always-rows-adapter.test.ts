import { describe, it, expect } from "vitest"
import {
    mergeAlwaysRowsWith,
    sometimesRowsFor,
    familyForServiceType,
    type AlwaysMergeAdapter,
} from "../always-rows"

/**
 * The merge against a FIRESTORE template row rather than a code slot.
 *
 * The property worth protecting is that the adapter carries the row whole.
 * A Saturday morning template that gained page numbers and quietly lost every
 * chart binding would look completely fine in a diff of labels, and the band
 * would find out on a Saturday.
 */

interface Row {
    title: string
    type?: string
    songId?: string
    fileId?: string
    key?: string
    fixed?: boolean
    liturgyRefs?: Record<string, { unitId?: string; folio: number }>
}

const adapter: AlwaysMergeAdapter<Row> = {
    labelOf: (r) => r.title,
    typeOf: (r) => r.type,
    withRefs: (r, refs) => ({ ...r, liturgyRefs: { ...(r.liturgyRefs ?? {}), ...refs } }),
    make: (title, type, refs) => ({ title, type, fixed: true, ...(refs ? { liturgyRefs: refs } : {}) }),
}

describe("mergeAlwaysRowsWith", () => {
    it("keeps everything else on a row that gains a page", () => {
        const base: Row[] = [
            { title: "Bar'chu", type: "song", songId: "chart-1", fileId: "chart-1", key: "Am" },
        ]
        const out = mergeAlwaysRowsWith(base, "friday_night", adapter)
        const barchu = out.rows.find((r) => r.title === "Bar'chu")
        expect(barchu?.songId).toBe("chart-1")
        expect(barchu?.fileId).toBe("chart-1")
        expect(barchu?.key).toBe("Am")
        expect(barchu?.liturgyRefs?.["crc-friday"]?.folio).toBe(10)
        expect(out.notes.find((n) => n.slot === "Bar'chu")?.outcome).toBe("bound-to-slot")
    })

    it("does not un-bind another book when it writes this one's page", () => {
        const base: Row[] = [
            {
                title: "Bar'chu",
                type: "song",
                liturgyRefs: { "some-other-book": { folio: 99 } },
            },
        ]
        const out = mergeAlwaysRowsWith(base, "friday_night", adapter)
        const refs = out.rows.find((r) => r.title === "Bar'chu")?.liturgyRefs
        expect(refs?.["some-other-book"]?.folio).toBe(99)
        expect(refs?.["crc-friday"]?.folio).toBe(10)
    })

    it("adds a row only for an Always moment nothing named, marked fixed", () => {
        const base: Row[] = [{ title: "Bar'chu", type: "song" }]
        const out = mergeAlwaysRowsWith(base, "friday_night", adapter)
        const inserted = out.rows.filter((r) => r.fixed === true)
        expect(inserted.length).toBeGreaterThan(0)
        for (const r of inserted) expect(r.songId).toBeUndefined()
        // Nothing is ever removed.
        expect(out.rows.filter((r) => r.title === "Bar'chu")).toHaveLength(1)
        expect(out.rows.length).toBeGreaterThanOrEqual(base.length)
    })

    it("treats a section header the same as a header", () => {
        // The Firestore templates spell it `section`; the code slots spell it
        // `header`. A header anchoring an Always moment would put a page
        // number on a sign.
        const base: Row[] = [
            { title: "Bar'chu Walkdown", type: "section" },
            { title: "Barchu", type: "song" },
        ]
        const out = mergeAlwaysRowsWith(base, "friday_night", adapter)
        const header = out.rows.find((r) => r.type === "section")
        expect(header?.liturgyRefs).toBeUndefined()
    })

    it("returns the rows untouched for a family with no list", () => {
        const base: Row[] = [{ title: "Dodi Li", type: "song" }]
        const out = mergeAlwaysRowsWith(base, "bnei_mitzvah_saturday", adapter)
        expect(out.rows).toBe(base)
        expect(out.book).toBeNull()
    })
})

describe("families and their Sometimes lists", () => {
    it("lets the two inheriting service types reach their family", () => {
        expect(familyForServiceType("kabbalat-shabbat")).toBe("friday_night")
        expect(familyForServiceType("bnei_mitzvah_saturday")).toBe("shabbat_morning")
        expect(familyForServiceType("friday_night")).toBe("friday_night")
        expect(familyForServiceType("shabbat_morning")).toBe("shabbat_morning")
    })

    it("gives no family — and so no offer — to a service that follows no booklet", () => {
        expect(familyForServiceType("camp_sabra")).toBeNull()
        expect(familyForServiceType("")).toBeNull()
    })

    it("carries Daniel's Sometimes lists", () => {
        expect(sometimesRowsFor("friday_night")).toContain("Hatikvah")
        expect(sometimesRowsFor("shabbat_morning")).toContain("Birkat Hagomeil")
        expect(sometimesRowsFor("no_such_family")).toEqual([])
    })
})
