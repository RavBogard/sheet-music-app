import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Monitor Overhaul Phase 2 — B10 single-writer lease (election).
 *
 * Two bridges must not both drain `pending`. The lease at
 * config/monitor.bridgeLease is acquired/renewed via a Firestore transaction;
 * only the holder is "active". firebase-admin is mocked with a transactional
 * in-memory doc (via vi.hoisted so the mock factory can share state with the
 * test). Wall-clock is faked so we can expire the lease deterministically.
 */

const h = vi.hoisted(() => ({
    store: undefined as Record<string, unknown> | undefined,
    throwNext: false,
}))

vi.mock("firebase-admin", () => {
    const FieldValue = { delete: () => "__DELETE__", serverTimestamp: () => "<ts>" }
    // R1 — `update` supports the dot-path writes the standby marker uses
    // (`bridgeStandby.lastSeen`, …); the lease tests never touch it.
    const ref = {
        __path: "config/monitor",
        update: async (data: Record<string, unknown>) => {
            const next: Record<string, unknown> = { ...(h.store ?? {}) }
            for (const [k, v] of Object.entries(data)) {
                const parts = k.split(".")
                if (parts.length === 1) {
                    next[k] = v
                } else {
                    const [head, ...rest] = parts
                    const child = { ...((next[head] as Record<string, unknown>) ?? {}) }
                    child[rest.join(".")] = v
                    next[head] = child
                }
            }
            h.store = next
        },
    }
    const db = {
        collection: () => ({ doc: () => ref }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
            if (h.throwNext) throw new Error("transaction failed")
            const tx = {
                get: async () => ({ exists: h.store !== undefined, data: () => h.store }),
                set: (_ref: unknown, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
                    const next = opts?.merge ? { ...(h.store ?? {}), ...data } : { ...data }
                    // Honour FieldValue.delete() on any top-level field (the lease
                    // release and the R1 standby-marker clear both use it).
                    for (const k of Object.keys(next)) {
                        if (next[k] === "__DELETE__") delete next[k]
                    }
                    h.store = next
                },
            }
            return fn(tx)
        },
    }
    return { apps: [{ name: "[DEFAULT]" }], firestore: Object.assign(() => db, { FieldValue }) }
})

import { ConfigManager } from "../config"
import type { LeaseIdentity, LeaseRecord } from "../lease-identity"

const TTL = 90_000
/** R1 — the shipped values (index.ts). */
const LIVE_TTL = 20_000
const STALE_AFTER = 12_000

function lease(): LeaseRecord | undefined {
    return h.store?.bridgeLease as LeaseRecord | undefined
}

function standby(): Record<string, unknown> | undefined {
    return h.store?.bridgeStandby as Record<string, unknown> | undefined
}

/** Identity for a bridge on machine-A with pid `pid`. */
function identity(pid: number, isPidAlive?: (p: number) => boolean | null): LeaseIdentity {
    return { machineId: "machine-A", pid, staleAfterMs: STALE_AFTER, isPidAlive }
}

