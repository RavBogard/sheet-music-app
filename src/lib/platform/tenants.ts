import "server-only"
import { createHash, randomBytes } from "node:crypto"
import type { Auth } from "firebase-admin/auth"
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"
import { revalidateTag } from "next/cache"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import type { OrgId } from "@/lib/org/types"
import { FEATURE_KEYS, OrgIdSchema, parseOrgConfig, type OrgConfig, type OrgConfigInput } from "@/lib/org/config-schema"
import type { TenantRole } from "@/lib/org/membership-types"
import { roleRank } from "@/lib/org/membership-types"
import { CODE_ORG_IDS, codeOrgConfig } from "@/lib/org/config-code"
import { clearOrgConfigMemory, orgConfigTag } from "@/lib/org/get-org-config"
import { canonicalHostFor } from "@/lib/org/host-resolution"
import { getTenantMembership, isPlatformOwner, listTenantMembers } from "@/lib/org/access"
import { setMembership } from "@/lib/org/memberships-write"
import { KNOWN_COLLECTIONS } from "@/lib/library/collections"
import { createViewAsToken, hashToken } from "@/lib/mcp/tokens"
import { revalidateHostList } from "@/lib/platform/host-list"
import { defaultAddressCandidates, provisionDefaultAddress, type ProvisionResult } from "@/lib/platform/tenant-address"
import { changedTopKeys, deepMerge, diffValues, pick } from "@/lib/platform/diff"
import { buildNewTenantConfig, type NewTenantConfigInput } from "@/lib/platform/new-tenant-config"
import { logger } from "@/lib/logger"

/**
 * Multi-tenant phase 4: the platform owner's operations on tenants. ONE library
 * behind both the /platform console (API routes) and the platform MCP surface
 * (/api/platform/mcp), so they cannot disagree. Every write takes an Actor,
 * defaults to a dry run, returns before/after/diff, and records a platformAudit
 * row when applied. Address operations live in ./tenant-address.ts (phase 3);
 * the dry-run and audit wrappers for them are in ./tenant-domains.ts.
 *
 * Callers check that the caller is the platform owner (the routes and the
 * platform MCP surface do); this library does not re-check except where it
 * mints a credential.
 */

export interface Actor {
    uid: string
    email?: string | null
    /** Where the action came from. */
    via: "console" | "claude"
}

export interface WriteOpts {
    actor: Actor
    /** Default true: compute and return, write nothing. */
    dryRun?: boolean
}

export interface WriteResult<T> {
    dryRun: boolean
    changed: boolean
    before: T | null
    after: T | null
    /** Dotted paths that differ, with old and new values. */
    diff: Array<{ path: string; before: unknown; after: unknown }>
    /** Set when applied: the platformAudit row id. */
    auditId?: string
    /** Added in phase 4: plain-language cautions (e.g. last admin removed). */
    warnings?: string[]
}

export interface TenantSummary {
    orgId: OrgId
    name: string
    status: OrgConfig["status"]
    addresses: string[]
    primaryAddress: string | null
    memberCount: number
    pendingCount: number
    featuresOn: Array<keyof OrgConfig["features"]>
}

export interface TenantMember {
    uid: string
    name: string | null
    email: string | null
    role: TenantRole
    soundEngineer: boolean
    lastSeen: string | null
}

export interface TenantDetail {
    summary: TenantSummary
    config: OrgConfig
    domainStatus: Record<string, unknown>
    membersByRole: Partial<Record<TenantRole, number>>
    collections: CollectionRecord[]
}

/** Phase 4 stores the record; phase 5 computes row visibility from it. */
export interface CollectionRecord {
    id: string
    ownerOrgId: OrgId
    name: string
    label: string
    visibility: "private" | "listed" | "all"
    sharedWith: OrgId[]
    /** Set by the platform owner; a tenant admin cannot remove it. */
    assignedTo: OrgId[]
    chartCount?: number
}

export interface CreateTenantInput {
    orgId: OrgId
    /**
     * Fields of the tenant config; the schema fills defaults. Phase 4: only
     * `name` is required — the rest default from the name and the address
     * (a full OrgConfigInput minus id still fits).
     */
    config: NewTenantConfigInput
    /** Default address slug → <slug>.vercel.app (phase 3 provisioning). */
    subdomain: string
    /** Copy liturgy frames (service types, rabbi slots) and books from this tenant. */
    copyLiturgyFrom?: OrgId
}

export interface Invite {
    id: string
    orgId: OrgId
    email: string
    role: Exclude<TenantRole, "pending" | "denied">
    /**
     * Link to send: the tenant's address + /invite/<token>. Only the result of
     * creating the invite carries it; the token is stored hashed, so a listed
     * invite has `link: ""`.
     */
    link: string
    expiresAt: string
    acceptedAt?: string | null
}

export interface PlatformAuditEntry {
    id: string
    at: string
    actorUid: string
    actorEmail: string | null
    via: Actor["via"]
    action: string
    orgId: OrgId | null
    before: unknown
    after: unknown
}

// ── errors ───────────────────────────────────────────────────────────────────

export type PlatformErrorKind = "not_found" | "invalid" | "conflict" | "forbidden" | "expired" | "used"

