import { describe, expect, it } from "vitest"

import {
    displayKeyOf,
    formatDuration,
    gigTrackFields,
    leadSingerKey,
    parseDuration,
    setTotalsByHeader,
    showsTiming,
} from "../display"

describe("BET-5 display helpers", () => {
    it("formats lengths as m:ss, h:mm:ss past an hour", () => {
        expect(formatDuration(0)).toBe("0:00")
        expect(formatDuration(225)).toBe("3:45")
        expect(formatDuration(2700)).toBe("45:00")
        expect(formatDuration(5020)).toBe("1:23:40")
        expect(formatDuration(-200)).toBe("3:20")
    })

    it("reads what the author types: m:ss or whole minutes; empty clears; anything else is not a length", () => {
        expect(parseDuration("3:45")).toBe(225)
        expect(parseDuration(" 4 ")).toBe(240)
        expect(parseDuration("")).toBeNull()
        expect(parseDuration("3:75")).toBeUndefined()
        expect(parseDuration("abc")).toBeUndefined()
        expect(parseDuration("121:00")).toBeUndefined() // past the 2-hour row limit
    })

    it("the key tag shows the lead singer's recorded key, else the row's key, and never invents one", () => {
        const row = { key: "G", leadMusician: "Sam", singerKeys: [{ musician: "sam", key: "Bb" }, { musician: "Ari", key: "D" }] }
        expect(leadSingerKey(row)).toBe("Bb")
        expect(displayKeyOf(row)).toBe("Bb")
        expect(leadSingerKey({ ...row, leadMusician: "Noa" })).toBeNull()
        expect(displayKeyOf({ ...row, leadMusician: "Noa" })).toBe("G")
        expect(displayKeyOf({ leadMusician: "Sam" })).toBeNull()
    })

    it("timing shows for a band tenant always, for any other tenant only once a row has a length", () => {
        expect(showsTiming(true, [])).toBe(true)
        expect(showsTiming(false, [{ type: "song" }])).toBe(false)
        expect(showsTiming(false, [{ type: "song", durationSec: 0 }])).toBe(false)
        expect(showsTiming(false, [{ type: "song", durationSec: 200 }])).toBe(true)
    })

    it("totals sets between header and section rows, keyed by the header row", () => {
        const rows = [
            { id: "h1", type: "header", title: "Set 1" },
            { id: "a", type: "song", durationSec: 200 },
            { id: "b", type: "song" },
            { id: "h2", type: "section", title: "Set 2" },
            { id: "c", type: "song", durationSec: 100 },
        ]
        const out = setTotalsByHeader(rows, { setTargets: [{ headerRowId: "h2", minutes: 1 }] })
        expect(out.byHeaderId.h1).toMatchObject({ seconds: 200, untimed: 1 })
        expect(out.byHeaderId.h2).toMatchObject({ seconds: 100, targetMinutes: 1, overUnderSec: 40 })
        expect(out.seconds).toBe(300)
    })

    it("a print row carries only the band fields it holds", () => {
        expect(gigTrackFields({ type: "song", key: "G" })).toEqual({})
        expect(gigTrackFields({ type: "song", durationSec: 90, segue: true, singerKeys: [{ musician: "A", key: "C" }] })).toEqual({
            durationSec: 90,
            segue: true,
            singerKeys: [{ musician: "A", key: "C" }],
        })
        // A header's id rides along only when the gig has set targets to match.
        expect(gigTrackFields({ id: "h1", type: "header" })).toEqual({})
        expect(gigTrackFields({ id: "h1", type: "header" }, { setTargets: [{ minutes: 40 }] })).toEqual({ id: "h1" })
    })
})
