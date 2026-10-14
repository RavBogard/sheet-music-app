/**
 * `cronTenantIds` initialises Firebase Admin before it reads `orgs`.
 *
 * Phase 9: /api/cron/drive-sync called `tenantsWithFeature` (and so this) at
 * the top of its handler and `initAdmin()` sixteen lines later. `getFirestore()`
 * threw on the missing default app, the catch logged "orgs read failed;
 * running the code tenants only", and the run silently covered crc and
 * brotherslazaroff alone — a registry tenant could never be synced. It cost
 * nothing while the only registry tenant had `driveInbox` off, which is why
 * nothing caught it for a phase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    initialised: false,
    initAdmin: vi.fn(),
    getFirestore: vi.fn(),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: h.initAdmin,
    getFirestore: h.getFirestore,
}))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/org/config-code", () => ({ CODE_ORG_IDS: ["crc", "brotherslazaroff"] }))
vi.mock("@/lib/org/get-org-config", () => ({
    getOrgConfig: vi.fn(async () => ({})),
    orgConfigSource: () => "firestore",
}))

import { cronTenantIds } from "@/lib/org/cron-tenants"

beforeEach(() => {
    vi.clearAllMocks()
    h.initialised = false
    h.initAdmin.mockImplementation(() => {
        h.initialised = true
        return true
    })
    // Exactly the production failure: no default app, no Firestore.
    h.getFirestore.mockImplementation(() => {
        if (!h.initialised) throw new Error("The default Firebase app does not exist.")
        return {
            collection: () => ({
                get: async () => ({
                    docs: [
                        { id: "navatehila", data: () => ({ status: "active" }) },
                        { id: "suspended-one", data: () => ({ status: "suspended" }) },
                    ],
                }),
            }),
        }
    })
})

describe("cronTenantIds", () => {
    it("sees a registry tenant, not just the code tenants", async () => {
        expect(await cronTenantIds()).toEqual(["crc", "brotherslazaroff", "navatehila"])
    })

    it("initialises Admin before reaching for Firestore", async () => {
        await cronTenantIds()
        expect(h.initAdmin).toHaveBeenCalled()
        expect(h.initAdmin.mock.invocationCallOrder[0]).toBeLessThan(h.getFirestore.mock.invocationCallOrder[0])
    })

    it("still leaves a suspended tenant out", async () => {
        expect(await cronTenantIds()).not.toContain("suspended-one")
    })

    it("falls back to the code tenants when the orgs read genuinely fails", async () => {
        h.getFirestore.mockImplementation(() => ({
            collection: () => ({
                get: async () => {
                    throw new Error("UNAVAILABLE")
                },
            }),
        }))
        expect(await cronTenantIds()).toEqual(["crc", "brotherslazaroff"])
    })
})
