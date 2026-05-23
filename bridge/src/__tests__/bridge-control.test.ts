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

    it("restart invokes the restart hook", async () => {
        const out = await d.handle({ action: "restart", nonce: "n1" })
        expect(out).toEqual({ handled: true, action: "restart" })
        expect(deps.restart).toHaveBeenCalledTimes(1)
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
