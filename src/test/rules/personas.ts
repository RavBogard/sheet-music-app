import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
    initializeTestEnvironment,
    type RulesTestContext,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"

/**
 * Multi-tenant phase 2 — emulator persona suite (design §7).
 *
 * One env factory, one persona table (claims exactly as §7.3), one fixture set
 * (§7.3 "Fixtures"). Tenant A = crc, tenant B = brotherslazaroff, plus a third
 * tenant C that nobody in the persona table belongs to (used to prove that a
 * legacy two-tenant admin does not reach beyond its orgIds).
 *
 * Hosts and ports come from the env vars `firebase emulators:exec` sets
 * (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST), never a
 * hard-coded 8080, so several worktrees can run emulators side by side.
 */

export const A = "crc"
export const B = "brotherslazaroff"
export const C = "nava-tehila"

export type Persona =
    | "po"
    | "aAdmin"
    | "aBL"
    | "aMu"
    | "aMe"
    | "aPe"
    | "aMuSE"
    | "bBL"
    | "bSE"
    | "dual"
    | "oldBL"
    | "oldAdminBoth"
    | "oldPending"
    | "signedOut"

export const CLAIMS: Record<Exclude<Persona, "signedOut">, Record<string, unknown>> = {
    po: { po: true, m: { [A]: "ad" } },
    aAdmin: { m: { [A]: "ad" } },
    aBL: { m: { [A]: "bl" } },
    aMu: { m: { [A]: "mu" } },
    aMe: { m: { [A]: "me" } },
    aPe: { m: { [A]: "pe" } },
    aMuSE: { m: { [A]: "mu" }, se: [A] },
    bBL: { m: { [B]: "bl" } },
    bSE: { m: { [B]: "mu" }, se: [B] },
    dual: { m: { [A]: "bl", [B]: "ad" } },
    oldBL: { role: "band_leader" },
    oldAdminBoth: { role: "admin", orgIds: [A, B], soundEngineer: true },
    oldPending: {},
}

const ROLE_NAME: Record<string, string> = {
    ad: "admin",
    bl: "band_leader",
    mu: "musician",
    me: "member",
    pe: "pending",
}

function hostPort(envVar: string, fallback: string): { host: string; port: number } {
    const raw = process.env[envVar] ?? fallback
    const i = raw.lastIndexOf(":")
    return { host: raw.slice(0, i), port: Number.parseInt(raw.slice(i + 1), 10) }
}

export function rulesText(file: "firestore.rules" | "storage.rules" | string): string {
    return readFileSync(resolve(process.cwd(), file), "utf8")
}

export async function makeEnv(
    projectId: string,
    opts: { storage?: boolean; firestoreRules?: string } = {},
): Promise<RulesTestEnvironment> {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
        throw new Error("FIRESTORE_EMULATOR_HOST unset — run under `firebase emulators:exec`")
    }
    const fs = hostPort("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    const config: Parameters<typeof initializeTestEnvironment>[0] = {
        projectId,
        firestore: { rules: opts.firestoreRules ?? rulesText("firestore.rules"), host: fs.host, port: fs.port },
    }
    if (opts.storage) {
        if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
            throw new Error("FIREBASE_STORAGE_EMULATOR_HOST unset — start the storage emulator (--only firestore,auth,storage)")
        }
        const st = hostPort("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199")
        config.storage = { rules: rulesText("storage.rules"), host: st.host, port: st.port }
    }
    return initializeTestEnvironment(config)
}

export function ctx(env: RulesTestEnvironment, p: Persona): RulesTestContext {
    return p === "signedOut" ? env.unauthenticatedContext() : env.authenticatedContext(p, CLAIMS[p])
}

export type Db = ReturnType<RulesTestContext["firestore"]>
export const dbOf = (env: RulesTestEnvironment, p: Persona): Db => ctx(env, p).firestore()

/** Membership docs implied by each persona's `m` claim (§3.1 shape). */
export function membershipDocs(): Array<{ id: string; data: Record<string, unknown> }> {
    const out: Array<{ id: string; data: Record<string, unknown> }> = []
    for (const [uid, claims] of Object.entries(CLAIMS)) {
        const m = claims.m as Record<string, string> | undefined
        if (!m) continue
        const se = (claims.se as string[] | undefined) ?? []
        for (const [tenantId, code] of Object.entries(m)) {
            out.push({
                id: `${tenantId}__${uid}`,
                data: {
                    uid,
                    tenantId,
                    role: ROLE_NAME[code],
                    soundEngineer: se.includes(tenantId),
                    addedBy: "migration",
                    addedAt: new Date(0),
                },
            })
        }
    }
    return out
}

const DAY = "2026-10-16"

/**
 * Seed every §7.3 fixture with rules disabled. Ids are deterministic so tests
 * can name them: `sA`/`sB` setlists, `tA`/`tB` stamped tracks, `tAu`/`tBu`
 * unstamped tracks, `<coll>A` / `<coll>B` per tenant elsewhere.
 */
