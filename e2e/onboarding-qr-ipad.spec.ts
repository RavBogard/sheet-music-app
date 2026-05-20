import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'

/**
 * ipad-sweep-onboarding — shared-device QR sign-in on the band's real iPads.
 *
 * The band signs into 6 shared 11" iPads via the QR flow: the iPad shows a QR
 * code → a musician scans it on their phone → the phone (signed in) approves →
 * the iPad signs in as that user via `signInWithCustomToken`. This is *literally*
 * how onboarding happens, and it had never been driven at the real iPad WebKit
 * profile.
 *
 * This spec runs ONLY under the `ipad-webkit` project(s) (`playwright.config.ts`,
 * 820×1180 portrait + 1180×820 landscape, WebKit engine) so portrait AND
 * landscape are both covered automatically (probe point #7). It builds on the
 * `e2e/helpers/auth.ts` harness coder-5 shipped at `9a6e6453c`.
 *
 * The QR surfaces under test (we TEST them, never edit them):
 *   - `src/components/auth/QRSignIn.tsx`     — the QR *display* (iPad side)
 *   - `src/app/qr/[code]/page.tsx`           — the *approve* page (phone side)
 *   - `src/app/api/auth/qr/route.ts`         — POST create / GET poll / PUT approve
 *
 * Two describe blocks:
 *   1. "no-auth surface probes" — reachability + negative-auth + lifecycle.
 *      Needs NO bearer; runs against any deployed origin.
 *   2. "minted-approver cycle"  — full POST→approve→sign-in cycle + role gate.
 *      Skips unless MCP_BEARER (admin/band_leader) is set.
 *
 * Run (against prod):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...            # admin or band_leader (cycle 2 only) \
 *   npx playwright test e2e/onboarding-qr-ipad.spec.ts --project=ipad-webkit
 *
 * (`npx playwright install webkit` once if the WebKit binary is missing.)
 *
 * ISOLATION (mandatory, per feedback_sandbox_test_isolation): every minted uid
 * is tracked and cascade-revoked by id in afterAll. NEVER cleanup_all_test_data.
 * QR sessions self-consume on approved-GET or expire after 5 min; no DELETE API
 * exists for arbitrary pending sessions, so a few short-lived pending docs may
 * linger ≤5 min (harmless, documented in FINDINGS).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

/** iOS Human Interface Guidelines minimum touch-target edge. */
const TAP_TARGET_MIN = 44

/** Generate a server-accepted 6-char [A-Z0-9] QR code. */
function genCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let c = ''
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]
    return c
}

/** Skip any test that isn't running under an ipad-webkit project. Called from
 *  an inline `({}, testInfo) => ipadOnly(testInfo)` so Playwright infers the
 *  fixtures type for `{}` (typing the param `unknown` here triggers TS2571). */
function ipadOnly(testInfo: TestInfo) {
    test.skip(
        !testInfo.project.name.startsWith('ipad-webkit'),
        `runs only under the ipad-webkit project(s); current project: ${testInfo.project.name}`,
    )
}

/** Assert the document has no horizontal overflow at the current viewport. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
    const o = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    expect(
        o.scrollWidth,
        `${label}: horizontal overflow — scrollWidth ${o.scrollWidth} > clientWidth ${o.clientWidth}`,
    ).toBeLessThanOrEqual(o.clientWidth + 1)
}

/**
 * Sign a minted test user into a fresh context's Web SDK and return a Firebase
 * ID token (carrying the role custom claim that `create_test_account` set via
 * `setCustomUserClaims`). This is what the QR PUT `verifyIdToken` consumes — the
 * phone-side approver presents an *ID token*, NOT an MCP `crl_live_*` bearer.
 *
 * `getIdToken(true)` force-refreshes so the latest custom claims are embedded.
 * The token is bearer-equivalent: read out of the page via `evaluate` and passed
 * straight into the PUT header — never logged.
 */
async function mintApproverIdToken(
    browser: Browser,
    baseURL: string,
    approverBearer: string,
): Promise<{ idToken: string; uid: string; context: BrowserContext }> {
    const context = await browser.newContext()
    const { uid, customToken } = await loginAsTestUser(context, baseURL, approverBearer)
    const page = await context.newPage()
    await page.goto(`${baseURL}/perform`, { waitUntil: 'domcontentloaded' })
    const { signedIn } = await signInWebSdk(page, customToken ?? '', { required: true })
    if (!signedIn) throw new Error('mintApproverIdToken: Web-SDK sign-in failed (probe bridge missing?)')
    const idToken = await page.evaluate(async () => {
        const b = (
            window as unknown as {
                __c7_auth_for_probes__: { auth: { currentUser: { getIdToken: (f?: boolean) => Promise<string> } } }
            }
        ).__c7_auth_for_probes__
        return await b.auth.currentUser.getIdToken(true)
    })
    await page.close()
    return { idToken, uid, context }
}