/** A refusal with a plain-language message; routes map `kind` to an HTTP status. */
export class PlatformError extends Error {
    readonly kind: PlatformErrorKind
    readonly details?: unknown
    constructor(kind: PlatformErrorKind, message: string, details?: unknown) {
        super(message)
        this.name = "PlatformError"
        this.kind = kind
        this.details = details
    }
}

// ── dependencies (test seam) ─────────────────────────────────────────────────

export interface PlatformDeps {
    db?: Firestore
    auth?: Auth
    provisionAddress?: (orgId: OrgId, slug: string) => Promise<ProvisionResult>
    revalidateConfig?: (orgId: OrgId) => void
    revalidateHosts?: () => Promise<void>
    now?: () => number
}

let overrides: PlatformDeps = {}

/** Test seam: replace Firestore/Auth/provisioning; `{}` restores the defaults. */
export function __setPlatformDeps(d: PlatformDeps): void {
    overrides = d
}

function deps() {
    const needAdmin = !overrides.db || !overrides.auth
    if (needAdmin) initAdmin()
    return {
        db: overrides.db ?? getFirestore(),
        auth: overrides.auth ?? getAuth(),
        provisionAddress: overrides.provisionAddress ?? ((orgId: OrgId, slug: string) => provisionDefaultAddress(orgId, slug)),
        revalidateConfig:
            overrides.revalidateConfig ??
            ((orgId: OrgId) => {
                clearOrgConfigMemory()
                try {
                    revalidateTag(orgConfigTag(orgId), { expire: 0 })
                } catch {
                    // outside a request (scripts, tests): the 60 s cache expires on its own
                }
            }),
        revalidateHosts: overrides.revalidateHosts ?? revalidateHostList,
        now: overrides.now ?? Date.now,
    }
}

const iso = (v: unknown): string | null => {
    if (v instanceof Timestamp) return v.toDate().toISOString()
    if (v instanceof Date) return v.toISOString()
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function")
        return (v as { toDate: () => Date }).toDate().toISOString()
    if (typeof v === "string") return v
    return null
}

/** Firestore rejects `undefined`; audit payloads are plain JSON. */
const plain = (v: unknown): unknown => (v === undefined ? null : JSON.parse(JSON.stringify(v)))

function assertOrgId(orgId: unknown): asserts orgId is OrgId {
    if (!OrgIdSchema.safeParse(orgId).success)
        throw new PlatformError("invalid", `"${String(orgId)}" is not a tenant id (lowercase letters, digits and hyphens).`)
}

// ── config reads ─────────────────────────────────────────────────────────────

interface TenantRead {
    exists: boolean
    raw: Record<string, unknown> | null
    config: OrgConfig | null
    source: "doc" | "code" | "none"
}

/** orgs/{id}, validated; crc and brotherslazaroff fall back to the code configs. */
async function readTenant(db: Firestore, orgId: OrgId): Promise<TenantRead> {
    const snap = await db.collection("orgs").doc(orgId).get()
    const raw = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null
    if (raw) {
        const parsed = parseOrgConfig(raw)
        if (parsed.ok) return { exists: true, raw, config: parsed.config, source: "doc" }
        logger.warn(`[platform] orgs/${orgId} failed validation: ${parsed.error}`)
    }
    const code = codeOrgConfig(orgId)
    return { exists: !!raw, raw, config: code, source: code ? "code" : "none" }
}

async function requireTenant(db: Firestore, orgId: OrgId): Promise<TenantRead & { config: OrgConfig }> {
    assertOrgId(orgId)
    const t = await readTenant(db, orgId)
    if (!t.config) throw new PlatformError("not_found", `There is no tenant "${orgId}".`)
    return t as TenantRead & { config: OrgConfig }
}

function featuresOn(config: OrgConfig): Array<keyof OrgConfig["features"]> {
    return FEATURE_KEYS.filter((k) => config.features[k])
}

function addressesOf(config: OrgConfig): string[] {
    return [...new Set([config.domains.primary, ...config.domains.aliases].filter(Boolean))]
}

const APPROVED: ReadonlySet<string> = new Set(["admin", "band_leader", "musician", "member"])

function summarise(config: OrgConfig, roles: Map<string, number>): TenantSummary {
    let memberCount = 0
    for (const [r, n] of roles) if (APPROVED.has(r)) memberCount += n
    return {
        orgId: config.id,
        name: config.name,
        status: config.status,
        addresses: addressesOf(config),
        primaryAddress: config.domains.primary || null,
        memberCount,
        pendingCount: roles.get("pending") ?? 0,
        featuresOn: featuresOn(config),
    }
}

async function roleCounts(db: Firestore, orgId?: OrgId): Promise<Map<OrgId, Map<string, number>>> {
    const q = orgId ? db.collection("memberships").where("tenantId", "==", orgId) : db.collection("memberships")
    const snap = await q.get()
    const out = new Map<OrgId, Map<string, number>>()
    for (const d of snap.docs) {
        const m = d.data() as { tenantId?: unknown; role?: unknown }
        if (typeof m.tenantId !== "string" || typeof m.role !== "string") continue
        const per = out.get(m.tenantId) ?? new Map<string, number>()
        per.set(m.role, (per.get(m.role) ?? 0) + 1)
        out.set(m.tenantId, per)
    }
    return out
}

