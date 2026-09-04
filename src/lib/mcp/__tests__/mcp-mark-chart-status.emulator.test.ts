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

import { markChartStatus } from "../tools/mark-chart-status"
import { undoDedupeGroup } from "../tools/undo-dedupe"

/**
 * M1 — the single-row mark (`R-0904-live-cw-2` §2, `R-0904-live-cw-6`).
 *
 * These tests are the guards of the order stated as code: the record is
 * written before the flip, the prior status is READ and not passed, the mark
 * is reversible the moment it exists, and a decision cannot be mistaken for a
 * sweep result.
 */
describe("MCP mark_chart_status — the single-row human mark (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-1"

    function db() {
        return getFirestore(app)
    }
    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }
    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db()
            .collection("library_index")
            .doc(id)
            .set({ mimeType: "audio/mpeg", status: "active", ...data })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-mark-row" })
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
    })

    it("marks the named row and NOTHING else, recording the decision's provenance", async () => {
        await seedIndex("keep-me", { name: "Mizmor Shiru Ladonai.mp3" })
        await seedIndex("hide-me", { name: "Mizmor Shiru L'adonai .mp3" })
        await db()
            .collection("songs")
            .doc("hide-me")
            .set({ title: "Mizmor Shiru L'adonai .mp3", status: "active" })

        const r = await markChartStatus(ADMIN, {
            fileId: "hide-me",
            toStatus: "duplicate",
            canonicalFileId: "keep-me",
            ruling: "R-0903-live-cw-8",
            reason: "the clean-named row matches the PDF chart of the same song",
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        expect(r.fromStatus).toBe("active")
        expect(r.toStatus).toBe("duplicate")
        expect(r.priorStatus).toBe("active")
        expect(r.songMirrored).toBe(true)
        expect(r.runId).toMatch(/^human-mark-/)

        // exactly one row moved
        const kept = await db().collection("library_index").doc("keep-me").get()
        expect(kept.data()?.status).toBe("active")
        const hidden = await db()
            .collection("library_index")
            .doc("hide-me")
            .get()
        expect(hidden.data()?.status).toBe("duplicate")
        expect(hidden.data()?.priorStatus).toBe("active")
        expect(hidden.data()?.dedupeRunId).toBe(r.runId)
        // the mirror moved with it
        const song = await db().collection("songs").doc("hide-me").get()
        expect(song.data()?.status).toBe("duplicate")

        // the record a cold reader finds: unmistakably a person's decision
        const rec = await db().collection("dedupeRuns").doc(r.runId!).get()
        expect(rec.exists).toBe(true)
        const d = rec.data()!
        expect(d.decidedBy).toBe("human")
        expect(d.ruling).toBe("R-0903-live-cw-8")
        expect(d.reason).toContain("matches the PDF chart")
        expect(d.threshold).toBeNull() // no mechanism, not a missing number
        expect(d.groupsFound).toBe(0)
        expect(d.marked).toBe(1)
        expect(d.rows).toHaveLength(1)
        expect(d.rows[0].groupedBy).toBe("human-mark")
        expect(d.rows[0].priorStatus).toBe("active")
        expect(d.rows[0].canonicalFileId).toBe("keep-me")
    })

    it("G3 — the mark is reversible the moment it exists", async () => {
        await seedIndex("row", { name: "a.mp3", status: "archived" })
        const r = await markChartStatus(ADMIN, {
            fileId: "row",
            toStatus: "duplicate",
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        // The recorded prior status is `archived`, so a restore returns it
        // there — never to `active`, which is the harm undo_dedupe_group
        // exists to avoid.
        const plan = await undoDedupeGroup(ADMIN, {
            runId: r.runId!,
            dryRun: true,
        })
        if ("error" in plan) throw new Error(JSON.stringify(plan.error))
        expect(plan.rows).toHaveLength(1)
        expect(plan.rows[0].fileId).toBe("row")
        expect(plan.rows[0].toStatus).toBe("archived")
        expect(plan.rows[0].source).toBe("run-record")

        const done = await undoDedupeGroup(ADMIN, {
            runId: r.runId!,
            dryRun: false,
            force: true,
        })
        if ("error" in done) throw new Error(JSON.stringify(done.error))
        const back = await db().collection("library_index").doc("row").get()
        expect(back.data()?.status).toBe("archived")
    })

    it("G4 — priorStatus is read off the row; a caller cannot supply one", async () => {
        await seedIndex("row", { name: "a.mp3", status: "archived" })
        // The args interface exposes no `priorStatus`, so the only way to
        // attempt the invention is to smuggle one past the type. It must be
        // ignored: what lands is what the row actually said.
        const r = await markChartStatus(
            ADMIN,
            {
                fileId: "row",
                toStatus: "duplicate",
                priorStatus: "active",
                dryRun: false,
                force: true,
            } as never,
        )
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.priorStatus).toBe("archived")
        const rec = await db().collection("dedupeRuns").doc(r.runId!).get()
        expect(rec.data()!.rows[0].priorStatus).toBe("archived")
    })

    it("F-05 — a real write without force refuses and writes nothing; dryRun needs no force", async () => {
        await seedIndex("row", { name: "a.mp3" })

        const refused = await markChartStatus(ADMIN, {
            fileId: "row",
            toStatus: "duplicate",
        })
        if ("error" in refused) throw new Error(JSON.stringify(refused.error))
        expect(refused.refused).toBe(true)
        expect(refused.runId).toBeNull()

        const dry = await markChartStatus(ADMIN, {
            fileId: "row",
            toStatus: "duplicate",
            dryRun: true,
        })
        if ("error" in dry) throw new Error(JSON.stringify(dry.error))
        expect(dry.refused).toBeUndefined()
        expect(dry.priorStatus).toBe("active") // read, and reported, without writing

        expect(
            (await db().collection("library_index").doc("row").get()).data()
                ?.status,
        ).toBe("active")
        expect((await db().collection("dedupeRuns").get()).size).toBe(0)
    })

    it("will not guess a target status, and refuses an unknown one", async () => {
        await seedIndex("row", { name: "a.mp3" })
        const noStatus = await markChartStatus(ADMIN, { fileId: "row" } as never)
        expect(JSON.stringify(noStatus)).toContain("to_status_required")
        const bad = await markChartStatus(ADMIN, {
            fileId: "row",
            toStatus: "hidden",
            force: true,
            dryRun: false,
        })
        expect(JSON.stringify(bad)).toContain("to_status_invalid")
    })

    it("is idempotent and honest — no record for a change that did not happen", async () => {
        await seedIndex("row", { name: "a.mp3", status: "duplicate" })
        const r = await markChartStatus(ADMIN, {
            fileId: "row",
            toStatus: "duplicate",
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.noop).toContain("already reads")
        expect(r.runId).toBeNull()
        expect((await db().collection("dedupeRuns").get()).size).toBe(0)
    })

    it("is admin-only, and another tenant's row answers as an absence", async () => {
        await seedIndex("row", { name: "a.mp3" })
        const nonAdmin = await markChartStatus(MUSICIAN, {
            fileId: "row",
            toStatus: "duplicate",
            dryRun: true,
        })
        expect(JSON.stringify(nonAdmin)).toContain("forbidden_role")

        await seedIndex("theirs", { name: "b.mp3", orgId: "brotherslazaroff" })
        const cross = await markChartStatus(ADMIN, {
            fileId: "theirs",
            toStatus: "duplicate",
            dryRun: true,
        })
        const absent = await markChartStatus(ADMIN, {
            fileId: "no-such-row",
            toStatus: "duplicate",
            dryRun: true,
        })
        // Byte-identical to a genuine absence once the echoed id is masked —
        // every occurrence, not just the first, which is the difference
        // between a wall and an oracle.
        expect(JSON.stringify(cross).split("theirs").join("X")).toBe(
            JSON.stringify(absent).split("no-such-row").join("X"),
        )
    })
})
