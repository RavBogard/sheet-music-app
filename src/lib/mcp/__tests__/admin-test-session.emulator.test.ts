import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

import {
    provisionAdminTestSession,
    clampTtl,
    isAdminTestUid,
    ADMIN_TEST_CLAIM,
    ADMIN_TEST_DEFAULT_TTL_SEC,
    ADMIN_TEST_MAX_TTL_SEC,
} from "../tools/admin-test-session"
import { provisionTestAccount } from "../tools/test-tokens"
import { verifyBearer } from "../auth"

/**
 * admin-test-session core (emulator). Proves the durable Firestore + Auth +
 * audit state the secret-gated route depends on:
 *   - a fresh test-admin-<hex> user with role:admin + admin_test:true claims
 *   - users/{uid} + mcpTestUsers/{uid} docs (sweepable / discoverable)
 *   - a paired MCP bearer that verifyBearer resolves
 *   - a Firestore audit row (who/when/TTL) in adminTestSessionAudit
 *   - REGRESSION: the existing create_test_account TEST_ROLE path still
 *     refuses admin (the priv-esc guard we did NOT weaken).
 */
describe("admin-test-session core (emulator)", () => {
    let app: App
    const ADMIN_UID = "admin-daniel"

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
        app = getApps()[0] ?? initializeApp({ projectId: "demo-admin-test-session" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const collections = [
            "mcpTokens",
            "mcpTestUsers",
            "users",
            "adminTestSessionAudit",
        ]
        await Promise.all(
            collections.map(async (c) => {
                const snap = await db().collection(c).get()
                await Promise.all(snap.docs.map((d) => d.ref.delete()))
            }),
        )
        const auth = getAuth()
        let pageToken: string | undefined
        for (let i = 0; i < 10; i++) {
            const result = await auth.listUsers(1000, pageToken)
            await Promise.all(
                result.users.map((u) => auth.deleteUser(u.uid).catch(() => undefined)),
            )
            if (!result.pageToken) break
            pageToken = result.pageToken
        }
        await db().collection("users").doc(ADMIN_UID).set({ role: "admin" })
    })

    it("mints a test-admin user with admin + admin_test custom claims", async () => {
        const result = await provisionAdminTestSession({ callerContext: "1.2.3.4" })

        expect(result.uid).toMatch(/^test-admin-[0-9a-f]{8}$/)
        expect(isAdminTestUid(result.uid)).toBe(true)
        expect(result.role).toBe("admin")
        expect(result.adminTest).toBe(true)
        expect(result.token).toMatch(/^crl_live_/)

        // Custom claims propagate (this is what lands in the session cookie).
        const userRecord = await getAuth().getUser(result.uid)
        expect(userRecord.customClaims?.role).toBe("admin")
        expect(userRecord.customClaims?.[ADMIN_TEST_CLAIM]).toBe(true)
        // Created disabled:true (route flips it for the exchange).
        expect(userRecord.disabled).toBe(true)
    })

    it("writes users/{uid} + mcpTestUsers/{uid} docs (sweepable + discoverable)", async () => {
        const result = await provisionAdminTestSession()

        const userSnap = await db().collection("users").doc(result.uid).get()
        expect(userSnap.exists).toBe(true)
        expect(userSnap.data()?.role).toBe("admin")
        expect(userSnap.data()?.isTestUser).toBe(true)
        expect(userSnap.data()?.[ADMIN_TEST_CLAIM]).toBe(true)
        expect(userSnap.data()?.ttlExpiresAt).toBeTruthy()

        const indexSnap = await db().collection("mcpTestUsers").doc(result.uid).get()
        expect(indexSnap.exists).toBe(true)
        expect(indexSnap.data()?.role).toBe("admin")
        expect(indexSnap.data()?.mcpTokenId).toBe(result.tokenId)
    })

    it("mints a bearer that verifyBearer resolves to the admin-test uid", async () => {
        const result = await provisionAdminTestSession()
        const verified = await verifyBearer(bearerReq(result.token))
        if (verified instanceof Response) {
            throw new Error(`verifyBearer rejected the minted admin-test bearer (status ${verified.status})`)
        }
        expect(verified.uid).toBe(result.uid)
    })

    it("writes an audit row capturing uid / ttl / callerContext", async () => {
        const result = await provisionAdminTestSession({
            callerContext: "9.9.9.9",
            label: "matrix-run",
        })
        const auditSnap = await db().collection("adminTestSessionAudit").doc(result.auditId).get()
        expect(auditSnap.exists).toBe(true)
        const data = auditSnap.data()!
        expect(data.uid).toBe(result.uid)
        expect(data.tokenId).toBe(result.tokenId)
        expect(data.ttlSec).toBe(ADMIN_TEST_DEFAULT_TTL_SEC)
        expect(data.callerContext).toBe("9.9.9.9")
        expect(data.label).toBe("matrix-run")
        expect(data.mintedAt).toBeTruthy()
    })

    it("defaults TTL to 1h and clamps an over-long request to the 2h cap", async () => {
        expect(clampTtl(undefined)).toBe(ADMIN_TEST_DEFAULT_TTL_SEC)
        expect(clampTtl(0)).toBe(ADMIN_TEST_DEFAULT_TTL_SEC)
        expect(clampTtl(-5)).toBe(ADMIN_TEST_DEFAULT_TTL_SEC)
        expect(clampTtl(900)).toBe(900)
        expect(clampTtl(99999)).toBe(ADMIN_TEST_MAX_TTL_SEC)

        const result = await provisionAdminTestSession({ ttlSec: 99999 })
        const auditSnap = await db().collection("adminTestSessionAudit").doc(result.auditId).get()
        expect(auditSnap.data()?.ttlSec).toBe(ADMIN_TEST_MAX_TTL_SEC)
    })

    it("each mint produces a distinct uid + token (fresh per call)", async () => {
        const a = await provisionAdminTestSession()
        const b = await provisionAdminTestSession()
        expect(a.uid).not.toBe(b.uid)
        expect(a.token).not.toBe(b.token)
    })

    it("REGRESSION: create_test_account STILL refuses role=admin (priv-esc guard intact)", async () => {
        // The whole point of this lane is to NOT weaken the test-tokens gate.
        // @ts-expect-error — 'admin' is intentionally outside TestRole; we
        // force it to prove the runtime guard still refuses.
        const result = await provisionTestAccount(ADMIN_UID, { role: "admin" })
        expect("error" in result).toBe(true)
        if ("error" in result) {
            expect(result.error).toBe("admin_test_user_refused")
        }
    })
})
