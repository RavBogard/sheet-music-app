import { describe, it, expect } from "vitest"
import { FieldValue } from "firebase-admin/firestore"
import { mergeFields, placementIndex, stripUndefined, valuesEqual } from "../pure"
import { RESERVED_ROW_FIELDS } from "../types"
import { normalizeOpsRequest, validateOpsRequest } from "../engine"

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
    it("after=null with a deleted before-anchor goes to the START, as the client meant", () => {
        expect(placementIndex(seq, null, "gone")).toBe(0)
    })
    it("a deleted after-anchor with before=null goes to the end", () => {
        expect(placementIndex(seq, "gone", null)).toBe(3)
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
    it.each(["orgId.x", "setlistId.x", "updatedAt.x", "__name__", "a-b", "liturgyRef.book"])(
        "refuses the field path %s in set, row and base",
        (k) => {
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "editRow", rowId: "r1", set: { [k]: 1 }, base: {} }] })?.reason).toBe("invalid")
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "editRow", rowId: "r1", set: { key: "C" }, base: { [k]: 1 } }] })?.reason).toBe("invalid")
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "insert", rowId: "n", afterRowId: null, beforeRowId: null, row: { [k]: 1 } }] })?.reason).toBe("invalid")
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "editSetlist", set: { [k]: 1 }, base: {} }] })?.reason).toBe("invalid")
        },
    )
    it.each(["order", "id", "version", "updatedAt", "orgId", "setlistId", "createdAt"])(
        "refuses a set that touches the server-owned field %s (never silently dropped)",
        (k) => {
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "editRow", rowId: "r1", set: { [k]: 1 }, base: {} }] })?.reason).toBe("invalid")
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "insert", rowId: "n", afterRowId: null, beforeRowId: null, row: { [k]: 1 } }] })?.reason).toBe("invalid")
        },
    )
    it("refuses ownerId and orgId on the setlist", () => {
        for (const k of ["ownerId", "orgId", "version"]) {
            expect(validateOpsRequest({ ...ok, ops: [{ kind: "editSetlist", set: { [k]: "x" }, base: {} }] })?.reason).toBe("invalid")
        }
    })
    it("checks field types and sizes as MCP does", () => {
        const edit = (set: Record<string, unknown>) =>
            validateOpsRequest({ ...ok, ops: [{ kind: "editRow", rowId: "r1", set, base: {} }] })?.reason ?? null
        expect(edit({ type: "banana" })).toBe("invalid")
        expect(edit({ type: null })).toBe("invalid")
        expect(edit({ liturgyRef: { book: "no-such-book", folio: 3 } })).toBe("invalid")
        expect(edit({ liturgyRef: { book: "crc-friday", folio: 0 } })).toBe("invalid")
        expect(edit({ liturgyRef: { book: "crc-friday", folio: 4 } })).toBeNull()
        expect(edit({ momentId: 7 })).toBe("invalid")
        expect(edit({ estimatedMinutes: 601 })).toBe("invalid")
        expect(edit({ honors: Array.from({ length: 13 }, () => ({ name: "x" })) })).toBe("invalid")
        expect(edit({ mystery: 1 })).toBe("invalid")
        expect(edit({ liturgyRef: null, key: null })).toBeNull()
        const setl = (set: Record<string, unknown>) =>
            validateOpsRequest({ ...ok, ops: [{ kind: "editSetlist", set, base: {} }] })?.reason ?? null
        expect(setl({ eventDate: "not a date" })).toBe("invalid")
        expect(setl({ eventDate: null })).toBe("invalid")
        expect(setl({ startsAtLocal: "25:00" })).toBe("invalid")
        expect(setl({ book: "crc-friday" })).toBe("invalid") // book changes stay on update_setlist
        expect(setl({ name: "Shabbat", eventDate: "2026-11-07T10:00:00" })).toBeNull()
    })
    it("sanitizes freeform strings", () => {
        const r = normalizeOpsRequest({ ...ok, ops: [{ kind: "editRow", rowId: "r1", set: { notes: "a\u0000b" }, base: {} }] })
        expect(r.ok && (r.req.ops[0] as { set: Record<string, unknown> }).set.notes).toBe("ab")
    })
    it.each([".", "..", "a/b", ""])("refuses the row id %j", (id) => {
        expect(validateOpsRequest({ ...ok, ops: [{ kind: "remove", rowId: id }] })?.reason).toBe("invalid")
        expect(validateOpsRequest({ ...ok, clientBatchId: id || "." })?.reason).toBe("invalid")
    })
    it("refuses an oversized batch as too-large", () => {
        const ops = Array.from({ length: 301 }, (_, i) => ({ kind: "remove", rowId: `r${i}` }))
        expect(validateOpsRequest({ ...ok, ops })?.reason).toBe("too-large")
    })
})
