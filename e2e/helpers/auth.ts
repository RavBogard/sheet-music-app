import type { BrowserContext, APIRequestContext } from '@playwright/test'

import { mcpCallOrThrow } from './mcp'

/**
 * Test-identity provisioning + cookie-mint helpers.
 *
 * The flow:
 *   1. `mintTestAccount` — admin bearer calls MCP `create_test_account`
 *      to provision a headless `test-<role>-<8hex>` Firebase user and a
 *      paired `crl_live_*` MCP bearer. Auth user is created `disabled:true`
 *      so the UI can't sign them in; the MCP bearer path is unaffected.
 *   2. `loginAsTestUser` — POST `/api/auth/test-session` with the test
 *      bearer; the route mints a Firebase session cookie scoped to the
 *      test uid (the only uid namespace it accepts). Cookie lands on the
 *      BrowserContext via `request.post`'s shared cookie jar, so the next
 *      `page.goto` inside the same context carries `__session`.
 *   3. `revokeTestAccount` — cleanup; cascades every owned doc + Storage
 *      object + Auth user via MCP `revoke_test_account`. Mirrors the
 *      `cleanup_all_test_data` pattern.
 *
 * The admin bearer is supplied via `MCP_BEARER` env var (same env var
 * `f023-live-rename.spec.ts` already uses). The bearer must resolve to
 * an admin or band_leader uid — `create_test_account` refuses otherwise.
 */

export interface MintedTestAccount {
    uid: string
    role: 'band_leader' | 'musician' | 'member'
    /** Raw bearer — shown ONCE. Store it; the hash is the only thing
     *  persisted server-side. */
    token: string
    expiresAt: string
}

export async function mintTestAccount(
    request: APIRequestContext,
    baseURL: string,
    adminBearer: string,
    args: {
        role: MintedTestAccount['role']
        label?: string
        /** Default 4h; clamp ≤ 24h. */
        ttlSec?: number
    },
): Promise<MintedTestAccount> {
    const result = await mcpCallOrThrow<{
        uid: string
        role: MintedTestAccount['role']
        token: string
        expiresAt: string
    }>(request, baseURL, adminBearer, 'create_test_account', {
        role: args.role,
        label: args.label ?? `b6-uat ${new Date().toISOString()}`,
        ttlSec: args.ttlSec ?? 60 * 60, // 1h — UAT runs fast
    })
    return {
        uid: result.uid,
        role: result.role,
        token: result.token,
        expiresAt: result.expiresAt,
    }
}

/**
 * POST /api/auth/test-session with the test user's own bearer. The route
 * verifies the bearer, asserts the resolved uid is `test-`-prefixed, and
 * sets `__session` (Firebase session cookie) + `__session_role` (signed
 * role companion) on the response. Playwright's `request.post` shares the
 * cookie jar with the BrowserContext, so `page.goto` after this call is
 * authenticated as the test user.
 */
export async function loginAsTestUser(
    context: BrowserContext,
    baseURL: string,
    testBearer: string,
): Promise<{ uid: string; role: string | null }> {
    const res = await context.request.post(`${baseURL}/api/auth/test-session`, {
        headers: { Authorization: `Bearer ${testBearer}` },
    })
    if (!res.ok()) {
        const body = await res.text().catch(() => '')
        throw new Error(
            `loginAsTestUser failed: ${res.status()} ${res.statusText()}\n${body.slice(0, 400)}`,
        )
    }
    const data = (await res.json()) as { uid: string; role: string | null }
    return data
}

/**
 * Revoke a single test account + cascade-delete every doc/Storage/Auth
 * record it owned. Returns silently on `not_a_test_uid` (defense against
 * mis-cleanups). The admin bearer is required because the test user's
 * own bearer is also revoked by the cascade — using the caller's own
 * bearer for revoke works (cleanup_all_test_data is hardened for it),
 * but for the per-test cleanup the admin path is simpler.
 */
export async function revokeTestAccount(
    request: APIRequestContext,
    baseURL: string,
    adminBearer: string,
    uid: string,
): Promise<void> {
    if (!uid.startsWith('test-')) return
    try {
        await mcpCallOrThrow(request, baseURL, adminBearer, 'revoke_test_account', { uid })
    } catch (err) {
        // Best-effort: if the account already expired or was swept by
        // cleanup_all_test_data, don't fail the test suite teardown.
        // eslint-disable-next-line no-console
        console.warn(`[auth] revoke_test_account(${uid}) failed:`, err)
    }
}

/** Batch revoke for `afterAll` paths. */
export async function revokeTestAccounts(
    request: APIRequestContext,
    baseURL: string,
    adminBearer: string,
    uids: string[],
): Promise<void> {
    for (const uid of uids) await revokeTestAccount(request, baseURL, adminBearer, uid)
}
