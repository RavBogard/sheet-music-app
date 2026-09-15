import { describe, it, expect } from "vitest"
import { isFoldableLiturgyRow, liturgyRuns, runFolios } from "../liturgy-runs"
import type { SetlistTrack } from "@/types/models"

const row = (t: Partial<SetlistTrack>): SetlistTrack =>
    ({ id: t.title ?? "x", title: "x", ...t }) as SetlistTrack

/**
 * What folds away on a music stand, and what must never.
 *
 * The four templates carry 45 `fixed` rows between them. The failure this
 * guards against is folding a row the band actually plays from: the Always
 * merge deliberately marks template song slots `fixed` while leaving their
 * charts bonded, so "fixed" alone is not the test — "fixed AND no chart" is.
 */
describe("isFoldableLiturgyRow", () => {
    it("folds a fixed row with no chart", () => {
        expect(isFoldableLiturgyRow(row({ type: "prayer", fixed: true }))).toBe(true)
    })

    it("never folds a row with a chart bonded to it", () => {
        // Bar'chu on the Friday template is fixed AND charted. Folding it
        // would hide a chart behind a divider, mid-service, on a stand.
        expect(
            isFoldableLiturgyRow(row({ type: "song", fixed: true, fileId: "chart-1" })),
        ).toBe(false)
    })

    it("never folds an unfixed row, however page-like it looks", () => {
        expect(
            isFoldableLiturgyRow(row({ type: "prayer", liturgyRef: { book: "crc-friday", folio: 22 } })),
        ).toBe(false)
    })

    it("never folds a header, in either spelling", () => {
        expect(isFoldableLiturgyRow(row({ type: "header", fixed: true }))).toBe(false)
        // `section` is what the grid's type picker writes; the canonical
        // TrackType union only lists `header`, and both appear in real data.
        expect(
            isFoldableLiturgyRow(row({ type: "section" as SetlistTrack["type"], fixed: true })),
        ).toBe(false)
    })
})

describe("liturgyRuns", () => {
    const tracks: SetlistTrack[] = [
        row({ title: "Fiddley Tune", type: "song", fileId: "a" }),
        row({ title: "Hareini", type: "prayer", fixed: true, liturgyRef: { book: "crc-friday", folio: 3 } }),
        row({ title: "Candle Blessing", type: "prayer", fixed: true, liturgyRef: { book: "crc-friday", folio: 5 } }),
        row({ title: "L'cha Dodi", type: "song", fileId: "b" }),
        row({ title: "Chatzi Kaddish", type: "prayer", fixed: true, liturgyRef: { book: "crc-friday", folio: 22 } }),
    ]

    it("groups consecutive foldable rows and leaves the rest alone", () => {
        expect(liturgyRuns(tracks)).toEqual([
            { start: 1, indexes: [1, 2] },
            { start: 4, indexes: [4] },
        ])
    })

    it("closes a run at the first row the band plays from", () => {
        // Not one run of three: L'cha Dodi is in the middle of it and has a
        // chart, so the stretch genuinely ends there.
        const runs = liturgyRuns(tracks)
        expect(runs[0].indexes).not.toContain(3)
    })

    it("reports the pages a run spans, ascending and de-duplicated", () => {
        const runs = liturgyRuns(tracks)
        expect(runFolios(tracks, runs[0])).toEqual([3, 5])
        expect(runFolios(tracks, runs[1])).toEqual([22])
    })

    it("says nothing about pages for a run that has none", () => {
        const none = [row({ type: "prayer", fixed: true })]
        expect(runFolios(none, liturgyRuns(none)[0])).toEqual([])
    })

    it("finds no runs in a setlist of songs", () => {
        expect(liturgyRuns([row({ type: "song", fileId: "a" })])).toEqual([])
        expect(liturgyRuns([])).toEqual([])
    })

    it("closes a run that reaches the end of the setlist", () => {
        const trailing = [
            row({ title: "Song", type: "song", fileId: "a" }),
            row({ title: "Aleinu", type: "prayer", fixed: true }),
            row({ title: "Mourner's Kaddish", type: "prayer", fixed: true }),
        ]
        expect(liturgyRuns(trailing)).toEqual([{ start: 1, indexes: [1, 2] }])
    })
})
