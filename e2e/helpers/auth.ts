import type { BrowserContext, APIRequestContext, Page } from '@playwright/test'

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
): Promise<{
    uid: string
    role: string | null
    /** META-003 server half: a fresh bearer-equivalent Firebase customToken
     *  for `signInWithCustomToken` client-side. Bearer-sensitive — never log
     *  or write to a tracked file. Pass straight into `signInWebSdk`. */
    customToken: string | null
    customTokenExpiresInSec?: number
}> {
    const res = await context.request.post(`${baseURL}/api/auth/test-session`, {
        headers: { Authorization: `Bearer ${testBearer}` },
    })
    if (!res.ok()) {
        const body = await res.text().catch(() => '')
        throw new Error(
            `loginAsTestUser failed: ${res.status()} ${res.statusText()}\n${body.slice(0, 400)}`,
        )
    }
    const data = (await res.json()) as {
        uid: string
        role: string | null
        customToken?: string | null
        customTokenExpiresInSec?: number
    }
    return {
        uid: data.uid,
        role: data.role,
        customToken: data.customToken ?? null,
        customTokenExpiresInSec: data.customTokenExpiresInSec,
    }
}

/**
 * META-003 CLIENT half — populate the browser's Firebase Web SDK so
 * `auth.currentUser` is non-null (the `__session` cookie alone only authes
 * the *server*; client-listener-driven UI reads `auth.currentUser`).
 *
 * Mechanism (Option A — zero new prod surface): the app's own
 * `src/lib/firebase.ts` exposes `window.__c7_auth_for_probes__ = { auth,
 * signIn }` when built with `NEXT_PUBLIC_PROBE_HARNESS_AUTH==='1'` (the
 * cycle-7 Lane-4 probe bridge). `signIn(token)` runs the exact
 * `signInWithCustomToken(auth, token)` call `QRSignIn.tsx` uses, so the
 * Web SDK session lands on the *same* default-app `auth` the app's
 * components read.
 *
 * **The `page` MUST already be on an app route that loaded `@/lib/firebase`**
 * (e.g. after a `page.goto('/perform/...')`) — the bridge is installed at
 * that module's load time.
 *
 * `NEXT_PUBLIC_*` is build-time-inlined, so against a prod build WITHOUT the
 * flag the bridge is dead code and absent. Behaviour then depends on
 * `opts.required`:
 *   - `required: true` (default) → throw a clear, token-free error.
 *   - `required: false` → resolve `{ signedIn: false }` so a caller can
 *     down-grade to cookie-only assertions.
 *
 * Security: the customToken is bearer-equivalent. It is passed into
 * `page.evaluate` as an argument (not a URL, not a log) and is never echoed
 * in any thrown message.
 */
export async function signInWebSdk(
    page: Page,
    customToken: string,
    opts: { required?: boolean; timeoutMs?: number } = {},
): Promise<{ signedIn: boolean; uid: string | null }> {
    const required = opts.required ?? true
    const timeout = opts.timeoutMs ?? 15_000

    if (!customToken) {
        if (required) {
            throw new Error(
                'signInWebSdk: no customToken supplied. The test-session route returns ' +
                    '`customToken` (META-003 server half) — confirm loginAsTestUser captured it.',
            )
        }
        return { signedIn: false, uid: null }
    }

    // Wait for the in-bundle probe bridge. Absent ⇒ the deployed build was
    // not compiled with NEXT_PUBLIC_PROBE_HARNESS_AUTH=1.
    const bridgeReady = await page
        .waitForFunction(
            () =>
                typeof (window as unknown as { __c7_auth_for_probes__?: unknown })
                    .__c7_auth_for_probes__ !== 'undefined',
            null,
            { timeout },
        )
        .then(() => true)
        .catch(() => false)

    if (!bridgeReady) {
        const msg =
            'signInWebSdk: window.__c7_auth_for_probes__ not present — the target build ' +
            'lacks NEXT_PUBLIC_PROBE_HARNESS_AUTH=1 (the cycle-7 probe bridge is build-time ' +
            'gated and dead-code-eliminated when the flag is off). Set the flag on the target ' +
            'deployment (or run against a local build with it set) to drive Web-SDK sign-in.'
        if (required) throw new Error(msg)
        // eslint-disable-next-line no-console
        console.warn(`[auth] ${msg} — continuing cookie-only (required:false).`)
        return { signedIn: false, uid: null }
    }

    // Drive the sign-in through the app's own auth instance. Token passed as
    // an evaluate arg — never logged, never in a URL.
    await page.evaluate(async (token) => {
        const bridge = (
            window as unknown as {
                __c7_auth_for_probes__: { signIn: (t: string) => Promise<unknown> }
            }
        ).__c7_auth_for_probes__
        await bridge.signIn(token)
    }, customToken)

    // Acceptance bar: auth.currentUser must be non-null.
    await page.waitForFunction(
        () =>
            !!(
                window as unknown as {
                    __c7_auth_for_probes__?: { auth?: { currentUser?: { uid?: string } | null } }
                }
            ).__c7_auth_for_probes__?.auth?.currentUser,
        null,
        { timeout },
    )

    const uid = await page.evaluate(
        () =>
            (
                window as unknown as {
                    __c7_auth_for_probes__?: { auth?: { currentUser?: { uid?: string } | null } }
                }
            ).__c7_auth_for_probes__?.auth?.currentUser?.uid ?? null,
    )

    return { signedIn: true, uid }
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
