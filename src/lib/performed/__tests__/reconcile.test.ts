import { describe, it, expect } from "vitest"
import { reconcile, chapters, type PlannedRow } from "../reconcile"
import type { HistoryRow } from "../types"
import fixture from "../__fixtures__/history-rh-day-2.json"

/**
 * D-W2 — the reconcile engine, driven by the real RH Day 2 service.
 *
 * The plan rows below are the actual setlist
 * (`2b2cc0f5-98d6-4549-9289-9cd8cbff5ff5`, `crc-machzor-2008`), trimmed to the
 * stretch the fixture's cues touch plus enough either side to exercise the
 * bracketing rule. Pages are that setlist's own.
 *
 * The one thing this suite is really for: proving the engine does NOT paint an
 * ordinary service red. The machzor has almost no cues, and a naive diff would
 * call forty rows "skipped".
 */

const HISTORY = (fixture as { rows: HistoryRow[] }).rows

const PLAN: PlannedRow[] = [
    { trackId: "t0", title: "Before the Book", type: "header" },
    { trackId: "t1", title: "Band prelude / gathering music", type: "note" },
    { trackId: "t2", title: "Achat Sha'alti", type: "song" },
    { trackId: "t3", title: "Hashivenu", type: "song" },
    { trackId: "t4", title: "Return Again", type: "song" },
    { trackId: "t5", title: "Welcome & introduction", type: "note" },
    {
        trackId: "t6",
        title: "Awakening",
        type: "header",
        liturgyRef: { book: "crc-machzor-2008", folio: 39 },
    },
    {
        trackId: "t7",
        title: "Modah / Modeh Ani",
        type: "song",
        liturgyRef: { book: "crc-machzor-2008", folio: 39 },
    },
    {
        trackId: "t8",
        title: "Mah Tovu",
        type: "song",
        liturgyRef: { book: "crc-machzor-2008", folio: 39 },
    },
    {
        trackId: "t9",
        title: "Birchot HaShachar",
        type: "prayer",
        liturgyRef: { book: "crc-machzor-2008", folio: 42 },
    },
    {
        trackId: "t10",
        title: "Chatzi Kaddish",
        type: "prayer",
        liturgyRef: { book: "crc-machzor-2008", folio: 44 },
    },
    {
        trackId: "t11",
        title: "Sh'ma & Its Blessings",
        type: "header",
        liturgyRef: { book: "crc-machzor-2008", folio: 45 },
    },
    {
        trackId: "t12",
        title: "Barchu",
        type: "song",
        liturgyRef: { book: "crc-machzor-2008", folio: 45 },
    },
    {
        trackId: "t13",
        title: "Yotzer Or",
        type: "prayer",
        liturgyRef: { book: "crc-machzor-2008", folio: 45 },
    },
    {
        trackId: "t14",
        title: "The Sh'ma",
        type: "prayer",
        liturgyRef: { book: "crc-machzor-2008", folio: 49 },
    },
    {
        trackId: "t15",
        title: "Mi Chamocha",
        type: "song",
        liturgyRef: { book: "crc-machzor-2008", folio: 52 },
    },
    {
        trackId: "t16",
        title: "T'filah",
        type: "header",
        liturgyRef: { book: "crc-machzor-2008", folio: 53 },
    },
    {
        trackId: "t17",
        title: "Avot v'Imahot",
        type: "prayer",
        liturgyRef: { book: "crc-machzor-2008", folio: 53 },
    },
    { trackId: "t18", title: "Adon Olam", type: "song", liturgyRef: { book: "crc-machzor-2008", folio: 129 } },
]

const diff = reconcile("2b2cc0f5", PLAN, HISTORY)
const byTrack = (id: string) => diff.rows.find((r) => r.trackId === id)!

