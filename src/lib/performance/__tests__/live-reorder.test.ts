import { describe, it, expect } from "vitest"
import { applyOrder, moveRow, moveRowById, movedRowIds, sameOrder } from "../live-reorder"

describe("live reorder: moves", () => {
    const ids = ["a", "b", "c", "d"]

    it("moves a row down and up", () => {
        expect(moveRow(ids, 0, 2)).toEqual(["b", "c", "a", "d"])
        expect(moveRow(ids, 3, 1)).toEqual(["a", "d", "b", "c"])
    })

    it("treats out-of-range and no-op moves as no change, without mutating", () => {
        expect(moveRow(ids, 0, 0)).toEqual(ids)
        expect(moveRow(ids, -1, 2)).toEqual(ids)
        expect(moveRow(ids, 0, 4)).toEqual(ids)
        expect(ids).toEqual(["a", "b", "c", "d"])
    })

    it("moves by id for a drag drop", () => {
        expect(moveRowById(ids, "d", "a")).toEqual(["d", "a", "b", "c"])
        expect(moveRowById(ids, "x", "a")).toEqual(ids)
    })

    it("compares orders", () => {
        expect(sameOrder(ids, ["a", "b", "c", "d"])).toBe(true)
        expect(sameOrder(ids, ["b", "a", "c", "d"])).toBe(false)
        expect(sameOrder(ids, ["a", "b", "c"])).toBe(false)
    })
})

describe("live reorder: laying a pending order over the rows", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }]

    it("returns the rows themselves when there is no order or nothing moves", () => {
        expect(applyOrder(rows, null)).toBe(rows)
        expect(applyOrder(rows, ["a", "b", "c"])).toBe(rows)
    })

    it("puts rows in the pending order, keeping row identity", () => {
        const out = applyOrder(rows, ["c", "a", "b"])
        expect(out.map((r) => r.id)).toEqual(["c", "a", "b"])
        expect(out[0]).toBe(rows[2])
    })

    it("keeps a row that arrived meanwhile, and skips an id with no row", () => {
        const out = applyOrder([...rows, { id: "new" }], ["gone", "b", "a", "c"])
        expect(out.map((r) => r.id)).toEqual(["b", "a", "c", "new"])
    })
})

describe("live reorder: which rows moved", () => {
    it("reports only the dragged row, not the rows it slid past", () => {
        expect(movedRowIds(["a", "b", "c", "d", "e"], ["b", "c", "d", "a", "e"])).toEqual(["a"])
        expect(movedRowIds(["a", "b", "c", "d", "e"], ["a", "e", "b", "c", "d"])).toEqual(["e"])
    })

    it("reports nothing when the order is the same", () => {
        expect(movedRowIds(["a", "b", "c"], ["a", "b", "c"])).toEqual([])
    })

    it("reports a minimal set for a swap and ignores rows not in both lists", () => {
        expect(movedRowIds(["a", "b"], ["b", "a"])).toHaveLength(1)
        expect(movedRowIds(["a", "b", "c"], ["a", "x", "b", "c"])).toEqual([])
    })
})
