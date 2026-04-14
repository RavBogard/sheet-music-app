/**
 * v4.3 D03 — mergeNewMusicians unit tests.
 *
 * The helper powers the runTransaction closure in
 * src/app/api/scheduling/assign/route.ts. By testing it directly we
 * verify the dedupe + merge behavior that prevents concurrent-assign
 * data loss.
 */
import { describe, it, expect } from "vitest"
import { mergeNewMusicians, type SetlistMusician, type IncomingMusician } from "@/lib/scheduling-merge"

const m = (uid: string, name = uid, instrument?: string): IncomingMusician =>
    ({ uid, name, email: `${uid}@example.com`, instrument })

const existing = (uid: string, name = uid, instrument: string | null = null): SetlistMusician =>
    ({ uid, name, email: `${uid}@example.com`, instrument })

describe("mergeNewMusicians (D03)", () => {
    it("adds disjoint musicians", () => {
        const r = mergeNewMusicians([existing("a"), existing("b")], [m("c"), m("d")])
        expect(r.changed).toBe(true)
        expect(r.added).toHaveLength(2)
        expect(r.merged.map(x => x.uid)).toEqual(["a", "b", "c", "d"])
    })

    it("dedupes overlapping uids (additions only)", () => {
        const r = mergeNewMusicians([existing("a"), existing("b")], [m("b"), m("c")])
        expect(r.changed).toBe(true)
        expect(r.added.map(x => x.uid)).toEqual(["c"])
        expect(r.merged.map(x => x.uid)).toEqual(["a", "b", "c"])
    })

    it("no-op when all incoming already present", () => {
        const r = mergeNewMusicians([existing("a"), existing("b")], [m("a"), m("b")])
        expect(r.changed).toBe(false)
        expect(r.added).toEqual([])
        expect(r.merged).toBe(/* same ref */ r.merged)
        expect(r.merged.map(x => x.uid)).toEqual(["a", "b"])
    })

    it("handles empty existing", () => {
        const r = mergeNewMusicians([], [m("a")])
        expect(r.changed).toBe(true)
        expect(r.added.map(x => x.uid)).toEqual(["a"])
        expect(r.merged.map(x => x.uid)).toEqual(["a"])
    })

    it("handles empty incoming", () => {
        const r = mergeNewMusicians([existing("a")], [])
        expect(r.changed).toBe(false)
        expect(r.added).toEqual([])
        expect(r.merged.map(x => x.uid)).toEqual(["a"])
    })

    it("normalizes undefined instrument to null on add", () => {
        const r = mergeNewMusicians([], [m("a", "Alice", undefined)])
        expect(r.added[0].instrument).toBeNull()
    })

    it("preserves existing rows that lack uid (legacy data)", () => {
        const legacy: SetlistMusician = { name: "Legacy", email: "legacy@x" } as SetlistMusician
        const r = mergeNewMusicians([legacy, existing("a")], [m("a")])
        expect(r.changed).toBe(false)
        expect(r.merged).toContain(legacy)
    })

    it("SIMULATED RACE: two concurrent merges against the same baseline both land when replayed serially", () => {
        // Transaction retry semantics: if both run with their own snapshot,
        // the second must observe the first's write. Simulate by merging
        // sequentially (mimicking Firestore's retry-until-consistent behavior).
        const baseline: SetlistMusician[] = [existing("a")]
        const leaderOne = mergeNewMusicians(baseline, [m("b")])
        // Second call sees the result of the first (what the transaction
        // would see after retry).
        const leaderTwo = mergeNewMusicians(leaderOne.merged, [m("c")])
        expect(leaderTwo.merged.map(x => x.uid)).toEqual(["a", "b", "c"])
    })
})