describe("reconcile — the RH Day 2 fixture", () => {
    it("ignores a cue with no identity at all", () => {
        // seq 6 is a custom names panel: no unit, no moment, no page. It must
        // never be matched to a row and never become an "added" one.
        expect(diff.historyRows).toBe(6)
        expect(diff.ignoredRows).toBe(1)
    })

    it("resolves the three-way p.39 tie away from the header", () => {
        // The 'Awakening' header, Modeh Ani and Mah Tovu are ALL p.39. Two cues
        // fired. They belong to the two substantive rows, in order — not to the
        // header, which is structure and does not fire.
        expect(byTrack("t7").status).toBe("performed")
        expect(byTrack("t7").basis).toBe("liturgyRef")
        expect(byTrack("t8").status).toBe("performed")
        expect(byTrack("t6").basis).not.toBe("liturgyRef")
    })

    it("matches Barchu rather than the header or Yotzer Or that share p.45", () => {
        expect(byTrack("t12").status).toBe("performed")
        expect(byTrack("t12").seq).toBe(3)
        expect(byTrack("t11").seq).toBeUndefined()
        expect(byTrack("t13").seq).toBeUndefined()
    })

    it("carries performedAt from the cue", () => {
        expect(byTrack("t15").performedAt).toBe("2026-09-13T14:44:12.000Z")
    })

    it("proposes the audible as an added row, with its page", () => {
        const added = diff.rows.filter((r) => r.status === "added")
        expect(added).toHaveLength(1)
        expect(added[0].liturgyRef).toEqual({
            book: "crc-machzor-2008",
            unitId: "concluding.oseh-shalom@shabbat-maariv",
            folio: 63,
        })
        expect(added[0].type).toBe("prayer")
        expect(added[0].title).toBe("oseh-shalom")
    })

    it("splices the added row in at the point the cue fired", () => {
        const idx = diff.rows.findIndex((r) => r.status === "added")
        const before = diff.rows[idx - 1]
        // seq 4 fired after Barchu (seq 3) and before Mi Chamocha (seq 5).
        expect(before.trackId).toBe("t12")
    })
})

describe("reconcile — it does not paint an ordinary service red", () => {
    it("never marks a header or a note 'skipped'", () => {
        for (const r of diff.rows) {
            if (r.type === "header" || r.type === "note") expect(r.status).not.toBe("skipped")
        }
    })

    it("lets a bracketed header inherit 'performed' — the service ran through it", () => {
        expect(byTrack("t11").status).toBe("performed")
        expect(byTrack("t11").basis).toBe("bracketed")
    })

    it("lets a bracketed band-only song inherit 'performed'", () => {
        // No page, no graphic — the CRC common case. It must not read as red.
        const planWithBandSong: PlannedRow[] = [
            { trackId: "a", title: "Modeh", liturgyRef: { book: "crc-machzor-2008", folio: 39 } },
            { trackId: "b", title: "A band-only niggun", type: "song" },
            { trackId: "c", title: "Mi Chamocha", liturgyRef: { book: "crc-machzor-2008", folio: 52 } },
        ]
        const d = reconcile("x", planWithBandSong, [
            { seq: 1, at: "2026-09-13T14:00:00.000Z", action: "show", book: "crc-machzor-2008", folio: 39 },
            { seq: 2, at: "2026-09-13T14:20:00.000Z", action: "show", book: "crc-machzor-2008", folio: 52 },
        ])
        const b = d.rows.find((r) => r.trackId === "b")!
        expect(b.status).toBe("performed")
        expect(b.basis).toBe("bracketed")
    })

    it("marks a paged row 'skipped' ONLY inside the stretch the service passed through", () => {
        // t9/t10/t14 sit between performed rows and carry pages — genuinely
        // skipped. t17 is past the last cue: unknowable, so untracked.
        expect(byTrack("t9").status).toBe("skipped")
        expect(byTrack("t10").status).toBe("skipped")
        expect(byTrack("t14").status).toBe("skipped")
        expect(byTrack("t17").status).toBe("untracked")
        expect(byTrack("t18").status).toBe("untracked")
    })

    it("leaves everything before the first cue untracked, not skipped", () => {
        for (const id of ["t0", "t1", "t2", "t3", "t4", "t5", "t6"]) {
            expect(byTrack(id).status, id).toBe("untracked")
        }
    })

    it("an EMPTY history makes every row untracked and nothing skipped", () => {
        const d = reconcile("x", PLAN, [])
        expect(d.counts.skipped).toBe(0)
        expect(d.counts.performed).toBe(0)
        expect(d.counts.untracked).toBe(PLAN.length)
    })

    it("counts add up to the rows emitted", () => {
        const total = Object.values(diff.counts).reduce((a, b) => a + b, 0)
        expect(total).toBe(diff.rows.length)
    })
})

