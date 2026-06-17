import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { randomBytes } from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import {
    initAdmin,
    getFirestore,
    getAuth,
    getStorage,
} from "@/lib/firebase-admin"
import { generateRawToken, hashToken } from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"
import { liftLegacyErrorEnvelope } from "@/lib/mcp/errors"
import { isTestUid } from "@/lib/test-isolation"
import { DEFAULT_ORG_ID, ORGS, isKnownOrg } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * MCP test-identity provisioning.
 *
 * Lets an admin (or band_leader, via the MCP tool path) mint headless
 * Firebase Auth users — `test-<role>-<8-hex>` uid prefix, `[TEST]` displayName,
 * `disabled: true` so the UI can never sign them in — paired with an ordinary
 * `crl_live_*` MCP bearer token in `mcpTokens` plus a discovery row in
 * `mcpTestUsers/{uid}`. The point is autonomous role-boundary stress testing
 * by cowork without Daniel hand-provisioning fixtures in the Firebase console.
 *
 * - `create_test_account({role, soundEngineer?, label?, ttlSec?, loginable?})`
 * - `list_test_accounts({role?, includeExpired?})`
 * - `revoke_test_account({uid})` — cascades to owned data (see CASCADE_FIELDS)
 * - `cleanup_all_test_data()` — sweeps every test-namespaced user
 *
 * Token rate-limiting is intentionally untouched: the existing
 * `checkUserRateLimit(uid, ..., {bypass: isTrustedLeader})` call sites key on
 * uid + role, so a `role: 'musician'` test token gets the standard tier
 * automatically. See `feedback_admin_rate_limit_bypass` memory.
 *
 * TTL: `mcp_test_tokens.ttlExpiresAt` is enforced by `verifyBearer`
 * (additive ttlExpiresAt check on the mcpTokens doc). Expired tokens still
 * have a backing Auth user + Firestore data until a manual revoke or
 * `cleanup_all_test_data` sweep — `list_test_accounts({includeExpired: true})`
 * surfaces them so the operator can decide.
 */

const MCP_TOKENS = "mcpTokens"
const MCP_TEST_USERS = "mcpTestUsers"
const USERS = "users"
const QR_SESSIONS = "qr-sessions"
const TEST_UID_PREFIX = "test-"
const TEST_DISPLAY_PREFIX = "[TEST]"
const TEST_EMAIL_DOMAIN = "test.centralreform.live"

const DEFAULT_TTL_SEC = 4 * 60 * 60 // 4 hours
const MAX_TTL_SEC = 24 * 60 * 60 // 24 hours

/**
 * Per-instance uid namespace. Parallel cowork instances pass a `uidPrefix`
 * so their test users + cleanup don't collide. The full uid shape becomes
 * `test-<uidPrefix>-<role>-<8-hex>` when set; otherwise `test-<role>-<8-hex>`.
 * Validation: lowercase alphanum + hyphen, 1-32 chars, no leading/trailing
 * hyphen, no consecutive hyphens.
 */
const UID_PREFIX_RE = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,30}[a-z0-9]$|^[a-z0-9]$/

/** Roles a test user may be provisioned as. `admin` is intentionally absent. */
const TEST_ROLE = z.enum(["band_leader", "musician", "member"])
type TestRole = z.infer<typeof TEST_ROLE>

/** Trusted-leader gate (admin OR band_leader). Mirrors `library-upload`'s
 * gate so this surface composes the same way as the rest of MCP. */
async function loadCallerRole(uid: string): Promise<{
    role: string | undefined
    isTrustedLeader: boolean
}> {
    const db = getFirestore()
    const snap = await db.collection(USERS).doc(uid).get()
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    const role = typeof data.role === "string" ? data.role : undefined
    return {
        role,
        isTrustedLeader: role === "admin" || role === "band_leader",
    }
}

/** Standard MCP error envelope per feedback_mcp_validation_shape. */
function envelope(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    hint?: string,
): { error: string; message: string; context?: Record<string, unknown>; hint?: string } {
    return {
        error: code,
        message,
        ...(context ? { context } : {}),
        ...(hint ? { hint } : {}),
    }
}

function jsonResult(data: unknown) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(liftLegacyErrorEnvelope(data), null, 2),
            },
        ],
    }
}

function breadcrumb(
    op: "mint" | "list" | "revoke" | "cleanup",
    data: Record<string, unknown>,
): void {
    try {
        Sentry.addBreadcrumb({
            category: "mcp:test-token",
            level: "info",
            message: op,
            data,
            timestamp: Date.now() / 1000,
        })
    } catch {
        // Telemetry must never crash the caller.
    }
}

// ─── Provision ──────────────────────────────────────────────────────────────

export interface CreateTestAccountArgs {
    role: TestRole
    soundEngineer?: boolean
    label?: string
    ttlSec?: number
    uidPrefix?: string
    loginable?: boolean
    /**
     * F-8 (v11.5-04-03): org memberships to provision for the test account.
     * When set, written to the user doc + Auth claims (`orgIds`) and the bearer
     * token's `orgId` is pinned to orgIds[0]. Omitted → crc-only, byte-equivalent
     * to the pre-F-8 behavior (no orgIds claim/field; token orgId = DEFAULT_ORG_ID).
     */
    orgIds?: OrgId[]
}

export interface CreateTestAccountResult {
    uid: string
    role: TestRole
    soundEngineer: boolean
    token: string
    tokenId: string
    expiresAt: string
    displayName: string
    loginable: boolean
    /** Org memberships the account was provisioned with (defaults to ['crc']). */
    orgIds: OrgId[]
    /** One-time, single-use browser login link. Present only when loginable. */
    loginUrl?: string
}

/**
 * Shared core called by both the MCP tool and the HTTP endpoint. `callerUid`
 * is the admin/band_leader provisioner; the new test user inherits no relation
 * to them beyond the `provisionedBy` audit field.
 */
