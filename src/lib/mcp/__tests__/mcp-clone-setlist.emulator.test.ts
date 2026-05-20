import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { cloneSetlist } from "../tools/clone-setlist"
import {
    createSetlist,
    addTrackToSetlist,
    updateSetlist,
} from "../tools/setlist-write"

/**
 * GAP-002 (cycle-2 b4 bundle) — emulator coverage for `clone_setlist`.
 *
 * Daniel's 90% weekly authoring flow. Covers the contract:
 *  - role gate (admin + band_leader pass; musician rejected)
 *  - fresh trackIds + version=1 on every cloned doc
 *  - default name = "Copy of <source>"; explicit newName overrides
 *  - chart bonds (fileId/fileName/songId) copied verbatim
 *  - serviceNotes default-copy + copyServiceNotes:false strip
 *  - eventDate does NOT auto-copy (intentional); newEventDate honored
 *  - templateType + rabbi travel with the clone
 *  - ownerId resets to caller, not the source's owner
 *  - source setlist + tracks untouched by the clone
 *
 * Runs only via `npm run test:emulator`.
 */
describe("MCP clone_setlist (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "randy"
    const MEMBER = "guest-musician"
    const SOURCE_OWNER = "david-lazaroff" // another band_leader; owns source

    function db() {
        return getFirestore(app)
    }

    async function tracksOf(setlistId: string) {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => ({ id: d.id, data: d.data() as unknown as Record<string, unknown> }))
            .sort(
                (a, b) =>
                    (a.data.order as number) - (b.data.order as number),
            )
    }

    /** Build a fully-populated source setlist owned by SOURCE_OWNER. */
    async function buildSource(): Promise<string> {
        const created = (await createSetlist(SOURCE_OWNER, {
            name: "Shabbat Morning — Source",
            eventDate: "2026-05-09",
            serviceType: "shabbat-morning",
            rabbi: "Rabbi Daniel",
        })) as { setlistId: string }
        const setlistId = created.setlistId
        await updateSetlist(SOURCE_OWNER, {
            id: setlistId,
            serviceNotes: "Carry-over pastoral notes",
        })
        // Two song rows + one header. The first row is chart-bonded to a real
        // library song so we can verify fileId/fileName copy through.
        await addTrackToSetlist(SOURCE_OWNER, {
            setlistId,
            songId: "song-oseh",
            type: "song",
        })
        await addTrackToSetlist(SOURCE_OWNER, {
            setlistId,
            title: "D'var Torah",
            type: "header",
        })
        await addTrackToSetlist(SOURCE_OWNER, {
            setlistId,
            title: "Free-text song row",
            key: "D",
            leadMusician: "Vocal: Daniel",
            type: "song",
        })
        return setlistId
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-clone-setlist" })
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
            .doc(MEMBER)
            .set({ displayName: "Guest Musician", role: "musician" })
        await db()
            .collection("users")
            .doc(SOURCE_OWNER)
            .set({ displayName: "David Lazaroff", role: "band_leader" })
        await db()
            .collection("songs")
            .doc("song-oseh")
            .set({
                title: "Oseh Shalom.pdf",
                defaults: { key: "G", lead: "Cantor" },
            })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    it("happy path: clones source into a new setlist with fresh trackIds and version=1", async () => {
        const sourceId = await buildSource()
        const sourceTracksBefore = await tracksOf(sourceId)
        expect(sourceTracksBefore).toHaveLength(3)
        const sourceVersionBefore = (
            await db().collection("setlists").doc(sourceId).get()
        ).data()?.version

        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
        })) as {
            ok: true
            setlistId: string
            sourceSetlistId: string
            trackCount: number
            ownerId: string
            ownerName: string
            version: 1
        }

        expect(result.ok).toBe(true)
        expect(result.setlistId).not.toBe(sourceId)
        expect(result.sourceSetlistId).toBe(sourceId)
        expect(result.trackCount).toBe(3)
        expect(result.ownerId).toBe(ADMIN) // caller, NOT source's owner
        expect(result.version).toBe(1)

        // Clone parent doc is independent.
        const cloneSetlistDoc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as unknown as Record<string, unknown>
        expect(cloneSetlistDoc.version).toBe(1)
        expect(cloneSetlistDoc.ownerId).toBe(ADMIN)
        expect(cloneSetlistDoc.name).toBe("Copy of Shabbat Morning — Source")
        // serviceNotes default-copied
        expect(cloneSetlistDoc.serviceNotes).toBe("Carry-over pastoral notes")
        // templateType + rabbi travel
        expect(cloneSetlistDoc.templateType).toBe("shabbat-morning")
        expect(cloneSetlistDoc.rabbi).toBe("Rabbi Daniel")
        // eventDate does NOT auto-copy
        expect(cloneSetlistDoc.eventDate).toBeUndefined()

        // Clone tracks are fresh ids, version=1, contiguous order.
        const cloneTracks = await tracksOf(result.setlistId)
        expect(cloneTracks).toHaveLength(3)
        expect(cloneTracks.map((t) => t.data.order)).toEqual([0, 1, 2])
        for (const t of cloneTracks) {
            expect(t.data.version).toBe(1)
            expect(t.data.setlistId).toBe(result.setlistId)
            // Track ids are FRESH — no overlap with source.
            expect(sourceTracksBefore.map((s) => s.id)).not.toContain(t.id)
        }

        // Source setlist + tracks untouched by the clone.
        const sourceAfter = (
            await db().collection("setlists").doc(sourceId).get()
        ).data()
        expect(sourceAfter?.version).toBe(sourceVersionBefore)
        const sourceTracksAfter = await tracksOf(sourceId)
        expect(sourceTracksAfter.map((t) => t.id)).toEqual(
            sourceTracksBefore.map((t) => t.id),
        )
        // C9I5 §6.2 regression guard: a NORMAL clone of a real source is NOT
        // flagged isTest ("Copy of …" doesn't match the test-name patterns).
        expect(cloneSetlistDoc.isTest).toBeUndefined()
    })

    it("C9I5 §6.2: a test-shaped newName stamps isTest:true (drops from public /perform)", async () => {
        const sourceId = await buildSource() // clean source, real band_leader owner
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
            newName: "c9i5-clone-probe",
        })) as { ok: true; setlistId: string }
        expect(result.ok).toBe(true)

        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as Record<string, unknown>
        // The clone is admin-owned (not a test- uid) — pre-fix it would have
        // leaked onto /perform. The name heuristic now stamps it.
        expect(doc.isTest).toBe(true)
        expect(doc.ownerId).toBe(ADMIN)
    })

    it("C9I5 §6.2: a -CLONE- newName stamps isTest:true", async () => {
        const sourceId = await buildSource()
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
            newName: "Shabbat-CLONE-fixture",
        })) as { ok: true; setlistId: string }
        expect(result.ok).toBe(true)
        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as Record<string, unknown>
        expect(doc.isTest).toBe(true)
    })

    it("C9I5 §6.2: a clone of an isTest source stays isTest even with a clean newName", async () => {
        // Admin-owned source explicitly flagged isTest (real-looking name, so
        // the only signal is the source flag — exercises the inheritance branch).
        const created = (await createSetlist(ADMIN, {
            name: "Bar Mitzvah Rehearsal",
            isTest: true,
        })) as { setlistId: string }

        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: created.setlistId,
            newName: "Totally Normal Service Name",
        })) as { ok: true; setlistId: string }
        expect(result.ok).toBe(true)

        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as Record<string, unknown>
        expect(doc.isTest).toBe(true)
    })

    it("chart bonds (fileId + fileName + songId) copy verbatim to the clone's tracks", async () => {
        const sourceId = await buildSource()
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
        })) as { ok: true; setlistId: string }

        const cloneTracks = await tracksOf(result.setlistId)
        const oseh = cloneTracks.find(
            (t) => t.data.songId === "song-oseh",
        )?.data
        expect(oseh).toBeDefined()
        expect(oseh!.fileId).toBe("song-oseh")
        expect(oseh!.fileName).toBe("Oseh Shalom.pdf")
        expect(oseh!.songId).toBe("song-oseh")
        // The free-text song row carries its custom fields too.
        const freeText = cloneTracks.find(
            (t) => t.data.title === "Free-text song row",
        )?.data
        expect(freeText).toBeDefined()
        expect(freeText!.key).toBe("D")
        expect(freeText!.leadMusician).toBe("Vocal: Daniel")

        // Parent fileIds[] denormalization reflects the bonded chart.
        const cloneSetlistDoc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as unknown as Record<string, unknown>
        expect(cloneSetlistDoc.fileIds).toEqual(["song-oseh"])
    })

    it("explicit newName overrides the 'Copy of …' default", async () => {
        const sourceId = await buildSource()
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
            newName: "Shabbat Morning — May 16",
        })) as { ok: true; setlistId: string }
        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data()
        expect(doc?.name).toBe("Shabbat Morning — May 16")
    })

    it("newEventDate populates the clone's eventDate as a Firestore Timestamp", async () => {
        const sourceId = await buildSource()
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
            newEventDate: "2026-05-23",
        })) as { ok: true; setlistId: string }
        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as unknown as Record<string, unknown>
        expect(doc.eventDate).toBeInstanceOf(Timestamp)
    })

    it("copyServiceNotes:false strips the source's pastoral notes", async () => {
        const sourceId = await buildSource()
        const result = (await cloneSetlist(ADMIN, {
            sourceSetlistId: sourceId,
            copyServiceNotes: false,
        })) as { ok: true; setlistId: string }
        const doc = (
            await db().collection("setlists").doc(result.setlistId).get()
        ).data() as unknown as Record<string, unknown>
        expect(doc.serviceNotes).toBeUndefined()
    })

    it("band_leader may clone setlists owned by another band_leader (collaboration)", async () => {
        const sourceId = await buildSource() // owned by SOURCE_OWNER
        const result = (await cloneSetlist(LEADER, {
            sourceSetlistId: sourceId,
        })) as { ok: true; setlistId: string; ownerId: string }
        expect(result.ok).toBe(true)
        expect(result.ownerId).toBe(LEADER)
    })

    it("musician role is rejected", async () => {
        const sourceId = await buildSource()
        const result = await cloneSetlist(MEMBER, { sourceSetlistId: sourceId })
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "forbidden_role",
                message: expect.stringMatching(/admin or band leader/i),
            },
        })
    })

    it("missing source setlist surfaces a typed error", async () => {
        const result = await cloneSetlist(ADMIN, {
            sourceSetlistId: "definitely-not-a-real-setlist",
        })
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "setlist_not_found",
                message: expect.stringMatching(/not found/i),
            },
        })
    })

    it("rejects an empty sourceSetlistId", async () => {
        const result = await cloneSetlist(ADMIN, { sourceSetlistId: "  " })
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "invalid_argument",
                message: expect.stringMatching(/sourceSetlistId is required/i),
            },
        })
    })
})