export async function listTenants(): Promise<TenantSummary[]> {
    const { db } = deps()
    const [orgs, counts] = await Promise.all([db.collection("orgs").get(), roleCounts(db)])
    const configs = new Map<OrgId, OrgConfig>()
    for (const d of orgs.docs) {
        const parsed = parseOrgConfig(d.data())
        const config = parsed.ok ? parsed.config : codeOrgConfig(d.id)
        if (config) configs.set(d.id, config)
        else logger.warn(`[platform] orgs/${d.id} is not a valid tenant config; left out of the list`)
    }
    for (const id of CODE_ORG_IDS) if (!configs.has(id)) configs.set(id, codeOrgConfig(id)!)
    return [...configs.values()]
        .map((c) => summarise(c, counts.get(c.id) ?? new Map()))
        .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getTenant(orgId: OrgId): Promise<TenantDetail | null> {
    const { db } = deps()
    assertOrgId(orgId)
    const t = await readTenant(db, orgId)
    if (!t.config) return null
    const [counts, collections] = await Promise.all([roleCounts(db, orgId), listCollections(orgId)])
    const roles = counts.get(orgId) ?? new Map<string, number>()
    const status = t.raw?.domainStatus
    return {
        summary: summarise(t.config, roles),
        config: t.config,
        domainStatus: status && typeof status === "object" ? (status as Record<string, unknown>) : {},
        membersByRole: Object.fromEntries(roles) as Partial<Record<TenantRole, number>>,
        collections,
    }
}

// ── config writes ────────────────────────────────────────────────────────────

const NEXT_STEPS_NEW_TENANT = [
    "Add an admin with invite_tenant_admin (console: People → Invite admin). Until then you manage it as platform owner.",
    "Turn features on with set_tenant_features (only Perform is on).",
    "Optional: give it a custom domain with add_tenant_domain.",
]

export async function createTenant(
    input: CreateTenantInput,
    opts: WriteOpts,
): Promise<WriteResult<OrgConfig> & { address?: string; nextSteps: string[] }> {
    const { db, provisionAddress, revalidateConfig, revalidateHosts } = deps()
    const dryRun = opts.dryRun !== false
    assertOrgId(input.orgId)
    const orgId = input.orgId
    if (!input.config || typeof input.config.name !== "string" || !input.config.name.trim())
        throw new PlatformError("invalid", "A new tenant needs a name.")
    if (codeOrgConfig(orgId)) throw new PlatformError("conflict", `"${orgId}" is a built-in tenant and already exists.`)
    if ((await db.collection("orgs").doc(orgId).get()).exists)
        throw new PlatformError("conflict", `A tenant with the id "${orgId}" already exists.`)

    const subdomain = (input.subdomain ?? "").trim().toLowerCase()
    let candidates: string[]
    try {
        candidates = defaultAddressCandidates(subdomain)
    } catch (e) {
        throw new PlatformError("invalid", (e as Error).message)
    }

    let liturgyFrom: OrgConfig | null = null
    if (input.copyLiturgyFrom) {
        liturgyFrom = (await requireTenant(db, input.copyLiturgyFrom)).config
    }
    const built = buildNewTenantConfig(orgId, { ...input.config, name: input.config.name.trim() }, subdomain, liturgyFrom)
    if (!built.ok) throw new PlatformError("invalid", `The tenant config is not valid: ${built.error}`)
    const config = built.config
    const diff = diffValues({}, config)

    if (dryRun) {
        return {
            dryRun: true,
            changed: true,
            before: null,
            after: config,
            diff,
            address: candidates[0],
            nextSteps: [
                `Run again with dryRun false to create it. Its address will be ${candidates[0]}, or the nearest free name (${candidates.slice(1, 3).join(", ")}, …).`,
                ...NEXT_STEPS_NEW_TENANT,
            ],
        }
    }

    const ref = db.collection("orgs").doc(orgId)
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (snap.exists) throw new PlatformError("conflict", `A tenant with the id "${orgId}" already exists.`)
        tx.create(ref, { ...config, createdAt: FieldValue.serverTimestamp(), configUpdatedAt: FieldValue.serverTimestamp() })
    })
    revalidateConfig(orgId)

    const nextSteps = [...NEXT_STEPS_NEW_TENANT]
    let address: string | undefined
    let after: OrgConfig = config
    try {
        const prov = await provisionAddress(orgId, subdomain)
        address = prov.host
        const reread = await readTenant(db, orgId)
        if (reread.config) after = reread.config
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.warn(`[platform] create_tenant ${orgId}: address not attached`, { error: msg })
        nextSteps.unshift(
            `The tenant was created but its address was not attached (${msg}). Retry with POST /api/platform/tenants/${orgId}/address {slug: "${subdomain}"}.`,
        )
    }
    await revalidateHosts()
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "create_tenant",
        orgId,
        before: null,
        after: { ...after, copiedLiturgyFrom: input.copyLiturgyFrom ?? null },
    })
    return { dryRun: false, changed: true, before: null, after, diff: diffValues({}, after), auditId, address, nextSteps }
}

/**
 * Shared path for update_tenant / set_tenant_features / set_tenant_status:
 * deep-merge, re-validate, write each changed top-level field whole.
 */
