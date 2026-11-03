import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import {
    collection,
    getDocs,
    onSnapshot,
    query,
    where,
    type Firestore,
    type Query,
} from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { liveTracksQuery } from "@/lib/sync/snapshot-listener"

/**
 * The live tracks listener as a band leader sees it (2026-11-03).
 *
 * THE REGRESSION. caacfb34 (2026-10-13) made `list` on /tracks require
 * standing in the rows' tenant, which a rule can only check through an orgId
 * filter. The live listener in sync/snapshot-listener.ts kept querying
 * `setlistId == X` alone, so every signed-in user but the platform owner was
 * refused and nobody saw live row updates, in the editor or in Perform. The
 * rules tests covered the client-tracks query and a signed-out caller, but
 * never this query as a signed-in non-po member. This file is that guard: it
 * runs the listener's exact query (`liveTracksQuery`) through onSnapshot, as
 * a `bl` member of each tenant, and shows the old query is refused.
 *
 * BOTH TENANTS, per CLAUDE.md: a rule written in terms of one org would pass
 * a single-tenant suite.
 */

const ORGS = ["crc", "brotherslazaroff"] as const

/** First delivery of an onSnapshot listener, or its error. */
function firstSnapshot(q: Query): Promise<{ size: number; ids: string[] }> {
    return new Promise((resolvePromise, reject) => {
        const unsub = onSnapshot(
            q,
            (snap) => {
                unsub()
                resolvePromise({ size: snap.size, ids: snap.docs.map((d) => d.id) })
            },
            (err) => reject(err),
        )
    })
}

describe("live tracks listener query vs firestore.rules", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (
            process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
        ).split(":")
        testEnv = await initializeTestEnvironment({
            projectId: "demo-live-tracks-listener",
            firestore: {
                rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
                host,
                port: Number.parseInt(portStr ?? "8080", 10),
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            for (const org of ORGS) {
                await db.collection("setlists").doc(`setlist-${org}`).set({
                    name: `Service ${org}`,
                    ownerId: `leader-${org}`,
                    orgId: org,
                })
                for (const i of [0, 1]) {
                    await db.collection("tracks").doc(`track-${org}-${i}`).set({
                        setlistId: `setlist-${org}`,
                        title: `Row ${i}`,
                        order: i,
                        orgId: org,
                    })
                }
            }
        })
    })

    const blMember = (org: string): Firestore =>
        testEnv
            .authenticatedContext(`bl-${org}`, { m: { [org]: "bl" } })
            .firestore() as unknown as Firestore

    describe.each(ORGS)("%s band leader (not po)", (org) => {
        it("receives its setlist's rows through the listener's query", async () => {
            const db = blMember(org)
            const result = await assertSucceeds(
                firstSnapshot(liveTracksQuery(db, `setlist-${org}`, org)),
            )
            expect(result.size).toBe(2)
            expect(result.ids.sort()).toEqual([`track-${org}-0`, `track-${org}-1`])
        })

        it("is refused the old setlistId-only query (the bug)", async () => {
            const db = blMember(org)
            await assertFails(
                firstSnapshot(
                    query(collection(db, "tracks"), where("setlistId", "==", `setlist-${org}`)),
                ),
            )
        })

        it("is refused the listener's query for the other tenant's setlist", async () => {
            const other = ORGS.find((o) => o !== org)!
            const db = blMember(org)
            await assertFails(getDocs(liveTracksQuery(db, `setlist-${other}`, other)))
        })
    })
})
