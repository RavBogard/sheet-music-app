/**
 * Multi-tenant phase 2 — migrate people to memberships (design §6.2, ruling 5).
 *
 *   --seed [--apply]          platform/owners {uids:[Daniel]} and
 *                             platform/membershipMigration {overrides:{David:{brotherslazaroff:'admin'}}}
 *                             (only if absent; manifest records the prior state)
 *   --plan                    read-only: per-account table + globals written to
 *                             <MANIFEST_DIR>/membership-plan-<ts>.json
 *   --apply                   manifest FIRST, then per unmigrated account: create
 *                             memberships (addedBy 'migration'), rebuild claims
 *                             (legacy role/orgIds/soundEngineer kept, derived),
 *                             stamp users/{uid}.membershipsMigratedAt. Idempotent.
 *                             No refresh-token revocation.
 *   --undo <manifest> [--apply]  delete exactly the listed memberships (only if
 *                             still addedBy 'migration' with the planned role),
 *                             restore claims verbatim, restore the users doc
 *                             fields, delete membershipsMigratedAt. A seed
 *                             manifest restores the platform docs.
 *
 *   npx vite-node -c vitest.config.ts scripts/ops/multitenant/migrate-memberships.ts -- --plan
 *
 * Without --apply every mode is a dry run. Credentials: GOOGLE_APPLICATION_CREDENTIALS
 * (temp ADC) or FIRESTORE_EMULATOR_HOST (+ FIREBASE_AUTH_EMULATOR_HOST).
 * MANIFEST_DIR overrides where manifests go.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth"
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { planLegacyMemberships, type MembershipOverrides, type PlannedMembership } from "@/lib/org/legacy-membership-map"
import { buildClaims, rebuildClaims, restoreClaimsVerbatim } from "@/lib/org/claims"
import { membershipId, type Membership } from "@/lib/org/membership-types"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
export const DANIEL_UID = "93Xn3DbS0bSNb8zmfzLyfOMX1A13"
export const DAVID_UID = "HTks9a8YRiVCQ5lVipUJcBsWjnB3"
export const SEED_OWNERS = { uids: [DANIEL_UID] }
export const SEED_OVERRIDES: MembershipOverrides = { [DAVID_UID]: { brotherslazaroff: "admin" } }
const DOC_FIELDS = ["role", "orgIds", "soundEngineer", "canUpload", "claimsUpdatedAt", "membershipsMigratedAt"] as const

// ── value (de)serialisation (Timestamps survive the manifest) ──
function ser(v: unknown): unknown {
    if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] }
    if (Array.isArray(v)) return v.map(ser)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]))
    return v
}
function deser(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(deser)
    if (v && typeof v === "object") {
        const o = v as Record<string, unknown>
        if (Array.isArray(o.__ts) && Object.keys(o).length === 1) return new Timestamp(o.__ts[0] as number, o.__ts[1] as number)
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, deser(x)]))
    }
    return v
}

async function listAllUsers(auth: Auth): Promise<UserRecord[]> {
    const out: UserRecord[] = []
    let token: string | undefined
    do {
        const page = await auth.listUsers(1000, token)
        out.push(...page.users)
        token = page.pageToken
    } while (token)
    return out
}

async function readPlatform(db: Firestore): Promise<{ owners: string[]; overrides: MembershipOverrides; ownersExists: boolean; overridesExists: boolean }> {
    const [o, m] = await Promise.all([db.doc("platform/owners").get(), db.doc("platform/membershipMigration").get()])
    const uids = o.exists ? o.get("uids") : null
    const ov = m.exists ? m.get("overrides") : null
    return {
        owners: Array.isArray(uids) ? uids : [],
        overrides: ov && typeof ov === "object" ? ov : {},
        ownersExists: o.exists,
        overridesExists: m.exists,
    }
}

// ── seed ──
export async function seed(db: Firestore, apply: boolean, manifestDir: string): Promise<{ path: string | null; wrote: string[] }> {
    const paths = ["platform/owners", "platform/membershipMigration"]
    const before = await Promise.all(paths.map(async (p) => {
        const s = await db.doc(p).get()
        return { path: p, exists: s.exists, data: s.exists ? ser(s.data()) : null }
    }))
    const wrote = before.filter((b) => !b.exists).map((b) => b.path)
    if (!apply || wrote.length === 0) return { path: null, wrote }
    mkdirSync(manifestDir, { recursive: true })
    const at = new Date().toISOString()
    const path = join(manifestDir, `membership-seed-${at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify({ kind: "membership-seed", at, projectId: PROJECT_ID, before }, null, 2) + "\n")
    if (wrote.includes("platform/owners")) await db.doc("platform/owners").set({ ...SEED_OWNERS, seededAt: FieldValue.serverTimestamp() })
    if (wrote.includes("platform/membershipMigration"))
        await db.doc("platform/membershipMigration").set({ overrides: SEED_OVERRIDES, seededAt: FieldValue.serverTimestamp() })
    return { path, wrote }
}

// ── plan ──
export interface PlanRow {
    uid: string
    email: string | null
    test: boolean
    disabled: boolean | null
    usersDoc: boolean
    authUser: boolean
    claimRole: unknown
    claimOrgIds: unknown
    claimSoundEngineer: unknown
    docRole: unknown
    docOrgIds: unknown
    docCanUpload: unknown
    alreadyMigrated: boolean
    planned: PlannedMembership[]
    plannedText: string
    po: boolean
    plannedClaims: Record<string, unknown> | null
    plannedClaimsBytes: number | null
    flags: string[]
}

export async function planAll(db: Firestore, auth: Auth): Promise<{ rows: PlanRow[]; globals: Record<string, unknown> }> {
    const [authUsers, usersSnap, platform] = await Promise.all([listAllUsers(auth), db.collection("users").get(), readPlatform(db)])
    const byUid = new Map<string, UserRecord>(authUsers.map((u) => [u.uid, u]))
    const docs = new Map<string, Record<string, unknown>>(usersSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]))
    const uids = [...new Set([...byUid.keys(), ...docs.keys()])].sort()
    const rows: PlanRow[] = []
    for (const uid of uids) {
        const u = byUid.get(uid)
        const doc = docs.get(uid) ?? null
        const claims = (u?.customClaims ?? {}) as Record<string, unknown>
        const p = planLegacyMemberships({ uid, claims, doc, overrides: platform.overrides, owners: platform.owners, includePending: true })
        const flags = [...p.flags]
        if (u && !doc) flags.push("auth_without_doc")
        if (doc && !u) flags.push("doc_without_auth")
        let plannedClaims: Record<string, unknown> | null = null
        let bytes: number | null = null
        if (u) {
            const mems: Membership[] = p.memberships.map((m) => ({ uid, tenantId: m.orgId, role: m.role, soundEngineer: m.soundEngineer, addedBy: "migration", addedAt: new Date(0) }))
            try {
                plannedClaims = buildClaims(claims, mems, p.po)
                bytes = JSON.stringify(plannedClaims).length
            } catch (e) {
                flags.push(`claims_error:${(e as Error).message}`)
            }
        }
        rows.push({
            uid,
            email: u?.email ?? (typeof doc?.email === "string" ? doc.email : null),
            test: uid.startsWith("test-") || doc?.isTestUser === true,
            disabled: u ? u.disabled : null,
            usersDoc: !!doc,
            authUser: !!u,
            claimRole: claims.role ?? null,
            claimOrgIds: claims.orgIds ?? null,
            claimSoundEngineer: claims.soundEngineer ?? null,
            docRole: doc?.role ?? null,
            docOrgIds: doc?.orgIds ?? null,
            docCanUpload: doc?.canUpload ?? null,
            alreadyMigrated: !!doc?.membershipsMigratedAt,
            planned: p.memberships,
            plannedText: p.memberships.map((m) => `${m.orgId}:${m.role}${m.soundEngineer ? ":se" : ""}`).join(" "),
            po: p.po,
            plannedClaims,
            plannedClaimsBytes: bytes,
            flags,
        })
    }

    const adminsDoc = await db.doc("config/admins").get()
    const monitor = await db.doc("config/monitor").get()
    const busAssignments = monitor.exists ? monitor.get("busAssignments") ?? null : null
    const templates = await db.collection("templates").get()
    const defaults = await db.doc("config/defaults").get()
    const defaultsOut: Record<string, unknown> = {}
    if (defaults.exists) {
        for (const [k, v] of Object.entries(defaults.data() ?? {})) {
            if (typeof v !== "string" || k === "updatedBy") continue
            const s = await db.collection("setlists").doc(v).get()
            defaultsOut[k] = { setlistId: v, orgId: s.exists ? s.get("orgId") ?? null : "(missing setlist)" }
        }
    }
    const audit = await db.collection("auditLogs").get()
    const [memCount, platCount] = await Promise.all([db.collection("memberships").count().get(), db.collection("platform").count().get()])
    const globals = {
        claimAdmins: rows.filter((r) => r.claimRole === "admin").map((r) => ({ uid: r.uid, email: r.email, claimOrgIds: r.claimOrgIds })),
        configAdminsUids: adminsDoc.exists ? adminsDoc.get("uids") ?? null : "(absent)",
        superAdminUidEnv: process.env.SUPER_ADMIN_UID ?? "(not set in this shell — read it from Vercel production)",
        superAdminUidMatchesDaniel: process.env.SUPER_ADMIN_UID ? process.env.SUPER_ADMIN_UID === DANIEL_UID : null,
        busAssignments,
        templatesWithoutOrgId: templates.docs.filter((d) => !d.get("orgId")).map((d) => d.id),
        configDefaults: defaults.exists ? defaultsOut : "(absent)",
        auditLogs: { count: audit.size, withOrgId: audit.docs.filter((d) => !!d.get("orgId")).length },
        membershipsCount: memCount.data().count,
        platformCount: platCount.data().count,
        platform: { ownersSeeded: platform.ownersExists, overridesSeeded: platform.overridesExists, owners: platform.owners, overrides: platform.overrides },
    }
    return { rows, globals }
}

// ── apply ──
interface ManifestUser {
    uid: string
    email: string | null
    before: { claims: Record<string, unknown> | null; docExists: boolean; doc: Record<string, { present: boolean; value?: unknown }> }
    after: { membershipIds: string[]; memberships: PlannedMembership[]; claims: Record<string, unknown> | null }
}
export interface MigrationManifest {
    kind: "migrate-memberships"
    at: string
    projectId: string
    users: ManifestUser[]
}

export async function applyAll(db: Firestore, auth: Auth, manifestDir: string): Promise<{ path: string; migrated: string[]; skipped: string[] }> {
    const platform = await readPlatform(db)
    if (!platform.ownersExists || !platform.overridesExists) throw new Error("platform/owners and platform/membershipMigration must be seeded first (--seed --apply)")
    const { rows } = await planAll(db, auth)
    const todo = rows.filter((r) => r.authUser && !r.alreadyMigrated)
    const skipped = rows.filter((r) => !todo.includes(r)).map((r) => r.uid)

    const users: ManifestUser[] = []
    for (const r of todo) {
        const u = await auth.getUser(r.uid)
        const docSnap = await db.collection("users").doc(r.uid).get()
        const docData = docSnap.exists ? (docSnap.data() as Record<string, unknown>) : {}
        const doc: ManifestUser["before"]["doc"] = {}
        for (const f of DOC_FIELDS) doc[f] = f in docData ? { present: true, value: ser(docData[f]) } : { present: false }
        users.push({
            uid: r.uid,
            email: r.email,
            before: { claims: (u.customClaims as Record<string, unknown> | undefined) ?? null, docExists: docSnap.exists, doc },
            after: { membershipIds: r.planned.map((m) => membershipId(m.orgId, r.uid)), memberships: r.planned, claims: r.plannedClaims },
        })
    }
    mkdirSync(manifestDir, { recursive: true })
    const at = new Date().toISOString()
    const path = join(manifestDir, `migrate-memberships-${at.replace(/[:.]/g, "-")}.json`)
    const manifest: MigrationManifest = { kind: "migrate-memberships", at, projectId: PROJECT_ID, users }
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")

    const migrated: string[] = []
    for (const mu of users) {
        const userRef = db.collection("users").doc(mu.uid)
        const did = await db.runTransaction(async (txn) => {
            const fresh = await txn.get(userRef)
            if (fresh.exists && fresh.get("membershipsMigratedAt")) return false
            const refs = mu.after.memberships.map((m) => db.collection("memberships").doc(membershipId(m.orgId, mu.uid)))
            const snaps = refs.length ? await txn.getAll(...refs) : []
            mu.after.memberships.forEach((m, i) => {
                if (snaps[i].exists) return
                txn.create(refs[i], { uid: mu.uid, tenantId: m.orgId, role: m.role, soundEngineer: m.soundEngineer, addedBy: "migration", addedAt: FieldValue.serverTimestamp() })
            })
            return true
        })
        if (!did) continue
        const { claims } = await rebuildClaims(mu.uid, { db, auth })
        await userRef.set({ membershipsMigratedAt: FieldValue.serverTimestamp() }, { merge: true })
        mu.after.claims = claims
        migrated.push(mu.uid)
    }
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
    return { path, migrated, skipped }
}

// ── undo ──
export async function undoManifest(db: Firestore, auth: Auth, manifestPath: string, apply: boolean): Promise<{ restored: string[]; deleted: string[]; keptChanged: string[] }> {
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as MigrationManifest | { kind: "membership-seed"; before: Array<{ path: string; exists: boolean; data: unknown }> }
    if (m.kind === "membership-seed") {
        for (const b of m.before) {
            if (!apply) continue
            if (b.exists) await db.doc(b.path).set(deser(b.data) as Record<string, unknown>)
            else await db.doc(b.path).delete()
        }
        return { restored: m.before.map((b) => b.path), deleted: [], keptChanged: [] }
    }
    const restored: string[] = []
    const deleted: string[] = []
    const keptChanged: string[] = []
    for (const mu of m.users) {
        for (const pm of mu.after.memberships) {
            const id = membershipId(pm.orgId, mu.uid)
            const s = await db.collection("memberships").doc(id).get()
            if (!s.exists) continue
            if (s.get("addedBy") === "migration" && s.get("role") === pm.role) {
                if (apply) await s.ref.delete()
                deleted.push(id)
            } else keptChanged.push(id)
        }
        if (apply) {
            await restoreClaimsVerbatim(mu.uid, mu.before.claims, { db, auth })
            const ref = db.collection("users").doc(mu.uid)
            if (!mu.before.docExists) await ref.delete()
            else {
                const patch: Record<string, unknown> = {}
                for (const f of DOC_FIELDS) {
                    const st = mu.before.doc[f]
                    patch[f] = st?.present ? deser(st.value) : FieldValue.delete()
                }
                await ref.set(patch, { merge: true })
            }
        }
        restored.push(mu.uid)
    }
    return { restored, deleted, keptChanged }
}

/** Verification for the return: every account migrated; every non-denied membership in `m`. */
export async function verifyAll(db: Firestore, auth: Auth): Promise<{ ok: boolean; problems: string[] }> {
    const problems: string[] = []
    for (const u of await listAllUsers(auth)) {
        const doc = await db.collection("users").doc(u.uid).get()
        if (!doc.get("membershipsMigratedAt")) problems.push(`${u.uid}: not migrated`)
        const mems = (await db.collection("memberships").where("uid", "==", u.uid).get()).docs.map((d) => d.data() as Membership)
        const m = ((u.customClaims ?? {}) as Record<string, unknown>).m as Record<string, string> | undefined
        for (const mm of mems) if (mm.role !== "denied" && !m?.[mm.tenantId]) problems.push(`${u.uid}: ${mm.tenantId} missing from m`)
    }
    return { ok: problems.length === 0, problems }
}

