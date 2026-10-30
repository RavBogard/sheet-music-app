import { describe, expect, it } from "vitest"
import {
    applyChoices,
    buildDraftRows,
    defaultSpecial,
    oneOffNoteFor,
    openIndexesOf,
    type ChartInfo,
    type DraftProfileRow,
} from "../draft"
import type { SlotTier } from "../tiers"

const tier = (t: Partial<SlotTier> & Pick<SlotTier, "tier">): SlotTier => ({ keyOnRecord: !!t.key, phrase: t.tier, ...t })

const profileRows: DraftProfileRow[] = [
    { index: 0, type: "header", title: "Shacharit", slotKey: null, track: { type: "header", title: "Shacharit" } },
    {
        index: 1,
        type: "song",
        title: "Barchu",
        slotKey: "moment:barchu",
        track: { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm", leadMusician: "Ann", liturgyRefs: { "crc-saturday": { folio: 12 } } },
        tier: tier({ tier: "usual", fileId: "f-barchu", chartName: "Barchu (Walkdown)", key: "Dm" }),
    },
    {
        index: 2,
        type: "song",
        title: "Oseh Shalom",
        slotKey: "song:pg-oseh",
        track: { type: "song", title: "Oseh Shalom", slotKind: "open" },
        tier: tier({ tier: "standard", fileId: "f-oseh", chartName: "Oseh Shalom (Hirsch)", key: "C" }),
        standing: { leadMusician: "Ben" },
    },
    {
        index: 3,
        type: "song",
        title: "Mi Chamocha",
        slotKey: "moment:mi-chamocha",
        // The template remembered a chart, but it is only last_time now: drafted open.
        track: { type: "song", title: "Mi Chamocha", momentId: "mi-chamocha", fileId: "f-mi", key: "G", leadMusician: "Cy", songId: "f-mi" },
        tier: tier({ tier: "last_time", fileId: "f-mi", chartName: "Mi Chamocha (Friedman)", key: "G" }),
    },
    { index: 4, type: "song", title: "Closing", slotKey: "song:closing", track: { type: "song", title: "Closing" }, tier: tier({ tier: "new" }) },
]

const charts = new Map<string, ChartInfo>([
    ["f-barchu", { name: "Barchu (Walkdown)", partGroup: "pg-barchu" }],
    ["f-barchu-2", { name: "Barchu (Sulzer)", partGroup: "pg-barchu-2" }],
    ["f-oseh", { name: "Oseh Shalom (Hirsch)", partGroup: "pg-oseh" }],
    ["f-mi", { name: "Mi Chamocha (Friedman)", partGroup: "pg-mi" }],
])

describe("buildDraftRows", () => {
    const rows = buildDraftRows(profileRows)

    it("fills only standard and usual slots and leaves the rest open", () => {
        expect(rows.map((r) => r.filled)).toEqual([false, true, true, false, false])
        expect(openIndexesOf(rows)).toEqual([3, 4])
        expect(rows[1]).toMatchObject({ fileId: "f-barchu", key: "Dm", tier: "usual", leadMusician: "Ann" })
        expect(rows[2]).toMatchObject({ fileId: "f-oseh", key: "C", tier: "standard", leadMusician: "Ben" })
        expect(rows[0].tier).toBeNull()
    })

    it("an open slot keeps its label and moment but carries no chart, key or lead", () => {
        expect(rows[3].track).toEqual({ type: "song", title: "Mi Chamocha", momentId: "mi-chamocha" })
        expect(rows[3].fileId).toBeUndefined()
        expect(rows[4].track).toEqual({ type: "song", title: "Closing" })
    })

    it("keeps per-book liturgy refs and drops template-only slot fields", () => {
        expect(rows[1].track.liturgyRefs).toEqual({ "crc-saturday": { folio: 12 } })
        expect(rows[2].track.slotKind).toBeUndefined()
    })
})

describe("applyChoices", () => {
    const rows = buildDraftRows(profileRows)

    it("fills an open slot, and a standing choice is returned to remember", () => {
        const r = applyChoices(rows, [{ index: 3, fileId: "f-mi", key: "A", standing: true, quote: "keep it in A" }], charts)
        if (!r.ok) throw new Error(r.message)
        expect(r.rows[3].track).toMatchObject({ fileId: "f-mi", key: "A", fileName: "Mi Chamocha (Friedman)" })
        expect(r.standing).toEqual([
            expect.objectContaining({ index: 3, slotKey: "moment:mi-chamocha", fileId: "f-mi", key: "A", partGroup: "pg-mi", quote: "keep it in A" }),
        ])
        expect(r.oneOff).toEqual([])
    })

    it("a one-off change to a filled row is listed, and the draft rows are not mutated", () => {
        const r = applyChoices(rows, [{ index: 1, key: "Em" }, { index: 2, fileId: "f-barchu-2" }], charts)
        if (!r.ok) throw new Error(r.message)
        expect(r.oneOff).toEqual(["Barchu (Walkdown) in Em", "Barchu (Sulzer)"])
        expect(r.standing).toEqual([])
        expect(r.rows[2].track.key).toBeUndefined()
        expect(rows[1].track.key).toBe("Dm")
        expect(oneOffNoteFor(r.oneOff)).toBe(
            'Barchu (Walkdown) in Em, Barchu (Sulzer) are just for this week. Say "keep it" to make them standard.',
        )
    })

    it("filling an open slot without standing is not a one-off", () => {
        const r = applyChoices(rows, [{ index: 4, fileId: "f-oseh", key: "D" }], charts)
        expect(r.ok && r.oneOff).toEqual([])
    })

    it("refuses a header index, an unknown chart, and keeping an empty slot", () => {
        expect(applyChoices(rows, [{ index: 0, key: "C" }], charts)).toMatchObject({ ok: false, code: "invalid_argument" })
        expect(applyChoices(rows, [{ index: 9, key: "C" }], charts)).toMatchObject({ ok: false, code: "invalid_argument" })
        expect(applyChoices(rows, [{ index: 3, fileId: "f-other-tenant" }], charts)).toMatchObject({ ok: false, code: "chart_not_found" })
        expect(applyChoices(rows, [{ index: 4, standing: true }], charts)).toMatchObject({ ok: false, code: "no_chart" })
    })
})

describe("oneOffNoteFor and defaultSpecial", () => {
    it("one change reads singular; none gives no note", () => {
        expect(oneOffNoteFor(["Barchu in Em"])).toBe('Barchu in Em is just for this week. Say "keep it" to make it standard.')
        expect(oneOffNoteFor([])).toBeUndefined()
    })

    it("holiday services are special by default, regular ones are not", () => {
        expect(defaultSpecial("yom_kippur_morning")).toBe(true)
        expect(defaultSpecial("shabbat_morning")).toBe(false)
        expect(defaultSpecial("gig")).toBe(false)
    })
})