async function applyConfigPatch<T>(
    orgId: OrgId,
    patch: Record<string, unknown>,
    action: string,
    opts: WriteOpts,
    project: (c: OrgConfig) => T,
): Promise<WriteResult<T>> {
    const { db, revalidateConfig, revalidateHosts } = deps()
    const dryRun = opts.dryRun !== false
    const t = await requireTenant(db, orgId)
    if (patch.id !== undefined && patch.id !== orgId) throw new PlatformError("invalid", "A tenant's id never changes.")
    const merged = deepMerge(t.config as unknown as Record<string, unknown>, patch)
    const parsed = parseOrgConfig(merged)
    if (!parsed.ok) throw new PlatformError("invalid", `That change would make the config invalid: ${parsed.error}`)
    const before = t.config
    const after = parsed.config
    const keys = changedTopKeys(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>)
    const diff = diffValues(project(before), project(after))
    const base = { before: project(before), after: project(after), diff }
    if (dryRun) return { dryRun: true, changed: keys.length > 0, ...base }
    if (keys.length === 0) return { dryRun: false, changed: false, ...base }

    const ref = db.collection("orgs").doc(orgId)
    const afterRec = after as unknown as Record<string, unknown>
    if (t.source === "doc") {
        await ref.set({ ...pick(afterRec, keys), configUpdatedAt: FieldValue.serverTimestamp() }, { mergeFields: [...keys, "configUpdatedAt"] })
    } else {
        // crc / brotherslazaroff without a valid document: write the whole config (other fields kept).
        await ref.set({ ...afterRec, configUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    revalidateConfig(orgId)
    if (keys.includes("domains") || keys.includes("status")) await revalidateHosts()
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action,
        orgId,
        before: pick(before as unknown as Record<string, unknown>, keys),
        after: pick(afterRec, keys),
    })
    return { dryRun: false, changed: true, ...base, auditId }
}

export async function updateTenant(orgId: OrgId, patch: Partial<OrgConfigInput>, opts: WriteOpts): Promise<WriteResult<OrgConfig>> {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new PlatformError("invalid", "patch must be an object.")
    return applyConfigPatch(orgId, patch as Record<string, unknown>, "update_tenant", opts, (c) => c)
}

export async function setTenantFeatures(
    orgId: OrgId,
    features: Partial<OrgConfig["features"]>,
    opts: WriteOpts,
): Promise<WriteResult<OrgConfig["features"]>> {
    const unknown = Object.keys(features ?? {}).filter((k) => !(FEATURE_KEYS as readonly string[]).includes(k))
    if (unknown.length) throw new PlatformError("invalid", `Unknown feature(s): ${unknown.join(", ")}. Features are ${FEATURE_KEYS.join(", ")}.`)
    return applyConfigPatch(orgId, { features }, "set_tenant_features", opts, (c) => c.features)
}

export async function setTenantStatus(
    orgId: OrgId,
    status: OrgConfig["status"],
    opts: WriteOpts,
): Promise<WriteResult<OrgConfig["status"]>> {
    if (status !== "active" && status !== "suspended") throw new PlatformError("invalid", 'status is "active" or "suspended".')
    const r = await applyConfigPatch(orgId, { status }, "set_tenant_status", opts, (c) => c.status)
    if (status === "suspended" && r.changed)
        r.warnings = ["A suspended tenant's addresses show “no such site” within about two minutes (CRC and Brothers Lazaroff always stay served)."]
    return r
}

// ── members ──────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)

async function lastSeenOf(auth: Auth, uids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    try {
        for (let i = 0; i < uids.length; i += 100) {
            const res = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })))
            for (const u of res.users) {
                const t = u.metadata.lastRefreshTime || u.metadata.lastSignInTime
                if (t) out.set(u.uid, new Date(t).toISOString())
            }
        }
    } catch (e) {
        logger.warn("[platform] last-seen lookup failed", e)
    }
    return out
}

export async function listTenantMembersForPlatform(orgId: OrgId, opts?: { role?: TenantRole }): Promise<TenantMember[]> {
    const { db, auth } = deps()
    await requireTenant(db, orgId)
    const rows = await listTenantMembers(orgId, { db, roles: opts?.role ? [opts.role] : undefined })
    const seen = await lastSeenOf(auth, rows.map((r) => r.uid))
    return rows
        .map((r) => ({
            uid: r.uid,
            name: str(r.profile?.displayName) ?? str(r.profile?.name),
            email: str(r.profile?.email),
            role: r.role,
            soundEngineer: r.soundEngineer === true,
            lastSeen: seen.get(r.uid) ?? null,
        }))
        .sort((a, b) => roleRank(b.role) - roleRank(a.role) || (a.name ?? a.email ?? a.uid).localeCompare(b.name ?? b.email ?? b.uid))
}

