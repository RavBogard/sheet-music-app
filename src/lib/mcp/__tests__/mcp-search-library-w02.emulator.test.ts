import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { searchLibrary } from "../tools/library"

/**
 * W-02 search_library ranking + envelope (emulator).
 *
 * Pins the contract of the bondCorrectionHistory bias + contextHint boost
 * applied on top of the base substring-match search. Three test groups:
 *
 *  1. W-02 fields surface on every result row (join with library_index).
 *  2. bondCorrectionHistory bias reorders ties.
 *  3. titleContextHints lookup pulls the rabbi-preferred row to position 0
 *     when contextKey is supplied and the hint has reached the 3-pick
 *     threshold; otherwise no boost.
 *
 * The pre-W-02 contract (no archived rows, no orphans without
 * includeOrphaned, key + bpm filter) is covered by the existing
 * searchLibrary callers — those don't regress here.
 */
describe("MCP search_library — W-02 trust-calibration", () => {
    let app: App
    const ANY_UID = "any-uid"

    function db() {
        return getFirestore(app)
    }

    async function seedSong(
        id: string,
        title: string,
        extra: Record<string, unknown> = {},
    ) {
        await db()
            .collection("songs")
            .doc(id)
            .set({ title, status: "active", ...extra })
    }

    async function seedLibraryIndex(
        id: string,
        data: Record<string, unknown>,
    ) {
        await db().collection("library_index").doc(id).set(data)
    }

    async function seedHint(
        stem: string,
        contextKey: string,
        preferredFileId: string,
        picks: number,
    ) {
        await db()
            .collection("titleContextHints")
            .doc(`${stem}_${contextKey}`)
            .set({ stem, contextKey, preferredFileId, picks })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-search-w02" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["songs", "library_index", "titleContextHints"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    it("results carry titleSpecificity + bondCorrectionHistory + composer when present in library_index", async () => {
        await seedSong("a", "Hashkivenu (Klepper)")
        await seedLibraryIndex("a", {
            name: "Hashkivenu (Klepper)",
            stem: "hashkivenu",
            titleSpecificity: 0.7,
            composer: "Klepper",
            bondCorrectionHistory: {
                correctedTo: 3,
                correctedAwayFrom: 0,
                lastCorrectionAt: "2026-05-10T00:00:00Z",
            },
        })

        const results = await searchLibrary(ANY_UID, { query: "hashkivenu" })
        expect(results).toHaveLength(1)
        const r = results[0]
        expect(r.titleSpecificity).toBe(0.7)
        expect(r.composer).toBe("Klepper")
        expect(r.bondCorrectionHistory).toEqual({
            correctedTo: 3,
            correctedAwayFrom: 0,
            lastCorrectionAt: "2026-05-10T00:00:00Z",
        })
        expect(r.stem).toBe("hashkivenu")
    })

    it("bondCorrectionHistory bias ranks corrected-to ABOVE corrected-away-from", async () => {
        // Two rows with the same query relevance. Bias should reorder.
        await seedSong("up", "Hashkivenu (Up)")
        await seedLibraryIndex("up", {
            name: "Hashkivenu (Up)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 10, correctedAwayFrom: 0 },
        })
        await seedSong("down", "Hashkivenu (Down)")
        await seedLibraryIndex("down", {
            name: "Hashkivenu (Down)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 10 },
        })

        const results = await searchLibrary(ANY_UID, { query: "hashkivenu" })
        expect(results.map((r) => r.id)).toEqual(["up", "down"])
    })

    it("bias is clamped — bondCorrectionHistory at 1000 doesn't dominate context boost", async () => {
        // Run an extreme: row "up" has correctedTo=1000 but no hint; row "boosted"
        // has zero history but a context hint match. Hint boost (+0.5) should
        // beat bias (clamped at +0.25).
        await seedSong("up", "Hashkivenu (Up)")
        await seedLibraryIndex("up", {
            name: "Hashkivenu (Up)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 1000, correctedAwayFrom: 0 },
        })
        await seedSong("boosted", "Hashkivenu (Boosted)")
        await seedLibraryIndex("boosted", {
            name: "Hashkivenu (Boosted)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        })
        await seedHint("hashkivenu", "friday-evening", "boosted", 3)

        const results = await searchLibrary(ANY_UID, {
            query: "hashkivenu",
            contextKey: "friday-evening",
        })
        expect(results.map((r) => r.id)).toEqual(["boosted", "up"])
    })

    it("contextHint with picks < 3 is ignored (sub-threshold)", async () => {
        await seedSong("a", "Hashkivenu (A)")
        await seedLibraryIndex("a", {
            name: "Hashkivenu (A)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 5, correctedAwayFrom: 0 },
        })
        await seedSong("b", "Hashkivenu (B)")
        await seedLibraryIndex("b", {
            name: "Hashkivenu (B)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        })
        // Hint for b but only 2 picks — should NOT boost.
        await seedHint("hashkivenu", "friday-evening", "b", 2)

        const results = await searchLibrary(ANY_UID, {
            query: "hashkivenu",
            contextKey: "friday-evening",
        })
        // a wins on bias since hint is below threshold.
        expect(results.map((r) => r.id)).toEqual(["a", "b"])
    })

    it("no contextKey arg → no hint lookup, just bias ranking", async () => {
        await seedSong("a", "Hashkivenu (A)")
        await seedLibraryIndex("a", {
            name: "Hashkivenu (A)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 5, correctedAwayFrom: 0 },
        })
        await seedSong("b", "Hashkivenu (B)")
        await seedLibraryIndex("b", {
            name: "Hashkivenu (B)",
            stem: "hashkivenu",
            bondCorrectionHistory: { correctedTo: 0, correctedAwayFrom: 0 },
        })
        // Hint exists at full picks=3, but caller did NOT supply contextKey.
        await seedHint("hashkivenu", "friday-evening", "b", 3)

        const results = await searchLibrary(ANY_UID, { query: "hashkivenu" })
        // Bias-only ranking: a > b.
        expect(results.map((r) => r.id)).toEqual(["a", "b"])
    })

    it("tie-break: rank-equal rows order by lastUsedInSetlist.eventDate desc", async () => {
        await seedSong("old", "Hashkivenu (Old Bond)")
        await seedLibraryIndex("old", {
            name: "Hashkivenu (Old Bond)",
            stem: "hashkivenu",
            lastUsedInSetlist: { setlistId: "set-old", eventDate: "2024-01-15" },
        })
        await seedSong("new", "Hashkivenu (Recent Bond)")
        await seedLibraryIndex("new", {
            name: "Hashkivenu (Recent Bond)",
            stem: "hashkivenu",
            lastUsedInSetlist: { setlistId: "set-new", eventDate: "2026-05-09" },
        })

        const results = await searchLibrary(ANY_UID, { query: "hashkivenu" })
        expect(results.map((r) => r.id)).toEqual(["new", "old"])
    })

    it("rows without library_index entry surface unchanged (no W-02 fields)", async () => {
        // A song with no library_index counterpart (e.g. catalog-only sync row)
        // shouldn't break the join.
        await seedSong("orphan-of-index", "Floating Song")

        const results = await searchLibrary(ANY_UID, { query: "floating" })
        expect(results).toHaveLength(1)
        const r = results[0]
        expect(r.title).toBe("Floating Song")
        expect(r.titleSpecificity).toBeUndefined()
        expect(r.bondCorrectionHistory).toBeUndefined()
    })
})
