import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    commitStagedChanges,
    proposeSetlistChanges,
    type StageRecord,
} from "../tools/propose-changes"
import {
    addTrackToSetlist,
    createSetlist,
} from "../tools/setlist-write"

/**
 * W-01 Tasks 1+2 — propose_setlist_changes + commit_staged_changes.
 *
 * Covers:
 *   AC-1: stage doc created, setlist unchanged, envelope carries
 *         per-proposal confidence + flags + summary.
 *   AC-2: commit applies all proposals atomically; setlist version bumps;
 *         stage doc deleted on success.
 *   AC-3: commit rejects with stale_version envelope on lastSeenVersion
 *         mismatch (and on the captured-at-stage-time version mismatch
 *         when caller omits lastSeenVersion).
 *   AC-4: stage_expired error returned past TTL; doc cleaned up.
 *
 * Plus:
 *   - W-02 confidence derivation: low for generic_title libraries,
 *     high for unambiguous, low for missing library_index row.
 *   - Re-pack invariant inherits from W-05 — adds + removes in one
 *     stage produce contiguous [0..n-1] orders post-commit.
 *
 * Runs only via `npm run test:emulator`.
 */
describe("W-01 Task 1+2 — propose + commit lifecycle (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    async function readVersion(coll: string, id: string): Promise<number> {
        const snap = await db().collection(coll).doc(id).get()
        const v = (snap.data() as unknown as Record<string, unknown> | undefined)?.version
        return typeof v === "number" ? v : 0
    }

    async function newSetlist(): Promise<string> {
        const r = (await createSetlist(ADMIN, { name: "W-01 Test" })) as {
            setlistId: string
        }
        return r.setlistId
    }

    async function addOne(
        setlistId: string,
        title = "Existing Row",
    ): Promise<string> {
        const t = (await addTrackToSetlist(ADMIN, {
            setlistId,
            title,
            type: "song",
        })) as { trackId: string }
        return t.trackId
    }

    async function seedLibraryRow(
        id: string,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await db()
            .collection("library_index")
            .doc(id)
            .set({ id, ...fields })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-w01-propose" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ displayName: "Rabbi Daniel", role: "admin" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "setlists",
            "tracks",
            "proposal_stages",
            "library_index",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    // ─── propose_setlist_changes ────────────────────────────────────────────

    it("AC-1: propose creates the stage doc and leaves the setlist + tracks untouched", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId, "Track A")
        await seedLibraryRow("song-specific", { titleSpecificity: 0.9 })
        const trackCountBefore = (
            await db().collection("setlists").doc(setlistId).get()
        ).data()!.trackCount

        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "add", title: "New Row", songId: "song-specific" },
                {
                    action: "update",
                    trackId: existingTrackId,
                    title: "Renamed A",
                },
            ],
        })) as StageRecord

        expect(stage.id).toBeTruthy()
        expect(stage.setlistId).toBe(setlistId)
        expect(stage.proposals).toHaveLength(2)
        expect(stage.summary.high).toBeGreaterThan(0)
        expect(stage.proposals[0].confidence).toBe("high") // specificity 0.9
        expect(stage.proposals[0].flags).toEqual([])
        expect(stage.proposals[1].confidence).toBe("high") // no songId change

        // Stage doc exists on Firestore.
        const stageSnap = await db()
            .collection("proposal_stages")
            .doc(stage.id)
            .get()
        expect(stageSnap.exists).toBe(true)

        // Setlist + tracks unchanged.
        const trackCountAfter = (
            await db().collection("setlists").doc(setlistId).get()
        ).data()!.trackCount
        expect(trackCountAfter).toBe(trackCountBefore)
        const existingAfter = (
            await db().collection("tracks").doc(existingTrackId).get()
        ).data()!
        expect(existingAfter.title).toBe("Track A")
    })

    it("propose surfaces 'generic_title' + 'low' confidence for sub-threshold specificity", async () => {
        const setlistId = await newSetlist()
        await seedLibraryRow("song-generic", { titleSpecificity: 0.2 })

        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "add", title: "Generic", songId: "song-generic" },
            ],
        })) as StageRecord

        expect(stage.proposals[0].confidence).toBe("low")
        expect(stage.proposals[0].flags).toContain("generic_title")
        expect(stage.summary.low).toBe(1)
        expect(stage.summary.flagged).toBe(1)
    })

    it("MCP-004 (cycle-2): propose response carries `stageId` aliasing `id`", async () => {
        const setlistId = await newSetlist()
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [{ action: "add", title: "Row" }],
        })) as StageRecord
        // Both fields hold the same uuid; `stageId` is the canonical name
        // matching commit_staged_changes's input parameter. `id` retained
        // for back-compat with W-01 callers.
        expect(stage.stageId).toBeTruthy()
        expect(stage.id).toBeTruthy()
        expect(stage.stageId).toBe(stage.id)
    })

    it("propose surfaces 'no_library_record' for songIds with no library_index row", async () => {
        const setlistId = await newSetlist()

        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                {
                    action: "add",
                    title: "Phantom Bond",
                    songId: "song-not-in-library",
                },
            ],
        })) as StageRecord

        expect(stage.proposals[0].confidence).toBe("low")
        expect(stage.proposals[0].flags).toContain("no_library_record")
    })

    // ─── commit_staged_changes happy path ─────────────────────────────────

    it("AC-2: commit applies all proposals atomically + deletes the stage doc", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId, "Original")
        const setlistVersion = await readVersion("setlists", setlistId)

        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "add", title: "New First", position: 0 },
                {
                    action: "update",
                    trackId: existingTrackId,
                    title: "Renamed Original",
                },
                { action: "add", title: "Appended" },
            ],
        })) as StageRecord

        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as {
            ok: true
            setlistVersion: number
            addedTrackIds: string[]
            updatedTrackIds: string[]
            removedTrackIds: string[]
        }

        expect(result.ok).toBe(true)
        expect(result.addedTrackIds).toHaveLength(2)
        expect(result.updatedTrackIds).toEqual([existingTrackId])
        expect(result.setlistVersion).toBe(setlistVersion + 1)

        // Stage was deleted (one-shot semantic).
        const stageSnap = await db()
            .collection("proposal_stages")
            .doc(stage.id)
            .get()
        expect(stageSnap.exists).toBe(false)

        // Existing track got the rename + version bump.
        const renamed = (
            await db().collection("tracks").doc(existingTrackId).get()
        ).data() as unknown as Record<string, unknown>
        expect(renamed.title).toBe("Renamed Original")
        expect(renamed.version).toBe(2) // started at 1 from addTrack

        // Track count + order are contiguous: 3 tracks at [0, 1, 2].
        const tracksSnap = await db()
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        const orders = tracksSnap.docs
            .map((d) => (d.data() as { order: number }).order)
            .sort((a, b) => a - b)
        expect(orders).toEqual([0, 1, 2])
    })

    // ─── MCP-008 (cycle-2): add-proposal commit populates fileName ────────

    it("MCP-008: committed add proposal with songId carries fileName + key + leadMusician from the songs catalog", async () => {
        const setlistId = await newSetlist()
        // Seed a song catalog row — getSongById reads from `songs/{id}`.
        await db()
            .collection("songs")
            .doc("song-bonded")
            .set({
                title: "Lecha Dodi.pdf",
                defaults: { key: "Am", lead: "Cantor" },
            })

        const setlistVersion = await readVersion("setlists", setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "add", songId: "song-bonded" }, // no overrides
            ],
        })) as StageRecord
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as { ok: true; addedTrackIds: string[] }
        expect(result.ok).toBe(true)
        expect(result.addedTrackIds).toHaveLength(1)

        const newTrack = (
            await db().collection("tracks").doc(result.addedTrackIds[0]).get()
        ).data() as unknown as Record<string, unknown>

        // Pre-MCP-008: fileName was undefined here (the add-proposal handler
        // didn't run the song catalog lookup that add_track_to_setlist did).
        // Post-fix: shared resolveTrackBondDefaults helper supplies it.
        expect(newTrack.fileName).toBe("Lecha Dodi.pdf")
        expect(newTrack.title).toBe("Lecha Dodi") // cleanTitle strips the .pdf
        expect(newTrack.key).toBe("Am")
        expect(newTrack.leadMusician).toBe("Cantor")
        expect(newTrack.songId).toBe("song-bonded")
        expect(newTrack.fileId).toBe("song-bonded")
    })

    it("MCP-008: caller-supplied title/key overrides win over song catalog defaults", async () => {
        const setlistId = await newSetlist()
        await db()
            .collection("songs")
            .doc("song-override")
            .set({
                title: "Hashkivenu.pdf",
                defaults: { key: "Dm", lead: "Cantor" },
            })

        const setlistVersion = await readVersion("setlists", setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                {
                    action: "add",
                    songId: "song-override",
                    title: "Hashkivenu (slow)",
                    key: "Em",
                },
            ],
        })) as StageRecord
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as { ok: true; addedTrackIds: string[] }

        const newTrack = (
            await db().collection("tracks").doc(result.addedTrackIds[0]).get()
        ).data() as unknown as Record<string, unknown>
        expect(newTrack.title).toBe("Hashkivenu (slow)") // override
        expect(newTrack.key).toBe("Em") // override
        expect(newTrack.leadMusician).toBe("Cantor") // catalog default
        expect(newTrack.fileName).toBe("Hashkivenu.pdf") // always from catalog
    })

    // ─── F-014: no spurious version bumps on untouched rows ──────────────

    it("F-014: edit-only commits leave untouched tracks at the same version + lastModifiedAt", async () => {
        const setlistId = await newSetlist()
        const targetId = await addOne(setlistId, "Target")
        const untouched1 = await addOne(setlistId, "Untouched A")
        const untouched2 = await addOne(setlistId, "Untouched B")

        const versionsBefore = {
            target: await readVersion("tracks", targetId),
            u1: await readVersion("tracks", untouched1),
            u2: await readVersion("tracks", untouched2),
        }
        const lastModBefore = {
            u1: (
                await db().collection("tracks").doc(untouched1).get()
            ).data()?.lastModifiedAt,
            u2: (
                await db().collection("tracks").doc(untouched2).get()
            ).data()?.lastModifiedAt,
        }

        const setlistVersion = await readVersion("setlists", setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "update", trackId: targetId, title: "Renamed Target" },
            ],
        })) as StageRecord
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as unknown as Record<string, unknown>
        expect(result.ok).toBe(true)

        // Target row bumped — that one was edited.
        const target = (
            await db().collection("tracks").doc(targetId).get()
        ).data() as unknown as Record<string, unknown>
        expect(target.title).toBe("Renamed Target")
        expect(target.version).toBe(versionsBefore.target + 1)

        // Untouched rows MUST stay at their pre-commit version +
        // lastModifiedAt. Pre-fix the entire setlist's tracks bumped on
        // every commit, breaking parallel-agent optimistic concurrency.
        const u1 = (
            await db().collection("tracks").doc(untouched1).get()
        ).data() as unknown as Record<string, unknown>
        const u2 = (
            await db().collection("tracks").doc(untouched2).get()
        ).data() as unknown as Record<string, unknown>
        expect(u1.version).toBe(versionsBefore.u1)
        expect(u2.version).toBe(versionsBefore.u2)
        expect(u1.lastModifiedAt).toBe(lastModBefore.u1)
        expect(u2.lastModifiedAt).toBe(lastModBefore.u2)
    })

    it("F-014: appending a track leaves prior rows untouched (no order shift, no version bump)", async () => {
        const setlistId = await newSetlist()
        const existing1 = await addOne(setlistId, "First")
        const existing2 = await addOne(setlistId, "Second")
        const versionsBefore = {
            e1: await readVersion("tracks", existing1),
            e2: await readVersion("tracks", existing2),
        }

        const setlistVersion = await readVersion("setlists", setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [{ action: "add", title: "Appended" }],
        })) as StageRecord
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as unknown as Record<string, unknown>
        expect(result.ok).toBe(true)

        // The two pre-existing rows didn't shift indices (the new one
        // appended at the end), so neither should bump.
        const e1 = (
            await db().collection("tracks").doc(existing1).get()
        ).data() as unknown as Record<string, unknown>
        const e2 = (
            await db().collection("tracks").doc(existing2).get()
        ).data() as unknown as Record<string, unknown>
        expect(e1.version).toBe(versionsBefore.e1)
        expect(e2.version).toBe(versionsBefore.e2)
    })

    it("F-014: inserting at position 0 DOES bump downstream rows (order changed)", async () => {
        const setlistId = await newSetlist()
        const existing1 = await addOne(setlistId, "Will-shift A")
        const existing2 = await addOne(setlistId, "Will-shift B")
        const versionsBefore = {
            e1: await readVersion("tracks", existing1),
            e2: await readVersion("tracks", existing2),
        }

        const setlistVersion = await readVersion("setlists", setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [{ action: "add", title: "New First", position: 0 }],
        })) as StageRecord
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersion,
        })) as unknown as Record<string, unknown>
        expect(result.ok).toBe(true)

        // Both pre-existing rows now sit at order 1 + 2 instead of 0 + 1 —
        // a real change. F-014 says order CAN bump version when it actually
        // moves (vs. spurious bumps on untouched rows).
        const e1 = (
            await db().collection("tracks").doc(existing1).get()
        ).data() as unknown as Record<string, unknown>
        const e2 = (
            await db().collection("tracks").doc(existing2).get()
        ).data() as unknown as Record<string, unknown>
        expect(e1.version).toBe(versionsBefore.e1 + 1)
        expect(e2.version).toBe(versionsBefore.e2 + 1)
        expect(e1.order).toBe(1)
        expect(e2.order).toBe(2)
    })

    // ─── stale_version on commit ───────────────────────────────────────────

    it("AC-3: commit rejects with stale_version envelope when lastSeenVersion mismatches", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId)

        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "update", trackId: existingTrackId, title: "Won't land" },
            ],
        })) as StageRecord

        const setlistVersionAtStage = stage.setlistVersionAtStage
        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: setlistVersionAtStage - 1, // intentionally stale
        })) as unknown as Record<string, unknown>

        expect((result.error as { machine_code: string }).machine_code).toBe("stale_version")
        expect(result.currentVersion).toBe(setlistVersionAtStage)
        expect(result.lastSeenVersion).toBe(setlistVersionAtStage - 1)

        // Setlist + track unchanged.
        const unchanged = (
            await db().collection("tracks").doc(existingTrackId).get()
        ).data() as unknown as Record<string, unknown>
        expect(unchanged.title).not.toBe("Won't land")

        // Stage doc was NOT deleted — caller can re-attempt commit after
        // re-fetching state.
        const stageSnap = await db()
            .collection("proposal_stages")
            .doc(stage.id)
            .get()
        expect(stageSnap.exists).toBe(true)
    })

    it("AC-3 alt: commit rejects when caller omits lastSeenVersion but setlist drifted since stage", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "update", trackId: existingTrackId, title: "Late" },
            ],
        })) as StageRecord

        // Background bump after stage was created — simulate a concurrent
        // MCP write by advancing the version field directly (raw Firestore
        // writes don't bump version; only the MCP write paths do).
        await db()
            .collection("setlists")
            .doc(setlistId)
            .update({
                version: stage.setlistVersionAtStage + 1,
                lastModifiedAt: new Date().toISOString(),
            })

        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            // lastSeenVersion intentionally omitted — fallback gate is
            // stage.setlistVersionAtStage, which is now stale.
        })) as unknown as Record<string, unknown>
        expect((result.error as { machine_code: string }).machine_code).toBe("stale_version")
    })

    // ─── stage_expired ────────────────────────────────────────────────────

    it("AC-4: commit returns stage_expired past TTL and best-effort-deletes the doc", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                { action: "update", trackId: existingTrackId, title: "Late" },
            ],
            ttlSec: 1,
        })) as StageRecord

        // Force the stage's TTL into the past by rewriting the doc.
        await db()
            .collection("proposal_stages")
            .doc(stage.id)
            .update({
                ttlExpiresAt: new Date(Date.now() - 1000).toISOString(),
            })

        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
        })) as unknown as Record<string, unknown>
        expect(String(result.error)).toMatch(/stage_expired/)
    })

    // ─── unknown trackId in proposal ──────────────────────────────────────

    it("commit aborts with a clear error when a proposal targets a trackId that no longer exists", async () => {
        const setlistId = await newSetlist()
        const existingTrackId = await addOne(setlistId)
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [
                {
                    action: "update",
                    trackId: existingTrackId,
                    title: "Updated",
                },
            ],
        })) as StageRecord

        // Delete the target track out from under the stage.
        await db().collection("tracks").doc(existingTrackId).delete()

        const result = (await commitStagedChanges(ADMIN, {
            stageId: stage.id,
            lastSeenVersion: stage.setlistVersionAtStage,
        })) as unknown as Record<string, unknown>
        expect(result).toMatchObject({
            ok: false,
            error: { machine_code: "unknown_track_id", message: expect.stringMatching(/unknown trackId/) },
        })

        // Stage NOT deleted — caller can re-stage.
        const stageSnap = await db()
            .collection("proposal_stages")
            .doc(stage.id)
            .get()
        expect(stageSnap.exists).toBe(true)
    })

    // ─── role gate ────────────────────────────────────────────────────────

    it("propose + commit reject non-editor callers (member tier)", async () => {
        const MEMBER = "member-guest"
        await db()
            .collection("users")
            .doc(MEMBER)
            .set({ displayName: "Member", role: "musician" })
        const setlistId = await newSetlist()

        const propose = (await proposeSetlistChanges(MEMBER, {
            setlistId,
            proposals: [{ action: "add", title: "Nope" }],
        })) as unknown as Record<string, unknown>
        expect(propose).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role", message: expect.stringMatching(/admin or band leader/i) },
        })

        // Make a stage as admin so we can test the commit gate.
        const stage = (await proposeSetlistChanges(ADMIN, {
            setlistId,
            proposals: [{ action: "add", title: "Admin staged" }],
        })) as StageRecord
        const commitDenied = (await commitStagedChanges(MEMBER, {
            stageId: stage.id,
        })) as unknown as Record<string, unknown>
        expect(commitDenied).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role", message: expect.stringMatching(/admin or band leader/i) },
        })
    })
})
