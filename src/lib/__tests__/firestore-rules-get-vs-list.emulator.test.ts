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
    doc,
    getDoc,
    getDocs,
    query,
    where,
} from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * R-0919-audit-2 — `get` is public, `list` is not, on `setlists` and `tracks`.
 *
 * THE HOLE THIS CLOSES. Both collections carried `allow read: if true`. At
 * collection level `read` is `get` + `list`, and `list` is a whole-collection
 * query — so an anonymous caller could enumerate every setlist and every track
 * of BOTH tenants in a single request. Nothing in the app needed that; the two
 * surfaces that looked like they did (the signed-out /perform landing, and
 * `fetchTracksForSetlistClient`) now go through public, rate-limited server
 * routes that answer for one setlist at a time.
 *
 * WHAT MUST NOT REGRESS, and why it is tested as hard as the hole itself:
 * single-document `get` stays public. An anonymous /perform link carries a
 * setlist id, and a musician who cannot open the setlist they are meant to
 * play is a service-block. If a later "tighten the rules" change makes `get`
 * require sign-in, the first two tests here go red.
 *
 * BOTH TENANTS. Brothers Lazaroff is a live second tenant on this app, so
 * every case runs twice — once against a `crc` row and once against a
 * `brotherslazaroff` row. A rule that happened to be written in terms of one
 * org would pass a single-tenant suite and fail a congregation.
 */

const ORGS = ["crc", "brotherslazaroff"] as const

describe("R-0919-audit-2 firestore.rules — get is public, list is not", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (
            process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
        ).split(":")
        const port = Number.parseInt(portStr ?? "8080", 10)

        testEnv = await initializeTestEnvironment({
            projectId: "demo-r0919-audit-2",
            firestore: {
                rules: readFileSync(
                    resolve(process.cwd(), "firestore.rules"),
                    "utf8",
                ),
                host,
                port,
            },
        })
    })

    afterAll(async () => {
        await testEnv.cleanup()
    })

    beforeEach(async () => {
        await testEnv.clearFirestore()
        // One setlist and one track per tenant, seeded with rules disabled.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            for (const org of ORGS) {
                await db.collection("setlists").doc(`setlist-${org}`).set({
                    name: `Service — ${org}`,
                    ownerId: `leader-${org}`,
                    orgId: org,
                    trackCount: 1,
                })
                await db.collection("tracks").doc(`track-${org}`).set({
                    setlistId: `setlist-${org}`,
                    title: "Oseh Shalom",
                    order: 0,
                    type: "song",
                    orgId: org,
                })
            }
        })
    })

    // ── What must keep working ──────────────────────────────────────────────

    describe.each(ORGS)("%s — signed out", (org) => {
        it("can get a setlist by id (the anonymous /perform link)", async () => {
            const db = testEnv.unauthenticatedContext().firestore()
            const snap = await assertSucceeds(
                getDoc(doc(db, "setlists", `setlist-${org}`)),
            )
            expect(snap.exists()).toBe(true)
            expect(snap.data()?.orgId).toBe(org)
        })

        it("can get a track by id", async () => {
            const db = testEnv.unauthenticatedContext().firestore()
            const snap = await assertSucceeds(
                getDoc(doc(db, "tracks", `track-${org}`)),
            )
            expect(snap.exists()).toBe(true)
            expect(snap.data()?.setlistId).toBe(`setlist-${org}`)
        })
    })

    // ── What must now be refused ────────────────────────────────────────────

    describe.each(ORGS)("%s — signed out cannot enumerate", (org) => {
        it("is denied a bare collection query on setlists", async () => {
            const db = testEnv.unauthenticatedContext().firestore()
            await assertFails(getDocs(collection(db, "setlists")))
        })

        it("is denied a bare collection query on tracks", async () => {
            const db = testEnv.unauthenticatedContext().firestore()
            await assertFails(getDocs(collection(db, "tracks")))
        })

        it("is denied the tracks-by-setlistId query Perform used to run", async () => {
            // This is the exact query `fetchTracksForSetlistClient` ran. It is
            // a `list` however narrow the filter looks — which is the point:
            // a rule cannot see the filter, only that a query was asked for.
            const db = testEnv.unauthenticatedContext().firestore()
            await assertFails(
                getDocs(
                    query(
                        collection(db, "tracks"),
                        where("setlistId", "==", `setlist-${org}`),
                    ),
                ),
            )
        })

        it("is denied a query scoped to its own org", async () => {
            // Narrowing by orgId does not buy a signed-out caller a list
            // either. Stated explicitly so nobody "fixes" the Perform landing
            // by adding an org filter and assuming that made it legal.
            const db = testEnv.unauthenticatedContext().firestore()
            await assertFails(
                getDocs(
                    query(
                        collection(db, "setlists"),
                        where("orgId", "==", org),
                    ),
                ),
            )
        })
    })

    // ── Signed in, listing works again ──────────────────────────────────────

    describe.each(ORGS)("%s — signed in", (org) => {
        it("may list setlists", async () => {
            const db = testEnv
                .authenticatedContext(`member-${org}`)
                .firestore()
            const snap = await assertSucceeds(getDocs(collection(db, "setlists")))
            expect(snap.size).toBe(ORGS.length)
        })

        it("may run the tracks-by-setlistId query", async () => {
            const db = testEnv
                .authenticatedContext(`member-${org}`)
                .firestore()
            const snap = await assertSucceeds(
                getDocs(
                    query(
                        collection(db, "tracks"),
                        where("setlistId", "==", `setlist-${org}`),
                    ),
                ),
            )
            expect(snap.size).toBe(1)
            expect(snap.docs[0].id).toBe(`track-${org}`)
        })
    })
})
