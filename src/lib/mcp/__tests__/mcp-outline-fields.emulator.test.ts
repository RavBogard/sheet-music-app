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
} from "../tools/setlist-write"
import { getSetlist } from "../tools/setlists"

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
        for (const col of ["setlists", "tracks"]) {
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
})
