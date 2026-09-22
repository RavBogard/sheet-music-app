import { describe, expect, it } from "vitest"

import {
    applyTonight,
    chicagoDay,
    deviationId,
    eventDayOf,
    overridesApply,
    parseDeviation,
    parseOverridesDoc,
    planReset,
    planSwap,
    replayDeviations,
    type Deviation,
    type OverridesDoc,
    type SwapRequest,
} from "@/lib/performance/tonight"

const DAY = "2026-09-26"
// 2026-09-26 10:00 America/Chicago (CDT, UTC-5)
const DURING = Date.UTC(2026, 8, 26, 15, 0)
// 2026-09-26 23:30 Chicago = 2026-09-27 04:30 UTC — still the service day locally
const LATE_SAME_DAY = Date.UTC(2026, 8, 27, 4, 30)
// 2026-09-27 00:30 Chicago
const NEXT_DAY = Date.UTC(2026, 8, 27, 5, 30)

const plan = [
    { id: "r1", title: "Bar'chu (Plan)", fileId: "A", songId: "A", key: "D" },
    { id: "r2", title: "Mi Chamocha", fileId: "M", songId: "M" },
    { id: "r3", title: "Header", type: "header" },
]

function req(over: Partial<SwapRequest>): SwapRequest {
    return {
        rowId: "r1",
        planned: { fileId: "A", title: "Bar'chu (Plan)" },
        expectedBeforeFileId: "A",
        choice: { fileId: "B", title: "Bar'chu (B)" },
        by: "leader",
        at: DURING,
        eventDay: DAY,
        ...over,
    }
}

describe("service day in America/Chicago", () => {
    it("a date-only eventDate is that day, never UTC midnight", () => {
        expect(eventDayOf("2026-09-26")).toBe("2026-09-26")
    })
    it("an instant becomes the Chicago day it falls on", () => {
        // 03:00Z on the 27th is 22:00 on the 26th in Chicago
        expect(eventDayOf("2026-09-27T03:00:00.000Z")).toBe("2026-09-26")
        expect(eventDayOf({ seconds: Date.UTC(2026, 8, 27, 3) / 1000 })).toBe("2026-09-26")
        expect(eventDayOf({ toMillis: () => Date.UTC(2026, 8, 26, 17) })).toBe("2026-09-26")
    })
    it("missing, empty or invalid dates have no day", () => {
        for (const v of [null, undefined, "", "  ", "next shabbat", "2026-02-30", NaN, {}]) {
            expect(eventDayOf(v)).toBeNull()
        }
    })
    it("chicagoDay handles the late-evening UTC rollover", () => {
        expect(chicagoDay(LATE_SAME_DAY)).toBe(DAY)
        expect(chicagoDay(NEXT_DAY)).toBe("2026-09-27")
    })
})

describe("overridesApply", () => {
    const doc: OverridesDoc = { rows: {}, eventDay: DAY, rev: 1, updatedAt: 0, updatedBy: "x" }
    it("applies through the end of the service day, not after", () => {
        expect(overridesApply(doc, DAY, DURING)).toBe(true)
        expect(overridesApply(doc, DAY, LATE_SAME_DAY)).toBe(true)
        expect(overridesApply(doc, DAY, NEXT_DAY)).toBe(false)
    })
    it("never applies without a service day (no indefinite overrides)", () => {
        expect(overridesApply(doc, null, DURING)).toBe(false)
    })
    it("a setlist re-dated for another service does not inherit old swaps", () => {
        expect(overridesApply(doc, "2026-10-03", DURING)).toBe(false)
    })
    it("no doc, no overrides", () => {
        expect(overridesApply(null, DAY, DURING)).toBe(false)
    })
})

