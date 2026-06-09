import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createTemplateFromSetlist,
    cloneSetlistFromTemplate,
} from "../tools/templates"
import { createSetlist } from "../tools/setlist-write"

/**
 * v11-05-01 — emulator coverage for org-scoping the `setlistTemplates` collection.
 *
 * Proves cross-tenant isolation in BOTH directions:
 *  - AC-1: list_templates is filtered to the caller's org
 *  - AC-2: get/update/delete/clone_from_template across tenants hit the SAME
 *          not-found wall (no cross_tenant_denied leak) and never mutate
 *  - AC-3: create / create_from_setlist stamp the caller's org
 *  - create_template_from_setlist walls a cross-tenant SOURCE setlist
 *
 * Runs only via `npm run test:emulator`.
 */
describe("MCP templates org-scoping (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const CRC = "crc"
    const BL = "brotherslazaroff"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-templates-org" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks", "setlistTemplates"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    /** Create one CRC + one BL template; return their ids. */
    async function seedBothOrgs() {
        const crcRes = (await createTemplate(
            ADMIN,
            { name: "CRC Shabbat", templateType: "shabbat-morning" },
            CRC,
        )) as { ok: true; templateId: string }
        const blRes = (await createTemplate(
            ADMIN,
            { name: "BL Set", templateType: "rock-set" },
            BL,
        )) as { ok: true; templateId: string }
        expect(crcRes.ok).toBe(true)
        expect(blRes.ok).toBe(true)
        return { crcId: crcRes.templateId, blId: blRes.templateId }
    }

    it("AC-3: create stamps the caller's org on the template doc", async () => {
        const { crcId, blId } = await seedBothOrgs()
        const crcDoc = (await db().collection("setlistTemplates").doc(crcId).get()).data()
        const blDoc = (await db().collection("setlistTemplates").doc(blId).get()).data()
        expect(crcDoc?.orgId).toBe(CRC)
        expect(blDoc?.orgId).toBe(BL)
    })

    it("AC-1: list_templates returns only the caller-org's templates", async () => {
        const { crcId, blId } = await seedBothOrgs()

        const crcList = (await listTemplates(ADMIN, {}, CRC)) as {
            ok: true
            templates: Array<{ templateId: string }>
        }
        const blList = (await listTemplates(ADMIN, {}, BL)) as {
            ok: true
            templates: Array<{ templateId: string }>
        }
        const crcIds = crcList.templates.map((t) => t.templateId)
        const blIds = blList.templates.map((t) => t.templateId)

        expect(crcIds).toContain(crcId)
        expect(crcIds).not.toContain(blId)
        expect(blIds).toContain(blId)
        expect(blIds).not.toContain(crcId)
    })

    it("AC-2: cross-tenant get_template hits the not-found wall (no leak)", async () => {
        const { blId } = await seedBothOrgs()
        const denied = await getTemplate(ADMIN, blId, CRC)
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "template_not_found" },
        })
        // Same id from the owning org succeeds.
        const ok = (await getTemplate(ADMIN, blId, BL)) as { ok: true; name: string }
        expect(ok.ok).toBe(true)
        expect(ok.name).toBe("BL Set")
    })

    it("AC-2: cross-tenant update_template is walled and does NOT mutate", async () => {
        const { blId } = await seedBothOrgs()
        const before = (await db().collection("setlistTemplates").doc(blId).get()).data()

        const denied = await updateTemplate(
            ADMIN,
            { templateId: blId, patch: { name: "HIJACKED" } },
            CRC,
        )
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "template_not_found" },
        })

        const after = (await db().collection("setlistTemplates").doc(blId).get()).data()
        expect(after?.name).toBe("BL Set")
        expect(after?.version).toBe(before?.version)
    })

    it("AC-2: cross-tenant delete_template is a no-op (doc survives)", async () => {
        const { blId } = await seedBothOrgs()
        const res = (await deleteTemplate(ADMIN, blId, CRC)) as {
            ok: true
            deleted: boolean
        }
        expect(res.ok).toBe(true)
        expect(res.deleted).toBe(false)
        const stillThere = await db().collection("setlistTemplates").doc(blId).get()
        expect(stillThere.exists).toBe(true)
    })

    it("AC-2: cross-tenant clone_setlist_from_template hits the not-found wall", async () => {
        const { blId } = await seedBothOrgs()
        const denied = await cloneSetlistFromTemplate(
            ADMIN,
            { templateId: blId, newName: "Stolen Set" },
            CRC,
        )
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "template_not_found" },
        })
        // Same-org clone succeeds.
        const ok = (await cloneSetlistFromTemplate(
            ADMIN,
            { templateId: blId, newName: "BL Clone" },
            BL,
        )) as { ok: true; setlistId: string }
        expect(ok.ok).toBe(true)
    })

    it("create_template_from_setlist walls a cross-tenant source setlist", async () => {
        const created = (await createSetlist(
            ADMIN,
            { name: "CRC Source Service" },
            CRC,
        )) as { setlistId: string }
        const setlistId = created.setlistId

        // BL caller cannot template-ify a CRC setlist.
        const denied = await createTemplateFromSetlist(
            ADMIN,
            { setlistId, name: "Exfiltrated" },
            BL,
        )
        expect(denied).toMatchObject({
            ok: false,
            error: { machine_code: "setlist_not_found" },
        })

        // Same-org succeeds and stamps the caller org on the new template.
        const ok = (await createTemplateFromSetlist(
            ADMIN,
            { setlistId, name: "CRC Template" },
            CRC,
        )) as { ok: true; templateId: string }
        expect(ok.ok).toBe(true)
        const tplDoc = (await db().collection("setlistTemplates").doc(ok.templateId).get()).data()
        expect(tplDoc?.orgId).toBe(CRC)
    })
})
