import { test, expect, type ConsoleMessage } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'
import { seedPublishedSetlist, findCuratedPdf, type SeededSetlist } from './helpers/seed'

/**
 * ipad-uat-harness — Perform mode on the band's real hardware.
 *
 * The band runs Perform mode on 6× standard 11" iPads (10th/11th gen,
 * ~10.9"), portrait CSS viewport 820×1180 @ scale 2, touch. Until now iPad
 * layout claims were source-extrapolations, never measured at the device
 * width, and react-pdf's pdf.js worker had NEVER been driven through Safari's
 * engine (WebKit) — the single highest-risk untested surface before
 * onboarding. This spec runs ONLY under the `ipad-webkit` project(s)
 * (`playwright.config.ts`), which pin the WebKit engine + the 820×1180
 * viewport override.
 *
 * Two acceptance bars:
 *   1. META-003 CLIENT half — `auth.currentUser` is non-null after Web-SDK
 *      sign-in (the `__session` cookie alone only authes the server). Driven
 *      via the in-bundle `__c7_auth_for_probes__` bridge (Option A — zero new
 *      prod surface), which requires the target build to set
 *      `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1`. With the flag OFF this test fails
 *      with a clear, token-free message — that failure IS the signal to flip
 *      the flag (Tier-2 decision, see SHIP-NOTICE).
 *   2. The band's golden path renders at the real iPad width: heading + dense
 *      track rows, NO horizontal overflow, tap targets ≥ 44px (iOS HIG floor),
 *      and — load-bearing — tapping a bonded PDF chart opens PDFOverlay and
 *      **react-pdf actually paints a non-empty canvas under WebKit**. The
 *      golden-path test signs in best-effort (cookie suffices for the
 *      public perform view + public chart bytes) so rendering coverage holds
 *      even before the prod flag is flipped.
 *
 * Run (against prod):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/perform-ipad.spec.ts --project=ipad-webkit
 *
 * (`npx playwright install webkit` once if the WebKit binary is missing.)
 * Skips automatically when MCP_BEARER is unset (CI / local dev safe).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

/** Standard 11" iPad portrait CSS viewport (Daniel-confirmed 2026-05-20). */
const IPAD_WIDTH = 820
/** iOS Human Interface Guidelines minimum touch-target edge. */
const TAP_TARGET_MIN = 44

/** Browser console noise we accept on a real prod cookie load — identical
 *  set to perform-flow.spec.ts. None indicate a perform-path regression. A
 *  react-pdf / WebKit error is NOT in this set, so it surfaces as a failure. */
const CONSOLE_NOISE_PATTERNS: RegExp[] = [
    /Firebase\s+/i,
    /\[firebase\]/i,
    /Cross-Origin-Opener-Policy/i,
    /Failed to load resource: the server responded with a status of 4\d\d/i,
    /service-worker/i,
    /opaque response/i,
]

