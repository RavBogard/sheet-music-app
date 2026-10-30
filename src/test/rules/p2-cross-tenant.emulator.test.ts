import { assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, busCmd, dbOf, EVENT_DAY, makeEnv, matrixCmd, pendingCmds, seedFixtures, type Db, type Persona } from "./personas"

/**
 * Multi-tenant phase 2 — design §7.4: every case here MUST be refused.
 *
 * Fixtures are seeded once; a refused operation mutates nothing, so the cases
 * are independent. Each case names the persona and the attack.
 */

type Case = [label: string, persona: Persona, op: (db: Db) => Promise<unknown>]

const get = (path: string) => (db: Db) => db.doc(path).get()
const listOrg = (coll: string, org: string) => (db: Db) => db.collection(coll).where("orgId", "==", org).get()

// Tenant-owned collections a member of A must not read in B (get + orgId list).
const B_READS: Array<[string, string]> = [
    ["songs", "songB"],
    ["recordings", "recB"],
    ["contacts", "cB"],
    ["templates", `${B}__shabbat_morning`],
    ["setlistTemplates", "stB"],
    ["scheduling_assignments", "asgB"],
    ["scheduling_history", "histB"],
    ["musician_availability", "avB"],
    ["live_sessions", "lsB"],
    ["bond_flags", "bfB"],
    ["proposal_stages", "psB"],
    ["standing_choices", "scB"],
    ["service_drafts", "sdB"],
    ["songUsage", "uB"],
    ["tasks", "taskB"],
    ["auditLogs", "alB"],
]

// Unfiltered queries: a list rule must never be provable without an orgId
// constraint. (Found on the emulator: a list rule that defaulted a missing
// orgId to crc let a crc member list every tenant's rows unfiltered.)
const unfiltered = (coll: string) => (db: Db) => db.collection(coll).get()
const UNFILTERED: Array<[Persona, string]> = [
    ...B_READS.map(([coll]): [Persona, string] => ["aMe", coll]),
    ...B_READS.map(([coll]): [Persona, string] => ["aBL", coll]),
    ["aMu", "scheduling_assignments"],
    ["aMu", "musician_availability"],
    ["aMu", "tasks"],
    ["oldBL", "songs"],
    ["oldBL", "contacts"],
    ["oldAdminBoth", "auditLogs"],
    ["dual", "contacts"],
    ["aBL", "memberships"],
]

const aMeCases: Case[] = [
    ...B_READS.flatMap(([coll, id]): Case[] => [
        [`get ${coll}/${id}`, "aMe", get(`${coll}/${id}`)],
        [`list ${coll} where orgId==B`, "aMe", listOrg(coll, B)],
    ]),
    ...UNFILTERED.map(([p, coll]): Case => [`list ${coll} unfiltered`, p, unfiltered(coll)]),
    ["get songUsage/uB/events/e1", "aMe", get("songUsage/uB/events/e1")],
    ["get setlists/sB/history/h1", "aMe", get("setlists/sB/history/h1")],
    ["get setlists/sB/performedDeviations/d1", "aMe", get("setlists/sB/performedDeviations/d1")],
    ["get setlists/sB/emailEvents/e1", "aMe", get("setlists/sB/emailEvents/e1")],
    ["get mcpTokens/t1", "aMe", get("mcpTokens/t1")],
    ["get mcpOAuthCodes/c1", "aMe", get("mcpOAuthCodes/c1")],
    ["get platform/owners", "aMe", get("platform/owners")],
    ["get B's membership (bBL)", "aMe", get(`memberships/${B}__bBL`)],
    ["list memberships where tenantId==B", "aMe", (db) => db.collection("memberships").where("tenantId", "==", B).get()],
    ["list memberships unfiltered", "aMe", (db) => db.collection("memberships").get()],
    // A member is also not a band leader in its own tenant for leader-only data.
    ["list memberships where tenantId==A (member, not bl)", "aMe", (db) => db.collection("memberships").where("tenantId", "==", A).get()],
]

const newSetlist = (orgId?: string) => ({ name: "X", ownerId: "aBL", ...(orgId ? { orgId } : {}) })
const overrides = (by: string) => ({ rows: {}, eventDay: EVENT_DAY, rev: 2, updatedAt: 2, updatedBy: by })

