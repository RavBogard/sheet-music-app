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

import { dedupeLibraryIndex } from "../tools/library"
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
        await db().collection("library_index").doc(id).set(data)
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
        for (const col of ["songs", "library_index", "users"]) {
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

    it("L1-W2 rank — status outranks the Google-Apps demotion", async () => {
        // Deliberate precedence, and the only place the two rules can
        // disagree: an archived PDF vs an active Google-Doc. The mime
        // demotion asks which row renders; the rank asks which row the
        // browse can show at all. A group with no visible row is the worse
        // outcome, so the rank runs first. (No live group has this shape
        // today — pinned so the ordering is a decision, not an accident.)
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
        expect(r.groups[0].kept.fileId).toBe("mixed-active-gdoc")
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

    it("canonical-picker — mixed-mime group: PDF beats earlier Google-Doc (groups-7/9 fix)", async () => {
        // Daniel-surfaced trap: a Google-Doc uploaded BEFORE the PDF
        // re-upload was winning canonical by uploadedAt alone, silently
        // marking the renderable PDF `duplicate`. Post-fix the
        // non-Google-Apps row wins regardless of who's earlier.
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

        expect(r.groupsFound).toBe(1)
        // Pre-fix would have picked `ana-google` (earlier uploadedAt).
        expect(r.groups[0].kept.fileId).toBe("ana-pdf")
        expect(r.groups[0].duplicates.map((d) => d.fileId)).toEqual([
            "ana-google",
        ])

        const loser = await db()
            .collection("library_index")
            .doc("ana-google")
            .get()
        expect(loser.data()?.status).toBe("duplicate")
        const keep = await db()
            .collection("library_index")
            .doc("ana-pdf")
            .get()
        expect(keep.data()?.status).toBeUndefined()
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
