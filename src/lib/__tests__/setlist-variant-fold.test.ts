import { describe, it, expect } from "vitest"
import { foldSetlistVariants } from "../setlist-variant-fold"

type S = { id: string; name: string; day: string | null }
const day = (s: S) => s.day
const s = (id: string, name: string, d: string | null = "2026-10-02"): S => ({ id, name, day: d })

describe("foldSetlistVariants", () => {
    it("folds per-instrument setlists under the parent service and keeps every setlist", () => {
        const list = [
            s("a", "Shir Shabbat"),
            s("b", "Shir Shabbat - Guitar"),
            s("c", "Shir Shabbat (Eb)"),
            s("d", "Shir Shabbat - Bass Clef"),
            s("e", "Shabbat Morning", "2026-10-03"),
        ]
        const groups = foldSetlistVariants(list, day)
        expect(groups.map((g) => g.parent.id)).toEqual(["a", "e"])
        expect(groups[0].variants.map((v) => v.id)).toEqual(["b", "c", "d"])
        expect(groups.flatMap((g) => [g.parent, ...g.variants]).length).toBe(list.length)
    })

    it("folds an undated copy under the single parent of that name", () => {
        const groups = foldSetlistVariants([s("a", "Friday Night"), s("b", "Friday Night (Copy)", null)], day)
        expect(groups).toHaveLength(1)
        expect(groups[0].variants.map((v) => v.id)).toEqual(["b"])
    })

    it("does not fold different days or plain same-name setlists", () => {
        const groups = foldSetlistVariants(
            [s("a", "Friday Night"), s("b", "Friday Night"), s("c", "Friday Night - Guitar", "2026-10-09")],
            day,
        )
        expect(groups).toHaveLength(3)
    })

    it("groups orphan variants under the first of them", () => {
        const groups = foldSetlistVariants([s("a", "Rosh Hashanah - Guitar"), s("b", "Rosh Hashanah - Bass")], day)
        expect(groups).toHaveLength(1)
        expect(groups[0].parent.id).toBe("a")
        expect(groups[0].variants.map((v) => v.id)).toEqual(["b"])
    })
})
