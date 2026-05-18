import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    createSetlist,
    updateSetlist,
    addTrackToSetlist,
    reorderSetlist,
    removeSetlistTrack,
    deleteSetlist,
    updateSetlistTrack,
    bulkUpdateSetlistTracks,
    bulkAddSetlistTracks,
    swapChart,
} from "../tools/setlist-write"
import { getSetlist } from "../tools/setlists"

/**
 * MCP Phase 4b — write tools against the Firebase emulator.
 *
 * Order manipulation (insert-shift, reorder-permutation, remove-repack) and
 * the trackCount/updatedAt denormalization are inherently Firestore-coupled —
 * mocking would test the mock, not the logic — so this is emulator-only.
 *
 * Covers: create → update → add (append / insert / songId / header / chart
 * bond) → reorder → remove, plus the role gate (admin/band_leader may edit ANY
 * setlist; everyone else is read-only) and the validation guards.
 *
 * Runs only via `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("MCP setlist write tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel" // role: admin — creates setlists in most tests
    const LEADER = "randy" // role: band_leader — may edit ANY setlist
    const MEMBER = "guest-musician" // role: musician — read-only, write tools denied
    // Cycle-2 REG-001b: role-refusal is now the rich `forbidden_role`
    // envelope. Tests assert the canonical machine code + required roles.
    const FORBIDDEN_ROLE_ENVELOPE = {
        ok: false as const,
        error: {
            machine_code: "forbidden_role",
            message: expect.stringContaining("admin or band leader"),
        },
        requiredRoles: ["admin", "band_leader"],
    }

    function db() {
        return getFirestore(app)
    }

    /** tracks/{id} rows for a setlist, sorted by order. */
    async function tracksOf(setlistId: string) {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => d.data() as unknown as Record<string, unknown>)
            .sort((a, b) => (a.order as number) - (b.order as number))
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-setlist-write" })
        // Seed the three role tiers (write tools gate on users/{uid}.role) and a
        // library song (add_track_to_setlist can derive a row from a songId).
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
            .collection("songs")
            .doc("song-oseh")
            .set({ title: "Oseh Shalom.pdf", defaults: { key: "G", lead: "Cantor" } })
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

    async function newSetlist(uid = ADMIN): Promise<string> {
        const r = (await createSetlist(uid, { name: "Test Service" })) as {
            setlistId: string
        }
        return r.setlistId
    }

    it("create_setlist makes an empty setlist owned by the creator and echoes owner (G-16) + version (v6 version-echo)", async () => {
        const result = (await createSetlist(ADMIN, {
            name: "Shabbat Morning",
            eventDate: "2026-06-07",
            rabbi: "Daniel",
        })) as {
            setlistId: string
            trackCount: number
            ownerId: string
            ownerName: string
            version: number
        }

        expect(result.setlistId).toBeTruthy()
        expect(result.trackCount).toBe(0)
        expect(result.ownerId).toBe(ADMIN)
        expect(result.ownerName).toBe("Rabbi Daniel")
        // version-echo NOTE (v6 bugstomp): createSetlistServerSide always
        // stamps `version: 1`, surfaced so callers can chain lastSeenVersion
        // without a follow-up get_setlist.
        expect(result.version).toBe(1)

        const doc = await db().collection("setlists").doc(result.setlistId).get()
        const data = doc.data()!
        expect(data.ownerId).toBe(ADMIN)
        expect(data.ownerName).toBe("Rabbi Daniel")
        expect(data.name).toBe("Shabbat Morning")
        expect(data.trackCount).toBe(0)
        expect(await tracksOf(result.setlistId)).toHaveLength(0)
    })

    it("update_setlist: any editor may edit any setlist; members may not", async () => {
        const id = await newSetlist(ADMIN)

        // The creator (admin) edits.
        expect(await updateSetlist(ADMIN, { id, name: "Renamed" })).toMatchObject({
            ok: true,
            setlist: { id, name: "Renamed" },
        })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe("Renamed")

        // A band leader edits a setlist they did NOT create — role-based, not
        // owner-based access.
        expect(
            await updateSetlist(LEADER, { id, name: "Leader Edit" }),
        ).toMatchObject({ ok: true, setlist: { id, name: "Leader Edit" } })
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe(
            "Leader Edit",
        )

        // A member is rejected without mutating anything.
        expect(await updateSetlist(MEMBER, { id, name: "Hijacked" })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        expect((await db().collection("setlists").doc(id).get()).data()!.name).toBe(
            "Leader Edit",
        )

        // Missing setlist (caller IS an editor — the existence check still runs).
        expect(await updateSetlist(ADMIN, { id: "nope", name: "x" })).toMatchObject({
            ok: false,
            error: { machine_code: "setlist_not_found" },
            setlistId: "nope",
        })
    })

    it("update_setlist echoes the post-update record (G-11)", async () => {
        const id = await newSetlist()
        const r = (await updateSetlist(ADMIN, {
            id,
            name: "Echo Test",
            eventDate: "2026-07-04",
            rabbi: "Rabbi Cantor",
            serviceType: "shabbat-morning",
            serviceNotes: "guest violinist",
        })) as { ok: true; setlist: Record<string, unknown> }
        expect(r.ok).toBe(true)
        expect(r.setlist).toMatchObject({
            id,
            name: "Echo Test",
            rabbi: "Rabbi Cantor",
            serviceNotes: "guest violinist",
        })
        // eventDate is persisted as a Firestore Timestamp; the echo
        // surfaces it as an ISO string representing that instant.
        expect(typeof r.setlist.eventDate).toBe("string")
        expect((r.setlist.eventDate as string).startsWith("2026-07-04")).toBe(true)
        // serviceType is persisted as templateType on the doc; the echo
        // surfaces it under the public name.
        expect(r.setlist.serviceType).toBe("shabbat-morning")
    })

    it("a member account is denied every write tool", async () => {
        const id = await newSetlist(ADMIN)
        const t = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Row" })) as {
            trackId: string
        }

        expect(await createSetlist(MEMBER, { name: "Nope" })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        expect(await updateSetlist(MEMBER, { id, name: "Nope" })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        expect(await addTrackToSetlist(MEMBER, { setlistId: id, title: "Nope" })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        expect(
            await reorderSetlist(MEMBER, { setlistId: id, orderedTrackIds: [t.trackId] }),
        ).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        expect(
            await removeSetlistTrack(MEMBER, { setlistId: id, trackId: t.trackId }),
        ).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)

        // Nothing was mutated.
        expect(await tracksOf(id)).toHaveLength(1)
    })

    it("add_track_to_setlist appends, keeping order contiguous + trackCount in sync", async () => {
        const id = await newSetlist()

        const a = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Song A" })) as {
            trackId: string
            order: number
        }
        const b = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "Song B" })) as {
            order: number
        }
        expect(a.order).toBe(0)
        expect(b.order).toBe(1)

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.title)).toEqual(["Song A", "Song B"])
        expect((await db().collection("setlists").doc(id).get()).data()!.trackCount).toBe(2)
    })

    it("add_track_to_setlist inserts at a position, shifting later rows down", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "A" })
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "C" })

        const inserted = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "B",
            position: 1,
        })) as { order: number }
        expect(inserted.order).toBe(1)

        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["A", "B", "C"])
    })

    it("add_track_to_setlist derives title/key/lead from a library songId", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })

        const [row] = await tracksOf(id)
        expect(row.title).toBe("Oseh Shalom") // file extension stripped
        expect(row.key).toBe("G")
        expect(row.leadMusician).toBe("Cantor")
        expect(row.songId).toBe("song-oseh")
        expect(row.type).toBe("song")
    })

    it("add_track_to_setlist bonds the song's chart — fileId/fileName on the row, fileIds on the parent", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })

        // The row carries the chart file id + cached filename — what the app's
        // chart rendering keys off (a songId alone never renders a chart).
        const [row] = await tracksOf(id)
        expect(row.fileId).toBe("song-oseh")
        expect(row.fileName).toBe("Oseh Shalom.pdf")

        // The parent's denormalized fileIds set includes the chart.
        const setlist = (await db().collection("setlists").doc(id).get()).data()!
        expect(setlist.fileIds).toEqual(["song-oseh"])

        // A header row contributes no chart — fileIds is unchanged.
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "— Closing —", type: "header" })
        const after = (await db().collection("setlists").doc(id).get()).data()!
        expect(after.fileIds).toEqual(["song-oseh"])
    })

    it("remove_track drops the chart from fileIds only when no other row still uses it", async () => {
        const id = await newSetlist()
        // Two rows bound to the same chart, plus a distinct one.
        const dup1 = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            songId: "song-oseh",
        })) as { trackId: string }
        await addTrackToSetlist(ADMIN, { setlistId: id, songId: "song-oseh" })
        await db()
            .collection("songs")
            .doc("song-other")
            .set({ title: "Hinei Ma Tov.pdf" })
        const other = (await addTrackToSetlist(ADMIN, {
            setlistId: id,
            songId: "song-other",
        })) as { trackId: string }

        // Removing one of the duplicates keeps the chart — the other row uses it.
        await removeSetlistTrack(ADMIN, { setlistId: id, trackId: dup1.trackId })
        let fileIds = (await db().collection("setlists").doc(id).get()).data()!
            .fileIds as string[]
        expect([...fileIds].sort()).toEqual(["song-oseh", "song-other"])

        // Removing the last row using a chart drops it from the set.
        await removeSetlistTrack(ADMIN, { setlistId: id, trackId: other.trackId })
        fileIds = (await db().collection("setlists").doc(id).get()).data()!
            .fileIds as string[]
        expect(fileIds).toEqual(["song-oseh"])
    })

    it("add_track_to_setlist supports header rows and rejects a titleless song", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "— Opening —", type: "header" })
        expect((await tracksOf(id))[0].type).toBe("header")

        expect(await addTrackToSetlist(ADMIN, { setlistId: id })).toMatchObject({
            ok: false,
            error: { machine_code: "title_required", message: expect.stringContaining("title is required") },
        })
        expect(await addTrackToSetlist(MEMBER, { setlistId: id, title: "x" })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
    })

    it("add_track_to_setlist accepts reading / prayer / transition / note (G-10)", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "V'ahavta",
            type: "reading",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Silent Prayer",
            type: "prayer",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Instrumental",
            type: "transition",
        })
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Service Note",
            type: "note",
        })

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.type)).toEqual([
            "reading",
            "prayer",
            "transition",
            "note",
        ])
        expect(tracks.map((t) => t.title)).toEqual([
            "V'ahavta",
            "Silent Prayer",
            "Instrumental",
            "Service Note",
        ])
    })

    it("reorder_setlist applies a full permutation and rejects a partial list", async () => {
        const id = await newSetlist()
        const t1 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "1" })) as {
            trackId: string
        }
        const t2 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "2" })) as {
            trackId: string
        }
        const t3 = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "3" })) as {
            trackId: string
        }

        // A band leader reorders a setlist the admin created (role-based access).
        expect(
            await reorderSetlist(LEADER, {
                setlistId: id,
                orderedTrackIds: [t3.trackId, t1.trackId, t2.trackId],
            }),
        ).toEqual({ ok: true })
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        // A list that isn't an exact permutation is rejected.
        const partial = await reorderSetlist(ADMIN, {
            setlistId: id,
            orderedTrackIds: [t1.trackId, t2.trackId],
        })
        expect(partial).toHaveProperty("error")
        // Order unchanged after the rejected call.
        expect((await tracksOf(id)).map((t) => t.title)).toEqual(["3", "1", "2"])

        expect(
            await reorderSetlist(MEMBER, {
                setlistId: id,
                orderedTrackIds: [t1.trackId, t2.trackId, t3.trackId],
            }),
        ).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
    })

    it("add_track + getSetlist round-trips referenceLink (F-4)", async () => {
        // Regression guard for F-4: getSetlist projection used to omit
        // referenceLink even though the write path persists it correctly,
        // silently dropping any URL the caller attached.
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, {
            setlistId: id,
            title: "Linked Row",
            referenceLink: "https://example.com/chart-ref",
        })

        const view = (await getSetlist(ADMIN, { id })) as {
            tracks: Array<{ referenceLink: string | null }>
        }
        expect(view.tracks[0].referenceLink).toBe("https://example.com/chart-ref")

        // A row added without a referenceLink projects null, not missing.
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "Plain Row" })
        const view2 = (await getSetlist(ADMIN, { id })) as {
            tracks: Array<{ referenceLink: string | null }>
        }
        expect(view2.tracks[1].referenceLink).toBeNull()
    })

    it("remove_track deletes the row, re-packs order, and syncs trackCount", async () => {
        const id = await newSetlist()
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "A" })
        const mid = (await addTrackToSetlist(ADMIN, { setlistId: id, title: "B" })) as {
            trackId: string
        }
        await addTrackToSetlist(ADMIN, { setlistId: id, title: "C" })

        expect(
            await removeSetlistTrack(ADMIN, { setlistId: id, trackId: mid.trackId }),
        ).toEqual({ ok: true })

        const tracks = await tracksOf(id)
        expect(tracks.map((t) => t.title)).toEqual(["A", "C"])
        expect(tracks.map((t) => t.order)).toEqual([0, 1]) // re-packed, no gap
        expect((await db().collection("setlists").doc(id).get()).data()!.trackCount).toBe(2)

        // Unknown track id returns the W-04 Plan 02 structured
        // track_not_found envelope (carries setlistVersion so the agent
        // can re-fetch). Non-editor caller still gets the plain string.
        const ghostResult = (await removeSetlistTrack(ADMIN, {
            setlistId: id,
            trackId: "ghost",
        })) as unknown as Record<string, unknown>
        expect((ghostResult.error as { machine_code: string }).machine_code).toBe("track_not_found")
        expect(typeof ghostResult.setlistVersion).toBe("number")
        expect(ghostResult.hint).toMatch(/get_setlist/)
        expect(
            await removeSetlistTrack(MEMBER, { setlistId: id, trackId: tracks[0].id as string }),
        ).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
    })

    describe("delete_setlist (F-10)", () => {
        it("admin deletes their own setlist and cascades all its tracks", async () => {
            const id = await newSetlist(ADMIN)
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "1" })
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "2" })

            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 2,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
            expect(await tracksOf(id)).toHaveLength(0)
        })

        it("works on a setlist with no tracks", async () => {
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 0,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
        })

        it("admin can delete a setlist owned by another editor (override)", async () => {
            const id = await newSetlist(LEADER)
            expect(await deleteSetlist(ADMIN, { id })).toEqual({
                ok: true,
                tracksDeleted: 0,
            })
        })

        it("band_leader deletes their own setlist", async () => {
            const id = await newSetlist(LEADER)
            await addTrackToSetlist(LEADER, { setlistId: id, title: "x" })
            expect(await deleteSetlist(LEADER, { id })).toEqual({
                ok: true,
                tracksDeleted: 1,
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(false)
        })

        it("band_leader CANNOT delete a setlist owned by someone else", async () => {
            // Stricter than create/update/add_track, which let any leader edit
            // any setlist. Delete is destructive + irreversible, so it requires
            // ownership (or an admin override).
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(LEADER, { id })).toMatchObject({
                ok: false,
                error: { machine_code: "forbidden_owner", message: expect.stringContaining("Only the setlist owner or an admin") },
            })
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(true)
        })

        it("member is rejected at the role gate", async () => {
            const id = await newSetlist(ADMIN)
            expect(await deleteSetlist(MEMBER, { id })).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
            expect((await db().collection("setlists").doc(id).get()).exists).toBe(true)
        })

        it("nonexistent setlist id returns a clean error", async () => {
            expect(await deleteSetlist(ADMIN, { id: "nope" })).toMatchObject({
                ok: false,
                error: { machine_code: "setlist_not_found" },
                setlistId: "nope",
            })
        })

        it("does not touch tracks of other setlists", async () => {
            const a = await newSetlist(ADMIN)
            const b = await newSetlist(ADMIN)
            await addTrackToSetlist(ADMIN, { setlistId: a, title: "a1" })
            await addTrackToSetlist(ADMIN, { setlistId: b, title: "b1" })

            expect(await deleteSetlist(ADMIN, { id: a })).toEqual({
                ok: true,
                tracksDeleted: 1,
            })
            expect(await tracksOf(b)).toHaveLength(1)
            expect((await db().collection("setlists").doc(b).get()).exists).toBe(true)
        })
    })

    describe("update_track + bulk_update_tracks (CF1)", () => {
        async function addRow(
            setlistId: string,
            title: string,
            extra: Record<string, unknown> = {},
        ): Promise<string> {
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId,
                title,
                ...extra,
            })) as { trackId: string }
            return r.trackId
        }

        // ─── update_track ───────────────────────────────────────────────────

        it("update_track happy path — admin updates leadMusician, echoes the row, persists to Firestore", async () => {
            const id = await newSetlist()
            const trackId = await addRow(id, "Hinei Ma Tov")

            const r = (await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { leadMusician: "Randy" },
            })) as { ok: true; track: Record<string, unknown> }

            expect(r.ok).toBe(true)
            expect(r.track.id).toBe(trackId)
            expect(r.track.leadMusician).toBe("Randy")
            expect(r.track.title).toBe("Hinei Ma Tov") // untouched

            const persisted = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(persisted.leadMusician).toBe("Randy")
        })

        it("update_track preserves trackId (regression vs old remove+add path)", async () => {
            const id = await newSetlist()
            const before = await addRow(id, "Mi Shebeirach")
            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId: before,
                patch: { key: "Am" },
            })
            // Exactly one tracks/{id} doc still keyed by the same trackId.
            const after = await tracksOf(id)
            expect(after).toHaveLength(1)
            expect(after[0].id).toBe(before)
            expect(after[0].key).toBe("Am")
        })

        it("update_track accepts the Wave-5 widened type enum (song → reading)", async () => {
            const id = await newSetlist()
            const trackId = await addRow(id, "Sh'ma", { type: "song" })

            const r = (await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { type: "reading" },
            })) as { ok: true; track: Record<string, unknown> }

            expect(r.track.type).toBe("reading")
            const persisted = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(persisted.type).toBe("reading")
        })

        it("update_track re-bonds: songId change updates fileId on the row", async () => {
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const trackId = await addRow(id, "Oseh Shalom", { songId: "song-oseh" })
            // sanity: starting state bonds song-oseh
            const start = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(start.songId).toBe("song-oseh")
            expect(start.fileId).toBe("song-oseh")

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "song-other" },
            })

            const after = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(after.songId).toBe("song-other")
            expect(after.fileId).toBe("song-other")
        })

        it("update_track re-bond rebuilds setlist fileIds[] and refreshes fileName (H-1 + F-2)", async () => {
            // 2026-05-15 stress test caught Perform mode failing "Image
            // failed to load" on every re-bonded chart, because the parent
            // setlist's fileIds[] aggregate (used to prefetch charts) didn't
            // follow the row's new bond. fileName drifted too (cosmetic but
            // confusing in logs). Both close in one fix; cover both here.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const trackId = await addRow(id, "Oseh Shalom", { songId: "song-oseh" })

            // Starting state: setlist.fileIds[] holds the original bond,
            // and the row's fileName is the original chart filename.
            const before = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect(before.fileIds).toEqual(["song-oseh"])
            const rowBefore = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(rowBefore.fileName).toBe("Oseh Shalom.pdf")

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "song-other" },
            })

            // H-1: setlist.fileIds[] now reflects the NEW bond, with the
            // old bond removed (no other track on the setlist references it).
            const after = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect((after.fileIds as string[]).sort()).toEqual(["song-other"])

            // F-2: the row's fileName comes from the NEW song's catalog
            // record, not the stale original.
            const rowAfter = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(rowAfter.fileName).toBe("Hinei Ma Tov.pdf")
        })

        it("update_track re-bond auto-updates title when the row was using the old song's catalog title (NOTE-1)", async () => {
            // Stress-test v3 NOTE-1: re-bond left the row's title pointing at
            // the OLD song, so Perform mode showed a mismatched footer label
            // ("Shiru L'Adonai" while rendering the new "Mi Chamocha" chart).
            // Auto-refresh only when the user hadn't customized the title.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            // Add via songId WITHOUT a title — addTrackToSetlist derives
            // title from song-oseh's catalog title ("Oseh Shalom.pdf"), which
            // is exactly the "uncustomized" state we want to test.
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }
            const trackId = r.trackId
            const seeded = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            // getSongById's cleanTitle strips the file extension, so the
            // catalog-derived row title is the bare song name.
            expect(seeded.title).toBe("Oseh Shalom")

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "song-other" },
            })

            const after = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(after.title).toBe("Hinei Ma Tov")
        })

        it("update_track re-bond preserves a customized title", async () => {
            // If the row's title doesn't match the old song's catalog title,
            // the user customized it — auto-refresh would clobber intent.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const trackId = await addRow(id, "My Custom Lead-In", {
                songId: "song-oseh",
            })

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "song-other" },
            })

            const after = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(after.title).toBe("My Custom Lead-In")
        })

        it("update_track re-bond honors an explicit title in the same patch", async () => {
            // Caller wins: if the patch sets title, that overrides the
            // auto-refresh even when the row was uncustomized.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }
            const trackId = r.trackId

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "song-other", title: "Caller's Choice" },
            })

            const after = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(after.title).toBe("Caller's Choice")
        })

        it("update_track re-bond preserves fileIds entries still bonded by other rows", async () => {
            // If row A and row B both bond song-oseh, then row A re-bonds to
            // song-other, song-oseh must STAY in setlist.fileIds because
            // row B still uses it. The canonical-from-tracks rebuild handles
            // this naturally; assert it explicitly so a future
            // arrayRemove-on-rebond optimization can't silently regress it.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const trackA = await addRow(id, "Row A", { songId: "song-oseh" })
            await addRow(id, "Row B", { songId: "song-oseh" }) // second user of song-oseh

            await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId: trackA,
                patch: { songId: "song-other" },
            })

            const after = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect((after.fileIds as string[]).sort()).toEqual([
                "song-oseh",
                "song-other",
            ])
        })

        it("update_track role gate: musician denied; band_leader and admin allowed", async () => {
            const id = await newSetlist(ADMIN)
            const trackId = await addRow(id, "Adon Olam")

            expect(
                await updateSetlistTrack(MEMBER, {
                    setlistId: id,
                    trackId,
                    patch: { key: "G" },
                }),
            ).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)

            expect(
                await updateSetlistTrack(LEADER, {
                    setlistId: id,
                    trackId,
                    patch: { key: "G" },
                }),
            ).toMatchObject({ ok: true })

            expect(
                await updateSetlistTrack(ADMIN, {
                    setlistId: id,
                    trackId,
                    patch: { key: "A" },
                }),
            ).toMatchObject({ ok: true })

            const persisted = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(persisted.key).toBe("A")
        })

        it("update_track cross-setlist guard: trackId from setlist A passed with setlist B is rejected", async () => {
            const a = await newSetlist(ADMIN)
            const b = await newSetlist(ADMIN)
            const trackA = await addRow(a, "Lecha Dodi")

            const r = await updateSetlistTrack(ADMIN, {
                setlistId: b,
                trackId: trackA,
                patch: { key: "C" },
            })
            // Cycle-2 REG-001b: the inner helper still returns the prose error
            // string `'Track does not belong to this setlist'`, which the
            // wrapper bubbles up via `richError("update_track_failed", ...)`.
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "update_track_failed", message: expect.stringContaining("does not belong to this setlist") },
            })

            // No mutation on the actual row.
            const persisted = (
                await db().collection("tracks").doc(trackA).get()
            ).data()!
            expect(persisted.key).toBeUndefined()
        })

        it("update_track rejects an empty patch", async () => {
            const id = await newSetlist()
            const trackId = await addRow(id, "Yih'yu L'ratzon")

            const r = await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: {},
            })
            // Inner helper's prose wraps via richError("update_track_failed", ...).
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "update_track_failed", message: expect.stringContaining("at least one field") },
            })
        })

        it("update_track rejects a bogus trackId with the W-04 track_not_found envelope", async () => {
            const id = await newSetlist()
            const r = (await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId: "ghost-track",
                patch: { key: "G" },
            })) as unknown as Record<string, unknown>
            expect((r.error as { machine_code: string }).machine_code).toBe("track_not_found")
            expect(r.message).toMatch(/ghost-track/)
            expect(typeof r.setlistVersion).toBe("number")
            expect(r.hint).toMatch(/get_setlist/)
        })

        it("update_track rejects a bogus songId before writing (F-01)", async () => {
            // 2026-05-16 bugstomp F-01: pre-fix, patching songId to an
            // unknown id silently succeeded, leaving the row bonded to a
            // chart that 404s on every Perform-mode fetch. The orphan
            // looked fine in the editor (title/fileName preserved from the
            // old bond) and only surfaced at publish-time if at all.
            // add_track_to_setlist and swap_chart already pre-look-up;
            // update_track now does the same.
            const id = await newSetlist()
            const trackId = await addRow(id, "Oseh Shalom", {
                songId: "song-oseh",
            })

            const r = await updateSetlistTrack(ADMIN, {
                setlistId: id,
                trackId,
                patch: { songId: "definitely-not-a-real-songid" },
            })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "song_not_found" },
                songId: "definitely-not-a-real-songid",
            })

            // No mutation: the row is still bonded to song-oseh.
            const persisted = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(persisted.songId).toBe("song-oseh")
            expect(persisted.fileId).toBe("song-oseh")

            // No mutation: the parent setlist's fileIds[] still holds the
            // original bond — F-01 protects the aggregate from drift too.
            const setlist = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect(setlist.fileIds).toEqual(["song-oseh"])
        })

        // ─── bulk_update_tracks ─────────────────────────────────────────────

        it("bulk_update_tracks atomic happy path — 3 valid patches all land in one transaction (committed: true)", async () => {
            const id = await newSetlist()
            const t1 = await addRow(id, "A")
            const t2 = await addRow(id, "B")
            const t3 = await addRow(id, "C")

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                patches: [
                    { trackId: t1, patch: { leadMusician: "Daniel" } },
                    { trackId: t2, patch: { leadMusician: "Randy" } },
                    { trackId: t3, patch: { leadMusician: "Cantor" } },
                ],
            })) as {
                ok: true
                mode: "atomic"
                committed: boolean
                results: Array<{
                    trackId: string
                    ok: boolean
                    track?: Record<string, unknown>
                }>
                dryRun: boolean
            }
            expect(r.ok).toBe(true)
            expect(r.mode).toBe("atomic")
            expect(r.committed).toBe(true)
            expect(r.dryRun).toBe(false)
            expect(r.results.every((p) => p.ok)).toBe(true)

            const rows = await tracksOf(id)
            expect(rows.find((row) => row.id === t1)!.leadMusician).toBe("Daniel")
            expect(rows.find((row) => row.id === t2)!.leadMusician).toBe("Randy")
            expect(rows.find((row) => row.id === t3)!.leadMusician).toBe("Cantor")

            // §3.3 regression: updatedAt in each row's echo is an ISO string,
            // not a raw Firestore Timestamp or ms-since-epoch number.
            for (const result of r.results) {
                const updatedAt = result.track?.updatedAt
                expect(typeof updatedAt).toBe("string")
                expect(() => new Date(updatedAt as string).toISOString()).not.toThrow()
            }
        })

        it("bulk_update_tracks atomic re-bond gets fileName + title + fileIds parity with update_track", async () => {
            // Bulk parity follow-up: pre-fix, bulk_update_tracks (atomic) on
            // a songId change only swapped the row's fileId. fileName drifted
            // (F-2), title stayed stale (NOTE-1), and the setlist's fileIds[]
            // aggregate didn't rebuild (H-1) — Perform mode prefetches from
            // that aggregate, so bulk re-bonds would have recurred the v2
            // "Image failed to load" bug.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            // Row A: bonded via songId (uncustomized title) → re-bond.
            const rA = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }
            // Row B: bonded to the same song so the aggregate fileIds[] has
            // a sibling to preserve (regression coverage matches the
            // update_track sibling-preservation test).
            const rB = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }

            const before = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect(before.fileIds).toEqual(["song-oseh"])

            await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                patches: [
                    { trackId: rA.trackId, patch: { songId: "song-other" } },
                ],
            })

            const rowA = (
                await db().collection("tracks").doc(rA.trackId).get()
            ).data()!
            expect(rowA.fileId).toBe("song-other")
            // F-2 parity: fileName refreshes to the new song's catalog filename.
            expect(rowA.fileName).toBe("Hinei Ma Tov.pdf")
            // NOTE-1 parity: row title was using the old song's catalog title
            // ("Oseh Shalom"), so auto-refresh kicks in.
            expect(rowA.title).toBe("Hinei Ma Tov")

            const after = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            // H-1 parity: setlist.fileIds[] rebuilds from post-patch state,
            // with song-oseh preserved because Row B still uses it.
            expect((after.fileIds as string[]).sort()).toEqual([
                "song-oseh",
                "song-other",
            ])
            // Sibling row should be untouched.
            const rowB = (
                await db().collection("tracks").doc(rB.trackId).get()
            ).data()!
            expect(rowB.fileId).toBe("song-oseh")
            expect(rowB.title).toBe("Oseh Shalom")
        })

        it("bulk_update_tracks atomic-rollback (cowork §3.1 regression): committed=false, would-have-written rows ok=false with explicit rollback error", async () => {
            const id = await newSetlist()
            const t1 = await addRow(id, "A")
            const t2 = await addRow(id, "B")

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                patches: [
                    { trackId: t1, patch: { leadMusician: "Daniel" } },
                    { trackId: "ghost", patch: { leadMusician: "Nobody" } },
                    { trackId: t2, patch: { leadMusician: "Randy" } },
                ],
            })) as {
                ok: true
                mode: "atomic"
                committed: boolean
                results: Array<{ trackId: string; ok: boolean; error?: string }>
                dryRun: boolean
            }
            // The headline change: callers can now tell from `committed` that
            // writes didn't land — even though `ok: true` at envelope level.
            expect(r.ok).toBe(true)
            expect(r.committed).toBe(false)
            // The bogus row is rejected with the pre-validation error.
            expect(r.results[1].ok).toBe(false)
            expect(r.results[1].error).toBe("Track not found in this setlist")
            // The previously-valid rows now report ok:false with an explicit
            // rollback error — NOT the misleading ok:true that cowork flagged.
            expect(r.results[0].ok).toBe(false)
            expect(r.results[0].error).toContain("Rolled back")
            expect(r.results[2].ok).toBe(false)
            expect(r.results[2].error).toContain("Rolled back")

            // Confirm no Firestore writes landed.
            const t1Doc = (
                await db().collection("tracks").doc(t1).get()
            ).data()!
            const t2Doc = (
                await db().collection("tracks").doc(t2).get()
            ).data()!
            expect(t1Doc.leadMusician).toBeUndefined()
            expect(t2Doc.leadMusician).toBeUndefined()
        })

        it("bulk_update_tracks best-effort: committed=true even with one rejected row; per-row results explain", async () => {
            const id = await newSetlist()
            const t1 = await addRow(id, "A")
            const t2 = await addRow(id, "B")

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                mode: "best-effort",
                patches: [
                    { trackId: t1, patch: { leadMusician: "Daniel" } },
                    { trackId: "ghost", patch: { leadMusician: "Nobody" } },
                    { trackId: t2, patch: { leadMusician: "Randy" } },
                ],
            })) as {
                ok: true
                mode: "best-effort"
                committed: boolean
                results: Array<{ trackId: string; ok: boolean; error?: string }>
            }
            expect(r.mode).toBe("best-effort")
            expect(r.committed).toBe(true) // at least one write attempted/landed
            expect(r.results[0].ok).toBe(true)
            expect(r.results[1].ok).toBe(false)
            expect(r.results[1].error).toBe("Track not found in this setlist")
            expect(r.results[2].ok).toBe(true)

            // Two writes landed, ghost was skipped.
            const t1Doc = (
                await db().collection("tracks").doc(t1).get()
            ).data()!
            const t2Doc = (
                await db().collection("tracks").doc(t2).get()
            ).data()!
            expect(t1Doc.leadMusician).toBe("Daniel")
            expect(t2Doc.leadMusician).toBe("Randy")
        })

        it("bulk_update_tracks dryRun returns committed=false plus the would-apply plan; no writes", async () => {
            const id = await newSetlist()
            const t1 = await addRow(id, "A")
            const t2 = await addRow(id, "B")
            const t3 = await addRow(id, "C")

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                dryRun: true,
                patches: [
                    { trackId: t1, patch: { leadMusician: "Daniel" } },
                    { trackId: t2, patch: { leadMusician: "Randy" } },
                    { trackId: t3, patch: { leadMusician: "Cantor" } },
                ],
            })) as {
                ok: true
                committed: boolean
                dryRun: boolean
                results: Array<{
                    trackId: string
                    ok: boolean
                    track?: Record<string, unknown>
                }>
            }
            expect(r.dryRun).toBe(true)
            expect(r.committed).toBe(false)
            expect(r.results.every((p) => p.ok)).toBe(true)
            // The plan shows the would-apply rows.
            expect(r.results[0].track?.leadMusician).toBe("Daniel")
            // §3.3: plan-path updatedAt is also normalized to ISO/null,
            // not a raw ms number.
            const ua = r.results[0].track?.updatedAt
            expect(ua === null || typeof ua === "string").toBe(true)

            // No writes landed.
            for (const tid of [t1, t2, t3]) {
                const doc = (await db().collection("tracks").doc(tid).get()).data()!
                expect(doc.leadMusician).toBeUndefined()
            }
        })

        it("bulk_update_tracks atomic: bogus songId on one patch rejects the whole batch (F-01 parity)", async () => {
            // 2026-05-16 bugstomp F-01 parity: pre-fix, bulk_update_tracks
            // accepted any songId because its songLookup callback returned
            // null on miss and the patch wrote anyway — same silent
            // orphan-manufacture hole closed on update_track. Atomic mode
            // now rejects all, marks the bad row invalid + rolls back
            // every other row with the explicit rollback message.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const tA = await addRow(id, "Oseh Shalom", { songId: "song-oseh" })
            const tB = await addRow(id, "Yih'yu", { songId: "song-oseh" })

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                mode: "atomic",
                patches: [
                    {
                        trackId: tA,
                        patch: { songId: "song-other" }, // VALID rebond
                    },
                    {
                        trackId: tB,
                        patch: { songId: "definitely-not-a-real-songid" },
                    },
                ],
            })) as {
                ok: true
                mode: "atomic"
                committed: boolean
                results: Array<{ trackId: string; ok: boolean; error?: string }>
            }
            expect(r.committed).toBe(false)
            expect(r.results[0].ok).toBe(false)
            expect(r.results[0].error).toContain("Rolled back")
            expect(r.results[1].ok).toBe(false)
            expect(r.results[1].error).toBe(
                "Song definitely-not-a-real-songid not found",
            )

            // No row mutated — both still bonded to song-oseh.
            const aDoc = (await db().collection("tracks").doc(tA).get()).data()!
            const bDoc = (await db().collection("tracks").doc(tB).get()).data()!
            expect(aDoc.songId).toBe("song-oseh")
            expect(aDoc.fileId).toBe("song-oseh")
            expect(bDoc.songId).toBe("song-oseh")
            expect(bDoc.fileId).toBe("song-oseh")
        })

        it("bulk_update_tracks best-effort: bogus songId fails just that row; valid rows commit (F-01 parity)", async () => {
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const tA = await addRow(id, "Oseh Shalom", { songId: "song-oseh" })
            const tB = await addRow(id, "Yih'yu", { songId: "song-oseh" })

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                mode: "best-effort",
                patches: [
                    {
                        trackId: tA,
                        patch: { songId: "song-other" }, // VALID rebond
                    },
                    {
                        trackId: tB,
                        patch: { songId: "definitely-not-a-real-songid" },
                    },
                ],
            })) as {
                ok: true
                mode: "best-effort"
                committed: boolean
                results: Array<{ trackId: string; ok: boolean; error?: string }>
            }
            expect(r.committed).toBe(true)
            expect(r.results[0].ok).toBe(true)
            expect(r.results[1].ok).toBe(false)
            expect(r.results[1].error).toBe(
                "Song definitely-not-a-real-songid not found",
            )

            // tA rebonded to song-other; tB unchanged (still song-oseh).
            const aDoc = (await db().collection("tracks").doc(tA).get()).data()!
            const bDoc = (await db().collection("tracks").doc(tB).get()).data()!
            expect(aDoc.songId).toBe("song-other")
            expect(aDoc.fileId).toBe("song-other")
            expect(bDoc.songId).toBe("song-oseh")
            expect(bDoc.fileId).toBe("song-oseh")
        })

        it("bulk_update_tracks dryRun: bogus songId surfaces in plan without writing (F-01 parity)", async () => {
            const id = await newSetlist()
            const tA = await addRow(id, "Oseh Shalom", { songId: "song-oseh" })

            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                dryRun: true,
                patches: [
                    {
                        trackId: tA,
                        patch: { songId: "definitely-not-a-real-songid" },
                    },
                ],
            })) as {
                ok: true
                dryRun: boolean
                committed: boolean
                results: Array<{ trackId: string; ok: boolean; error?: string }>
            }
            expect(r.dryRun).toBe(true)
            expect(r.committed).toBe(false)
            expect(r.results[0].ok).toBe(false)
            expect(r.results[0].error).toBe(
                "Song definitely-not-a-real-songid not found",
            )

            // No write happened.
            const doc = (await db().collection("tracks").doc(tA).get()).data()!
            expect(doc.songId).toBe("song-oseh")
        })

        it("bulk_update_tracks rejects >50 patches before writing", async () => {
            const id = await newSetlist()
            const trackId = await addRow(id, "Solo")
            const patches = Array.from({ length: 51 }, () => ({
                trackId,
                patch: { leadMusician: "X" },
            }))

            const r = await bulkUpdateSetlistTracks(ADMIN, {
                setlistId: id,
                patches,
            })
            // Cycle-2: wrapper now wraps inner errors via richError().
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "bulk_update_failed", message: expect.stringContaining("exceeds max") },
            })
            // The single row was not mutated.
            const doc = (
                await db().collection("tracks").doc(trackId).get()
            ).data()!
            expect(doc.leadMusician).toBeUndefined()
        })
    })

    // ─── CF3: bulk_add_tracks + position-in-patch ──────────────────────────

    describe("update_track position-patch (CF3)", () => {
        async function setlistWithRows(uid: string, titles: string[]) {
            const id = await newSetlist(uid)
            const trackIds: string[] = []
            for (const t of titles) {
                const r = (await addTrackToSetlist(uid, {
                    setlistId: id,
                    title: t,
                    type: "song",
                })) as { trackId: string }
                trackIds.push(r.trackId)
            }
            return { setlistId: id, trackIds }
        }

        it("moves a row to a new position via update_track patch", async () => {
            const { setlistId, trackIds } = await setlistWithRows(ADMIN, [
                "A",
                "B",
                "C",
                "D",
            ])
            // Move D (index 3) to index 1 → [A, D, B, C].
            const r = await updateSetlistTrack(ADMIN, {
                setlistId,
                trackId: trackIds[3],
                patch: { position: 1 },
            })
            expect(r).toMatchObject({ ok: true })

            const rows = await tracksOf(setlistId)
            expect(rows.map((t) => t.title)).toEqual(["A", "D", "B", "C"])
            expect(rows.map((t) => t.order)).toEqual([0, 1, 2, 3])
        })

        it("moves + field-patches in one call", async () => {
            const { setlistId, trackIds } = await setlistWithRows(ADMIN, [
                "A",
                "B",
                "C",
            ])
            await updateSetlistTrack(ADMIN, {
                setlistId,
                trackId: trackIds[0],
                patch: { position: 2, leadMusician: "Randy" },
            })
            const rows = await tracksOf(setlistId)
            expect(rows.map((t) => t.title)).toEqual(["B", "C", "A"])
            const movedA = rows.find((t) => t.title === "A")!
            expect(movedA.leadMusician).toBe("Randy")
        })

        it("clamps out-of-range position into [0, trackCount-1]", async () => {
            const { setlistId, trackIds } = await setlistWithRows(ADMIN, [
                "A",
                "B",
                "C",
            ])
            // Move A to absurdly large index — clamp to end.
            await updateSetlistTrack(ADMIN, {
                setlistId,
                trackId: trackIds[0],
                patch: { position: 999 },
            })
            const rows = await tracksOf(setlistId)
            expect(rows.map((t) => t.title)).toEqual(["B", "C", "A"])
        })

        it("position-only patch (no field changes) is allowed", async () => {
            const { setlistId, trackIds } = await setlistWithRows(ADMIN, [
                "A",
                "B",
            ])
            const r = await updateSetlistTrack(ADMIN, {
                setlistId,
                trackId: trackIds[1],
                patch: { position: 0 },
            })
            expect(r).toMatchObject({ ok: true })
            const rows = await tracksOf(setlistId)
            expect(rows.map((t) => t.title)).toEqual(["B", "A"])
        })

        it("bulk_update_tracks rejects `position` (single-track only)", async () => {
            const { setlistId, trackIds } = await setlistWithRows(ADMIN, ["A", "B"])
            const r = (await bulkUpdateSetlistTracks(ADMIN, {
                setlistId,
                patches: [
                    {
                        trackId: trackIds[0],
                        patch: { position: 1 } as never,
                    },
                ],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; error?: string }>
            }
            expect(r.committed).toBe(false)
            expect(r.results[0].ok).toBe(false)
            expect(r.results[0].error).toContain("position")
            // No reorder happened.
            const rows = await tracksOf(setlistId)
            expect(rows.map((t) => t.title)).toEqual(["A", "B"])
        })
    })

    describe("bulk_add_tracks (CF3)", () => {
        it("appends rows in array order; one call closes the weekly N+1; echoes post-write version (v6 version-echo)", async () => {
            const id = await newSetlist(ADMIN)
            // Setlist starts at version 1 (newSetlist → createSetlist), so
            // a committed bulk_add_tracks should report version 2.
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: [
                    { title: "Lecha Dodi", type: "song", key: "G" },
                    { title: "Mi Chamocha", type: "song", key: "D" },
                    { title: "Adon Olam", type: "song", key: "C" },
                ],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; trackId?: string; order?: number }>
                version: number
            }
            expect(r.committed).toBe(true)
            expect(r.results).toHaveLength(3)
            expect(r.results.every((x) => x.ok)).toBe(true)
            expect(r.results.map((x) => x.order)).toEqual([0, 1, 2])
            expect(r.version).toBe(2)

            const rows = await tracksOf(id)
            expect(rows.map((t) => t.title)).toEqual([
                "Lecha Dodi",
                "Mi Chamocha",
                "Adon Olam",
            ])
            expect(rows.map((t) => t.order)).toEqual([0, 1, 2])
        })

        it("dryRun: true returns current version without bumping (v6 version-echo)", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: [{ title: "A", type: "song" }],
                dryRun: true,
            })) as {
                ok: true
                dryRun: boolean
                committed: boolean
                version: number
            }
            expect(r.dryRun).toBe(true)
            expect(r.committed).toBe(false)
            // version unchanged from the newly-created setlist's initial 1.
            expect(r.version).toBe(1)
        })

        it("inserts at a given anchor — shifts existing rows down", async () => {
            // Seed two rows, then bulk-insert two more at position 1.
            const id = await newSetlist(ADMIN)
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "First", type: "song" })
            await addTrackToSetlist(ADMIN, { setlistId: id, title: "Last", type: "song" })

            await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                position: 1,
                tracks: [
                    { title: "Middle-A", type: "song" },
                    { title: "Middle-B", type: "song" },
                ],
            })
            const rows = await tracksOf(id)
            expect(rows.map((t) => t.title)).toEqual([
                "First",
                "Middle-A",
                "Middle-B",
                "Last",
            ])
            expect(rows.map((t) => t.order)).toEqual([0, 1, 2, 3])
        })

        it("derives title/key/lead from songId and bonds fileId", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: [{ songId: "song-oseh" }],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; trackId?: string }>
            }
            expect(r.committed).toBe(true)
            const row = (
                await db()
                    .collection("tracks")
                    .doc(r.results[0].trackId!)
                    .get()
            ).data()!
            expect(row.title).toBe("Oseh Shalom")
            expect(row.key).toBe("G")
            expect(row.leadMusician).toBe("Cantor")
            expect(row.fileId).toBe("song-oseh")

            const setlist = (
                await db().collection("setlists").doc(id).get()
            ).data()!
            expect(setlist.fileIds).toContain("song-oseh")
            expect(setlist.trackCount).toBe(1)
        })

        it("atomic + bad songId → entire batch rolled back, no writes", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: [
                    { title: "Good", type: "song" },
                    { songId: "ghost-song-id" },
                    { title: "Also Good", type: "song" },
                ],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; error?: string }>
            }
            expect(r.committed).toBe(false)
            expect(r.results[0]).toMatchObject({ ok: false })
            expect(r.results[1]).toMatchObject({
                ok: false,
                error: expect.stringContaining("ghost-song-id"),
            })
            expect(r.results[2]).toMatchObject({ ok: false })
            expect(r.results[0].error).toContain("Rolled back")
            expect(await tracksOf(id)).toHaveLength(0)
        })

        it("best-effort + bad songId → other rows still insert", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                mode: "best-effort",
                tracks: [
                    { title: "Good", type: "song" },
                    { songId: "ghost-song-id" },
                    { title: "Also Good", type: "song" },
                ],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; trackId?: string }>
            }
            expect(r.committed).toBe(true)
            expect(r.results[0].ok).toBe(true)
            expect(r.results[1].ok).toBe(false)
            expect(r.results[2].ok).toBe(true)
            const rows = await tracksOf(id)
            expect(rows.map((t) => t.title)).toEqual(["Good", "Also Good"])
            expect(rows.map((t) => t.order)).toEqual([0, 1])
        })

        it("dryRun=true returns the plan without writing", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                dryRun: true,
                tracks: [
                    { title: "A", type: "song" },
                    { title: "B", type: "song" },
                ],
            })) as {
                ok: true
                committed: boolean
                dryRun: boolean
                results: Array<{ ok: boolean }>
            }
            expect(r.committed).toBe(false)
            expect(r.dryRun).toBe(true)
            expect(r.results.every((x) => x.ok)).toBe(true)
            expect(await tracksOf(id)).toHaveLength(0)
        })

        it("rejects empty list and >50 rows", async () => {
            const id = await newSetlist(ADMIN)
            const empty = await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: [],
            })
            expect(empty).toMatchObject({
                ok: false,
                error: { machine_code: "bulk_add_failed", message: expect.stringContaining("at least one") },
            })

            const big = Array.from({ length: 51 }, (_, i) => ({
                title: `T${i}`,
                type: "song" as const,
            }))
            const tooMany = await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                tracks: big,
            })
            expect(tooMany).toMatchObject({
                ok: false,
                error: { machine_code: "bulk_add_failed", message: expect.stringContaining("exceeds max") },
            })
        })

        it("rejects rows with no title and no songId", async () => {
            const id = await newSetlist(ADMIN)
            const r = (await bulkAddSetlistTracks(ADMIN, {
                setlistId: id,
                mode: "best-effort",
                tracks: [
                    { title: "Has title", type: "song" },
                    { type: "song" }, // no title, no songId → invalid
                ],
            })) as {
                ok: true
                committed: boolean
                results: Array<{ ok: boolean; error?: string }>
            }
            expect(r.committed).toBe(true)
            expect(r.results[0].ok).toBe(true)
            expect(r.results[1].ok).toBe(false)
            expect(r.results[1].error).toContain("title is required")
        })

        it("members are denied bulk_add_tracks", async () => {
            const id = await newSetlist(ADMIN)
            const r = await bulkAddSetlistTracks(MEMBER, {
                setlistId: id,
                tracks: [{ title: "Hijacked", type: "song" }],
            })
            expect(r).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        })
    })

    describe("swap_chart (S-004)", () => {
        it("swap_chart force-syncs title + key + fileId + fileName from the new song", async () => {
            // 2026-05-16 Bar Mitzvah session S-004: swapping with bare
            // update_track({songId}) left the operator manually cleaning
            // up title and key. swap_chart bundles it.
            await db()
                .collection("songs")
                .doc("song-other")
                .set({
                    title: "Hinei Ma Tov.pdf",
                    defaults: { key: "C", lead: "Cantor" },
                })
            const id = await newSetlist()
            // Customized title so we can prove syncMetadata: true overrides
            // it (whereas plain update_track + NOTE-1 would preserve a
            // customized title).
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
                title: "My Custom Lead-In",
                key: "Em",
            })) as { trackId: string }

            const swap = (await swapChart(ADMIN, {
                setlistId: id,
                trackId: r.trackId,
                newSongId: "song-other",
            })) as { ok: true; track: Record<string, unknown> }
            expect(swap.ok).toBe(true)

            const persisted = (
                await db().collection("tracks").doc(r.trackId).get()
            ).data()!
            expect(persisted.fileId).toBe("song-other")
            expect(persisted.fileName).toBe("Hinei Ma Tov.pdf")
            expect(persisted.title).toBe("Hinei Ma Tov")
            expect(persisted.key).toBe("C") // song-other defaults.key
        })

        it("syncMetadata: false leaves title (NOTE-1 fallback) and key untouched", async () => {
            await db()
                .collection("songs")
                .doc("song-other")
                .set({
                    title: "Hinei Ma Tov.pdf",
                    defaults: { key: "C" },
                })
            const id = await newSetlist()
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
                title: "My Custom Lead-In",
                key: "Em",
            })) as { trackId: string }

            await swapChart(ADMIN, {
                setlistId: id,
                trackId: r.trackId,
                newSongId: "song-other",
                syncMetadata: false,
            })

            const persisted = (
                await db().collection("tracks").doc(r.trackId).get()
            ).data()!
            expect(persisted.fileId).toBe("song-other")
            expect(persisted.fileName).toBe("Hinei Ma Tov.pdf") // always refreshes
            // Title preserved (NOTE-1 path: doesn't match old song's title).
            expect(persisted.title).toBe("My Custom Lead-In")
            // Key untouched.
            expect(persisted.key).toBe("Em")
        })

        it("swap_chart rejects an unknown newSongId", async () => {
            const id = await newSetlist()
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }
            const swap = await swapChart(ADMIN, {
                setlistId: id,
                trackId: r.trackId,
                newSongId: "bogus-song",
            })
            expect(swap).toMatchObject({
                ok: false,
                error: { machine_code: "song_not_found" },
                songId: "bogus-song",
            })
        })

        it("swap_chart role gate: musician denied", async () => {
            await db()
                .collection("songs")
                .doc("song-other")
                .set({ title: "Hinei Ma Tov.pdf" })
            const id = await newSetlist()
            const r = (await addTrackToSetlist(ADMIN, {
                setlistId: id,
                songId: "song-oseh",
            })) as { trackId: string }
            const swap = await swapChart(MEMBER, {
                setlistId: id,
                trackId: r.trackId,
                newSongId: "song-other",
            })
            expect(swap).toMatchObject(FORBIDDEN_ROLE_ENVELOPE)
        })
    })
})
