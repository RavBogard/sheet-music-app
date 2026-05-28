import * as Sentry from "@sentry/nextjs"
import { randomBytes } from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore, getAuth } from "@/lib/firebase-admin"
import { generateRawToken, hashToken } from "@/lib/mcp/tokens"
import { logger } from "@/lib/logger"

/**
 * Admin-test-session provisioning core (Daniel-ratified 2026-05-27,
 * decisions.md item 2 + 2026-05-28T00:10Z lane 2).
 *
 * Closes the `as('admin')` hole in the harness role-gate matrix WITHOUT
 * weakening the `create_test_account` `TEST_ROLE` priv-esc guard in
 * `test-tokens.ts` (which deliberately excludes `admin`). Instead, admin
 * test sessions come from a SEPARATE, secret-gated HTTP endpoint
 * (`/api/auth/admin-test-session`) — never an MCP tool callable by any
 * bearer. This module is the shared mint core that endpoint calls.
 *
 * Mints a fresh `test-admin-<8hex>` Firebase user per call, in the `test-`
 * namespace so `cleanup_all_test_data` / `revoke_test_account` sweep it:
 *   - custom claims `{ role: 'admin', admin_test: true }` — the `admin_test`
 *     flag (constraint 4) lets downstream REAL surfaces refuse the bearer if
 *     they choose (defense-in-depth: a leaked admin_test session should not
 *     be able to do destructive prod ops if a surface gates on the flag).
 *   - short TTL (default 1h, constraint 2) so a leak isn't persistent.
 *   - an audit row in `adminTestSessionAudit` (constraint 3): who/when/TTL.
 *   - a paired `crl_live_*` MCP bearer (ttlExpiresAt = now + TTL) so the
 *     harness `roleGate.as('admin')` can return a usable bearer.
 *
 * The SECRET gate (`MCP_ADMIN_TEST_SESSION_SECRET`, constraint 1) lives in
 * the route, not here — this core trusts its caller has already authorized.
 * Keep it that way: never export a path that mints without the gate.
 */

const MCP_TOKENS = "mcpTokens"
const MCP_TEST_USERS = "mcpTestUsers"
const USERS = "users"
const ADMIN_TEST_AUDIT = "adminTestSessionAudit"

const TEST_UID_PREFIX = "test-"
/** test-admin uids are still test-namespaced (sweepable) but carry an
 *  `admin` segment so they're greppable + distinct from role test users. */
const ADMIN_TEST_UID_PREFIX = "test-admin-"
const TEST_DISPLAY_PREFIX = "[TEST]"
const TEST_EMAIL_DOMAIN = "test.centralreform.live"

/** Admin test sessions are short-lived by design (constraint 2). */
export const ADMIN_TEST_DEFAULT_TTL_SEC = 60 * 60 // 1 hour
export const ADMIN_TEST_MAX_TTL_SEC = 2 * 60 * 60 // 2 hours hard cap

/** The custom-claim flag stamped on every admin-test user (constraint 4). */
export const ADMIN_TEST_CLAIM = "admin_test"

export interface ProvisionAdminTestSessionArgs {
    /** TTL in seconds; clamped to (0, ADMIN_TEST_MAX_TTL_SEC]. Default 1h. */
    ttlSec?: number
    /** Free-form provenance recorded in the audit row (e.g. caller IP). */
    callerContext?: string
    /** Optional label echoed into displayName + audit. */
    label?: string
}

export interface ProvisionAdminTestSessionResult {
    uid: string
    role: "admin"
    /** Raw MCP bearer — shown ONCE; only the hash is persisted. */
    token: string
    tokenId: string
    /** Firestore doc id of the audit row written for this mint. */
    auditId: string
    expiresAtMs: number
    expiresAt: string
    displayName: string
    /** Always `true` — mirrors the custom claim for the response body. */
    adminTest: true
}

function breadcrumb(data: Record<string, unknown>): void {
    try {
        Sentry.addBreadcrumb({
            category: "mcp:admin-test-session",
            level: "info",
            message: "mint",
            data,
            timestamp: Date.now() / 1000,
        })
    } catch {
        // Telemetry must never crash the caller.
    }
}

/**
 * Mint a fresh admin-test user + bearer + audit row. The Auth user is
 * created `disabled: true` (mirrors `provisionTestAccount`); the route
 * flips it to `disabled: false` for the Identity Toolkit exchange, the same
 * way `/api/auth/test-session` does. The session cookie itself is minted by
 * the route — this core stops at the durable Firestore + Auth state.
 *
 * @throws never returns an error envelope — it throws on Auth/Firestore
 *   failure so the route maps it to a 500. (Unlike `provisionTestAccount`,
 *   there's no caller-role envelope here: the secret gate already passed.)
 */
