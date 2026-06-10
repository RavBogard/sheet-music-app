import { describe, it, expect } from "vitest"
import { Timestamp } from "firebase-admin/firestore"
import { serializeTimestamps } from "../serialize-timestamps"

// v11.2-05-02 (BUG-8): the boundary timestamp normalizer. A Firestore admin
// Timestamp's JSON.stringify form is {_seconds,_nanoseconds} — the raw leak the
// BL stress-test flagged on add_track_to_setlist.updatedAt. serializeTimestamps
// converts every timestamp shape to ISO while leaving all else untouched.

describe("serializeTimestamps (BUG-8 boundary normalizer)", () => {
    const ISO = "2026-06-11T12:00:00.000Z"
    const ts = Timestamp.fromDate(new Date(ISO))

    it("converts a live admin Timestamp to an ISO string (top level)", () => {
        expect(serializeTimestamps(ts)).toBe(ISO)
    })

    it("converts a nested Timestamp inside an object", () => {
        const out = serializeTimestamps({ track: { id: "t1", updatedAt: ts } }) as {
            track: { id: string; updatedAt: unknown }
        }
        expect(out.track.id).toBe("t1")
        expect(out.track.updatedAt).toBe(ISO)
    })

    // Derive the raw shape from a known Date so the expectation can't drift on a
    // hand-computed epoch. {_seconds,_nanoseconds} is the form JSON.stringify
    // emits for an admin Timestamp (its .seconds/.nanoseconds getters).
    const ISO2 = "2026-06-12T00:00:00.000Z"
    const ts2 = Timestamp.fromDate(new Date(ISO2))
    const raw = { _seconds: ts2.seconds, _nanoseconds: ts2.nanoseconds }

    it("converts the already-serialized {_seconds,_nanoseconds} shape", () => {
        expect(serializeTimestamps({ ...raw })).toBe(ISO2)
    })

    it("converts the client {seconds,nanoseconds} shape", () => {
        const clientShape = { seconds: raw._seconds, nanoseconds: raw._nanoseconds }
        expect(serializeTimestamps(clientShape)).toBe(ISO2)
    })

    it("converts timestamps inside arrays and deep nesting", () => {
        const out = serializeTimestamps({
            tracks: [
                { id: "a", updatedAt: ts },
                { id: "b", updatedAt: { ...raw } },
            ],
        }) as { tracks: Array<{ id: string; updatedAt: unknown }> }
        expect(out.tracks[0].updatedAt).toBe(ISO)
        expect(out.tracks[1].updatedAt).toBe(ISO2)
    })

    it("passes through ISO strings, ms-epoch numbers, booleans, and null unchanged", () => {
        expect(serializeTimestamps(ISO)).toBe(ISO)
        expect(serializeTimestamps(1781481600000)).toBe(1781481600000)
        expect(serializeTimestamps(true)).toBe(true)
        expect(serializeTimestamps(null)).toBe(null)
        expect(serializeTimestamps("hello")).toBe("hello")
    })

    it("does NOT convert a non-timestamp object that merely has a `seconds` field", () => {
        const domain = { seconds: 3, label: "x" } // extra key → not a timestamp
        expect(serializeTimestamps(domain)).toEqual({ seconds: 3, label: "x" })
    })

    it("does NOT convert a two-key object whose keys aren't the timestamp pair", () => {
        const obj = { seconds: 3, foo: 4 } // no nanoseconds → not a timestamp
        expect(serializeTimestamps(obj)).toEqual({ seconds: 3, foo: 4 })
    })

    it("AC-1: an add_track-shaped echo surfaces updatedAt as ISO", () => {
        const echo = { ok: true, track: { id: "trk-1", title: "Hallelujah", updatedAt: ts } }
        const out = serializeTimestamps(echo) as {
            ok: boolean
            track: { id: string; title: string; updatedAt: unknown }
        }
        expect(out.ok).toBe(true)
        expect(out.track.updatedAt).toBe(ISO)
        // No raw {_seconds,_nanoseconds} survives anywhere in the JSON.
        expect(JSON.stringify(out)).not.toContain("_seconds")
    })

    it("is idempotent — re-running over already-ISO output is a no-op", () => {
        const once = serializeTimestamps({ updatedAt: ts })
        expect(serializeTimestamps(once)).toEqual(once)
    })
})
