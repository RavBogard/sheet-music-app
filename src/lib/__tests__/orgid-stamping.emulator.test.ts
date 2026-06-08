import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * v11-01-02 — orgId stamping at every server-side CREATE path, against the
 * Firebase Local Emulator Suite.
 *
 * Goal: prove that NEW writes carry tenant scope (`orgId`), defaulting to
 * DEFAULT_ORG_ID ("crc") so existing CRC callers are unchanged, and that a
 * track ALWAYS inherits its parent setlist's orgId (never a caller param).
 *
 * HFG data-layer coverage: this touches Firestore writes (setlists/, tracks/,
 * library_index/, songs/), so it ships real-Firestore coverage. Rides the
 * `npm run test:emulator` harness (firebase emulators:exec + this *.emulator
 * glob). Storage has no local emulator in the firestore+auth run, so the
 * library-upload Storage surface is stubbed (mirrors mcp-chart-upload).
 */

// ─── Storage stub (no Storage emulator in the firestore+auth run) ──────────
// Records (path → size) so processChartUpload's atomic-guard read-verify sees
// the right byte count. Path reconstruction mirrors firebase-storage.getStoragePath.
const storageState = new Map<string, number>()
function pathFor(fileId: string, mime: string): string {
    const ext = mime.includes("pdf")
        ? ".pdf"
        : mime.includes("xml")
            ? ".xml"
            : mime.includes("audio")
                ? ".mp3"
                : ""
    return `library/${fileId}${ext}`
}
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: vi.fn(async (fileId: string, buffer: Buffer, mime: string) => {
        storageState.set(pathFor(fileId, mime), buffer.byteLength)
        return `gs://test/${pathFor(fileId, mime)}`
    }),
    getStorageObjectSize: vi.fn(async (path: string) =>
        storageState.has(path) ? storageState.get(path)! : null,
    ),
    deleteStorageObjectAtPath: vi.fn(async (path: string) => {
        storageState.delete(path)
    }),
}))

import { createSetlistServerSide } from "@/lib/setlist-write"
import { addTrack, bulkAddTracks } from "@/lib/mcp/server-tracks-write"
import { processChartUpload } from "@/lib/library-upload"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

