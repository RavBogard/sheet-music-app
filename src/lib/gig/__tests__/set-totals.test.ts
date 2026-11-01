import { describe, expect, it } from "vitest"
import { anyDuration, setTotals } from "@/lib/gig/set-totals"
import { parseGigArg, parseTrackGigPatch, readGig } from "@/lib/gig/model"

describe("setTotals", () => {
    const rows = [
        { id: "h1", type: "header", title: "Set 1" },
        { id: "a", type: "song", title: "A", durationSec: 200 },
        { id: "b", type: "song", title: "B" },
        { id: "n", type: "note", title: "talk" },
        { id: "c", type: "song", title: "C", durationSec: 100 },
        { id: "h2", type: "header", title: "Set 2" },
        { id: "d", title: "D", durationSec: 300 },
    ]

    it("sums each set between headers and counts untimed songs, not other rows", () => {
        const totals = setTotals(rows)
        expect(totals).toEqual([
            { header: { id: "h1", title: "Set 1" }, seconds: 300, untimed: 1 },
            { header: { id: "h2", title: "Set 2" }, seconds: 300, untimed: 0 },
        ])
    })

    it("puts rows before the first header in a set of their own", () => {
        const totals = setTotals([{ id: "x", type: "song", durationSec: 60 }, ...rows])
        expect(totals[0]).toEqual({ header: null, seconds: 60, untimed: 0 })
        expect(totals).toHaveLength(3)
    })

    it("applies targets by header id first, then by position", () => {
        const totals = setTotals(rows, { setTargets: [{ headerRowId: "h2", minutes: 4 }, { minutes: 5 }] })
        expect(totals[0]).toMatchObject({ targetMinutes: 5, overUnderSec: 0 })
        expect(totals[1]).toMatchObject({ targetMinutes: 4, overUnderSec: 60 })
    })

    it("has no target fields when the gig sets none", () => {
        const totals = setTotals(rows, null)
        expect(totals.every((t) => !("targetMinutes" in t) && !("overUnderSec" in t))).toBe(true)
    })

    it("an empty setlist has no sets; anyDuration sees only numeric lengths", () => {
        expect(setTotals([])).toEqual([])
        expect(anyDuration([{ type: "song" }, { type: "song", durationSec: null }])).toBe(false)
        expect(anyDuration([{ type: "song", durationSec: 0 }])).toBe(false)
        expect(anyDuration([{ type: "song", durationSec: 1 }])).toBe(true)
    })

    it("a length of 0 is untimed", () => {
        expect(setTotals([{ type: "song", durationSec: 0 }, { type: "song", durationSec: 30 }])).toEqual([
            { header: null, seconds: 30, untimed: 1 },
        ])
    })

    it("an end before the start crosses midnight and is flagged, not refused", () => {
        expect(parseGigArg({ start: "22:00", end: "01:30" }).ok).toBe(true)
        const late = setTotals(rows, { start: "22:00", end: "01:30" })
        expect(late.every((t) => t.crossesMidnight === true)).toBe(true)
        expect(setTotals(rows, { start: "20:00", end: "23:00" }).some((t) => "crossesMidnight" in t)).toBe(false)
    })
})

describe("gig validation", () => {
    it("accepts a gig patch, null fields, and null for the whole gig", () => {
        expect(parseGigArg({ venue: "The Pageant", start: "20:00", loadIn: null })).toEqual({
            ok: true,
            gig: { venue: "The Pageant", start: "20:00", loadIn: null },
        })
        expect(parseGigArg(null)).toEqual({ ok: true, gig: null })
    })

    it("refuses a bad time, an unknown field and a bad target as rich errors", () => {
        for (const bad of [{ start: "8pm" }, { fee: 500 }, { setTargets: [{ minutes: 0 }] }]) {
            const r = parseGigArg(bad)
            expect(r.ok).toBe(false)
            if (!r.ok) expect(r.error).toMatchObject({ ok: false, error: { machine_code: "invalid_argument" } })
        }
    })

    it("validates the track band fields", () => {
        expect(parseTrackGigPatch({ durationSec: 245, segue: true, singerKeys: [{ musician: "Ben", key: "G" }] }).ok).toBe(true)
        expect(parseTrackGigPatch({ durationSec: null }).ok).toBe(true)
        expect(parseTrackGigPatch({ durationSec: -1 }).ok).toBe(false)
        expect(parseTrackGigPatch({ durationSec: 1.5 }).ok).toBe(false)
        expect(parseTrackGigPatch({ singerKeys: [{ musician: "", key: "G" }] }).ok).toBe(false)
        for (const key of ["G", "Bb", "F#m", "Ebm"]) expect(parseTrackGigPatch({ singerKeys: [{ musician: "Ben", key }] }).ok, key).toBe(true)
        for (const key of ["H", "g", "Bbb", "C major", "Dm7"]) expect(parseTrackGigPatch({ singerKeys: [{ musician: "Ben", key }] }).ok, key).toBe(false)
        expect(
            parseTrackGigPatch({ singerKeys: [{ musician: "Ben", key: "G" }, { musician: "ben", key: "A" }] }).ok,
        ).toBe(false)
    })

    it("readGig keeps only well-typed fields", () => {
        expect(readGig({ venue: "X", start: 7, setTargets: [{ minutes: 45 }, { minutes: "x" }] })).toEqual({
            venue: "X",
            setTargets: [{ minutes: 45 }],
        })
        expect(readGig(undefined)).toBeNull()
    })
})
