import { describe, it, expect } from "vitest"
import {
    buildServiceSnapshot,
    mirrorCoversService,
    ownedBuses,
    servicesDueForSnapshot,
    snapshotIdFor,
    SERVICE_END_OFFSET_MS,
    SNAPSHOT_ELIGIBLE_MS,
} from "@/lib/monitor/service-snapshot"
import { coerceSnapshot } from "@/lib/monitor/saved-mixes"

const TZ = "America/Chicago"
const MIN = 60_000
const START = Date.parse("2026-11-07T00:15:00Z") // Friday 2026-11-06 18:15 CST

const service = {
    setlistId: "sl-fri",
    eventDate: "2026-11-06",
    startsAt: new Date(START).toISOString(),
    serviceType: "friday_night",
}

// Shaped like monitor-live/state as the bridge writes it.
const mirror = {
    channels: [
        { index: 1, name: "Vox" },
        { index: 2, name: "Gtr" },
    ],
    buses: [
        {
            index: 5,
            name: "Daniel",
            fader: 0.7,
            sends: [
                { channelIndex: 1, level: 0.5, on: true },
                { channelIndex: 2, level: 0.25, on: false },
            ],
        },
        { index: 6, name: "Empty", fader: 0.5, sends: [] },
    ],
}

describe("servicesDueForSnapshot", () => {
    it("is due 2 hours after the start and for a while after, never before or much later", () => {
        const due = START + SERVICE_END_OFFSET_MS
        expect(servicesDueForSnapshot([service], due - MIN, TZ)).toHaveLength(0)
        expect(servicesDueForSnapshot([service], due, TZ)).toHaveLength(1)
        expect(servicesDueForSnapshot([service], due + SNAPSHOT_ELIGIBLE_MS - MIN, TZ)).toHaveLength(1)
        expect(servicesDueForSnapshot([service], due + SNAPSHOT_ELIGIBLE_MS, TZ)).toHaveLength(0)
    })

    it("uses the Friday 18:15 default when a service has no time (DST-correct)", () => {
        const noTime = { setlistId: "sl-fri", eventDate: "2026-11-06" }
        expect(servicesDueForSnapshot([noTime], START + SERVICE_END_OFFSET_MS, TZ)).toHaveLength(1)
        expect(servicesDueForSnapshot([noTime], START + SERVICE_END_OFFSET_MS - 5 * MIN, TZ)).toHaveLength(0)
    })

    it("has nothing due on a day with no service", () => {
        expect(servicesDueForSnapshot([], START + SERVICE_END_OFFSET_MS, TZ)).toEqual([])
    })
})

describe("snapshotIdFor", () => {
    it("is the id the bridge writes: auto-<local start date>-<setlistId>", () => {
        // Friday 2026-11-06 18:15 CST is 2026-11-07T00:15Z: the id uses the LOCAL date, not the UTC one.
        expect(snapshotIdFor({ setlistId: "sl-fri", startMs: START }, TZ)).toBe("auto-2026-11-06-sl-fri")
    })

    it("sanitises the setlist id the way the bridge does", () => {
        expect(snapshotIdFor({ setlistId: "a/b c", startMs: START }, TZ)).toMatch(/-a_b_c$/)
    })
})

describe("mirrorCoversService", () => {
    it("accepts a mirror written around or after the start, rejects a stale one or none", () => {
        expect(mirrorCoversService(START + 90 * MIN, START)).toBe(true)
        expect(mirrorCoversService(START - 29 * MIN, START)).toBe(true)
        expect(mirrorCoversService(START - 31 * MIN, START)).toBe(false)
        expect(mirrorCoversService(START - 3 * 24 * 60 * MIN, START)).toBe(false)
        expect(mirrorCoversService(null, START)).toBe(false)
    })
})

describe("ownedBuses", () => {
    it("lists buses with someone assigned, from either assignment shape", () => {
        expect(
            ownedBuses({
                "5": { userId: "u1" },
                "2": [{ userId: "u2" }, { userId: "u3" }],
                "7": null,
                "8": [],
                "9": { userId: "" },
            }),
        ).toEqual([2, 5])
        expect(ownedBuses(undefined)).toEqual([])
    })
})

describe("buildServiceSnapshot", () => {
    it("builds the same shape the recall UI reads, named from the channel list", () => {
        const doc = buildServiceSnapshot(5, mirror, START + 90 * MIN, "friday_night")
        expect(doc).toMatchObject({
            busIndex: 5,
            kind: "auto",
            serviceType: "friday_night",
            master: 0.7,
            sends: [
                { channelIndex: 1, channelName: "Vox", level: 0.5, on: true },
                { channelIndex: 2, channelName: "Gtr", level: 0.25, on: false },
            ],
        })
        expect(doc!.createdAt.getTime()).toBe(START + 90 * MIN)
        // The recall UI accepts it as a stored auto snapshot.
        // Firestore hands a Date back as a Timestamp; model that.
        const stored = { ...doc, createdAt: { toMillis: () => doc!.createdAt.getTime() } }
        const back = coerceSnapshot("auto-2026-11-06-sl-fri", stored, 5)
        expect(back).toMatchObject({ kind: "auto", busIndex: 5, master: 0.7, serviceType: "friday_night" })
        expect(back!.sends).toHaveLength(2)
        expect(back!.createdAt).toBe(START + 90 * MIN)
    })

    it("returns null for a bus the mirror does not hold or that has no sends", () => {
        expect(buildServiceSnapshot(9, mirror, START)).toBeNull()
        expect(buildServiceSnapshot(6, mirror, START)).toBeNull()
        expect(buildServiceSnapshot(5, {}, START)).toBeNull()
        expect(buildServiceSnapshot(5, { buses: "garbage" }, START)).toBeNull()
    })

    it("skips malformed sends and omits serviceType when there is none", () => {
        const doc = buildServiceSnapshot(
            5,
            { buses: [{ index: 5, fader: 0.4, sends: [{ channelIndex: 1, level: 7, on: true }, { channelIndex: 2, level: 0.3 }] }] },
            START,
        )
        expect(doc!.sends).toEqual([{ channelIndex: 2, channelName: "", level: 0.3, on: true }])
        expect("serviceType" in doc!).toBe(false)
    })
})
