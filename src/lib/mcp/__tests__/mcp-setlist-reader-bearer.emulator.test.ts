import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    mintSetlistReaderBearerCore,
    listSetlistReaderBearersCore,
    revokeSetlistReaderBearerCore,
} from "../tools/setlist-reader-bearer"
import { verifyBearer } from "../auth"
import { generateRawToken, hashToken } from "../tokens"
import { SETLIST_READER_TOOLS } from "../scoped-bearer"

/**
 * Emulator coverage for the `setlist_reader` credential pack. Mirrors the
 * mint_admin_bearer harness, and pins the three properties that make this
 * credential different from a minted admin bearer:
 *
 *   - NO `ttlExpiresAt` (long-lived by design),
 *   - `parentTokenId: null` (not a cascade child; provenance is
 *     `mintedFromTokenId`),
 *   - an explicit `allowedTools` allow-list that `verifyBearer` reports.
 */
describe("MCP mint_setlist_reader_bearer (emulator)", () => {
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

    async function seedRootToken(uid = ADMIN_UID): Promise<{ tokenId: string; rawToken: string }> {
        const rawToken = generateRawToken()
        const ref = await db().collection("mcpTokens").add({
            tokenHash: hashToken(rawToken),
            uid,
            revokedAt: null,
            lastUsedAt: null,
        })
        return { tokenId: ref.id, rawToken }
    }

    function rootCaller(tokenId: string, uid = ADMIN_UID) {
        return { uid, tokenId, parentTokenId: null as string | null, orgId: "crc" }
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-setlist-reader-bearer" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection("mcpTokens").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
        const userSnap = await db().collection("users").get()
        await Promise.all(userSnap.docs.map((d) => d.ref.delete()))
        await db().collection("users").doc(ADMIN_UID).set({ role: "admin" })
        await db().collection("users").doc(LEADER_UID).set({ role: "band_leader" })
        await db().collection("users").doc(MUSICIAN_UID).set({ role: "musician" })
    })

    // 1. Happy path — doc shape is the whole point of this test.
    it("root admin mints a read-only credential with the right doc shape", async () => {
        const root = await seedRootToken()
        const result = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "crc overlays setlist import",
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error("mint refused")

        expect(result.bearer).toMatch(/^crl_read_/)
        expect(result.tokenId).toBeTruthy()
        expect(result.purpose).toBe("crc overlays setlist import")
        expect(result.allowedTools).toEqual([...SETLIST_READER_TOOLS])

        const doc = await db().collection("mcpTokens").doc(result.tokenId).get()
        const data = doc.data()!
        expect(data.uid).toBe(ADMIN_UID)
        expect(data.kind).toBe("setlist_reader")
        expect(data.allowedTools).toEqual([...SETLIST_READER_TOOLS])
        expect(data.purpose).toBe("crc overlays setlist import")
        expect(data.label).toBe("setlist_reader: crc overlays setlist import")
        expect(data.mintedByUid).toBe(ADMIN_UID)
        expect(data.mintedFromTokenId).toBe(root.tokenId)
        expect(data.revokedAt).toBeNull()
        expect(data.lastUsedAt).toBeNull()
        expect(data.tokenHash).toBe(hashToken(result.bearer))

        // The two defining absences.
        expect(data.ttlExpiresAt).toBeUndefined()
        expect(data.parentTokenId).toBeNull()
    })

    // 2. verifyBearer accepts it and reports kind + allowedTools.
    it("verifyBearer accepts the minted credential and reports kind/allowedTools", async () => {
        const root = await seedRootToken()
        const minted = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "verify reports scope probe",
        })
        if (!minted.ok) throw new Error("mint refused")

        const verified = await verifyBearer(bearerReq(minted.bearer))
        expect(verified).toEqual({
            uid: ADMIN_UID,
            tokenId: minted.tokenId,
            parentTokenId: null,
            orgId: "crc",
            kind: "setlist_reader",
            allowedTools: [...SETLIST_READER_TOOLS],
        })
    })

    // 3. Role gate — non-admins refused.
    it("non-admin callers are refused with forbidden_role", async () => {
        const musician = await mintSetlistReaderBearerCore(
            { uid: MUSICIAN_UID, tokenId: "tok-musician", parentTokenId: null, orgId: "crc" },
            { purpose: "musician should not mint this" },
        )
        expect(musician.ok).toBe(false)
        if (!musician.ok) {
            expect(musician.error.machine_code).toBe("forbidden_role")
            expect(musician.error.code).toBe(403)
        }

        const leader = await mintSetlistReaderBearerCore(
            { uid: LEADER_UID, tokenId: "tok-leader", parentTokenId: null, orgId: "crc" },
            { purpose: "band_leader should not mint either" },
        )
        expect(leader.ok).toBe(false)
        if (!leader.ok) expect(leader.error.machine_code).toBe("forbidden_role")
    })

    // 4. Root gate — a minted child cannot mint a service credential.
    it("a minted child bearer cannot mint (root-only)", async () => {
        const result = await mintSetlistReaderBearerCore(
            { uid: ADMIN_UID, tokenId: "child-token", parentTokenId: "some-root", orgId: "crc" },
            { purpose: "child trying to mint a reader" },
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.machine_code).toBe("non_root_bearer_cannot_mint")
            expect(result.error.code).toBe(403)
        }
    })

    // 5. purpose validation.
    it("purpose empty / too short / generic → validation_error", async () => {
        const root = await seedRootToken()
        for (const purpose of ["", "short", "debugging"]) {
            const result = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
                purpose,
            })
            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error.machine_code).toBe("validation_error")
        }
    })

    // 6. Shared rate limit with mint_admin_bearer (same mintedByUid counter).
    it("11th mint of the UTC day is rate_limited (counter shared with mint_admin_bearer)", async () => {
        const root = await seedRootToken()
        await Promise.all(
            Array.from({ length: 10 }, () =>
                db().collection("mcpTokens").add({
                    tokenHash: hashToken(generateRawToken()),
                    uid: ADMIN_UID,
                    mintedByUid: ADMIN_UID,
                    mintedAt: Timestamp.now(),
                    kind: "minted_admin",
                    revokedAt: null,
                }),
            ),
        )
        const result = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "the eleventh mint of the day",
        })
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.machine_code).toBe("rate_limited")
            expect(result.error.code).toBe(429)
        }
    })

    // 7. list — projects provenance, never the hash; admin-only.
    it("list_setlist_reader_bearers projects provenance + never leaks tokenHash", async () => {
        const root = await seedRootToken()
        const a = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "overlays import credential A",
        })
        const b = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "credential B to be revoked",
        })
        if (!a.ok || !b.ok) throw new Error("mint refused")
        await revokeSetlistReaderBearerCore(ADMIN_UID, { tokenId: b.tokenId })

        const active = await listSetlistReaderBearersCore(ADMIN_UID, {})
        if (!active.ok) throw new Error("list refused")
        expect(active.bearers.map((x) => x.tokenId)).toContain(a.tokenId)
        expect(active.bearers.map((x) => x.tokenId)).not.toContain(b.tokenId)
        for (const row of active.bearers) {
            expect(row).not.toHaveProperty("tokenHash")
            expect(row.status).toBe("active")
            expect(row.allowedTools).toEqual([...SETLIST_READER_TOOLS])
            expect(row.mintedFromTokenId).toBe(root.tokenId)
        }

        const all = await listSetlistReaderBearersCore(ADMIN_UID, { includeRevoked: true })
        if (!all.ok) throw new Error("list refused")
        expect(all.bearers.find((x) => x.tokenId === b.tokenId)?.status).toBe("revoked")

        const denied = await listSetlistReaderBearersCore(MUSICIAN_UID, {})
        expect(denied.ok).toBe(false)
        if (!denied.ok) expect(denied.error.machine_code).toBe("forbidden_role")
    })

    // 8. revoke → verifyBearer 401; idempotent; refuses wrong-kind.
    it("revoke kills the credential, is idempotent, and refuses wrong-kind tokenIds", async () => {
        const root = await seedRootToken()
        const minted = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "revocation target credential",
        })
        if (!minted.ok) throw new Error("mint refused")

        // Live before revoke.
        expect(await verifyBearer(bearerReq(minted.bearer))).not.toBeInstanceOf(Response)

        const revoke1 = await revokeSetlistReaderBearerCore(ADMIN_UID, {
            tokenId: minted.tokenId,
        })
        expect(revoke1.ok).toBe(true)

        const rejected = await verifyBearer(bearerReq(minted.bearer))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)

        // Idempotent.
        const revoke2 = await revokeSetlistReaderBearerCore(ADMIN_UID, {
            tokenId: minted.tokenId,
        })
        expect(revoke2.ok).toBe(true)

        // Wrong kind (the root token is not a setlist_reader).
        const wrongKind = await revokeSetlistReaderBearerCore(ADMIN_UID, {
            tokenId: root.tokenId,
        })
        expect(wrongKind.ok).toBe(false)
        if (!wrongKind.ok) {
            expect(wrongKind.error.machine_code).toBe("not_found")
            expect(wrongKind.error.code).toBe(404)
        }

        // Unknown id.
        const missing = await revokeSetlistReaderBearerCore(ADMIN_UID, {
            tokenId: "does-not-exist",
        })
        expect(missing.ok).toBe(false)
        if (!missing.ok) expect(missing.error.machine_code).toBe("not_found")

        // Non-admin cannot revoke.
        const denied = await revokeSetlistReaderBearerCore(MUSICIAN_UID, {
            tokenId: minted.tokenId,
        })
        expect(denied.ok).toBe(false)
        if (!denied.ok) expect(denied.error.machine_code).toBe("forbidden_role")
    })

    // 9. A revoked ROOT does NOT cascade to the reader (it is not a child).
    it("revoking the minting root does NOT kill the reader credential", async () => {
        const root = await seedRootToken()
        const minted = await mintSetlistReaderBearerCore(rootCaller(root.tokenId), {
            purpose: "survives root revocation by design",
        })
        if (!minted.ok) throw new Error("mint refused")

        await db().collection("mcpTokens").doc(root.tokenId).update({
            revokedAt: Timestamp.now(),
        })

        // parentTokenId is null, so verifyBearer's cascade never runs for it.
        const verified = await verifyBearer(bearerReq(minted.bearer))
        expect(verified).not.toBeInstanceOf(Response)
    })
})
