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

import { previewPublish } from "../tools/preview-publish"
import {
    flagBond,
    recordBondCorrection,
    reviewFlaggedBonds,
} from "../tools/bond-corrections"
import {
    addTrackToSetlist,
    createSetlist,
    updateSetlistTrack,
} from "../tools/setlist-write"

/**
 * W-01 Tasks 3 + 4 + 5 — preview_publish wrapper, flag/review/record loop.
 *
 * Covers:
 *   AC-5: preview_publish reformats publish_setlist({dryRun:true}) into
 *         {chartHealth, audience, snapshotDiff, flaggedBonds, recommendation}.
 *   AC-6: flag → review → record_bond_correction round-trip writes the
 *         audit doc, bumps library_index counters, deletes the flag.
 *   Plus: hint-doc inline aggregation fires at the 3-pick threshold,
 *         stays silent below it.
 *
 * Runs only via `npm run test:emulator`.
 */

// Stub the chart-health probe (publish_setlist calls it via getChartHealth)
// so it doesn't go to the network. Status is decided per-fileId via the
// `__charts` registry below. Mock must be defined here so it applies to
// all dynamic imports — publish_setlist imports getChartHealth at the
// module top, so the mock has to register before publish_setlist loads.
const __charts: Record<string, "ok" | "missing" | "unreachable"> = {}
vi.mock("@/lib/file-fetcher", async () => {
    return {
        getChartHealth: async (fileId: string) => {
            const status = __charts[fileId] ?? "ok"
            if (status === "missing") {
                return { status: "missing", reason: "Not found" }
            }
            if (status === "unreachable") {
                return { status: "unreachable", error: "Timeout" }
            }
            return { status: "ok", source: "firebase-storage" }
        },
    }
})
// Skip the actual notification fan-out — publish_setlist dryRun bails
// before sending anyway, but mocking these surfaces makes the test
// hermetic from email/push/SMS providers.
vi.mock("@/lib/email", () => ({
    emailAllMembers: async () => ({ sent: 0, failed: 0 }),
}))
vi.mock("@/lib/push-send", () => ({
    sendPushToUsers: async () => ({ sent: 0, failed: 0 }),
}))
vi.mock("@/lib/sms", () => ({
    sendSMS: async () => undefined,
}))
vi.mock("@/lib/song-usage", () => ({
    recordSongUsage: async () => undefined,
}))