export async function provisionTestAccount(
    callerUid: string,
    args: CreateTestAccountArgs,
): Promise<CreateTestAccountResult | ReturnType<typeof envelope>> {
    initAdmin()

    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        return envelope(
            "forbidden_role",
            "create_test_account requires admin or band_leader role.",
            {
                callerRole: callerRole ?? null,
                requiredRoles: ["admin", "band_leader"],
            },
            "Sign in as admin/band_leader, or ask one to mint the test account for you.",
        )
    }

    // Defensive: schema-level enum already excludes 'admin', but a direct
    // HTTP-endpoint call could still attempt to bypass the Zod gate (e.g.
    // schema drift). Belt-and-braces refuse here too.
    // @ts-expect-error — the enum makes this unreachable in well-typed callers
    if (args.role === "admin") {
        return envelope(
            "admin_test_user_refused",
            "Cannot mint a test account with role=admin. Use admin sparingly via a real Firebase account.",
            { requestedRole: "admin" },
            "Choose role: 'band_leader' | 'musician' | 'member'.",
        )
    }

    const ttlSec = args.ttlSec ?? DEFAULT_TTL_SEC
    if (ttlSec <= 0 || ttlSec > MAX_TTL_SEC) {
        return envelope(
            "ttl_out_of_range",
            `ttlSec must be > 0 and <= ${MAX_TTL_SEC} (24 hours).`,
            { requestedTtlSec: ttlSec, maxTtlSec: MAX_TTL_SEC },
            `Pass ttlSec <= ${MAX_TTL_SEC} or omit for the ${DEFAULT_TTL_SEC}s default.`,
        )
    }

    if (args.uidPrefix !== undefined && !UID_PREFIX_RE.test(args.uidPrefix)) {
        return envelope(
            "invalid_uid_prefix",
            "uidPrefix must be lowercase alphanumeric with single hyphens, 1-32 chars, no leading/trailing or consecutive hyphens.",
            { requestedUidPrefix: args.uidPrefix },
            "Pick a short instance label like 'cycle5b' or 'cowork-a'.",
        )
    }

    // F-8: optional org-membership provisioning. `explicitOrgIds` is null when
    // omitted so the default path stays byte-equivalent to pre-F-8 (no orgIds
    // claim/field written; token orgId = DEFAULT_ORG_ID). Defense-in-depth: the
    // Zod enum already bounds the values, but a direct HTTP-endpoint call could
    // bypass it — refuse unknown orgs here too (mirrors the role guard).
    const explicitOrgIds: OrgId[] | null =
        args.orgIds && args.orgIds.length > 0 ? args.orgIds : null
    if (explicitOrgIds) {
        for (const o of explicitOrgIds) {
            if (!isKnownOrg(o)) {
                return envelope(
                    "invalid_org_id",
                    `Unknown org id '${o}'. Refusing to provision a test account for a non-existent tenant.`,
                    {
                        requestedOrgIds: args.orgIds,
                        knownOrgs: Object.keys(ORGS),
                    },
                    `Pick from: ${Object.keys(ORGS).join(", ")}.`,
                )
            }
        }
    }
    const resolvedOrgIds: OrgId[] = explicitOrgIds ?? [DEFAULT_ORG_ID]
    const tokenOrgId: OrgId = resolvedOrgIds[0]

    const suffix = randomBytes(4).toString("hex")
    const prefixSegment = args.uidPrefix ? `${args.uidPrefix}-` : ""
    const uid = `${TEST_UID_PREFIX}${prefixSegment}${args.role}-${suffix}`
    const labelPart = args.label ? ` ${args.label}` : ""
    const displayName = `${TEST_DISPLAY_PREFIX} ${args.role}${labelPart}`
    const email = `${uid}@${TEST_EMAIL_DOMAIN}`
    const soundEngineer = args.soundEngineer === true
    // Loginable accounts are created ENABLED so a browser/harness can sign in
    // as the persona (default stays disabled:true → MCP-bearer path only).
    const loginable = args.loginable === true

    const auth = getAuth()
    const db = getFirestore()
    const now = Date.now()
    const expiresAtMs = now + ttlSec * 1000

    // 1. Create Firebase Auth user. Default `disabled: true` so the UI can
    // never sign them in; `loginable` flips this to `disabled: false` so a
    // browser/harness can sign in via the one-time login link minted below.
    // No password is set — login is custom-token only (the Email/Password
    // provider is never relied upon, so no new auth surface). Custom claims
    // propagate through firestore.rules + the handlers that read decoded.role.
    try {
        await auth.createUser({
            uid,
            displayName,
            email,
            disabled: !loginable,
        })
    } catch (err) {
        logger.error("[mcp-test-token] createUser failed", { uid, err })
        return envelope(
            "auth_create_failed",
            "Firebase Auth user creation failed.",
            { uid, detail: String((err as Error)?.message ?? err) },
        )
    }
    await auth.setCustomUserClaims(uid, {
        role: args.role,
        ...(soundEngineer ? { soundEngineer: true } : {}),
        // F-8: only stamp orgIds when explicitly requested — getOrgIdsFromClaims
        // treats a missing claim as [crc], so the omitted path needs no claim.
        ...(explicitOrgIds ? { orgIds: explicitOrgIds } : {}),
    })

    // 2. Firestore user doc — picked up by every gate that reads users/{uid}.
    await db.collection(USERS).doc(uid).set({
        role: args.role,
        soundEngineer,
        displayName,
        email,
        isTestUser: true,
        loginable,
        // F-8: claim+doc lockstep (v11.1-02-02). Omitted → no field (rowOrgIds
        // defaults to [crc]), keeping the default path byte-equivalent.
        ...(explicitOrgIds ? { orgIds: explicitOrgIds } : {}),
        provisionedBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
    })

    // 3. Mint the bearer. Hashed-only persistence, raw is shown ONCE.
    const rawToken = generateRawToken()
    const tokenRef = await db.collection(MCP_TOKENS).add({
        tokenHash: hashToken(rawToken),
        uid,
        label: args.label ?? `Test ${args.role}`,
        kind: "test",
        testUid: uid,
        // v11-02-01: role test accounts default to crc (the tenant they stress
        // today). F-8: when orgIds is provided, the bearer's authoring org pins
        // to the primary (orgIds[0]).
        orgId: tokenOrgId,
        provisionedBy: callerUid,
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
    })

    // 4. Discovery index — list_test_accounts walks this.
    await db.collection(MCP_TEST_USERS).doc(uid).set({
        uid,
        role: args.role,
        soundEngineer,
        loginable,
        label: args.label ?? null,
        displayName,
        mcpTokenId: tokenRef.id,
        provisionedBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
        revokedAt: null,
    })

    // 5. Loginable accounts: mint a one-time, single-use browser login link
    // built on the existing QR custom-token mechanism. The QR PUT-approval path
    // mints a custom token for the APPROVER's OWN uid and requires a second
    // already-signed-in device (hard-coupled to physical-device handoff), so we
    // write a PRE-APPROVED qr-sessions doc directly with the admin SDK. The
    // existing `GET /api/auth/qr?code=` path then consumes (and deletes) it,
    // handing the harness a custom token → real Web SDK auth → the normal
    // /api/auth/session cookie. Disabled (default) accounts get no link.
    let loginUrl: string | undefined
    if (loginable) {
        const customToken = await auth.createCustomToken(uid)
        // High-entropy code (NOT the QR 6-char code) — this link grants a session.
        const loginCode = randomBytes(24).toString("base64url")
        await db.collection(QR_SESSIONS).doc(loginCode).set({
            status: "approved",
            customToken,
            testUid: uid,
            userName: displayName,
            userPhoto: null,
            createdAt: now,
            // 5-min single-use login link. Once consumed, the resulting session
            // + refresh token carry the account TTL (enforced by the
            // disable-expired-test-accounts cron, not this link's expiry).
            expiresAt: now + 5 * 60 * 1000,
        })
        loginUrl = `/test-login?code=${loginCode}`
    }

    breadcrumb("mint", {
        uid,
        role: args.role,
        soundEngineer,
        loginable,
        provisionedBy: callerUid,
        ttlSec,
    })
    logger.info("[mcp-test-token] minted", {
        uid,
        role: args.role,
        provisionedBy: callerUid,
        tokenId: tokenRef.id,
    })

    return {
        uid,
        role: args.role,
        soundEngineer,
        token: rawToken,
        tokenId: tokenRef.id,
        expiresAt: new Date(expiresAtMs).toISOString(),
        displayName,
        loginable,
        orgIds: resolvedOrgIds,
        ...(loginUrl ? { loginUrl } : {}),
    }
}

