import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `cleanup_all_test_data` — the F-05 gate.
 *
 * The tool revokes every test-namespaced user in the project and
 * cascade-deletes what they own, and it used to accept exactly one argument.
 * Calling it with `{uidPrefix, dryRun: true}` — two words that both look like
 * they mean something — got neither: unknown keys were dropped, the sweep ran
 * unscoped, and the "dry run" deleted a live setlist. These tests hold the
 * shape that makes that impossible.
 */

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: "admin" }) }) }),
            get: async () => ({ docs: [], size: 0 }),
            where: () => ({ get: async () => ({ docs: [], size: 0 }) }),
        }),
    }),
    getAuth: () => ({ listUsers: async () => ({ users: [], pageToken: undefined }) }),
    getStorage: () => ({}),
}))

const { cleanupAllTestData } = await import("../test-tokens")

describe("cleanup_all_test_data", () => {
    beforeEach(() => vi.clearAllMocks())

    it("defaults to a dry run", async () => {
        const r = (await cleanupAllTestData("admin-uid")) as Record<string, unknown>
        expect(r.dryRun).toBe(true)
        expect(r.removed).toBe(0)
    })

    it("refuses a real sweep without force, and deletes nothing", async () => {
        const r = (await cleanupAllTestData("admin-uid", { dryRun: false })) as Record<
            string,
            unknown
        >
        expect(r.error).toBe("force_required")
        expect(String(r.message)).toContain("Nothing was deleted")
    })

    it("says out loud when the sweep is unscoped", async () => {
        const r = (await cleanupAllTestData("admin-uid")) as Record<string, unknown>
        expect(r.prefix).toBeNull()
        expect(String(r.hint)).toContain("EVERY test account")
    })

    it("rejects a malformed prefix before enumerating anything", async () => {
        const r = (await cleanupAllTestData("admin-uid", {
            prefix: "Bad Prefix",
        })) as Record<string, unknown>
        expect(r.error).toBe("invalid_uid_prefix")
    })

})