describe("applyTonight", () => {
    const p = planSwap(null, req({}))
    if (p.kind !== "write") throw new Error("expected a write")
    const doc = p.next

    it("replaces only the chart fields of the swapped row", () => {
        const out = applyTonight(plan, doc, DAY, DURING)
        expect(out.map((t) => t.id)).toEqual(["r1", "r2", "r3"])
        expect(out[0]).toMatchObject({ fileId: "B", songId: "B", title: "Bar'chu (B)", key: undefined })
        expect(out[0].tonight).toEqual({ plannedFileId: "A", plannedTitle: "Bar'chu (Plan)", swappedAt: DURING })
        expect(out[1]).toBe(plan[1])
        expect(out[2]).toBe(plan[2])
    })
    it("returns the plan untouched the day after", () => {
        expect(applyTonight(plan, doc, DAY, NEXT_DAY)).toBe(plan)
    })
    it("returns the plan untouched when the doc is missing or malformed", () => {
        expect(applyTonight(plan, null, DAY, DURING)).toBe(plan)
        expect(applyTonight(plan, parseOverridesDoc({ garbage: true }), DAY, DURING)).toBe(plan)
    })
    it("ignores an override the plan already matches (saved to setlist)", () => {
        const saved = plan.map((t) => (t.id === "r1" ? { ...t, fileId: "B" } : t))
        expect(applyTonight(saved, doc, DAY, DURING)).toBe(saved)
    })
    it("ignores an override for a row the plan no longer has", () => {
        const d = { ...doc, rows: { gone: doc.rows.r1 } }
        expect(applyTonight(plan, d, DAY, DURING)).toBe(plan)
    })
})

describe("planSwap", () => {
    it("writes the override and a swap deviation with planned/before/after", () => {
        const p = planSwap(null, req({}))
        expect(p.kind).toBe("write")
        if (p.kind !== "write") return
        expect(p.next).toMatchObject({ eventDay: DAY, rev: 1, updatedBy: "leader" })
        expect(p.next.rows.r1).toMatchObject({ fileId: "B", plannedFileId: "A", swappedBy: "leader" })
        expect(p.deviations).toEqual([
            expect.objectContaining({
                rowId: "r1", kind: "swap", plannedFileId: "A", beforeFileId: "A", performedFileId: "B", rev: 1,
            }),
        ])
        expect(deviationId(p.deviations[0])).toBe("2026-09-26-000001-r1")
    })
    it("choosing the planned chart is an undo", () => {
        const first = planSwap(null, req({}))
        if (first.kind !== "write") throw new Error()
        const undo = planSwap(first.next, req({ expectedBeforeFileId: "B", choice: { fileId: "A", title: "x" } }))
        if (undo.kind !== "write") throw new Error(undo.kind)
        expect(undo.next.rows).toEqual({})
        expect(undo.next.rev).toBe(2)
        expect(undo.deviations[0]).toMatchObject({ kind: "undo", beforeFileId: "B", performedFileId: "A", performedTitle: "Bar'chu (Plan)" })
    })
    it("a retried request that already landed is a noop, not a second event", () => {
        const first = planSwap(null, req({}))
        if (first.kind !== "write") throw new Error()
        expect(planSwap(first.next, req({})).kind).toBe("noop")
    })
    it("refuses a stale request when another leader changed the row", () => {
        const other = planSwap(null, req({ choice: { fileId: "C", title: "Bar'chu (C)" } }))
        if (other.kind !== "write") throw new Error()
        const mine = planSwap(other.next, req({ expectedBeforeFileId: "A" }))
        expect(mine).toEqual({ kind: "stale", currentFileId: "C", currentTitle: "Bar'chu (C)" })
    })
    it("a doc from an earlier service day is replaced, keeping rev monotonic", () => {
        const old: OverridesDoc = {
            rows: { r1: { fileId: "Z", songId: "Z", title: "old", key: null, mimeType: null, plannedFileId: "A", swappedBy: "x", swappedAt: 0 } },
            eventDay: "2026-09-19", rev: 7, updatedAt: 0, updatedBy: "x",
        }
        const p = planSwap(old, req({}))
        if (p.kind !== "write") throw new Error(p.kind)
        expect(p.next.rev).toBe(8)
        expect(Object.keys(p.next.rows)).toEqual(["r1"])
        expect(p.next.rows.r1.fileId).toBe("B")
        expect(p.deviations[0].beforeFileId).toBe("A")
    })
})

