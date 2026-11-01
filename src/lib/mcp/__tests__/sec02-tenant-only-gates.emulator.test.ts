import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { getAiConfig } from "@/lib/mcp/tools/ai-config"
import { _assertAdminForTests as bridgeRecoveryAdmin } from "@/lib/mcp/tools/bridge-recovery"
import { _assertAdminForTests as bridgeHousekeepingAdmin } from "@/lib/mcp/tools/bridge-housekeeping"

/**
 * SEC-02: the MCP editor gate and the admin gates on the AI-config and bridge
 * tools read the caller's MEMBERSHIP in the request's tenant only. The legacy,
 * tenant-blind `users/{uid}.role` never authorises, migrated or not.
 */
describe("SEC-02 tenant-only MCP role gates (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const CRC = "crc"
    const BL = "brotherslazaroff"

    const LEGACY_ADMIN = "sec02-legacy-admin" // users.role admin, no membership, not migrated
    const CRC_ADMIN = "sec02-crc-admin" // admin membership in crc only
    const CRC_EDITOR = "sec02-crc-editor" // band_leader membership in crc

    async function member(uid: string, org: string, role: string) {
        await db().collection("memberships").doc(`${org}__${uid}`).set({
            uid,
            tenantId: org,
            role,
            soundEngineer: false,
            addedBy: "test-account",
        })
    }

    const code = (r: unknown) =>
        (r as { error?: { machine_code?: string } }).error?.machine_code

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-sec02-gates" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["memberships", "users", "platform"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        __resetPlatformOwnerMemo()
        // Everyone carries the legacy admin role on the users doc; only the
        // membership may decide.
        for (const uid of [LEGACY_ADMIN, CRC_ADMIN, CRC_EDITOR]) {
            await db().collection("users").doc(uid).set({ role: "admin" })
        }
        await member(CRC_ADMIN, CRC, "admin")
        await member(CRC_EDITOR, CRC, "band_leader")
    })

    it("(a) a legacy users.role admin with no membership is denied by every gate", async () => {
        const gates = [
            await assertEditor(db(), LEGACY_ADMIN, CRC),
            await getAiConfig(LEGACY_ADMIN, CRC),
            await bridgeRecoveryAdmin(db(), LEGACY_ADMIN, CRC),
            await bridgeHousekeepingAdmin(db(), LEGACY_ADMIN, "bridge_get_log", CRC),
        ]
        for (const g of gates) {
            expect((g as { ok: boolean }).ok).toBe(false)
            expect(code(g)).toBe("forbidden_role")
            expect((g as { callerRole?: unknown }).callerRole).toBeNull()
        }
    })

    it("(b) an admin of tenant A does not pass the gates for tenant B", async () => {
        expect((await assertEditor(db(), CRC_ADMIN, CRC)).ok).toBe(true)
        expect((await getAiConfig(CRC_ADMIN, CRC)) as { ok: boolean }).toMatchObject({ ok: true })
        expect((await bridgeRecoveryAdmin(db(), CRC_ADMIN, CRC)).ok).toBe(true)

        const gates = [
            await assertEditor(db(), CRC_ADMIN, BL),
            await getAiConfig(CRC_ADMIN, BL),
            await bridgeRecoveryAdmin(db(), CRC_ADMIN, BL),
            await bridgeHousekeepingAdmin(db(), CRC_ADMIN, "bridge_get_log", BL),
        ]
        for (const g of gates) {
            expect((g as { ok: boolean }).ok).toBe(false)
            expect(code(g)).toBe("forbidden_role")
        }
    })

    it("(c) a normal band_leader member still passes the editor gate, not the admin gates", async () => {
        expect((await assertEditor(db(), CRC_EDITOR, CRC)).ok).toBe(true)
        expect(code(await getAiConfig(CRC_EDITOR, CRC))).toBe("forbidden_role")
        expect(code(await bridgeRecoveryAdmin(db(), CRC_EDITOR, CRC))).toBe("forbidden_role")
    })

    it("a platform owner keeps admin in every tenant (deliberate grant, not the legacy path)", async () => {
        await db().collection("platform").doc("owners").set({ uids: [LEGACY_ADMIN] })
        __resetPlatformOwnerMemo()
        expect((await assertEditor(db(), LEGACY_ADMIN, BL)).ok).toBe(true)
        expect((await bridgeRecoveryAdmin(db(), LEGACY_ADMIN, BL)).ok).toBe(true)
    })
})
