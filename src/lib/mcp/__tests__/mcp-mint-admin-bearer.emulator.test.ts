import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    mintAdminBearerCore,
    listMintedBearersCore,
    revokeMintedBearerCore,
} from "../tools/mint-admin-bearer"
import { verifyBearer } from "../auth"
import { generateRawToken, hashToken } from "../tokens"

/**
 * Emulator coverage for the programmatic admin-bearer mint pack
 * (`mint_admin_bearer` + `list_minted_bearers` + `revoke_minted_bearer`)
 * and the `verifyBearer` root-revocation cascade that backs the depth-1
 * security model. Mirrors the test-tokens harness: a manually-initialized
 * default app (reused by `@/lib/firebase-admin.initAdmin` via getApps()[0])
 * namespaced to this file's projectId.
 */
describe("MCP mint_admin_bearer (emulator)", () => {
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

    /** Create a real ROOT admin token doc; returns {tokenId, rawToken}. */
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
        // v11-02-01: callers now carry orgId; root admin acts as crc here.
        return { uid, tokenId, parentTokenId: null as string | null, orgId: "crc" }
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-mint-admin-bearer" })
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

    // 1. Happy path — root admin mints; raw bearer returned + correct provenance.
    it("root admin mints a bearer; doc has correct provenance", async () => {
        const root = await seedRootToken()
        const result = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "cycle-8 coder probe bearer",
            ttlSec: 3600,
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error("mint refused")

        expect(result.bearer).toMatch(/^crl_live_/)
        expect(result.tokenId).toBeTruthy()
        expect(result.purpose).toBe("cycle-8 coder probe bearer")
        expect(result.ttlExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        const doc = await db().collection("mcpTokens").doc(result.tokenId).get()
        const data = doc.data()!
        expect(data.uid).toBe(ADMIN_UID)
        expect(data.parentTokenId).toBe(root.tokenId)
        expect(data.mintedByUid).toBe(ADMIN_UID)
        expect(data.kind).toBe("minted_admin")
        expect(data.purpose).toBe("cycle-8 coder probe bearer")
        expect(data.revokedAt).toBeNull()
        expect(data.tokenHash).toBe(hashToken(result.bearer))
    })

    // 2. Minted child resolves to admin via verifyBearer (uid inheritance).
    it("minted child bearer verifies to the admin uid + carries parentTokenId", async () => {
        const root = await seedRootToken()
        const result = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "uid inheritance probe",
        })
        if (!result.ok) throw new Error("mint refused")

        const verified = await verifyBearer(bearerReq(result.bearer))
        expect(verified).toEqual({
            uid: ADMIN_UID,
            tokenId: result.tokenId,
            parentTokenId: root.tokenId,
            // v11-02-01 added orgId to verifyBearer's return; a minted token with
            // no orgId field defaults to DEFAULT_ORG_ID ("crc").
            orgId: "crc",
        })
        // uid inheritance: the child shares the admin uid, so users/{uid}.role
        // === admin makes it an admin bearer.
        expect((await db().collection("users").doc(ADMIN_UID).get()).data()?.role).toBe("admin")
    })

    // 3. Role gate — non-admin (musician AND band_leader) → forbidden_role.
    it("non-admin caller is refused with forbidden_role", async () => {
        const musician = await mintAdminBearerCore(
            { uid: MUSICIAN_UID, tokenId: "tok-musician", parentTokenId: null, orgId: "crc" },
            { purpose: "should not mint" },
        )
        expect(musician.ok).toBe(false)
        if (!musician.ok) {
            expect(musician.error.machine_code).toBe("forbidden_role")
            expect(musician.error.code).toBe(403)
        }

        const leader = await mintAdminBearerCore(
            { uid: LEADER_UID, tokenId: "tok-leader", parentTokenId: null, orgId: "crc" },
            { purpose: "band_leader should not mint either" },
        )
        expect(leader.ok).toBe(false)
        if (!leader.ok) expect(leader.error.machine_code).toBe("forbidden_role")
    })

    // 4. Root gate — a minted child calling mint → non_root_bearer_cannot_mint.
    it("a minted child cannot mint (depth capped at 1)", async () => {
        const result = await mintAdminBearerCore(
            { uid: ADMIN_UID, tokenId: "child-token", parentTokenId: "some-root", orgId: "crc" },
            { purpose: "child trying to mint a grandchild" },
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.machine_code).toBe("non_root_bearer_cannot_mint")
            expect(result.error.code).toBe(403)
            expect((result as unknown as { parentTokenId: string }).parentTokenId).toBe("some-root")
        }
    })

    // 5. Rate-limit — 11th mint in a UTC day → rate_limited.
    it("11th mint in a UTC day is rate_limited", async () => {
        const root = await seedRootToken()
        // Seed 10 of today's mints by ADMIN_UID.
        await Promise.all(
            Array.from({ length: 10 }, () =>
                db().collection("mcpTokens").add({
                    tokenHash: hashToken(generateRawToken()),
                    uid: ADMIN_UID,
                    parentTokenId: root.tokenId,
                    mintedByUid: ADMIN_UID,
                    mintedAt: Timestamp.now(),
                    kind: "minted_admin",
                    revokedAt: null,
                }),
            ),
        )
        const result = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "the eleventh mint of the day",
        })
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error.machine_code).toBe("rate_limited")
            expect(result.error.code).toBe(429)
            expect((result as unknown as { mintsToday: number }).mintsToday).toBe(10)
        }
    })

    // 6. TTL clamp — out of range → validation_error; default applied when omitted.
    it("ttlSec out of range → validation_error; default 7d applied when omitted", async () => {
        const root = await seedRootToken()
        const tooShort = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "ttl too short test",
            ttlSec: 1800,
        })
        expect(tooShort.ok).toBe(false)
        if (!tooShort.ok) expect(tooShort.error.machine_code).toBe("validation_error")

        const tooLong = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "ttl too long test",
            ttlSec: 99_999_999,
        })
        expect(tooLong.ok).toBe(false)
        if (!tooLong.ok) expect(tooLong.error.machine_code).toBe("validation_error")

        const defaulted = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "ttl default applied probe",
        })
        if (!defaulted.ok) throw new Error("mint refused")
        const expiresMs = Date.parse(defaulted.ttlExpiresAt)
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        // within 60s of now+7d
        expect(Math.abs(expiresMs - (Date.now() + sevenDaysMs))).toBeLessThan(60_000)
    })

    // 7. purpose validation — empty / <8 chars / generic word → validation_error.
    it("purpose empty / too short / generic → validation_error", async () => {
        const root = await seedRootToken()
        for (const purpose of ["", "short", "debugging"]) {
            const result = await mintAdminBearerCore(rootCaller(root.tokenId), { purpose })
            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error.machine_code).toBe("validation_error")
        }
    })

    // 8. Root-revocation cascade — revoke ROOT; child fails verifyBearer.
    it("revoking the root bearer cascades to kill the child (critical security property)", async () => {
        const root = await seedRootToken()
        const minted = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "cascade victim child bearer",
        })
        if (!minted.ok) throw new Error("mint refused")

        // Child works while root is live.
        expect(await verifyBearer(bearerReq(minted.bearer))).toEqual({
            uid: ADMIN_UID,
            tokenId: minted.tokenId,
            parentTokenId: root.tokenId,
            orgId: "crc", // v11-02-01: verifyBearer now returns orgId (default crc)
        })

        // Daniel revokes the ROOT (simulated via /settings/mcp soft-delete).
        await db().collection("mcpTokens").doc(root.tokenId).update({
            revokedAt: Timestamp.now(),
        })

        const rejected = await verifyBearer(bearerReq(minted.bearer))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)
    })

    // 9. list_minted_bearers — returns minted tokens, never tokenHash; status correct.
    it("list_minted_bearers projects status + never leaks tokenHash", async () => {
        const root = await seedRootToken()
        const a = await mintAdminBearerCore(rootCaller(root.tokenId), { purpose: "list probe active one" })
        const b = await mintAdminBearerCore(rootCaller(root.tokenId), { purpose: "list probe to revoke" })
        if (!a.ok || !b.ok) throw new Error("mint refused")
        await revokeMintedBearerCore(ADMIN_UID, { tokenId: b.tokenId })

        const active = await listMintedBearersCore(ADMIN_UID, {})
        if (!active.ok) throw new Error("list refused")
        expect(active.bearers.map((x) => x.tokenId)).toContain(a.tokenId)
        expect(active.bearers.map((x) => x.tokenId)).not.toContain(b.tokenId)
        for (const row of active.bearers) {
            expect(row).not.toHaveProperty("tokenHash")
            expect(row.status).toBe("active")
        }

        const all = await listMintedBearersCore(ADMIN_UID, { includeRevoked: true })
        if (!all.ok) throw new Error("list refused")
        const revokedRow = all.bearers.find((x) => x.tokenId === b.tokenId)
        expect(revokedRow?.status).toBe("revoked")

        // non-admin cannot list
        const denied = await listMintedBearersCore(MUSICIAN_UID, {})
        expect(denied.ok).toBe(false)
        if (!denied.ok) expect(denied.error.machine_code).toBe("forbidden_role")
    })

    // 9b. list_minted_bearers — C9I5-002: a child of a REVOKED root is derived
    //     as `parent_revoked` (cascade-dead), surfaced even without flags,
    //     instead of misleadingly showing `active`.
    it("list_minted_bearers derives parent_revoked for children of a revoked root", async () => {
        const root = await seedRootToken()
        const child = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "cascade-dead audit-view child",
        })
        if (!child.ok) throw new Error("mint refused")

        // While the root is live, the child reads as active.
        const live = await listMintedBearersCore(ADMIN_UID, {})
        if (!live.ok) throw new Error("list refused")
        expect(live.bearers.find((x) => x.tokenId === child.tokenId)?.status).toBe(
            "active",
        )

        // Daniel revokes the ROOT (via /settings/mcp soft-delete). The child's
        // OWN revokedAt stays null + its OWN TTL is still live...
        await db().collection("mcpTokens").doc(root.tokenId).update({
            revokedAt: Timestamp.now(),
        })

        // ...but the audit view now derives parent_revoked, AND surfaces it by
        // default (no includeRevoked flag) — that's the headline of the fix.
        const after = await listMintedBearersCore(ADMIN_UID, {})
        if (!after.ok) throw new Error("list refused")
        const row = after.bearers.find((x) => x.tokenId === child.tokenId)
        expect(row?.status).toBe("parent_revoked")
        expect(row?.revokedAt).toBeNull() // own revokedAt untouched — derived only
    })

    // 9c. list_minted_bearers — a missing parent also cascades to parent_revoked.
    it("list_minted_bearers derives parent_revoked when the root doc is gone", async () => {
        const root = await seedRootToken()
        const child = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "orphaned-parent audit child",
        })
        if (!child.ok) throw new Error("mint refused")

        // Hard-delete the root doc (parent missing — mirrors verifyBearer's
        // !parentSnap.exists branch).
        await db().collection("mcpTokens").doc(root.tokenId).delete()

        const after = await listMintedBearersCore(ADMIN_UID, {})
        if (!after.ok) throw new Error("list refused")
        expect(after.bearers.find((x) => x.tokenId === child.tokenId)?.status).toBe(
            "parent_revoked",
        )
    })

    // 10. revoke_minted_bearer — stamps revokedAt; child fails after; idempotent;
    //     refuses non-minted-kind tokenId.
    it("revoke_minted_bearer revokes + is idempotent + refuses wrong-kind", async () => {
        const root = await seedRootToken()
        const minted = await mintAdminBearerCore(rootCaller(root.tokenId), {
            purpose: "revoke target child bearer",
        })
        if (!minted.ok) throw new Error("mint refused")

        const revoke1 = await revokeMintedBearerCore(ADMIN_UID, { tokenId: minted.tokenId })
        expect(revoke1.ok).toBe(true)
        if (revoke1.ok) expect(revoke1.revoked).toBe(true)

        // child fails verify after revoke
        const rejected = await verifyBearer(bearerReq(minted.bearer))
        expect(rejected).toBeInstanceOf(Response)
        expect((rejected as Response).status).toBe(401)

        // idempotent
        const revoke2 = await revokeMintedBearerCore(ADMIN_UID, { tokenId: minted.tokenId })
        expect(revoke2.ok).toBe(true)

        // refuses a non-minted-kind tokenId (the root token is not minted_admin)
        const wrongKind = await revokeMintedBearerCore(ADMIN_UID, { tokenId: root.tokenId })
        expect(wrongKind.ok).toBe(false)
        if (!wrongKind.ok) {
            expect(wrongKind.error.machine_code).toBe("not_found")
            expect(wrongKind.error.code).toBe(404)
        }

        // refuses a wholly-unknown tokenId
        const missing = await revokeMintedBearerCore(ADMIN_UID, { tokenId: "does-not-exist" })
        expect(missing.ok).toBe(false)
        if (!missing.ok) expect(missing.error.machine_code).toBe("not_found")
    })
})
