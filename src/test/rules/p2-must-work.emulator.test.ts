import { assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { A, B, busCmd, dbOf, EVENT_DAY, makeEnv, matrixCmd, pendingCmds, seedFixtures, type Db, type Persona } from "./personas"

/**
 * Multi-tenant phase 2 — design §7.5: CRC and BL parity. Every read the app
 * runs today, in the query shape it runs after lane 4's §1.2 fixes, must pass
 * for the roles that run it; every write the browser makes must pass for the
 * roles that make it.
 *
 * Query shapes modelled (file:line from design §1.1):
 *   S6/S7/S11  setlists  orgId==, orderBy date desc, limit
 *   S8/S9/S10  setlists  orgId==, eventDate >= / range, orderBy eventDate
 *   T1/T2/T3   tracks    setlistId==  (any tenant's setlist — Perform links)
 *   G1         songs     orgId==
 *   R1         recordings orgId==, songId==, orderBy createdAt desc
 *   SA1        scheduling_assignments musicianUid==me, status in, orderBy assignedAt desc
 *   SA3        scheduling_assignments orgId==, status in, orderBy assignedAt desc (≥bl)
 *   TK1        tasks     assigneeId==me, status==, orderBy createdAt desc, limit 5
 *   TM1/TM2    templates get by key (existing and missing); orgId==
 *   AL1        auditLogs orgId==, orderBy timestamp desc, limit 20 (admin)
 *   M1         memberships/{org}__{me} get (existing and missing)
 *   C1/C2      config/congregation[__t], config/defaults[__t]
 *   LS1/GA1/P1 library_signals/latest, system/globalAlert, overrides
 */

type Op = (db: Db) => Promise<unknown>

function readsFor(p: Persona, own: string): Array<[string, Op]> {
    const otherSetlist = own === A ? "sB" : "sA"
    const ownSetlist = own === A ? "sA" : "sB"
    const cfg = (base: string) => (own === A ? `config/${base}` : `config/${base}__${own}`)
    const tplKey = own === A ? "shabbat_morning" : `${own}__shabbat_morning`
    const missingTpl = own === A ? "friday_night" : `${own}__friday_night`
    return [
        ["list setlists (signed-in)", (db) => db.collection("setlists").get()],
        ["S6 setlists orgId==own orderBy date desc limit 50", (db) => db.collection("setlists").where("orgId", "==", own).orderBy("date", "desc").limit(50).get()],
        [
            "S8 setlists orgId==own eventDate>=now orderBy eventDate limit 1",
            (db) => db.collection("setlists").where("orgId", "==", own).where("eventDate", ">=", new Date("2026-01-01")).orderBy("eventDate").limit(1).get(),
        ],
        [
            "S9 setlists orgId==own eventDate range",
            (db) =>
                db.collection("setlists").where("orgId", "==", own).where("eventDate", ">=", new Date("2026-01-01")).where("eventDate", "<", new Date("2027-01-01")).orderBy("eventDate").limit(5).get(),
        ],
        ["get own setlist", (db) => db.doc(`setlists/${ownSetlist}`).get()],
        ["T1 tracks setlistId==own setlist", (db) => db.collection("tracks").where("setlistId", "==", ownSetlist).get()],
        ["T2 tracks setlistId==other tenant's setlist (Perform link)", (db) => db.collection("tracks").where("setlistId", "==", otherSetlist).get()],
        ["G1 songs orgId==own", (db) => db.collection("songs").where("orgId", "==", own).get()],
        ["R1 recordings orgId==own songId== orderBy createdAt desc", (db) => db.collection("recordings").where("orgId", "==", own).where("songId", "==", own === A ? "songA" : "songB").orderBy("createdAt", "desc").get()],
        ["SA1 own assignments", (db) => db.collection("scheduling_assignments").where("musicianUid", "==", p).where("status", "in", ["pending", "confirmed"]).orderBy("assignedAt", "desc").get()],
        ["TK1 tasks by assignee", (db) => db.collection("tasks").where("assigneeId", "==", p).where("status", "==", "todo").orderBy("createdAt", "desc").limit(5).get()],
        ["TM2 templates orgId==own", (db) => db.collection("templates").where("orgId", "==", own).get()],
        ["TM1 get template by key (existing)", (db) => db.doc(`templates/${tplKey}`).get()],
        ["TM1 get template by key (missing)", (db) => db.doc(`templates/${missingTpl}`).get()],
        ["C1 config/congregation[__own]", (db) => db.doc(cfg("congregation")).get()],
        ["C1 config/congregation (bare, any signed-in)", (db) => db.doc("config/congregation").get()],
        ["C2 config/defaults[__own]", (db) => db.doc(cfg("defaults")).get()],
        ["M1 own membership (existing)", (db) => db.doc(`memberships/${own}__${p}`).get()],
        ["M1 own membership in the other tenant (missing)", (db) => db.doc(`memberships/${own === A ? B : A}__${p}`).get()],
        ["list own memberships (uid==me)", (db) => db.collection("memberships").where("uid", "==", p).get()],
        ["LS1 library_signals/latest", (db) => db.doc("library_signals/latest").get()],
        ["GA1 system/globalAlert", (db) => db.doc("system/globalAlert").get()],
        ["P1 overrides get", (db) => db.doc(`setlists/${ownSetlist}/performance/overrides`).get()],
        ["U1 own users doc", (db) => db.doc(`users/${p}`).get()],
        ["UN1 own notifications", (db) => db.collection("users").doc(p).collection("notifications").where("read", "==", false).get()],
    ]
}

function leaderReadsFor(own: string): Array<[string, Op]> {
    return [
        ["SA3 assignments orgId==own status in orderBy assignedAt desc", (db) => db.collection("scheduling_assignments").where("orgId", "==", own).where("status", "in", ["pending", "confirmed"]).orderBy("assignedAt", "desc").get()],
        ["memberships tenantId==own (≥bl)", (db) => db.collection("memberships").where("tenantId", "==", own).get()],
        ["contacts orgId==own", (db) => db.collection("contacts").where("orgId", "==", own).get()],
        ["setlistTemplates orgId==own", (db) => db.collection("setlistTemplates").where("orgId", "==", own).get()],
        ["S11 setlists orgId==own orderBy date desc limit 10", (db) => db.collection("setlists").where("orgId", "==", own).orderBy("date", "desc").limit(10).get()],
        ["emailEvents on own setlist", (db) => db.doc(`setlists/${own === A ? "sA" : "sB"}/emailEvents/e1`).get()],
        ["performedDeviations on own setlist", (db) => db.collection(`setlists/${own === A ? "sA" : "sB"}/performedDeviations`).get()],
    ]
}

const MATRIX: Array<[Persona, string, boolean]> = [
    ["aMe", A, false],
    ["aMu", A, false],
    ["aBL", A, true],
    ["aAdmin", A, true],
    ["bBL", B, true],
    ["po", A, true],
    ["po", B, true],
    ["dual", A, true],
    ["dual", B, true],
]

describe("P2 §7.5 — CRC and BL parity (must still work)", () => {
    let env: RulesTestEnvironment
    const db = (p: Persona) => dbOf(env, p)

    beforeAll(async () => {
        env = await makeEnv("demo-p2-must-work")
        await env.clearFirestore()
        await seedFixtures(env)
    })

    afterAll(async () => {
        await env.cleanup()
    })

    describe("signed out", () => {
        for (const path of ["setlists/sA", "setlists/sB", "tracks/tA", "tracks/tB", "tracks/tAu", "orgs/crc"]) {
            it(`gets ${path}`, async () => {
                const snap = await assertSucceeds(db("signedOut").doc(path).get())
                expect(snap.exists).toBe(true)
            })
        }
    })

    for (const [p, own, leader] of MATRIX) {
        describe(`${p} in ${own}`, () => {
            for (const [label, op] of readsFor(p, own)) {
                it(label, async () => {
                    await assertSucceeds(op(db(p)))
                })
            }
            if (leader) {
                for (const [label, op] of leaderReadsFor(own)) {
                    it(label, async () => {
                        await assertSucceeds(op(db(p)))
                    })
                }
            }
        })
    }

    it("own-tenant queries return own-tenant rows only (aMe, bBL)", async () => {
        const a = await db("aMe").collection("songs").where("orgId", "==", A).get()
        expect(a.docs.map((d) => d.id)).toEqual(["songA"])
        const b = await db("bBL").collection("setlists").where("orgId", "==", B).orderBy("date", "desc").get()
        expect(b.docs.map((d) => d.id)).toEqual(["sB"])
        const mine = await db("aMu").collection("scheduling_assignments").where("musicianUid", "==", "aMu").get()
        expect(mine.docs.map((d) => d.id)).toEqual(["asgA"])
    })

    it("aMu reads its own assignment, availability and task by id", async () => {
        await assertSucceeds(db("aMu").doc("scheduling_assignments/asgA").get())
        await assertSucceeds(db("aMu").doc("musician_availability/avA").get())
        await assertSucceeds(db("aMu").doc("tasks/taskA").get())
    })

    it("bSE reads its own B assignment by query (cross-tenant musician reads its own rows)", async () => {
        await assertSucceeds(db("bSE").collection("scheduling_assignments").where("musicianUid", "==", "bSE").get())
    })

    describe("aMe — own setlist lifecycle, no track writes", () => {
        it("creates, updates and deletes its own setlist (orgId:A, ownerId self)", async () => {
            const d = db("aMe")
            await assertSucceeds(d.doc("setlists/me1").set({ name: "Mine", ownerId: "aMe", orgId: A }))
            await assertSucceeds(d.doc("setlists/me1").update({ name: "Mine 2" }))
            await assertSucceeds(d.doc("setlists/me1/history/h1").set({ action: "renamed", timestamp: 2 }))
            await assertSucceeds(d.doc("setlists/me1").delete())
        })
        it("cannot touch tracks (parity: members never could)", async () => {
            const { assertFails } = await import("@firebase/rules-unit-testing")
            await assertFails(db("aMe").doc("tracks/meT").set({ setlistId: "sA", title: "T", order: 9, type: "song", orgId: A }))
            await assertFails(db("aMe").doc("tracks/tA").update({ key: "D" }))
        })
        it("creates own musician_availability stamped A", async () => {
            await assertSucceeds(db("aMe").doc("musician_availability/meAv").set({ musicianUid: "aMe", orgId: A, startDate: 1 }))
        })
    })

    describe("aBL — tracks, songs, overrides", () => {
        it("creates/updates/deletes a stamped track", async () => {
            const d = db("aBL")
            await assertSucceeds(d.doc("tracks/blT1").set({ setlistId: "sA", title: "T", order: 5, type: "song", orgId: A }))
            await assertSucceeds(d.doc("tracks/blT1").update({ key: "G" }))
            await assertSucceeds(d.doc("tracks/blT1").delete())
        })
        it("creates an unstamped track on an A setlist (pre-P2 cached bundle, §10 Q1)", async () => {
            await assertSucceeds(db("aBL").doc("tracks/blT2").set({ setlistId: "sA", title: "T", order: 6, type: "song" }))
        })
        it("updates an unstamped A track, and restamps it as A", async () => {
            const d = db("aBL")
            await assertSucceeds(d.doc("tracks/tAu").update({ key: "E" }))
            await assertSucceeds(d.doc("tracks/tAu").update({ orgId: A }))
        })
        it("moves an A track to another A setlist", async () => {
            const d = db("aBL")
            await assertSucceeds(d.doc("setlists/blS").set({ name: "BL own", ownerId: "aBL", orgId: A }))
            await assertSucceeds(d.doc("tracks/tA").update({ setlistId: "blS" }))
            await assertSucceeds(d.doc("tracks/tA").update({ setlistId: "sA" }))
        })
        it("stamped track update performs no get() of the parent (lazy trackOrg)", async () => {
            // tGhost's setlistId names a missing doc; evaluating setlistOrgOf on
            // it would deny. Success proves the stamped branch never ran it.
            await assertSucceeds(db("aBL").doc("tracks/tGhost").update({ key: "C" }))
        })
        it("updates any A setlist and an A song", async () => {
            await assertSucceeds(db("aBL").doc("setlists/sA").update({ name: "Renamed by leader" }))
            await assertSucceeds(db("aBL").doc("songs/songA").update({ defaults: { key: "D" } }))
        })
        it("creates a song and a recording stamped A", async () => {
            await assertSucceeds(db("aBL").doc("songs/blSong").set({ title: "New", orgId: A }))
            await assertSucceeds(db("aBL").doc("recordings/blRec").set({ songId: "blSong", title: "R", orgId: A, createdAt: 2 }))
        })
        it("saves a custom template (saveCustomTemplate, bare key = crc)", async () => {
            await assertSucceeds(db("aBL").doc("templates/friday_night").set({ orgId: A, rows: [] }))
        })
        it("overrides create + rev+1 update + deviation in the same commit", async () => {
            const d = db("aBL")
            await assertSucceeds(d.doc("setlists/blS2").set({ name: "Tonight", ownerId: "aBL", orgId: A }))
            await assertSucceeds(d.doc("setlists/blS2/performance/overrides").set({ rows: {}, eventDay: EVENT_DAY, rev: 1, updatedAt: 1, updatedBy: "aBL" }))
            const b = d.batch()
            b.set(d.doc("setlists/blS2/performance/overrides"), { rows: { r1: { fileId: "B" } }, eventDay: EVENT_DAY, rev: 2, updatedAt: 2, updatedBy: "aBL" })
            b.set(d.doc("setlists/blS2/performedDeviations/dv1"), { rowId: "r1", kind: "swap", at: 2, by: "aBL", eventDay: EVENT_DAY, rev: 2 })
            await assertSucceeds(b.commit())
        })
        it("live session broadcast (musician+) stamped A", async () => {
            await assertSucceeds(db("aBL").doc("live_sessions/sA_aBL").set({ broadcasterId: "aBL", orgId: A }))
        })
    })

    describe("aAdmin", () => {
        it("writes config/defaults", async () => {
            await assertSucceeds(db("aAdmin").doc("config/defaults").set({ shabbat_morning: "sA" }))
        })
        it("writes config/congregation", async () => {
            await assertSucceeds(db("aAdmin").doc("config/congregation").set({ name: "CRC" }))
        })
        it("AL1 lists auditLogs where orgId==A orderBy timestamp desc limit 20", async () => {
            const snap = await assertSucceeds(db("aAdmin").collection("auditLogs").where("orgId", "==", A).orderBy("timestamp", "desc").limit(20).get())
            expect(snap.docs.map((d) => d.id)).toEqual(["alA"])
        })
        it("reads A setlist history (H1)", async () => {
            await assertSucceeds(db("aAdmin").collection("setlists/sA/history").orderBy("timestamp", "desc").limit(50).get())
        })
        it("changes an A setlist's ownerId", async () => {
            const d = db("aAdmin")
            await assertSucceeds(d.doc("setlists/adm1").set({ name: "x", ownerId: "aAdmin", orgId: A }))
            await assertSucceeds(d.doc("setlists/adm1").update({ ownerId: "aBL" }))
        })
    })

    describe("bBL / dual in B", () => {
        it("bBL updates its own tenant's setlist and creates a B track", async () => {
            await assertSucceeds(db("bBL").doc("setlists/sB").update({ name: "BL renamed" }))
            await assertSucceeds(db("bBL").doc("tracks/bT1").set({ setlistId: "sB", title: "T", order: 3, type: "song", orgId: B }))
            await assertSucceeds(db("bBL").doc("tracks/tBu").update({ key: "A" }))
        })
        it("dual (B admin) writes config/defaults__brotherslazaroff and reads B history", async () => {
            await assertSucceeds(db("dual").doc(`config/defaults__${B}`).set({ shabbat_morning: "sB" }))
            await assertSucceeds(db("dual").doc("setlists/sB/history/h1").get())
            await assertSucceeds(db("dual").collection("auditLogs").where("orgId", "==", B).orderBy("timestamp", "desc").limit(20).get())
        })
        it("dual (A band leader) edits A tracks", async () => {
            await assertSucceeds(db("dual").doc("tracks/tA").update({ key: "Bb" }))
        })
    })

    describe("mixer (bridge tenant crc)", () => {
        it("aMu reads config/monitor and monitor-live/state, enqueues a bus command, reads own ack", async () => {
            const d = db("aMu")
            await assertSucceeds(d.doc("config/monitor").get())
            await assertSucceeds(d.doc("monitor-live/state").get())
            await assertSucceeds(pendingCmds(d).doc("mu1").set(busCmd("aMu")))
            await assertSucceeds(d.doc("monitor-live/commands/acks/ackMu").get())
        })
        it("aMuSE: matrix command and config/monitor write", async () => {
            const d = db("aMuSE")
            await assertSucceeds(pendingCmds(d).doc("se1").set(matrixCmd("aMuSE")))
            await assertSucceeds(d.doc("config/monitor").set({ busAssignments: { aMu: [2] } }))
            await assertSucceeds(d.doc("monitor-live/commands/acks/ackMuSE").get())
        })
        it("aAdmin: matrix command", async () => {
            await assertSucceeds(pendingCmds(db("aAdmin")).doc("ad1").set(matrixCmd("aAdmin")))
        })
        it("aMe reads config/monitor (mixer hooks mount for every member)", async () => {
            await assertSucceeds(db("aMe").doc("config/monitor").get())
            await assertSucceeds(db("aMe").doc("monitor-live/state").get())
        })
    })

    describe("po", () => {
        it("reads aiConfig, dedupeRuns, backups, platform-only ops", async () => {
            await assertSucceeds(db("po").doc("aiConfig/enrichment").get())
            await assertSucceeds(db("po").doc("dedupeRuns/r1").get())
            await assertSucceeds(db("po").doc("backups/2026-10-12").get())
        })
        it("lists users and reads another user's doc", async () => {
            await assertSucceeds(db("po").collection("users").get())
            await assertSucceeds(db("po").doc("users/aMu").get())
        })
        it("reads and writes across tenants (B song, B setlist, B history, B auditLogs, B defaults)", async () => {
            const d = db("po")
            await assertSucceeds(d.doc("songs/songB").get())
            await assertSucceeds(d.doc("songs/songB").update({ title: "po edit" }))
            await assertSucceeds(d.doc("setlists/sB").update({ ownerId: "po" }))
            await assertSucceeds(d.doc("setlists/sB/history/h1").get())
            await assertSucceeds(d.collection("auditLogs").get())
            await assertSucceeds(d.doc(`config/defaults__${B}`).set({ shabbat_morning: "sB" }))
            await assertSucceeds(d.doc(`memberships/${B}__bBL`).get())
            await assertSucceeds(d.doc("system/globalAlert").set({ message: "maintenance" }))
        })
        it("swaps on a B setlist", async () => {
            const d = db("po")
            await assertSucceeds(d.doc("setlists/sB/performance/overrides").set({ rows: {}, eventDay: EVENT_DAY, rev: 2, updatedAt: 2, updatedBy: "po" }))
        })
    })
})
