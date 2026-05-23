import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * R1-R4 + O4 + O2 (v10.0.4). The bridge-control dispatcher + diagnostics
 * collector are pure DI — no firebase-admin, no socket — so every branch is
 * unit-testable directly. Covers: action dispatch (resync/reconnect/restart/
 * selftest), the load-bearing nonce dedup (the bridge's own heartbeat re-fires
 * the config listener with the same control), and the Infinity/0 → null
 * sanitization that keeps the Firestore write valid.
 */

import {
    BridgeControlDispatcher,
    collectDiagnostics,
    type BridgeControlDeps,
} from "../bridge-control"

function makeDeps(over: Partial<BridgeControlDeps> = {}): BridgeControlDeps {
    return {
        x32: {
            isConnected: vi.fn(() => true),
            getUnconfirmed: vi.fn(() => []),
            getLastMessageAt: vi.fn(() => 1000),
            syncFullState: vi.fn().mockResolvedValue(undefined),
            forceReconnect: vi.fn(),
        },
        transport: {
            getStateAgeMs: vi.fn(() => 50),
            getQueueDepth: vi.fn(() => 0),
            getLastStateWriteAt: vi.fn(() => 2000),
            writeFullState: vi.fn().mockResolvedValue(undefined),
        },
        logger: {
            getErrCount: vi.fn(() => 3),
            getLastError: vi.fn(() => ({ msg: "boom", ts: 7 })),
        },
        getMonitorBuses: vi.fn(() => [1, 2, 3]),
        restart: vi.fn(),
        writeSelftest: vi.fn().mockResolvedValue(undefined),
        clearBridgeControl: vi.fn().mockResolvedValue(undefined),
        startedAt: 0,
        now: () => 10_000,
        ...over,
    }
}

describe("collectDiagnostics (O2)", () => {
    it("snapshots live diagnostics and computes uptime", () => {
        const d = collectDiagnostics({
            x32: { isConnected: () => true, getUnconfirmed: () => ["bus_fader:3"], getLastMessageAt: () => 1500 },
            transport: { getStateAgeMs: () => 42, getQueueDepth: () => 2, getLastStateWriteAt: () => 1800 },
            logger: { getErrCount: () => 5, getLastError: () => ({ msg: "x", ts: 9 }) },
            startedAt: 1000,
            now: () => 6000,
        })
        expect(d).toEqual({
            socketAlive: true,
            stateAgeMs: 42,
            unconfirmedCount: 1,
            lastOscRxAt: 1500,
            lastStateWriteAt: 1800,
            startedAt: 1000,
            uptimeMs: 5000,
            queueDepth: 2,
            errCount: 5,
            lastError: { msg: "x", ts: 9 },
        })
    })

    it("sanitizes Infinity stateAge and 0 timestamps to null (Firestore-safe)", () => {
        const d = collectDiagnostics({
            x32: { isConnected: () => false, getUnconfirmed: () => [], getLastMessageAt: () => 0 },
            transport: { getStateAgeMs: () => Infinity, getQueueDepth: () => 0, getLastStateWriteAt: () => 0 },
            logger: { getErrCount: () => 0, getLastError: () => null },
            startedAt: 0,
            now: () => 100,
        })
        expect(d.stateAgeMs).toBeNull()
        expect(d.lastOscRxAt).toBeNull()
        expect(d.lastStateWriteAt).toBeNull()
        expect(d.socketAlive).toBe(false)
    })
})