describe("replay: A→B→C→plan and reset across rows", () => {
    function run(): Deviation[] {
        const events: Deviation[] = []
        let doc: OverridesDoc | null = null
        const step = (r: Partial<SwapRequest>) => {
            const p = planSwap(doc, req(r))
            if (p.kind !== "write") throw new Error(p.kind)
            doc = p.next
            events.push(...p.deviations)
        }
        step({ choice: { fileId: "B", title: "B" } })
        step({ expectedBeforeFileId: "B", choice: { fileId: "C", title: "C" } })
        step({ expectedBeforeFileId: "C", choice: null })
        // r1 and r2 swapped, then Reset to plan
        step({ choice: { fileId: "B", title: "B" } })
        step({
            rowId: "r2", planned: { fileId: "M", title: "Mi Chamocha" }, expectedBeforeFileId: "M",
            choice: { fileId: "N", title: "Mi Chamocha (N)" },
        })
        const reset = planReset(doc, {
            planned: { r1: { fileId: "A", title: "Bar'chu (Plan)" }, r2: { fileId: "M", title: "Mi Chamocha" } },
            by: "leader", at: DURING + 1, eventDay: DAY,
        })
        if (reset.kind !== "write") throw new Error(reset.kind)
        expect(reset.next.rows).toEqual({})
        expect(reset.deviations.map((d) => [d.rowId, d.kind, d.beforeFileId, d.performedFileId])).toEqual([
            ["r1", "reset", "B", "A"],
            ["r2", "reset", "N", "M"],
        ])
        events.push(...reset.deviations)
        return events
    }

    it("replays every chart the row showed and ends on the plan after reset", () => {
        const h = replayDeviations(run(), DAY)
        expect(h.get("r1")).toMatchObject({ finalFileId: "A", swapped: false, events: 5 })
        expect(h.get("r1")!.sequence.map((s) => s.fileId)).toEqual(["A", "B", "C", "A", "B", "A"])
        expect(h.get("r2")).toMatchObject({ finalFileId: "M", swapped: false })
        expect(h.get("r2")!.sequence.map((s) => s.fileId)).toEqual(["M", "N", "M"])
    })
    it("does not depend on the order the records arrive in", () => {
        const events = run()
        const a = replayDeviations(events, DAY)
        const b = replayDeviations([...events].reverse(), DAY)
        expect([...b.entries()]).toEqual([...a.entries()])
    })
    it("a swap still standing at the end is reported as swapped", () => {
        const p = planSwap(null, req({}))
        if (p.kind !== "write") throw new Error()
        expect(replayDeviations(p.deviations, DAY).get("r1")).toMatchObject({ swapped: true, finalFileId: "B", finalTitle: "Bar'chu (B)" })
    })
    it("events from another service day are ignored", () => {
        const p = planSwap(null, req({}))
        if (p.kind !== "write") throw new Error()
        expect(replayDeviations(p.deviations, "2026-10-03").size).toBe(0)
    })
    it("reset with nothing swapped is a noop", () => {
        expect(planReset(null, { planned: {}, by: "x", at: 0, eventDay: DAY }).kind).toBe("noop")
    })
})

describe("parsers", () => {
    it("round-trips a written doc and deviation", () => {
        const p = planSwap(null, req({}))
        if (p.kind !== "write") throw new Error()
        expect(parseOverridesDoc(JSON.parse(JSON.stringify(p.next)))).toEqual(p.next)
        expect(parseDeviation(JSON.parse(JSON.stringify(p.deviations[0])))).toEqual(p.deviations[0])
    })
    it("drops malformed rows and rejects docs with no valid day or rev", () => {
        expect(parseOverridesDoc({ rows: {}, eventDay: "bad", rev: 1 })).toBeNull()
        expect(parseOverridesDoc({ rows: {}, eventDay: DAY })).toBeNull()
        expect(parseOverridesDoc({ rows: { r1: { title: "no file" } }, eventDay: DAY, rev: 1 })!.rows).toEqual({})
        expect(parseDeviation({ rowId: "r1", kind: "delete", eventDay: DAY, rev: 1, at: 1 })).toBeNull()
    })
})