describe("ConfigManager — single-writer lease election (B10)", () => {
    let cm: ConfigManager

    beforeEach(() => {
        h.store = undefined
        h.throwNext = false
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-05-22T00:00:00Z"))
        cm = new ConfigManager()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("acquires the lease on a free doc", async () => {
        const ok = await cm.acquireOrRenewLease("bridge-A", TTL)
        expect(ok).toBe(true)
        expect(lease()?.ownerId).toBe("bridge-A")
        expect(lease()?.expiresAt).toBe(Date.now() + TTL)
    })

    it("refuses a second bridge while the lease is live, leaving the holder untouched", async () => {
        expect(await cm.acquireOrRenewLease("bridge-A", TTL)).toBe(true)
        expect(await cm.acquireOrRenewLease("bridge-B", TTL)).toBe(false)
        expect(lease()?.ownerId).toBe("bridge-A")
    })

    it("lets the current holder renew its own lease (extends the expiry)", async () => {
        await cm.acquireOrRenewLease("bridge-A", TTL)
        const firstExpiry = lease()!.expiresAt!
        vi.advanceTimersByTime(20_000)
        expect(await cm.acquireOrRenewLease("bridge-A", TTL)).toBe(true)
        expect(lease()!.expiresAt!).toBeGreaterThan(firstExpiry)
    })

    it("lets a new bridge take over once the lease has expired", async () => {
        await cm.acquireOrRenewLease("bridge-A", TTL)
        // A goes away; advance past the TTL.
        vi.advanceTimersByTime(TTL + 1)
        expect(await cm.acquireOrRenewLease("bridge-B", TTL)).toBe(true)
        expect(lease()?.ownerId).toBe("bridge-B")
    })

    it("releaseLease only clears the lease when the caller still owns it", async () => {
        await cm.acquireOrRenewLease("bridge-A", TTL)
        // A non-owner release is a no-op.
        await cm.releaseLease("bridge-B")
        expect(lease()?.ownerId).toBe("bridge-A")
        // The owner's release clears it.
        await cm.releaseLease("bridge-A")
        expect(lease()).toBeUndefined()
    })

    it("fails CLOSED (returns false) when the transaction errors", async () => {
        h.throwNext = true
        expect(await cm.acquireOrRenewLease("bridge-A", TTL)).toBe(false)
    })
})

/**
 * R1 — same-host lease steal, through the real transaction.
 *
 * The scenario throughout: the bridge crashed mid-service and Windows relaunched
 * it. The new process has a NEW ownerId (it carries the pid + a uuid) but the
 * SAME persisted machineId, and the corpse's lease is still unexpired. Before
 * this change the relaunched bridge stood by for the whole TTL with the desk
 * dark; now it takes the lease straight back — but only when it can prove the
 * old holder is gone.
 */
describe("ConfigManager — same-host lease steal after a crash-relaunch (R1)", () => {
    let cm: ConfigManager

    beforeEach(() => {
        h.store = undefined
        h.throwNext = false
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-08-31T00:00:00Z"))
        cm = new ConfigManager()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("records machineId / pid / heartbeatAt on the lease when an identity is given", async () => {
        await cm.acquireOrRenewLease("bridge-A", LIVE_TTL, identity(100))
        expect(lease()?.machineId).toBe("machine-A")
        expect(lease()?.pid).toBe(100)
        expect(lease()?.heartbeatAt).toBe(Date.now())
    })

    it("takes over instantly when the previous holder on this machine is dead", async () => {
        // The crashed process holds a lease with 20s left to run.
        await cm.acquireOrRenewLease("crashed-A", LIVE_TTL, identity(100))
        vi.advanceTimersByTime(1_000)

        // The relaunched process: same machine, new pid, old pid provably gone.
        const relaunched = identity(200, (p) => (p === 100 ? false : true))
        expect(await cm.acquireOrRenewLease("relaunched-A", LIVE_TTL, relaunched)).toBe(true)
        expect(lease()?.ownerId).toBe("relaunched-A")
        expect(lease()?.pid).toBe(200)
    })

    it("REFUSES to steal from a live process on the same machine", async () => {
        await cm.acquireOrRenewLease("live-A", LIVE_TTL, identity(100))
        const other = identity(200, () => true)
        expect(await cm.acquireOrRenewLease("other-A", LIVE_TTL, other)).toBe(false)
        expect(lease()?.ownerId).toBe("live-A")
    })

    it("REFUSES to steal a live lease held by another machine", async () => {
        await cm.acquireOrRenewLease("bridge-B", LIVE_TTL, {
            machineId: "machine-B",
            pid: 100,
            staleAfterMs: STALE_AFTER,
        })
        const usDead = identity(200, () => false)
        expect(await cm.acquireOrRenewLease("bridge-A", LIVE_TTL, usDead)).toBe(false)
        expect(lease()?.ownerId).toBe("bridge-B")
    })

    it("still refuses without an identity — the pre-R1 path is unchanged", async () => {
        await cm.acquireOrRenewLease("bridge-A", LIVE_TTL, identity(100))
        expect(await cm.acquireOrRenewLease("bridge-B", LIVE_TTL)).toBe(false)
    })

    it("cross-host takeover happens on TTL expiry, and the new TTL is short", async () => {
        await cm.acquireOrRenewLease("bridge-B", LIVE_TTL, {
            machineId: "machine-B",
            pid: 100,
            staleAfterMs: STALE_AFTER,
        })
        vi.advanceTimersByTime(LIVE_TTL - 1)
        expect(await cm.acquireOrRenewLease("bridge-A", LIVE_TTL, identity(200))).toBe(false)
        vi.advanceTimersByTime(2)
        expect(await cm.acquireOrRenewLease("bridge-A", LIVE_TTL, identity(200))).toBe(true)
    })
})

/**
 * R1 — the STANDBY liveness marker.
 *
 * The invariant under test is a NEGATIVE one and it is the important half: a
 * standby bridge must leave `bridge.*` — the field `isBridgeOnline()` reads —
 * completely untouched. Writing standby liveness into `bridge.lastSeen` would
 * make a dark desk read as online, which is the bug, not the fix.
 */
describe("ConfigManager — standby liveness marker (R1)", () => {
    let cm: ConfigManager

    beforeEach(() => {
        h.store = { bridge: { status: "online", lastSeen: "<active-bridge-ts>" } }
        h.throwNext = false
        cm = new ConfigManager()
    })

    it("writes bridgeStandby.* and does NOT touch bridge.*", async () => {
        await cm.writeStandbyHeartbeat({
            instanceId: "standby-1",
            machineId: "machine-A",
            pid: 200,
            x32Connected: true,
        })
        expect(standby()?.instanceId).toBe("standby-1")
        expect(standby()?.machineId).toBe("machine-A")
        expect(standby()?.pid).toBe(200)
        expect(standby()?.lastSeen).toBe("<ts>")
        // The active bridge's health doc is byte-for-byte what it was.
        expect(h.store?.bridge).toEqual({ status: "online", lastSeen: "<active-bridge-ts>" })
    })

    it("clearStandbyMarker removes only OUR marker", async () => {
        await cm.writeStandbyHeartbeat({
            instanceId: "standby-1",
            machineId: "machine-A",
            pid: 200,
            x32Connected: false,
        })
        // A different instance's clear is a no-op…
        await cm.clearStandbyMarker("standby-2")
        expect(standby()?.instanceId).toBe("standby-1")
        // …ours removes it.
        await cm.clearStandbyMarker("standby-1")
        expect(standby()).toBeUndefined()
    })
})