describe("BridgeControlDispatcher (R1-R4, O4)", () => {
    let deps: BridgeControlDeps
    let d: BridgeControlDispatcher
    beforeEach(() => {
        deps = makeDeps()
        d = new BridgeControlDispatcher(deps)
    })

    it("resync re-reads the desk + republishes state when connected", async () => {
        const out = await d.handle({ action: "resync", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "resync" })
        expect(deps.x32.syncFullState).toHaveBeenCalledWith([1, 2, 3])
        expect(deps.transport.writeFullState).toHaveBeenCalledTimes(1)
    })

    it("resync skips the desk re-query when disconnected but still republishes", async () => {
        deps = makeDeps({ x32: { ...makeDeps().x32, isConnected: vi.fn(() => false) } })
        d = new BridgeControlDispatcher(deps)
        await d.handle({ action: "resync", nonce: "n1" })
        expect(deps.x32.syncFullState).not.toHaveBeenCalled()
        expect(deps.transport.writeFullState).toHaveBeenCalledTimes(1)
    })

    it("reconnect forces an X32 socket reconnect", async () => {
        const out = await d.handle({ action: "reconnect", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "reconnect" })
        expect(deps.x32.forceReconnect).toHaveBeenCalledTimes(1)
    })

    it("restart clears the persisted bridgeControl doc BEFORE invoking restart hook (v10.0.5 boot-loop fix)", async () => {
        const callOrder: string[] = []
        deps = makeDeps({
            clearBridgeControl: vi.fn(async () => {
                callOrder.push("clear")
            }),
            restart: vi.fn(() => {
                callOrder.push("restart")
            }),
        })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "restart", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "restart" })
        expect(deps.clearBridgeControl).toHaveBeenCalledTimes(1)
        expect(deps.restart).toHaveBeenCalledTimes(1)
        expect(callOrder).toEqual(["clear", "restart"])
    })

    it("restart STILL fires the restart hook even when clearBridgeControl rejects (failure-mode = current behavior)", async () => {
        deps = makeDeps({
            clearBridgeControl: vi.fn().mockRejectedValue(new Error("firestore unavailable")),
        })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "restart", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "restart" })
        expect(deps.clearBridgeControl).toHaveBeenCalledTimes(1)
        // Refusing to restart on a clear-failure would itself wedge the bridge — must still relaunch.
        expect(deps.restart).toHaveBeenCalledTimes(1)
    })

    it("non-restart actions do NOT touch clearBridgeControl (resync/reconnect/selftest are doc-write-safe)", async () => {
        await d.handle({ action: "resync", nonce: "n1" })
        await d.handle({ action: "reconnect", nonce: "n2" })
        await d.handle({ action: "selftest", nonce: "n3" })
        expect(deps.clearBridgeControl).not.toHaveBeenCalled()
    })

    it("selftest writes a diagnostic snapshot", async () => {
        const out = await d.handle({ action: "selftest", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "selftest" })
        expect(deps.writeSelftest).toHaveBeenCalledTimes(1)
        const snap = (deps.writeSelftest as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(snap.socketAlive).toBe(true)
        expect(snap.queueDepth).toBe(0)
        expect(snap.errCount).toBe(3)
        expect(typeof snap.ts).toBe("number")
        expect(typeof snap.bridgeVersion).toBe("string")
    })

    it("dedups by nonce — the SAME nonce (e.g. a heartbeat config re-fire) runs once", async () => {
        const first = await d.handle({ action: "reconnect", nonce: "dup" })
        const second = await d.handle({ action: "reconnect", nonce: "dup" })
        expect(first).toEqual({ handled: true, action: "reconnect" })
        expect(second).toEqual({ handled: false, reason: "duplicate-nonce" })
        expect(deps.x32.forceReconnect).toHaveBeenCalledTimes(1)
    })

    it("a fresh nonce runs again", async () => {
        await d.handle({ action: "reconnect", nonce: "a" })
        await d.handle({ action: "reconnect", nonce: "b" })
        expect(deps.x32.forceReconnect).toHaveBeenCalledTimes(2)
    })

    it("consumes the nonce even when the action throws (no double-apply on re-fire)", async () => {
        deps = makeDeps({
            transport: { ...makeDeps().transport, writeFullState: vi.fn().mockRejectedValue(new Error("boom")) },
        })
        d = new BridgeControlDispatcher(deps)
        await expect(d.handle({ action: "resync", nonce: "n1" })).rejects.toThrow("boom")
        // Same nonce re-delivered → deduped, syncFullState NOT called a second time.
        const second = await d.handle({ action: "resync", nonce: "n1" })
        expect(second).toEqual({ handled: false, reason: "duplicate-nonce" })
        expect(deps.x32.syncFullState).toHaveBeenCalledTimes(1)
    })

    /**
     * v10.0.5 cross-process boot-loop regression guard. The original gap (this
     * test would have FAILED before the fix): `lastHandledNonce` is in-memory
     * only; `config/monitor.bridgeControl` persists. After ANY restart, the new
     * dispatcher's `lastHandledNonce` is `null`, and the config snapshot listener
     * re-delivers the SAME persisted `{action: "restart", nonce}` → another
     * restart → infinite loop. The `requestedAt < processStartedAt` guard
     * short-circuits this WITHOUT relying on the doc-clear (which is the primary
     * fix but could have failed on the prior run).
     */
    it("CROSS-PROCESS: a fresh dispatcher rejects a persisted nonce whose requestedAt predates boot (boot-loop guard)", async () => {
        // Simulate the boot-loop scenario: a restart was requested at t=5000,
        // the bridge restarted at t=10000, and on next boot the persisted
        // bridgeControl doc re-fires the listener.
        deps = makeDeps({ startedAt: 10_000, now: () => 10_500 })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "restart", nonce: "stale-from-prior-boot", requestedAt: 5_000 })
        expect(out).toEqual({ handled: false, reason: "stale-request" })
        expect(deps.clearBridgeControl).not.toHaveBeenCalled()
        expect(deps.restart).not.toHaveBeenCalled()
    })

    it("CROSS-PROCESS: a fresh request (requestedAt > processStartedAt) is handled normally", async () => {
        deps = makeDeps({ startedAt: 10_000, now: () => 12_000 })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "reconnect", nonce: "fresh", requestedAt: 11_000 })
        expect(out).toEqual({ handled: true, action: "reconnect" })
        expect(deps.x32.forceReconnect).toHaveBeenCalledTimes(1)
    })

    it("requestedAt as ISO string AFTER startedAt is parsed + accepted", async () => {
        const startedAt = Date.parse("2026-05-23T20:00:00.000Z")
        const requestedAt = "2026-05-23T20:05:00.000Z"
        deps = makeDeps({ startedAt })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "reconnect", nonce: "iso-fresh", requestedAt })
        expect(out).toEqual({ handled: true, action: "reconnect" })
    })

    it("requestedAt as ISO string BEFORE startedAt is parsed + rejected as stale", async () => {
        const startedAt = Date.parse("2026-05-23T20:00:00.000Z")
        const requestedAt = "2026-05-23T19:30:00.000Z"
        deps = makeDeps({ startedAt })
        d = new BridgeControlDispatcher(deps)
        const out = await d.handle({ action: "restart", nonce: "iso-stale", requestedAt })
        expect(out).toEqual({ handled: false, reason: "stale-request" })
        expect(deps.restart).not.toHaveBeenCalled()
    })

    it("requestedAt as Firestore Timestamp shape ({seconds}) BEFORE startedAt is rejected as stale", async () => {
        deps = makeDeps({ startedAt: 10_000_000, now: () => 10_001_000 })
        d = new BridgeControlDispatcher(deps)
        // {seconds: 5000} → 5_000_000 ms < startedAt 10_000_000 → stale
        // @ts-expect-error — exercising the FirestoreDate Timestamp-ish shape on the runtime guard
        const out = await d.handle({ action: "restart", nonce: "ts-stale", requestedAt: { seconds: 5000 } })
        expect(out).toEqual({ handled: false, reason: "stale-request" })
    })

    it("requestedAt absent → falls through to in-memory nonce dedup (backwards compatible)", async () => {
        // Writers (current & legacy) that don't populate requestedAt still work
        // via the in-memory dedup; the cross-process guard is OPT-IN per writer.
        deps = makeDeps({ startedAt: 10_000 })
        d = new BridgeControlDispatcher(deps)
        const first = await d.handle({ action: "reconnect", nonce: "no-ts" })
        const second = await d.handle({ action: "reconnect", nonce: "no-ts" })
        expect(first).toEqual({ handled: true, action: "reconnect" })
        expect(second).toEqual({ handled: false, reason: "duplicate-nonce" })
    })

    it("requestedAt unparseable garbage → treated as absent (defensive), action proceeds", async () => {
        deps = makeDeps({ startedAt: 10_000 })
        d = new BridgeControlDispatcher(deps)
        // @ts-expect-error — exercising the runtime guard against unexpected shapes
        const out = await d.handle({ action: "reconnect", nonce: "garbage-ts", requestedAt: { notAShape: true } })
        expect(out).toEqual({ handled: true, action: "reconnect" })
    })

    it("ignores malformed control (no control / no action / no nonce / unknown action)", async () => {
        expect(await d.handle(undefined)).toEqual({ handled: false, reason: "no-control" })
        // @ts-expect-error — exercising the runtime guard
        expect(await d.handle({ nonce: "n" })).toEqual({ handled: false, reason: "no-action" })
        // @ts-expect-error — exercising the runtime guard
        expect(await d.handle({ action: "resync" })).toEqual({ handled: false, reason: "no-nonce" })
        // @ts-expect-error — exercising the runtime guard
        expect(await d.handle({ action: "frobnicate", nonce: "n" })).toEqual({
            handled: false,
            reason: "unknown-action",
        })
        expect(deps.x32.syncFullState).not.toHaveBeenCalled()
    })
})
