import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { createHash, randomBytes } from "crypto"

import {
    registerClient,
    getClient,
    createAuthCode,
    consumeAuthCode,
} from "../oauth"
import { verifyBearer } from "../auth"
import { createMcpToken } from "../tokens"

/**
 * MCP OAuth — full front-door flow against the Firebase emulator.
 *
 * Exercises oauth.ts (client store, code store) end-to-end against a real
 * Firestore, plus the register → authorize-code → token → verifyBearer
 * round-trip that proves an OAuth access_token IS an ordinary crl_live_ token.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("MCP OAuth flow (emulator)", () => {
    let app: App

    function s256(verifier: string): string {
        return createHash("sha256").update(verifier).digest("base64url")
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-oauth-flow" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const db = getFirestore(app)
        for (const col of ["mcpOAuthClients", "mcpOAuthCodes", "mcpTokens"]) {
            const snap = await db.collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    it("registerClient → getClient round-trips a public PKCE client", async () => {
        const client = await registerClient({
            redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
            clientName: "Claude",
        })
        expect(client.clientId).toMatch(/^crl_client_/)
        expect(client.redirectUris).toEqual(["https://claude.ai/api/mcp/auth_callback"])

        const fetched = await getClient(client.clientId)
        expect(fetched?.clientName).toBe("Claude")
        expect(fetched?.redirectUris).toEqual(["https://claude.ai/api/mcp/auth_callback"])
    })

    it("rejects registration with no redirect_uris", async () => {
        await expect(registerClient({ redirectUris: [] })).rejects.toThrow()
        await expect(registerClient({ redirectUris: undefined })).rejects.toThrow()
    })

    it("rejects a non-https, non-loopback redirect_uri", async () => {
        await expect(
            registerClient({ redirectUris: ["http://evil.example/cb"] }),
        ).rejects.toThrow()
    })

    it("allows a loopback http redirect_uri (native clients)", async () => {
        const client = await registerClient({
            redirectUris: ["http://127.0.0.1:33418/callback"],
        })
        expect(client.redirectUris).toEqual(["http://127.0.0.1:33418/callback"])
    })

    it("getClient returns null for an unknown client_id", async () => {
        expect(await getClient("crl_client_nope")).toBeNull()
    })

    it("createAuthCode → consumeAuthCode returns the stored grant, single-use", async () => {
        const verifier = randomBytes(32).toString("base64url")
        const code = await createAuthCode({
            clientId: "crl_client_x",
            uid: "user-1",
            codeChallenge: s256(verifier),
            redirectUri: "https://claude.ai/cb",
            scope: null,
        })

        const first = await consumeAuthCode(code)
        expect(first).toMatchObject({
            clientId: "crl_client_x",
            uid: "user-1",
            redirectUri: "https://claude.ai/cb",
        })

        // Single-use: a replay finds nothing.
        expect(await consumeAuthCode(code)).toBeNull()
    })

    it("consumeAuthCode returns null for an unknown code", async () => {
        expect(await consumeAuthCode(randomBytes(32).toString("hex"))).toBeNull()
    })

    it("full flow: register → code → token mints a working crl_live_ bearer", async () => {
        // 1. Client registers.
        const client = await registerClient({
            redirectUris: ["https://claude.ai/cb"],
            clientName: "Claude Desktop",
        })

        // 2. /authorize would mint a code bound to the PKCE challenge + uid.
        const verifier = randomBytes(32).toString("base64url")
        const code = await createAuthCode({
            clientId: client.clientId,
            uid: "rabbi-daniel",
            codeChallenge: s256(verifier),
            redirectUri: "https://claude.ai/cb",
            scope: null,
        })

        // 3. /token consumes the code, verifies PKCE, mints a crl_live_ token.
        const grant = await consumeAuthCode(code)
        expect(grant).not.toBeNull()
        const { rawToken } = await createMcpToken(
            grant!.uid,
            `Claude OAuth — ${client.clientName}`,
        )
        expect(rawToken).toMatch(/^crl_live_/)

        // 4. The OAuth access_token IS an ordinary MCP bearer — verifyBearer
        //    accepts it and resolves the same uid, with zero changes to auth.ts.
        const req = new Request("http://localhost/api/mcp", {
            headers: { authorization: `Bearer ${rawToken}` },
        })
        expect(await verifyBearer(req)).toEqual({
            uid: "rabbi-daniel",
            tokenId: expect.any(String),
            parentTokenId: null,
            // v11-02-01: createMcpToken stamps orgId; OAuth tokens default crc.
            orgId: "crc",
        })
    })
})