async function resolveUid(auth: Auth, who: { uid?: string; email?: string }): Promise<{ uid: string; email: string | null; name: string | null }> {
    try {
        if (who.uid) {
            const u = await auth.getUser(who.uid)
            return { uid: u.uid, email: u.email ?? null, name: u.displayName ?? null }
        }
        if (who.email) {
            const u = await auth.getUserByEmail(who.email.trim())
            return { uid: u.uid, email: u.email ?? null, name: u.displayName ?? null }
        }
    } catch (e) {
        const code = (e as { code?: string }).code
        if (code === "auth/user-not-found" || code === "auth/invalid-email" || code === "auth/invalid-uid") {
            throw new PlatformError(
                "not_found",
                who.email
                    ? `No account uses ${who.email}. Send an invitation with invite_tenant_admin instead; it works for people who have not signed up yet.`
                    : `No account has the id ${who.uid}.`,
            )
        }
        throw e
    }
    throw new PlatformError("invalid", "Name the person by uid or email.")
}

async function adminCount(db: Firestore, orgId: OrgId): Promise<number> {
    const snap = await db.collection("memberships").where("tenantId", "==", orgId).where("role", "==", "admin").get()
    return snap.size
}

async function memberView(db: Firestore, uid: string, orgId: OrgId, fallback: { email: string | null; name: string | null }): Promise<TenantMember | null> {
    const [m, profileSnap] = await Promise.all([getTenantMembership(uid, orgId, { db }), db.collection("users").doc(uid).get()])
    if (!m) return null
    const p = profileSnap.exists ? ((profileSnap.data() ?? {}) as Record<string, unknown>) : {}
    return {
        uid,
        name: str(p.displayName) ?? str(p.name) ?? fallback.name,
        email: str(p.email) ?? fallback.email,
        role: m.role,
        soundEngineer: m.soundEngineer,
        lastSeen: null,
    }
}

const LAST_ADMIN_WARNING = (name: string) =>
    `This leaves ${name} with no admin. Only you, as platform owner, can manage its people until you add one (invite_tenant_admin).`

export async function setTenantMemberRole(
    orgId: OrgId,
    who: { uid?: string; email?: string },
    role: Exclude<TenantRole, "denied">,
    opts: WriteOpts,
): Promise<WriteResult<TenantMember>> {
    const { db, auth } = deps()
    const dryRun = opts.dryRun !== false
    const t = await requireTenant(db, orgId)
    if (!["admin", "band_leader", "musician", "member", "pending"].includes(role))
        throw new PlatformError("invalid", "role is admin, band_leader, musician, member or pending.")
    const person = await resolveUid(auth, who)
    const before = await memberView(db, person.uid, orgId, person)
    const after: TenantMember = before
        ? { ...before, role }
        : { uid: person.uid, name: person.name, email: person.email, role, soundEngineer: false, lastSeen: null }
    const warnings: string[] = []
    if (before?.role === "admin" && role !== "admin" && (await adminCount(db, orgId)) <= 1) warnings.push(LAST_ADMIN_WARNING(t.config.name))
    const changed = before?.role !== role
    const diff = diffValues(before ?? {}, after)
    const base = { before, after, diff, ...(warnings.length ? { warnings } : {}) }
    if (dryRun) return { dryRun: true, changed, ...base }
    if (!changed) return { dryRun: false, changed: false, ...base }

    await setMembership(
        { orgId, uid: person.uid, role, actorUid: opts.actor.uid, actorEmail: opts.actor.email ?? undefined, reason: "set-role" },
        { db, auth },
    )
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "set_tenant_member_role",
        orgId,
        before,
        after,
    })
    return { dryRun: false, changed: true, ...base, auditId }
}

export async function removeTenantMember(orgId: OrgId, uid: string, opts: WriteOpts): Promise<WriteResult<TenantMember>> {
    const { db, auth } = deps()
    const dryRun = opts.dryRun !== false
    const t = await requireTenant(db, orgId)
    if (typeof uid !== "string" || !uid) throw new PlatformError("invalid", "Name the person by uid.")
    const before = await memberView(db, uid, orgId, { email: null, name: null })
    if (!before) throw new PlatformError("not_found", `That person is not a member of ${t.config.name}.`)
    const warnings: string[] = []
    if (before.role === "admin" && (await adminCount(db, orgId)) <= 1) warnings.push(LAST_ADMIN_WARNING(t.config.name))
    const base = { before, after: null, diff: diffValues(before, {}), ...(warnings.length ? { warnings } : {}) }
    if (dryRun) return { dryRun: true, changed: true, ...base }
    await setMembership({ orgId, uid, role: null, actorUid: opts.actor.uid, actorEmail: opts.actor.email ?? undefined, reason: "remove" }, { db, auth })
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "remove_tenant_member",
        orgId,
        before,
        after: null,
    })
    return { dryRun: false, changed: true, ...base, auditId }
}

// ── invites ──────────────────────────────────────────────────────────────────

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INVITE_ROLES: ReadonlyArray<Invite["role"]> = ["admin", "band_leader", "musician", "member"]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function inviteOrigin(config: OrgConfig): string {
    return `https://${canonicalHostFor(config.domains.primary)}`
}

function toInvite(id: string, d: Record<string, unknown>, link = ""): Invite {
    return {
        id,
        orgId: d.orgId as OrgId,
        email: String(d.email ?? ""),
        role: d.role as Invite["role"],
        link,
        expiresAt: iso(d.expiresAt) ?? "",
        acceptedAt: iso(d.acceptedAt),
    }
}

