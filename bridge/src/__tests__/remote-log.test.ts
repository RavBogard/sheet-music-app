import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * O1 — remote error/event ring buffer (v10.0.4). Verifies the three hard
 * constraints for the unattended box: BOUNDED (ring capped), RATE-LIMITED (a
 * burst coalesces into ONE debounced batch write, never per-line), and FAIL-OPEN
 * (a throwing Firestore write never throws and is retried on the next record).
 * firebase-admin is mocked only for FieldValue.serverTimestamp; the db is a
 * plain spy passed straight to the logger.
 */

vi.mock("firebase-admin", () => ({
    firestore: Object.assign(() => ({}), {
        FieldValue: { serverTimestamp: () => "<ts>" },
    }),
}))

import { RemoteLogger, isStartupNoise } from "../remote-log"

const setSpy = vi.fn()
const docSpy = vi.fn(() => ({ set: setSpy }))
const db = { doc: docSpy } as unknown as import("firebase-admin").firestore.Firestore

describe("RemoteLogger (O1)", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        setSpy.mockReset().mockResolvedValue(undefined)
        docSpy.mockClear()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("rate-limits: a burst of records coalesces into ONE batched flush", async () => {
        const logger = new RemoteLogger(db, { flushDebounceMs: 5000 })
        for (let i = 0; i < 10; i++) logger.record("error", `boom ${i}`)
        // Nothing written before the debounce window elapses (never per-line).
        expect(setSpy).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(5000)
        expect(setSpy).toHaveBeenCalledTimes(1)
        const [path] = docSpy.mock.calls[0]
        expect(path).toBe("monitor-live/bridgeLog")
        const written = setSpy.mock.calls[0][0] as { entries: unknown[]; errCount: number }
        expect(written.entries).toHaveLength(10)
        expect(written.errCount).toBe(10)
        logger.stop()
    })

    it("bounds the ring to ringSize, keeping the most recent entries", async () => {
        const logger = new RemoteLogger(db, { ringSize: 3, flushDebounceMs: 1000 })
        for (const m of ["m1", "m2", "m3", "m4", "m5"]) logger.record("warn", m)
        await vi.advanceTimersByTimeAsync(1000)
        const written = setSpy.mock.calls[0][0] as { entries: Array<{ msg: string }> }
        expect(written.entries.map((e) => e.msg)).toEqual(["m3", "m4", "m5"])
        // errCount counts every captured line, not just the retained ring.
        expect((setSpy.mock.calls[0][0] as { errCount: number }).errCount).toBe(5)
        logger.stop()
    })

    it("fails open: a throwing db write never throws and is retried on the next record", async () => {
        const logger = new RemoteLogger(db, { flushDebounceMs: 1000 })
        setSpy.mockRejectedValueOnce(new Error("firestore down"))
        logger.record("error", "first")
        await vi.advanceTimersByTimeAsync(1000) // flush #1 — rejects, swallowed
        expect(setSpy).toHaveBeenCalledTimes(1)
        // Counters are intact despite the failed write.
        expect(logger.getErrCount()).toBe(1)
        // A later record reschedules → the retry succeeds.
        logger.record("error", "second")
        await vi.advanceTimersByTimeAsync(1000)
        expect(setSpy).toHaveBeenCalledTimes(2)
        logger.stop()
    })

    it("tracks errCount + lastError across error and warn", () => {
        const logger = new RemoteLogger(db, { now: () => 1000 })
        logger.record("error", "boom")
        logger.record("warn", "careful")
        expect(logger.getErrCount()).toBe(2)
        expect(logger.getLastError()).toEqual({ msg: "careful", ts: 1000 })
        logger.stop()
    })

    it("truncates oversized messages", async () => {
        const logger = new RemoteLogger(db, { maxMsgLen: 10, flushDebounceMs: 100 })
        logger.record("error", "x".repeat(500))
        await vi.advanceTimersByTimeAsync(100)
        const written = setSpy.mock.calls[0][0] as { entries: Array<{ msg: string }> }
        expect(written.entries[0].msg).toHaveLength(10)
        logger.stop()
    })

    it("stop() halts further flush scheduling", async () => {
        const logger = new RemoteLogger(db, { flushDebounceMs: 1000 })
        logger.stop()
        logger.record("error", "after stop")
        await vi.advanceTimersByTimeAsync(5000)
        expect(setSpy).not.toHaveBeenCalled()
    })

    /**
     * v10.0.5 item 2 — startup-noise filter. Node `[DEP0040]` / `[DEP0169]` etc.
     * + the benign cold-boot lease-takeover STANDBY entry stay in the ring for
     * forensics but DO NOT bump `errCount` / `lastError`. The heartbeat
     * verdict + `get_bridge_health` therefore reflect SIGNAL not noise.
     */
    it("noise filter: Node `[DEP0040]` deprecation stays in the ring but does NOT bump errCount or lastError", async () => {
        const logger = new RemoteLogger(db, { flushDebounceMs: 100, now: () => 1234 })
        logger.record(
            "warn",
            "(node:1234) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.",
        )
        await vi.advanceTimersByTimeAsync(100)
        // Ring entry IS published (forensics retained).
        const written = setSpy.mock.calls[0][0] as {
            entries: Array<{ msg: string }>
            errCount: number
            lastError: unknown
        }
        expect(written.entries).toHaveLength(1)
        expect(written.entries[0].msg).toMatch(/\[DEP0040\]/)
        // But the counter + lastError are NOT polluted.
        expect(written.errCount).toBe(0)
        expect(written.lastError).toBeNull()
        expect(logger.getErrCount()).toBe(0)
        expect(logger.getLastError()).toBeNull()
        logger.stop()
    })

    it("noise filter: Node `[DEP0169]` url.parse deprecation also matches", () => {
        const logger = new RemoteLogger(db, { now: () => 2000 })
        logger.record(
            "warn",
            "(node:5678) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications.",
        )
        expect(logger.getErrCount()).toBe(0)
        expect(logger.getLastError()).toBeNull()
        logger.stop()
    })

    it("noise filter: benign lease-takeover STANDBY entry is filtered", () => {
        const logger = new RemoteLogger(db, { now: () => 3000 })
        logger.record(
            "warn",
            "[Bridge] Single-writer lease held by another bridge — entering STANDBY (will not drive the X32)",
        )
        expect(logger.getErrCount()).toBe(0)
        expect(logger.getLastError()).toBeNull()
        logger.stop()
    })

    it("noise filter: a REAL error AFTER noise correctly bumps errCount=1 + sets lastError to the real line", async () => {
        const logger = new RemoteLogger(db, { flushDebounceMs: 100, now: () => 4000 })
        // 8 cold-boot noise lines (matches the observed v10.0.4 baseline shape).
        logger.record("warn", "(node:1) [DEP0040] punycode")
        logger.record("warn", "(node:1) [DEP0040] punycode (server)")
        logger.record("warn", "(node:1) [DEP0169] url.parse")
        logger.record("warn", "(node:1) [DEP0169] url.parse (server)")
        logger.record("warn", "(node:1) [DEP0040] punycode (worker)")
        logger.record("warn", "(node:1) [DEP0169] url.parse (worker)")
        logger.record("warn", "(node:1) [DEP0040] punycode (forked)")
        logger.record("warn", "[Bridge] Single-writer lease held by another bridge — entering STANDBY")
        expect(logger.getErrCount()).toBe(0) // baseline = 0, not 8
        expect(logger.getLastError()).toBeNull()
        // Real fault arrives — counter goes to 1, lastError points at the real line.
        logger.record("error", "X32 socket disconnected")
        expect(logger.getErrCount()).toBe(1)
        expect(logger.getLastError()).toEqual({ msg: "X32 socket disconnected", ts: 4000 })
        // Published shape mirrors the in-memory counters + ALL 9 entries (forensics complete).
        await vi.advanceTimersByTimeAsync(100)
        const written = setSpy.mock.calls[0][0] as {
            entries: unknown[]
            errCount: number
            lastError: { msg: string }
        }
        expect(written.entries).toHaveLength(9)
        expect(written.errCount).toBe(1)
        expect(written.lastError.msg).toBe("X32 socket disconnected")
        logger.stop()
    })

    it("isStartupNoise unit: matches DEP-N + STANDBY shapes; rejects real errors + empty string", () => {
        // Positive matches (filtered out of errCount).
        expect(isStartupNoise("(node:1) [DEP0040] DeprecationWarning")).toBe(true)
        expect(isStartupNoise("(node:1) [DEP9999] some future Node deprecation")).toBe(true)
        expect(isStartupNoise("[DEP0169] url.parse behavior is not standardized")).toBe(true)
        expect(isStartupNoise("[Bridge] lease ... entering STANDBY (will not drive)")).toBe(true)
        // Negative matches (real errors stay counted).
        expect(isStartupNoise("X32 socket disconnected unexpectedly")).toBe(false)
        expect(isStartupNoise("Firestore write failed: PERMISSION_DENIED")).toBe(false)
        expect(isStartupNoise("[DEP] not a numbered deprecation")).toBe(false) // missing 4 digits
        expect(isStartupNoise("[DEP123] only 3 digits, not Node's shape")).toBe(false)
        expect(isStartupNoise("")).toBe(false)
        // Defensive: undefined/null coerced via String() in record(); predicate itself sees ""
        expect(isStartupNoise(undefined as unknown as string)).toBe(false)
    })
})
