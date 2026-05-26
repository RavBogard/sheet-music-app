/**
 * v4.3 B02 — alert-store init guard.
 *
 * Ensures init() doesn't permanently lock out subscription when db is
 * null on first call (subtle pre-existing bug where `initialized = true`
 * was set before the db check).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { dbRef, onSnapshotMock } = vi.hoisted(() => ({
    dbRef: { value: null as unknown | null },
    onSnapshotMock: vi.fn(() => vi.fn()),
}))

vi.mock("@/lib/firebase", () => ({
    get db() { return dbRef.value },
    getDb: vi.fn(async () => dbRef.value),
    // Sync-friendly subscribeWithDb for unit tests: calls setup immediately
    // with the CURRENT dbRef.value so the test assertions can run sync.
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup(dbRef.value)
        return typeof u === 'function' ? u : () => {}
    }),
    recoverFromFirestoreShutdown: vi.fn(),
}))

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(() => ({})),
    onSnapshot: onSnapshotMock,
    setDoc: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

describe("useAlertStore.init (B02)", () => {
    beforeEach(() => {
        onSnapshotMock.mockClear()
        dbRef.value = null
        // Reset the singleton module state between tests.
        vi.resetModules()
    })

    it("does not subscribe when db is null (and does NOT latch initialized)", async () => {
        const mod = await import("@/lib/alert-store")
        mod.useAlertStore.getState().init()
        expect(onSnapshotMock).not.toHaveBeenCalled()

        // Now db becomes available — a second init() call should actually subscribe.
        dbRef.value = { __mock: true }
        mod.useAlertStore.getState().init()
        expect(onSnapshotMock).toHaveBeenCalledTimes(1)
    })

    it("duplicate init() after successful subscribe is a no-op (no stacking)", async () => {
        dbRef.value = { __mock: true }
        const mod = await import("@/lib/alert-store")
        mod.useAlertStore.getState().init()
        mod.useAlertStore.getState().init()
        mod.useAlertStore.getState().init()
        expect(onSnapshotMock).toHaveBeenCalledTimes(1)
    })

    it("destroy() unsubscribes and allows re-init", async () => {
        const unsub = vi.fn()
        onSnapshotMock.mockImplementationOnce(() => unsub)
        dbRef.value = { __mock: true }
        const mod = await import("@/lib/alert-store")
        mod.useAlertStore.getState().init()
        mod.useAlertStore.getState().destroy()
        expect(unsub).toHaveBeenCalled()
        // A new subscription should be possible after destroy.
        mod.useAlertStore.getState().init()
        expect(onSnapshotMock).toHaveBeenCalledTimes(2)
    })
})
