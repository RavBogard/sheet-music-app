import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Spy for users/{uid}.get(). Counting its calls proves the BR-01 cache stops
// the per-command Firestore read. firebase-admin is mocked so the transport
// constructor (admin.firestore()) never touches a real project.
const getSpy = vi.fn()

vi.mock("firebase-admin", () => ({
    apps: [{ name: "[DEFAULT]" }],
    firestore: vi.fn(() => ({
        collection: (col: string) => ({
            doc: (id: string) => ({
                get: () => getSpy(col, id),
            }),
        }),
    })),
}))

import { FirestoreTransport } from "../firestore-transport"
import type { X32Client } from "../x32-client"
import type { ConfigManager } from "../config"

function userDoc(role?: string, soundEngineer?: boolean) {
    const exists = role !== undefined || soundEngineer !== undefined
    return { exists, data: () => ({ role, soundEngineer }) }
}

describe("FirestoreTransport.isCommandAuthorized — per-user role cache (BR-01)", () => {
    let transport: FirestoreTransport
    let userBus: number | null

    beforeEach(() => {
        vi.useFakeTimers()
        getSpy.mockReset()
        userBus = null
        const configStub = { getUserBus: () => userBus } as unknown as ConfigManager
        const x32Stub = {} as unknown as X32Client
        transport = new FirestoreTransport(x32Stub, configStub)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function authorize(cmd: Record<string, unknown>): Promise<boolean> {
        return (transport as unknown as { isCommandAuthorized: (c: unknown) => Promise<boolean> })
            .isCommandAuthorized(cmd)
    }

    it("reads users/{uid} once and serves subsequent commands from cache", async () => {
        getSpy.mockResolvedValue(userDoc("admin"))
        const cmd = { type: "set_matrix_fader", uid: "u-admin", matrixIndex: 1, value: 0.5, createdAt: Date.now() }
        expect(await authorize(cmd)).toBe(true)
        expect(await authorize(cmd)).toBe(true)
        expect(await authorize(cmd)).toBe(true)
        expect(getSpy).toHaveBeenCalledTimes(1)
        expect(getSpy).toHaveBeenCalledWith("users", "u-admin")
    })

    it("re-reads after the cache TTL expires", async () => {
        getSpy.mockResolvedValue(userDoc("admin"))
        const cmd = { type: "set_matrix_fader", uid: "u-admin", matrixIndex: 1, value: 0.5, createdAt: Date.now() }
        expect(await authorize(cmd)).toBe(true)
        expect(getSpy).toHaveBeenCalledTimes(1)

        // Past the 30s TTL → next command re-reads the role.
        await vi.advanceTimersByTimeAsync(30_001)
        expect(await authorize({ ...cmd, createdAt: Date.now() })).toBe(true)
        expect(getSpy).toHaveBeenCalledTimes(2)
    })

    it("authz unchanged: non-engineer musician — own bus ALLOWED, other bus DENIED, matrix DENIED", async () => {
        getSpy.mockResolvedValue(userDoc("musician", false))
        userBus = 2
        expect(await authorize({ type: "set_bus_master", uid: "u-mus", busIndex: 2, value: 0.4, createdAt: Date.now() })).toBe(true)
        expect(await authorize({ type: "set_bus_master", uid: "u-mus", busIndex: 3, value: 0.4, createdAt: Date.now() })).toBe(false)
        expect(await authorize({ type: "set_matrix_fader", uid: "u-mus", matrixIndex: 1, value: 0.4, createdAt: Date.now() })).toBe(false)
    })

    it("authz unchanged: non-engineer with NO bus is denied", async () => {
        getSpy.mockResolvedValue(userDoc("musician", false))
        userBus = null
        expect(await authorize({ type: "set_bus_master", uid: "u-none", busIndex: 1, value: 0.4, createdAt: Date.now() })).toBe(false)
    })

    it("authz unchanged: soundEngineer:true is treated as engineer (matrix allowed)", async () => {
        getSpy.mockResolvedValue(userDoc(undefined, true))
        expect(await authorize({ type: "set_matrix_on", uid: "u-se", matrixIndex: 2, value: true, createdAt: Date.now() })).toBe(true)
    })

    it("fails closed on a read error and does NOT cache the failure", async () => {
        getSpy.mockRejectedValue(new Error("firestore down"))
        userBus = 2
        // Engineer privilege denied (fail closed)…
        expect(await authorize({ type: "set_matrix_fader", uid: "u-x", matrixIndex: 1, value: 0.4, createdAt: Date.now() })).toBe(false)
        // …but a bus owner is still authorized via config (unaffected by the read failure).
        expect(await authorize({ type: "set_bus_master", uid: "u-x", busIndex: 2, value: 0.4, createdAt: Date.now() })).toBe(true)
        // Both attempts re-read because the error was not cached.
        expect(getSpy).toHaveBeenCalledTimes(2)
    })

    it("F1: a HUNG users/{uid} read times out, fails closed, and is NOT cached", async () => {
        // A read that never resolves must not stall the command batch forever.
        getSpy.mockReturnValue(new Promise(() => {}))
        const p = authorize({ type: "set_matrix_fader", uid: "u-hang", matrixIndex: 1, value: 0.5, createdAt: Date.now() })
        // Past the 3s ENGINEER_READ_TIMEOUT_MS the race rejects → fail closed.
        await vi.advanceTimersByTimeAsync(3_001)
        expect(await p).toBe(false)
        // The timeout was not cached, so the next command re-reads.
        const p2 = authorize({ type: "set_matrix_fader", uid: "u-hang", matrixIndex: 1, value: 0.5, createdAt: Date.now() })
        await vi.advanceTimersByTimeAsync(3_001)
        expect(await p2).toBe(false)
        expect(getSpy).toHaveBeenCalledTimes(2)
    })
})
