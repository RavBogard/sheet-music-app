import { test, expect } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, revokeTestAccounts } from './helpers/auth'

/**
 * b7 — /manage/library-review access-gating UAT.
 *
 * Coverage of a4-library-review-ui's server-component admin gate at
 * `src/app/(main)/manage/library-review/page.tsx`. The page calls
 * `getServerUser()` and dispatches one of three terminal states:
 *
 *   - unauthenticated (no `__session` cookie)  → redirect /login?next=…
 *   - authenticated && !isAdmin                → redirect /manage
 *   - authenticated && isAdmin                 → render <LibraryReviewClient>
 *
 * This spec verifies the first two via test-session cookies for fresh
 * `test-band_leader-*` and `test-musician-*` users, plus the unauth
 * baseline. After redirect, we assert the destination URL and that the
 * destination page actually rendered (not just a 30x in flight).
 *
 * ─── What this spec INTENTIONALLY does NOT cover (and why) ─────────────────
 *
 * The msg-001 scope also called for:
 *   - admin user → reaches /manage/library-review, sees Tabs + first row focused
 *   - keyboard flow on AI Review tab (j/k, 1/2/3, /, Esc, Enter, a/r/e, y/n)
 *   - calibration banner reflects autoApplyEnabled + GEMINI_API_KEY state
 *
 * Each of those requires an admin browser session AND a populated review
 * queue. The current test-identity surface has four structural blockers
 * that make none of them verifiable from Playwright today:
 *
 *   1. `src/lib/mcp/tools/test-tokens.ts:53` (TEST_ROLE enum) excludes
 *      `admin` by design — a privilege-escalation guard. There is no path
 *      from `create_test_account` to a `test-admin-*` uid.
 *   2. `/api/auth/test-session` accepts only `test-*` prefixed uids.
 *      Daniel's real admin uid can't mint a session cookie through it,
 *      and no path elevates a test user to admin role.
 *   3. `apiFetch` (`src/lib/api-client.ts:25`) — the wrapper every
 *      LibraryReviewClient action handler uses — reads
 *      `auth.currentUser.getIdToken()` from the Firebase JS SDK.
 *      The test-session cookie only authenticates server-side routes via
 *      `getServerUser()`; the Firebase client SDK in a Playwright session
 *      stays signed-out. Even if an admin reached the page, every
 *      accept/reject/edit/retry/dismiss call would 401.
 *   4. `enrichmentStatus:'review_pending'` rows can only be created by
 *      (a) a real Gemini API run via the post-import subscriber, or
 *      (b) Admin SDK writes from the server. Playwright has neither.
 *
 * QUESTION msg-b7-001 was filed in `inbox/supervisor.md` proposing
 * follow-up paths (extend test-tokens to admin role behind a stronger
 * gate, or add a test-only seed surface that mints a `review_pending`
 * row + a one-shot admin-test-session cookie). Until that lands, this
 * spec is the realistic regression net for the access-gating semantic.
 *
 * ─── Cosmetic mismatch flagged for follow-up ───────────────────────────────
 *
 * Per master-tip @ `a31fed312` (a3-gemini-swap), the AI enrichment
 * provider is now Gemini, gated on `GEMINI_API_KEY`. a4's calibration
 * banner copy in `LibraryReviewClient.tsx:470-479` still references
 * `ANTHROPIC_API_KEY` verbatim (and the underlying read at
 * `review-queue.ts:313` checks `process.env.ANTHROPIC_API_KEY`). This is
 * a cosmetic post-swap drift — behavior is unaffected — and was already
 * noted in a3-gemini-swap's open-followups list on master-tip. This
 * spec does NOT assert banner copy (no admin access) and does NOT edit
 * `LibraryReviewClient.tsx` (a4's READ-ONLY lane).
 *
 * ─── Run ───────────────────────────────────────────────────────────────────
 *
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \   # admin or band_leader bearer
 *   npx playwright test e2e/library-review-flow.spec.ts --project=chromium
 *
 * Skips automatically when `MCP_BEARER` is unset (mirrors b6 discipline).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('b7 — /manage/library-review access gating', () => {
    test.skip(
        !MCP_BEARER,
        'b7 library-review-flow needs MCP_BEARER env var (admin or band_leader bearer) to mint test-band_leader + test-musician fixtures. Skipped without it.',
    )

    let bandLeaderBearer = ''
    let musicianBearer = ''
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for b7 UAT')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'b7-library-review-leader',
        })
        bandLeaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'b7-library-review-musician',
        })
        musicianBearer = musician.token
        createdUids.push(musician.uid)
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('unauthenticated visitor is redirected to /login with next= preserved', async ({ browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        // Fresh context — no cookies, no Firebase client auth.
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        try {
            await page.goto('/manage/library-review', {
                waitUntil: 'domcontentloaded',
            })
            // page.url() reflects the final URL after server-side
            // redirect(). next.js redirect() to /login?next=/manage/library-review
            // is what page.tsx:22 emits when getServerUser() returns null.
            const url = new URL(page.url())
            expect(url.pathname, 'unauth must land on /login').toBe('/login')
            expect(
                url.searchParams.get('next'),
                'redirect must preserve the next= return target so /login can bounce back after sign-in',
            ).toBe('/manage/library-review')
        } finally {
            await ctx.close()
        }
    })

    test('band_leader is redirected to /manage (admin-only surface)', async ({ browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        try {
            const session = await loginAsTestUser(ctx, baseURL, bandLeaderBearer)
            expect(session.role, 'test-band_leader session must echo band_leader role').toBe('band_leader')

            await page.goto('/manage/library-review', {
                waitUntil: 'domcontentloaded',
            })
            const url = new URL(page.url())
            expect(
                url.pathname,
                'band_leader is gated by isAdmin (page.tsx:24-27); must land on /manage',
            ).toBe('/manage')
            // Make sure the /manage page actually rendered — guards against
            // a stuck 30x loop or an unrelated error page that happens to
            // carry `/manage` in its URL.
            await expect(
                page.locator('body'),
                '/manage destination page must render after the redirect',
            ).toBeVisible({ timeout: 10_000 })
            // Critical: must NOT have rendered any LibraryReviewClient
            // surface text — that would mean the gate let it through.
            await expect(
                page.getByRole('heading', { name: 'Library Review' }),
                'band_leader must not see the Library Review surface',
            ).toHaveCount(0)
        } finally {
            await ctx.close()
        }
    })

    test('musician is redirected to /manage (admin-only surface)', async ({ browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        try {
            const session = await loginAsTestUser(ctx, baseURL, musicianBearer)
            expect(session.role, 'test-musician session must echo musician role').toBe('musician')

            await page.goto('/manage/library-review', {
                waitUntil: 'domcontentloaded',
            })
            const url = new URL(page.url())
            expect(
                url.pathname,
                'musician (no admin claim) must land on /manage — rules out role-confusion regressions where a non-leader path lets the page through',
            ).toBe('/manage')
            await expect(
                page.getByRole('heading', { name: 'Library Review' }),
                'musician must not see the Library Review surface',
            ).toHaveCount(0)
        } finally {
            await ctx.close()
        }
    })
})