// ─── List ───────────────────────────────────────────────────────────────────

export interface ListTestAccountsArgs {
    role?: TestRole
    includeExpired?: boolean
}

export interface TestAccountSummary {
    uid: string
    role: TestRole
    soundEngineer: boolean
    label: string | null
    displayName: string | null
    provisionedBy: string
    createdAt: string | null
    ttlExpiresAt: string | null
    revokedAt: string | null
    expired: boolean
}

export async function listTestAccountsCore(
    callerUid: string,
    args: ListTestAccountsArgs,
): Promise<
    { accounts: TestAccountSummary[] } | ReturnType<typeof envelope>
> {
    initAdmin()
    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        return envelope(
            "forbidden_role",
            "list_test_accounts requires admin or band_leader role.",
            {
                callerRole: callerRole ?? null,
                requiredRoles: ["admin", "band_leader"],
            },
            "Sign in as admin/band_leader, or ask one to list test accounts for you.",
        )
    }

    const db = getFirestore()
    const snap = await db.collection(MCP_TEST_USERS).get()
    const now = Date.now()
    const accounts: TestAccountSummary[] = []
    for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>
        const role = d.role as TestRole | undefined
        if (!role) continue
        if (args.role && role !== args.role) continue
        const ttlMs = d.ttlExpiresAt instanceof Timestamp ? d.ttlExpiresAt.toMillis() : null
        const expired = ttlMs !== null && ttlMs <= now
        if (expired && !args.includeExpired) continue
        accounts.push({
            uid: doc.id,
            role,
            soundEngineer: d.soundEngineer === true,
            label: typeof d.label === "string" ? d.label : null,
            displayName: typeof d.displayName === "string" ? d.displayName : null,
            provisionedBy: typeof d.provisionedBy === "string" ? d.provisionedBy : "",
            createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : null,
            ttlExpiresAt: ttlMs ? new Date(ttlMs).toISOString() : null,
            revokedAt: d.revokedAt instanceof Timestamp ? d.revokedAt.toDate().toISOString() : null,
            expired,
        })
    }
    accounts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    breadcrumb("list", { callerUid, count: accounts.length, includeExpired: !!args.includeExpired })
    return { accounts }
}

// ─── Revoke + cascade ───────────────────────────────────────────────────────

/**
 * Cascade fields — collection → field equal-match against the test uid.
 * Schema-verified 2026-05-17 (see DESIGN.md §1.5).
 *
 * Cycle-7 Lane 1 (C7I3-007): `setlistTemplates` added so a revoke /
 * cleanup-all sweep cascades through cycle-6-Lane-2's template CRUD pack.
 * Field name is `ownerId` — verified against the deployed shape via
 * REPRO-L1-cleanup-cascades (the template doc returned by `create_template`
 * has `ownerId`, not `ownerUid`). Caught at the addendum REPRO; emulator
 * test was self-fulfillingly seeded with `ownerUid` and silently passed.
 */
const CASCADE_FIELDS: Array<{ collection: string; field: string; storage?: boolean }> = [
    { collection: "library_index", field: "uploadedBy", storage: true },
    { collection: "songs", field: "uploader" },
    { collection: "proposal_stages", field: "createdBy" },
    { collection: "bond_flags", field: "flaggedBy" },
    { collection: "bond_corrections", field: "correctedBy" },
    { collection: "scheduling_assignments", field: "musicianUid" },
    { collection: "musician_availability", field: "musicianUid" },
    { collection: "setlistTemplates", field: "ownerId" },
    // Loginable login-links (un-consumed). Consumed links auto-delete on GET;
    // this sweeps any that were never opened. Field stamped at mint (step 5).
    { collection: "qr-sessions", field: "testUid" },
]

export interface RevokeTestAccountResult {
    revoked: true
    uid: string
    cascaded: {
        setlists: number
        tracks: number
        library_index: number
        songs: number
        proposal_stages: number
        bond_flags: number
        bond_corrections: number
        scheduling_assignments: number
        musician_availability: number
        setlistTemplates: number
        "qr-sessions": number
        monitorBusAssignments: number
        mcpTokens: number
        storageDeleted: number
        storageFailed: number
    }
    authDeleted: boolean
}

async function deleteByQuery(
    db: FirebaseFirestore.Firestore,
    collection: string,
    field: string,
    uid: string,
): Promise<{ ids: string[]; count: number }> {
    const snap = await db.collection(collection).where(field, "==", uid).get()
    if (snap.empty) return { ids: [], count: 0 }
    const ids = snap.docs.map((d) => d.id)
    const bw = db.bulkWriter()
    for (const d of snap.docs) bw.delete(d.ref)
    await bw.close()
    return { ids, count: ids.length }
}

async function bestEffortStorageDelete(
    fileIds: string[],
): Promise<{ deleted: number; failed: number }> {
    if (fileIds.length === 0) return { deleted: 0, failed: 0 }
    let deleted = 0
    let failed = 0
    let bucket
    try {
        bucket = getStorage().bucket()
    } catch {
        return { deleted: 0, failed: fileIds.length }
    }
    for (const fileId of fileIds) {
        // Mirror processChartUpload's path scheme — `charts/{fileId}/...`
        // is the common prefix. Best-effort: if nothing matches, no-op.
        try {
            const [files] = await bucket.getFiles({ prefix: `charts/${fileId}/` })
            for (const f of files) {
                try {
                    await f.delete()
                    deleted++
                } catch {
                    failed++
                }
            }
        } catch {
            failed++
        }
    }
    return { deleted, failed }
}

/**
 * H8 (v11.5-04-03): release the test uid's monitor-bus assignments.
 *
 * Bus assignments are NOT a uid-keyed collection — they live in the single
 * `config/monitor` doc under `busAssignments: Record<busIndexStr,
 * BusAssignment | BusAssignment[] | null>` (each BusAssignment carries a
 * `userId`). So the revoke cascade can't reach them via deleteByQuery. Walk the
 * map, drop entries whose userId === uid, null-out emptied slots (mirrors the
 * in-app BusAssignmentPanel's null-when-empty), and write back only on change.
 *
 * CRC-only (`config/monitor`): test accounts are crc-stamped and broslaz has no
 * sound desk. Best-effort — a cleanup sweep must never crash on a monitor read.
 */
