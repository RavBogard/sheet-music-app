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

import { RemoteLogger } from "../remote-log"

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
})