const aBLCases: Case[] = [
    ["create setlist stamped B", "aBL", (db) => db.doc("setlists/xB").set(newSetlist(B))],
    ["create unstamped setlist", "aBL", (db) => db.doc("setlists/xU").set(newSetlist())],
    ["update A setlist orgId -> B", "aBL", (db) => db.doc("setlists/sA").update({ orgId: B })],
    ["update B setlist", "aBL", (db) => db.doc("setlists/sB").update({ name: "pwned" })],
    ["delete B setlist", "aBL", (db) => db.doc("setlists/sB").delete()],
    ["update B stamped track", "aBL", (db) => db.doc("tracks/tB").update({ key: "F" })],
    ["delete B stamped track", "aBL", (db) => db.doc("tracks/tB").delete()],
    ["update B unstamped track", "aBL", (db) => db.doc("tracks/tBu").update({ key: "F" })],
    ["delete B unstamped track", "aBL", (db) => db.doc("tracks/tBu").delete()],
    ["restamp B unstamped track as A", "aBL", (db) => db.doc("tracks/tBu").update({ orgId: A })],
    ["update B song", "aBL", (db) => db.doc("songs/songB").update({ title: "pwned" })],
    ["delete B song", "aBL", (db) => db.doc("songs/songB").delete()],
    ["update B template", "aBL", (db) => db.doc(`templates/${B}__shabbat_morning`).set({ orgId: B, rows: [1] })],
    ["delete B template", "aBL", (db) => db.doc(`templates/${B}__shabbat_morning`).delete()],
    ["create B-prefixed template stamped A", "aBL", (db) => db.doc(`templates/${B}__new`).set({ orgId: A })],
    ["update B contact", "aBL", (db) => db.doc("contacts/cB").update({ name: "pwned" })],
    ["delete B contact", "aBL", (db) => db.doc("contacts/cB").delete()],
    ["update B setlistTemplate", "aBL", (db) => db.doc("setlistTemplates/stB").update({ name: "pwned" })],
    ["delete B setlistTemplate", "aBL", (db) => db.doc("setlistTemplates/stB").delete()],
    ["create track orgId:A on a B setlist", "aBL", (db) => db.doc("tracks/xT1").set({ setlistId: "sB", title: "T", order: 9, type: "song", orgId: A })],
    ["create unstamped track on a B setlist", "aBL", (db) => db.doc("tracks/xT2").set({ setlistId: "sB", title: "T", order: 9, type: "song" })],
    ["move an A track to a B setlist", "aBL", (db) => db.doc("tracks/tA").update({ setlistId: "sB" })],
    ["move an A unstamped track to a B setlist", "aBL", (db) => db.doc("tracks/tAu").update({ setlistId: "sB" })],
    ["write overrides on a B setlist", "aBL", (db) => db.doc("setlists/sB/performance/overrides").set(overrides("aBL"))],
    [
        "write a deviation on a B setlist",
        "aBL",
        (db) => {
            const b = db.batch()
            b.set(db.doc("setlists/sB/performance/overrides"), overrides("aBL"))
            b.set(db.doc("setlists/sB/performedDeviations/d2"), { rowId: "r1", kind: "swap", at: 2, by: "aBL", eventDay: EVENT_DAY, rev: 2 })
            return b.commit()
        },
    ],
    ["write config/defaults__brotherslazaroff", "aBL", (db) => db.doc(`config/defaults__${B}`).set({ shabbat_morning: "sA" })],
    ["write config/defaults (bl is not admin)", "aBL", (db) => db.doc("config/defaults").set({ shabbat_morning: "sA" })],
    ["bBL enqueues a CRC mixer command", "bBL", (db) => pendingCmds(db).doc("x1").set(busCmd("bBL"))],
    ["bSE enqueues a CRC mixer command", "bSE", (db) => pendingCmds(db).doc("x2").set(busCmd("bSE"))],
    ["bSE enqueues a CRC matrix command", "bSE", (db) => pendingCmds(db).doc("x3").set(matrixCmd("bSE"))],
    ["bSE writes config/monitor", "bSE", (db) => db.doc("config/monitor").set({ busAssignments: {} })],
    ["bSE reads config/monitor", "bSE", get("config/monitor")],
    ["bBL reads monitor-live/state", "bBL", get("monitor-live/state")],
]

