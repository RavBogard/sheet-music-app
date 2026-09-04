import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * W4 (R-0903-live-cw-2 §3) — `backfill_content_hash`.
 *
 * The byte FETCH is mocked; nothing else is. What is under test is the
 * backfill's decision logic — resumability, the md5 cross-check, and G4's
 * rule that a hash is never written for bytes that did not verify — and
 * that logic is independent of whether the bytes came from Storage, from
 * the Drive fallback, or from this map. Firestore is the real emulator, so
 * every read and write below is a real read and write.
 */
const BYTES = new Map<string, Buffer | null>()
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: async (fileId: string) => {
        const b = BYTES.get(fileId)
        if (!b) return null
        return { buffer: b, contentType: "application/pdf", source: "firebase-storage" }
    },
    getChartHealth: async () => ({ status: "ok" }),
}))

const { backfillContentHash } = await import("../tools/backfill-content-hash")
const { md5Both, sha256Hex } = await import("@/lib/library/content-hash")

describe("MCP backfill_content_hash (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-1"

    function db() {
        return getFirestore(app)
    }
    async function seed(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }
    async function row(id: string) {
        return (await db().collection("library_index").doc(id).get()).data() as
            | Record<string, unknown>
            | undefined
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-content-hash" })
    }, 30_000)
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        BYTES.clear()
        for (const col of ["library_index", "users"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician" })
    }, 30_000)

    const PDF_A = Buffer.from("%PDF-1.4 Hashkivenu A", "utf8")
    const PDF_B = Buffer.from("%PDF-1.4 Hashkivenu B", "utf8")

    it("refuses non-admin callers", async () => {
        const r = await backfillContentHash(MUSICIAN, { force: true })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("forbidden_role")
    })

    it("writes the full contentHash shape from the bytes", async () => {
        BYTES.set("h-1", PDF_A)
        await seed("h-1", {
            name: "Hashkivenu (Randy)",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "active",
        })

        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(1)
        expect(r.hashed).toBe(1)
        expect(r.failed).toBe(0)

        const h = (await row("h-1"))!.contentHash as Record<string, unknown>
        expect(h.alg).toBe("sha256")
        expect(h.value).toBe(sha256Hex(PDF_A))
        expect(h.sizeBytes).toBe(PDF_A.byteLength)
        expect(h.source).toBe("firebase-storage")
        expect(typeof h.at).toBe("string")
    })

    it("G4 FAIL BRANCH — a corrupt buffer is recorded hashFailed and gets NO hash", async () => {
        // The row claims the md5 of PDF_A. The fetch returns PDF_B. That is
        // exactly the real-world shape: we did not fetch the bytes this row
        // claims, so a sha256 of what we DID fetch would make a false pair
        // confidently.
        BYTES.set("h-corrupt", PDF_B)
        await seed("h-corrupt", {
            name: "Bar'chu Walkdown",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            driveMd5: md5Both(PDF_A).hex,
            status: "active",
        })

        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        // eslint-disable-next-line no-console
        console.log(
            "[G4 FAIL BRANCH]",
            JSON.stringify(
                { md5CrossCheck: r.md5CrossCheck, failures: r.failures },
                null,
                2,
            ),
        )

        // E2 — `applicable` is the DENOMINATOR: rows whose bytes came from a
        // source that exposes a checksum. GREEN is `claimed === applicable`,
        // and `applicable === 0` is NOT APPLICABLE, never a pass.
        expect(r.md5CrossCheck).toEqual({
            applicable: 1,
            claimed: 1,
            agreed: 0,
            mismatched: 1,
        })
        expect(r.hashed).toBe(0)
        expect(r.failed).toBe(1)
        expect(r.failures[0].reason).toBe("md5_mismatch")
        expect(r.failures[0].detail).toContain("driveMd5 claims")

        const after = (await row("h-corrupt"))!
        // THE GUARD: no hash, and the failure is recorded with its reason.
        expect(after.contentHash).toBeNull()
        expect((after.hashFailed as Record<string, unknown>).reason).toBe(
            "md5_mismatch",
        )
        expect(
            (after.hashFailed as Record<string, unknown>).detail,
        ).toContain(md5Both(PDF_B).hex)
    })

    it("a verifying md5 claim passes the cross-check and DOES get a hash", async () => {
        BYTES.set("h-ok", PDF_A)
        await seed("h-ok", {
            name: "G-minor Spirits",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            driveMd5: md5Both(PDF_A).hex,
            status: "active",
        })
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.md5CrossCheck).toEqual({
            applicable: 1,
            claimed: 1,
            agreed: 1,
            mismatched: 0,
        })
        expect((await row("h-ok"))!.contentHash).toBeTruthy()
    })

    it("a row that failed once and now verifies has its hashFailed CLEARED", async () => {
        BYTES.set("h-heal", PDF_A)
        await seed("h-heal", {
            name: "Twilight",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            driveMd5: md5Both(PDF_A).hex,
            status: "active",
            hashFailed: {
                reason: "md5_mismatch",
                detail: "an earlier run",
                at: "2026-09-01T00:00:00Z",
            },
        })
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        const after = (await row("h-heal"))!
        expect(after.contentHash).toBeTruthy()
        // A row that now verifies must not keep advertising a failure.
        expect(after.hashFailed).toBeNull()
    })

    it("RESUMABILITY — a second run reads nothing and is free", async () => {
        BYTES.set("h-r1", PDF_A)
        BYTES.set("h-r2", PDF_B)
        for (const [id, b] of [
            ["h-r1", PDF_A],
            ["h-r2", PDF_B],
        ] as const) {
            await seed(id, {
                name: id,
                mimeType: "application/pdf",
                fileSize: b.byteLength,
                status: "active",
            })
        }

        const first = await backfillContentHash(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in first) throw new Error(JSON.stringify(first.error))
        expect(first.read).toBe(2)
        expect(first.hashed).toBe(2)

        const second = await backfillContentHash(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in second) throw new Error(JSON.stringify(second.error))
        expect(second.read).toBe(0)
        expect(second.hashed).toBe(0)
        expect(second.alreadyCurrent).toBe(2)
    })

    it("RESUMABILITY — a stale hash whose size no longer matches IS re-read", async () => {
        BYTES.set("h-stale", PDF_A)
        await seed("h-stale", {
            name: "Refa tziri",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "active",
            contentHash: {
                alg: "sha256",
                value: "f".repeat(64),
                // Recorded against different bytes than the row now claims.
                sizeBytes: PDF_A.byteLength + 100,
                at: "2026-09-01T00:00:00Z",
                source: "upload",
            },
        })
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(1)
        expect(
            ((await row("h-stale"))!.contentHash as Record<string, unknown>)
                .value,
        ).toBe(sha256Hex(PDF_A))
    })

    it("`limit` stops after N BYTE READS and reports the remainder", async () => {
        for (const id of ["l-1", "l-2", "l-3"]) {
            BYTES.set(id, Buffer.from(`bytes for ${id}`, "utf8"))
            await seed(id, {
                name: id,
                mimeType: "application/pdf",
                fileSize: BYTES.get(id)!.byteLength,
                status: "active",
            })
        }
        const r = await backfillContentHash(ADMIN, {
            dryRun: false,
            force: true,
            limit: 2,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(2)
        expect(r.hashed).toBe(2)
        expect(r.remaining).toBe(1)
    })

    it("Google-Apps rows are a REPORTED population, not a silent skip", async () => {
        await seed("gapps-1", {
            name: "Hashiveinu",
            mimeType: "application/vnd.google-apps.document",
            fileSize: 3539,
            status: "duplicate",
        })
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(0)
        expect(r.failed).toBe(1)
        expect(r.failures[0].reason).toBe("bytes_unreachable")
        // The reason names WHY the metadata md5 cannot be the key.
        expect(r.failures[0].detail).toContain("no stored bytes")
        expect(r.coverage.filteredOut.byOther.bytes_unreachable).toBe(1)
    })

    it("unreachable and empty byte reads are distinguished, and neither gets a hash", async () => {
        BYTES.set("dead-1", null)
        await seed("dead-1", {
            name: "dead bytes",
            mimeType: "application/pdf",
            fileSize: 100,
            status: "active",
        })
        BYTES.set("empty-1", Buffer.alloc(0))
        await seed("empty-1", {
            name: "empty bytes",
            mimeType: "application/pdf",
            fileSize: 0,
            status: "active",
        })

        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        const reasons = r.failures.map((f) => f.reason).sort()
        expect(reasons).toEqual(["bytes_unreachable", "empty_buffer"])
        expect((await row("dead-1"))!.contentHash).toBeUndefined()
        expect((await row("empty-1"))!.contentHash).toBeUndefined()
    })

    it("marked `duplicate` rows are IN scope — their bytes decide whether the mark was right", async () => {
        BYTES.set("d-keep", PDF_A)
        BYTES.set("d-lose", PDF_A)
        await seed("d-keep", {
            name: "Niggun - Bonia Full Score",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "active",
        })
        await seed("d-lose", {
            name: "Niggun - Full Score",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "duplicate",
        })

        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(2)
        // The pair the order names, found by BYTES across two different names.
        expect(r.byteIdenticalClusters).toHaveLength(1)
        expect(r.byteIdenticalClusters[0].sha256).toBe(sha256Hex(PDF_A))
        expect(r.byteIdenticalClusters[0].rows.map((x) => x.fileId).sort()).toEqual(
            ["d-keep", "d-lose"],
        )
        // The statuses travel with it, so an operator can see that this
        // cluster is ALREADY resolved and needs no decision.
        expect(
            r.byteIdenticalClusters[0].rows.map((x) => x.status).sort(),
        ).toEqual(["active", "duplicate"])
    })

    it("reports 3-row clusters as clusters, not as pairs", async () => {
        // Production shape: `Niggun - Full Score` is TWO rows plus
        // `Niggun - Bonia Full Score`, all byte-identical — so the operator's
        // decision covers three rows, not two.
        for (const id of ["c-1", "c-2", "c-3"]) {
            BYTES.set(id, PDF_A)
            await seed(id, {
                name: id,
                mimeType: "application/pdf",
                fileSize: PDF_A.byteLength,
                status: "active",
            })
        }
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.byteIdenticalClusters).toHaveLength(1)
        expect(r.byteIdenticalClusters[0].rows).toHaveLength(3)
    })

    it("F-05 — dryRun writes nothing; a real run without force is refused with the plan", async () => {
        BYTES.set("f5-1", PDF_A)
        await seed("f5-1", {
            name: "F-05",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "active",
        })

        const dry = await backfillContentHash(ADMIN, { dryRun: true })
        if ("error" in dry) throw new Error(JSON.stringify(dry.error))
        // dryRun still READS bytes — that is how it can report the clusters —
        // but writes nothing.
        expect(dry.read).toBe(1)
        expect(dry.hashed).toBe(0)
        expect((await row("f5-1"))!.contentHash).toBeUndefined()

        const refused = await backfillContentHash(ADMIN, { dryRun: false })
        expect("error" in refused).toBe(true)
        if (!("error" in refused)) throw new Error("unreachable")
        expect(refused.error.machine_code).toBe("force_required")
        expect(
            (refused as unknown as Record<string, unknown>).dryRunPlan,
        ).toBeTruthy()
        expect((await row("f5-1"))!.contentHash).toBeUndefined()
    })

    it("does not read or write another tenant's rows", async () => {
        BYTES.set("other-1", PDF_A)
        await seed("other-1", {
            name: "someone else's chart",
            mimeType: "application/pdf",
            fileSize: PDF_A.byteLength,
            status: "active",
            orgId: "not-crc",
        })
        const r = await backfillContentHash(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.read).toBe(0)
        expect(r.coverage.filteredOut.byOther.other_org).toBe(1)
        expect((await row("other-1"))!.contentHash).toBeUndefined()
    })

    /**
     * §5 as AMENDED (R-0903-live-cw-3 §3) — the two populations.
     *
     * The amendment's complaint about the order as first written was that a
     * blended number answers neither question, so these tests assert the
     * PARTITION, not just the presence of a field: an audio row's bytes must
     * not appear in the chart population's `bytesRead`, because that is the
     * exact confusion the amendment exists to prevent.
     */
    describe("two populations, never blended (§5 amended)", () => {
        const AUDIO = Buffer.alloc(4096, 7)

        it("splits rows, reads, bytes and hashes by population", async () => {
            await seed("chart-1", {
                orgId: "crc",
                name: "Hashkivenu (Randy).pdf",
                mimeType: "application/pdf",
                fileSize: PDF_A.byteLength,
            })
            await seed("audio-1", {
                orgId: "crc",
                name: "Avinu Malkeinu Janowski D minor - Alto.mp3",
                mimeType: "audio/mpeg",
                fileSize: AUDIO.byteLength,
            })
            BYTES.set("chart-1", PDF_A)
            BYTES.set("audio-1", AUDIO)

            const r = await backfillContentHash(ADMIN, { force: true })
            if ("error" in r) throw new Error("unexpected refusal")

            expect(r.populations.chart.rows).toBe(1)
            expect(r.populations.nonChart.rows).toBe(1)
            expect(r.populations.chart.read).toBe(1)
            expect(r.populations.nonChart.read).toBe(1)
            expect(r.populations.chart.hashed).toBe(1)
            expect(r.populations.nonChart.hashed).toBe(1)

            // The figure the amendment actually cares about: the cost, in
            // bytes, attributed to the population that incurred it.
            expect(r.populations.chart.bytesRead).toBe(PDF_A.byteLength)
            expect(r.populations.nonChart.bytesRead).toBe(AUDIO.byteLength)
            expect(
                r.populations.chart.bytesRead +
                    r.populations.nonChart.bytesRead,
            ).toBe(PDF_A.byteLength + AUDIO.byteLength)

            // Both halves add up to the blended totals, so the partition is
            // a decomposition and not a second, disagreeing measurement.
            expect(r.populations.chart.rows + r.populations.nonChart.rows).toBe(
                r.scanned,
            )
            expect(r.populations.chart.read + r.populations.nonChart.read).toBe(
                r.read,
            )
        })

        it("hashes the audio rows at all — the amendment's whole point", async () => {
            await seed("audio-1", {
                orgId: "crc",
                name: "May The Memory - Soprano.mp3",
                mimeType: "audio/mpeg",
                fileSize: AUDIO.byteLength,
            })
            BYTES.set("audio-1", AUDIO)

            const r = await backfillContentHash(ADMIN, { force: true })
            if ("error" in r) throw new Error("unexpected refusal")

            // As the order was FIRST written, §9 said these rows were out of
            // scope. If a later change ever re-excludes them, this fails.
            const stored = await row("audio-1")
            expect((stored?.contentHash as { value: string }).value).toBe(
                sha256Hex(AUDIO),
            )
            expect(r.populations.nonChart.hashed).toBe(1)
            expect(r.populations.chart.rows).toBe(0)
        })

        it("attributes a failure to its own population, not the other one", async () => {
            await seed("audio-dead", {
                orgId: "crc",
                name: "Barechu_trad - Tenor.mp3",
                mimeType: "audio/mpeg",
                fileSize: 999,
            })
            await seed("chart-1", {
                orgId: "crc",
                name: "Twilight.pdf",
                mimeType: "application/pdf",
                fileSize: PDF_A.byteLength,
            })
            BYTES.set("chart-1", PDF_A)
            // audio-dead deliberately has no bytes.

            const r = await backfillContentHash(ADMIN, { force: true })
            if ("error" in r) throw new Error("unexpected refusal")

            expect(r.populations.nonChart.failed).toBe(1)
            expect(r.populations.chart.failed).toBe(0)
            expect(r.populations.chart.hashed).toBe(1)
            expect(r.populations.nonChart.hashed).toBe(0)
            expect(
                r.populations.chart.failed + r.populations.nonChart.failed,
            ).toBe(r.failed)
        })

        it("counts a Google-Apps row as nonChart, where the classifier puts it", async () => {
            await seed("gdoc-1", {
                orgId: "crc",
                name: "Kol Nidre notes",
                mimeType: "application/vnd.google-apps.document",
            })

            const r = await backfillContentHash(ADMIN, { force: true })
            if ("error" in r) throw new Error("unexpected refusal")

            // Recorded as a finding rather than asserted as obviously right:
            // `isNonChartArtifactShape` calls a Google-Doc non_chart, so its
            // `bytes_unreachable` failure lands in the nonChart population
            // even though a reader thinking "non_chart means audio" would
            // expect it elsewhere. The partition follows ONE classifier
            // rather than a fresh definition, and this test pins which.
            expect(r.populations.nonChart.rows).toBe(1)
            expect(r.populations.nonChart.failed).toBe(1)
            expect(r.populations.nonChart.read).toBe(0)
            expect(r.populations.nonChart.bytesRead).toBe(0)
            expect(r.failures[0].reason).toBe("bytes_unreachable")
        })

        it("carries the populations in the force_required refusal too", async () => {
            await seed("audio-1", {
                orgId: "crc",
                name: "May The Memory - Alto.mp3",
                mimeType: "audio/mpeg",
                fileSize: AUDIO.byteLength,
            })
            BYTES.set("audio-1", AUDIO)

            const r = await backfillContentHash(ADMIN, {})
            expect("error" in r).toBe(true)
            if (!("error" in r)) throw new Error("unreachable")
            expect(r.error.machine_code).toBe("force_required")
            // richError spreads extras at the TOP level of the envelope,
            // not under error.data (errors.ts) — a refusal that reported
            // less than the run it refuses is how an operator gets a
            // surprise bill on the audio population.
            const plan = (r as unknown as { dryRunPlan: Record<string, unknown> })
                .dryRunPlan
            const pops = plan.populations as {
                nonChart: { rows: number; bytesRead: number }
                chart: { rows: number }
            }
            expect(pops.nonChart.rows).toBe(1)
            expect(pops.nonChart.bytesRead).toBe(AUDIO.byteLength)
            expect(pops.chart.rows).toBe(0)
        })

        it("attributes alreadyCurrent to the right population on a re-run", async () => {
            await seed("audio-1", {
                orgId: "crc",
                name: "Barechu_trad - Bass.mp3",
                mimeType: "audio/mpeg",
                fileSize: AUDIO.byteLength,
            })
            BYTES.set("audio-1", AUDIO)

            await backfillContentHash(ADMIN, { force: true })
            const second = await backfillContentHash(ADMIN, { force: true })
            if ("error" in second) throw new Error("unexpected refusal")

            // Resumability is the reason the amendment can say "let it run
            // long" about a megabyte-and-a-half-per-group population.
            expect(second.populations.nonChart.alreadyCurrent).toBe(1)
            expect(second.populations.nonChart.read).toBe(0)
            expect(second.populations.nonChart.bytesRead).toBe(0)
            expect(second.read).toBe(0)
        })
    })
})
