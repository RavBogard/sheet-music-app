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
    const ref = { __path: "config/monitor" }
    const db = {
        collection: () => ({ doc: () => ref }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
            if (h.throwNext) throw new Error("transaction failed")
            const tx = {
                get: async () => ({ exists: h.store !== undefined, data: () => h.store }),
                set: (_ref: unknown, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
                    const next = opts?.merge ? { ...(h.store ?? {}), ...data } : { ...data }
                    if (next.bridgeLease === "__DELETE__") delete next.bridgeLease
                    h.store = next
                },
            }
            return fn(tx)
        },
    }
    return { apps: [{ name: "[DEFAULT]" }], firestore: Object.assign(() => db, { FieldValue }) }
})

import { ConfigManager } from "../config"

const TTL = 90_000

function lease(): { ownerId?: string; expiresAt?: number } | undefined {
    return h.store?.bridgeLease as { ownerId?: string; expiresAt?: number } | undefined
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