const membership = (tenantId: string, uid: string) => ({ uid, tenantId, role: "admin", soundEngineer: false })
const aAdminCases: Case[] = [
    ["create an A membership", "aAdmin", (db) => db.doc(`memberships/${A}__newbie`).set(membership(A, "newbie"))],
    ["create a B membership", "aAdmin", (db) => db.doc(`memberships/${B}__newbie`).set(membership(B, "newbie"))],
    ["update an A membership", "aAdmin", (db) => db.doc(`memberships/${A}__aMe`).update({ role: "admin" })],
    ["update a B membership", "aAdmin", (db) => db.doc(`memberships/${B}__bBL`).update({ role: "member" })],
    ["delete an A membership", "aAdmin", (db) => db.doc(`memberships/${A}__aMe`).delete()],
    ["delete a B membership", "aAdmin", (db) => db.doc(`memberships/${B}__bBL`).delete()],
    ["write platform/owners", "aAdmin", (db) => db.doc("platform/owners").set({ uids: ["aAdmin"] })],
    ["write orgs/crc", "aAdmin", (db) => db.doc("orgs/crc").set({ name: "pwned" })],
    ["write config/congregation__brotherslazaroff", "aAdmin", (db) => db.doc(`config/congregation__${B}`).set({ name: "pwned" })],
    ["write config/defaults__brotherslazaroff", "aAdmin", (db) => db.doc(`config/defaults__${B}`).set({ x: 1 })],
    ["get B auditLog", "aAdmin", get("auditLogs/alB")],
    ["list auditLogs where orgId==B", "aAdmin", listOrg("auditLogs", B)],
    ["list auditLogs unfiltered", "aAdmin", (db) => db.collection("auditLogs").get()],
    ["write system/globalAlert", "aAdmin", (db) => db.doc("system/globalAlert").set({ message: "hi" })],
    ["read aiConfig", "aAdmin", get("aiConfig/enrichment")],
    ["read dedupeRuns", "aAdmin", get("dedupeRuns/r1")],
    ["read backups", "aAdmin", get("backups/2026-10-12")],
    ["read config/admins (retired)", "aAdmin", get("config/admins")],
    ["read B setlist history", "aAdmin", get("setlists/sB/history/h1")],
    ["swap on a B setlist", "aAdmin", (db) => db.doc("setlists/sB/performance/overrides").set(overrides("aAdmin"))],
    ["update B song", "aAdmin", (db) => db.doc("songs/songB").update({ title: "pwned" })],
    ["read B song", "aAdmin", get("songs/songB")],
]

// Anyone, including a tenant admin: identity is server-written only.
const SELF_FORBIDDEN: Array<Record<string, unknown>> = [
    { role: "admin" },
    { orgIds: [A, B] },
    { m: { [A]: "ad" } },
    { po: true },
    { soundEngineer: true },
    { membershipsMigratedAt: 1 },
]
const anyoneCases: Case[] = (["aAdmin", "aMe", "aPe", "bBL"] as const).flatMap((p): Case[] => [
    ...SELF_FORBIDDEN.map((patch): Case => [`writes ${Object.keys(patch)[0]} into own user doc`, p, (db) => db.doc(`users/${p}`).update(patch)]),
    [`creates own A membership`, p, (db) => db.doc(`memberships/${A}__${p}`).set(membership(A, p))],
    [`creates own B membership`, p, (db) => db.doc(`memberships/${B}__${p}`).set(membership(B, p))],
    ["lists users", p, (db) => db.collection("users").get()],
    ["gets another user's doc", p, get("users/aMu")],
    ["creates a notification for another user", p, (db) => db.doc("users/aMu/notifications/n1").set({ title: "hi", read: false })],
])

const dualCases: Case[] = [
    ["(B admin) reads A setlist history", "dual", get("setlists/sA/history/h1")],
    ["(B admin) writes config/defaults (A)", "dual", (db) => db.doc("config/defaults").set({ shabbat_morning: "sB" })],
    ["(B admin) reads an A auditLog", "dual", get("auditLogs/alA")],
    ["(B admin) lists auditLogs where orgId==A", "dual", listOrg("auditLogs", A)],
    ["(B admin) changes an A setlist's ownerId", "dual", (db) => db.doc("setlists/sA").update({ ownerId: "dual" })],
    ["(B admin) writes config/congregation (A)", "dual", (db) => db.doc("config/congregation").set({ name: "pwned" })],
]

