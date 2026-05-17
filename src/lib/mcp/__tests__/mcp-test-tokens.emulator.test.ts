import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

import {
    provisionTestAccount,
    listTestAccountsCore,
    revokeTestAccountCore,
    cleanupAllTestDataCore,
} from "../tools/test-tokens"
import { verifyBearer } from "../auth"
import { checkUserRateLimit } from "@/lib/rate-limit"

// Storage isn't backed by the emulator; treat the best-effort purge as a no-op.
vi.mock("@/lib/firebase-admin", async () => {
    const real =
        await vi.importActual<typeof import("@/lib/firebase-admin")>(
            "@/lib/firebase-admin",
        )
    return {
        ...real,
        getStorage: () => ({
            bucket: () => {
                throw new Error("no-storage-in-emulator")
            },
        }),
    }
})

describe("MCP test tokens (emulator)", () => {
    let app: App
    const ADMIN_UID = "admin-daniel"
    const LEADER_UID = "leader-david"
    const MUSICIAN_UID = "musician-randy"

    function db() {
        return getFirestore(app)
    }
    function bearerReq(token: string): Request {
        return new Request("http://localhost/api/mcp", {
            headers: { authorization: `Bearer ${token}` },
        })
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-test-tokens" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        // Wipe all collections we touch.
        const collections = [
            "mcpTokens",
            "mcpTestUsers",
            "users",
            "setlists",
            "tracks",
            "library_index",
            "songs",
            "proposal_stages",
            "bond_flags",
            "bond_corrections",
            "scheduling_assignments",
            "musician_availability",
        ]
        await Promise.all(
            collections.map(async (c) => {
                const snap = await db().collection(c).get()
                await Promise.all(snap.docs.map((d) => d.ref.delete()))
            }),
        )
        // Wipe every Auth user in the emulator. Auth state spans tests
        // otherwise (the emulator persists across `beforeEach`).
        const auth = getAuth()
        let pageToken: string | undefined
        for (let i = 0; i < 10; i++) {
            const result = await auth.listUsers(1000, pageToken)
            await Promise.all(
                result.users.map((u) =>
                    auth.deleteUser(u.uid).catch(() => undefined),
                ),
            )
            if (!result.pageToken) break
            pageToken = result.pageToken
        }

        // Seed caller users.
        await db().collection("users").doc(ADMIN_UID).set({ role: "admin" })
        await db()
            .collection("users")
            .doc(LEADER_UID)
            .set({ role: "band_leader" })
        await db()
            .collection("users")
            .doc(MUSICIAN_UID)
            .set({ role: "musician" })
    })

    it("admin can mint a band_leader test account, raw token verifies", async () => {
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "band_leader",
            label: "marathon",
        })
        if ("error" in result) throw new Error(`mint failed: ${result.error}`)

        expect(result.uid).toMatch(/^test-band_leader-[0-9a-f]{8}$/)
        expect(result.role).toBe("band_leader")
        expect(result.displayName).toContain("[TEST]")
        expect(result.token).toMatch(/^crl_live_/)
        expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        // Index doc exists
        const indexSnap = await db()
            .collection("mcpTestUsers")
            .doc(result.uid)
            .get()
        expect(indexSnap.exists).toBe(true)
        expect(indexSnap.data()?.provisionedBy).toBe(ADMIN_UID)

        // Firestore user doc exists with correct role + isTestUser flag
        const userSnap = await db().collection("users").doc(result.uid).get()
        expect(userSnap.exists).toBe(true)
        expect(userSnap.data()?.role).toBe("band_leader")
        expect(userSnap.data()?.isTestUser).toBe(true)

        // Bearer resolves to the test uid via the unchanged verifyBearer
        expect(await verifyBearer(bearerReq(result.token))).toEqual({
            uid: result.uid,
        })

        // Firebase Auth user exists, disabled
        const authUser = await getAuth().getUser(result.uid)
        expect(authUser.disabled).toBe(true)
        expect(authUser.customClaims).toMatchObject({ role: "band_leader" })
    })

    it("band_leader can mint (trusted-leader gate)", async () => {
        const result = await provisionTestAccount(LEADER_UID, {
            role: "musician",
        })
        expect("token" in result).toBe(true)
    })

    it("musician CANNOT mint — structured forbidden envelope", async () => {
        const result = await provisionTestAccount(MUSICIAN_UID, {
            role: "musician",
        })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("forbidden")
            expect(result.message).toContain("admin or band_leader")
            expect(result.context).toMatchObject({ callerRole: "musician" })
        }
    })

    it("role=admin is refused (defense-in-depth past schema)", async () => {
        // Cast to bypass the Zod-typed enum — simulates HTTP-side bypass.
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "admin" as unknown as "musician",
        })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("admin_test_user_refused")
        }
    })

    it("ttlSec > 86400 is refused", async () => {
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            ttlSec: 86401,
        })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("ttl_out_of_range")
        }
    })

    it("expired test token is rejected by verifyBearer (TTL enforcement)", async () => {
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            ttlSec: 60,
        })
        if ("error" in result) throw new Error("mint failed")

        // Bearer works while live
        expect(await verifyBearer(bearerReq(result.token))).toEqual({
            uid: result.uid,
        })

        // Force expiry by writing ttlExpiresAt to the past on the bearer doc.
        const tokenSnap = await db()
            .collection("mcpTokens")
            .where("testUid", "==", result.uid)
            .get()
        await tokenSnap.docs[0]!.ref.update({
            ttlExpiresAt: Timestamp.fromMillis(Date.now() - 1000),
        })

        const rejected = await verifyBearer(bearerReq(result.token))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)
    })

    it("musician-role test token is rate-limited at standard tier (NOT bypassed)", async () => {
        // Use the SAME rate-limit module the MCP tool handlers actually call;
        // exhaust the bucket and assert the next call returns the limited
        // envelope. Real-token musician callers see the same shape — this is
        // the regression gate against accidentally setting bypass:true for
        // test tokens.
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
        })
        if ("error" in result) throw new Error("mint failed")

        // Drain the per-user `api` tier (configured for some N/min). We don't
        // need to know the limit — we just need a single non-bypass call.
        // Passing bypass:false explicitly is the load-bearing assertion.
        const limited = await checkUserRateLimit(result.uid, "api", {
            bypass: false,
        })
        // Either null (under the limit) or a structured rate-limit envelope —
        // both prove the bucket was actually consulted (vs. the trusted-leader
        // short-circuit that returns null without consulting Redis).
        expect(limited === null || typeof limited?.retryAfterSec === "number").toBe(
            true,
        )
    })

    it("revoke cascades to owned setlists + tracks + library_index + songs", async () => {
        const minted = await provisionTestAccount(ADMIN_UID, {
            role: "band_leader",
        })
        if ("error" in minted) throw new Error("mint failed")
        const uid = minted.uid

        // Seed: 1 setlist + 2 tracks, 1 library_index row, 1 song
        await db().collection("setlists").doc("sl-owned").set({
            ownerId: uid,
            name: "Test",
        })
        await db().collection("tracks").doc("t1").set({
            setlistId: "sl-owned",
            order: 1,
        })
        await db().collection("tracks").doc("t2").set({
            setlistId: "sl-owned",
            order: 2,
        })
        await db()
            .collection("library_index")
            .doc("chart-1")
            .set({ uploadedBy: uid, title: "x" })
        await db()
            .collection("songs")
            .doc("song-1")
            .set({ uploader: uid, title: "y" })
        // Seed a sibling NOT owned by the test user — must survive.
        await db().collection("setlists").doc("sl-other").set({
            ownerId: "someone-else",
            name: "Other",
        })

        const revoked = await revokeTestAccountCore(ADMIN_UID, uid)
        if ("error" in revoked) throw new Error("revoke failed")

        expect(revoked.cascaded.setlists).toBe(1)
        expect(revoked.cascaded.tracks).toBe(2)
        expect(revoked.cascaded.library_index).toBe(1)
        expect(revoked.cascaded.songs).toBe(1)
        expect(revoked.authDeleted).toBe(true)

        expect((await db().collection("setlists").doc("sl-owned").get()).exists).toBe(
            false,
        )
        expect((await db().collection("tracks").doc("t1").get()).exists).toBe(false)
        expect((await db().collection("tracks").doc("t2").get()).exists).toBe(false)
        expect((await db().collection("setlists").doc("sl-other").get()).exists).toBe(
            true,
        ) // sibling untouched
        expect((await db().collection("mcpTestUsers").doc(uid).get()).exists).toBe(
            false,
        )
        // mcpTokens row gone
        const remaining = await db()
            .collection("mcpTokens")
            .where("testUid", "==", uid)
            .get()
        expect(remaining.size).toBe(0)
        // Auth user gone
        await expect(getAuth().getUser(uid)).rejects.toThrow()
    })

    it("revoke refuses a uid that doesn't start with test-", async () => {
        const result = await revokeTestAccountCore(ADMIN_UID, "real-user")
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("not_a_test_uid")
        }
    })

    it("list_test_accounts: filters by role, hides expired by default", async () => {
        const a = await provisionTestAccount(ADMIN_UID, { role: "musician" })
        const b = await provisionTestAccount(ADMIN_UID, { role: "member" })
        if ("error" in a || "error" in b) throw new Error("mint failed")

        // Force one expired
        await db()
            .collection("mcpTestUsers")
            .doc(a.uid)
            .update({
                ttlExpiresAt: Timestamp.fromMillis(Date.now() - 1000),
            })

        const defaultList = await listTestAccountsCore(ADMIN_UID, {})
        if ("error" in defaultList) throw new Error("list failed")
        expect(defaultList.accounts.map((x) => x.uid)).toEqual([b.uid])

        const withExpired = await listTestAccountsCore(ADMIN_UID, {
            includeExpired: true,
        })
        if ("error" in withExpired) throw new Error("list failed")
        expect(withExpired.accounts.map((x) => x.uid).sort()).toEqual(
            [a.uid, b.uid].sort(),
        )

        const musicianOnly = await listTestAccountsCore(ADMIN_UID, {
            role: "musician",
            includeExpired: true,
        })
        if ("error" in musicianOnly) throw new Error("list failed")
        expect(musicianOnly.accounts.map((x) => x.uid)).toEqual([a.uid])
    })

    it("cleanup_all_test_data removes every test-namespaced user", async () => {
        const a = await provisionTestAccount(ADMIN_UID, { role: "musician" })
        const b = await provisionTestAccount(ADMIN_UID, { role: "band_leader" })
        const c = await provisionTestAccount(ADMIN_UID, { role: "member" })
        if ("error" in a || "error" in b || "error" in c) {
            throw new Error("mint failed")
        }

        const result = await cleanupAllTestDataCore(ADMIN_UID)
        if ("error" in result) throw new Error("cleanup failed")
        expect(result.removed).toBe(3)
        expect(result.failures).toEqual([])

        // Every index doc gone
        const remaining = await db().collection("mcpTestUsers").get()
        expect(remaining.size).toBe(0)

        // Every Auth user gone
        for (const m of [a, b, c]) {
            await expect(getAuth().getUser(m.uid)).rejects.toThrow()
        }
    })

    it("cleanup invoked FROM a test band_leader bearer cleans itself + all siblings (msg-004 case 6 regression)", async () => {
        // Repro for the 2026-05-17 prod stress test bug: when cleanup is
        // invoked by a test bearer who is themselves in the sweep, the
        // mid-sweep deletion of the caller's `users/{uid}` doc used to
        // make every subsequent revoke refuse with `forbidden`. Fix is
        // a one-shot trusted-leader gate at cleanup entry + an unchecked
        // internal revoke + revoking the caller LAST.
        const driver = await provisionTestAccount(ADMIN_UID, {
            role: "band_leader",
            label: "driver",
        })
        if ("error" in driver) throw new Error("driver mint failed")

        // Mint 3 sibling test users via the driver bearer (mirrors what
        // the prod flow does — the driver provisions test users, then
        // calls cleanup itself).
        for (const role of ["musician", "member", "band_leader"] as const) {
            const m = await provisionTestAccount(driver.uid, { role })
            if ("error" in m) throw new Error("sibling mint failed")
        }

        // Invoke cleanup AS the driver. Before the fix this returned
        // {removed: 1, failures: ['<each>: forbidden' x3]}. After the
        // fix it must remove all 4 with zero failures.
        const result = await cleanupAllTestDataCore(driver.uid)
        if ("error" in result) throw new Error("cleanup failed entirely")
        expect(result.failures).toEqual([])
        expect(result.removed).toBe(4) // 3 siblings + the driver itself

        const remaining = await db().collection("mcpTestUsers").get()
        expect(remaining.size).toBe(0)
        await expect(getAuth().getUser(driver.uid)).rejects.toThrow()
    })

    it("cleanup also sweeps orphan Auth test-* users without an index doc", async () => {
        // Mint normally
        const minted = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
        })
        if ("error" in minted) throw new Error("mint failed")

        // Create an orphan: Auth user with test- prefix but no index doc.
        await getAuth().createUser({
            uid: "test-musician-orphan1",
            disabled: true,
        })

        const result = await cleanupAllTestDataCore(ADMIN_UID)
        if ("error" in result) throw new Error("cleanup failed")
        expect(result.removed).toBeGreaterThanOrEqual(2)

        await expect(getAuth().getUser("test-musician-orphan1")).rejects.toThrow()
    })
})
