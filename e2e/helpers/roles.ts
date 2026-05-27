import { test as base, type BrowserContext, type Page } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './auth'

/**
 * Role-gate fixture + sign-in convenience for the e2e suite (DESIGN §D3).
 *
 * Formalizes the ad-hoc "mint a role → set its session cookie → wake the Web
 * SDK" sequence that `live-director-gesture.spec.ts` (and the offline specs)
 * open-code. Any spec that imports `test` from here gets a `roleGate` fixture
 * so a role-gated probe is one line:
 *
 *   import { test, expect } from './helpers/roles'
 *   test('musician cannot see admin surface', async ({ roleGate, page }) => {
 *       await roleGate.gotoAs('musician', '/manage/library-review')
 *       expect(new URL(page.url()).pathname).toBe('/manage')
 *   })
 *
 * Every account `roleGate` mints is tracked and cascade-revoked (by uid, NOT
 * `cleanup_all_test_data`) on fixture teardown — parallel-sweep-isolation-safe
 * per [[feedback_sandbox_test_isolation]].
 *
 * `admin` is intentionally NOT a `TestRole`. `create_test_account`'s `TEST_ROLE`
 * enum (`src/lib/mcp/tools/test-tokens.ts`) deliberately excludes `admin` as a
 * privilege-escalation guard — there is no path from a test bearer to a
 * `test-admin-*` uid. Specs needing an admin browser session remain blocked on
 * the QUESTION filed in `library-review-flow.spec.ts` (extend test-tokens behind
 * a stronger gate, or add a one-shot admin-test-session surface).
 */
export type TestRole = 'band_leader' | 'musician' | 'member'

export interface RoleSession {
    uid: string
    /** Role echoed by the test-session route (falls back to the requested role). */
    role: string
    /** The minted MCP bearer for this account — for direct MCP calls if needed. */
    bearer: string
    /** META-003 customToken for `signInWebSdk`; null if the route returned none. */
    customToken: string | null
}

type WebSdkMode = 'required' | 'optional' | false

export interface RoleGate {
    /** The admin/band_leader bearer the fixture mints with (`MCP_BEARER`); '' if unset. */
    readonly adminBearer: string
    /**
     * Mint a fresh `test-<role>-*` account, set its `__session` cookie on the
     * browser context, and return the session (incl. customToken). Does NOT
     * navigate or wake the Web SDK — pair with `signInWebSdk` after a `goto`,
     * or use {@link RoleGate.gotoAs}.
     */
    as(role: TestRole, opts?: { label?: string; ttlSec?: number }): Promise<RoleSession>
    /**
     * `as(role)` → `page.goto(path)` → `signInWebSdk`. `webSdk` defaults to
     * `'required'`; pass `'optional'` to degrade to cookie-only when the target
     * build lacks `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1`, or `false` to skip it.
     */
    gotoAs(
        role: TestRole,
        path: string,
        opts?: { webSdk?: WebSdkMode; label?: string; ttlSec?: number },
    ): Promise<RoleSession>
}

/**
 * Stateless convenience (no fixture required): log in an EXISTING test bearer,
 * navigate, and optionally wake the Web SDK. This is the exact three-line
 * sequence `live-director-gesture` + the offline specs repeat per test, hoisted
 * so behavior is identical and defined once.
 */
export async function signInAndGoto(
    context: BrowserContext,
    page: Page,
    baseURL: string,
    bearer: string,
    path: string,
    opts: { webSdk?: WebSdkMode } = {},
): Promise<RoleSession> {
    const session = await loginAsTestUser(context, baseURL, bearer)
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    const mode = opts.webSdk ?? 'required'
    if (mode !== false) {
        await signInWebSdk(page, session.customToken ?? '', { required: mode === 'required' })
    }
    return { uid: session.uid, role: session.role ?? '', bearer, customToken: session.customToken }
}

export const test = base.extend<{ roleGate: RoleGate }>({
    roleGate: async ({ context, page, request, baseURL }, use) => {
        const adminBearer = process.env.MCP_BEARER ?? ''
        const createdUids: string[] = []

        const as: RoleGate['as'] = async (role, opts = {}) => {
            if (!baseURL) throw new Error('roleGate.as: PLAYWRIGHT_BASE_URL must be set')
            if (!adminBearer) {
                throw new Error(
                    'roleGate.as: MCP_BEARER (admin/band_leader bearer) required to mint a test account',
                )
            }
            const acct = await mintTestAccount(request, baseURL, adminBearer, {
                role,
                label: opts.label ?? `role-gate ${role} ${new Date().toISOString()}`,
                ttlSec: opts.ttlSec,
            })
            createdUids.push(acct.uid)
            const session = await loginAsTestUser(context, baseURL, acct.token)
            return {
                uid: session.uid,
                role: session.role ?? role,
                bearer: acct.token,
                customToken: session.customToken,
            }
        }

        const gotoAs: RoleGate['gotoAs'] = async (role, path, opts = {}) => {
            const session = await as(role, { label: opts.label, ttlSec: opts.ttlSec })
            await page.goto(path, { waitUntil: 'domcontentloaded' })
            const mode = opts.webSdk ?? 'required'
            if (mode !== false) {
                await signInWebSdk(page, session.customToken ?? '', { required: mode === 'required' })
            }
            return session
        }

        // `use` here is Playwright's fixture-provider callback, not a React hook.
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use({ adminBearer, as, gotoAs })

        // Teardown: cascade-revoke every account this fixture minted (by uid).
        if (baseURL && adminBearer && createdUids.length > 0) {
            await revokeTestAccounts(request, baseURL, adminBearer, createdUids)
        }
    },
})

export { expect } from '@playwright/test'
