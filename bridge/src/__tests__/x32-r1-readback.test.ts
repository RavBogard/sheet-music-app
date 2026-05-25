import { describe, it, expect, afterEach } from "vitest"
import { X32MockServer } from "./x32-mock-server"
import { X32Client } from "../x32-client"
// Relative cross-tree import: bridge tsc compiles only `bridge/src/**` non-test
// files today (verified via `npx tsc --listFiles` — `__tests__/` is not in the
// compiled set); vitest at runtime resolves the path fine. Kept RELATIVE
// (not `@/test-utils/...`) so a future bridge-tsc-includes-tests regression
// doesn't break on the missing alias in bridge/tsconfig.json.
import { loadAdjustedDelay } from "../../../src/test-utils/load-adjusted-timing"

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
 * Phase 1 (Lane P1-A) HAS LANDED the query-after-command confirmation
 * (AUDIT-bridge Part C2): after a SET the X32Client issues a debounced read-back
 * whose reply refreshes the cache. This test now asserts the FIXED behavior —
 * the bridge's own write is confirmed from the desk. R1 is closed.
 */

describe("X32 read-of-own-write (R1): a bridge-issued SET now confirms itself", () => {
    let mock: X32MockServer
    let client: X32Client | undefined

    afterEach(async () => {
        if (client) {
            client.disconnect()
            client = undefined
        }
        if (mock) await mock.stop()
    })

    it("refreshes the bridge's cached value from the desk after its own SET (R1 fixed)", async () => {
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
        // but does NOT echo it back to the sender (R1). Phase-1 C2: the SET
        // schedules a debounced GET (~75ms) whose reply refreshes the cache.
        client.setBusFader(bus, target)
        // > CONFIRM_DEBOUNCE_MS (~75ms) + the loopback round-trip. 120 ms's
        // 45 ms slack is the tightest margin in the flake population; scale
        // it by VITEST_LOAD_FACTOR (default 1.5×; see
        // `[[feedback_parallel_load_flake_baseline]]`) so suite-wide UDP
        // socket + event-loop contention can't squeeze it.
        await loadAdjustedDelay(120)

        const afterCache = client.buses.find((b) => b.index === bus)!.fader

        // R1 CLOSED: the bridge's own write is now confirmed from the desk, so the
        // cache reflects the value that is really on the X32 — not the stale prior.
        expect(afterCache).toBeCloseTo(target, 5)
        expect(afterCache).not.toBeCloseTo(before, 5)

        // Corroboration: the desk really holds the value, and a direct query agrees.
        expect(mock.buses.find((b) => b.index === bus)!.fader).toBeCloseTo(target, 5)
        const queried = await client.queryBusFader(bus)
        expect(queried).toBeCloseTo(target, 5)
    })
})
