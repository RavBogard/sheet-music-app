import { describe, expect, it } from "vitest"

import { reconcile, type PlannedRow } from "../reconcile"
import type { HistoryRow } from "../types"
import { planReset, planSwap, replayDeviations, type Deviation, type OverridesDoc, type SwapRequest, type WritePlan } from "@/lib/performance/tonight"

/**
 * David's ask 4 — reconcile_service reads the band's chart choices beside the
 * cue log. The two are different evidence: a cue says a graphic fired for a
 * prayer; a swap says which chart the band played. Both are kept.
 */

const DAY = "2026-09-26"
const T0 = Date.UTC(2026, 8, 26, 15)

const PLAN: PlannedRow[] = [
    { trackId: "open", title: "Opening", type: "song" },
    { trackId: "barchu", title: "Bar'chu (Plan)", type: "song", momentId: "barchu" },
    { trackId: "mi", title: "Mi Chamocha", type: "song", momentId: "mi-chamocha" },
    { trackId: "band", title: "Band interlude", type: "song" },
    { trackId: "close", title: "Closing", type: "song", momentId: "aleinu" },
]

const cue = (seq: number, momentId: string): HistoryRow => ({
    seq,
    at: T0 + seq * 60_000,
    action: "cue",
    momentId,
})

// Bar'chu, Mi Chamocha and Aleinu fired. The band interlude (no graphic) is
// bracketed; nothing fired for "Opening".
const HISTORY: HistoryRow[] = [cue(1, "barchu"), cue(2, "mi-chamocha"), cue(3, "aleinu")]

const planned: Record<string, { fileId: string; title: string }> = {
    open: { fileId: "O", title: "Opening" },
    barchu: { fileId: "A", title: "Bar'chu (Plan)" },
    mi: { fileId: "M", title: "Mi Chamocha" },
    band: { fileId: "I", title: "Band interlude" },
    close: { fileId: "Z", title: "Closing" },
}

function session(steps: Array<{ row: string; to: string | null; title?: string } | "reset">): Deviation[] {
    const events: Deviation[] = []
    let doc: OverridesDoc | null = null
    const showing: Record<string, string> = Object.fromEntries(Object.entries(planned).map(([k, v]) => [k, v.fileId]))
    let at = T0
    for (const s of steps) {
        at += 1000
        const p: WritePlan =
            s === "reset"
                ? planReset(doc, { planned, by: "leader", at, eventDay: DAY })
                : planSwap(doc, {
                      rowId: s.row,
                      planned: planned[s.row],
                      expectedBeforeFileId: showing[s.row],
                      choice: s.to ? { fileId: s.to, title: s.title ?? s.to } : null,
                      by: "leader",
                      at,
                      eventDay: DAY,
                  } satisfies SwapRequest)
        if (p.kind !== "write") throw new Error(`${JSON.stringify(s)} → ${p.kind}`)
        const next: OverridesDoc = p.next
        doc = next
        events.push(...p.deviations)
        for (const id of Object.keys(planned)) showing[id] = next.rows[id]?.fileId ?? planned[id].fileId
    }
    return events
}

const run = (events: Deviation[]) => reconcile("s1", PLAN, HISTORY, replayDeviations(events, DAY))
const rowOf = (d: ReturnType<typeof run>, id: string) => d.rows.find((r) => r.trackId === id)!

describe("reconcile + band chart swaps", () => {
    it("without swaps, the diff is what it always was", () => {
        const before = reconcile("s1", PLAN, HISTORY)
        const after = run([])
        expect(after).toEqual({ ...before })
        expect(after.chartSwaps).toBe(0)
        expect(after.rows.every((r) => r.chart === undefined)).toBe(true)
    })

    it("a cued row keeps its cue evidence AND gains the chart that was played", () => {
        const d = run(session([{ row: "barchu", to: "B", title: "Bar'chu (B)" }]))
        const r = rowOf(d, "barchu")
        expect(r.status).toBe("performed")
        expect(r.basis).toBe("momentId")
        expect(r.seq).toBe(1)
        expect(r.chart).toMatchObject({
            source: "band-swap",
            plannedFileId: "A",
            performedFileId: "B",
            performedTitle: "Bar'chu (B)",
            swapped: true,
        })
        expect(r.note).toContain("Band played Bar'chu (B) (planned: Bar'chu (Plan))")
        expect(d.chartSwaps).toBe(1)
    })

    it("a repeated cue for the same prayer cannot cancel a confirmed swap", () => {
        const history = [...HISTORY, cue(4, "barchu"), cue(5, "barchu")]
        const d = reconcile("s1", PLAN, history, replayDeviations(session([{ row: "barchu", to: "B" }]), DAY))
        expect(rowOf(d, "barchu").chart).toMatchObject({ swapped: true, performedFileId: "B" })
    })

    it("a swapped row with no cue is shown as performed from the swapped chart", () => {
        const d = run(session([{ row: "open", to: "P", title: "Opening (P)" }]))
        const r = rowOf(d, "open")
        expect(r.status).toBe("performed")
        expect(r.basis).toBe("chartSwap")
        expect(r.performedAt).toBeUndefined()
        expect(r.chart?.performedTitle).toBe("Opening (P)")
        expect(r.note).toContain("No cue fired")
    })

    it("A→B→C→plan ends on the plan: history kept, nothing reported as swapped", () => {
        const events = session([
            { row: "mi", to: "B" },
            { row: "mi", to: "C" },
            { row: "mi", to: null },
        ])
        const r = rowOf(run(events), "mi")
        expect(r.chart).toMatchObject({ swapped: false, performedFileId: "M", events: 3 })
        expect(r.chart!.sequence.map((s) => s.fileId)).toEqual(["M", "B", "C", "M"])
        expect(r.status).toBe("performed")
        expect(r.basis).toBe("momentId")
        expect(run(events).chartSwaps).toBe(0)
    })

    it("reset across several rows leaves no row claiming a swap, and keeps the trail", () => {
        const events = session([{ row: "barchu", to: "B" }, { row: "band", to: "J" }, { row: "close", to: "Y" }, "reset"])
        const d = run(events)
        expect(d.chartSwaps).toBe(0)
        for (const id of ["barchu", "band", "close"]) {
            expect(rowOf(d, id).chart).toMatchObject({ swapped: false, events: 2 })
        }
        expect(rowOf(d, "band").basis).toBe("bracketed")
    })

    it("swap after a reset counts again", () => {
        const d = run(session([{ row: "barchu", to: "B" }, "reset", { row: "barchu", to: "C", title: "Bar'chu (C)" }]))
        expect(rowOf(d, "barchu").chart).toMatchObject({ swapped: true, performedFileId: "C" })
        expect(rowOf(d, "barchu").chart!.sequence.map((s) => s.fileId)).toEqual(["A", "B", "A", "C"])
    })

    it("never adds, removes or reorders planned rows", () => {
        const d = run(session([{ row: "barchu", to: "B" }, { row: "open", to: "P" }]))
        expect(d.rows.filter((r) => r.trackId).map((r) => r.trackId)).toEqual(PLAN.map((p) => p.trackId))
    })
})
