import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { createMcpToken, listMcpTokens, revokeMcpToken } from "../tokens"
import { verifyBearer } from "../auth"

/**
 * MCP Phase 5 — token lifecycle against the Firebase emulator.
 *
 * Higher fidelity than the mocked unit tests: exercises tokens.ts + auth.ts
 * end-to-end against a real Firestore. Covers create → verifyBearer → revoke
 * → reject, the fire-and-forget lastUsedAt stamp, and owner scoping.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("MCP token flow (emulator)", () => {
    let app: App

    function bearerReq(token: string): Request {
        return new Request("http://localhost/api/mcp", {
            headers: { authorization: `Bearer ${token}` },
        })
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        // initAdmin() early-returns true when an app already exists, so
        // seeding one here lets tokens.ts / auth.ts run against the emulator
        // without service-account env vars. getFirestore() then auto-detects
        // FIRESTORE_EMULATOR_HOST.
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-token-flow" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const db = getFirestore(app)
        const snap = await db.collection("mcpTokens").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("create → verifyBearer resolves the owner uid", async () => {
        const { id, rawToken } = await createMcpToken("user-1", "Claude Desktop")
        expect(id).toBeTruthy()
        expect(await verifyBearer(bearerReq(rawToken))).toEqual({ uid: "user-1" })
    })

    it("verifyBearer stamps lastUsedAt (fire-and-forget)", async () => {
        const { id, rawToken } = await createMcpToken("user-1", "Stamp Test")
        const before = (await listMcpTokens("user-1")).find((t) => t.id === id)
        expect(before?.lastUsedAt).toBeNull()

        await verifyBearer(bearerReq(rawToken))

        // The lastUsedAt write is intentionally not awaited inside verifyBearer
        // — poll briefly for it to land.
        let lastUsed: number | null = null
        for (let i = 0; i < 20 && lastUsed === null; i++) {
            await new Promise((r) => setTimeout(r, 50))
            lastUsed =
                (await listMcpTokens("user-1")).find((t) => t.id === id)
                    ?.lastUsedAt ?? null
        }
        expect(lastUsed).toEqual(expect.any(Number))
    })

    it("revoked tokens are rejected and drop out of the list", async () => {
        const { id, rawToken } = await createMcpToken("user-1", "To Revoke")
        expect(await verifyBearer(bearerReq(rawToken))).toEqual({ uid: "user-1" })

        expect(await revokeMcpToken("user-1", id)).toBe(true)

        const rejected = await verifyBearer(bearerReq(rawToken))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)
        expect(await listMcpTokens("user-1")).toHaveLength(0)
    })

    it("an unknown token is rejected with 401", async () => {
        const rejected = await verifyBearer(bearerReq("crl_live_nonexistent"))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)
    })

    it("listMcpTokens scopes to the owner", async () => {
        await createMcpToken("user-1", "A")
        await createMcpToken("user-1", "B")
        await createMcpToken("user-2", "C")
        expect(await listMcpTokens("user-1")).toHaveLength(2)
        expect(await listMcpTokens("user-2")).toHaveLength(1)
    })
})