export async function inviteTenantAdmin(orgId: OrgId, email: string, role: Invite["role"], opts: WriteOpts): Promise<WriteResult<Invite>> {
    const { db, now } = deps()
    const dryRun = opts.dryRun !== false
    const t = await requireTenant(db, orgId)
    const addr = (email ?? "").trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) throw new PlatformError("invalid", `"${email}" is not an email address.`)
    if (!INVITE_ROLES.includes(role)) throw new PlatformError("invalid", "role is admin, band_leader, musician or member.")
    const expiresAt = new Date(now() + INVITE_TTL_MS).toISOString()
    const origin = inviteOrigin(t.config)

    if (dryRun) {
        const after: Invite = { id: "", orgId, email: addr, role, link: `${origin}/invite/… (made when you apply)`, expiresAt, acceptedAt: null }
        return { dryRun: true, changed: true, before: null, after, diff: diffValues({}, after) }
    }

    const token = randomBytes(32).toString("hex")
    const ref = db.collection("invites").doc()
    await ref.set({
        orgId,
        email: addr,
        role,
        tokenHash: hashToken(token),
        createdAt: Timestamp.fromMillis(now()),
        createdBy: opts.actor.uid,
        expiresAt: Timestamp.fromMillis(now() + INVITE_TTL_MS),
        acceptedAt: null,
        acceptedBy: null,
        revokedAt: null,
    })
    const after: Invite = { id: ref.id, orgId, email: addr, role, link: `${origin}/invite/${token}`, expiresAt, acceptedAt: null }
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "invite_tenant_admin",
        orgId,
        before: null,
        after: { ...after, link: "(not recorded)" },
    })
    return { dryRun: false, changed: true, before: null, after, diff: diffValues({}, after), auditId }
}

export async function listInvites(orgId: OrgId): Promise<Invite[]> {
    const { db } = deps()
    assertOrgId(orgId)
    const snap = await db.collection("invites").where("orgId", "==", orgId).get()
    return snap.docs
        .map((d) => ({ inv: toInvite(d.id, d.data() as Record<string, unknown>), created: iso((d.data() as Record<string, unknown>).createdAt) ?? "" }))
        .sort((a, b) => b.created.localeCompare(a.created))
        .map((x) => x.inv)
}

async function findInvite(db: Firestore, token: string) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null
    const snap = await db.collection("invites").where("tokenHash", "==", hashToken(token)).limit(1).get()
    return snap.empty ? null : snap.docs[0]
}

export type InviteStatus = "open" | "accepted" | "expired" | "revoked"

export interface InvitePeek {
    orgId: OrgId
    tenantName: string
    role: Invite["role"]
    email: string
    status: InviteStatus
    expiresAt: string
}

function inviteStatus(d: Record<string, unknown>, nowMs: number): InviteStatus {
    if (d.revokedAt) return "revoked"
    if (d.acceptedAt) return "accepted"
    const exp = d.expiresAt instanceof Timestamp ? d.expiresAt.toMillis() : 0
    return exp <= nowMs ? "expired" : "open"
}

/** Added in phase 4 for the invite page: what the link is for, without accepting it. */
export async function peekInvite(token: string): Promise<InvitePeek | null> {
    const { db, now } = deps()
    const doc = await findInvite(db, token)
    if (!doc) return null
    const d = doc.data() as Record<string, unknown>
    const t = await readTenant(db, d.orgId as OrgId)
    return {
        orgId: d.orgId as OrgId,
        tenantName: t.config?.name ?? String(d.orgId),
        role: d.role as Invite["role"],
        email: String(d.email ?? ""),
        status: inviteStatus(d, now()),
        expiresAt: iso(d.expiresAt) ?? "",
    }
}

/** Called when the invited person signs in at the tenant's address and opens the link. */
export async function acceptInvite(token: string, uid: string, email: string | null): Promise<{ orgId: OrgId; role: Invite["role"] }> {
    const { db, auth, now } = deps()
    const doc = await findInvite(db, token)
    if (!doc) throw new PlatformError("not_found", "This invitation link is not valid. Ask for a new one.")
    const d = doc.data() as Record<string, unknown>
    const orgId = d.orgId as OrgId
    const inviteEmail = String(d.email ?? "").toLowerCase()
    const po = await isPlatformOwner(uid, db)
    if (!po && (email ?? "").trim().toLowerCase() !== inviteEmail)
        throw new PlatformError("forbidden", `This invitation is for ${inviteEmail}. Sign in with that email address to accept it.`)

    await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref)
        const f = (fresh.data() ?? {}) as Record<string, unknown>
        const st = inviteStatus(f, now())
        if (st === "accepted" || st === "revoked") throw new PlatformError("used", "This invitation has already been used.")
        if (st === "expired") throw new PlatformError("expired", "This invitation has expired. Ask for a new one.")
        tx.update(doc.ref, { acceptedAt: Timestamp.fromMillis(now()), acceptedBy: uid })
    })

    const invited = d.role as Invite["role"]
    let finalRole: Invite["role"] = invited
    let previous: string | null = null
    try {
        const current = await getTenantMembership(uid, orgId, { db })
        previous = current?.role ?? null
        // Accepting never lowers a role someone already holds.
        if (current && APPROVED.has(current.role) && roleRank(current.role) > roleRank(invited)) finalRole = current.role as Invite["role"]
        if (previous !== finalRole)
            await setMembership({ orgId, uid, role: finalRole, actorUid: uid, actorEmail: email ?? undefined, reason: "set-role" }, { db, auth })
    } catch (e) {
        await doc.ref.update({ acceptedAt: null, acceptedBy: null }).catch(() => {})
        throw e
    }
    await recordPlatformAudit({
        actorUid: uid,
        actorEmail: email,
        via: "console",
        action: "accept_invite",
        orgId,
        before: { role: previous },
        after: { role: finalRole, inviteId: doc.id },
    })
    return { orgId, role: finalRole }
}

