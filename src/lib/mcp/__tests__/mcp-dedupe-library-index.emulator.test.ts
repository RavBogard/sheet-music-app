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

import { dedupeLibraryIndex, FORMAT_CLASS_SEP } from "../tools/library"
import { searchLibrary } from "../tools/library"

/**
 * Cycle-1 F-019 + F-008 — one-shot library_index dedupe.
 *
 * F-019: stress-test surfaced ` Ana B_Koach.pdf` (note leading space) and
 * `Ana B_Koach.pdf` as separate rows in library_index, same display name.
 * F-008: two `Oseh shalom (camp)` rows with different fileIds.
 *
 * The dedupe pass groups by normalized name, picks the earliest
 * uploadedAt as canonical (fileId asc tiebreak), and marks losers
 * `status: "duplicate"` in BOTH library_index and (if present) songs.
 * Idempotent: a second run returns groupsFound: 0.
 */
describe("MCP dedupe_library_index — F-019 / F-008 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-1"
    const MEMBER = "member-1"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }
    async function seedIndex(id: string, data: Record<string, unknown>) {
        // E1 fixture audit (`R-0904-live-cw-3`): every row in the production
        // catalog carries a `mimeType` — measured 2026-09-04, 892 of 892,
        // zero null. These fixtures did not, and after E1 a row with no mime
        // classifies as `unknown` and is refused, which is the ruling working
        // as intended against a shape production does not have. A default
        // here rather than a mime on every seed call: tests that care about
        // the class still pass one explicitly and it wins.
        await db()
            .collection("library_index")
            .doc(id)
            .set({ mimeType: "application/pdf", ...data })
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

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-dedupe-library" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["songs", "library_index", "users", "dedupeRuns"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(MUSICIAN, "musician")
        await seedUser(MEMBER, "member")
    })

    it("C9I5-001 — refuses non-admin callers (musician + member) with rich forbidden_role", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
        })

        for (const nonAdmin of [MUSICIAN, MEMBER]) {
            // dryRun must ALSO be gated — the tool exposes the whole
            // library_index shape, not just writes.
            const r = await dedupeLibraryIndex(nonAdmin, { dryRun: true })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "forbidden_role", code: 403 },
                requiredRoles: ["admin"],
            })
            if ("error" in r && typeof r.error === "object" && r.error) {
                expect(r.error.message).toMatch(/admin-only/i)
            }

            // A real-run attempt is likewise refused with NO writes.
            const w = await dedupeLibraryIndex(nonAdmin, {
                dryRun: false,
                force: true,
            })
            expect(w).toMatchObject({
                ok: false,
                error: { machine_code: "forbidden_role" },
            })
        }

        // The would-be loser was never marked.
        const loser = await db()
            .collection("library_index")
            .doc("ana-leading-space")
            .get()
        expect(loser.data()?.status).toBeUndefined()
    })

    it("dryRun returns plan without writing", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.dryRun).toBe(true)
        expect(r.scanned).toBe(2)
        expect(r.groupsFound).toBe(1)
        // F-005: dryRun reports the PLAN size in wouldMark but commits nothing.
        expect(r.wouldMark).toBe(1)
        expect(r.committed).toBe(0)
        expect(r.songsMirrored).toBe(0)

        // Verify NO writes happened.
        const cleanDoc = await db()
            .collection("library_index")
            .doc("ana-clean")
            .get()
        const spaceDoc = await db()
            .collection("library_index")
            .doc("ana-leading-space")
            .get()
        expect(cleanDoc.data()?.status).toBeUndefined()
        expect(spaceDoc.data()?.status).toBeUndefined()
        expect(cleanDoc.data()?.dedupedAt).toBeUndefined()
        expect(spaceDoc.data()?.dedupedAt).toBeUndefined()
    })

    it("F-019 — leading-space dupes collapse; earliest uploadedAt wins canonical", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(1)
        expect(r.wouldMark).toBe(1)
        expect(r.committed).toBe(1) // F-005: real-run commits the plan
        expect(r.groups[0].kept.fileId).toBe("ana-clean") // earliest uploadedAt
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "ana-leading-space",
        ])

        // Loser is now status:'duplicate' in library_index.
        const loser = await db()
            .collection("library_index")
            .doc("ana-leading-space")
            .get()
        expect(loser.data()?.status).toBe("duplicate")
        expect(loser.data()?.dedupedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        // Canonical row untouched.
        const keep = await db()
            .collection("library_index")
            .doc("ana-clean")
            .get()
        expect(keep.data()?.status).toBeUndefined()
        expect(keep.data()?.dedupedAt).toBeUndefined()
    })

    it("F-008 — same name different fileId, oldest uploadedAt wins", async () => {
        await seedIndex("oseh-camp-v1", {
            name: "Oseh shalom (camp)",
            uploadedAt: "2024-03-15T08:00:00Z",
        })
        await seedIndex("oseh-camp-v2", {
            name: "Oseh shalom (camp)",
            uploadedAt: "2026-05-01T18:00:00Z",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(1)
        expect(r.groups[0].normalizedName).toBe("oseh shalom camp")
        expect(r.groups[0].kept.fileId).toBe("oseh-camp-v1")
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "oseh-camp-v2",
        ])
    })

    it("mirrors status:'duplicate' onto songs/{id} when the mirror exists", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
        })
        await seedSong("ana-clean", "Ana B_Koach.pdf")
        await seedSong("ana-leading-space", " Ana B_Koach.pdf")

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.songsMirrored).toBe(1)

        const loserSong = await db()
            .collection("songs")
            .doc("ana-leading-space")
            .get()
        expect(loserSong.data()?.status).toBe("duplicate")

        const keepSong = await db().collection("songs").doc("ana-clean").get()
        expect(keepSong.data()?.status).toBe("active")
    })

    it("does NOT create phantom songs/{id} rows when the mirror is absent", async () => {
        // library_index has the dupes but songs/{id} only has the canonical.
        // Dedupe must not create a phantom songs/ana-leading-space row.
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
        })
        await seedSong("ana-clean", "Ana B_Koach.pdf") // only canonical mirror

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.songsMirrored).toBe(0)

        const phantom = await db()
            .collection("songs")
            .doc("ana-leading-space")
            .get()
        expect(phantom.exists).toBe(false)
    })

    it("is idempotent — second run is a no-op", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
        })

        const first = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in first) throw new Error(typeof first.error === "string" ? first.error : JSON.stringify(first.error))
        expect(first.committed).toBe(1)

        const second = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in second) throw new Error(typeof second.error === "string" ? second.error : JSON.stringify(second.error))
        expect(second.scanned).toBe(1) // already-duplicate row excluded
        expect(second.groupsFound).toBe(0)
        expect(second.wouldMark).toBe(0)
        expect(second.committed).toBe(0)
        expect(second.groups).toEqual([])
    })

    it("ignores singleton (non-duplicate) rows", async () => {
        await seedIndex("a", { name: "Adon Olam.pdf" })
        await seedIndex("b", { name: "Mi Chamocha.pdf" })
        await seedIndex("c", { name: "Hashkivenu.pdf" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.scanned).toBe(3)
        expect(r.groupsFound).toBe(0)
        expect(r.wouldMark).toBe(0)
        expect(r.committed).toBe(0)
    })

    it("L1-W3 — scans ONLY the caller's tenant", async () => {
        // The fail branch, and it was real in production on 2026-09-01: this
        // tool scanned the raw collection while list_library filtered by
        // rowOrg, so it reported 943 rows against the browse's 891. SEVEN of
        // the eight groups in the live plan were entirely another tenant's
        // charts, and a force-run would have marked them `duplicate`.
        await seedIndex("crc-1", { name: "Shalom Rav.pdf", orgId: "crc" })
        await seedIndex("crc-2", { name: "Shalom Rav", orgId: "crc" })
        await seedIndex("other-1", {
            name: "Shalom Rav.pdf",
            orgId: "broslaz",
        })
        await seedIndex("other-2", { name: "Shalom Rav", orgId: "broslaz" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true }, "crc")
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        // Four rows exist; the caller owns two of them.
        expect(r.coverage.total).toBe(2)
        expect(r.coverage.eligible).toBe(2)
        expect(r.groupsFound).toBe(1)
        expect(r.wouldMark).toBe(1)
        const ids = [
            r.groups[0].kept.fileId,
            ...r.groups[0].duplicates.map((d) => d.fileId),
        ].sort()
        expect(ids).toEqual(["crc-1", "crc-2"])
    })

    it("L1-W3 — the other tenant sees only its own rows", async () => {
        await seedIndex("crc-1", { name: "Shalom Rav.pdf", orgId: "crc" })
        await seedIndex("other-1", {
            name: "Shalom Rav.pdf",
            orgId: "broslaz",
        })
        await seedIndex("other-2", { name: "Shalom Rav", orgId: "broslaz" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true }, "broslaz")
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.coverage.total).toBe(2)
        const ids = [
            r.groups[0].kept.fileId,
            ...r.groups[0].duplicates.map((d) => d.fileId),
        ].sort()
        expect(ids).toEqual(["other-1", "other-2"])
    })

    it("L1-W3 — a row with no orgId is treated as crc (rowOrg contract)", async () => {
        // v11-01-03 stamped every existing doc, but rowOrg defaults an
        // absent/empty orgId to crc and legacy Drive-scan rows must not fall
        // out of Daniel's own hygiene scan.
        await seedIndex("legacy-1", { name: "Achot ketana.pdf" })
        await seedIndex("legacy-2", { name: "Achot ketana" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true }, "crc")
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.coverage.total).toBe(2)
        expect(r.groupsFound).toBe(1)
    })

    it("L1-W2 — INCLUDES archived rows in grouping", async () => {
        // Inverted by L1-W2 (R-0901-live-cw-1 3). This asserted the opposite
        // until 2026-09-01: archived rows were filtered OUT of the hygiene
        // scan while list_library's browse still SHOWED them, so an archived
        // twin of a live chart was visible to Daniel and reachable by no
        // hygiene tool. The browse hides archived now; this scan takes it.
        await seedIndex("active1", { name: "Ana B_Koach.pdf" })
        await seedIndex("archived1", {
            name: "Ana B_Koach.pdf",
            status: "archived",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.scanned).toBe(2) // archived row now in scope
        expect(r.groupsFound).toBe(1)
        expect(r.wouldMark).toBe(1)
    })

    /**
     * L1-W2 canonical status rank (R-0901-live-cw-2 §5, plan review).
     *
     * The fail branch these pin is not hypothetical and not a fixture: the
     * first `dedupe_library({dryRun:true})` plan taken after archived rows
     * entered the scan had FOUR groups in this exact shape — an archived row
     * older than its active twin, so the picker (age only) handed canonical
     * to the archived one and marked the active one `duplicate`. Both are
     * then hidden, and the song leaves the browse entirely. Measured live at
     * `ca7fca91ce` on 2026-09-02: `Shema (major).pdf`,
     * `Avinu Malkeinu_trad_Choir_Em.pdf`, `Oseh shalom (S&P).pdf`,
     * `V_shamru_(trad).pdf` — Rosh Hashanah repertoire, ten days out.
     *
     * Remove the rank comparison and every assertion below flips.
     */
    it("L1-W2 rank — an ACTIVE row outranks an older ARCHIVED twin", async () => {
        // The `Shema (major).pdf` group, reproduced: same name, same bytes,
        // archived copy uploaded two months earlier.
        await seedIndex("shema-archived", {
            name: "Shema (major).pdf",
            uploadedAt: "2025-05-06T17:59:42.000Z",
            status: "archived",
        })
        await seedIndex("shema-active", {
            name: "Shema (major).pdf",
            uploadedAt: "2025-07-08T16:53:49.000Z",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(1)
        // Pre-rank this was `shema-archived` — the earlier uploadedAt.
        expect(r.groups[0].kept.fileId).toBe("shema-active")
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "shema-archived",
        ])

        // The invariant the rank actually protects: the group still has a
        // row the browse will show. Asserted on disk, not on the report.
        const keep = await db().collection("library_index").doc("shema-active").get()
        expect(keep.data()?.status).toBeUndefined() // untouched => active
        const loser = await db().collection("library_index").doc("shema-archived").get()
        expect(loser.data()?.status).toBe("duplicate")
    })

    it("E3 — the mixed-mime group the rank used to arbitrate is now never emitted", async () => {
        // This test asserted a RETIRED rule. It seeded an archived PDF
        // against an active Google-Doc and required the status rank to beat
        // the Google-Apps demotion — a real precedence question while both
        // rows could share a group.
        //
        // `R-0903-live-cw-5` made Google-Apps its own format class and E1
        // refuses to EMIT any group spanning two classes, so the question
        // no longer arises: the pair never meets and neither tiebreak runs.
        // The assertion is replaced rather than deleted, because a deleted
        // test leaves no evidence the behaviour changed on purpose.
        await seedIndex("mixed-archived-pdf", {
            name: "Oseh shalom (S&P).pdf",
            uploadedAt: "2025-05-06T18:51:47.000Z",
            mimeType: "application/pdf",
            status: "archived",
        })
        await seedIndex("mixed-active-gdoc", {
            name: "Oseh shalom (S&P).pdf",
            uploadedAt: "2025-07-08T16:54:33.000Z",
            mimeType: "application/vnd.google-apps.document",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        // Not emitted, and the refusal is COUNTED — a gate that cannot say
        // how often it fired cannot be trusted to have fired.
        expect(r.groupsFound).toBe(0)
        expect(r.formatClassRefusals).toBeGreaterThanOrEqual(1)

        // And neither row was marked: the archived row stays archived, the
        // Google-Doc stays visible. Asserted on disk, not on the report.
        const pdf = await db()
            .collection("library_index")
            .doc("mixed-archived-pdf")
            .get()
        expect(pdf.data()?.status).toBe("archived")
        const gdoc = await db()
            .collection("library_index")
            .doc("mixed-active-gdoc")
            .get()
        expect(gdoc.data()?.status).toBeUndefined()
    })

    it("L1-W4 — a PDF and a text chart of the same song do NOT group", async () => {
        // The production regression, modelled on the row it happened to.
        // `Three Little Birds` had a 44,377-byte PDF (uploaded by David,
        // human-curated hours before) and a 763-byte scraped text chart.
        // They shared a normalized name, so they grouped; the text row won
        // canonical on an earlier uploadedAt, and the PDF was marked
        // `duplicate` — hidden from the browse, from search, and from
        // Perform. No canonical-pick tiebreak fixes this: whichever row
        // wins, the other legitimate rendering is the one that disappears.
        // So the grouping key carries the format class and the pair never
        // meets. See `chartFormatClass`.
        await seedIndex("tlb-text", {
            name: "Three Little Birds",
            uploadedAt: "2026-06-18T05:43:56.814Z",
            mimeType: "text/plain",
        })
        await seedIndex("tlb-pdf", {
            name: "Three Little Birds",
            uploadedAt: "2026-06-20T14:00:50.319Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.groupsFound).toBe(0)
        expect(r.wouldMark).toBe(0)
        expect(r.committed).toBe(0)

        // Both rows still visible. This is the assertion that would have
        // caught it: not "the right row won" but "no row was hidden".
        const text = await db().collection("library_index").doc("tlb-text").get()
        const pdf = await db().collection("library_index").doc("tlb-pdf").get()
        expect(text.data()?.status ?? "active").toBe("active")
        expect(pdf.data()?.status ?? "active").toBe("active")
    })

    it("L1-W4 — two charts of the SAME format still group", async () => {
        // The guard splits by format; it must not stop dedupe doing its
        // job. Two real PDF uploads of one chart are still one group, and
        // the earliest uploadedAt still wins canonical.
        await seedIndex("same-fmt-old", {
            name: "Mi Chamocha (camp).pdf",
            uploadedAt: "2025-04-01T10:00:00.000Z",
            mimeType: "application/pdf",
        })
        await seedIndex("same-fmt-new", {
            name: "Mi Chamocha (camp).pdf",
            uploadedAt: "2025-09-01T10:00:00.000Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.groupsFound).toBe(1)
        expect(r.groups[0].kept.fileId).toBe("same-fmt-old")
        expect(r.groups[0].normalizedName).not.toContain(FORMAT_CLASS_SEP)
    })

    it("L1-W2 rank — age still decides WITHIN a status", async () => {
        // The `Lecha Dodi Lincoln_s Nigun.pdf` group: both rows archived, so
        // the rank ties and the pre-existing uploadedAt sort is untouched.
        // This group legitimately has no visible row — dedupe did not empty
        // it and must not be blamed for it.
        await seedIndex("lecha-late", {
            name: "Lecha Dodi Lincoln_s Nigun.pdf",
            uploadedAt: "2025-08-01T00:00:00Z",
            status: "archived",
        })
        await seedIndex("lecha-early", {
            name: "Lecha Dodi Lincoln_s Nigun.pdf",
            uploadedAt: "2025-06-01T00:00:00Z",
            status: "archived",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.groups[0].kept.fileId).toBe("lecha-early")
    })

    it("normalizes diacritics, punctuation, separators, and case", async () => {
        // All three should collapse into one group of three.
        await seedIndex("a", {
            name: "Shabbát Shalóm.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("b", {
            name: "SHABBAT_SHALOM.pdf",
            uploadedAt: "2024-02-01T00:00:00Z",
        })
        await seedIndex("c", {
            name: "shabbat-shalom.pdf",
            uploadedAt: "2024-03-01T00:00:00Z",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.groupsFound).toBe(1)
        // L1-W1: was "shabbat shalompdf" - the trailing .pdf is stripped now.
        // The diacritic/separator/case folding this test exists to pin is
        // unchanged; all three names still collapse to ONE group.
        expect(r.groups[0].normalizedName).toBe("shabbat shalom")
        expect(r.groups[0].kept.fileId).toBe("a") // earliest
        expect(r.groups[0].duplicates.map((d) => d.fileId).sort()).toEqual([
            "b",
            "c",
        ])
    })

    it("C10I2-001 — distinct native-script titles sharing a Latin substring are NOT falsely grouped", async () => {
        // Pre-fix the ASCII-only key erased the Hebrew, collapsing both to
        // "c10" → a false dupe group that would have marked one distinct song
        // `status:'duplicate'`. Post-fix the Unicode key keeps them distinct.
        await seedIndex("heb-a", { name: "c10 אדון עולם" })
        await seedIndex("heb-b", { name: "c10 אבינו מלכנו" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.scanned).toBe(2)
        expect(r.groupsFound).toBe(0)
        expect(r.wouldMark).toBe(0)
        expect(r.committed).toBe(0)
    })

    it("C10I2-001 — genuinely duplicate native-script titles DO still group", async () => {
        await seedIndex("heb-dup-1", {
            name: "אדון עולם",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("heb-dup-2", {
            name: "אדון עולם",
            uploadedAt: "2024-02-01T00:00:00Z",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.groupsFound).toBe(1)
        expect(r.groups[0].normalizedName).toBe("אדון עולם")
        expect(r.groups[0].kept.fileId).toBe("heb-dup-1") // earliest uploadedAt
        expect(r.wouldMark).toBe(1)
    })

    it("MCP-001 — real-run without force returns the rich force_required envelope and writes nothing", async () => {
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false })
        // FU-1: force-gate now returns the rich force_required envelope (ok:false,
        // error.machine_code) carrying the dedupe plan in `dryRunPlan`, instead of
        // {refused:true} on the success shape.
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
        })
        const plan = (r as {
            dryRunPlan?: {
                dryRun?: boolean
                groupsFound?: number
                wouldMark?: number
                committed?: number
                songsMirrored?: number
            }
        }).dryRunPlan
        expect(plan?.dryRun).toBe(false)
        expect(plan?.groupsFound).toBe(1) // plan still surfaces
        // F-005: refused real-run surfaces the plan in wouldMark, commits nothing.
        expect(plan?.wouldMark).toBe(1)
        expect(plan?.committed).toBe(0)
        expect(plan?.songsMirrored).toBe(0)

        // No writes happened — the loser is still unmarked.
        const loser = await db()
            .collection("library_index")
            .doc("ana-leading-space")
            .get()
        expect(loser.data()?.status).toBeUndefined()
        expect(loser.data()?.dedupedAt).toBeUndefined()
    })

    it("MCP-001 — coverage field shape matches the standing hygiene contract", async () => {
        await seedIndex("active1", { name: "Adon Olam.pdf" })
        await seedIndex("dup1", {
            name: "Already-Duplicate.pdf",
            status: "duplicate",
        })
        await seedIndex("arch1", {
            name: "Archived.pdf",
            status: "archived",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))
        expect(r.coverage.total).toBe(3)
        // L1-W2: 'arch1' now survives the status filter alongside 'active1';
        // only 'duplicate' is still skipped (idempotence).
        expect(r.coverage.eligible).toBe(2)
        expect(r.coverage.scanned).toBe(2)
        expect(r.coverage.filteredOut.byStatus.duplicate).toBe(1)
        expect(r.coverage.filteredOut.byStatus.archived).toBeUndefined()
        expect(r.threshold).toBe(0.85) // standing-rule default surfaced
    })

    it("MCP-001 — forceScore enables fuzzy similarity grouping beyond exact-normalize", async () => {
        // Two near-identical names that DON'T collapse under exact-normalize
        // (the trailing "(camp)" suffix differs) but should collapse under
        // forceScore <= 0.85 similarity.
        await seedIndex("oseh-a", {
            name: "Oseh Shalom",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("oseh-b", {
            name: "Oseh Shalom!",
            uploadedAt: "2024-06-01T00:00:00Z",
        })

        // Without forceScore — exact-normalize only. Both names normalize
        // to "oseh shalom" after non-alphanum strip, so they group anyway.
        // Use a clearer non-exact pair instead.
        await db().collection("library_index").doc("oseh-a").delete()
        await db().collection("library_index").doc("oseh-b").delete()

        await seedIndex("hash-a", {
            name: "Hashkivenu",
            uploadedAt: "2024-01-01T00:00:00Z",
        })
        await seedIndex("hash-b", {
            name: "Hashkiveinu",
            uploadedAt: "2024-06-01T00:00:00Z",
        })

        // Exact-normalize-only — names differ ("hashkivenu" vs "hashkiveinu"),
        // so no group.
        const without = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in without) throw new Error(typeof without.error === "string" ? without.error : JSON.stringify(without.error))
        expect(without.groupsFound).toBe(0)
        expect(without.threshold).toBe(0.85)

        // With forceScore: 0.8 — similarity ~0.91 exceeds threshold → group.
        const withFuzzy = await dedupeLibraryIndex(ADMIN, {
            dryRun: true,
            forceScore: 0.8,
        })
        if ("error" in withFuzzy) throw new Error(typeof withFuzzy.error === "string" ? withFuzzy.error : JSON.stringify(withFuzzy.error))
        expect(withFuzzy.groupsFound).toBe(1)
        expect(withFuzzy.threshold).toBe(0.8)
        expect(withFuzzy.wouldMark).toBe(1) // F-005: dryRun plan size
        expect(withFuzzy.committed).toBe(0)
        expect(withFuzzy.groups[0].kept.fileId).toBe("hash-a") // earliest
        expect(withFuzzy.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "hash-b",
        ])
    })

    /* ─────────────────────────────────────────────────────────────────────
     * W2 (R-0903-live-cw-2 §5) — reversibility precedes hiding.
     *
     * Before this wave the mark wrote `status: "duplicate"` + `dedupedAt`
     * and recorded no prior state anywhere, which is why 100 rows are
     * hidden in production today that no tool inside the system can
     * restore. These tests pin the record, not the comment.
     * ───────────────────────────────────────────────────────────────────── */

    it("W2/G2 — a real run writes one dedupeRuns record holding EVERY marked row", async () => {
        await seedIndex("w2-old", {
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-new", {
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        // The runId is on the response — it is the argument an operator
        // hands `undo_dedupe_group`, so it must not require a query to find.
        expect(r.dedupeRunId).toBeTruthy()
        const runId = r.dedupeRunId as string

        const runSnap = await db().collection("dedupeRuns").doc(runId).get()
        expect(runSnap.exists).toBe(true)
        const run = runSnap.data() as {
            runId: string
            marked: number
            groupsFound: number
            threshold: number
            actorUid: string
            orgId: string
            rows: Array<{
                fileId: string
                priorStatus: string | null
                canonicalFileId: string
                groupedBy: string
            }>
        }

        // G2 asserted from the outside: every row this run marked is held
        // by the record. count(marked) == count(records).
        expect(run.marked).toBe(r.committed)
        expect(run.rows).toHaveLength(r.committed)
        expect(run.rows.map((x) => x.fileId)).toEqual(["w2-new"])
        expect(run.runId).toBe(runId)
        expect(run.actorUid).toBe(ADMIN)
        expect(run.groupsFound).toBe(1)
        // The pass that decided is recorded, so an undo can say what
        // reasoning hid the row and not merely that something did.
        expect(run.rows[0].groupedBy).toBe("exact-name")
        expect(run.rows[0].canonicalFileId).toBe("w2-old")
    })

    it("W2 — priorStatus is the status AS READ, so an archived row is not restored to active", async () => {
        // The 09-01 shape, and the reason the field exists: 18 of the 85
        // rows in that sweep were `archived`. A record that defaulted to
        // `active` would hand the undo a licence to un-archive rows
        // somebody deliberately archived.
        await seedIndex("w2-arch-keep", {
            name: "Lecha Dodi Lincoln_s Nigun",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "archived",
        })
        await seedIndex("w2-arch-lose", {
            name: "Lecha Dodi Lincoln_s Nigun",
            uploadedAt: "2025-02-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "archived",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        const run = (
            await db()
                .collection("dedupeRuns")
                .doc(r.dedupeRunId as string)
                .get()
        ).data() as { rows: Array<{ fileId: string; priorStatus: string | null }> }

        expect(run.rows).toHaveLength(1)
        expect(run.rows[0].fileId).toBe("w2-arch-lose")
        expect(run.rows[0].priorStatus).toBe("archived")

        // And the same pair travels on the row itself, in the same atomic
        // update as the status — there is no window where the row is
        // `duplicate` with no prior state beside it.
        const row = (
            await db().collection("library_index").doc("w2-arch-lose").get()
        ).data() as Record<string, unknown>
        expect(row.status).toBe("duplicate")
        expect(row.priorStatus).toBe("archived")
        expect(row.dedupeRunId).toBe(r.dedupeRunId)
        expect(row.dedupedAt).toBeTruthy()
    })

    it("W2 — a row with NO status field records priorStatus 'active', the value the system already reads it as", async () => {
        // Written expecting `null` and corrected by the run: the candidate
        // build normalizes a missing `status` to "active"
        // (`typeof data.status === "string" ? data.status : "active"`), and
        // every other surface reads such a row the same way — the browse
        // shows it, `search_library` returns it. So "as read in this run" IS
        // "active" here, and recording it is what lets the undo restore
        // without interpreting. `null` would have pushed exactly the guess
        // the field exists to remove down into the undo tool.
        //
        // The one visible consequence, and it is benign: restoring such a
        // row WRITES `status: "active"` where there was no field before.
        // The row lands where the system already placed it.
        await seedIndex("w2-nostatus-keep", {
            name: "Oseh Shalom (camp)",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-nostatus-lose", {
            name: "Oseh Shalom (camp)",
            uploadedAt: "2025-03-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        const run = (
            await db()
                .collection("dedupeRuns")
                .doc(r.dedupeRunId as string)
                .get()
        ).data() as { rows: Array<{ priorStatus: string | null }> }
        expect(run.rows[0].priorStatus).toBe("active")

        const seeded = (
            await db().collection("library_index").doc("w2-nostatus-lose").get()
        ).data() as Record<string, unknown>
        expect(seeded.priorStatus).toBe("active")
    })

    it("W2 — the mirrored songs doc carries the prior state too", async () => {
        await seedIndex("w2-mirror-keep", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-mirror-lose", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-04-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedSong("w2-mirror-lose", "Bar'chu Walkdown")

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.songsMirrored).toBe(1)

        const song = (
            await db().collection("songs").doc("w2-mirror-lose").get()
        ).data() as Record<string, unknown>
        expect(song.status).toBe("duplicate")
        expect(song.priorStatus).toBe("active")
        expect(song.dedupeRunId).toBe(r.dedupeRunId)
    })

    it("W2 — dryRun writes no run record, and a refused run writes none either", async () => {
        await seedIndex("w2-dry-a", {
            name: "Twilight",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-dry-b", {
            name: "Twilight",
            uploadedAt: "2025-05-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const dry = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in dry) throw new Error(JSON.stringify(dry.error))
        expect(dry.groupsFound).toBe(1)
        expect(dry.dedupeRunId).toBeUndefined()

        // Real run without force: the F-05 refusal. Reports, writes nothing.
        const refused = await dedupeLibraryIndex(ADMIN, { dryRun: false })
        expect("error" in refused).toBe(true)

        expect((await db().collection("dedupeRuns").get()).size).toBe(0)
    })

    it("W2 — idempotence unchanged: a second run marks nothing and writes NO new run row", async () => {
        await seedIndex("w2-idem-keep", {
            name: "G-minor Spirits",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-idem-lose", {
            name: "G-minor Spirits",
            uploadedAt: "2025-02-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const first = await dedupeLibraryIndex(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in first) throw new Error(JSON.stringify(first.error))
        expect(first.committed).toBe(1)
        expect((await db().collection("dedupeRuns").get()).size).toBe(1)

        const second = await dedupeLibraryIndex(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in second) throw new Error(JSON.stringify(second.error))
        expect(second.groupsFound).toBe(0)
        expect(second.committed).toBe(0)
        expect(second.dedupeRunId).toBeUndefined()
        // Skipping writes no run row — the ruling's wording, asserted.
        expect((await db().collection("dedupeRuns").get()).size).toBe(1)

        // The first run's record is untouched by the second run.
        const run = (
            await db()
                .collection("dedupeRuns")
                .doc(first.dedupeRunId as string)
                .get()
        ).data() as { rows: unknown[] }
        expect(run.rows).toHaveLength(1)
    })

    it("W2 — every group reports which pass grouped it (exact and fuzzy)", async () => {
        await seedIndex("w2-pass-exact-a", {
            name: "Niggun - Full Score",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-pass-exact-b", {
            name: "Niggun - Full Score",
            uploadedAt: "2025-02-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        // Near-miss pair: no exact-normalize match, but above 0.85.
        await seedIndex("w2-pass-fuzzy-a", {
            name: "Mi Chamocha Havdalah",
            uploadedAt: "2025-03-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("w2-pass-fuzzy-b", {
            name: "Mi Chamocha Havdala",
            uploadedAt: "2025-04-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, {
            dryRun: false,
            force: true,
            forceScore: 0.85,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.groupsFound).toBe(2)

        const passes = r.groups.map((g) => g.groupedBy).sort()
        expect(passes).toEqual(["exact-name", "fuzzy-name"])

        // The run record carries the pass per ROW, not just per group, so a
        // per-row undo can report the reasoning that hid that one row.
        const run = (
            await db()
                .collection("dedupeRuns")
                .doc(r.dedupeRunId as string)
                .get()
        ).data() as { rows: Array<{ fileId: string; groupedBy: string }> }
        expect(run.rows).toHaveLength(2)
        expect(
            run.rows.find((x) => x.fileId === "w2-pass-exact-b")?.groupedBy,
        ).toBe("exact-name")
        expect(
            run.rows.find((x) => x.fileId === "w2-pass-fuzzy-b")?.groupedBy,
        ).toBe("fuzzy-name")
    })

    it("E3 — the groups-7/9 trap is closed EARLIER: the mixed group is not emitted", async () => {
        // Daniel-surfaced trap: a Google-Doc uploaded BEFORE the PDF
        // re-upload was winning canonical by uploadedAt alone, silently
        // marking the renderable PDF `duplicate`. The first fix was a
        // canonical-pick demotion, and this test required the PDF to WIN.
        //
        // E3 retires that demotion because E1 closes the trap one step
        // earlier and more completely: the pair never forms a group, so
        // NEITHER row is marked. Winning canonical was always the second-
        // best outcome — the Google-Doc still left the browse. Now nothing
        // does.
        await seedIndex("ana-google", {
            name: "Ana B_Koach",
            uploadedAt: "2026-03-01T00:00:00Z",
            mimeType: "application/vnd.google-apps.document",
        })
        await seedIndex("ana-pdf", {
            name: "Ana B_Koach",
            uploadedAt: "2026-04-01T00:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(0)
        expect(r.formatClassRefusals).toBeGreaterThanOrEqual(1)

        // The point of the change: the Google-Doc is no longer marked
        // either. Both rows stay visible to the browse.
        const gdoc = await db()
            .collection("library_index")
            .doc("ana-google")
            .get()
        expect(gdoc.data()?.status).toBeUndefined()
        const pdf = await db()
            .collection("library_index")
            .doc("ana-pdf")
            .get()
        expect(pdf.data()?.status).toBeUndefined()
    })

    it("canonical-picker — all-PDF group: uploadedAt asc + fileId asc preserved (regression)", async () => {
        // Behavior-preserving for any group containing zero Google-Apps
        // rows — the demotion never triggers, so the existing
        // uploadedAt-asc-then-fileId-asc sort still picks the winner.
        await seedIndex("z-late", {
            name: "Oseh shalom",
            uploadedAt: "2026-04-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("a-early", {
            name: "Oseh shalom",
            uploadedAt: "2026-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("m-mid", {
            name: "Oseh shalom",
            uploadedAt: "2026-02-15T00:00:00Z",
            mimeType: "application/pdf",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(1)
        expect(r.groups[0].kept.fileId).toBe("a-early") // earliest uploadedAt
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "m-mid",
            "z-late",
        ])
    })

    it("canonical-picker — all-Google-Apps group: degenerate but stable (earliest uploadedAt + fileId asc)", async () => {
        // Shouldn't occur post-`archive_nonchart_artifacts`, but be
        // defensive: when every row in a group is a Google-Apps mime
        // the demotion ties for everyone, so the sort falls through to
        // uploadedAt asc + fileId asc and stays deterministic.
        await seedIndex("doc-late", {
            name: "Hashkivenu",
            uploadedAt: "2026-04-01T00:00:00Z",
            mimeType: "application/vnd.google-apps.document",
        })
        await seedIndex("doc-early-z", {
            name: "Hashkivenu",
            uploadedAt: "2026-01-01T00:00:00Z",
            mimeType: "application/vnd.google-apps.document",
        })
        await seedIndex("doc-early-a", {
            name: "Hashkivenu",
            uploadedAt: "2026-01-01T00:00:00Z",
            mimeType: "application/vnd.google-apps.document",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.groupsFound).toBe(1)
        // Earliest uploadedAt; fileId asc tiebreak between the two early ones.
        expect(r.groups[0].kept.fileId).toBe("doc-early-a")
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "doc-early-z",
            "doc-late",
        ])
    })

    it("post-dedupe, searchLibrary no longer surfaces the loser", async () => {
        // End-to-end: dedupe runs, then search behaves correctly.
        await seedIndex("ana-clean", {
            name: "Ana B_Koach.pdf",
            uploadedAt: "2024-01-01T00:00:00Z",
            mimeType: "application/pdf",
        })
        await seedIndex("ana-leading-space", {
            name: " Ana B_Koach.pdf",
            uploadedAt: "2024-06-15T12:00:00Z",
            mimeType: "application/pdf",
        })
        await seedSong("ana-clean", "Ana B_Koach")
        await seedSong("ana-leading-space", "Ana B_Koach")

        // Pre-dedupe — both surface in search.
        const before = await searchLibrary(ADMIN, { query: "Ana" })
        expect(before.map((r) => r.id).sort()).toEqual([
            "ana-clean",
            "ana-leading-space",
        ])

        await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })

        // Post-dedupe — only the canonical surfaces.
        const after = await searchLibrary(ADMIN, { query: "Ana" })
        expect(after.map((r) => r.id)).toEqual(["ana-clean"])
    })
})
