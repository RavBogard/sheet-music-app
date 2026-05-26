import { describe, it, expect } from "vitest"
import { coerceArray, coerceMixerSnapshot } from "@/lib/monitor/coerce-state"

describe("coerceArray (C-4 shared read guard)", () => {
    it("passes a real array through unchanged", () => {
        const arr = [{ a: 1 }, { a: 2 }]
        expect(coerceArray(arr)).toBe(arr)
    })

    it("recovers survivors from an array→map corruption (Object.values)", () => {
        // A dot-path `update({ 'buses.5.fader': v })` turns the array into a
        // map keyed by stringified index — keep the surviving entries.
        const corrupted = { "5": { index: 5 }, "2": { index: 2 } }
        const out = coerceArray<{ index: number }>(corrupted)
        expect(out).toHaveLength(2)
        expect(out.map((b) => b.index).sort()).toEqual([2, 5])
    })

    it("returns [] for null / undefined / scalars (never throws)", () => {
        expect(coerceArray(null)).toEqual([])
        expect(coerceArray(undefined)).toEqual([])
        expect(coerceArray(42)).toEqual([])
        expect(coerceArray("nope")).toEqual([])
    })
})

describe("coerceMixerSnapshot (C-4 shared read guard)", () => {
    it("normalizes a well-formed snapshot and keeps sends arrays", () => {
        const raw = {
            channels: [{ index: 0, name: "Kick", color: 1 }],
            buses: [{ index: 5, name: "IEM", fader: 0.7, sends: [{ channelIndex: 0, level: 0.5, on: true }] }],
            matrices: [{ index: 1, name: "Mtx", fader: 0.3, on: true }],
            config: { busAssignments: {} },
        }
        const snap = coerceMixerSnapshot(raw)
        expect(snap.channels).toHaveLength(1)
        expect(snap.buses).toHaveLength(1)
        expect(Array.isArray(snap.buses[0].sends)).toBe(true)
        expect(snap.buses[0].sends).toHaveLength(1)
        expect(snap.matrices).toHaveLength(1)
    })

    it("degrades a corrupted (map) buses to surviving array entries — no throw, no total loss", () => {
        const raw = {
            channels: { "0": { index: 0, name: "Kick", color: 1 } }, // also corrupted
            buses: { "5": { index: 5, name: "IEM", fader: 0.7, sends: { "0": { channelIndex: 0, level: 0.5, on: true } } } },
            matrices: null,
        }
        const snap = coerceMixerSnapshot(raw)
        expect(snap.buses).toHaveLength(1)
        expect(snap.buses[0].index).toBe(5)
        // sends were ALSO a map → coerced back to an array (so .find/.map downstream is safe)
        expect(Array.isArray(snap.buses[0].sends)).toBe(true)
        expect(snap.buses[0].sends).toHaveLength(1)
        expect(snap.channels).toHaveLength(1)
        expect(snap.matrices).toEqual([])
    })

    it("never throws on a fully malformed / empty document", () => {
        expect(() => coerceMixerSnapshot(null)).not.toThrow()
        expect(() => coerceMixerSnapshot(undefined)).not.toThrow()
        expect(() => coerceMixerSnapshot(42)).not.toThrow()
        const snap = coerceMixerSnapshot({})
        expect(snap.channels).toEqual([])
        expect(snap.buses).toEqual([])
        expect(snap.matrices).toEqual([])
    })

    describe("BusInfo.on — master-mute back-compat (monitor-master-mute-fix)", () => {
        it("reads explicit bus.on=false (master muted) from a v10.0.7+ snapshot", () => {
            const raw = {
                buses: [{ index: 5, name: "IEM", fader: 0.7, on: false, sends: [] }],
            }
            const snap = coerceMixerSnapshot(raw)
            expect(snap.buses[0].on).toBe(false)
        })

        it("reads explicit bus.on=true (master unmuted) from a v10.0.7+ snapshot", () => {
            const raw = {
                buses: [{ index: 5, name: "IEM", fader: 0.7, on: true, sends: [] }],
            }
            const snap = coerceMixerSnapshot(raw)
            expect(snap.buses[0].on).toBe(true)
        })

        it("defaults bus.on=true (unmuted) when the field is absent (pre-v10.0.7 bridge)", () => {
            // The conservative reading — a fresh-install iPad won't display a
            // master as muted on first frame against an older bridge.
            const raw = {
                buses: [{ index: 5, name: "IEM", fader: 0.7, sends: [] }],
            }
            const snap = coerceMixerSnapshot(raw)
            expect(snap.buses[0].on).toBe(true)
        })

        it("defaults bus.on=true when the field is present but non-boolean (corrupt write)", () => {
            const raw = {
                buses: [{ index: 5, name: "IEM", fader: 0.7, on: "muted", sends: [] }],
            }
            const snap = coerceMixerSnapshot(raw)
            expect(snap.buses[0].on).toBe(true)
        })
    })
})
