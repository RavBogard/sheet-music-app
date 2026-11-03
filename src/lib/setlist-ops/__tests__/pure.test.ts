import { describe, it, expect } from "vitest"
import { FieldValue } from "firebase-admin/firestore"
import { mergeFields, placementIndex, stripUndefined, valuesEqual } from "../pure"
import { RESERVED_ROW_FIELDS } from "../types"
import { validateOpsRequest } from "../engine"

describe("placementIndex (order rebase)", () => {
    const seq = ["a", "b", "c"]
    it("lands after the after-anchor in the current order", () => {
        expect(placementIndex(seq, "b", "c")).toBe(2)
    })
    it("falls back to before the before-anchor when the after-anchor is gone", () => {
        expect(placementIndex(seq, "gone", "b")).toBe(1)
    })
    it("goes to the end when both anchors are gone", () => {
        expect(placementIndex(seq, "gone", "also-gone")).toBe(3)
    })
    it("null/null means the start", () => {
        expect(placementIndex(seq, null, null)).toBe(0)
    })
    it("after=null with a live before-anchor goes before it", () => {
        expect(placementIndex(seq, null, "c")).toBe(2)
    })
})

describe("mergeFields (per-field merge)", () => {
    it("applies a field whose server value still equals base", () => {
        const r = mergeFields({ key: "C" }, { key: "D" }, { key: "C" }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({ key: "D" })
        expect(r.conflicts).toEqual([])
    })
    it("is a no-op when the server already holds the new value", () => {
        const r = mergeFields({ key: "D" }, { key: "D" }, { key: "C" }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({})
        expect(r.conflicts).toEqual([])
    })
    it("conflicts a field someone else changed, and still applies the others", () => {
        const r = mergeFields({ key: "E", notes: "x" }, { key: "D", notes: "y" }, { key: "C", notes: "x" }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({ notes: "y" })
        expect(r.conflicts).toEqual([{ field: "key", server: "E", mine: "D" }])
    })
    it("a missing server field equals a null/absent base", () => {
        const r = mergeFields({}, { bpm: 90 }, {}, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({ bpm: 90 })
    })
    it("strips undefined: {bpm: undefined} is not a field at all", () => {
        const r = mergeFields({ bpm: 80 }, { bpm: undefined, key: "G" }, { key: "F" }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({})
        expect(r.conflicts.map((c) => c.field)).toEqual(["key"])
    })
    it("null means clear", () => {
        const r = mergeFields({ bpm: 80 }, { bpm: null }, { bpm: 80 }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({ bpm: null })
    })
    it("compares objects by value, not key order", () => {
        const server = { liturgyRef: { book: "b", folio: 3, unitId: "u" } }
        const r = mergeFields(server, { liturgyRef: { book: "b", folio: 4 } }, { liturgyRef: { unitId: "u", folio: 3, book: "b" } }, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({ liturgyRef: { book: "b", folio: 4 } })
    })
    it("ignores engine-owned fields such as order and version", () => {
        const r = mergeFields({ order: 1 }, { order: 9, version: 4 }, {}, RESERVED_ROW_FIELDS)
        expect(r.apply).toEqual({})
        expect(r.considered).toBe(0)
    })
})

describe("stripUndefined", () => {
    it("drops undefined at every depth and keeps null and sentinels", () => {
        const sentinel = FieldValue.serverTimestamp()
        const out = stripUndefined({ a: undefined, b: null, c: { d: undefined, e: 1 }, f: [1, undefined, { g: undefined }], s: sentinel })
        expect(out).toEqual({ b: null, c: { e: 1 }, f: [1, {}], s: sentinel })
        expect(out.s).toBe(sentinel)
    })
    it("valuesEqual treats missing and null alike", () => {
        expect(valuesEqual(undefined, null)).toBe(true)
        expect(valuesEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    })
})

describe("validateOpsRequest", () => {
    const ok = { clientBatchId: "b-1", baseVersion: 3, ops: [{ kind: "remove", rowId: "r1" }] }
    it("accepts a well-formed batch", () => {
        expect(validateOpsRequest(ok)).toBeNull()
    })
    it("refuses a malformed op as invalid", () => {
        expect(validateOpsRequest({ ...ok, ops: [{ kind: "move", rowId: "r1" }] })?.reason).toBe("invalid")
        expect(validateOpsRequest({ ...ok, ops: [{ kind: "explode" }] })?.reason).toBe("invalid")
        expect(validateOpsRequest({ ...ok, clientBatchId: "a/b" })?.reason).toBe("invalid")
    })
    it("refuses an oversized batch as too-large", () => {
        const ops = Array.from({ length: 301 }, (_, i) => ({ kind: "remove", rowId: `r${i}` }))
        expect(validateOpsRequest({ ...ok, ops })?.reason).toBe("too-large")
    })
})
