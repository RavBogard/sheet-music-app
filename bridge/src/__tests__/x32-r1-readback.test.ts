import { describe, it, expect, afterEach } from "vitest"
import { X32MockServer } from "./x32-mock-server"
import { X32Client } from "../x32-client"

/**
 * R1 — read-of-own-write reproduction (Monitor Overhaul P0-B1).
 *
 * Drives a real X32Client (the bridge's OSC client) against the now-faithful
 * mock over loopback UDP and proves the R1 root bug at the bridge layer:
 *
 *   The X32 does not echo a client's own write back to that client, and the
 *   bridge has no query-after-command step, so a bridge-issued SET never
 *   refreshes the bridge's in-memory cache (which is what feeds
 *   monitor-live/state). See AUDIT-bridge.md Part A R1.
 *
 * This test asserts TODAY's (buggy) behavior so CI stays green. It is the
 * Phase-1 target: when query-after-command confirmation lands (AUDIT-bridge
 * Part C2), the marked assertion MUST be flipped — see the inline marker.
 */

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("X32 read-of-own-write (R1): a bridge-issued SET does not confirm itself", () => {
    let mock: X32MockServer
    let client: X32Client | undefined

    afterEach(async () => {
        if (client) {
            client.disconnect()
            client = undefined
        }
        if (mock) await mock.stop()
    })

    it("leaves the bridge's cached value STALE after its own SET (today's behavior)", async () => {
        mock = new X32MockServer({ port: 0 })
        const port = await mock.start()

        client = new X32Client({ address: "127.0.0.1", port })
        await client.connect() // /xinfo handshake → startXRemote subscribes the client
        await client.syncFullState([1, 2, 3, 4])

        const bus = 3
        const before = client.buses.find((b) => b.index === bus)!.fader
        // A target value clearly distinct from the current one.
        const target = before > 0.5 ? 0.123 : 0.876

        // The bridge issues a fire-and-forget SET. The faithful mock applies it
        // but does NOT echo it back to the sender (R1); with no query-after-
        // command step, the bridge cannot learn the new value.
        client.setBusFader(bus, target)
        await delay(120)

        const afterCache = client.buses.find((b) => b.index === bus)!.fader

        // ─── PHASE-1 TARGET: flip when query-after-command lands (AUDIT-bridge C2) ───
        // TODAY the bridge cache stays STALE — its own write was never confirmed.
        // When Phase-1 adds query-after-command confirmation, the bridge WILL
        // refresh from the desk and these two assertions MUST become:
        //     expect(afterCache).toBeCloseTo(target, 5)
        //     expect(afterCache).not.toBeCloseTo(before, 5)
        expect(afterCache).toBeCloseTo(before, 5)
        expect(afterCache).not.toBeCloseTo(target, 5)

        // Proof the value really IS on the desk, so the Phase-1 fix is viable:
        // the mock applied it, and a direct query returns it. (The query also
        // refreshes the cache as a side effect — exactly the C2 mechanism — so
        // it MUST run AFTER the stale-cache assertions above.)
        expect(mock.buses.find((b) => b.index === bus)!.fader).toBeCloseTo(target, 5)
        const queried = await client.queryBusFader(bus)
        expect(queried).toBeCloseTo(target, 5)
    })
})