describe("reconcile — order", () => {
    it("flags BOTH sides of a swap, not just the later one", () => {
        const plan: PlannedRow[] = [
            { trackId: "a", title: "First", liturgyRef: { book: "crc-machzor-2008", folio: 39 } },
            { trackId: "b", title: "Second", liturgyRef: { book: "crc-machzor-2008", folio: 45 } },
            { trackId: "c", title: "Third", liturgyRef: { book: "crc-machzor-2008", folio: 52 } },
        ]
        const d = reconcile("x", plan, [
            { seq: 1, at: "2026-09-13T14:00:00.000Z", action: "show", book: "crc-machzor-2008", folio: 39 },
            { seq: 2, at: "2026-09-13T14:10:00.000Z", action: "show", book: "crc-machzor-2008", folio: 52 },
            { seq: 3, at: "2026-09-13T14:20:00.000Z", action: "show", book: "crc-machzor-2008", folio: 45 },
        ])
        // The service went a, c, b. Both b and c are out of place relative to
        // the plan; blaming only one of them would be arbitrary.
        expect(d.rows.find((r) => r.trackId === "a")!.status).toBe("performed")
        expect(d.rows.find((r) => r.trackId === "b")!.status).toBe("reordered")
        expect(d.rows.find((r) => r.trackId === "c")!.status).toBe("reordered")
    })

    it("flags nothing when the cues follow the plan", () => {
        const plan: PlannedRow[] = [
            { trackId: "a", title: "First", liturgyRef: { book: "crc-machzor-2008", folio: 39 } },
            { trackId: "b", title: "Second", liturgyRef: { book: "crc-machzor-2008", folio: 45 } },
        ]
        const d = reconcile("x", plan, [
            { seq: 1, at: "2026-09-13T14:00:00.000Z", action: "show", book: "crc-machzor-2008", folio: 39 },
            { seq: 2, at: "2026-09-13T14:10:00.000Z", action: "show", book: "crc-machzor-2008", folio: 45 },
        ])
        expect(d.counts.reordered).toBe(0)
    })
})

describe("chapters", () => {
    it("counts from the first cue and formats mm:ss", () => {
        const lines = chapters(diff).map((c) => c.line)
        expect(lines[0]).toBe("0:00  Modah / Modeh Ani")
        expect(lines[1]).toBe("3:27  Mah Tovu")
        expect(lines[2]).toBe("19:05  Barchu")
    })

    it("applies the offset Daniel types in", () => {
        expect(chapters(diff, 90)[0].line).toBe("1:30  Modah / Modeh Ani")
    })

    it("never emits a negative time", () => {
        expect(chapters(diff, -600)[0].offsetSeconds).toBe(0)
    })

    it("crosses the hour into h:mm:ss", () => {
        const d = reconcile(
            "x",
            [{ trackId: "a", title: "Late", liturgyRef: { book: "crc-machzor-2008", folio: 39 } }],
            [{ seq: 1, at: "2026-09-13T14:00:00.000Z", action: "show", book: "crc-machzor-2008", folio: 39 }],
        )
        expect(chapters(d, 3725)[0].line).toBe("1:02:05  Late")
    })

    it("is empty when nothing fired", () => {
        expect(chapters(reconcile("x", PLAN, []))).toEqual([])
    })
})
