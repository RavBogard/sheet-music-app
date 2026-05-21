import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Monitor Overhaul Phase 1 — bridge state-write contract (C1/C3/C4/C5).
 *
 * firebase-admin is mocked so we can capture every write to monitor-live/state.
 * We assert the contract: full-state `.set()` only (NEVER a dot-path `.update()`
 * — that was R3), the array shape is preserved, the C4 schema/identity fields
 * are present, `config` is no longer embedded, the B11 `unconfirmed` list is
 * surfaced, and the C3 heartbeats fire.
 */

const stateSetCalls: Record<string, unknown>[] = []
const stateUpdateCalls: Record<string, unknown>[] = []

vi.mock("firebase-admin", () => {
    const makeDoc = (path: string) => ({
        set: (data: Record<string, unknown>) => {
            if (path === "monitor-live/state") stateSetCalls.push(data)
            return Promise.resolve()
        },
        update: (data: Record<string, unknown>) => {
            if (path === "monitor-live/state") stateUpdateCalls.push(data)
            return Promise.resolve()
        },
        get: () => Promise.resolve({ exists: false, data: () => ({}) }),
    })
    const makeCollection = () => ({
        doc: () => makeDoc("other"),
        orderBy: () => ({ onSnapshot: () => () => {} }),
        where: () => ({ limit: () => ({ get: () => Promise.resolve({ empty: true, size: 0, docs: [] }) }) }),
    })
    const firestore = Object.assign(
        vi.fn(() => ({
            doc: (p: string) => makeDoc(p),
            collection: () => makeCollection(),
            batch: () => ({ delete: () => {}, update: () => {}, commit: () => Promise.resolve() }),
        })),
        { FieldValue: { serverTimestamp: () => "<server-ts>" } },
    )
    return { apps: [{ name: "[DEFAULT]" }], firestore }
})

import { FirestoreTransport } from "../firestore-transport"
import type { X32Client } from "../x32-client"
import type { ConfigManager } from "../config"

function makeX32(over: Partial<Record<string, unknown>> = {}): X32Client {
    return {
        channels: [{ index: 1, name: "Ch 1", color: 0 }],
        buses: [{ index: 1, name: "Worship", fader: 0.5, sends: [{ channelIndex: 1, level: 0.4, on: true }] }],
        matrices: [{ index: 1, name: "Matrix 1", fader: 0.7, on: true }],
        getUnconfirmed: () => [],
        isConnected: () => true,
        on: vi.fn(),
        syncFullState: vi.fn().mockResolvedValue(undefined),
        ...over,
    } as unknown as X32Client
}

const config = { getConfig: () => ({ monitorBuses: [1] }) } as unknown as ConfigManager

describe("FirestoreTransport — state-write contract (Phase 1 C1/C3/C4/C5)", () => {
    beforeEach(() => {
        stateSetCalls.length = 0
        stateUpdateCalls.length = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("C1/C4: writes the FULL snapshot via .set() with an ARRAY of buses + schema fields, never .update()", async () => {
        const t = new FirestoreTransport(makeX32(), config)
        await t.writeFullState()

        expect(stateSetCalls).toHaveLength(1)
        const doc = stateSetCalls[0]
        expect(Array.isArray(doc.buses)).toBe(true)
        expect((doc.buses as Array<{ index: number }>)[0].index).toBe(1)
        expect(doc.schemaVersion).toBe(1)
        expect(typeof doc.stateSeq).toBe("number")
        expect(doc.bridgeVersion).toBeTruthy()
        expect(doc.updatedAt).toBe("<server-ts>")
        expect("unconfirmed" in doc).toBe(true)

        // R3 root-fix: a dot-path .update() is what coerced the array into a map.
        expect(stateUpdateCalls).toHaveLength(0)
    })

    it("C4: does NOT embed config in the state doc (the stale bridge.version source)", async () => {
        const t = new FirestoreTransport(makeX32(), config)
        await t.writeFullState()
        expect(stateSetCalls[0].config).toBeUndefined()
    })

    it("C4: stateSeq increments monotonically per write", async () => {
        const t = new FirestoreTransport(makeX32(), config)
        await t.writeFullState()
        await t.writeFullState()
        expect(stateSetCalls[1].stateSeq).toBe((stateSetCalls[0].stateSeq as number) + 1)
    })

    it("B11: surfaces the X32 unconfirmed list in the state doc", async () => {
        const t = new FirestoreTransport(makeX32({ getUnconfirmed: () => ["bus_fader:3", "matrix_on:2"] }), config)
        await t.writeFullState()
        expect(stateSetCalls[0].unconfirmed).toEqual(["bus_fader:3", "matrix_on:2"])
    })

    it("C3: the idle state heartbeat re-writes state via .set() with NO X32 traffic (kills R2)", async () => {
        vi.useFakeTimers()
        const x32 = makeX32()
        const t = new FirestoreTransport(x32, config)
        t.start()
        await vi.advanceTimersByTimeAsync(10_000) // STATE_HEARTBEAT_MS

        expect(stateSetCalls.length).toBeGreaterThanOrEqual(1)
        expect(stateUpdateCalls).toHaveLength(0)
        // No authoritative re-query yet (that's the 30s tier) → heartbeat is pure Firestore.
        expect(x32.syncFullState as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
        t.stop()
    })

    it("C3: the authoritative re-query resync calls syncFullState at FULL_REQUERY_MS", async () => {
        vi.useFakeTimers()
        const x32 = makeX32()
        const t = new FirestoreTransport(x32, config)
        t.start()
        await vi.advanceTimersByTimeAsync(30_000) // FULL_REQUERY_MS
        expect(x32.syncFullState as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith([1])
        t.stop()
    })

    it("C3: the re-query resync is skipped while the X32 is disconnected", async () => {
        vi.useFakeTimers()
        const x32 = makeX32({ isConnected: () => false })
        const t = new FirestoreTransport(x32, config)
        t.start()
        await vi.advanceTimersByTimeAsync(30_000)
        expect(x32.syncFullState as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
        t.stop()
    })

    it("C5: getStateAgeMs is Infinity before any write and finite after (liveness input)", async () => {
        const t = new FirestoreTransport(makeX32(), config)
        expect(t.getStateAgeMs()).toBe(Infinity)
        await t.writeFullState()
        expect(t.getStateAgeMs()).toBeLessThan(2000)
    })
})