async function releaseMonitorBusAssignments(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<number> {
    try {
        const ref = db.collection("config").doc("monitor")
        const snap = await ref.get()
        if (!snap.exists) return 0
        const data = snap.data() as Record<string, unknown>
        const assignments = data.busAssignments
        if (!assignments || typeof assignments !== "object") return 0

        const next: Record<string, unknown> = {
            ...(assignments as Record<string, unknown>),
        }
        let removed = 0
        let changed = false
        for (const [busIdx, raw] of Object.entries(
            assignments as Record<string, unknown>,
        )) {
            if (raw == null) continue
            const list = Array.isArray(raw) ? raw : [raw]
            const kept = list.filter(
                (a) =>
                    !(
                        a &&
                        typeof a === "object" &&
                        (a as { userId?: unknown }).userId === uid
                    ),
            )
            if (kept.length === list.length) continue // uid not on this bus
            removed += list.length - kept.length
            changed = true
            next[busIdx] = kept.length === 0 ? null : kept
        }

        if (changed) await ref.update({ busAssignments: next })
        return removed
    } catch (err) {
        logger.warn("[mcp-test-token] releaseMonitorBusAssignments failed", {
            uid,
            err: err instanceof Error ? err.message : String(err),
        })
        return 0
    }
}

export async function revokeTestAccountCore(
    callerUid: string,
    uid: string,
): Promise<RevokeTestAccountResult | ReturnType<typeof envelope>> {
    initAdmin()
    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        // Cycle-3 SEC-001: the refusal context used to carry `callerRole`
        // alongside (historically) the caller's real Firebase uid. The
        // uid is gone (the caller already knows their own bearer); we keep
        // `callerRole` since it's intentionally surfaced for the operator
        // to know whether to elevate or pick a different tool.
        return envelope(
            "forbidden_role",
            "revoke_test_account requires admin or band_leader role.",
            { callerRole: callerRole ?? null, requiredRoles: ["admin", "band_leader"] },
            "Ask an admin / band_leader to revoke the test account for you.",
        )
    }
    return revokeTestAccountUnchecked(callerUid, uid)
}

/**
 * Internal revoke that skips the trusted-leader gate. Public callers MUST
 * go through `revokeTestAccountCore`; the only legitimate skip-the-gate
 * caller is `cleanupAllTestDataCore` after it has already verified the
 * caller's role once up front.
 *
 * Why this exists (prod stress test 2026-05-17, msg-004 case 6): when
 * `cleanupAllTestDataCore` is invoked from a TEST bearer (one of its own
 * sweep targets), the loop will eventually revoke the caller's `users/{uid}`
 * doc mid-sweep. The next iteration would then re-run `loadCallerRole`,
 * read `undefined`, and refuse every remaining revoke with "forbidden",
 * leaving orphans. Caching the gate at cleanup-entry and skipping the
 * re-check inside the loop closes that race.
 */
async function revokeTestAccountUnchecked(
    callerUid: string,
    uid: string,
): Promise<RevokeTestAccountResult | ReturnType<typeof envelope>> {
    initAdmin()
    if (!uid || !uid.startsWith(TEST_UID_PREFIX)) {
        // Cycle-3 SEC-001: do NOT echo the supplied uid back. The caller
        // already knows the uid they passed; surfacing it in the refusal
        // body is a minor information disclosure (Firestore-rules pivot
        // identifier). Redact to a structural hint instead.
        return envelope(
            "not_a_test_uid",
            `uid must start with '${TEST_UID_PREFIX}'. Refusing to operate on a non-test identity.`,
            { requiredPrefix: TEST_UID_PREFIX },
            "Use list_test_accounts to find the right uid.",
        )
    }

    const db = getFirestore()

    // 1. Setlists owned by the test user → cascade their tracks.
    const setlistsSnap = await db.collection("setlists").where("ownerId", "==", uid).get()
    const setlistIds = setlistsSnap.docs.map((d) => d.id)
    let tracksDeleted = 0
    if (setlistIds.length > 0) {
        // Tracks are top-level, keyed by setlistId. One query per setlist
        // keeps the index footprint zero; tiny test datasets.
        for (const sid of setlistIds) {
            const trackSnap = await db.collection("tracks").where("setlistId", "==", sid).get()
            const bw = db.bulkWriter()
            for (const t of trackSnap.docs) bw.delete(t.ref)
            await bw.close()
            tracksDeleted += trackSnap.size
        }
        const bw = db.bulkWriter()
        for (const s of setlistsSnap.docs) bw.delete(s.ref)
        await bw.close()
    }

    // 2. Other owned collections.
    const cascaded: Record<string, number> = {
        setlists: setlistIds.length,
        tracks: tracksDeleted,
    }
    let storageFileIds: string[] = []
    for (const c of CASCADE_FIELDS) {
        const { ids, count } = await deleteByQuery(db, c.collection, c.field, uid)
        cascaded[c.collection] = count
        if (c.storage) storageFileIds = storageFileIds.concat(ids)
    }

    // H8: release the uid's monitor-bus assignments (nested map in config/monitor,
    // not a uid-keyed collection — see releaseMonitorBusAssignments).
    cascaded.monitorBusAssignments = await releaseMonitorBusAssignments(db, uid)

    // 3. mcpTokens that we minted for this test uid. We use `testUid` so
    // we never touch a real user's tokens by accident.
    const tokenSnap = await db.collection(MCP_TOKENS).where("testUid", "==", uid).get()
    {
        const bw = db.bulkWriter()
        for (const t of tokenSnap.docs) bw.delete(t.ref)
        await bw.close()
    }
    cascaded.mcpTokens = tokenSnap.size

    // 4. The index doc.
    await db.collection(MCP_TEST_USERS).doc(uid).delete().catch(() => {})

    // 5. users/{uid} with subcollections.
    try {
        await db.recursiveDelete(db.collection(USERS).doc(uid))
    } catch (err) {
        logger.warn("[mcp-test-token] recursiveDelete failed", { uid, err })
    }

    // 6. Firebase Auth user — last so an early failure doesn't leave a
    // dangling Auth user with no Firestore state.
    let authDeleted = true
    try {
        await getAuth().deleteUser(uid)
    } catch (err) {
        authDeleted = false
        logger.warn("[mcp-test-token] Auth deleteUser failed", { uid, err })
    }

    // 7. Best-effort Storage purge for the test user's chart bytes.
    const storage = await bestEffortStorageDelete(storageFileIds)

    breadcrumb("revoke", { uid, callerUid, cascaded, authDeleted })
    logger.info("[mcp-test-token] revoked", { uid, callerUid, cascaded, authDeleted })

    return {
        revoked: true,
        uid,
        cascaded: {
            setlists: cascaded.setlists ?? 0,
            tracks: cascaded.tracks ?? 0,
            library_index: cascaded.library_index ?? 0,
            songs: cascaded.songs ?? 0,
            proposal_stages: cascaded.proposal_stages ?? 0,
            bond_flags: cascaded.bond_flags ?? 0,
            bond_corrections: cascaded.bond_corrections ?? 0,
            scheduling_assignments: cascaded.scheduling_assignments ?? 0,
            musician_availability: cascaded.musician_availability ?? 0,
            setlistTemplates: cascaded.setlistTemplates ?? 0,
            "qr-sessions": cascaded["qr-sessions"] ?? 0,
            monitorBusAssignments: cascaded.monitorBusAssignments ?? 0,
            mcpTokens: cascaded.mcpTokens ?? 0,
            storageDeleted: storage.deleted,
            storageFailed: storage.failed,
        },
        authDeleted,
    }
}

