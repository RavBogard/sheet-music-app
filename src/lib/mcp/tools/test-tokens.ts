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
 * - `create_test_account({role, soundEngineer?, label?, ttlSec?})`
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
const TEST_UID_PREFIX = "test-"
const TEST_DISPLAY_PREFIX = "[TEST]"
const TEST_EMAIL_DOMAIN = "test.centralreform.live"

const DEFAULT_TTL_SEC = 4 * 60 * 60 // 4 hours
const MAX_TTL_SEC = 24 * 60 * 60 // 24 hours

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
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
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
}

export interface CreateTestAccountResult {
    uid: string
    role: TestRole
    soundEngineer: boolean
    token: string
    tokenId: string
    expiresAt: string
    displayName: string
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
            "forbidden",
            "create_test_account requires admin or band_leader role.",
            { callerRole: callerRole ?? null },
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

    const suffix = randomBytes(4).toString("hex")
    const uid = `${TEST_UID_PREFIX}${args.role}-${suffix}`
    const labelPart = args.label ? ` ${args.label}` : ""
    const displayName = `${TEST_DISPLAY_PREFIX} ${args.role}${labelPart}`
    const email = `${uid}@${TEST_EMAIL_DOMAIN}`
    const soundEngineer = args.soundEngineer === true

    const auth = getAuth()
    const db = getFirestore()
    const now = Date.now()
    const expiresAtMs = now + ttlSec * 1000

    // 1. Create Firebase Auth user, `disabled: true` so the UI can never
    // sign them in. Custom claims propagate through firestore.rules + the
    // request-handlers that read decoded.role.
    try {
        await auth.createUser({
            uid,
            displayName,
            email,
            disabled: true,
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
    })

    // 2. Firestore user doc — picked up by every gate that reads users/{uid}.
    await db.collection(USERS).doc(uid).set({
        role: args.role,
        soundEngineer,
        displayName,
        email,
        isTestUser: true,
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
        label: args.label ?? null,
        displayName,
        mcpTokenId: tokenRef.id,
        provisionedBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
        revokedAt: null,
    })

    breadcrumb("mint", {
        uid,
        role: args.role,
        soundEngineer,
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
            "forbidden",
            "list_test_accounts requires admin or band_leader role.",
            { callerRole: callerRole ?? null },
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
 */
const CASCADE_FIELDS: Array<{ collection: string; field: string; storage?: boolean }> = [
    { collection: "library_index", field: "uploadedBy", storage: true },
    { collection: "songs", field: "uploader" },
    { collection: "proposal_stages", field: "createdBy" },
    { collection: "bond_flags", field: "flaggedBy" },
    { collection: "bond_corrections", field: "correctedBy" },
    { collection: "scheduling_assignments", field: "musicianUid" },
    { collection: "musician_availability", field: "musicianUid" },
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

export async function revokeTestAccountCore(
    callerUid: string,
    uid: string,
): Promise<RevokeTestAccountResult | ReturnType<typeof envelope>> {
    initAdmin()
    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        return envelope(
            "forbidden",
            "revoke_test_account requires admin or band_leader role.",
            { callerRole: callerRole ?? null },
        )
    }
    if (!uid || !uid.startsWith(TEST_UID_PREFIX)) {
        return envelope(
            "not_a_test_uid",
            `uid must start with '${TEST_UID_PREFIX}'. Refusing to operate on a non-test identity.`,
            { uid },
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
            mcpTokens: cascaded.mcpTokens ?? 0,
            storageDeleted: storage.deleted,
            storageFailed: storage.failed,
        },
        authDeleted,
    }
}

// ─── Cleanup all ─────────────────────────────────────────────────────────────

export interface CleanupAllResult {
    removed: number
    failures: string[]
    aggregate: Record<string, number>
}

export async function cleanupAllTestDataCore(
    callerUid: string,
): Promise<CleanupAllResult | ReturnType<typeof envelope>> {
    initAdmin()
    const { isTrustedLeader, role: callerRole } = await loadCallerRole(callerUid)
    if (!isTrustedLeader) {
        return envelope(
            "forbidden",
            "cleanup_all_test_data requires admin or band_leader role.",
            { callerRole: callerRole ?? null },
        )
    }

    const db = getFirestore()
    // Walk the index AND any orphaned Auth users (defense-in-depth: if a
    // revoke partially failed and left an Auth user without an index doc,
    // we still sweep it).
    const indexSnap = await db.collection(MCP_TEST_USERS).get()
    const indexUids = new Set(indexSnap.docs.map((d) => d.id))

    // Walk Auth pages for test-* uids. listUsers is paginated; we'll cap
    // at a reasonable depth to avoid pathological loops.
    const auth = getAuth()
    let pageToken: string | undefined
    const orphanAuthUids: string[] = []
    for (let i = 0; i < 20; i++) {
        const result = await auth.listUsers(1000, pageToken)
        for (const u of result.users) {
            if (u.uid.startsWith(TEST_UID_PREFIX) && !indexUids.has(u.uid)) {
                orphanAuthUids.push(u.uid)
            }
        }
        if (!result.pageToken) break
        pageToken = result.pageToken
    }

    const allUids = [...indexUids, ...orphanAuthUids]
    const aggregate: Record<string, number> = {}
    const failures: string[] = []
    let removed = 0
    for (const uid of allUids) {
        const r = await revokeTestAccountCore(callerUid, uid)
        if ("error" in r) {
            failures.push(`${uid}: ${r.error}`)
            continue
        }
        removed++
        for (const [k, v] of Object.entries(r.cascaded)) {
            aggregate[k] = (aggregate[k] ?? 0) + (v as number)
        }
    }

    breadcrumb("cleanup", { callerUid, removed, failures: failures.length, aggregate })
    return { removed, failures, aggregate }
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
}

export function registerTestTokenTools(server: McpServer): void {
    server.registerTool(
        "create_test_account",
        {
            description:
                "Provision a headless Firebase Auth test user + matching MCP bearer token for autonomous role-boundary stress testing. The test uid is `test-<role>-<8-hex>`; the Auth user is created with `disabled: true` so the UI cannot sign them in (the MCP bearer path is unaffected). Returns `{uid, token, expiresAt, ...}`; the raw token is shown ONCE — store it, the hash is the only thing persisted. Admin + band_leader may call. role='admin' is REFUSED — use a real Firebase admin account for admin actions. ttlSec defaults to 4 hours (max 24h); after expiry verifyBearer rejects the token automatically, but the backing Auth user + owned data persist until revoke_test_account / cleanup_all_test_data. The minted token honors the standard rate limiter at the bearer's role tier (musician/member tokens are NOT bypass-listed).",
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
        "cleanup_all_test_data",
        {
            description:
                "Nuclear option — revoke every test-namespaced user in the project and cascade-delete their owned data. Walks the mcpTestUsers index AND Firebase Auth (for orphaned test-* users without an index doc, defense-in-depth). Returns per-collection aggregate counts + per-uid failures. Admin + band_leader only.",
            inputSchema: {},
        },
        async (_args, extra) => {
            const result = await cleanupAllTestDataCore(uidFrom(extra))
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