export async function provisionAdminTestSession(
    args: ProvisionAdminTestSessionArgs = {},
): Promise<ProvisionAdminTestSessionResult> {
    initAdmin()

    const ttlSec = clampTtl(args.ttlSec)
    const suffix = randomBytes(4).toString("hex")
    const uid = `${ADMIN_TEST_UID_PREFIX}${suffix}`
    const labelPart = args.label ? ` ${args.label}` : ""
    const displayName = `${TEST_DISPLAY_PREFIX} admin${labelPart}`
    const email = `${uid}@${TEST_EMAIL_DOMAIN}`

    const auth = getAuth()
    const db = getFirestore()
    const now = Date.now()
    const expiresAtMs = now + ttlSec * 1000

    // 1. Auth user, disabled:true (route flips for the exchange). The custom
    //    claims propagate into the exchanged idToken → session cookie, so the
    //    minted session carries role:admin + admin_test:true.
    try {
        await auth.createUser({ uid, displayName, email, disabled: true })
    } catch (err) {
        logger.error("[admin-test-session] createUser failed", { uid, err })
        throw new Error(
            `admin-test-session: Firebase Auth user creation failed: ${String(
                (err as Error)?.message ?? err,
            )}`,
        )
    }
    await auth.setCustomUserClaims(uid, {
        role: "admin",
        [ADMIN_TEST_CLAIM]: true,
    })

    // 2. users/{uid} doc — picked up by every gate that reads users/{uid}.
    //    isTestUser + ttlExpiresAt make it sweepable by cleanup_all_test_data.
    await db.collection(USERS).doc(uid).set({
        role: "admin",
        [ADMIN_TEST_CLAIM]: true,
        displayName,
        email,
        isTestUser: true,
        provisionedBy: "admin-test-session-endpoint",
        createdAt: FieldValue.serverTimestamp(),
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
    })

    // 3. MCP bearer — hashed-only persistence, raw shown ONCE. ttlExpiresAt
    //    enforced by verifyBearer (1h) so the bearer dies with the session.
    const rawToken = generateRawToken()
    const tokenRef = await db.collection(MCP_TOKENS).add({
        tokenHash: hashToken(rawToken),
        uid,
        label: `Admin test session${labelPart}`,
        kind: "admin_test",
        testUid: uid,
        [ADMIN_TEST_CLAIM]: true,
        provisionedBy: "admin-test-session-endpoint",
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
        createdAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
        revokedAt: null,
    })

    // 4. Discovery index — list_test_accounts + cleanup walk this.
    await db.collection(MCP_TEST_USERS).doc(uid).set({
        uid,
        role: "admin",
        [ADMIN_TEST_CLAIM]: true,
        label: args.label ?? null,
        displayName,
        mcpTokenId: tokenRef.id,
        provisionedBy: "admin-test-session-endpoint",
        createdAt: FieldValue.serverTimestamp(),
        ttlExpiresAt: Timestamp.fromMillis(expiresAtMs),
        revokedAt: null,
    })

    // 5. Audit row (constraint 3) — every mint is recorded who/when/TTL,
    //    in a dedicated collection so a security review can enumerate every
    //    admin-test session ever minted independent of the user/token docs.
    const auditRef = await db.collection(ADMIN_TEST_AUDIT).add({
        uid,
        tokenId: tokenRef.id,
        ttlSec,
        expiresAt: Timestamp.fromMillis(expiresAtMs),
        callerContext: args.callerContext ?? null,
        label: args.label ?? null,
        mintedAt: FieldValue.serverTimestamp(),
    })

    breadcrumb({ uid, ttlSec, callerContext: args.callerContext ?? null })
    logger.info("[admin-test-session] minted", {
        uid,
        tokenId: tokenRef.id,
        auditId: auditRef.id,
        ttlSec,
    })

    return {
        uid,
        role: "admin",
        token: rawToken,
        tokenId: tokenRef.id,
        auditId: auditRef.id,
        expiresAtMs,
        expiresAt: new Date(expiresAtMs).toISOString(),
        displayName,
        adminTest: true,
    }
}

/** Clamp a requested TTL into (0, MAX]; fall back to the 1h default. */
export function clampTtl(requested: number | undefined): number {
    if (requested == null || !Number.isFinite(requested) || requested <= 0) {
        return ADMIN_TEST_DEFAULT_TTL_SEC
    }
    return Math.min(Math.floor(requested), ADMIN_TEST_MAX_TTL_SEC)
}

/** True iff a uid is in the admin-test namespace. */
export function isAdminTestUid(uid: string): boolean {
    return uid.startsWith(ADMIN_TEST_UID_PREFIX)
}

/** True iff a uid is in the broader test namespace (sweepable). */
export function isTestUid(uid: string): boolean {
    return uid.startsWith(TEST_UID_PREFIX)
}