function table(rows: PlanRow[]): string {
    const head = "| uid | email | test? | disabled | users doc? | claim role | claim orgIds | claim SE | doc role | doc orgIds | doc canUpload | planned | po | bytes | flags |"
    const sep = "|" + "---|".repeat(15)
    const j = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.join(",") : String(v))
    return [head, sep, ...rows.map((r) =>
        `| ${r.uid} | ${j(r.email)} | ${r.test ? "yes" : ""} | ${j(r.disabled)} | ${r.usersDoc ? "yes" : "no"} | ${j(r.claimRole)} | ${j(r.claimOrgIds)} | ${j(r.claimSoundEngineer)} | ${j(r.docRole)} | ${j(r.docOrgIds)} | ${j(r.docCanUpload)} | ${r.plannedText || "—"}${r.alreadyMigrated ? " (migrated)" : ""} | ${r.po ? "po" : ""} | ${j(r.plannedClaimsBytes)} | ${r.flags.join(" ")} |`)].join("\n")
}

async function main() {
    const args = process.argv.slice(2).filter((a) => a !== "--")
    const APPLY = args.includes("--apply")
    const UNDO = args.includes("--undo") ? args[args.indexOf("--undo") + 1] : null
    const MANIFEST_DIR = process.env.MANIFEST_DIR || join(process.cwd(), "docs/planning/2026-10-12-multitenant/manifests")
    if (!getApps().length)
        initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID })
    const db = getFirestore()
    const auth = getAuth()

    if (args.includes("--seed")) {
        const r = await seed(db, APPLY, MANIFEST_DIR)
        console.log(r.wrote.length ? `${APPLY ? "seeded" : "would seed"}: ${r.wrote.join(", ")}` : "platform docs already present — nothing to seed")
        if (r.path) console.log(`manifest: ${r.path}`)
        if (!APPLY && r.wrote.length) console.log("dry run — pass --apply to write")
        return
    }
    if (UNDO) {
        const r = await undoManifest(db, auth, UNDO, APPLY)
        console.log(`${APPLY ? "undone" : "would undo"}: ${r.restored.length} accounts/docs restored, ${r.deleted.length} memberships deleted, ${r.keptChanged.length} kept (changed since: ${r.keptChanged.join(", ") || "none"})`)
        if (!APPLY) console.log("dry run — pass --apply to undo")
        return
    }
    if (args.includes("--verify")) {
        const r = await verifyAll(db, auth)
        console.log(r.ok ? "verify: OK" : `verify: ${r.problems.length} problem(s)\n${r.problems.join("\n")}`)
        return
    }
    if (APPLY) {
        const r = await applyAll(db, auth, MANIFEST_DIR)
        console.log(`manifest: ${r.path}\nmigrated ${r.migrated.length}, skipped ${r.skipped.length} (already migrated or no Auth account)`)
        return
    }
    // --plan (default)
    const { rows, globals } = await planAll(db, auth)
    mkdirSync(MANIFEST_DIR, { recursive: true })
    const at = new Date().toISOString()
    const path = join(MANIFEST_DIR, `membership-plan-${at.replace(/[:.]/g, "-")}.json`)
    writeFileSync(path, JSON.stringify({ kind: "membership-plan", at, projectId: PROJECT_ID, rows, globals }, null, 2) + "\n")
    console.log(table(rows))
    console.log(JSON.stringify(globals, null, 2))
    console.log(`plan: ${path}\n(read-only — pass --apply to migrate; --seed first if platform docs are absent)`)
}

if (!process.env.VITEST) {
    main().catch((e) => {
        console.error(e)
        process.exit(1)
    })
}
