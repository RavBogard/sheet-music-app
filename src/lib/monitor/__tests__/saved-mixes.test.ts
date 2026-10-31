import { describe, expect, it } from "vitest"
import {
    coerceSnapshot,
    homeLevelsFrom,
    planRecall,
    rampLevels,
    recallList,
    recallWaves,
    type MixSnapshot,
} from "@/lib/monitor/saved-mixes"

const snap = (over: Partial<MixSnapshot> = {}): MixSnapshot => ({
    id: "s1",
    busIndex: 2,
    kind: "named",
    name: "Friday",
    serviceType: "friday_night",
    ownerUid: "u1",
    createdAt: 1000,
    sends: [],
    master: null,
    ...over,
})

describe("BET-4 snapshots: reading and visibility", () => {
    it("coerces a stored doc defensively, accepting a Timestamp or a number", () => {
        const s = coerceSnapshot("a", {
            kind: "auto",
            createdAt: { toMillis: () => 5000 },
            sends: [{ channelIndex: 1, channelName: "Kick", level: 0.5, on: true }, { channelIndex: 2, level: 7 }, "junk"],
            master: 0.6,
        }, 3)
        expect(s).toMatchObject({ id: "a", busIndex: 3, kind: "auto", createdAt: 5000, master: 0.6 })
        expect(s!.sends).toEqual([{ channelIndex: 1, channelName: "Kick", level: 0.5, on: true }])
        expect(coerceSnapshot("b", { busIndex: 2, sends: [] })).toBeNull()
    })

    it("named mixes are their owner's alone; auto snapshots are the bus's, newest first, last 3", () => {
        const all = [
            snap({ id: "mine", ownerUid: "u1", createdAt: 10 }),
            snap({ id: "theirs", ownerUid: "u2", createdAt: 20 }),
            ...[1, 2, 3, 4].map((i) => snap({ id: `auto${i}`, kind: "auto", ownerUid: null, name: null, createdAt: i * 100 })),
        ]
        const list = recallList(all, "u1")
        expect(list.named.map((s) => s.id)).toEqual(["mine"])
        expect(list.auto.map((s) => s.id)).toEqual(["auto4", "auto3", "auto2"])
        expect(recallList(all, "u2").named.map((s) => s.id)).toEqual(["theirs"])
    })

    it("home levels come from the newest visible snapshot", () => {
        const home = homeLevelsFrom({
            named: [snap({ createdAt: 50, sends: [{ channelIndex: 3, channelName: "", level: 0.4, on: true }], master: 0.66 })],
            auto: [snap({ kind: "auto", createdAt: 10, sends: [{ channelIndex: 3, channelName: "", level: 0.1, on: true }] })],
        })
        expect(home).toEqual({ master: 0.66, sends: { 3: 0.4 } })
    })
})

describe("BET-4 recall plan", () => {
    const channels = [
        { index: 1, name: "Kick" },
        { index: 2, name: "Bass" },
        { index: 9, name: "Rabbi Dan" }, // was channel 5 when the mix was saved
        { index: 5, name: "Spare" },
    ]
    const live = {
        index: 2,
        fader: 0.5,
        sends: [
            { channelIndex: 1, level: 0.3, on: true },
            { channelIndex: 2, level: 0.5, on: true },
            { channelIndex: 5, level: 0, on: false },
            { channelIndex: 9, level: 0.2, on: true },
        ],
    }

    it("matches a renumbered desk by name, leaves a vanished channel alone, and holds levels to the cap", () => {
        const plan = planRecall(
            snap({
                master: 0.9,
                sends: [
                    { channelIndex: 1, channelName: "Kick", level: 0.3, on: true },
                    { channelIndex: 2, channelName: "Bass", level: 0.95, on: true },
                    { channelIndex: 5, channelName: "Rabbi Dan", level: 0.62, on: true },
                    { channelIndex: 12, channelName: "Choir", level: 0.5, on: true },
                ],
            }),
            live,
            channels,
            { default: { send: 0.7, master: 0.7 } },
        )
        expect(plan.unchanged).toBe(1) // Kick
        expect(plan.unmatched).toEqual([{ channelIndex: 12, channelName: "Choir", reason: "not_on_desk" }])
        const byName = Object.fromEntries(plan.changes.map((c) => [c.target === "master" ? "master" : c.channelName, c]))
        expect(byName.master).toMatchObject({ toLevel: 0.7, clamped: true, toDb: -2 })
        expect(byName.Bass).toMatchObject({ channelIndex: 2, toLevel: 0.7, clamped: true })
        expect(byName["Rabbi Dan"]).toMatchObject({ channelIndex: 9, matchedBy: "name", fromLevel: 0.2, toLevel: 0.62, clamped: false })
        // channel 5 ("Spare") is untouched: the saved channel 5 was the rabbi's mic.
        expect(plan.changes.find((c) => c.channelIndex === 5)).toBeUndefined()
    })

    it("a second saved send matching the same desk channel is reported as a duplicate, not applied", () => {
        const plan = planRecall(
            snap({
                sends: [
                    { channelIndex: 1, channelName: "Kick", level: 0.5, on: true },
                    { channelIndex: 3, channelName: "kick ", level: 0.1, on: true },
                ],
            }),
            live,
            channels,
            undefined,
        )
        expect(plan.unmatched).toEqual([{ channelIndex: 3, channelName: "kick ", reason: "duplicate" }])
        expect(plan.changes.filter((c) => c.channelIndex === 1)).toHaveLength(1)
    })

    it("a muted send above its target comes down first and opens only after the ramp", () => {
        const plan = planRecall(
            snap({ sends: [{ channelIndex: 9, channelName: "Rabbi Dan", level: 0.4, on: true }] }),
            { ...live, sends: [{ channelIndex: 9, level: 0.95, on: false }] },
            channels,
            undefined, // default cap 0.70 is also below the current 0.95
        )
        const waves = recallWaves(plan, 3)
        const levels = waves.slice(0, 3)
        expect(levels.every((w) => w.every((c) => c.type === "set_send_level"))).toBe(true)
        expect(levels[2][0].value).toBe(0.4)
        expect(waves[3]).toEqual([{ type: "set_send_on", busIndex: 2, channelIndex: 9, value: true }])
    })

    it("ramps in finite steps that end exactly on the target", () => {
        const steps = rampLevels(0.2, 0.62, 5)
        expect(steps).toHaveLength(5)
        expect(steps[4]).toBe(0.62)
        for (const v of steps) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true)
        expect(steps).toEqual([...steps].sort((a, b) => a - b))
    })

    it("sends unmutes first, then the ramp waves, then mutes last", () => {
        const plan = planRecall(
            snap({
                sends: [
                    { channelIndex: 5, channelName: "Spare", level: 0.5, on: true },
                    { channelIndex: 1, channelName: "Kick", level: 0.1, on: false },
                ],
            }),
            live,
            channels,
            undefined,
        )
        const waves = recallWaves(plan, 3)
        expect(waves[0]).toEqual([{ type: "set_send_on", busIndex: 2, channelIndex: 5, value: true }])
        expect(waves.slice(1, 4).every((w) => w.every((c) => c.type === "set_send_level"))).toBe(true)
        expect(waves[4]).toEqual([{ type: "set_send_on", busIndex: 2, channelIndex: 1, value: false }])
        expect(waves[3].find((c) => c.channelIndex === 5)?.value).toBe(0.5)
    })
})
