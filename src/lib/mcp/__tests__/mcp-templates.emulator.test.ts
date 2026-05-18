import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    cloneSetlistFromTemplate,
} from "../tools/templates"

/**
 * Cycle-6 Lane 2 — emulator coverage for the setlist-template CRUD pack.
 *
 * Covers the 7 REPRO-L2 contracts:
 *  - create_template happy path → setlistTemplates doc + ownerId + version:1
 *  - list_templates returns summary rows in updatedAt-desc order
 *  - get_template returns full track payload
 *  - update_template is idempotent (no-change patch returns changed:false;
 *    real change bumps version)
 *  - delete_template is idempotent (not-found returns deleted:false)
 *  - clone_setlist_from_template creates a setlist + tracks with fresh ids
 *  - role-gate refuses musician + member callers via forbidden_role
 *
 * Runs only via `npm run test:emulator`.
 */
describe("MCP templates CRUD (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "randy"
    const MUSICIAN = "guest-musician"
    const MEMBER = "anon-member"

    function db() {
        return getFirestore(app)
    }

    async function tracksOf(setlistId: string) {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => ({
                id: d.id,
                data: d.data() as unknown as Record<string, unknown>,
            }))
            .sort(
                (a, b) =>
                    (a.data.order as number) - (b.data.order as number),
            )
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-templates" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ displayName: "Randy", role: "band_leader" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ displayName: "Guest Musician", role: "musician" })
        await db()
            .collection("users")
            .doc(MEMBER)
            .set({ displayName: "Anon Member", role: "member" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlistTemplates", "setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // ─── REPRO-L2-create-template ─────────────────────────────────────────
    it("create_template writes a Firestore doc with version:1 and trackCount", async () => {
        const result = (await createTemplate(ADMIN, {
            name: "Test Shabbat Morning",
            templateType: "shabbat-morning",
            tracks: [
                { type: "song", title: "Hashkiveinu", key: "D" },
                { type: "header", title: "Torah Service" },
                { type: "song", title: "Oseh Shalom", key: "G", fileId: "song-oseh" },
            ],
        })) as {
            ok: true
            templateId: string
            name: string
            templateType: string | null
            ownerId: string
            ownerName: string
            trackCount: number
            version: 1
        }
        expect(result.ok).toBe(true)
        expect(result.templateId).toBeTruthy()
        expect(result.name).toBe("Test Shabbat Morning")
        expect(result.templateType).toBe("shabbat-morning")
        expect(result.ownerId).toBe(ADMIN)
        expect(result.trackCount).toBe(3)
        expect(result.version).toBe(1)

        const doc = (
            await db().collection("setlistTemplates").doc(result.templateId).get()
        ).data() as Record<string, unknown>
        expect(doc.name).toBe("Test Shabbat Morning")
        expect(doc.templateType).toBe("shabbat-morning")
        expect(doc.ownerId).toBe(ADMIN)
        expect(doc.version).toBe(1)
        expect(Array.isArray(doc.tracks)).toBe(true)
        expect((doc.tracks as unknown[]).length).toBe(3)
    })

    it("create_template defaults tracks to [] when omitted", async () => {
        const result = (await createTemplate(LEADER, {
            name: "Empty Shir Shabbat",
            templateType: "shir-shabbat",
        })) as { ok: true; templateId: string; trackCount: number }
        expect(result.trackCount).toBe(0)
        const doc = (
            await db()
                .collection("setlistTemplates")
                .doc(result.templateId)
                .get()
        ).data() as Record<string, unknown>
        expect(doc.tracks).toEqual([])
    })

    it("create_template rejects empty name", async () => {
        const result = await createTemplate(ADMIN, { name: "  " })
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "invalid_argument",
                message: expect.stringMatching(/name.+is required/i),
            },
        })
    })

    // ─── REPRO-L2-list-templates ──────────────────────────────────────────
    it("list_templates returns summaries sorted by updatedAt desc", async () => {
        const first = (await createTemplate(ADMIN, {
            name: "Shabbat Morning A",
            templateType: "shabbat-morning",
            tracks: [{ type: "song", title: "A1" }],
        })) as { templateId: string }
        // Tiny gap so the second doc's serverTimestamp is strictly later.
        await new Promise((r) => setTimeout(r, 25))
        const second = (await createTemplate(LEADER, {
            name: "B'nai Mitzvah B",
            templateType: "bnai-mitzvah",
            tracks: [
                { type: "song", title: "B1" },
                { type: "song", title: "B2" },
            ],
        })) as { templateId: string }

        const result = (await listTemplates(ADMIN, {})) as {
            ok: true
            templates: Array<{
                templateId: string
                name: string
                templateType: string | null
                trackCount: number
                ownerId: string
            }>
            total: number
        }
        expect(result.ok).toBe(true)
        expect(result.total).toBe(2)
        // Most-recently-updated first → second comes before first.
        expect(result.templates[0].templateId).toBe(second.templateId)
        expect(result.templates[0].trackCount).toBe(2)
        expect(result.templates[0].ownerId).toBe(LEADER)
        expect(result.templates[1].templateId).toBe(first.templateId)
        expect(result.templates[1].trackCount).toBe(1)
    })

    it("list_templates honors templateType + ownerUid filters", async () => {
        await createTemplate(ADMIN, {
            name: "Morning A",
            templateType: "shabbat-morning",
        })
        await createTemplate(LEADER, {
            name: "Morning B",
            templateType: "shabbat-morning",
        })
        await createTemplate(ADMIN, {
            name: "Bnai Mitzvah",
            templateType: "bnai-mitzvah",
        })
        const filtered = (await listTemplates(ADMIN, {
            templateType: "shabbat-morning",
            ownerUid: ADMIN,
        })) as { ok: true; templates: Array<{ name: string }> }
        expect(filtered.templates.map((t) => t.name)).toEqual(["Morning A"])
    })

    // ─── REPRO-L2 get_template ────────────────────────────────────────────
    it("get_template returns full track payload", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Shir Shabbat Source",
            templateType: "shir-shabbat",
            serviceNotes: "Pastoral notes here",
            tracks: [
                {
                    type: "song",
                    title: "Yedid Nefesh",
                    key: "D",
                    bpm: 80,
                    leadMusician: "Vocal: Daniel",
                    fileId: "yedid-nefesh",
                    fileName: "Yedid Nefesh.pdf",
                },
            ],
        })) as { templateId: string }
        const result = (await getTemplate(ADMIN, created.templateId)) as unknown as {
            ok: true
            name: string
            templateType: string | null
            serviceNotes: string | null
            tracks: Array<Record<string, unknown>>
            version: number
        }
        expect(result.ok).toBe(true)
        expect(result.name).toBe("Shir Shabbat Source")
        expect(result.templateType).toBe("shir-shabbat")
        expect(result.serviceNotes).toBe("Pastoral notes here")
        expect(result.version).toBe(1)
        expect(result.tracks).toHaveLength(1)
        expect(result.tracks[0]).toMatchObject({
            type: "song",
            title: "Yedid Nefesh",
            key: "D",
            bpm: 80,
            leadMusician: "Vocal: Daniel",
            fileId: "yedid-nefesh",
            fileName: "Yedid Nefesh.pdf",
        })
    })

    it("get_template surfaces not-found via rich envelope", async () => {
        const result = await getTemplate(ADMIN, "no-such-template")
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "template_not_found",
                message: expect.stringMatching(/not found/i),
            },
        })
    })

    // ─── REPRO-L2-update-template (idempotency contract) ──────────────────
    it("update_template is idempotent — no-change patch returns changed:false", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Original Name",
            templateType: "shabbat-morning",
            tracks: [{ type: "song", title: "A" }],
        })) as { templateId: string }

        // First patch with a real change.
        const changed = (await updateTemplate(ADMIN, {
            templateId: created.templateId,
            patch: {
                name: "Renamed Template",
                serviceNotes: "added notes",
            },
        })) as { ok: true; changed: boolean; version: number }
        expect(changed.changed).toBe(true)
        expect(changed.version).toBe(2)

        const docAfterFirst = (
            await db()
                .collection("setlistTemplates")
                .doc(created.templateId)
                .get()
        ).data() as Record<string, unknown>
        expect(docAfterFirst.name).toBe("Renamed Template")
        expect(docAfterFirst.serviceNotes).toBe("added notes")
        expect(docAfterFirst.version).toBe(2)

        // Re-run the SAME patch — should be a no-op.
        const idempotent = (await updateTemplate(ADMIN, {
            templateId: created.templateId,
            patch: {
                name: "Renamed Template",
                serviceNotes: "added notes",
            },
        })) as { ok: true; changed: boolean; version: number }
        expect(idempotent.changed).toBe(false)
        expect(idempotent.version).toBe(2)
    })

    it("update_template tracks-replacement bumps version", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Original",
            tracks: [{ type: "song", title: "Old" }],
        })) as { templateId: string }
        const result = (await updateTemplate(ADMIN, {
            templateId: created.templateId,
            patch: {
                tracks: [
                    { type: "song", title: "New 1" },
                    { type: "song", title: "New 2" },
                ],
            },
        })) as { ok: true; changed: boolean; version: number }
        expect(result.changed).toBe(true)
        expect(result.version).toBe(2)
        const doc = (
            await db()
                .collection("setlistTemplates")
                .doc(created.templateId)
                .get()
        ).data() as Record<string, unknown>
        const tracks = doc.tracks as Array<Record<string, unknown>>
        expect(tracks).toHaveLength(2)
        expect(tracks[1].title).toBe("New 2")
    })

    it("update_template surfaces not-found for unknown templateId", async () => {
        const result = await updateTemplate(ADMIN, {
            templateId: "no-such-template",
            patch: { name: "X" },
        })
        expect(result).toMatchObject({
            ok: false,
            error: { machine_code: "template_not_found" },
        })
    })

    // ─── REPRO-L2-delete-template (idempotency contract) ──────────────────
    it("delete_template is idempotent — re-run on already-gone returns deleted:false", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Throwaway",
        })) as { templateId: string }
        const first = (await deleteTemplate(ADMIN, created.templateId)) as {
            ok: true
            templateId: string
            deleted: boolean
        }
        expect(first.deleted).toBe(true)
        // Re-run — still ok:true but deleted:false.
        const second = (await deleteTemplate(ADMIN, created.templateId)) as {
            ok: true
            deleted: boolean
        }
        expect(second.deleted).toBe(false)
        // Doc actually gone.
        const exists = (
            await db()
                .collection("setlistTemplates")
                .doc(created.templateId)
                .get()
        ).exists
        expect(exists).toBe(false)
    })

    // ─── REPRO-L2-clone-from-template ─────────────────────────────────────
    it("clone_setlist_from_template builds a new setlist + tracks with fresh ids", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Source Template",
            templateType: "shabbat-morning",
            serviceNotes: "Pastoral",
            tracks: [
                {
                    type: "song",
                    title: "Hashkiveinu",
                    key: "D",
                    fileId: "song-hashkiveinu",
                    fileName: "Hashkiveinu.pdf",
                },
                { type: "header", title: "Torah" },
                {
                    type: "song",
                    title: "Oseh Shalom",
                    leadMusician: "Vocal: Daniel",
                },
            ],
        })) as { templateId: string }

        const result = (await cloneSetlistFromTemplate(LEADER, {
            templateId: created.templateId,
            newName: "2026-05-23 Shir Shabbat",
            newEventDate: "2026-05-23",
        })) as {
            ok: true
            setlistId: string
            sourceTemplateId: string
            trackCount: number
            ownerId: string
            version: 1
        }
        expect(result.ok).toBe(true)
        expect(result.sourceTemplateId).toBe(created.templateId)
        expect(result.trackCount).toBe(3)
        expect(result.ownerId).toBe(LEADER)
        expect(result.version).toBe(1)

        const setlistDoc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as Record<string, unknown>
        expect(setlistDoc.name).toBe("2026-05-23 Shir Shabbat")
        expect(setlistDoc.ownerId).toBe(LEADER)
        expect(setlistDoc.sourceTemplateId).toBe(created.templateId)
        expect(setlistDoc.templateType).toBe("shabbat-morning")
        expect(setlistDoc.serviceNotes).toBe("Pastoral")
        expect(setlistDoc.eventDate).toBeInstanceOf(Timestamp)
        expect(setlistDoc.version).toBe(1)
        expect(setlistDoc.fileIds).toEqual(["song-hashkiveinu"])

        const tracks = await tracksOf(result.setlistId)
        expect(tracks).toHaveLength(3)
        expect(tracks.map((t) => t.data.order)).toEqual([0, 1, 2])
        for (const t of tracks) {
            expect(t.data.version).toBe(1)
            expect(t.data.setlistId).toBe(result.setlistId)
        }
        // Chart bond carried verbatim.
        const hash = tracks.find((t) => t.data.title === "Hashkiveinu")?.data
        expect(hash?.fileId).toBe("song-hashkiveinu")
        expect(hash?.fileName).toBe("Hashkiveinu.pdf")
    })

    it("clone_setlist_from_template copyServiceNotes:false strips the template's notes", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Template with notes",
            serviceNotes: "These should not travel",
        })) as { templateId: string }
        const result = (await cloneSetlistFromTemplate(ADMIN, {
            templateId: created.templateId,
            newName: "Clean clone",
            copyServiceNotes: false,
        })) as { ok: true; setlistId: string }
        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as Record<string, unknown>
        expect(doc.serviceNotes).toBeUndefined()
    })

    it("clone_setlist_from_template surfaces template_not_found", async () => {
        const result = await cloneSetlistFromTemplate(ADMIN, {
            templateId: "no-such-template",
            newName: "doomed",
        })
        expect(result).toMatchObject({
            ok: false,
            error: { machine_code: "template_not_found" },
        })
    })

    it("clone_setlist_from_template rejects empty newName", async () => {
        const created = (await createTemplate(ADMIN, {
            name: "Has name",
        })) as { templateId: string }
        const result = await cloneSetlistFromTemplate(ADMIN, {
            templateId: created.templateId,
            newName: "   ",
        })
        expect(result).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    // ─── REPRO-L2-role-gate ───────────────────────────────────────────────
    it("musician callers are rejected via forbidden_role on every tool", async () => {
        // Seed a template so the not-found path doesn't preempt the role gate
        // on read-side tools — but the role gate happens BEFORE the existence
        // check inside each tool, so the template doesn't strictly matter.
        const seeded = (await createTemplate(ADMIN, {
            name: "Seeded",
        })) as { templateId: string }

        for (const op of [
            () => listTemplates(MUSICIAN, {}),
            () => getTemplate(MUSICIAN, seeded.templateId),
            () => createTemplate(MUSICIAN, { name: "nope" }),
            () =>
                updateTemplate(MUSICIAN, {
                    templateId: seeded.templateId,
                    patch: { name: "nope" },
                }),
            () => deleteTemplate(MUSICIAN, seeded.templateId),
            () =>
                cloneSetlistFromTemplate(MUSICIAN, {
                    templateId: seeded.templateId,
                    newName: "nope",
                }),
        ]) {
            const result = await op()
            expect(result).toMatchObject({
                ok: false,
                error: {
                    machine_code: "forbidden_role",
                    message: expect.stringMatching(/admin or band leader/i),
                },
            })
        }
    })

    it("member callers are also rejected via forbidden_role", async () => {
        const result = await createTemplate(MEMBER, { name: "denied" })
        expect(result).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
        })
    })
})