// ─── Cleanup all ─────────────────────────────────────────────────────────────

export interface CleanupAllArgs {
    /**
     * Optional uid-prefix filter. When set, only sweeps test users whose
     * uid starts with `test-<prefix>-`. Parallel cowork instances pass
     * their own per-instance prefix to avoid cross-contamination — without
     * it the call cascade-deletes every sibling instance's data. Validated
     * with the same shape rule as `create_test_account.uidPrefix`.
     */
    prefix?: string
}

export interface CleanupAllResult {
    removed: number
    failures: string[]
    aggregate: Record<string, number>
}

export async function cleanupAllTestDataCore(
    callerUid: string,
    args: CleanupAllArgs = {},
): Promise<CleanupAllResult | ReturnType<typeof envelope>> {
    initAdmin()
    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        return envelope(
            "forbidden_role",
            "cleanup_all_test_data requires admin or band_leader role.",
            {
                callerRole: callerRole ?? null,
                requiredRoles: ["admin", "band_leader"],
            },
            "Sign in as admin/band_leader, or ask one to run cleanup for you.",
        )
    }

    if (args.prefix !== undefined && !UID_PREFIX_RE.test(args.prefix)) {
        return envelope(
            "invalid_uid_prefix",
            "prefix must be lowercase alphanumeric with single hyphens, 1-32 chars, no leading/trailing or consecutive hyphens.",
            { requestedPrefix: args.prefix },
            "Pass the same instance label used at create_test_account time, or omit to sweep every test user.",
        )
    }
    // `test-<prefix>-` — full match prefix including the leading `test-`.
    // Falsy means "sweep every test-namespaced uid". Used as a string
    // predicate; never echoed back so trailing hyphen is just join-glue.
    const fullPrefix = args.prefix ? `${TEST_UID_PREFIX}${args.prefix}-` : null
    const matchesPrefix = (uid: string): boolean =>
        fullPrefix === null ? uid.startsWith(TEST_UID_PREFIX) : uid.startsWith(fullPrefix)

    const db = getFirestore()
    // Walk the index AND any orphaned Auth users (defense-in-depth: if a
    // revoke partially failed and left an Auth user without an index doc,
    // we still sweep it).
    const indexSnap = await db.collection(MCP_TEST_USERS).get()
    const indexUids = new Set(
        indexSnap.docs.map((d) => d.id).filter(matchesPrefix),
    )

    // Walk Auth pages for test-* uids. listUsers is paginated; we'll cap
    // at a reasonable depth to avoid pathological loops.
    const auth = getAuth()
    let pageToken: string | undefined
    const orphanAuthUids: string[] = []
    for (let i = 0; i < 20; i++) {
        const result = await auth.listUsers(1000, pageToken)
        for (const u of result.users) {
            if (matchesPrefix(u.uid) && !indexUids.has(u.uid)) {
                orphanAuthUids.push(u.uid)
            }
        }
        if (!result.pageToken) break
        pageToken = result.pageToken
    }

    // Order the sweep so the CALLER (if they're a test user) is revoked
    // LAST. Belt-and-braces — `revokeTestAccountUnchecked` skips the
    // role check, but ordering keeps the invariant correct even if a
    // future refactor reintroduces the per-iteration check. Without
    // this, deleting the caller's `users/{uid}` doc mid-sweep used to
    // cause every subsequent revoke to refuse with `forbidden`
    // (prod stress test 2026-05-17, msg-004 case 6).
    //
    // Note: an admin caller whose own uid does NOT start with `test-`
    // will not be in `allUidsRaw` at all — the prefix filter excluded
    // them — so they cannot be self-deleted even by name collision.
    // The "caller-last" ordering is only load-bearing when the caller
    // IS a test bearer matching the sweep prefix.
    const allUidsRaw = [...indexUids, ...orphanAuthUids]
    const allUids = [
        ...allUidsRaw.filter((u) => u !== callerUid),
        ...allUidsRaw.filter((u) => u === callerUid),
    ]
    const aggregate: Record<string, number> = {}
    const failures: string[] = []
    let removed = 0
    for (const uid of allUids) {
        const r = await revokeTestAccountUnchecked(callerUid, uid)
        if ("error" in r) {
            failures.push(`${uid}: ${r.error}`)
            continue
        }
        removed++
        for (const [k, v] of Object.entries(r.cascaded)) {
            aggregate[k] = (aggregate[k] ?? 0) + (v as number)
        }
    }

    // v11.2-04-02 (BUG-5): owner-independent isTest flag-sweep.
    //
    // The owner-cascade above only removes data OWNED by a `test-*` uid. A
    // setlist authored under a REAL admin uid but stamped `isTest:true`
    // (explicit override at create_setlist, or the [TEST/CYCLE/CF] name
    // heuristic) is invisible to that cascade and lingers in prod (BL
    // stress-test 2026-06-09). Sweep it by flag here.
    //
    // FULL-SWEEP MODE ONLY: when a `prefix` was supplied this is a
    // parallel-cowork isolation call — a global flag-sweep would cross-delete
    // a sibling instance's fixtures, breaking the uidPrefix contract
    // (feedback_sandbox_test_isolation). So gate on `fullPrefix === null`.
    //
    // No dedup needed: this query runs AFTER the owner-cascade, so any
    // test-owned isTest setlist is already deleted and won't reappear here —
    // only real-owner flag-true rows remain. Deletes use the admin SDK
    // directly (no caller-role dependency), so the caller-last ordering and
    // the self-inclusion path (caller is a test bearer) stay correct.
    if (fullPrefix === null) {
        const flagSnap = await db
            .collection("setlists")
            .where("isTest", "==", true)
            .get()
        let flagSetlists = 0
        let flagTracks = 0
        for (const doc of flagSnap.docs) {
            try {
                const trackSnap = await db
                    .collection("tracks")
                    .where("setlistId", "==", doc.id)
                    .get()
                const bw = db.bulkWriter()
                for (const t of trackSnap.docs) bw.delete(t.ref)
                await bw.close()
                flagTracks += trackSnap.size
                await doc.ref.delete()
                flagSetlists++
            } catch (err) {
                failures.push(
                    `setlist:${doc.id}: ${err instanceof Error ? err.message : String(err)}`,
                )
            }
        }
        if (flagSetlists > 0) aggregate["setlists.isTest"] = flagSetlists
        if (flagTracks > 0) aggregate["tracks.isTest"] = flagTracks
    }

    breadcrumb("cleanup", { callerUid, removed, failures: failures.length, aggregate })
    return { removed, failures, aggregate }
}

// ─── Sweep orphan test data (Convergence C) ─────────────────────────────────

