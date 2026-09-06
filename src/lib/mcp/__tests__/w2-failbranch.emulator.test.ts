import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { dedupeLibraryIndex } from "../tools/library"

/**
 * G2 FAIL BRANCH — reversibility precedes hiding.
 *
 * This file is the SHOW half of guard G2 in the content-hash order. It is
 * meaningful ONLY while the run-record write is deliberately broken by
 * `scratchpad/failbranch.py apply`; against the shipped code it asserts the
 * happy path instead, which is why it checks the outcome both ways and says
 * which world it is in.
 *
 * The point being proven: when the `dedupeRuns` record cannot be written,
 * the run must REFUSE — not fall through and hide rows it has no way to
 * restore. That is the failure mode that produced the 100 unreversible rows
 * in production, and the only structural defence is write-order.
 */
describe("G2 fail branch — a run that cannot record refuses to hide", () => {
    let app: App
    const ADMIN = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-w2-failbranch" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const col of ["songs", "library_index", "users", "dedupeRuns"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
    })

    it("a broken run-record write leaves ZERO rows marked", async () => {
        await db().collection("library_index").doc("fb-keep").set({
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "active",
        })
        await db().collection("library_index").doc("fb-lose").set({
            name: "Hashkivenu (Randy)",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "active",
        })

        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })

        const keep = (
            await db().collection("library_index").doc("fb-keep").get()
        ).data() as Record<string, unknown>
        const lose = (
            await db().collection("library_index").doc("fb-lose").get()
        ).data() as Record<string, unknown>
        const runs = await db().collection("dedupeRuns").get()

        const broken = "error" in r


        console.log(
            "[G2 FAIL BRANCH]",
            JSON.stringify(
                {
                    recordWriteBroken: broken,
                    toolOutcome: broken ? r.error : { committed: r.committed },
                    runRecordsWritten: runs.size,
                    keepStatus: keep.status,
                    loseStatus: lose.status,
                    loseCarriesPriorStatus: "priorStatus" in lose,
                },
                null,
                2,
            ),
        )

        if (broken) {
            // THE GUARD. The record could not be written, so nothing is
            // hidden: the loser is still `active`, and no run doc exists.
            expect(lose.status).toBe("active")
            expect(keep.status).toBe("active")
            expect(runs.size).toBe(0)
            expect(lose.priorStatus).toBeUndefined()
        } else {
            // Shipped code: the record lands first, then the mark.
            if ("error" in r) throw new Error("unreachable")
            expect(r.committed).toBe(1)
            expect(runs.size).toBe(1)
            expect(lose.status).toBe("duplicate")
            expect(lose.priorStatus).toBe("active")
        }
    })
})
