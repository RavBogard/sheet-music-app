import { describe, it, expect } from "vitest"
import { foldSetlistVariants } from "../setlist-variant-fold"

type S = { id: string; name: string; day: string | null }
const day = (s: S) => s.day
const s = (id: string, name: string, d: string | null = "2026-10-02"): S => ({ id, name, day: d })
const ids = (g: { parent: S | null; variants: S[] }) => [g.parent?.id ?? null, g.variants.map((v) => v.id)]

describe("foldSetlistVariants", () => {
    it("folds the prod middle-dot names under the plain parent (Oct 2)", () => {
        const list = [
            s("a", "Shir Shabbat — Oct 2, 2026"),
            s("b", "Shir Shabbat — Oct 2, 2026 · Bb"),
            s("c", "Shir Shabbat — Oct 2, 2026 · Eb"),
            s("d", "Shir Shabbat — Oct 2, 2026 · C"),
            s("e", "Shir Shabbat — Oct 2, 2026 · Bass Clef"),
            s("f", "Shir Shabbat — Oct 2, 2026 · Guitar"),
            s("g", "Shir Shabbat — Oct 2, 2026 · Vocals"),
            s("h", "Shir Shabbat — Oct 2, 2026 · Piano/Keys"),
            s("z", "Shabbat Morning — Oct 3, 2026", "2026-10-03"),
        ]
        const groups = foldSetlistVariants(list, day)
        expect(groups.map((g) => g.parent?.id)).toEqual(["a", "z"])
        expect(groups[0].variants.map((v) => v.id)).toEqual(["b", "c", "d", "e", "f", "g", "h"])
        expect(groups.flatMap((g) => [g.parent, ...g.variants]).filter(Boolean)).toHaveLength(list.length)
    })

    it("groups under the base name when there is no plain parent (Oct 16)", () => {
        const d = "2026-10-16"
        const list = [
            s("a", "Shir Keter Shabbat — Oct 16, 2026 · Eb", d),
            s("b", "Shir Keter Shabbat — Oct 16, 2026 · Bb", d),
            s("c", "Shir Keter Shabbat — Oct 16, 2026 · Vocals", d),
            s("d", "Shir Keter Shabbat — Oct 16, 2026 · Crown Center", d),
        ]
        const groups = foldSetlistVariants(list, day)
        expect(groups).toHaveLength(1)
        expect(groups[0].parent).toBeNull()
        expect(groups[0].baseName).toBe("Shir Keter Shabbat — Oct 16, 2026")
        expect(groups[0].variants.map((v) => v.id)).toEqual(["a", "b", "c", "d"])
    })

    it("keeps a lone suffixed setlist, and different days apart", () => {
        const groups = foldSetlistVariants(
            [s("a", "Shir Shabbat — Oct 2, 2026 · Eb"), s("b", "Shir Shabbat — Oct 2, 2026 · Bb", "2026-10-09")],
            day,
        )
        expect(groups.map(ids)).toEqual([["a", []], ["b", []]])
    })

    it("still folds per-instrument dash names and an undated (Copy)", () => {
        const groups = foldSetlistVariants(
            [s("a", "Friday Night"), s("b", "Friday Night - Guitar"), s("c", "Friday Night (Copy)", null)],
            day,
        )
        expect(groups.map(ids)).toEqual([["a", ["b", "c"]]])
    })

    it("does not fold plain same-name setlists", () => {
        expect(foldSetlistVariants([s("a", "Friday Night"), s("b", "Friday Night")], day)).toHaveLength(2)
    })
})