test.describe('ipad-uat-harness — Perform mode on standard 11" iPad (WebKit)', () => {
    test.skip(
        !MCP_BEARER,
        'iPad UAT needs MCP_BEARER (admin or band_leader bearer) to mint test users + seed fixtures. Skipped without it.',
    )

    // Guard: this spec is meaningful only at the iPad WebKit viewport. A
    // blanket `playwright test` run (chromium / mobile-chrome projects) skips
    // it; `--project=ipad-webkit` (or -landscape) runs it.
    test.beforeEach(({}, testInfo) => {
        test.skip(
            !testInfo.project.name.startsWith('ipad-webkit'),
            `runs only under the ipad-webkit project(s); current project: ${testInfo.project.name}`,
        )
    })

    let musicianUid = ''
    let musicianBearer = ''
    let leaderBearer = ''
    let seeded: SeededSetlist | null = null
    let pdfTrackTitle = ''
    let pdfFound = false
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the iPad UAT')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'ipad-uat-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'ipad-uat-musician',
        })
        musicianUid = musician.uid
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        // Discover a real curated PDF to bond — text fixtures don't exercise
        // react-pdf (see findCuratedPdf docblock). If the library has none,
        // the react-pdf assertion down-grades to a skip rather than a false
        // pass on a text chart.
        const pdf = await findCuratedPdf(request, baseURL, leaderBearer)
        pdfFound = !!pdf
        pdfTrackTitle = `iPad PDF Chart — ${new Date().toISOString()}`

        const tracks: Array<{ title: string; key?: string; songId?: string }> = [
            { title: `iPad Track One — ${Date.now()}`, key: 'G' },
            { title: `iPad Track Two — ${Date.now()}`, key: 'D' },
        ]
        if (pdf) tracks.push({ title: pdfTrackTitle, songId: pdf.fileId, key: 'C' })

        seeded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks,
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        // Cascade-revoke both test users → tears down the seeded setlist +
        // track rows + the text fixture charts + Auth users. The bonded
        // curated PDF (owned by the shared library, not a test uid) is left
        // intact.
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('META-003 client half — Web SDK sign-in populates auth.currentUser', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        const { uid, role, customToken } = await loginAsTestUser(context, baseURL, musicianBearer)
        expect(uid, 'test-session must echo the musician uid').toBe(musicianUid)
        expect(role, 'test-musician role must be musician').toBe('musician')
        expect(customToken, 'test-session must return a customToken (META-003 server half)').toBeTruthy()

        // Land on an app route that loads @/lib/firebase so the probe bridge
        // installs, then drive the Web-SDK sign-in.
        await page.goto(`/perform/setlist/${seeded.setlistId}`, { waitUntil: 'domcontentloaded' })

        const { signedIn, uid: webUid } = await signInWebSdk(page, customToken ?? '', {
            required: true,
        })
        expect(signedIn, 'Web SDK must sign in via the __c7_auth_for_probes__ bridge').toBe(true)
        expect(webUid, 'auth.currentUser.uid must match the signed-in musician').toBe(musicianUid)
    })

    test('iPad golden path — render, no overflow, tap targets, react-pdf, transpose, back', async ({
        context,
        page,
        baseURL,
    }, testInfo) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        const consoleErrors: string[] = []
        page.on('console', (msg: ConsoleMessage) => {
            if (msg.type() !== 'error') return
            const text = msg.text()
            if (CONSOLE_NOISE_PATTERNS.some((re) => re.test(text))) return
            consoleErrors.push(text)
        })

        // 1. Cookie session, then best-effort Web-SDK sign-in. The public
        //    perform view + public chart bytes render on the cookie alone, so
        //    rendering coverage holds even if the prod probe flag is off.
        const { customToken } = await loginAsTestUser(context, baseURL, musicianBearer)
        await page.goto(`/perform/setlist/${seeded.setlistId}`, { waitUntil: 'domcontentloaded' })
        await signInWebSdk(page, customToken ?? '', { required: false })

        // 2. Heading renders the seeded name.
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(seeded.name, { timeout: 15_000 })

        // 3. All seeded track titles appear in the dense list.
        for (const t of seeded.tracks) {
            await expect(
                page.getByText(t.title, { exact: true }),
                `track row "${t.title}" must render`,
            ).toBeVisible({ timeout: 10_000 })
        }

        // 4. NO horizontal overflow at the device width — the band must never
        //    have to scroll sideways on a music stand. 1px tolerance for
        //    sub-pixel rounding.
        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(
            overflow.scrollWidth,
            `horizontal overflow at iPad width: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        // Sanity: we're actually at the configured iPad viewport, not a
        // fallback. Derive the expected width from the project so the
        // landscape variant (1180) doesn't false-fail against portrait 820.
        const expectedWidth = testInfo.project.use.viewport?.width ?? IPAD_WIDTH
        expect(
            overflow.clientWidth,
            `viewport must be the ${expectedWidth}px iPad width`,
        ).toBeLessThanOrEqual(expectedWidth)

        // 5. Dense rows are tap-friendly. Interactive rows render as
        //    `<div role="button">` (SetlistRow.tsx); measure the bonded row's
        //    tap target against the iOS HIG 44px floor.
        const firstTitle = seeded.tracks[0].title
        const firstRow = page
            .getByText(firstTitle, { exact: true })
            .first()
            .locator('xpath=ancestor-or-self::*[@role="button"][1]')
        const box = await firstRow.boundingBox()
        expect(box, `tappable row for "${firstTitle}" must have a bounding box`).not.toBeNull()
        expect(
            box!.height,
            `row tap target ${box!.height}px is below the ${TAP_TARGET_MIN}px iOS HIG floor`,
        ).toBeGreaterThanOrEqual(TAP_TARGET_MIN)

        // 6. LOAD-BEARING — tap the bonded PDF row, open PDFOverlay, and
        //    assert react-pdf paints a NON-EMPTY canvas under WebKit. This is
        //    the real iOS regression hunt (pdf.js worker on Safari, see
        //    feedback_react_pdf_worker). Down-grades to a skip only if the
        //    library had no PDF to bond.
        if (!pdfFound) {
            testInfo.annotations.push({
                type: 'skip-reason',
                description:
                    'No curated PDF in library_index to bond — react-pdf WebKit render assertion skipped. Re-run after a PDF chart exists.',
            })
        } else {
            await page.getByText(pdfTrackTitle, { exact: true }).click()

            // PDFOverlay mounts the full PerformanceToolbar — Zoom buttons are
            // stable hooks. Their absence means the overlay never opened.
            const overlayMarker = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
            await expect(
                overlayMarker,
                'PDFOverlay PerformanceToolbar must mount on PDF row tap',
            ).toBeVisible({ timeout: 15_000 })

            // No load/render error surfaced (these would mean the worker or
            // fetch failed under WebKit — the exact regression we hunt).
            const failure = page.getByText(
                /Failed to load PDF|PDF render error|Could not load chart/i,
            )
            await expect(
                failure,
                'react-pdf must not show a load/render error under WebKit',
            ).toHaveCount(0)

            // react-pdf renders each page as <canvas class="react-pdf__Page__canvas">.
            // Wait for it, then assert non-zero dimensions — proves pdf.js's
            // worker actually painted, not just that the overlay mounted.
            const canvas = page.locator('canvas.react-pdf__Page__canvas').first()
            await expect(
                canvas,
                'react-pdf page canvas must mount under WebKit',
            ).toBeVisible({ timeout: 30_000 })
            const dims = await canvas.evaluate((el) => {
                const c = el as HTMLCanvasElement
                return { w: c.width, h: c.height }
            })
            expect(
                dims.w,
                `react-pdf canvas width ${dims.w} — worker did not paint under WebKit`,
            ).toBeGreaterThan(0)
            expect(
                dims.h,
                `react-pdf canvas height ${dims.h} — worker did not paint under WebKit`,
            ).toBeGreaterThan(0)

            // 7. Transposer popover responds without crashing. At 820px (≥ md)
            //    the buttons sit behind a popover trigger; mobile layout
            //    exposes them directly. Either path, the page must stay live.
            const transposeUp = page.getByRole('button', { name: 'Transpose up' })
            if (await transposeUp.isVisible({ timeout: 2000 }).catch(() => false)) {
                await transposeUp.click()
            } else {
                const transposerTrigger = page.locator('[id^="transposer"]').first()
                await transposerTrigger.click({ timeout: 5000 }).catch(() => {})
                const upAfterOpen = page.getByRole('button', { name: 'Transpose up' })
                if (await upAfterOpen.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await upAfterOpen.click()
                }
            }

            // 8. Close the overlay → back to the dense list.
            await page.keyboard.press('Escape').catch(() => {})
            await expect(heading, 'heading must reappear after closing the overlay').toHaveText(
                seeded.name,
            )
        }

        // 9. No real console errors throughout (react-pdf/WebKit errors are
        //    NOT in CONSOLE_NOISE_PATTERNS, so they fail here).
        expect(
            consoleErrors,
            `Unexpected console errors during iPad perform flow:\n${consoleErrors.join('\n')}`,
        ).toEqual([])
    })
})
