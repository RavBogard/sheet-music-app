import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { backfillTokenOrgId } from "@/lib/mcp/backfill-token-orgid"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

/**
 * v11-02-01 AC-5 — mcpTokens orgId backfill against the Firebase emulator.
 *
 * Proves: dry-run makes no writes but reports accurate wouldStamp; apply stamps
 * orgId="crc" on every unstamped token while preserving sibling fields and never
 * overwriting an existing orgId; a second apply is idempotent (stamps 0).
 */
describe("backfill-token-orgid (real Firestore emulator)", () => {
    let app: App
    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-backfill-token-orgid" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection("mcpTokens").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    /**
     * Seed 2 unstamped tokens + 1 already-stamped (brotherslazaroff) to prove a
     * non-crc orgId is never overwritten.
     */
    async function seedMixed() {
        await db().collection("mcpTokens").doc("tok-unstamped-1").set({
            tokenHash: "h1",
            uid: "u1",
            label: "Claude Desktop",
            revokedAt: null,
        })
        await db().collection("mcpTokens").doc("tok-unstamped-2").set({
            tokenHash: "h2",
            uid: "u2",
            label: "Claude Code",
            revokedAt: null,
        })
        await db().collection("mcpTokens").doc("tok-stamped").set({
            tokenHash: "h3",
            uid: "david",
            label: "BL bearer",
            orgId: "brotherslazaroff",
            revokedAt: null,
        })
    }

    it("AC-5: dryRun makes NO writes but reports accurate wouldStamp", async () => {
        await seedMixed()

        const res = await backfillTokenOrgId(db(), { dryRun: true })
        expect(res.dryRun).toBe(true)
        expect(res.scanned).toBe(3)
        expect(res.alreadyStamped).toBe(1)
        expect(res.wouldStamp).toBe(2)
        expect(res.stamped).toBe(0)

        const d = (await db().collection("mcpTokens").doc("tok-unstamped-1").get()).data()!
        expect(d.orgId).toBeUndefined()
    })

    it("AC-5: apply stamps orgId='crc' on every unstamped token; preserves siblings + non-crc orgId", async () => {
        await seedMixed()

        const res = await backfillTokenOrgId(db(), { dryRun: false })
        expect(res.dryRun).toBe(false)
        expect(res.orgId).toBe(DEFAULT_ORG_ID)
        expect(res.stamped).toBe(2)

        const d1 = (await db().collection("mcpTokens").doc("tok-unstamped-1").get()).data()!
        const d2 = (await db().collection("mcpTokens").doc("tok-unstamped-2").get()).data()!
        expect(d1.orgId).toBe("crc")
        expect(d2.orgId).toBe("crc")
        // Sibling fields preserved by the merge-set.
        expect(d1.tokenHash).toBe("h1")
        expect(d1.label).toBe("Claude Desktop")

        // The pre-stamped BL token is never overwritten.
        const stamped = (await db().collection("mcpTokens").doc("tok-stamped").get()).data()!
        expect(stamped.orgId).toBe("brotherslazaroff")
    })

    it("AC-5: a second apply is idempotent — stamps 0, all alreadyStamped", async () => {
        await seedMixed()
        await backfillTokenOrgId(db(), { dryRun: false })

        const second = await backfillTokenOrgId(db(), { dryRun: false })
        expect(second.stamped).toBe(0)
        expect(second.alreadyStamped).toBe(3)

        // And a dry-run after apply reports wouldStamp 0.
        const dry = await backfillTokenOrgId(db(), { dryRun: true })
        expect(dry.wouldStamp).toBe(0)
    })
})
