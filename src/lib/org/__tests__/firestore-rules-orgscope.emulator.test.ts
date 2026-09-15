import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

/**
 * v11-01-04 — org-scoped Firestore rules coverage.
 *
 * Proves the WRITE-ISOLATION design (NOT write-requirement):
 *  - AC-1: CRC users carry NO orgIds claim and MUST retain full write access
 *    (no lock-out) — orgId-absent and orgId="crc" writes both succeed.
 *  - AC-2: a caller whose claim names a DIFFERENT tenant cannot write into crc;
 *    orgId is immutable across tenants on update (admins exempt).
 *  - AC-3: reads are UNCHANGED (setlists/tracks public; songs/recordings member;
 *    orgs public-read, write-denied) — the err-public + no-lock-out invariant.
 *
 * Rules edits are high-blast-radius (a typo locks out prod), so this suite is
 * the mandatory blocking gate before `firebase deploy`. Runs via
 * `npm run test:emulator` (firebase emulators:exec wrapper).
 */
describe("v11-01-04 firestore.rules org-scope", () => {
    let testEnv: RulesTestEnvironment

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        const [host, portStr] = (
            process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
        ).split(":")
        const port = Number.parseInt(portStr ?? "8080", 10)

        testEnv = await initializeTestEnvironment({
            projectId: "demo-v11-01-04",
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
        // Seed crc-tenant docs via a privileged context (bypasses rules).
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore()
            await db.collection("setlists").doc("sl-crc").set({
                name: "CRC Setlist",
                ownerId: "crc-leader",
                orgId: "crc",
                hydrated: true,
                trackCount: 1,
            })
            await db.collection("tracks").doc("tk-crc").set({
                setlistId: "sl-crc",
                title: "Song",
                order: 0,
                type: "song",
                orgId: "crc",
            })
            await db.collection("songs").doc("song-crc").set({
                title: "Adon Olam",
                orgId: "crc",
            })
            await db.collection("recordings").doc("rec-crc").set({
                songId: "song-crc",
                title: "Ref",
                orgId: "crc",
            })
            await db.collection("orgs").doc("crc").set({
                id: "crc",
                name: "Central Reform Congregation",
                domain: "centralreform.live",
            })
        })
    })

    // Claimless CRC band_leader (no orgIds claim → defaults to crc in rules).
    function crcLeader() {
        return testEnv
            .authenticatedContext("crc-leader", { role: "band_leader" })
            .firestore()
    }
    // Brothers Lazaroff band_leader (explicit foreign-tenant claim).
    function blLeader() {
        return testEnv
            .authenticatedContext("bl-leader", {
                role: "band_leader",
                orgIds: ["brotherslazaroff"],
            })
            .firestore()
    }
    function adminCtx() {
        return testEnv
            .authenticatedContext("admin-uid", { role: "admin" })
            .firestore()
    }

    // ─── AC-1: CRC users (no orgIds claim) keep FULL write access ──────────

    it("AC-1: claimless CRC leader can create setlist with orgId='crc' AND with no orgId", async () => {
        const db = crcLeader()
        await assertSucceeds(
            db.collection("setlists").doc("sl-new-crc").set({
                name: "New", ownerId: "crc-leader", orgId: "crc",
            }),
        )
        await assertSucceeds(
            db.collection("setlists").doc("sl-new-noorg").set({
                name: "New2", ownerId: "crc-leader",
            }),
        )
    })

    it("AC-1: claimless CRC leader can update an existing crc setlist (no lock-out)", async () => {
        await assertSucceeds(
            crcLeader().collection("setlists").doc("sl-crc").update({ name: "Renamed" }),
        )
    })

    it("AC-1: claimless CRC leader can create+update tracks (orgId=crc and absent)", async () => {
        const db = crcLeader()
        await assertSucceeds(
            db.collection("tracks").doc("tk-new").set({
                setlistId: "sl-crc", title: "T", order: 1, type: "song", orgId: "crc",
            }),
        )
        await assertSucceeds(
            db.collection("tracks").doc("tk-new-noorg").set({
                setlistId: "sl-crc", title: "T2", order: 2, type: "song",
            }),
        )
        await assertSucceeds(
            db.collection("tracks").doc("tk-crc").update({ key: "G" }),
        )
    })

    it("AC-1: claimless CRC leader can write songs + recordings (orgId=crc)", async () => {
        const db = crcLeader()
        await assertSucceeds(
            db.collection("songs").doc("song-new").set({ title: "S", orgId: "crc" }),
        )
        await assertSucceeds(
            db.collection("recordings").doc("rec-new").set({
                songId: "song-crc", title: "R", orgId: "crc",
            }),
        )
    })

    // ─── AC-2: cross-tenant writes are DENIED ──────────────────────────────

    it("AC-2: BL-claim leader CANNOT create crc-tenant docs, CAN create bl-tenant docs", async () => {
        const db = blLeader()
        await assertFails(
            db.collection("setlists").doc("sl-x").set({
                name: "X", ownerId: "bl-leader", orgId: "crc",
            }),
        )
        await assertSucceeds(
            db.collection("setlists").doc("sl-bl").set({
                name: "BL", ownerId: "bl-leader", orgId: "brotherslazaroff",
            }),
        )
        await assertFails(
            db.collection("tracks").doc("tk-x").set({
                setlistId: "sl-bl", title: "T", order: 0, type: "song", orgId: "crc",
            }),
        )
        await assertSucceeds(
            db.collection("tracks").doc("tk-bl").set({
                setlistId: "sl-bl", title: "T", order: 0, type: "song", orgId: "brotherslazaroff",
            }),
        )
    })

    it("AC-2: orgId is immutable across tenants on update (non-admin denied, admin allowed)", async () => {
        await assertFails(
            blLeader().collection("setlists").doc("sl-crc").update({
                orgId: "brotherslazaroff",
            }),
        )
        await assertSucceeds(
            adminCtx().collection("setlists").doc("sl-crc").update({
                orgId: "brotherslazaroff",
            }),
        )
    })

    it("AC-2: a foreign leader cannot update or delete an existing crc track", async () => {
        const foreignTrack = blLeader().collection("tracks").doc("tk-crc")
        await assertFails(foreignTrack.update({ key: "F#" }))
        await assertFails(foreignTrack.delete())

        const ownTrack = blLeader().collection("tracks").doc("tk-bl-owned")
        await assertSucceeds(
            ownTrack.set({
                setlistId: "sl-bl",
                title: "Own tenant",
                order: 0,
                type: "song",
                orgId: "brotherslazaroff",
            }),
        )
        await assertSucceeds(ownTrack.update({ key: "D" }))
        await assertSucceeds(ownTrack.delete())
    })

    // ─── AC-3: reads UNCHANGED (err-public, no lock-out) ───────────────────

    it("AC-3: unauthenticated reads of setlists + tracks still SUCCEED (public)", async () => {
        const db = testEnv.unauthenticatedContext().firestore()
        await assertSucceeds(db.collection("setlists").doc("sl-crc").get())
        await assertSucceeds(db.collection("tracks").doc("tk-crc").get())
    })

    it("AC-3: a CRC member can still read songs + recordings", async () => {
        const member = testEnv
            .authenticatedContext("member-uid", { role: "member" })
            .firestore()
        await assertSucceeds(member.collection("songs").doc("song-crc").get())
        await assertSucceeds(member.collection("recordings").doc("rec-crc").get())
    })

    it("AC-3: orgs/{id} is publicly readable but client writes are denied", async () => {
        await assertSucceeds(
            testEnv.unauthenticatedContext().firestore().collection("orgs").doc("crc").get(),
        )
        await assertFails(
            adminCtx().collection("orgs").doc("crc").update({ name: "Hacked" }),
        )
    })

    // ════════════════════════════════════════════════════════════════════════
    // v11-06-01 — adversarial cross-tenant isolation across the v11-05
    // collections (the close-gate rules audit). Proves the RULES-LAYER wall for
    // every collection a client can read directly; characterizes the ones that
    // are application-only scoped (no client read path / no orgId field).
    // ════════════════════════════════════════════════════════════════════════
    describe("v11-06-01 cross-tenant isolation — v11-05 collections", () => {
        // A plain musician (reads only their OWN scheduling assignment).
        function crcMusician() {
            return testEnv
                .authenticatedContext("crc-musician", { role: "musician" })
                .firestore()
        }

        beforeEach(async () => {
            await testEnv.withSecurityRulesDisabled(async (ctx) => {
                const db = ctx.firestore()
                // scheduling_assignments: crc, bl, and a legacy orgId-absent row.
                await db.collection("scheduling_assignments").doc("asg-crc").set({
                    musicianUid: "crc-musician",
                    setlistId: "sl-crc",
                    orgId: "crc",
                })
                await db.collection("scheduling_assignments").doc("asg-bl").set({
                    musicianUid: "bl-musician",
                    setlistId: "sl-bl",
                    orgId: "brotherslazaroff",
                })
                await db.collection("scheduling_assignments").doc("asg-legacy").set({
                    musicianUid: "crc-musician",
                    setlistId: "sl-legacy",
                    // no orgId — pre-stamp legacy row (crc-safe path)
                })
                // scheduling_history
                await db.collection("scheduling_history").doc("hist-crc").set({
                    setlistId: "sl-crc",
                    orgId: "crc",
                })
                await db.collection("scheduling_history").doc("hist-bl").set({
                    setlistId: "sl-bl",
                    orgId: "brotherslazaroff",
                })
                // config/congregation (crc bare) + per-org namespaced (bl)
                await db.collection("config").doc("congregation").set({
                    name: "Central Reform Congregation",
                })
                await db.collection("config").doc("congregation__brotherslazaroff").set({
                    name: "Brothers Lazaroff",
                })
                // users — note: NO orgId field (membership is claim-based, v11-05-02)
                await db.collection("users").doc("crc-musician").set({
                    musicianProfile: { name: "Randy", instrument: "piano" },
                })
                // setlistTemplates — orgId-stamped (v11-05-01 backfill)
                await db.collection("setlistTemplates").doc("tpl-crc").set({
                    name: "Randy Shabbat morning",
                    ownerId: "crc-leader",
                    orgId: "crc",
                })
            })
        })

        // ── scheduling_assignments: RULES-LAYER walled (client-readable path) ──

        it("a musician reads their OWN assignment (any tenant, own data)", async () => {
            await assertSucceeds(
                crcMusician().collection("scheduling_assignments").doc("asg-crc").get(),
            )
        })

        it("LEAK WALLED: a BL leader CANNOT read a CRC assignment", async () => {
            await assertFails(
                blLeader().collection("scheduling_assignments").doc("asg-crc").get(),
            )
        })

        it("a BL leader CAN read a BL assignment (own tenant)", async () => {
            await assertSucceeds(
                blLeader().collection("scheduling_assignments").doc("asg-bl").get(),
            )
        })

        it("crc-safe: claimless CRC leader reads crc + legacy(no-orgId) assignments, NOT bl", async () => {
            await assertSucceeds(
                crcLeader().collection("scheduling_assignments").doc("asg-crc").get(),
            )
            await assertSucceeds(
                crcLeader().collection("scheduling_assignments").doc("asg-legacy").get(),
            )
            await assertFails(
                crcLeader().collection("scheduling_assignments").doc("asg-bl").get(),
            )
        })

        // ── scheduling_history: RULES-LAYER walled ──

        it("LEAK WALLED: a BL leader CANNOT read CRC scheduling_history; CAN read BL", async () => {
            await assertFails(
                blLeader().collection("scheduling_history").doc("hist-crc").get(),
            )
            await assertSucceeds(
                blLeader().collection("scheduling_history").doc("hist-bl").get(),
            )
        })

        // ── config/congregation: per-org branding readable; writes admin-only ──

        it("per-org congregation branding is client-readable (bare crc AND namespaced bl)", async () => {
            await assertSucceeds(
                crcLeader().collection("config").doc("congregation").get(),
            )
            // The fix: without the guarded wildcard this was deny-by-default.
            await assertSucceeds(
                blLeader().collection("config").doc("congregation__brotherslazaroff").get(),
            )
        })

        it("congregation writes are Admin-SDK-only: a band_leader CANNOT write either tenant's doc", async () => {
            await assertFails(
                crcLeader().collection("config").doc("congregation").set({ name: "Hacked" }),
            )
            await assertFails(
                blLeader()
                    .collection("config")
                    .doc("congregation__brotherslazaroff")
                    .set({ name: "Hacked" }),
            )
        })

        it("the guarded wildcard does NOT expose config/admins to non-fallback writes (admins stays write:false)", async () => {
            await assertFails(
                adminCtx().collection("config").doc("admins").set({ uids: ["evil"] }),
            )
        })

        // ── CHARACTERIZATION: application-only scoped (recorded in the audit) ──
        // These collections are NOT org-walled at the rules layer. That is
        // ACCEPTED because the application layer scopes them and there is no
        // cross-tenant CLIENT exposure:
        //  - users: the user doc carries NO orgId (membership is the auth claim,
        //    v11-05-02); rules cannot field-scope. The leader musician-picker is
        //    server-side (admin SDK) + in-memory claim filter.
        //  - setlistTemplates: band_leader/admin only; an MCP/admin-SDK authoring
        //    surface with NO client read/write path (server reads bypass rules).
        // Residual recommendation (v11-06-03 AUDIT.md): add orgReadOk to
        // setlistTemplates for defense-in-depth once/if a client read path lands.

        it("CHARACTERIZE: users is application-only scoped (band_leader rule read is cross-tenant by the picker design)", async () => {
            // Documents the current rules behavior — a leader CAN read any user
            // doc (no orgId field to scope). Isolation is enforced app-side.
            await assertSucceeds(
                blLeader().collection("users").doc("crc-musician").get(),
            )
        })

        it("CHARACTERIZE: setlistTemplates is application-only scoped (no client read path; rules gate on role, not org)", async () => {
            await assertSucceeds(
                blLeader().collection("setlistTemplates").doc("tpl-crc").get(),
            )
        })
    })
})