describe("orgId stamping at server create sites (emulator)", () => {
    let app: App
    function db() {
        return getFirestore(app)
    }

    async function tracksOf(setlistId: string) {
        const snap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .sort((a, b) => (a.order as number) - (b.order as number))
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-orgid-stamping" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks", "library_index", "songs"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // ─── AC-1: setlist + seeded tracks carry orgId ─────────────────────────

    it("AC-1: createSetlistServerSide with no orgId → setlist + all seeded tracks carry 'crc'", async () => {
        const { setlistId } = await createSetlistServerSide({
            name: "Shabbat Morning",
            ownerId: "uid-1",
            ownerName: "Rabbi Daniel",
            tracks: [
                { type: "header", title: "Pre-Service" },
                { type: "song", title: "Adon Olam" },
                { type: "song", title: "Hineh Mah Tov" },
            ],
        })

        const s = (await db().collection("setlists").doc(setlistId).get()).data()!
        expect(s.orgId).toBe(DEFAULT_ORG_ID)
        expect(s.orgId).toBe("crc")

        const tracks = await tracksOf(setlistId)
        expect(tracks).toHaveLength(3)
        for (const t of tracks) expect(t.orgId).toBe("crc")
    })

    it("AC-1: createSetlistServerSide with orgId='brotherslazaroff' → setlist + all seeded tracks carry it", async () => {
        const { setlistId } = await createSetlistServerSide({
            name: "BL Set",
            ownerId: "uid-bl",
            ownerName: "David Lazaroff",
            orgId: "brotherslazaroff",
            tracks: [
                { type: "song", title: "Song A" },
                { type: "song", title: "Song B" },
            ],
        })

        const s = (await db().collection("setlists").doc(setlistId).get()).data()!
        expect(s.orgId).toBe("brotherslazaroff")

        const tracks = await tracksOf(setlistId)
        expect(tracks).toHaveLength(2)
        for (const t of tracks) expect(t.orgId).toBe("brotherslazaroff")
    })

    // ─── AC-2: later-added tracks inherit the PARENT setlist's orgId ───────

    it("AC-2: addTrack into a brotherslazaroff setlist → new track carries 'brotherslazaroff'", async () => {
        const { setlistId } = await createSetlistServerSide({
            name: "BL Set",
            ownerId: "uid-bl",
            ownerName: "David Lazaroff",
            orgId: "brotherslazaroff",
            tracks: [{ type: "song", title: "Existing" }],
        })

        const { trackId } = await addTrack(db(), {
            setlistId,
            type: "song",
            title: "Added Later",
        })

        const t = (await db().collection("tracks").doc(trackId).get()).data()!
        expect(t.orgId).toBe("brotherslazaroff")
    })

    it("AC-2: addTrack into a legacy setlist with NO orgId field → new track falls back to 'crc'", async () => {
        // Simulate a pre-backfill setlist: write the parent doc directly with
        // no orgId field, then add a track via the server path.
        const setlistId = "legacy-no-orgid"
        await db().collection("setlists").doc(setlistId).set({
            id: setlistId,
            name: "Legacy",
            trackCount: 0,
            ownerId: "uid-legacy",
        })

        const { trackId } = await addTrack(db(), {
            setlistId,
            type: "song",
            title: "First Track",
        })

        const t = (await db().collection("tracks").doc(trackId).get()).data()!
        expect(t.orgId).toBe(DEFAULT_ORG_ID)
        expect(t.orgId).toBe("crc")
    })

    it("AC-2: bulkAddTracks inherits the parent setlist's orgId on every inserted row", async () => {
        const { setlistId } = await createSetlistServerSide({
            name: "BL Set",
            ownerId: "uid-bl",
            ownerName: "David Lazaroff",
            orgId: "brotherslazaroff",
            tracks: [{ type: "song", title: "Seed" }],
        })

        const res = await bulkAddTracks(db(), setlistId, [
            { type: "song", title: "Bulk 1" },
            { type: "song", title: "Bulk 2" },
        ])
        expect(res.ok).toBe(true)

        const tracks = await tracksOf(setlistId)
        expect(tracks).toHaveLength(3)
        for (const t of tracks) expect(t.orgId).toBe("brotherslazaroff")
    })

    // ─── AC-3 (create-path half): library_index + songs carry orgId ────────

    it("AC-3: processChartUpload with no orgId → library_index + songs both carry 'crc'", async () => {
        const result = await processChartUpload({
            buffer: Buffer.from("X: chord chart text", "utf-8"),
            originalFileName: "Test Chart.txt",
            mimeType: "text/plain",
            uploaderUid: "uid-1",
        })
        expect(result.ok).toBe(true)
        const fileId = (result as { fileId: string }).fileId

        const idx = (await db().collection("library_index").doc(fileId).get()).data()!
        const song = (await db().collection("songs").doc(fileId).get()).data()!
        expect(idx.orgId).toBe(DEFAULT_ORG_ID)
        expect(idx.orgId).toBe("crc")
        expect(song.orgId).toBe("crc")
    })

    it("AC-3: processChartUpload with orgId='brotherslazaroff' → library_index + songs both carry it", async () => {
        const result = await processChartUpload({
            buffer: Buffer.from("X: another chart", "utf-8"),
            originalFileName: "BL Chart.txt",
            mimeType: "text/plain",
            uploaderUid: "uid-bl",
            orgId: "brotherslazaroff",
        })
        expect(result.ok).toBe(true)
        const fileId = (result as { fileId: string }).fileId

        const idx = (await db().collection("library_index").doc(fileId).get()).data()!
        const song = (await db().collection("songs").doc(fileId).get()).data()!
        expect(idx.orgId).toBe("brotherslazaroff")
        expect(song.orgId).toBe("brotherslazaroff")
    })
})