export interface SweepOrphanTestDataArgs {
    /**
     * Optional further-narrowed prefix match. When set, only sweeps owner
     * uids that match `isTestUid(uid) && uid.includes(uidPattern)`. Use to
     * scope a sweep to one cycle/instance namespace (e.g. `c7i1`) without
     * touching siblings. When omitted, sweeps every test-shape orphan.
     */
    uidPattern?: string
    /**
     * Standard F-05 dryRun. Default true (observability-first). When true,
     * returns the per-collection orphan list without deleting; when false,
     * performs the destructive sweep.
     */
    dryRun?: boolean
    /**
     * F-05 force gate. Real sweep (dryRun:false) requires force:true,
     * matching `reconcile_library` / `backfill_setlist_test_flag` semantics.
     */
    force?: boolean
}

export interface SweepOrphanTestDataResult {
    ok: true
    dryRun: boolean
    scanned: {
        setlists: number
        setlistTemplates: number
        library_index: number
    }
    swept: {
        setlists: number
        setlistTemplates: number
        tracks: number
        library_index: number
        storageDeleted: number
        storageFailed: number
    }
    orphans: Array<{
        collection: "setlists" | "setlistTemplates" | "library_index"
        id: string
        ownerId: string
        name: string | null
    }>
    orphansTruncated: boolean
}

const MAX_ORPHAN_SAMPLE = 500
const ORPHAN_PATTERN_RE = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,30}[a-z0-9]$|^[a-z0-9]$/

export async function sweepOrphanTestDataCore(
    callerUid: string,
    args: SweepOrphanTestDataArgs = {},
): Promise<SweepOrphanTestDataResult | ReturnType<typeof envelope>> {
    initAdmin()
    const { role: callerRole } = await loadCallerRole(callerUid)
    if (callerRole !== "admin") {
        return envelope(
            "forbidden_role",
            "sweep_orphan_test_data is admin-only — it bypasses ownership and deletes orphan setlists/templates whose owner user-record is gone.",
            { callerRole: callerRole ?? null, requiredRoles: ["admin"] },
            "Ask an admin to run the sweep, or use cleanup_all_test_data({prefix}) for owner-bonded cascades.",
        )
    }

    const dryRun = args.dryRun !== false // default true
    const wantsWrite = !dryRun
    if (wantsWrite && args.force !== true) {
        return envelope(
            "force_required",
            "sweep_orphan_test_data with dryRun:false requires force:true. Returning the dry-run plan instead.",
            { requestedDryRun: dryRun },
            "Re-call with `dryRun:false, force:true` to actually delete the orphan rows; or inspect the plan first by calling without force.",
        )
    }

    if (args.uidPattern !== undefined) {
        if (!ORPHAN_PATTERN_RE.test(args.uidPattern)) {
            return envelope(
                "invalid_uid_pattern",
                "uidPattern must be lowercase alphanumeric with single hyphens, 1-32 chars, no leading/trailing or consecutive hyphens.",
                { requestedPattern: args.uidPattern },
                "Pass a substring like 'c7i1' to scope the sweep; omit to sweep every test-shape orphan.",
            )
        }
    }

    const db = getFirestore()

    // Helper — true when the owner uid is a test-shape AND user-doc is absent.
    const orphanFilter = async (ownerId: string | undefined | null): Promise<boolean> => {
        if (!isTestUid(ownerId)) return false
        if (args.uidPattern && !ownerId!.includes(args.uidPattern)) return false
        const userSnap = await db.collection(USERS).doc(ownerId!).get()
        return !userSnap.exists
    }

    const orphans: SweepOrphanTestDataResult["orphans"] = []
    const orphanSetlistIds: string[] = []
    const orphanTemplateIds: string[] = []
    const orphanLibraryIds: string[] = []
    let orphansTruncated = false

    // Setlists — page through all docs (collection cardinality is small —
    // ~44 at TRIAGE time, well within a single fetch).
    const setlistsSnap = await db.collection("setlists").get()
    for (const doc of setlistsSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        const ownerId = typeof data.ownerId === "string" ? data.ownerId : null
        if (!(await orphanFilter(ownerId))) continue
        orphanSetlistIds.push(doc.id)
        if (orphans.length < MAX_ORPHAN_SAMPLE) {
            orphans.push({
                collection: "setlists",
                id: doc.id,
                ownerId: ownerId!,
                name: typeof data.name === "string" ? data.name : null,
            })
        } else {
            orphansTruncated = true
        }
    }

    // Templates — same shape. Field name is `ownerId` (verified against
    // deployed-surface `create_template` output 2026-05-19; matches
    // CASCADE_FIELDS for the revoke path).
    const templatesSnap = await db.collection("setlistTemplates").get()
    for (const doc of templatesSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        const ownerId = typeof data.ownerId === "string" ? data.ownerId : null
        if (!(await orphanFilter(ownerId))) continue
        orphanTemplateIds.push(doc.id)
        if (orphans.length < MAX_ORPHAN_SAMPLE) {
            orphans.push({
                collection: "setlistTemplates",
                id: doc.id,
                ownerId: ownerId!,
                name: typeof data.name === "string" ? data.name : null,
            })
        } else {
            orphansTruncated = true
        }
    }

    // library_index — owner field is `uploadedBy` (matches CASCADE_FIELDS revoke
    // path). BUG-1 (run-1 §BUG-1): rows whose owner test-account was deleted
    // out-of-band survive cleanup_all_test_data's owner-bonded cascade; this
    // owner-absent orphan sweep is the path that reaches them.
    const librarySnap = await db.collection("library_index").get()
    for (const doc of librarySnap.docs) {
        const data = doc.data() as Record<string, unknown>
        const ownerId = typeof data.uploadedBy === "string" ? data.uploadedBy : null
        if (!(await orphanFilter(ownerId))) continue
        orphanLibraryIds.push(doc.id)
        if (orphans.length < MAX_ORPHAN_SAMPLE) {
            orphans.push({
                collection: "library_index",
                id: doc.id,
                ownerId: ownerId!,
                name: typeof data.title === "string" ? data.title : null,
            })
        } else {
            orphansTruncated = true
        }
    }

    const scanned = {
        setlists: setlistsSnap.size,
        setlistTemplates: templatesSnap.size,
        library_index: librarySnap.size,
    }
    const swept = {
        setlists: 0,
        setlistTemplates: 0,
        tracks: 0,
        library_index: 0,
        storageDeleted: 0,
        storageFailed: 0,
    }

    if (wantsWrite) {
        // Delete tracks for orphan setlists first (preserve referential
        // hygiene — track rows pointing at no setlist are themselves orphans).
        for (const sid of orphanSetlistIds) {
            const trackSnap = await db
                .collection("tracks")
                .where("setlistId", "==", sid)
                .get()
            const bw = db.bulkWriter()
            for (const t of trackSnap.docs) bw.delete(t.ref)
            await bw.close()
            swept.tracks += trackSnap.size
        }

        if (orphanSetlistIds.length > 0) {
            const bw = db.bulkWriter()
            for (const sid of orphanSetlistIds) {
                bw.delete(db.collection("setlists").doc(sid))
            }
            await bw.close()
            swept.setlists = orphanSetlistIds.length
        }

        if (orphanTemplateIds.length > 0) {
            const bw = db.bulkWriter()
            for (const tid of orphanTemplateIds) {
                bw.delete(db.collection("setlistTemplates").doc(tid))
            }
            await bw.close()
            swept.setlistTemplates = orphanTemplateIds.length
        }

        // library_index orphans + best-effort Storage bytes (doc id == fileId,
        // same assumption as the revoke path's storage:true cascade).
        if (orphanLibraryIds.length > 0) {
            const bw = db.bulkWriter()
            for (const lid of orphanLibraryIds) {
                bw.delete(db.collection("library_index").doc(lid))
            }
            await bw.close()
            swept.library_index = orphanLibraryIds.length
            const storage = await bestEffortStorageDelete(orphanLibraryIds)
            swept.storageDeleted = storage.deleted
            swept.storageFailed = storage.failed
        }
    }

    breadcrumb("cleanup", {
        callerUid,
        op: "sweep_orphan_test_data",
        dryRun,
        scanned,
        swept,
        orphanCount: orphanSetlistIds.length + orphanTemplateIds.length + orphanLibraryIds.length,
        uidPattern: args.uidPattern ?? null,
    })
    logger.info("[mcp-test-token] sweep_orphan_test_data", {
        callerUid,
        dryRun,
        scanned,
        swept,
        orphanCount: orphanSetlistIds.length + orphanTemplateIds.length + orphanLibraryIds.length,
    })

    return {
        ok: true,
        dryRun,
        scanned,
        swept,
        orphans,
        orphansTruncated,
    }
}