// ── collections ──────────────────────────────────────────────────────────────

const VISIBILITIES = ["private", "listed", "all"] as const

/** Collection doc id: `<owner>__<key>` (opaque; `ownerOrgId` is authoritative). */
export const collectionDocId = (ownerOrgId: OrgId, key: string) => `${ownerOrgId}__${key}`

function toCollection(id: string, d: Record<string, unknown>): CollectionRecord {
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
    const vis = VISIBILITIES.includes(d.visibility as never) ? (d.visibility as CollectionRecord["visibility"]) : "private"
    return {
        id,
        ownerOrgId: String(d.ownerOrgId ?? ""),
        name: String(d.name ?? ""),
        label: String(d.label ?? d.name ?? ""),
        visibility: vis,
        sharedWith: list(d.sharedWith),
        assignedTo: list(d.assignedTo),
        ...(typeof d.chartCount === "number" ? { chartCount: d.chartCount } : {}),
    }
}

/**
 * library_index rows in a collection: orgId == owner and collection == name;
 * a bare, missing or unknown `collection` counts as core (normalizeCollection).
 */
export async function countCollectionCharts(db: Firestore, ownerOrgId: OrgId, name: string): Promise<number> {
    const base = db.collection("library_index").where("orgId", "==", ownerOrgId)
    const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count
    if (name !== "core") return count(base.where("collection", "==", name))
    const others = KNOWN_COLLECTIONS.filter((k) => k !== "core")
    const [total, ...rest] = await Promise.all([count(base), ...others.map((k) => count(base.where("collection", "==", k)))])
    return total - rest.reduce((a, b) => a + b, 0)
}

export async function listCollections(orgId?: OrgId): Promise<CollectionRecord[]> {
    const { db } = deps()
    if (orgId !== undefined) assertOrgId(orgId)
    const snap = await db.collection("collections").get()
    const rows = snap.docs
        .map((d) => toCollection(d.id, d.data() as Record<string, unknown>))
        .filter((c) => !orgId || c.ownerOrgId === orgId || c.sharedWith.includes(orgId) || c.assignedTo.includes(orgId))
    await Promise.all(
        rows.map(async (c) => {
            try {
                c.chartCount = await countCollectionCharts(db, c.ownerOrgId, c.name)
            } catch (e) {
                logger.warn(`[platform] chart count for ${c.id} failed`, e)
            }
        }),
    )
    return rows.sort((a, b) => a.ownerOrgId.localeCompare(b.ownerOrgId) || a.name.localeCompare(b.name))
}

async function requireCollection(db: Firestore, id: string): Promise<CollectionRecord> {
    if (typeof id !== "string" || !id || id.includes("/")) throw new PlatformError("invalid", "Name a collection by its id.")
    const snap = await db.collection("collections").doc(id).get()
    if (!snap.exists) throw new PlatformError("not_found", `There is no collection "${id}". list_collections shows the ids.`)
    return toCollection(id, (snap.data() ?? {}) as Record<string, unknown>)
}

const recordFields = (c: CollectionRecord) => {
    const { chartCount: _c, ...rest } = c
    return rest
}

async function writeCollection(
    id: string,
    action: string,
    opts: WriteOpts,
    change: (c: CollectionRecord) => Promise<CollectionRecord> | CollectionRecord,
): Promise<WriteResult<CollectionRecord>> {
    const { db } = deps()
    const dryRun = opts.dryRun !== false
    const before = await requireCollection(db, id)
    const after = await change(structuredClone(before))
    let chartCount: number | undefined
    try {
        chartCount = await countCollectionCharts(db, before.ownerOrgId, before.name)
    } catch {
        chartCount = undefined
    }
    const withCount = (c: CollectionRecord) => (chartCount === undefined ? c : { ...c, chartCount })
    const diff = diffValues(recordFields(before), recordFields(after))
    const base = { before: withCount(before), after: withCount(after), diff }
    if (dryRun) return { dryRun: true, changed: diff.length > 0, ...base }
    if (diff.length === 0) return { dryRun: false, changed: false, ...base }
    await db.collection("collections").doc(id).update({
        visibility: after.visibility,
        sharedWith: after.sharedWith,
        assignedTo: after.assignedTo,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: opts.actor.uid,
    })
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action,
        orgId: before.ownerOrgId,
        before: recordFields(before),
        after: recordFields(after),
    })
    return { dryRun: false, changed: true, ...base, auditId }
}

async function assertTenantsExist(db: Firestore, ids: OrgId[]): Promise<void> {
    for (const id of ids) {
        assertOrgId(id)
        if (!(await readTenant(db, id)).config) throw new PlatformError("invalid", `There is no tenant "${id}".`)
    }
}

