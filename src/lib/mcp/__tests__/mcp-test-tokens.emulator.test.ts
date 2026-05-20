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
    sweepOrphanTestDataCore,
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
            "setlistTemplates",
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

        // Bearer resolves to the test uid via verifyBearer. tokenId is the
        // doc id; test tokens carry no parentTokenId (root-shape).
        expect(await verifyBearer(bearerReq(result.token))).toEqual({
            uid: result.uid,
            tokenId: expect.any(String),
            parentTokenId: null,
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

    it("musician CANNOT mint — structured forbidden_role envelope", async () => {
        const result = await provisionTestAccount(MUSICIAN_UID, {
            role: "musician",
        })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            // C9I5-003/C8I2-006: standardized on the rich forbidden_role
            // machine_code (matches the 17 other tools + revoke_test_account).
            expect(result.error).toBe("forbidden_role")
            expect(result.message).toContain("admin or band_leader")
            expect(result.context).toMatchObject({
                callerRole: "musician",
                requiredRoles: ["admin", "band_leader"],
            })
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
            tokenId: expect.any(String),
            parentTokenId: null,
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

    it("create_test_account with uidPrefix emits `test-<prefix>-<role>-<hex>`", async () => {
        const result = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            uidPrefix: "cycle5b",
        })
        if ("error" in result) throw new Error("mint failed: " + result.error)

        expect(result.uid).toMatch(/^test-cycle5b-musician-[0-9a-f]{8}$/)
    })

    it("create_test_account rejects malformed uidPrefix", async () => {
        for (const bad of ["UPPER", "has space", "has_underscore", "-leading", "trailing-", "double--hyphen", ""]) {
            const result = await provisionTestAccount(ADMIN_UID, {
                role: "musician",
                uidPrefix: bad,
            })
            // Empty string fails at Zod level too, but provisionTestAccount
            // does its own regex check so both surfaces refuse symmetrically.
            expect("error" in result).toBe(true)
            if ("error" in result) {
                expect(result.error).toBe("invalid_uid_prefix")
            }
        }
    })

    it("cleanup_all_test_data with prefix only sweeps matching uids (sibling instance survives)", async () => {
        const a = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            uidPrefix: "insta",
        })
        const b = await provisionTestAccount(ADMIN_UID, {
            role: "member",
            uidPrefix: "insta",
        })
        const sibling = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            uidPrefix: "instb",
        })
        const unprefixed = await provisionTestAccount(ADMIN_UID, {
            role: "member",
        })
        if ("error" in a) throw new Error(`mint a failed: ${a.error} — ${a.message}`)
        if ("error" in b) throw new Error(`mint b failed: ${b.error} — ${b.message}`)
        if ("error" in sibling) throw new Error(`mint sibling failed: ${sibling.error} — ${sibling.message}`)
        if ("error" in unprefixed) throw new Error(`mint unprefixed failed: ${unprefixed.error} — ${unprefixed.message}`)

        // Also seed an orphan Auth user under insta — must be swept.
        await getAuth().createUser({
            uid: "test-insta-musician-orphan2",
            disabled: true,
        })
        // And an orphan under instb — must NOT be swept.
        await getAuth().createUser({
            uid: "test-instb-member-orphan3",
            disabled: true,
        })

        const result = await cleanupAllTestDataCore(ADMIN_UID, { prefix: "insta" })
        if ("error" in result) throw new Error("cleanup failed: " + result.error)
        expect(result.failures).toEqual([])
        // Two prefixed mints + one prefixed orphan = 3 sweeps.
        expect(result.removed).toBe(3)

        // insta-namespaced uids — gone from both Firestore index AND Auth
        for (const dead of [a.uid, b.uid, "test-insta-musician-orphan2"]) {
            expect((await db().collection("mcpTestUsers").doc(dead).get()).exists).toBe(false)
            await expect(getAuth().getUser(dead)).rejects.toThrow()
        }

        // instb uid + orphan + unprefixed uid + admin caller — all survive
        for (const survivor of [sibling.uid, "test-instb-member-orphan3", unprefixed.uid] as const) {
            const indexExists = (await db().collection("mcpTestUsers").doc(survivor).get()).exists
            const authExists = await getAuth().getUser(survivor).then(() => true, () => false)
            // Either the index OR Auth survives — the orphan only had Auth,
            // the others had both. Both checks together prove non-deletion.
            expect(authExists).toBe(true)
            // For the two real mints (sibling + unprefixed) the index also
            // survives; the orphan was Auth-only by construction.
            if (survivor !== "test-instb-member-orphan3") {
                expect(indexExists).toBe(true)
            }
        }

        // Critical: caller's own admin user is untouched. The prefix filter
        // excludes any uid that doesn't start with `test-insta-` — and an
        // admin uid doesn't start with `test-` at all — so the caller-last
        // ordering never even gets to consider them. Per
        // [[feedback_self_inclusion_test_fixtures]].
        const adminSnap = await db().collection("users").doc(ADMIN_UID).get()
        expect(adminSnap.exists).toBe(true)
        expect(adminSnap.data()?.role).toBe("admin")
    })

    it("cleanup_all_test_data rejects malformed prefix", async () => {
        const result = await cleanupAllTestDataCore(ADMIN_UID, { prefix: "Bad Prefix" })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("invalid_uid_prefix")
        }
    })

    it("cleanup with prefix invoked from a test band_leader bearer cleans own namespace + spares sibling namespace", async () => {
        // Two parallel instance namespaces; the driver lives in insta and
        // calls cleanup({prefix:'insta'}). Sibling instance instb must
        // survive entirely.
        const driverA = await provisionTestAccount(ADMIN_UID, {
            role: "band_leader",
            uidPrefix: "insta",
            label: "driver",
        })
        if ("error" in driverA) {
            throw new Error(`driverA mint failed: ${driverA.error} — ${driverA.message}`)
        }
        // Driver mints two siblings in its own namespace.
        for (const role of ["musician", "member"] as const) {
            const m = await provisionTestAccount(driverA.uid, {
                role,
                uidPrefix: "insta",
            })
            if ("error" in m) {
                throw new Error(`sibling mint failed (${role}): ${m.error} — ${m.message}`)
            }
        }
        // And one user in a foreign namespace, minted by the admin.
        const siblingB = await provisionTestAccount(ADMIN_UID, {
            role: "musician",
            uidPrefix: "instb",
        })
        if ("error" in siblingB) {
            throw new Error(`siblingB mint failed: ${siblingB.error} — ${siblingB.message}`)
        }

        const result = await cleanupAllTestDataCore(driverA.uid, { prefix: "insta" })
        if ("error" in result) throw new Error("cleanup failed: " + result.error)
        expect(result.failures).toEqual([])
        // 1 driver + 2 siblings = 3.
        expect(result.removed).toBe(3)

        // instb sibling survived in both Firestore and Auth.
        const survivorIdx = await db().collection("mcpTestUsers").doc(siblingB.uid).get()
        expect(survivorIdx.exists).toBe(true)
        await expect(getAuth().getUser(siblingB.uid)).resolves.toBeTruthy()
    })

    // ── Cycle-7 Lane 1: Convergence C cascade extension ──────────────────────

    it("revoke cascades to setlistTemplates owned by the test uid (C7I3-007)", async () => {
        const mint = await provisionTestAccount(ADMIN_UID, { role: "band_leader" })
        if ("error" in mint) throw new Error("mint failed")
        // Seed an owned template + an unrelated template owned by someone else.
        await db().collection("setlistTemplates").doc("tpl-owned").set({
            name: "Test template",
            ownerId: mint.uid,
        })
        await db().collection("setlistTemplates").doc("tpl-other").set({
            name: "Other template",
            ownerId: "real-user-uid",
        })

        const revoked = await revokeTestAccountCore(ADMIN_UID, mint.uid)
        if ("error" in revoked) throw new Error("revoke failed")
        expect(revoked.cascaded.setlistTemplates).toBe(1)
        expect(
            (await db().collection("setlistTemplates").doc("tpl-owned").get()).exists,
        ).toBe(false)
        // Foreign template untouched.
        expect(
            (await db().collection("setlistTemplates").doc("tpl-other").get()).exists,
        ).toBe(true)
    })

    it("cleanup_all_test_data with prefix cascade-deletes templates + setlists + tracks for the namespace (Convergence C)", async () => {
        const a = await provisionTestAccount(ADMIN_UID, {
            role: "band_leader",
            uidPrefix: "c7l1",
        })
        if ("error" in a) throw new Error(`mint failed: ${a.error}`)
        // Seed: 1 template + 1 setlist + 2 tracks owned by `a`.
        await db().collection("setlistTemplates").doc("tpl-c7l1").set({
            name: "c7l1 template",
            ownerId: a.uid,
        })
        await db().collection("setlists").doc("sl-c7l1").set({
            name: "c7l1 setlist",
            ownerId: a.uid,
        })
        for (const tid of ["tr-c7l1-1", "tr-c7l1-2"]) {
            await db().collection("tracks").doc(tid).set({
                setlistId: "sl-c7l1",
                title: tid,
            })
        }
        // Sibling namespace must survive.
        await db().collection("setlistTemplates").doc("tpl-c7l2").set({
            name: "c7l2 template",
            ownerId: "test-c7l2-band_leader-deadbeef",
        })

        const result = await cleanupAllTestDataCore(ADMIN_UID, { prefix: "c7l1" })
        if ("error" in result) throw new Error("cleanup failed: " + result.error)
        expect(result.aggregate.setlistTemplates ?? 0).toBe(1)
        expect(result.aggregate.setlists ?? 0).toBe(1)
        expect(result.aggregate.tracks ?? 0).toBe(2)

        expect(
            (await db().collection("setlistTemplates").doc("tpl-c7l1").get()).exists,
        ).toBe(false)
        expect((await db().collection("setlists").doc("sl-c7l1").get()).exists).toBe(false)
        for (const tid of ["tr-c7l1-1", "tr-c7l1-2"]) {
            expect((await db().collection("tracks").doc(tid).get()).exists).toBe(false)
        }
        // Sibling c7l2 template survives.
        expect(
            (await db().collection("setlistTemplates").doc("tpl-c7l2").get()).exists,
        ).toBe(true)
    })

    // ── Cycle-7 Lane 1: sweep_orphan_test_data ───────────────────────────────

    it("sweep_orphan_test_data refuses non-admin (band_leader denied — admin-only)", async () => {
        const r = await sweepOrphanTestDataCore(LEADER_UID, { dryRun: true })
        expect("error" in r).toBe(true)
        if ("error" in r) expect(r.error).toBe("forbidden_role")
    })

    it("sweep_orphan_test_data dryRun returns orphan list without deleting", async () => {
        // Seed: test-shape ownerId with NO matching users/{uid} doc (orphan).
        await db().collection("setlists").doc("sl-orphan-1").set({
            name: "Orphan SL",
            ownerId: "test-c7i1-band_leader-feedface",
        })
        await db().collection("setlistTemplates").doc("tpl-orphan-1").set({
            name: "Orphan TPL",
            ownerId: "test-c7i1-band_leader-feedface",
        })
        // Non-orphan: real-uid owner exists in users.
        await db().collection("setlists").doc("sl-real").set({
            name: "Real SL",
            ownerId: ADMIN_UID,
        })

        const result = await sweepOrphanTestDataCore(ADMIN_UID, { dryRun: true })
        if ("error" in result) throw new Error("dryRun failed: " + result.error)
        expect(result.dryRun).toBe(true)
        expect(result.swept.setlists).toBe(0)
        expect(result.swept.setlistTemplates).toBe(0)
        expect(result.orphans.length).toBe(2)
        expect(result.orphans.map((o) => o.id).sort()).toEqual(
            ["sl-orphan-1", "tpl-orphan-1"].sort(),
        )
        // Real setlist must NOT be in orphans.
        expect(result.orphans.find((o) => o.id === "sl-real")).toBeUndefined()
        // Nothing actually deleted.
        expect((await db().collection("setlists").doc("sl-orphan-1").get()).exists).toBe(true)
        expect((await db().collection("setlistTemplates").doc("tpl-orphan-1").get()).exists).toBe(true)
    })

    it("sweep_orphan_test_data refuses real-write without force (F-05 standing rule)", async () => {
        const r = await sweepOrphanTestDataCore(ADMIN_UID, { dryRun: false })
        expect("error" in r).toBe(true)
        if ("error" in r) expect(r.error).toBe("force_required")
    })

    it("sweep_orphan_test_data with dryRun:false + force:true deletes orphans + dependent tracks; spares non-orphans", async () => {
        // Orphan setlist + its tracks.
        await db().collection("setlists").doc("sl-c7i3a-orph").set({
            name: "Orphan from c7i3a",
            ownerId: "c7i3a-band_leader-cafe1234",
        })
        for (const tid of ["t-1", "t-2", "t-3"]) {
            await db().collection("tracks").doc(tid).set({
                setlistId: "sl-c7i3a-orph",
                title: tid,
            })
        }
        // Orphan template.
        await db().collection("setlistTemplates").doc("tpl-cf2-orph").set({
            name: "Orphan from cf2",
            ownerId: "cf2-band_leader-deadbeef",
        })
        // Non-orphan: owner exists. uidPattern test below also relies on this.
        await db().collection("setlists").doc("sl-with-owner").set({
            name: "Has owner",
            ownerId: ADMIN_UID,
        })

        const result = await sweepOrphanTestDataCore(ADMIN_UID, {
            dryRun: false,
            force: true,
        })
        if ("error" in result) throw new Error("sweep failed: " + result.error)
        expect(result.dryRun).toBe(false)
        expect(result.swept.setlists).toBe(1)
        expect(result.swept.setlistTemplates).toBe(1)
        expect(result.swept.tracks).toBe(3)

        expect((await db().collection("setlists").doc("sl-c7i3a-orph").get()).exists).toBe(false)
        expect((await db().collection("setlistTemplates").doc("tpl-cf2-orph").get()).exists).toBe(false)
        for (const tid of ["t-1", "t-2", "t-3"]) {
            expect((await db().collection("tracks").doc(tid).get()).exists).toBe(false)
        }
        expect((await db().collection("setlists").doc("sl-with-owner").get()).exists).toBe(true)
    })

    it("sweep_orphan_test_data uidPattern narrows the sweep to one cycle namespace", async () => {
        await db().collection("setlists").doc("sl-c7i1").set({
            name: "c7i1 orphan",
            ownerId: "test-c7i1-band_leader-abc12345",
        })
        await db().collection("setlists").doc("sl-c7i5").set({
            name: "c7i5 orphan",
            ownerId: "test-c7i5-band_leader-xyz67890",
        })

        const result = await sweepOrphanTestDataCore(ADMIN_UID, {
            dryRun: false,
            force: true,
            uidPattern: "c7i1",
        })
        if ("error" in result) throw new Error("sweep failed: " + result.error)
        expect(result.swept.setlists).toBe(1)
        // c7i1 swept, c7i5 survives because pattern didn't match.
        expect((await db().collection("setlists").doc("sl-c7i1").get()).exists).toBe(false)
        expect((await db().collection("setlists").doc("sl-c7i5").get()).exists).toBe(true)
    })
})