const legacyCases: Case[] = [
    ["oldAdminBoth reads platform/owners", "oldAdminBoth", get("platform/owners")],
    ["oldAdminBoth reads aiConfig", "oldAdminBoth", get("aiConfig/enrichment")],
    ["oldAdminBoth reads dedupeRuns", "oldAdminBoth", get("dedupeRuns/r1")],
    ["oldAdminBoth lists users", "oldAdminBoth", (db) => db.collection("users").get()],
    ["oldAdminBoth writes system/globalAlert", "oldAdminBoth", (db) => db.doc("system/globalAlert").set({ message: "x" })],
    ["oldAdminBoth reads a tenant-C song", "oldAdminBoth", get("songs/songC")],
    ["oldAdminBoth updates a tenant-C setlist", "oldAdminBoth", (db) => db.doc("setlists/sC").update({ name: "pwned" })],
    ["oldAdminBoth creates a setlist stamped C", "oldAdminBoth", (db) => db.doc("setlists/xC").set({ name: "x", ownerId: "oldAdminBoth", orgId: C })],
    ["oldBL reads a B song", "oldBL", get("songs/songB")],
    ["oldBL updates a B setlist", "oldBL", (db) => db.doc("setlists/sB").update({ name: "pwned" })],
    ["oldBL creates a track on a B setlist", "oldBL", (db) => db.doc("tracks/xOld").set({ setlistId: "sB", title: "T", order: 9, type: "song", orgId: B })],
    ["oldBL reads a B contact", "oldBL", get("contacts/cB")],
    ["oldPending reads an A song", "oldPending", get("songs/songA")],
    ["oldPending creates an A setlist", "oldPending", (db) => db.doc("setlists/xP").set({ name: "x", ownerId: "oldPending", orgId: A })],
]

const signedOutCases: Case[] = [
    ["lists setlists", "signedOut", (db) => db.collection("setlists").get()],
    ["lists setlists where orgId==A", "signedOut", listOrg("setlists", A)],
    ["lists tracks by setlistId", "signedOut", (db) => db.collection("tracks").where("setlistId", "==", "sA").get()],
    ["lists songs", "signedOut", (db) => db.collection("songs").get()],
    ["lists templates", "signedOut", (db) => db.collection("templates").get()],
    ["gets a template", "signedOut", get("templates/shabbat_morning")],
    ["gets a song", "signedOut", get("songs/songA")],
    ["gets a membership", "signedOut", get(`memberships/${A}__aMe`)],
    ["gets config/congregation", "signedOut", get("config/congregation")],
    ["gets overrides", "signedOut", get("setlists/sA/performance/overrides")],
    ["creates a setlist", "signedOut", (db) => db.doc("setlists/xS").set({ name: "x", ownerId: "anon", orgId: A })],
]

const aPeCases: Case[] = [
    ["creates an A setlist", "aPe", (db) => db.doc("setlists/xPe").set({ name: "x", ownerId: "aPe", orgId: A })],
    ["reads an A song", "aPe", get("songs/songA")],
    ["lists A songs", "aPe", listOrg("songs", A)],
    ["enqueues a mixer command", "aPe", (db) => pendingCmds(db).doc("xPe").set(busCmd("aPe"))],
    ["reads config/defaults", "aPe", get("config/defaults")],
]

const GROUPS: Array<[string, Case[]]> = [
    ["aMe (A member) against B and server-only data; unfiltered lists by anyone not po", aMeCases],
    ["aBL (A band leader) against B, and B people against the CRC mixer", aBLCases],
    ["aAdmin (A admin) — tenant admin is not a bypass", aAdminCases],
    ["anyone — identity fields and other users", anyoneCases],
    ["dual (A band leader, B admin)", dualCases],
    ["transition personas (legacy claims only)", legacyCases],
    ["signed out", signedOutCases],
    ["aPe (A pending)", aPeCases],
]

describe("P2 §7.4 — cross-tenant and privilege attacks are refused", () => {
    let env: RulesTestEnvironment

    beforeAll(async () => {
        env = await makeEnv("demo-p2-cross-tenant")
        await env.clearFirestore()
        await seedFixtures(env)
    })

    afterAll(async () => {
        await env.cleanup()
    })

    for (const [group, cases] of GROUPS) {
        describe(group, () => {
            for (const [label, persona, op] of cases) {
                it(`${persona}: ${label}`, async () => {
                    await assertFails(op(dbOf(env, persona)))
                })
            }
        })
    }
})