// ═══════════════════════════════════════════════════════════════════════════
// Describe 1 — no-auth surface probes (no bearer needed).
// ═══════════════════════════════════════════════════════════════════════════
test.describe('ipad-sweep-onboarding — no-auth QR surface probes (WebKit)', () => {
    test.beforeEach(({}, testInfo) => ipadOnly(testInfo))

    // ─── Group A — REACHABILITY of the QR display surface (the headline) ───
    //
    // ORIGINAL FINDING (F1, ipad-sweep-onboarding): QRSignIn rendered ONLY in
    // DashboardClient.tsx at `/` under `{!user && !authLoading}`, but proxy.ts
    // redirects any sessionless `/` → `/perform` and a session always sets
    // `user` — so the QR display was never both reachable AND rendered.
    // FIX (fix-onboarding-qr): the QR affordance now lives on `/login` (the
    // reachable public sign-in surface). A1 still pins the UNAUTH-001 redirect
    // (sessionless `/` → /perform, no auto-QR there); A3 proves the QR is now
    // reachable + rendered on /login. The dashboard `/` QR is left in place as
    // harmless dead code (still unreachable, but no longer the only entry).

    test('A1: unauthenticated `/` redirects to /perform — QR display never shows', async ({
        browser,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const ctx = await browser.newContext() // fresh: no __session cookie
        try {
            const page = await ctx.newPage()
            // `/perform` holds persistent Firestore/websocket connections, so
            // never wait for networkidle (it never settles). The 307 resolves on
            // goto; waitForURL is a bounded belt-and-suspenders.
            await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
            await page.waitForURL(/\/perform\/?$/, { timeout: 15_000 }).catch(() => {})

            expect(
                new URL(page.url()).pathname,
                'sessionless `/` must land on /perform (proxy.ts UNAUTH-001)',
            ).toBe('/perform')

            await expect(
                page.getByText('Scan with your phone to sign in'),
                'QR display affordance must be absent on the surface a signed-out iPad reaches',
            ).toHaveCount(0)
            await expectNoHorizontalOverflow(page, 'unauth landing (/perform)')
        } finally {
            await ctx.close()
        }
    })

    test('A2: /perform (public landing) offers no QR sign-in affordance', async ({ browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const ctx = await browser.newContext()
        try {
            const page = await ctx.newPage()
            await page.goto(`${baseURL}/perform`, { waitUntil: 'domcontentloaded' })
            await expect(page.getByText('Scan with your phone to sign in')).toHaveCount(0)
            await expectNoHorizontalOverflow(page, '/perform')
        } finally {
            await ctx.close()
        }
    })

    test('A3 (FIX fix-onboarding-qr): /login offers QR shared-device sign-in that reveals the QR display', async ({
        browser,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const ctx = await browser.newContext() // fresh: no __session — the iPad's onboarding state
        try {
            const page = await ctx.newPage()
            await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })

            // Google sign-in (for leaders) still present + iPad-sized.
            const googleBtn = page.getByRole('button', { name: /Sign in with Google/i })
            await expect(googleBtn, '/login must render the Google sign-in button').toBeVisible({
                timeout: 15_000,
            })
            const box = await googleBtn.boundingBox()
            expect(box, 'Google button must have a bounding box').not.toBeNull()
            expect(
                box!.height,
                `Google button tap target ${box!.height}px below the ${TAP_TARGET_MIN}px iOS HIG floor`,
            ).toBeGreaterThanOrEqual(TAP_TARGET_MIN)

            // FIX (AC#1): the QR shared-device affordance is reachable on /login.
            // It is lazy — the QR display itself only mounts on opt-in, so no
            // throwaway qr-session is registered for a Google-only sign-in.
            const phoneToggle = page.getByRole('button', { name: /sign in with phone/i })
            await expect(
                phoneToggle,
                '/login must offer the shared-device QR affordance (was unreachable pre-fix — F1)',
            ).toBeVisible({ timeout: 15_000 })
            await expect(
                page.getByText('Scan with your phone to sign in'),
                'QR display must NOT mount until the band taps the affordance (lazy)',
            ).toHaveCount(0)

            const toggleBox = await phoneToggle.boundingBox()
            expect(
                toggleBox!.height,
                `phone-signin affordance tap target ${toggleBox!.height}px below the ${TAP_TARGET_MIN}px iOS HIG floor`,
            ).toBeGreaterThanOrEqual(TAP_TARGET_MIN)

            // Tap → the QRSignIn display renders (the iPad now shows a scannable code).
            await phoneToggle.click()
            await expect(
                page.getByText('Scan with your phone to sign in'),
                'tapping the affordance must reveal the QR display (QRSignIn)',
            ).toBeVisible({ timeout: 15_000 })
            await expect(
                page.locator('svg').first(),
                'a QR code SVG must render in the revealed panel',
            ).toBeVisible()

            await expectNoHorizontalOverflow(page, '/login (QR revealed)')

            await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
            await expect(page.getByRole('link', { name: 'Accessibility' })).toBeVisible()
        } finally {
            await ctx.close()
        }
    })

    // ─── Group C2 — PUT auth-layer rejections (no minting required) ───

    test('C2: PUT without Authorization → 401; with a garbage token → 403', async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const code = genCode()
        await request.post(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json' },
        })

        const noAuth = await request.put(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json' },
        })
        expect(noAuth.status(), 'PUT with no bearer must be 401').toBe(401)

        const badAuth = await request.put(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer not-a-real-firebase-id-token',
            },
        })
        expect(badAuth.status(), 'PUT with an invalid ID token must be 403').toBe(403)
    })

    // ─── Group D — session lifecycle (probe point #4) ───

    test('D1: POST creates a pending session; poll of an unknown code → 404', async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const code = genCode()
        const createRes = await request.post(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json' },
        })
        expect(createRes.status(), 'POST /api/auth/qr must create the session').toBe(200)
        const created = (await createRes.json()) as { code: string; expiresAt: number }
        expect(created.code).toBe(code)
        expect(created.expiresAt, 'expiresAt must be in the future (~5 min TTL)').toBeGreaterThan(Date.now())

        const pending = await request.get(`${baseURL}/api/auth/qr?code=${code}`)
        expect(pending.status()).toBe(200)
        expect((await pending.json()).status).toBe('pending')

        const unknown = await request.get(`${baseURL}/api/auth/qr?code=${genCode()}`)
        expect(unknown.status(), 'GET unknown code must be 404 (client treats as refresh)').toBe(404)
    })

    // ─── Group F — /qr/[code] approve PAGE renders gracefully (phone side) ───

    test('F1: /qr/<unknown> approve page shows Session Expired, no overflow', async ({ browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const ctx = await browser.newContext()
        try {
            const page = await ctx.newPage()
            await page.goto(`${baseURL}/qr/${genCode()}`, { waitUntil: 'domcontentloaded' })
            await expect(
                page.getByText(/Session Expired/i),
                'unknown/expired QR code must render the Session Expired state',
            ).toBeVisible({ timeout: 15_000 })
            await expectNoHorizontalOverflow(page, '/qr/<unknown>')
        } finally {
            await ctx.close()
        }
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// Describe 2 — minted-approver cycle (needs MCP_BEARER).
// ═══════════════════════════════════════════════════════════════════════════
test.describe('ipad-sweep-onboarding — QR approve→sign-in cycle (WebKit)', () => {
    test.skip(
        !MCP_BEARER,
        'QR cycle needs MCP_BEARER (admin or band_leader) to mint approver accounts. Skipped without it.',
    )
    test.beforeEach(({}, testInfo) => ipadOnly(testInfo))

    const createdUids: string[] = []
    const approverContexts: BrowserContext[] = []

    test.afterAll(async ({ request, baseURL }) => {
        for (const ctx of approverContexts) await ctx.close().catch(() => {})
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('B1: full QR cycle — approve(PUT) yields a customToken the iPad signs in with', async ({
        request,
        browser,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const code = genCode()
        const createRes = await request.post(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json' },
        })
        expect(createRes.status()).toBe(200)
        expect((await createRes.json()).code).toBe(code)

        const pending = await request.get(`${baseURL}/api/auth/qr?code=${code}`)
        expect((await pending.json()).status).toBe('pending')

        const approver = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'ipad-qr-approver',
        })
        createdUids.push(approver.uid)
        const { idToken, uid: approverUid, context: approverCtx } = await mintApproverIdToken(
            browser,
            baseURL,
            approver.token,
        )
        approverContexts.push(approverCtx)

        const putRes = await request.put(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        })
        expect(putRes.status(), `PUT approve must succeed for band_leader; body: ${await putRes.text()}`).toBe(200)
        expect((await putRes.json()).success).toBe(true)

        const approvedRes = await request.get(`${baseURL}/api/auth/qr?code=${code}`)
        expect(approvedRes.status()).toBe(200)
        const approved = (await approvedRes.json()) as { status: string; token?: string }
        expect(approved.status).toBe('approved')
        expect(approved.token, 'approved poll must deliver a customToken').toBeTruthy()

        const ipadCtx = await browser.newContext()
        try {
            const ipadPage = await ipadCtx.newPage()
            await ipadPage.goto(`${baseURL}/perform`, { waitUntil: 'domcontentloaded' })
            const { signedIn, uid: ipadUid } = await signInWebSdk(ipadPage, approved.token ?? '', {
                required: true,
            })
            expect(signedIn, 'iPad must sign in with the QR-delivered customToken').toBe(true)
            expect(ipadUid, 'iPad auth.currentUser.uid must equal the approver uid').toBe(approverUid)
        } finally {
            await ipadCtx.close()
        }

        const reRead = await request.get(`${baseURL}/api/auth/qr?code=${code}`)
        expect(reRead.status(), 'consumed QR session must be gone (single-use)').toBe(404)
    })

    test('C1: musician + member approvers are accepted (member-allowed flagged in FINDINGS)', async ({
        request,
        browser,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        for (const role of ['musician', 'member'] as const) {
            const code = genCode()
            await request.post(`${baseURL}/api/auth/qr`, {
                data: { code },
                headers: { 'Content-Type': 'application/json' },
            })
            const a = await mintTestAccount(request, baseURL, MCP_BEARER, { role, label: `ipad-qr-${role}` })
            createdUids.push(a.uid)
            const { idToken, context } = await mintApproverIdToken(browser, baseURL, a.token)
            approverContexts.push(context)
            const res = await request.put(`${baseURL}/api/auth/qr`, {
                data: { code },
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            })
            // CURRENT behavior: route.ts allowedRoles = {member,musician,band_leader,admin}.
            // `member` passing is the finding (the code comment says the gate is
            // for "members (musician/band_leader/admin)"). Asserted as-is.
            expect(
                res.status(),
                `${role} approver PUT (current behavior is 200-allowed); body: ${await res.text()}`,
            ).toBe(200)
        }
    })

    test('D2: double-approve on the same code → 409 (already used)', async ({ request, browser, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const code = genCode()
        await request.post(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json' },
        })
        const a = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'band_leader', label: 'ipad-qr-double' })
        createdUids.push(a.uid)
        const { idToken, context } = await mintApproverIdToken(browser, baseURL, a.token)
        approverContexts.push(context)

        const first = await request.put(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        })
        expect(first.status()).toBe(200)
        const second = await request.put(`${baseURL}/api/auth/qr`, {
            data: { code },
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        })
        expect(second.status(), 'a second approve on an already-approved code must be 409').toBe(409)
    })

    test('E1: shared iPad — sign out clears currentUser; next user signs in clean', async ({
        request,
        browser,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        const userA = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'musician', label: 'ipad-switch-a' })
        const userB = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'musician', label: 'ipad-switch-b' })
        createdUids.push(userA.uid, userB.uid)

        const ctx = await browser.newContext()
        try {
            const { customToken: tokA } = await loginAsTestUser(ctx, baseURL, userA.token)
            const page = await ctx.newPage()
            await page.goto(`${baseURL}/perform`, { waitUntil: 'domcontentloaded' })
            const a = await signInWebSdk(page, tokA ?? '', { required: true })
            expect(a.uid, 'User A must be current after sign-in').toBe(userA.uid)

            await page.evaluate(async () => {
                await (
                    window as unknown as { __c7_auth_for_probes__: { auth: { signOut: () => Promise<void> } } }
                ).__c7_auth_for_probes__.auth.signOut()
            })
            await page.waitForFunction(
                () =>
                    !(window as unknown as { __c7_auth_for_probes__?: { auth?: { currentUser?: unknown } } })
                        .__c7_auth_for_probes__?.auth?.currentUser,
                null,
                { timeout: 10_000 },
            )
            const leaked = await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            __c7_auth_for_probes__?: { auth?: { currentUser?: { uid?: string } | null } }
                        }
                    ).__c7_auth_for_probes__?.auth?.currentUser?.uid ?? null,
            )
            expect(leaked, 'no prior-user state may leak after sign-out').toBeNull()

            const { customToken: tokB } = await loginAsTestUser(ctx, baseURL, userB.token)
            const b = await signInWebSdk(page, tokB ?? '', { required: true })
            expect(b.uid, 'User B must be current after switch').toBe(userB.uid)
        } finally {
            await ctx.close()
        }
    })
})
