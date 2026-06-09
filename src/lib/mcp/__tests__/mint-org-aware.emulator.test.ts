import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

import { createMcpToken } from "../tokens"
import { verifyBearer } from "../auth"
import { getPrimaryOrgForMinting } from "@/lib/org/membership-server"

/**
 * v11-02b — org-aware self-service token minting, end-to-end against the Auth +
 * Firestore emulators.
 *
 * Proves the chain the two mint routes (/api/mcp/tokens + /api/mcp/oauth/token)
 * now use: a user's `orgIds` custom claim → getPrimaryOrgForMinting → the org
 * stamped on the minted mcpTokens doc → the tenant verifyBearer resolves. A
 * claimless (CRC) user stays crc (behavior-neutral). HFG discipline — real
 * Auth + Firestore, no mocking.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec --only
 * firestore,auth sets FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST).
 */
describe("MCP org-aware minting (emulator)", () => {
    let app: App
    const BL_UID = "david-bl"
    const CRC_UID = "rabbi-crc"

    function bearerReq(token: string): Request {
        return new Request("http://localhost/api/mcp", {
            headers: { authorization: `Bearer ${token}` },
        })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mint-org-aware" })

        // A BL member carries an explicit orgIds claim; a CRC user carries none
        // (the backward-compat default-crc population).
        const auth = getAuth(app)
        await auth.createUser({ uid: BL_UID })
        await auth.setCustomUserClaims(BL_UID, {
            role: "band_leader",
            orgIds: ["brotherslazaroff"],
        })
        await auth.createUser({ uid: CRC_UID })
        await auth.setCustomUserClaims(CRC_UID, { role: "band_leader" })
    })

    afterAll(async () => {
        const auth = getAuth(app)
        await auth.deleteUser(BL_UID).catch(() => {})
        await auth.deleteUser(CRC_UID).catch(() => {})
        await deleteApp(app)
    })

    beforeEach(async () => {
        const db = getFirestore(app)
        const snap = await db.collection("mcpTokens").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("AC-1: getPrimaryOrgForMinting resolves the claim's org / defaults crc", async () => {
        expect(await getPrimaryOrgForMinting(BL_UID)).toBe("brotherslazaroff")
        expect(await getPrimaryOrgForMinting(CRC_UID)).toBe("crc")
        // missing user → crc, never throws
        expect(await getPrimaryOrgForMinting("nonexistent-uid")).toBe("crc")
    })

    it("AC-2: a BL member's self-mint stamps orgId=brotherslazaroff", async () => {
        const org = await getPrimaryOrgForMinting(BL_UID)
        const { id, rawToken } = await createMcpToken(BL_UID, "Claude Desktop", org)

        const doc = await getFirestore(app).collection("mcpTokens").doc(id).get()
        expect(doc.data()?.orgId).toBe("brotherslazaroff")

        // The minted bearer resolves the BL tenant through the real verifier.
        const verified = await verifyBearer(bearerReq(rawToken))
        expect(verified).toMatchObject({ uid: BL_UID, orgId: "brotherslazaroff" })
    })

    it("AC-2/AC-3: a CRC (claimless) member's self-mint stays orgId=crc", async () => {
        const org = await getPrimaryOrgForMinting(CRC_UID)
        const { id, rawToken } = await createMcpToken(CRC_UID, "Claude Desktop", org)

        const doc = await getFirestore(app).collection("mcpTokens").doc(id).get()
        expect(doc.data()?.orgId).toBe("crc")

        const verified = await verifyBearer(bearerReq(rawToken))
        expect(verified).toMatchObject({ uid: CRC_UID, orgId: "crc" })
    })
})