// ─── TTL cutoff for browser-loginable accounts ──────────────────────────────

export interface DisableExpiredResult {
    scanned: number
    expired: number
    disabled: number
    revoked: number
    failures: string[]
}

/**
 * Disable + refresh-revoke loginable test accounts whose TTL has passed.
 *
 * `verifyBearer` enforces the TTL for the MCP bearer, but a `loginable` account
 * signs in via the BROWSER (Firebase session + ID token), which never touches
 * verifyBearer. Client-side Firestore reads authorize via the ID token (not the
 * app session cookie), so the only real cutoff is disabling the Auth user AND
 * revoking refresh tokens: outstanding ID tokens then die within their ≤1h
 * lifetime, and `verifySessionCookie(cookie, true)` (checkRevoked) rejects any
 * live session on its next request.
 *
 * This is the TTL *cutoff*, NOT a data sweep — hard-delete stays with
 * revoke_test_account / cleanup_all_test_data. Idempotent: re-disabling an
 * already-disabled account is a harmless no-op. Called by the hourly
 * `/api/cron/disable-expired-test-accounts` route (exported for direct testing).
 */
export async function disableExpiredLoginableAccounts(
    now: number = Date.now(),
): Promise<DisableExpiredResult> {
    initAdmin()
    const db = getFirestore()
    const auth = getAuth()

    // Only loginable accounts can hold a live browser session; non-loginable
    // ones are already disabled:true at mint, so the cron never touches them.
    const snap = await db
        .collection(MCP_TEST_USERS)
        .where("loginable", "==", true)
        .get()

    const failures: string[] = []
    let expired = 0
    let disabled = 0
    let revoked = 0
    for (const doc of snap.docs) {
        const ttl = doc.data().ttlExpiresAt
        const ttlMs = ttl instanceof Timestamp ? ttl.toMillis() : null
        if (ttlMs === null || ttlMs > now) continue // still within TTL
        expired++
        const uid = doc.id
        try {
            await auth.updateUser(uid, { disabled: true })
            disabled++
            // Kill outstanding Web SDK ID tokens — they expire within ≤1h and
            // cannot refresh once revoked.
            await auth.revokeRefreshTokens(uid)
            revoked++
        } catch (err) {
            failures.push(
                `${uid}: ${err instanceof Error ? err.message : String(err)}`,
            )
        }
    }

    breadcrumb("cleanup", {
        op: "disable_expired_loginable",
        scanned: snap.size,
        expired,
        disabled,
        revoked,
        failures: failures.length,
    })
    logger.info("[mcp-test-token] disable-expired-loginable", {
        scanned: snap.size,
        expired,
        disabled,
        revoked,
        failures: failures.length,
    })

    return { scanned: snap.size, expired, disabled, revoked, failures }
}

// ─── MCP tool registration ──────────────────────────────────────────────────

type AuthExtra = { authInfo?: { extra?: Record<string, unknown> } }

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    return uid
}

export const createTestAccountSchema = {
    role: TEST_ROLE.describe(
        "Role to provision: 'band_leader' | 'musician' | 'member'. 'admin' is not supported — use a real Firebase account.",
    ),
    soundEngineer: z
        .boolean()
        .optional()
        .describe(
            "Set the soundEngineer custom claim. Cross-cutting flag; can pair with any role.",
        ),
    label: z
        .string()
        .max(80)
        .optional()
        .describe(
            "Short free-text label to disambiguate multiple test users of the same role (e.g. 'cycle-2 marathon'). Embedded in displayName as '[TEST] {role} {label}'.",
        ),
    ttlSec: z
        .number()
        .int()
        .positive()
        .max(MAX_TTL_SEC)
        .optional()
        .describe(
            `Time-to-live in seconds (default ${DEFAULT_TTL_SEC}, max ${MAX_TTL_SEC} = 24h). Enforced by verifyBearer — calls reject after expiry. The Auth user + owned data persist until revoke_test_account / cleanup_all_test_data.`,
        ),
    uidPrefix: z
        .string()
        .min(1)
        .max(32)
        .regex(UID_PREFIX_RE)
        .optional()
        .describe(
            "Optional per-instance uid namespace. When set the minted uid is `test-<uidPrefix>-<role>-<8-hex>` instead of `test-<role>-<8-hex>`. Pair with cleanup_all_test_data({prefix}) so parallel cowork instances don't cascade-delete each other. Lowercase alphanumeric + single hyphens, 1-32 chars.",
        ),
    loginable: z
        .boolean()
        .optional()
        .describe(
            "Opt-in browser sign-in. When true, the account is provisioned ENABLED (disabled:false) and the result includes a one-time `loginUrl` — a 5-min, single-use custom-token link (`/test-login?code=…`) that signs a browser/harness in as this persona with real Firebase Web SDK auth + the normal app session cookie. Default (omitted) keeps disabled:true (UI cannot sign in; MCP-bearer path only). role='admin' is still refused. The loginUrl is shown ONCE.",
        ),
    orgIds: z
        .array(z.enum(Object.keys(ORGS) as [OrgId, ...OrgId[]]))
        .min(1)
        .optional()
        .describe(
            `Org memberships to provision (default ['${DEFAULT_ORG_ID}']). Set this to stress a specific tenant's role boundaries — e.g. ['brotherslazaroff'] for a BL-only test account, or ['crc','brotherslazaroff'] for a cross-tenant authoring account. Written to the user doc + Auth claims (orgIds); the bearer token's authoring org pins to orgIds[0]. Known orgs: ${Object.keys(ORGS).join(", ")}. Omit for a crc-only account (byte-equivalent to the prior behavior).`,
        ),
}

