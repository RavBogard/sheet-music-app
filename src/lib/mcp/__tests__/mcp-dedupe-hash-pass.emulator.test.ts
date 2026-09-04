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
import { createHash } from "node:crypto"

import { dedupeLibraryIndex } from "../tools/library"

/**
 * W5 (R-0903-live-cw-2 §3, §4, §6) — the byte-identity lane, the deciding
 * fields, and bonded-first.
 *
 * The lane's defining property is that it REPORTS and never marks. Every
 * new mark decided by bytes is Daniel's, per cluster.
 */
describe("MCP dedupe_library — the hash pass (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }
    const hashOf = (s: string) => createHash("sha256").update(s).digest("hex")
    function contentHash(payload: string, sizeBytes: number) {
        return {
            alg: "sha256",
            value: hashOf(payload),
            sizeBytes,
            at: "2026-09-03T00:00:00.000Z",
            source: "firebase-storage",
        }
    }
    async function seed(id: string, data: Record<string, unknown>) {
        // E1 fixture audit — see the note in
        // `mcp-dedupe-library-index.emulator.test.ts`. Production rows all
        // carry a mime; a row without one now classifies `unknown` and its
        // group is refused.
        await db()
            .collection("library_index")
            .doc(id)
            .set({ mimeType: "application/pdf", ...data })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-hash-pass" })
    }, 30_000)
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const col of [
            "library_index",
            "users",
            "songs",
            "tracks",
            "setlists",
            "dedupeRuns",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
    }, 30_000)

    it("finds a byte-identical pair the NAME pass could never see, and marks nothing", async () => {
        // The production pair: `gminor_spirits` and `G-minor Spirits` share
        // no normalized name and are the same 42,729 bytes.
        await seed("gmin-a", {
            name: "G-minor Spirits",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 42729,
            status: "active",
            contentHash: contentHash("gmin-bytes", 42729),
        })
        await seed("gmin-b", {
            name: "gminor_spirits",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 42729,
            status: "active",
            contentHash: contentHash("gmin-bytes", 42729),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        // The name pass sees nothing — the names do not normalize together.
        expect(r.groupsFound).toBe(0)
        expect(r.committed).toBe(0)

        // The hash pass sees it.
        expect(r.hashGroups).toHaveLength(1)
        expect(r.hashGroups[0].groupedBy).toBe("exact-hash")
        expect(r.hashGroups[0].normalizedName).toBe(
            `sha256:${hashOf("gmin-bytes")}`,
        )
        expect(
            [r.hashGroups[0].kept.fileId, ...r.hashGroups[0].duplicates.map((x) => x.fileId)].sort(),
        ).toEqual(["gmin-a", "gmin-b"])

        // REPORT ONLY. Nothing was hidden, and no run record was written.
        for (const id of ["gmin-a", "gmin-b"]) {
            const row = (
                await db().collection("library_index").doc(id).get()
            ).data() as Record<string, unknown>
            expect(row.status).toBe("active")
        }
        expect((await db().collection("dedupeRuns").get()).size).toBe(0)
        expect(r.dedupeRunId).toBeUndefined()
    })

    it("does NOT group size-equal, byte-DIFFERENT rows — the trap the cheap key falls into", async () => {
        // `Adonai Oz` and `Avinu Malkeinu_trad_Choir_Em` are both 46,235
        // bytes in production and are different files. A size or
        // whichever-md5-was-cheapest key would have paired them.
        await seed("size-a", {
            name: "Adonai Oz (Nava Tehila)",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 46235,
            status: "active",
            contentHash: contentHash("adonai-oz-bytes", 46235),
        })
        await seed("size-b", {
            name: "Avinu Malkeinu_trad_Choir_Em",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 46235,
            status: "active",
            contentHash: contentHash("avinu-malkeinu-bytes", 46235),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(0)
    })

    it("scans EVERY status, and reports an already-resolved cluster as a conclusion", async () => {
        // All 5 byte-identical clusters in production already have exactly
        // one visible row. A pass that skipped marked rows would report
        // nothing here and leave that fact invisible.
        await seed("res-keep", {
            name: "Niggun - Bonia Full Score",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 49551,
            status: "active",
            contentHash: contentHash("niggun-bytes", 49551),
        })
        await seed("res-hidden", {
            name: "Niggun - Full Score",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 49551,
            status: "duplicate",
            contentHash: contentHash("niggun-bytes", 49551),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(1)
        const g = r.hashGroups[0]
        expect(g.kept.fileId).toBe("res-keep")
        expect(g.noActionReason).toContain("already resolved")
        expect(g.noActionReason).toContain("res-keep")
    })

    it("reports a 3-row cluster as three rows, not as a pair", async () => {
        for (const [id, status] of [
            ["tri-1", "active"],
            ["tri-2", "duplicate"],
            ["tri-3", "duplicate"],
        ] as const) {
            await seed(id, {
                name: id,
                uploadedAt: "2025-01-01T00:00:00Z",
                mimeType: "application/pdf",
                fileSize: 29132,
                status,
                contentHash: contentHash("twilight-bytes", 29132),
            })
        }
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(1)
        expect(r.hashGroups[0].duplicates).toHaveLength(2)
    })

    it("E1 — the octet-stream cluster this test used to REPORT is now refused", async () => {
        // This test carried a recorded complaint: `application/octet-stream`
        // was non_chart to `isNonChartArtifactShape` but `score` to
        // `chartFormatClass`, "so this fixture is NOT cross-format". E1
        // closes that disagreement — octet-stream is not a rendering of a
        // chart, so it classifies `unknown`, and an unknown class is not a
        // matching class. The cluster is refused rather than reported, and
        // the row keeps whatever status it already had.
        await seed("xf-pdf", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 2336,
            status: "active",
            contentHash: contentHash("barchu-bytes", 2336),
        })
        await seed("xf-octet", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-06-01T00:00:00Z",
            // octet-stream is non_chart by `isNonChartArtifactShape`.
            mimeType: "application/octet-stream",
            fileSize: 2336,
            status: "duplicate",
            contentHash: contentHash("barchu-bytes", 2336),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(0)
        expect(r.formatClassRefusals).toBeGreaterThanOrEqual(1)
        // Still marked — the refusal changes nothing on disk.
        expect(
            (
                (
                    await db().collection("library_index").doc("xf-octet").get()
                ).data() as Record<string, unknown>
            ).status,
        ).toBe("duplicate")
    })

    it("§6a — a genuinely CROSS-FORMAT byte-identical cluster is reported with that reason", async () => {
        // A PDF and a text chart in different `chartFormatClass` partitions.
        // The name passes partition by class and could never see this pair
        // even if the names matched exactly — only bytes can.
        await seed("cf-pdf", {
            name: "Three Little Birds",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 763,
            status: "active",
            contentHash: contentHash("tlb-bytes", 763),
        })
        await seed("cf-text", {
            name: "Three Little Birds",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "text/plain",
            fileSize: 763,
            status: "active",
            contentHash: contentHash("tlb-bytes", 763),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        // The name pass refuses to group them (L1-W4 like-with-like)...
        expect(r.groupsFound).toBe(0)
        // ...and E1 makes the hash pass refuse them too. It used to EMIT
        // this cluster with a `noActionReason` explaining itself, which is a
        // weaker thing than a gate: a reason is read by a person, a refusal
        // is read by the guard. `R-0904-live-cw-3` — not emitted by ANY
        // lane, exact, fuzzy or hash.
        expect(r.hashGroups).toHaveLength(0)
        expect(r.formatClassRefusals).toBeGreaterThanOrEqual(1)
    })

    it("counts unhashed rows, so `no byte pairs` cannot be confused with `nothing hashed`", async () => {
        await seed("unhashed-1", {
            name: "no hash yet",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
        })
        await seed("hashed-1", {
            name: "hashed",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            contentHash: contentHash("solo", 100),
        })
        await seed("failed-1", {
            name: "verify failed",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            hashFailed: { reason: "md5_mismatch", detail: "x", at: "now" },
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(0)
        expect(r.hashPassCoverage).toEqual({
            hashed: 1,
            unhashed: 2,
            hashFailed: 1,
        })
    })

    it("treats a MALFORMED contentHash as absent rather than trusting it", async () => {
        // A truncated digest is the dangerous shape: it looks present. Two
        // rows sharing a 6-character "digest" must not be asserted
        // byte-identical, because nothing checked their bytes.
        for (const id of ["mal-1", "mal-2"]) {
            await seed(id, {
                name: id,
                uploadedAt: "2025-01-01T00:00:00Z",
                mimeType: "application/pdf",
                fileSize: 100,
                status: "active",
                contentHash: { alg: "sha256", value: "abc123", sizeBytes: 100 },
            })
        }
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.hashGroups).toHaveLength(0)
        expect(r.hashPassCoverage.hashed).toBe(0)
        expect(r.hashPassCoverage.unhashed).toBe(2)
    })

    it("§6 — every group row carries the DECIDING fields, not just name and date", async () => {
        // The root fix for the 02:0xZ finding: the 09-01 plan carried only
        // fileId/name/uploadedAt because the type did.
        await seed("dec-keep", {
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 22443,
            status: "active",
            contentHash: contentHash("hashkivenu", 22443),
        })
        await seed("dec-lose", {
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 22443,
            status: "active",
            contentHash: contentHash("hashkivenu", 22443),
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.groupsFound).toBe(1)
        const kept = r.groups[0].kept
        expect(kept.mimeType).toBe("application/pdf")
        expect(kept.sizeBytes).toBe(22443)
        expect(kept.status).toBe("active")
        expect(kept.contentHash?.value).toBe(hashOf("hashkivenu"))
        expect(kept.bondCount).toBe(0)
        // And on the losers too — the side an operator is being asked to hide.
        expect(r.groups[0].duplicates[0].sizeBytes).toBe(22443)
        expect(r.groups[0].duplicates[0].mimeType).toBe("application/pdf")
    })

    it("§4 — a BONDED row wins canonical over an older unbonded twin", async () => {
        // The `Bar'chu Walkdown` shape: age was beating USE, so the row 4
        // setlists depended on was the one that got hidden.
        await seed("bond-old", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 22608,
            status: "active",
        })
        await seed("bond-new", {
            name: "Bar'chu Walkdown",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 22608,
            status: "active",
        })
        await db().collection("setlists").doc("sl-1").set({ name: "Shabbat" })
        await db()
            .collection("tracks")
            .doc("t-1")
            .set({ setlistId: "sl-1", fileId: "bond-new", title: "Bar'chu" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.groupsFound).toBe(1)
        // Pre-W5 the older `bond-old` won on uploadedAt alone.
        expect(r.groups[0].kept.fileId).toBe("bond-new")
        expect(r.groups[0].kept.bondCount).toBe(1)
        expect(r.groups[0].duplicates[0].fileId).toBe("bond-old")
    })

    it("§4 — a track whose parent setlist is GONE is not a bond", async () => {
        // The `delete_chart` guard's defect: it counted tracks of deleted
        // setlists. A dangling track must not win canonical.
        await seed("dang-old", {
            name: "Refa tziri",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 32626,
            status: "active",
        })
        await seed("dang-new", {
            name: "Refa tziri",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 32626,
            status: "active",
        })
        // A track pointing at the newer row, whose setlist does not exist.
        await db()
            .collection("tracks")
            .doc("t-dangling")
            .set({ setlistId: "setlist-deleted", fileId: "dang-new" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.groups[0].kept.bondCount).toBe(0)
        // Age decides again, because there is no real bond to prefer.
        expect(r.groups[0].kept.fileId).toBe("dang-old")
    })

    it("§4 — status still outranks bondedness", async () => {
        // Precedence, pinned: a bonded ARCHIVED row must not be canonical,
        // because a hidden canonical empties the group.
        await seed("prec-archived-bonded", {
            name: "Mi shebeirach",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 35646,
            status: "archived",
        })
        await seed("prec-active", {
            name: "Mi shebeirach",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 35646,
            status: "active",
        })
        await db().collection("setlists").doc("sl-2").set({ name: "Erev" })
        await db()
            .collection("tracks")
            .doc("t-2")
            .set({ setlistId: "sl-2", fileId: "prec-archived-bonded" })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.groups[0].kept.fileId).toBe("prec-active")
    })

    it("§6b — the response STATES its filter order", async () => {
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.filterOrder[0]).toContain("orgId")
        // The specific disagreement this explains: a row caught by an
        // earlier filter is never counted by a later one.
        expect(r.filterOrder.join(" ")).toContain("duplicate")
        expect(r.filterOrder.join(" ")).toContain("chartFormatClass")
    })

    it("the hash pass does not cross tenants", async () => {
        await seed("t-mine", {
            name: "mine",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            contentHash: contentHash("shared", 100),
        })
        await seed("t-theirs", {
            name: "theirs",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            orgId: "not-crc",
            contentHash: contentHash("shared", 100),
        })
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        // Byte-identical across tenants is still not a group.
        expect(r.hashGroups).toHaveLength(0)
        expect(r.hashPassCoverage.hashed).toBe(1)
    })

    it("the F-05 refusal carries the hash lane too, so the refusal is not thinner than the thing it refuses", async () => {
        await seed("ref-a", {
            name: "same name",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            contentHash: contentHash("refbytes", 100),
        })
        await seed("ref-b", {
            name: "same name",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
            contentHash: contentHash("refbytes", 100),
        })

        const refused = await dedupeLibraryIndex(ADMIN, { dryRun: false })
        expect("error" in refused).toBe(true)
        const plan = (refused as unknown as Record<string, unknown>)
            .dryRunPlan as Record<string, unknown>
        expect(plan).toBeTruthy()
        expect((plan.hashGroups as unknown[]).length).toBe(1)
        expect(plan.hashPassCoverage).toEqual({
            hashed: 2,
            unhashed: 0,
            hashFailed: 0,
        })
    })
})
