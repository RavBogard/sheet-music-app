import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi.fn().mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import {
    createSetlist,
    addTrackToSetlist,
    updateSetlistTrack,
    bulkAddSetlistTracks,
    bulkUpdateSetlistTracks,
} from "../tools/setlist-write"
import { getSetlist } from "../tools/setlists"
import { proposeSetlistChanges, commitStagedChanges } from "../tools/propose-changes"

/**
 * Task 5 (liturgy outlines Phase 2) — the new outline fields (book,
 * liturgyRef, honors, performer, description, estimatedMinutes) survive the
 * MCP write path. `pageNumber` is the cautionary tale: a model field with no
 * entry in server-tracks-write.ts's UPDATABLE_FIELDS allowlist is silently
 * dropped on write. These tests prove the five new fields actually persist
 * through create_setlist / add_track_to_setlist / update_track.
 */
describe("outline fields survive the MCP write path (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-outline-fields" })
        await db().collection("users").doc(ADMIN).set({ displayName: "Rabbi Daniel", role: "admin" })
    })
    afterAll(async () => { await deleteApp(app) })
    beforeEach(async () => {
        // Fix round 1 (Task 7): also clear proposal_stages so the "no
        // orphaned stage doc" assertion in the new liturgyRef reject-path
        // tests isn't polluted by leftovers from another test in this file.
        for (const col of ["setlists", "tracks", "proposal_stages"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // NOTE (Task 5 correction): createSetlist's success shape is
    // `{setlistId, trackCount, ownerId, ownerName, version}` — flat, no `ok`
    // field, no nested `setlist.id`. Confirmed against
    // mcp-setlist-write.emulator.test.ts's own `newSetlist()` helper, which
    // extracts `r.setlistId` directly. The brief's `{setlist:{id}}` cast was
    // wrong; corrected here.
    async function newSetlist() {
        const res = (await createSetlist(ADMIN, {
            name: "Erev Shabbat — outline test",
            eventDate: "2026-09-04",
            book: "crc-friday",
        })) as { setlistId: string }
        expect(res.setlistId).toBeTruthy()
        return res.setlistId
    }

    it("persists book on the setlist", async () => {
        const id = await newSetlist()
        const sl = await getSetlist(ADMIN, { id })
        expect(sl).toMatchObject({ book: "crc-friday" })
    })

    it("persists liturgyRef, honors, performer, description and estimatedMinutes on add", async () => {
        const setlistId = await newSetlist()
        const res = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Candle Lighting",
            type: "reading",
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
        expect(res).toMatchObject({ ok: true })
        const trackId = (res as { trackId: string }).trackId
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
    })

    // Fix round 2: getSetlist's per-track view is a hand-maintained field
    // list (src/lib/mcp/tools/setlists.ts), separate from the write-path
    // allowlist — a field can survive the write and still be dropped on the
    // way back out. This test reads through get_setlist (the real MCP read
    // surface), NOT a raw Firestore doc, which is what let that slip.
    it("surfaces liturgyRef, honors, performer, description and estimatedMinutes through get_setlist", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Candle Lighting",
            type: "reading",
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
        expect(added).toMatchObject({ ok: true })

        const sl = await getSetlist(ADMIN, { id: setlistId })
        expect(sl?.tracks).toHaveLength(1)
        expect(sl?.tracks[0]).toMatchObject({
            performer: "Congregation",
            description: "Blessing over the candles, read responsively.",
            estimatedMinutes: 3,
            liturgyRef: { book: "crc-friday", folio: 4 },
            honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }],
        })
    })

    it("updates outline fields through update_track's patch allowlist", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, { setlistId, title: "Mi Chamocha", type: "prayer" })
        const trackId = (added as { trackId: string }).trackId
        const res = await updateSetlistTrack(ADMIN, {
            setlistId,
            trackId,
            patch: {
                performer: "Band",
                estimatedMinutes: 4,
                liturgyRef: { book: "crc-friday", folio: 23 },
            },
        })
        expect(res).toMatchObject({ ok: true })
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            performer: "Band",
            estimatedMinutes: 4,
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
    })

    it("leaves outline fields untouched when the patch omits them", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, {
            setlistId,
            title: "Mi Chamocha",
            type: "prayer",
            performer: "Band",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
        const trackId = (added as { trackId: string }).trackId
        await updateSetlistTrack(ADMIN, { setlistId, trackId, patch: { key: "G" } })
        const doc = await db().collection("tracks").doc(trackId).get()
        expect(doc.data()).toMatchObject({
            key: "G",
            performer: "Band",
            liturgyRef: { book: "crc-friday", folio: 23 },
        })
    })

    // Fix round 1 (Task 6): `buildFieldPatch` in
    // src/lib/mcp/tools/propose-changes.ts is a fourth hand-maintained field
    // list on the staging commit path — it built the `action: 'update'`
    // proposal's Firestore patch without copying the five outline fields, so
    // a staged update proposal silently dropped `honors`/`performer`/etc. at
    // commit while add_track_to_setlist and bulk_add_tracks already carried
    // them through. propose_setlist_changes -> commit_staged_changes is the
    // sanctioned MCP authoring flow (stage, confirm, commit), so this gap
    // would have bitten the real weekly motion. Exercises the real MCP
    // handlers end-to-end and reads back through get_setlist — NOT a raw
    // Firestore doc read, which is what hid the earlier get_setlist gap.
    it("carries outline fields through a staged update proposal on commit", async () => {
        const setlistId = await newSetlist()
        const added = await addTrackToSetlist(ADMIN, { setlistId, title: "Mi Chamocha", type: "prayer" })
        const trackId = (added as { trackId: string }).trackId

        const staged = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                {
                    action: "update",
                    trackId,
                    performer: "Cantor",
                    description: "Sung responsively.",
                    estimatedMinutes: 5,
                    liturgyRef: { book: "crc-friday", folio: 12 },
                    honors: [{ name: "David Lazaroff", note: "aliyah" }],
                },
            ],
        })) as { stageId: string }
        expect(staged.stageId).toBeTruthy()

        const committed = await commitStagedChanges(ADMIN, { stageId: staged.stageId })
        expect(committed).toMatchObject({ ok: true })

        const sl = await getSetlist(ADMIN, { id: setlistId })
        expect(sl?.tracks).toHaveLength(1)
        expect(sl?.tracks[0]).toMatchObject({
            performer: "Cantor",
            description: "Sung responsively.",
            estimatedMinutes: 5,
            liturgyRef: { book: "crc-friday", folio: 12 },
            honors: [{ name: "David Lazaroff", note: "aliyah" }],
        })
    })

    describe("liturgyRef validation (emulator)", () => {
        it("rejects an unknown book slug", async () => {
            const setlistId = await newSetlist()
            const res = await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Mi Chamocha",
                type: "prayer",
                liturgyRef: { book: "not-a-book", folio: 4 },
            })
            expect(res).toMatchObject({
                ok: false,
                error: { machine_code: "unknown_book" },
            })
        })

        it("rejects a folio past the end of the book", async () => {
            const setlistId = await newSetlist()
            const res = await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Mi Chamocha",
                type: "prayer",
                liturgyRef: { book: "crc-friday", folio: 9999 },
            })
            expect(res).toMatchObject({
                ok: false,
                error: { machine_code: "folio_out_of_range" },
            })
        })

        it("rejects a unitId that is not in the named feed book", async () => {
            const setlistId = await newSetlist()
            const res = await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Barchu",
                type: "prayer",
                liturgyRef: { book: "shirei-tshuvah", unitId: "nope@nowhere", folio: 2 },
            })
            expect(res).toMatchObject({
                ok: false,
                error: { machine_code: "unknown_unit_id" },
            })
        })

        it("writes nothing when validation fails", async () => {
            const setlistId = await newSetlist()
            await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Mi Chamocha",
                type: "prayer",
                liturgyRef: { book: "not-a-book", folio: 4 },
            })
            const snap = await db().collection("tracks").get()
            expect(snap.size).toBe(0)
        })

        it("rejects an unknown book on create_setlist", async () => {
            const res = await createSetlist(ADMIN, {
                name: "Bad book",
                eventDate: "2026-09-04",
                book: "not-a-book",
            })
            expect(res).toMatchObject({ ok: false, error: { machine_code: "unknown_book" } })
        })

        // Fix round 1 (reviewer finding H): the atomic zero-write contract
        // and the no-orphan-stage-doc behaviour were previously verified by
        // code reading only. These five tests assert the actual Firestore
        // state, not just the returned envelope — asserting only the
        // envelope is exactly what would let a post-write guard slip
        // through a future refactor.

        it("bulk_add_tracks atomic: one bad liturgyRef rejects the whole batch with zero writes", async () => {
            const setlistId = await newSetlist()
            const res = await bulkAddSetlistTracks(ADMIN, {
                setlistId,
                tracks: [
                    { title: "Valid row", type: "prayer" },
                    {
                        title: "Bad row",
                        type: "prayer",
                        liturgyRef: { book: "not-a-book", folio: 1 },
                    },
                ],
                mode: "atomic",
            })
            expect(res).toMatchObject({ ok: true, committed: false })
            const snap = await db().collection("tracks").get()
            expect(snap.size).toBe(0)
        })

        it("bulk_update_tracks atomic: one bad liturgyRef rejects the whole batch, no fields change", async () => {
            const setlistId = await newSetlist()
            const t1 = (await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Track One",
                type: "prayer",
                key: "C",
            })) as { trackId: string }
            const t2 = (await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Track Two",
                type: "prayer",
                key: "D",
            })) as { trackId: string }

            const res = await bulkUpdateSetlistTracks(ADMIN, {
                setlistId,
                patches: [
                    { trackId: t1.trackId, patch: { key: "G" } },
                    {
                        trackId: t2.trackId,
                        patch: { liturgyRef: { book: "crc-friday", folio: 9999 } },
                    },
                ],
                mode: "atomic",
            })
            expect(res).toMatchObject({ ok: true, committed: false })

            const doc1 = await db().collection("tracks").doc(t1.trackId).get()
            const doc2 = await db().collection("tracks").doc(t2.trackId).get()
            expect(doc1.data()).toMatchObject({ key: "C" })
            expect(doc2.data()).toMatchObject({ key: "D" })
            expect(doc2.data()?.liturgyRef).toBeUndefined()
        })

        it("propose_setlist_changes rejects a bad liturgyRef with no orphaned stage doc", async () => {
            const setlistId = await newSetlist()
            const added = await addTrackToSetlist(ADMIN, { setlistId, title: "Mi Chamocha", type: "prayer" })
            const trackId = (added as { trackId: string }).trackId

            const res = await proposeSetlistChanges(ADMIN, {
                setlistId,
                proposals: [
                    {
                        action: "update",
                        trackId,
                        liturgyRef: { book: "not-a-book", folio: 1 },
                    },
                ],
            })
            expect(res).toMatchObject({ ok: false, error: { machine_code: "unknown_book" } })

            const stagesSnap = await db().collection("proposal_stages").get()
            expect(stagesSnap.size).toBe(0)
        })

        it("update_track rejects a bad liturgyRef and leaves the existing row untouched", async () => {
            const setlistId = await newSetlist()
            const added = await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Mi Chamocha",
                type: "prayer",
                key: "Am",
            })
            const trackId = (added as { trackId: string }).trackId

            const res = await updateSetlistTrack(ADMIN, {
                setlistId,
                trackId,
                patch: { liturgyRef: { book: "shirei-tshuvah", unitId: "nope@nowhere", folio: 2 } },
            })
            expect(res).toMatchObject({
                ok: false,
                error: { machine_code: "unknown_unit_id" },
            })

            const doc = await db().collection("tracks").doc(trackId).get()
            expect(doc.data()).toMatchObject({ key: "Am", title: "Mi Chamocha" })
            expect(doc.data()?.liturgyRef).toBeUndefined()
        })

        // Positive control: a valid feed-tier ref with a REAL unitId must
        // NOT be rejected. `emaariv.barchu@rh1-maariv` is a genuine unit id
        // read directly from src/data/books/shirei-tshuvah.json (Bar'chu,
        // folio 2) — not invented. Erring restrictive on a valid reference
        // is worse than erring permissive here (it would block real
        // authoring), so this matters as much as the reject-path tests.
        it("accepts a valid liturgyRef with a real feed-tier unitId and it survives get_setlist", async () => {
            const setlistId = await newSetlist()
            const res = await addTrackToSetlist(ADMIN, {
                setlistId,
                title: "Bar'chu",
                type: "prayer",
                liturgyRef: {
                    book: "shirei-tshuvah",
                    unitId: "emaariv.barchu@rh1-maariv",
                    folio: 2,
                },
            })
            expect(res).toMatchObject({ ok: true })

            const sl = await getSetlist(ADMIN, { id: setlistId })
            expect(sl?.tracks).toHaveLength(1)
            expect(sl?.tracks[0]).toMatchObject({
                liturgyRef: {
                    book: "shirei-tshuvah",
                    unitId: "emaariv.barchu@rh1-maariv",
                    folio: 2,
                },
            })
        })
    })
})
