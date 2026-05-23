import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * bridge-recovery wrappers (v10.0.5 — bridge-v1005-accumulator item 3).
 * Verifies: (1) trusted-leader gate semantics for resync/reconnect/selftest;
 * (2) admin-only gate for bridge_restart (band_leader REJECTED); (3) the doc
 * write shape — `bridgeControl.{action, nonce, requestedAt: serverTimestamp,
 * requestedBy: uid}` under `config/monitor`, merged via set+merge so other
 * fields stay intact; (4) the server-minted nonce is propagated in the
 * response so a caller can correlate with the dispatcher's ack.
 *
 * firebase-admin is mocked structurally — set spy, doc spy, role lookup. The
 * pure assertEditor/assertAdmin role gates run against the mocked role doc.
 */

// Spies hoisted so the mock factory closures can capture them.
const setSpy = vi.fn().mockResolvedValue(undefined)
const docSpy = vi.fn(() => ({ set: setSpy, get: vi.fn() }))
const collectionDocGet = vi.fn()
const collectionSpy = vi.fn(() => ({
    doc: vi.fn(() => ({ get: collectionDocGet })),
}))
const mockDb = {
    doc: docSpy,
    collection: collectionSpy,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => mockDb),
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: {
        serverTimestamp: vi.fn(() => "<SERVER_TS>"),
    },
}))

import {
    bridgeResync,
    bridgeReconnect,
    bridgeSelftest,
    bridgeRestart,
} from "../bridge-recovery"

/**
 * Stub the users/{uid} role lookup that readUserRole performs via
 * `db.collection("users").doc(uid).get()`. Returns a snap whose `.data().role`
 * is the value we want the gate to read.
 */
function withRole(role: string | undefined): void {
    collectionDocGet.mockReset().mockResolvedValue({
        exists: role !== undefined,
        data: () => (role === undefined ? undefined : { role }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    setSpy.mockResolvedValue(undefined)
})

describe("bridgeResync / bridgeReconnect / bridgeSelftest (trusted-leader)", () => {
    it.each([
        ["resync", bridgeResync],
        ["reconnect", bridgeReconnect],
        ["selftest", bridgeSelftest],
    ] as const)(
        "%s — admin caller: writes config/monitor.bridgeControl with action + uuid nonce + serverTimestamp + requestedBy",
        async (action, fn) => {
            withRole("admin")
            const res = await fn("uid-admin")
            if (!("action" in res))
                throw new Error("expected success result, got error envelope")
            expect(res.ok).toBe(true)
            expect(res.action).toBe(action)
            expect(typeof res.nonce).toBe("string")
            expect(res.nonce.length).toBeGreaterThanOrEqual(16) // crypto.randomUUID() is 36
            expect(res.note).toMatch(/get_bridge_health|monitor-live\/selftest/)

            // Doc + payload shape — uses `config/monitor` with set+merge so other
            // fields (lastSeen, bridgeLease, ...) stay intact.
            expect(docSpy).toHaveBeenCalledWith("config/monitor")
            expect(setSpy).toHaveBeenCalledTimes(1)
            const [payload, opts] = setSpy.mock.calls[0]
            expect(opts).toEqual({ merge: true })
            expect(payload).toEqual({
                bridgeControl: {
                    action,
                    nonce: res.nonce,
                    requestedAt: "<SERVER_TS>",
                    requestedBy: "uid-admin",
                },
            })
        },
    )

    it.each([
        ["resync", bridgeResync],
        ["reconnect", bridgeReconnect],
        ["selftest", bridgeSelftest],
    ] as const)(
        "%s — band_leader caller: accepted (assertEditor allows admin OR band_leader)",
        async (action, fn) => {
            withRole("band_leader")
            const res = await fn("uid-david")
            if (!("action" in res))
                throw new Error("expected success result, got error envelope")
            expect(res.action).toBe(action)
            expect(setSpy).toHaveBeenCalledTimes(1)
        },
    )

    it.each([
        ["resync", bridgeResync],
        ["reconnect", bridgeReconnect],
        ["selftest", bridgeSelftest],
    ] as const)(
        "%s — musician caller: REFUSED with forbidden_role envelope; no doc write",
        async (_action, fn) => {
            withRole("musician")
            const res = await fn("uid-musician")
            expect("ok" in res ? res.ok : true).toBe(false)
            // Rich error envelope shape — machine_code should be the role-gate slug.
            if ("error" in res) {
                expect(res.error.machine_code).toBe("forbidden_role")
            }
            expect(setSpy).not.toHaveBeenCalled()
        },
    )
})

describe("bridgeRestart (ADMIN ONLY — stricter gate than the trusted-leader trio)", () => {
    it("admin caller: writes action:'restart' with the same shape as the trusted-leader trio", async () => {
        withRole("admin")
        const res = await bridgeRestart("uid-admin")
        if (!("action" in res))
            throw new Error("expected success result, got error envelope")
        expect(res.action).toBe("restart")
        expect(setSpy).toHaveBeenCalledTimes(1)
        const [payload] = setSpy.mock.calls[0]
        expect((payload as { bridgeControl: { action: string } }).bridgeControl.action).toBe(
            "restart",
        )
    })

    it("band_leader caller: REFUSED — bridge_restart is admin-only (the whole point of the stricter gate)", async () => {
        withRole("band_leader")
        const res = await bridgeRestart("uid-david")
        expect("ok" in res ? res.ok : true).toBe(false)
        if ("error" in res) {
            expect(res.error.machine_code).toBe("forbidden_role")
            // Hint should steer the band_leader to the safer resync/reconnect.
            expect(res.hint ?? "").toMatch(/bridge_resync|bridge_reconnect/)
        }
        expect(setSpy).not.toHaveBeenCalled()
    })

    it("musician caller: REFUSED (same as band_leader — anyone non-admin)", async () => {
        withRole("musician")
        const res = await bridgeRestart("uid-musician")
        expect("ok" in res ? res.ok : true).toBe(false)
        expect(setSpy).not.toHaveBeenCalled()
    })

    it("user with no role doc: REFUSED (defensive — caller fell off the auth path)", async () => {
        withRole(undefined)
        const res = await bridgeRestart("uid-ghost")
        expect("ok" in res ? res.ok : true).toBe(false)
        expect(setSpy).not.toHaveBeenCalled()
    })
})

describe("nonce uniqueness", () => {
    it("two successive resync calls mint DIFFERENT nonces (each call gets a fresh dedup key)", async () => {
        withRole("admin")
        const a = await bridgeResync("uid-admin")
        const b = await bridgeResync("uid-admin")
        if (!("nonce" in a) || !("nonce" in b))
            throw new Error("expected success results")
        expect(a.nonce).not.toBe(b.nonce)
    })
})

describe("error path", () => {
    it("a thrown Firestore write surfaces as a rich `internal_error` envelope, not a thrown exception", async () => {
        withRole("admin")
        setSpy.mockRejectedValueOnce(new Error("permission denied"))
        const res = await bridgeResync("uid-admin")
        expect("ok" in res ? res.ok : true).toBe(false)
        if ("error" in res) {
            expect(res.error.machine_code).toBe("internal_error")
            expect(res.error.message).toMatch(/permission denied/)
        }
    })
})
