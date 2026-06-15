import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// preview_publish delegates to publishSetlist({dryRun}), which touches these
// side-effecting helpers. Mock them so no real send/probe happens; the pure
// contacts CRUD tests don't exercise them.
vi.mock("@/lib/email", () => ({
    emailAllMembers: vi
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, errors: [], messageIds: [] }),
}))
vi.mock("@/lib/push-send", () => ({
    sendPushToUsers: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}))
vi.mock("@/lib/sms", () => ({ sendSMS: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/song-usage", () => ({
    recordSongUsage: vi.fn().mockResolvedValue({ recorded: 0, skipped: 0 }),
}))
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi
        .fn()
        .mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import { listContacts, createContact, deleteContact } from "../tools/contacts"
import { previewPublish } from "../tools/preview-publish"

/**
 * v11.4-03 (D8 item 3) — contacts MCP tools against the Firebase emulator.
 * Covers leader-gated CRUD, email dedupe, the cross-org wall, and the
 * preview_publish savedContacts surfacing.
 */
describe("MCP contacts (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "alex-musician"
    const CRC = "crc"
    const BL = "brotherslazaroff"

    const db = () => getFirestore(app)

    async function seedUser(uid: string, data: Record<string, unknown>) {
        await db().collection("users").doc(uid).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-contacts" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["users", "setlists", "tracks", "contacts"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, { role: "admin", email: "daniel@centralreform.org" })
        await seedUser(MUSICIAN, { role: "musician", email: "alex@example.com" })
    })

    // ─── AC-1: leader CRUD + AC-3 validation/dedupe ─────────────────────────

    it("AC-1: create_contact → list_contacts round-trips with orgId + createdBy", async () => {
        const created = await createContact(
            ADMIN,
            { name: "Jane Guest", email: "jane@example.com" },
            CRC,
        )
        expect("ok" in created && created.ok).toBe(true)
        if (!("ok" in created) || !created.ok) return
        expect(created.created).toBe(true)
        const id = created.contact.id

        const listed = await listContacts(ADMIN, {}, CRC)
        if (!("ok" in listed) || !listed.ok) throw new Error("expected ok")
        expect(listed.contacts.map((c) => c.id)).toContain(id)

        const doc = (await db().collection("contacts").doc(id).get()).data()!
        expect(doc.orgId).toBe(CRC)
        expect(doc.createdBy).toBe(ADMIN)
        expect(doc.name).toBe("Jane Guest")
    })

    it("AC-3: create_contact with neither email nor phone is rejected (no write)", async () => {
        const r = await createContact(ADMIN, { name: "No Handle" }, CRC)
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
        const all = await db().collection("contacts").get()
        expect(all.size).toBe(0)
    })

    it("AC-3: duplicate email in the same org returns the existing contact (no dupe row)", async () => {
        const first = await createContact(
            ADMIN,
            { name: "Jane", email: "JANE@example.com" },
            CRC,
        )
        if (!("ok" in first) || !first.ok) throw new Error("expected ok")
        const second = await createContact(
            ADMIN,
            { name: "Jane Again", email: "jane@example.com" },
            CRC,
        )
        if (!("ok" in second) || !second.ok) throw new Error("expected ok")
        expect(second.created).toBe(false)
        expect(second.contact.id).toBe(first.contact.id)
        const all = await db().collection("contacts").where("orgId", "==", CRC).get()
        expect(all.size).toBe(1)
    })

    // ─── AC-2: tenant isolation ─────────────────────────────────────────────

    it("AC-2: list_contacts is org-scoped; a contact under one org is invisible to the other", async () => {
        const crc = await createContact(ADMIN, { name: "CRC Guest", email: "c@x.com" }, CRC)
        await createContact(ADMIN, { name: "BL Guest", email: "b@x.com" }, BL)
        if (!("ok" in crc) || !crc.ok) throw new Error("expected ok")

        const crcList = await listContacts(ADMIN, {}, CRC)
        const blList = await listContacts(ADMIN, {}, BL)
        if (!("ok" in crcList) || !crcList.ok) throw new Error("expected ok")
        if (!("ok" in blList) || !blList.ok) throw new Error("expected ok")
        expect(crcList.contacts.map((c) => c.name)).toEqual(["CRC Guest"])
        expect(blList.contacts.map((c) => c.name)).toEqual(["BL Guest"])

        // delete of a crc id under the BL scope → not_found; crc doc survives.
        const del = await deleteContact(ADMIN, { id: crc.contact.id }, BL)
        expect(del).toMatchObject({
            ok: false,
            error: { machine_code: "contact_not_found" },
        })
        expect((await db().collection("contacts").doc(crc.contact.id).get()).exists).toBe(true)

        // delete under the correct org succeeds.
        const del2 = await deleteContact(ADMIN, { id: crc.contact.id }, CRC)
        expect("ok" in del2 && del2.ok).toBe(true)
        expect((await db().collection("contacts").doc(crc.contact.id).get()).exists).toBe(false)
    })

    // ─── M-11 (v11.5-04-01): contact_not_found carries HTTP-like code 404 ────

    it("M-11: a missing contact returns contact_not_found with code 404 (not 500)", async () => {
        // Missing doc in the caller's own org → not_found envelope.
        const del = await deleteContact(ADMIN, { id: "does-not-exist" }, CRC)
        expect(del).toMatchObject({
            ok: false,
            error: { machine_code: "contact_not_found", code: 404 },
        })
        // Cross-org wall: a real other-org id is indistinguishable from missing —
        // same code, same machine_code, no existence leak.
        const blOnly = await createContact(ADMIN, { name: "BL Only", email: "bl@x.com" }, BL)
        if (!("ok" in blOnly) || !blOnly.ok) throw new Error("expected ok")
        const crossOrg = await deleteContact(ADMIN, { id: blOnly.contact.id }, CRC)
        expect(crossOrg).toMatchObject({
            ok: false,
            error: { machine_code: "contact_not_found", code: 404 },
        })
    })

    // ─── AC-1: non-leader refused ───────────────────────────────────────────

    it("AC-1: a non-leader (musician) is refused on create/list/delete", async () => {
        for (const r of [
            await createContact(MUSICIAN, { name: "X", email: "x@x.com" }, CRC),
            await listContacts(MUSICIAN, {}, CRC),
            await deleteContact(MUSICIAN, { id: "anything" }, CRC),
        ]) {
            expect("ok" in r && (r as { ok?: boolean }).ok).not.toBe(true)
            expect(
                (r as { error?: { machine_code?: string } }).error?.machine_code,
            ).toBe("forbidden_role")
        }
    })

    // ─── AC-4: preview_publish surfaces the org's saved contacts ────────────

    it("AC-4: preview_publish returns the caller-org's savedContacts (and not another org's)", async () => {
        // A publishable crc setlist.
        await db().collection("setlists").doc("sl-crc").set({
            name: "Shabbat Morning",
            ownerId: ADMIN,
            orgId: CRC,
            trackCount: 1,
        })
        await db().collection("tracks").doc("t1").set({
            setlistId: "sl-crc",
            order: 0,
            type: "song",
            title: "Oseh Shalom",
            fileId: "upload-oseh",
        })
        await createContact(ADMIN, { name: "CRC Guest", email: "c@x.com" }, CRC)
        await createContact(ADMIN, { name: "BL Guest", email: "b@x.com" }, BL)

        const r = await previewPublish(ADMIN, { setlistId: "sl-crc" }, CRC)
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return
        expect(r.savedContacts.map((c) => c.name)).toEqual(["CRC Guest"])
        expect(r.savedContacts.map((c) => c.name)).not.toContain("BL Guest")
        // savedContacts is informational — recommendation gate unaffected.
        expect(r.recommendation).toBe("publish")
    })
})