export async function setCollectionSharing(
    collectionId: string,
    sharing: { visibility: CollectionRecord["visibility"]; sharedWith: OrgId[] },
    opts: WriteOpts,
): Promise<WriteResult<CollectionRecord>> {
    const { db } = deps()
    if (!VISIBILITIES.includes(sharing?.visibility as never))
        throw new PlatformError("invalid", 'visibility is "private", "listed" or "all".')
    if (!Array.isArray(sharing.sharedWith)) throw new PlatformError("invalid", "sharedWith is a list of tenant ids.")
    const shared = [...new Set(sharing.sharedWith)]
    await assertTenantsExist(db, shared)
    return writeCollection(collectionId, "set_collection_sharing", opts, (c) => ({
        ...c,
        visibility: sharing.visibility,
        sharedWith: shared.filter((o) => o !== c.ownerOrgId).sort(),
    }))
}

export async function assignCollection(collectionId: string, orgId: OrgId, assigned: boolean, opts: WriteOpts): Promise<WriteResult<CollectionRecord>> {
    const { db } = deps()
    await assertTenantsExist(db, [orgId])
    return writeCollection(collectionId, "assign_collection", opts, (c) => {
        if (c.ownerOrgId === orgId) throw new PlatformError("invalid", `${orgId} owns this collection; it cannot also be assigned to it.`)
        const set = new Set(c.assignedTo)
        if (assigned) set.add(orgId)
        else set.delete(orgId)
        return { ...c, assignedTo: [...set].sort() }
    })
}

// ── view as ──────────────────────────────────────────────────────────────────

export const VIEW_BEARER_MAX_MINUTES = 60

/** Short-lived (≤ 60 min) read-only MCP bearer for a tenant, for "view as". */
export async function mintTenantViewBearer(orgId: OrgId, minutes: number, actor: Actor): Promise<{ token: string; tokenId: string; expiresAt: string }> {
    const { db, now } = deps()
    const t = await requireTenant(db, orgId)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > VIEW_BEARER_MAX_MINUTES)
        throw new PlatformError("invalid", `minutes is a whole number from 1 to ${VIEW_BEARER_MAX_MINUTES}.`)
    if (!(await isPlatformOwner(actor.uid, db))) throw new PlatformError("forbidden", "Only the platform owner can view as a tenant.")
    const expiresAtMs = now() + minutes * 60_000
    const { id, rawToken } = await createViewAsToken(actor.uid, orgId, expiresAtMs, `View as ${t.config.name}`, db)
    const expiresAt = new Date(expiresAtMs).toISOString()
    await recordPlatformAudit({
        actorUid: actor.uid,
        actorEmail: actor.email ?? null,
        via: actor.via,
        action: "mint_tenant_view_bearer",
        orgId,
        before: null,
        after: { tokenId: id, expiresAt, readOnly: true },
    })
    return { token: rawToken, tokenId: id, expiresAt }
}

// ── activity ─────────────────────────────────────────────────────────────────

export async function listPlatformActivity(q?: { orgId?: OrgId; since?: string; limit?: number }): Promise<PlatformAuditEntry[]> {
    const { db } = deps()
    let query: FirebaseFirestore.Query = db.collection("platformAudit")
    if (q?.orgId) {
        assertOrgId(q.orgId)
        query = query.where("orgId", "==", q.orgId)
    }
    if (q?.since) {
        const ms = Date.parse(q.since)
        if (Number.isNaN(ms)) throw new PlatformError("invalid", `since is an ISO date/time (got "${q.since}").`)
        query = query.where("at", ">=", Timestamp.fromMillis(ms))
    }
    const limit = Math.min(Math.max(Math.trunc(q?.limit ?? 50), 1), 500)
    const snap = await query.orderBy("at", "desc").limit(limit).get()
    return snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>
        return {
            id: d.id,
            at: iso(x.at) ?? "",
            actorUid: String(x.actorUid ?? ""),
            actorEmail: str(x.actorEmail),
            via: x.via === "claude" ? "claude" : "console",
            action: String(x.action ?? ""),
            orgId: str(x.orgId),
            before: x.before ?? null,
            after: x.after ?? null,
        }
    })
}

export async function recordPlatformAudit(e: Omit<PlatformAuditEntry, "id" | "at">): Promise<string> {
    const { db, now } = deps()
    const ref = await db.collection("platformAudit").add({
        actorUid: e.actorUid,
        actorEmail: e.actorEmail ?? null,
        via: e.via,
        action: e.action,
        orgId: e.orgId ?? null,
        before: plain(e.before),
        after: plain(e.after),
        at: Timestamp.fromMillis(now()),
    })
    return ref.id
}

/**
 * Added in phase 4: a tenant's validated config plus its raw document (for
 * domainStatus and other fields the schema does not own). crc and
 * brotherslazaroff fall back to the code configs. null = no such tenant.
 */
export async function readTenantConfig(orgId: OrgId): Promise<{ config: OrgConfig; raw: Record<string, unknown> | null } | null> {
    const { db } = deps()
    assertOrgId(orgId)
    const t = await readTenant(db, orgId)
    return t.config ? { config: t.config, raw: t.raw } : null
}