export function registerTestTokenTools(server: McpServer): void {
    server.registerTool(
        "create_test_account",
        {
            description:
                "Provision a headless Firebase Auth test user + matching MCP bearer token for autonomous role-boundary stress testing. The test uid is `test-<role>-<8-hex>` (or `test-<uidPrefix>-<role>-<8-hex>` when `uidPrefix` is set); the Auth user is created with `disabled: true` so the UI cannot sign them in (the MCP bearer path is unaffected). Returns `{uid, token, expiresAt, ...}`; the raw token is shown ONCE — store it, the hash is the only thing persisted. Admin + band_leader may call. role='admin' is REFUSED — use a real Firebase admin account for admin actions. **Bearer lifetime is the FLOOR of these three:** (1) `ttlSec` (default 4h, max 24h) — after expiry verifyBearer rejects via the `ttlExpiresAt in past` path; (2) explicit `revoke_test_account({uid})` — token doc is deleted immediately; (3) any `cleanup_all_test_data({prefix})` whose prefix matches this uid's `uidPrefix` — token doc is deleted as part of the cascade sweep. The advertised `expiresAt` is the (1) upper bound only, NOT a guaranteed minimum — a sibling tool call that sweeps the prefix will invalidate the bearer before its `expiresAt`. The minted token honors the standard rate limiter at the bearer's role tier (musician/member tokens are NOT bypass-listed). **`loginable: true`** additionally provisions the account ENABLED and returns a one-time `loginUrl` (a 5-min, single-use custom-token link at `/test-login?code=…`) so a browser/Playwright harness can sign in as this persona with real Firebase Web SDK auth + the normal app session — required for client-side data probes. Default (omitted) keeps `disabled:true` (no UI login). A loginable account's browser-session TTL is enforced out-of-band by the `disable-expired-test-accounts` cron (disable + refresh-token revoke).",
            inputSchema: createTestAccountSchema,
        },
        async (args, extra) => {
            const result = await provisionTestAccount(uidFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "list_test_accounts",
        {
            description:
                "List every test-namespaced user (uid prefix `test-`) with metadata (no secrets — token hash is never returned). Default-hides expired accounts; pass includeExpired: true to see them. Optional role filter. Admin + band_leader may call.",
            inputSchema: {
                role: TEST_ROLE.optional().describe("Filter by role"),
                includeExpired: z
                    .boolean()
                    .optional()
                    .describe(
                        "If true, also include accounts whose ttlExpiresAt is in the past. Default false.",
                    ),
            },
        },
        async (args, extra) => {
            const result = await listTestAccountsCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "revoke_test_account",
        {
            description:
                "Hard-delete one test account and CASCADE every piece of data the test user owned: setlists (+ their tracks), library_index uploads (+ best-effort Storage bytes), songs, proposal_stages, bond_flags, bond_corrections, scheduling_assignments, musician_availability, mcp tokens, the users/{uid} doc (with subcollections via recursiveDelete), and the Firebase Auth user. Refuses if uid is not `test-`-namespaced. Returns per-collection counts so you can audit the sweep.",
            inputSchema: {
                uid: z
                    .string()
                    .min(1)
                    .describe("Test uid to revoke. Must start with `test-`."),
            },
        },
        async (args, extra) => {
            const result = await revokeTestAccountCore(uidFrom(extra), args.uid)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "sweep_orphan_test_data",
        {
            description:
                "Cycle-7 Lane 1 / Convergence C — admin-only sweep for orphan setlists + setlistTemplates + library_index rows whose owner uid matches `isTestUid` (test-*, c<N>i<N>-*, cf<N>-*) AND whose owner user-record is already absent from `users/`. (setlists/templates key off `ownerId`; library_index off `uploadedBy`.) These rows survive `cleanup_all_test_data` cascades when the user-record was deleted out-of-band (failed mid-revoke, console-deleted, sibling-instance cleanup that didn't carry the prefix, etc.). v11.3-03 (run-1 §BUG-1) added library_index coverage — orphan library uploads are deleted with a best-effort Storage-bytes purge. Defaults `dryRun:true`; pass `dryRun:false, force:true` for real deletes (F-05 standing rule). Cascade includes dependent `tracks` for orphan setlists. Optional `uidPattern` substring narrows the sweep to one cycle/instance (e.g. 'c7i1'). Returns `{scanned, swept, orphans[]}`; orphans[] is capped at 500 with `orphansTruncated:true` past that.",
            inputSchema: {
                uidPattern: z
                    .string()
                    .min(1)
                    .max(32)
                    .regex(ORPHAN_PATTERN_RE)
                    .optional()
                    .describe(
                        "Optional substring to narrow the orphan sweep — only owner uids containing this substring are touched. Pass a cycle/instance label like 'c7i1' to scope to one namespace; omit to sweep every test-shape orphan.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "When true (default), returns the orphan list without writing. F-05 standing rule.",
                    ),
                force: z
                    .boolean()
                    .optional()
                    .describe(
                        "Required when `dryRun:false`. Real sweep without `force:true` returns the rich `force_required` envelope (REG-003: `{ok:false, error:{machine_code:'force_required'}}`) and no writes.",
                    ),
            },
        },
        async (args, extra) => {
            const result = await sweepOrphanTestDataCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )

    server.registerTool(
        "cleanup_all_test_data",
        {
            description:
                "Nuclear option — revoke every test-namespaced user in the project and cascade-delete their owned data. Walks the mcpTestUsers index AND Firebase Auth (for orphaned test-* users without an index doc, defense-in-depth). Returns per-collection aggregate counts + per-uid failures. Admin + band_leader only. Pass `prefix` to scope the sweep to one instance namespace — only uids starting with `test-<prefix>-` are touched, so parallel cowork instances don't cross-contaminate.",
            inputSchema: {
                prefix: z
                    .string()
                    .min(1)
                    .max(32)
                    .regex(UID_PREFIX_RE)
                    .optional()
                    .describe(
                        "Limit the sweep to uids starting with `test-<prefix>-`. Pass the same value used as `uidPrefix` at create_test_account time. Omit to sweep every test user in the project.",
                    ),
            },
        },
        async (args, extra) => {
            const result = await cleanupAllTestDataCore(uidFrom(extra), args)
            return jsonResult(result)
        },
    )
}

// ─── Followup integration points (NOT shipped in this PR) ───────────────────
// Listed here for the post-cycle1-followup integration PR. Each touches an
// existing handler in src/lib/mcp/tools/* so it's intentionally deferred per
// the test-tokens scope boundary (`.coord/shared/decisions.md` 2026-05-17).
//
// TODO(test-tokens-followup):
//   - publish_setlist: default-exclude test-* uids from recipient derivation
//     (src/lib/mcp/tools/setlist-publish.ts).
//   - list_setlists / search_library: default-hide setlists owned by test-*
//     uids unless `includeTestData: true` is passed.
//   - bond_corrections + library hygiene: skip test-* writes from analytics
//     so the learning signal isn't poisoned.
//   - audit alert: Sentry-warn when a test bearer writes to a setlist NOT
//     owned by a test uid (cross-contamination guardrail).
//   - admin UI surface to mint + revoke test tokens (currently MCP / HTTP
//     only).
// ────────────────────────────────────────────────────────────────────────────