describe("W-01 Tasks 3+4+5 — preview/flag/review/record (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-lazaroff"

    function db() {
        return getFirestore(app)
    }

    async function newSetlist(extra: Record<string, unknown> = {}): Promise<string> {
        const r = (await createSetlist(ADMIN, {
            name: "W-01 Tasks 3-5",
        })) as { setlistId: string }
        if (Object.keys(extra).length > 0) {
            await db().collection("setlists").doc(r.setlistId).update(extra)
        }
        return r.setlistId
    }

    async function addBondedTrack(
        setlistId: string,
        title: string,
        songId: string,
    ): Promise<string> {
        // Seed a minimal songs/{id} so add_track can derive title/fileId
        // through the song-lookup callback. Avoids depending on a real
        // library_index row for the add path.
        await db()
            .collection("songs")
            .doc(songId)
            .set({ id: songId, title })
        const t = (await addTrackToSetlist(ADMIN, {
            setlistId,
            songId,
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
            .set({ id, name: (fields.name as string) ?? id, ...fields })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-w01-preview-bonds" })
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({
                displayName: "Rabbi Daniel",
                email: "rabbi@example.com",
                role: "admin",
            })
        await db()
            .collection("users")
            .doc(BAND_LEADER)
            .set({
                displayName: "David Lazaroff",
                email: "david@example.com",
                role: "band_leader",
            })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "setlists",
            "tracks",
            "songs",
            "library_index",
            "bond_flags",
            "bond_corrections",
            "titleContextHints",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        for (const k of Object.keys(__charts)) delete __charts[k]
    })

    // ─── AC-5: preview_publish ──────────────────────────────────────────────

    it("AC-5: preview_publish reformats the dryRun envelope and recommends 'publish' on clean state", async () => {
        const setlistId = await newSetlist({ templateType: "shabbat-morning" })
        await addBondedTrack(setlistId, "Oseh Shalom", "song-oseh")
        __charts["song-oseh"] = "ok"

        const r = (await previewPublish(ADMIN, { setlistId })) as Record<
            string,
            unknown
        >

        expect(r.ok).toBe(true)
        expect((r.chartHealth as { bondedCount: number }).bondedCount).toBe(1)
        expect((r.chartHealth as { okCount: number }).okCount).toBe(1)
        expect((r.chartHealth as { missingCount: number }).missingCount).toBe(0)
        expect((r.audience as { count: number }).count).toBeGreaterThanOrEqual(1)
        expect(
            (r.audience as { breakdown: { band_leader: number } }).breakdown
                .band_leader,
        ).toBe(1)
        expect(r.flaggedBonds).toBe(0)
        expect(r.recommendation).toBe("publish")
    })

    it("AC-5: preview_publish returns 'hard_block' when any chart is missing", async () => {
        const setlistId = await newSetlist()
        await addBondedTrack(setlistId, "Hashkivenu", "song-broken")
        __charts["song-broken"] = "missing"

        const r = (await previewPublish(ADMIN, { setlistId })) as Record<
            string,
            unknown
        >

        expect((r.chartHealth as { missingCount: number }).missingCount).toBe(1)
        // F-006: preview_publish exposes the same `unhealthy[]` field name as
        // publish_setlist (renamed from the original `details[]`).
        expect(
            (
                r.chartHealth as {
                    unhealthy: Array<{ status: string; fileId: string }>
                }
            ).unhealthy,
        ).toEqual([
            expect.objectContaining({ status: "missing", fileId: "song-broken" }),
        ])
        expect(r.recommendation).toBe("hard_block")
    })

    it("AC-5: preview_publish returns 'review_first' when flagged bonds exist", async () => {
        const setlistId = await newSetlist()
        const trackId = await addBondedTrack(setlistId, "Adon Olam", "song-adon")
        __charts["song-adon"] = "ok"
        await flagBond(ADMIN, {
            setlistId,
            trackId,
            reason: "generic title, only result",
        })

        const r = (await previewPublish(ADMIN, { setlistId })) as Record<
            string,
            unknown
        >

        expect(r.flaggedBonds).toBe(1)
        expect(r.recommendation).toBe("review_first")
    })

    it("AC-5: snapshotDiff lists added / removed rows vs. previous publishedSnapshot", async () => {
        const setlistId = await newSetlist()
        await addBondedTrack(setlistId, "Kept Song", "song-kept")
        await addBondedTrack(setlistId, "Newly Added", "song-new")
        // Simulate a previous publish that bonded Kept + Removed (no Newly).
        await db()
            .collection("setlists")
            .doc(setlistId)
            .update({
                publishedAt: new Date(),
                publishedSnapshot: [
                    { title: "Kept Song", key: "", fileId: "song-kept" },
                    { title: "Removed Song", key: "", fileId: "song-gone" },
                ],
            })

        const r = (await previewPublish(ADMIN, { setlistId })) as {
            snapshotDiff: {
                addedTracks: Array<{ fileId: string }>
                removedTracks: Array<{ fileId: string }>
            }
        }

        const addedIds = r.snapshotDiff.addedTracks.map((t) => t.fileId)
        const removedIds = r.snapshotDiff.removedTracks.map((t) => t.fileId)
        expect(addedIds).toContain("song-new")
        expect(removedIds).toContain("song-gone")
    })

    // ─── AC-6: flag → review round-trip ─────────────────────────────────────

    it("AC-6: flag_bond writes the doc and review_flagged_bonds joins with current track + alternatives", async () => {
        const setlistId = await newSetlist({ templateType: "shabbat-morning" })
        const trackId = await addBondedTrack(setlistId, "Hashkivenu", "song-a")
        // Two alternative library rows the agent could suggest.
        await seedLibraryRow("song-alt-1", {
            name: "Hashkivenu (Freelander)",
            stem: "hashkivenu",
            titleSpecificity: 0.8,
        })
        await seedLibraryRow("song-alt-2", {
            name: "Hashkivenu (Klepper)",
            stem: "hashkivenu",
            titleSpecificity: 0.8,
        })
        // Catalog rows for search_library to find by title.
        await db().collection("songs").doc("song-alt-1").set({
            id: "song-alt-1",
            title: "Hashkivenu (Freelander)",
        })
        await db().collection("songs").doc("song-alt-2").set({
            id: "song-alt-2",
            title: "Hashkivenu (Klepper)",
        })

        await flagBond(ADMIN, {
            setlistId,
            trackId,
            reason: "generic title",
        })
        const flagSnap = await db()
            .collection("bond_flags")
            .doc(`${setlistId}_${trackId}`)
            .get()
        expect(flagSnap.exists).toBe(true)

        const review = (await reviewFlaggedBonds(ADMIN, { setlistId })) as {
            count: number
            rows: Array<{
                trackId: string
                reason: string
                alternatives: Array<{ songId: string; title: string }>
            }>
        }
        expect(review.count).toBe(1)
        expect(review.rows[0].trackId).toBe(trackId)
        expect(review.rows[0].reason).toBe("generic title")
        const altIds = review.rows[0].alternatives.map((a) => a.songId)
        expect(altIds).toContain("song-alt-1")
        expect(altIds).toContain("song-alt-2")
        // Current bonded songId should be excluded from alternatives.
        expect(altIds).not.toContain("song-a")
    })

    // ─── AC-6: record_bond_correction ───────────────────────────────────────

    it("AC-6: record_bond_correction writes audit doc, bumps counters, deletes the flag", async () => {
        const setlistId = await newSetlist({ templateType: "shabbat-morning" })
        const trackId = await addBondedTrack(setlistId, "Hashkivenu", "song-a")
        await seedLibraryRow("song-a", {
            name: "Hashkivenu",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        })
        await seedLibraryRow("song-b", {
            name: "Hashkivenu (Klepper)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        })
        await flagBond(ADMIN, { setlistId, trackId, reason: "wrong" })

        const result = (await recordBondCorrection(ADMIN, {
            setlistId,
            trackId,
            fromSongId: "song-a",
            toSongId: "song-b",
            reason: "wrong arrangement",
        })) as {
            ok: true
            correctionId: string
            correctedToAfter: number
            hintPromoted: boolean
        }

        expect(result.ok).toBe(true)
        expect(result.correctedToAfter).toBe(1)
        expect(result.hintPromoted).toBe(false) // 1 < 3 threshold

        // Audit doc written.
        const auditSnap = await db()
            .collection("bond_corrections")
            .doc(result.correctionId)
            .get()
        expect(auditSnap.exists).toBe(true)
        const audit = auditSnap.data() as Record<string, unknown>
        expect(audit.fromSongId).toBe("song-a")
        expect(audit.toSongId).toBe("song-b")
        expect(audit.contextKey).toBe("shabbat-morning")

        // Counters bumped on both sides.
        const fromSnap = await db()
            .collection("library_index")
            .doc("song-a")
            .get()
        const fromHist = (fromSnap.data() as {
            bondCorrectionHistory: { correctedAwayFrom: number }
        }).bondCorrectionHistory
        expect(fromHist.correctedAwayFrom).toBe(1)

        const toSnap = await db()
            .collection("library_index")
            .doc("song-b")
            .get()
        const toHist = (toSnap.data() as {
            bondCorrectionHistory: { correctedTo: number }
        }).bondCorrectionHistory
        expect(toHist.correctedTo).toBe(1)

        // Flag deleted (one-shot).
        const flagSnap = await db()
            .collection("bond_flags")
            .doc(`${setlistId}_${trackId}`)
            .get()
        expect(flagSnap.exists).toBe(false)
    })

    it("inline aggregation: hint doc promotes at N=3 picks, stays silent below", async () => {
        // Three setlists in the same contextKey, each correcting song-a → song-b.
        await seedLibraryRow("song-b", {
            name: "Hashkivenu (Klepper)",
            stem: "hashkivenu",
        })
        await seedLibraryRow("song-a", {
            name: "Hashkivenu",
            stem: "hashkivenu",
        })

        for (let i = 0; i < 3; i++) {
            const setlistId = await newSetlist({
                templateType: "shabbat-morning",
            })
            const trackId = await addBondedTrack(
                setlistId,
                `Hashkivenu ${i}`,
                "song-a",
            )
            const result = (await recordBondCorrection(ADMIN, {
                setlistId,
                trackId,
                fromSongId: "song-a",
                toSongId: "song-b",
            })) as { correctedToAfter: number; hintPromoted: boolean }
            expect(result.correctedToAfter).toBe(i + 1)
            // Below threshold no hint doc yet; at threshold (i === 2) it promotes.
            expect(result.hintPromoted).toBe(i === 2)
        }

        // Hint doc now reflects preferredFileId = song-b.
        const hintSnap = await db()
            .collection("titleContextHints")
            .doc("hashkivenu_shabbat-morning")
            .get()
        expect(hintSnap.exists).toBe(true)
        const hint = hintSnap.data() as Record<string, unknown>
        expect(hint.preferredFileId).toBe("song-b")
        expect(hint.picks).toBe(3)
    })

    it("record_bond_correction rejects same fromSongId === toSongId", async () => {
        const setlistId = await newSetlist()
        const trackId = await addBondedTrack(setlistId, "Hashkivenu", "song-a")
        const r = (await recordBondCorrection(ADMIN, {
            setlistId,
            trackId,
            fromSongId: "song-a",
            toSongId: "song-a",
        })) as { ok: false; error: string; message: string }
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
            message: expect.stringMatching(/must differ/),
        })
    })

    it("flag_bond refuses when the track belongs to a different setlist", async () => {
        const setlistA = await newSetlist()
        const setlistB = await newSetlist()
        const trackId = await addBondedTrack(setlistA, "Adon Olam", "song-x")

        const r = (await flagBond(ADMIN, {
            setlistId: setlistB,
            trackId,
            reason: "wrong setlist",
        })) as { ok: false; error: string; message: string }
        expect(r).toMatchObject({
            ok: false,
            error: "track_setlist_mismatch",
            message: expect.stringMatching(/does not belong to setlist/),
        })
    })

    it("band_leader can flag + record corrections (parity with admin)", async () => {
        const setlistId = await newSetlist({ templateType: "friday-evening" })
        const trackId = await addBondedTrack(setlistId, "Shalom Rav", "song-x")
        await seedLibraryRow("song-x", { name: "Shalom Rav" })
        await seedLibraryRow("song-y", { name: "Shalom Rav (Steinberg)" })

        const flag = (await flagBond(BAND_LEADER, {
            setlistId,
            trackId,
            reason: "double-check",
        })) as { ok: true }
        expect(flag.ok).toBe(true)

        const corr = (await recordBondCorrection(BAND_LEADER, {
            setlistId,
            trackId,
            fromSongId: "song-x",
            toSongId: "song-y",
        })) as { ok: true }
        expect(corr.ok).toBe(true)
    })
})

// Silence unused-var noise on the `_` ignore patterns above.
void updateSetlistTrack
