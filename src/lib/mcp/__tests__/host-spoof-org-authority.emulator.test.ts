import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

import { createMcpToken } from "../tokens"
import { verifyBearer } from "../auth"
import { orgFrom } from "../org-context"

/**
 * v11-06-02 (close-gate audit) — host-spoof / tenant-confusion.
 *
 * Proves the MCP caller's tenant is resolved EXCLUSIVELY from the verified
 * bearer token doc (verifyBearer → orgId), and that a forged/mismatched
 * `x-org-id` request header has ZERO effect. The web layer uses x-org-id
 * (proxy → <html data-org>), but the MCP auth path must never trust it —
 * otherwise an attacker could read/write another tenant's data by spoofing a
 * header. Also pins orgFrom's pure contract (the seam tool handlers consume).
 *
 * Emulator-backed (verifyBearer reads the token doc). Runs via
 * `npm run test:emulator`.
 */
describe("v11-06-02 host-spoof: MCP caller org is bearer-derived, header-immune (emulator)", () => {
    let app: App

    function db() {
        return getFirestore(app)
    }

    /** Build an MCP Request with a bearer and an OPTIONAL spoofed x-org-id header. */
    function bearerReq(token: string, spoofOrg?: string): Request {
        const headers: Record<string, string> = {
            authorization: `Bearer ${token}`,
        }
        if (spoofOrg) headers["x-org-id"] = spoofOrg
        return new Request("http://localhost/api/mcp", { headers })
    }

    /** Mint a token; `org=null` deletes the orgId field to simulate a legacy pre-v11-02 token. */
    async function seedToken(uid: string, org: string | null): Promise<string> {
        const { id, rawToken } = await createMcpToken(uid, "v11-06-02 probe", org ?? "crc")
        if (org === null) {
            await db().collection("mcpTokens").doc(id).update({ orgId: FieldValue.delete() })
        }
        return rawToken
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-host-spoof" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection("mcpTokens").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    // ── AC-1: the bearer token doc is the SOLE source of caller org ──

    it("AC-1: a BL bearer + spoofed `x-org-id: crc` resolves orgId='brotherslazaroff' (header ignored)", async () => {
        const bl = await seedToken("bl-user", "brotherslazaroff")
        const v = await verifyBearer(bearerReq(bl, "crc"))
        if (v instanceof Response) throw new Error("expected VerifiedBearer, got Response")
        expect(v.orgId).toBe("brotherslazaroff")
        expect(v.uid).toBe("bl-user")
    })

    it("AC-1: a CRC bearer + spoofed `x-org-id: brotherslazaroff` resolves orgId='crc'", async () => {
        const crc = await seedToken("crc-user", "crc")
        const v = await verifyBearer(bearerReq(crc, "brotherslazaroff"))
        if (v instanceof Response) throw new Error("expected VerifiedBearer, got Response")
        expect(v.orgId).toBe("crc")
    })

    it("AC-1: a legacy token with NO orgId field defaults to crc, even with a spoofed BL header", async () => {
        const legacy = await seedToken("legacy-user", null)
        const v = await verifyBearer(bearerReq(legacy, "brotherslazaroff"))
        if (v instanceof Response) throw new Error("expected VerifiedBearer, got Response")
        expect(v.orgId).toBe("crc")
    })

    // ── AC-2: orgFrom — the pure seam tool handlers consume — has safe defaults ──

    it("AC-2: orgFrom returns the bearer-derived orgId verbatim", () => {
        expect(
            orgFrom({ authInfo: { extra: { uid: "u", orgId: "brotherslazaroff" } } }),
        ).toBe("brotherslazaroff")
    })

    it("AC-2: orgFrom defaults to 'crc' when orgId is absent (back-compat, never cross-tenant-open)", () => {
        expect(orgFrom({ authInfo: { extra: { uid: "u" } } })).toBe("crc")
    })

    it("AC-2: orgFrom THROWS when uid is missing (unauthenticated context)", () => {
        expect(() => orgFrom({ authInfo: { extra: {} } })).toThrow("Unauthenticated MCP request")
    })

    it("AC-2: orgFrom honors ONLY `orgId` — header-like spoof keys in extra are ignored", () => {
        expect(
            orgFrom({
                authInfo: {
                    extra: {
                        uid: "u",
                        orgId: "crc",
                        // attacker-injected header-like fields must have no effect
                        xOrgId: "brotherslazaroff",
                        "x-org-id": "brotherslazaroff",
                    },
                },
            }),
        ).toBe("crc")
    })
})
