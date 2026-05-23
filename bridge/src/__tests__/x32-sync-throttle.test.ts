import { describe, it, expect, afterEach } from "vitest"
import { X32MockServer } from "./x32-mock-server"
import { X32Client } from "../x32-client"

/**
 * syncFullState OSC query throttle + retry — the monitor per-channel-send fix.
 *
 * Root defect (Lane-3 forensics, confirmed in live monitor-live/state): the old
 * syncFullState fired ~320 send queries (32 ch × N buses × {level,on}) at the
 * X32 concurrently. The desk dropped most of them for the later monitor buses,
 * so those reads timed out and the bridge published fabricated `on:false` /
 * `level:0` fallbacks — Daniel saw a zeroed bus-5 mix and his send writes could
 * not be confirmed.
 *
 * The fix drains every value read through a bounded-concurrency pool
 * (syncQueryCap in flight) and retries a timed-out read syncQueryAttempts times
 * before giving it up to `unconfirmed`. These tests drive a real X32Client
 * against the faithful UDP mock and assert:
 *   1. send queries never exceed the cap (no flood),
 *   2. a dropped read is retried so it confirms (not fabricated),
 *   3. (control) without retry that same drop IS left unconfirmed,
 *   4. a healthy desk yields zero unconfirmed sends across ALL buses.
 */
describe("X32Client syncFullState throttle + retry (monitor per-channel-send fix)", () => {
    let mock: X32MockServer
    let client: X32Client | undefined

    afterEach(async () => {
        if (client) {
            client.disconnect()
            client = undefined
        }
        if (mock) await mock.stop()
    })

    it("caps concurrent value-read queries at syncQueryCap (no ~320-query flood)", async () => {
        // latencyMs holds each reply briefly so a burst is observable as
        // overlapping in-flight queries at the mock.
        mock = new X32MockServer({ port: 0, latencyMs: 15 })
        const port = await mock.start()

        const CAP = 8
        client = new X32Client({ address: "127.0.0.1", port, syncQueryCap: CAP })
        await client.connect()

        // 4 buses → 264 send/bus reads + 32 channel names + 18 matrix reads =
        // ~314 value GETs. The OLD code put hundreds in flight at once; the
        // throttled pool never exceeds CAP.
        await client.syncFullState([1, 2, 3, 4])

        expect(mock.maxConcurrentQueries).toBeLessThanOrEqual(CAP)
        // …and the pool actually runs at (near) full width — proving CAP is the
        // binding limit, not an accidental serialization to 1.
        expect(mock.maxConcurrentQueries).toBeGreaterThanOrEqual(CAP - 1)
    })

    it("retries a dropped send read so it confirms instead of fabricating unconfirmed", async () => {
        mock = new X32MockServer({ port: 0 })
        const port = await mock.start()
        // The desk drops the FIRST GET for this send's level (the flood symptom);
        // the bridge must re-issue it and the retry succeeds.
        mock.dropQueryResponses.set("/ch/19/mix/02/level", 1)

        client = new X32Client({ address: "127.0.0.1", port, syncQueryAttempts: 3 })
        await client.connect()
        await client.syncFullState([1, 2, 3, 4])

        expect(client.getUnconfirmed()).not.toContain("send_level:19:2")
        const send = client.buses
            .find((b) => b.index === 2)!
            .sends.find((s) => s.channelIndex === 19)!
        const deskSend = mock.buses
            .find((b) => b.index === 2)!
            .sends.find((s) => s.channelIndex === 19)!
        expect(send.level).toBeCloseTo(deskSend.level, 5)
    }, 10_000)

    it("control: without retry (attempts=1) the same dropped read is left unconfirmed", async () => {
        mock = new X32MockServer({ port: 0 })
        const port = await mock.start()
        mock.dropQueryResponses.set("/ch/19/mix/02/level", 1)

        client = new X32Client({ address: "127.0.0.1", port, syncQueryAttempts: 1 })
        await client.connect()
        await client.syncFullState([1, 2, 3, 4])

        // Proves the retry above is load-bearing: one attempt + one drop = a
        // fabricated 0 published as `unconfirmed`.
        expect(client.getUnconfirmed()).toContain("send_level:19:2")
    }, 10_000)

    it("a healthy desk yields zero unconfirmed sends across all monitor buses", async () => {
        mock = new X32MockServer({ port: 0 })
        const port = await mock.start()

        client = new X32Client({ address: "127.0.0.1", port })
        await client.connect()
        await client.syncFullState([1, 2, 3, 4])

        // The whole point of the fix: NO bus's sends fabricate a fallback.
        expect(client.getUnconfirmed()).toEqual([])

        for (const busIdx of [1, 2, 3, 4]) {
            const bus = client.buses.find((b) => b.index === busIdx)!
            const deskBus = mock.buses.find((b) => b.index === busIdx)!
            expect(bus.sends).toHaveLength(32)
            for (const send of bus.sends) {
                const deskSend = deskBus.sends.find((s) => s.channelIndex === send.channelIndex)!
                expect(send.level).toBeCloseTo(deskSend.level, 5)
                expect(send.on).toBe(deskSend.on)
            }
        }
    }, 10_000)
})