export async function seedFixtures(env: RulesTestEnvironment): Promise<void> {
    await env.withSecurityRulesDisabled(async (c) => {
        const db = c.firestore()
        const batch = db.batch()
        const set = (path: string, data: Record<string, unknown>) => batch.set(db.doc(path), data)

        for (const [t, s] of [
            [A, "A"],
            [B, "B"],
        ] as const) {
            const owner = t === A ? "aMe" : "bBL"
            set(`setlists/s${s}`, { name: `Service ${s}`, ownerId: owner, orgId: t, date: "2026-10-16", eventDate: new Date("2026-10-16T18:00:00Z") })
            set(`setlists/s${s}/history/h1`, { action: "created", timestamp: 1 })
            set(`setlists/s${s}/emailEvents/e1`, { type: "delivered" })
            set(`setlists/s${s}/performance/overrides`, { rows: {}, eventDay: DAY, rev: 1, updatedAt: 1, updatedBy: "x" })
            set(`setlists/s${s}/performedDeviations/d1`, { rowId: "r1", kind: "swap", at: 1, by: "x", eventDay: DAY, rev: 1 })
            set(`tracks/t${s}`, { setlistId: `s${s}`, title: "Oseh Shalom", order: 0, type: "song", orgId: t })
            set(`tracks/t${s}u`, { setlistId: `s${s}`, title: "Unstamped", order: 1, type: "song" })
            set(`songs/song${s}`, { title: `Song ${s}`, orgId: t })
            set(`recordings/rec${s}`, { songId: `song${s}`, title: "Ref", orgId: t, createdAt: 1 })
            set(`contacts/c${s}`, { name: "Guest", orgId: t })
            set(`setlistTemplates/st${s}`, { name: "Tpl", orgId: t })
            set(`scheduling_assignments/asg${s}`, {
                musicianUid: t === A ? "aMu" : "bSE",
                setlistId: `s${s}`,
                status: "pending",
                assignedAt: 1,
                orgId: t,
            })
            set(`scheduling_history/hist${s}`, { setlistId: `s${s}`, orgId: t })
            set(`musician_availability/av${s}`, { musicianUid: t === A ? "aMu" : "bSE", orgId: t })
            set(`live_sessions/ls${s}`, { broadcasterId: t === A ? "aBL" : "bBL", orgId: t })
            set(`tasks/task${s}`, { assigneeId: t === A ? "aMu" : "bSE", status: "todo", createdAt: 1, orgId: t })
            set(`bond_flags/bf${s}`, { setlistId: `s${s}`, orgId: t })
            set(`proposal_stages/ps${s}`, { setlistId: `s${s}`, orgId: t })
            set(`standing_choices/sc${s}`, { scope: "gig", slotKey: "song:x", fileId: "f", orgId: t })
            set(`service_drafts/sd${s}`, { profileKey: "gig", rows: [], orgId: t })
            set(`songUsage/u${s}`, { count: 1, orgId: t })
            set(`songUsage/u${s}/events/e1`, { at: 1 })
            set(`auditLogs/al${s}`, { action: "set-role", orgId: t, timestamp: 1 })
        }
        // Templates: bare key = crc, prefixed key = that tenant.
        set("templates/shabbat_morning", { orgId: A, rows: [] })
        set(`templates/${B}__shabbat_morning`, { orgId: B, rows: [] })
        // A third tenant nobody belongs to.
        set("setlists/sC", { name: "Service C", ownerId: "c-owner", orgId: C })
        set("songs/songC", { title: "Song C", orgId: C })
        // A stamped track pointing at a setlist that does not exist: a rule
        // that evaluated setlistOrgOf() on it would fail (get() of a missing doc).
        set("tracks/tGhost", { setlistId: "ghost-setlist", title: "Ghost", order: 0, type: "song", orgId: A })

        for (const mdoc of membershipDocs()) set(`memberships/${mdoc.id}`, mdoc.data)
        set("platform/owners", { uids: ["po"] })
        set("orgs/crc", { id: A, name: "CRC" })
        set("config/congregation", { name: "CRC" })
        set(`config/congregation__${B}`, { name: "BL" })
        set("config/defaults", { shabbat_morning: "sA" })
        set(`config/defaults__${B}`, { shabbat_morning: "sB" })
        set("config/monitor", { busAssignments: { aMu: [2] } })
        set("config/admins", { uids: ["aAdmin"] })
        set("monitor-live/state", { buses: [] })
        set("monitor-live/commands/acks/ackMu", { uid: "aMu", status: "applied" })
        set("monitor-live/commands/acks/ackMuSE", { uid: "aMuSE", status: "applied" })
        set("mcpTokens/t1", { uid: "aAdmin" })
        set("mcpOAuthCodes/c1", { uid: "aAdmin" })
        set("aiConfig/enrichment", { autoApplyEnabled: false })
        set("dedupeRuns/r1", { at: 1 })
        set("backups/2026-10-12", { status: "ok" })
        set("library_signals/latest", { at: 1 })
        set("system/globalAlert", { message: "" })
        for (const uid of Object.keys(CLAIMS)) {
            set(`users/${uid}`, { uid, email: `${uid}@example.com`, displayName: uid, createdAt: 1 })
        }
        await batch.commit()
    })
}

export const busCmd = (uid: string) => ({ type: "set_bus_master", busIndex: 2, value: 0.5, uid, createdAt: Date.now() })
export const matrixCmd = (uid: string) => ({ type: "set_matrix_fader", matrixIndex: 1, value: 0, uid, createdAt: Date.now() })
export const pendingCmds = (db: Db) => db.collection("monitor-live").doc("commands").collection("pending")
export const EVENT_DAY = DAY
