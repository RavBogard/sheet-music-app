import { test, expect, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'
import {
    seedPublishedSetlist,
    seedLongPublishedSetlist,
    uploadFixtureChart,
    findCuratedPdf,
    type SeededSetlist,
} from './helpers/seed'

/**
 * ipad-sweep-perform — DEEP Perform-mode coverage on standard 11" iPad (WebKit).
 *
 * Builds on coder-5's ipad-uat-harness (`perform-ipad.spec.ts`, the golden
 * path). That spec proves the happy path + react-pdf canvas paint under WebKit.
 * THIS spec goes beyond the golden path to hunt regressions in the behaviors
 * the band actually exercises on a music stand:
 *   1. Setlist switching (no stale state across two setlists)
 *   2. Sequential chart nav through every bonded track (no crash at the ends)
 *   3. Transpose: in-overlay transpose vs. the dense-row key-badge, and whether
 *      an ad-hoc transpose survives chart navigation
 *   4. Long setlist (32 rows): no horizontal overflow, scroll, deep tap-targets
 *   5. Unbonded rows: graceful no-op, not a crash/spinner
 *   6. Header / section rows: non-interactive labels, not tappable-as-charts
 *   7. Annotation surface: presence/absence
 *   8. Landscape orientation (music stands rotate)
 *
 * Fixture strategy / cost discipline: charts are TEXT fixtures
 * (`save_scraped_chart` → TextScoreViewer), which do NOT exercise react-pdf or
 * the Gemini OMR path. The golden-path spec already covers react-pdf/WebKit.
 * The long-list setlist bonds ONE shared chart across all 32 rows so every row
 * is a real tap target without 32 uploads.
 *
 * Isolation (parallel sweep lanes share prod): mint with lane-distinct labels,
 * track every uid, revoke-by-id in afterAll. NEVER cleanup_all_test_data.
 *
 * Run (against prod):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/perform-ipad-deep.spec.ts \
 *     --project=ipad-webkit --project=ipad-webkit-landscape --retries=2
 *
 * `--retries=2` is recommended: against prod the client Firestore subscription
 * can transiently empty a freshly-published setlist's live frame (a connectivity
 * blip — the band sees it on flaky wifi too), which a fresh attempt clears. The
 * long-list probe (32 rows, heaviest subscription) is the most sensitive. Each
 * probe passes deterministically in isolation. Skips automatically when
 * MCP_BEARER is unset (CI / local dev safe).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

/** Standard 11" iPad portrait CSS viewport (Daniel-confirmed 2026-05-20). */
const IPAD_PORTRAIT_WIDTH = 820
const IPAD_LANDSCAPE_WIDTH = 1180
/** iOS Human Interface Guidelines minimum touch-target edge. */
const TAP_TARGET_MIN = 44

/** Console noise accepted on a real prod cookie load — identical set to
 *  perform-flow.spec.ts / perform-ipad.spec.ts. None signal a perform-path
 *  regression. A react-pdf / WebKit render error is NOT in this set. */
const CONSOLE_NOISE_PATTERNS: RegExp[] = [
    /Firebase\s+/i,
    /\[firebase\]/i,
    /@firebase\//i,
    /Cross-Origin-Opener-Policy/i,
    /Failed to load resource: the server responded with a status of 4\d\d/i,
    /service-worker/i,
    /opaque response/i,
    // Transient Firestore connectivity blips against prod (the band sees these on
    // flaky venue wifi too). NOT a Perform-path regression. A real react-pdf /
    // WebKit render error (e.g. "Invalid PDF structure") is NOT matched here, so
    // it still surfaces.
    /Could not reach Cloud Firestore backend/i,
    /client is offline/i,
    /code=unavailable/i,
    /ensuring user profile/i,
    // Google auth (GIS/gapi) tracking pixel blocked by the app's strict CSP — a
    // harmless artifact of the Firebase auth flow, unrelated to iPad/Perform.
    /cleardot\.gif/i,
]

function trackConsoleErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (CONSOLE_NOISE_PATTERNS.some((re) => re.test(text))) return
        errors.push(text)
    })
    return errors
}

/** Measure the document's horizontal overflow at the current viewport. */
async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
    return page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
}

/**
 * Wait for a setlist row to render, reloading on miss (up to 2 reloads).
 *
 * Against prod, a freshly-published setlist read by a freshly-minted musician
 * occasionally shows the heading before its rows: the SSR Admin-SDK read can
 * transiently fall back to client-only ([/perform] catch path), and the client
 * Firestore may briefly fail to reach the backend ("Could not reach Cloud
 * Firestore backend" — a connectivity blip the band also sees on flaky venue
 * wifi; [[feedback_harness_real_firestore]]). The heading is on the setlist
 * doc; rows are the tracks query. A reload re-runs the SSR fetch and usually
 * settles it. This is harness robustness for a real-but-transient first-load
 * lag, NOT a product-correctness assertion.
 */
async function awaitRow(page: Page, rowText: string): Promise<void> {
    const row = page.getByText(rowText, { exact: true }).first()
    if (await row.isVisible({ timeout: 12_000 }).catch(() => false)) return
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        if (await row.isVisible({ timeout: 15_000 }).catch(() => false)) return
    }
    await expect(row, `row "${rowText}" must render (after reloads for SSR/connectivity settle)`).toBeVisible({
        timeout: 15_000,
    })
}

// ───────────────────────── PORTRAIT (820×1180) ─────────────────────────

test.describe('ipad-sweep-perform — deep Perform-mode (portrait 820)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin or band_leader) to mint test users + seed fixtures.')

    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit',
            `portrait deep suite runs only under ipad-webkit; current: ${testInfo.project.name}`,
        )
    })

    let musicianUid = ''
    let musicianBearer = ''
    let leaderBearer = ''
    let sharedFileId = ''
    let deepIsPdf = false
    let deep: SeededSetlist | null = null
    let switchB: SeededSetlist | null = null
    let long: SeededSetlist | null = null
    let textBonded: SeededSetlist | null = null
    const createdUids: string[] = []
    const TEXT_ROW_TITLE = 'Text Chart Row'
    // A line that ONLY TextScoreViewer would render (PDFViewer can't show it).
    const TEXT_SENTINEL = 'ipadsweep-text-render-sentinel-line'

    // The deep setlist's row layout (indices matter for the nav math):
    //   0: bonded song   "Deep Track 1" (G)
    //   1: bonded song   "Deep Track 2" (D)
    //   2: header        "Set Two"
    //   3: bonded song   "Deep Track 3" (A)
    //   4: unbonded song "Unbonded Song"
    // → 3 songs in the overlay queue; 1 header label; 1 unbonded no-op row.
    const DEEP_SONG_TITLES = ['Deep Track 1', 'Deep Track 2', 'Deep Track 3']
    const HEADER_TITLE = 'Set Two'
    const UNBONDED_TITLE = 'Unbonded Song'

    test.beforeAll(async ({ request, baseURL }, testInfo) => {
        if (testInfo.project.name !== 'ipad-webkit') return
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the iPad deep sweep')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'ipad-sweep-perform-portrait-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'ipad-sweep-perform-portrait-musician',
        })
        musicianUid = musician.uid
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        // One shared text fixture for rows whose CHART is never opened (the long
        // list measures row layout only; the text-routing finding opens its own).
        const fixture = await uploadFixtureChart(request, baseURL, leaderBearer, {
            title: `iPad deep shared fixture — ${new Date().toISOString()}`,
        })
        sharedFileId = fixture.fileId

        // The deep setlist's chart rows must actually RENDER for the nav +
        // overlay probes, so bond a real curated PDF (text fixtures mis-route to
        // PDFViewer in Perform — see the probe-9 finding). Fall back to the text
        // fixture if the prod library has no PDF (then probe 2 down-grades its
        // render assertion).
        const pdf = await findCuratedPdf(request, baseURL, leaderBearer)
        deepIsPdf = !!pdf
        const bondId = pdf ? pdf.fileId : sharedFileId

        deep = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Deep — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [
                { title: DEEP_SONG_TITLES[0], key: 'G', songId: bondId },
                { title: DEEP_SONG_TITLES[1], key: 'D', songId: bondId },
                { title: HEADER_TITLE, type: 'header' },
                { title: DEEP_SONG_TITLES[2], key: 'A', songId: bondId },
                { title: UNBONDED_TITLE, unbound: true },
            ],
            audience: 'band',
        })

        // A setlist whose only chart row is an MCP-bonded scraped TEXT chart,
        // for the text-routing finding (probe 9). Distinct fixture carrying a
        // sentinel line only TextScoreViewer could render.
        const textFixture = await uploadFixtureChart(request, baseURL, leaderBearer, {
            title: `iPad text-route fixture — ${new Date().toISOString()}`,
            // TEXT_SENTINEL sits on its own non-chord line so TextScoreViewer
            // renders it verbatim as ONE contiguous node (a lyric line UNDER a
            // chord line gets split into per-chord chunks — see the chord/lyric
            // section below — which would break getByText on the full sentinel).
            // The chord section still exercises the chord-alignment render path.
            content: [TEXT_SENTINEL, '', '[Verse]', 'G        D', 'a lyric under the chords', 'Em       C', 'a closing lyric line'].join('\n'),
        })
        textBonded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Text Route — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [{ title: TEXT_ROW_TITLE, key: 'G', songId: textFixture.fileId }],
            audience: 'band',
        })

        switchB = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Switch B — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [
                { title: 'Switch B One', key: 'C', songId: sharedFileId },
                { title: 'Switch B Two', key: 'E', songId: sharedFileId },
            ],
            audience: 'band',
        })

        // 32-row list bonded to the shared text fixture (rows are never opened —
        // only their layout/scroll/tap-target is measured). One bulk_add call
        // minimises exposure to transient prod/MCP blips.
        long = await seedLongPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Long — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            songId: sharedFileId,
            count: 32,
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    /** Land cookie session + best-effort Web-SDK sign-in, then goto a route. */
    async function loginAndGoto(context: BrowserContext, page: Page, baseURL: string, path: string) {
        const { customToken } = await loginAsTestUser(context, baseURL, musicianBearer)
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await signInWebSdk(page, customToken ?? '', { required: false })
    }

    test('probe 1 — setlist switching: correct tracks each time, no stale state', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep || !switchB) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })
        // A switch-B-only title must NOT be present on the deep setlist.
        await expect(page.getByText('Switch B One', { exact: true })).toHaveCount(0)

        // Navigate to the second setlist.
        await page.goto(`/perform/setlist/${switchB.setlistId}`, { waitUntil: 'domcontentloaded' })
        await awaitRow(page, 'Switch B One')
        await expect(page.locator('h1').first()).toHaveText(switchB.name, { timeout: 15_000 })
        await expect(page.getByText(DEEP_SONG_TITLES[0], { exact: true })).toHaveCount(0)

        // Back to the first — no stale rows from setlist B.
        await page.goto(`/perform/setlist/${deep.setlistId}`, { waitUntil: 'domcontentloaded' })
        await awaitRow(page, DEEP_SONG_TITLES[2])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })
        await expect(page.getByText('Switch B One', { exact: true })).toHaveCount(0)
    })

    test('probe 2 — sequential chart nav through every bonded track, ends disabled', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep) throw new Error('beforeAll did not seed')
        const consoleErrors = trackConsoleErrors(page)

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })

        // Open the first bonded chart. (.first() = the dense-list row, which
        // is DOM-first; once the overlay is open the title also appears in the
        // SongNavigation, and the toolbar renders BOTH a mobile + a desktop
        // copy — so every overlay control needs .first() to dodge strict mode.)
        await page.getByText(DEEP_SONG_TITLES[0], { exact: true }).first().click()
        const zoom = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
        await expect(zoom, 'overlay must mount on first song tap').toBeVisible({ timeout: 15_000 })

        // The toolbar ships both layouts in the DOM (mobile lg:hidden + desktop
        // hidden lg:flex); at 820px the mobile copy is the visible, DOM-first one.
        const next = page.getByRole('button', { name: 'Next song' }).first()
        const prev = page.getByRole('button', { name: 'Previous song' }).first()
        const counter = page.getByText(/^Song \d+ of 3$/).first()

        // At chart 1 of 3, prev is disabled.
        await expect(counter).toHaveText('Song 1 of 3', { timeout: 10_000 })
        await expect(prev).toBeDisabled()

        // Page forward through all 3 — overlay stays mounted each step.
        await next.click()
        await expect(counter).toHaveText('Song 2 of 3')
        await expect(zoom, 'overlay stays mounted after next').toBeVisible()
        await next.click()
        await expect(counter).toHaveText('Song 3 of 3')
        await expect(zoom).toBeVisible()
        // At the last chart, next is disabled (no crash off the end).
        await expect(next).toBeDisabled()

        // Page all the way back — prev disabled at the start again.
        await prev.click()
        await expect(counter).toHaveText('Song 2 of 3')
        await prev.click()
        await expect(counter).toHaveText('Song 1 of 3')
        await expect(prev).toBeDisabled()

        await page.keyboard.press('Escape').catch(() => {})

        // Render-clean assertion only when the rows bond a real PDF. (Text
        // fixtures mis-route to PDFViewer and throw — that's the probe-9
        // finding, not a nav regression — so don't fail nav coverage on it.)
        if (deepIsPdf) {
            await expect(page.getByText(/Failed to load|render error|Could not load chart/i)).toHaveCount(0)
            expect(consoleErrors, `console errors during sequential nav:\n${consoleErrors.join('\n')}`).toEqual([])
        } else {
            test.info().annotations.push({
                type: 'skip-reason',
                description: 'No curated PDF in library_index — render/console-clean nav assertion down-graded (rows bonded a text fixture).',
            })
        }
    })

    test('probe 3 — transpose: dense-row key-badge mismatch + nav-reset behavior', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })

        // The dense-row key-badge for an authed musician (profile default 0)
        // shows the track's original key. (.first() = the dense-list row span,
        // DOM-first; once the overlay is open the title also appears twice in
        // the SongNavigation, hence .first() everywhere below.)
        const row1 = page
            .getByText(DEEP_SONG_TITLES[0], { exact: true })
            .first()
            .locator('xpath=ancestor-or-self::*[@role="button"][1]')
        const badge1 = row1.getByTestId('key-badge')
        await expect(badge1, 'row 1 key-badge must show original key').toHaveText('G', { timeout: 10_000 })

        // Open the overlay + transposer popover, transpose up twice.
        await page.getByText(DEEP_SONG_TITLES[0], { exact: true }).first().click()
        await expect(page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()).toBeVisible({ timeout: 15_000 })

        // At 820px (< lg) the transposer is the compact popover trigger. Its
        // accessible name is "Transpose" before any key is detected. The toolbar
        // ships both layouts in the DOM → .first() picks the visible mobile copy.
        const transposeTrigger = page.getByRole('button', { name: /^transpose$/i }).first()
        await transposeTrigger.click({ timeout: 5000 })
        const up = page.getByRole('button', { name: 'Transpose up' })
        await expect(up, 'transposer menu must open').toBeVisible({ timeout: 5000 })
        await up.click()
        await up.click()
        // The stepper reflects the store transposition deterministically.
        await expect(page.getByText('+2', { exact: false }).first()).toBeVisible({ timeout: 5000 })

        // FINDING (a) — dense-row key-badge mismatch: the badge reads
        // track.transposition + profile default, NOT the in-overlay
        // useMusicStore.transposition, so it stays 'G' even though the store is
        // now +2 (text check holds whether or not the overlay covers it).
        await expect(badge1, 'overlay transpose must NOT move the dense-row key-badge').toHaveText('G')

        // Escape closes the TRANSPOSER POPOVER (Radix marks it defaultPrevented)
        // — the overlay stays open. Navigate within the still-open overlay.
        await page.keyboard.press('Escape').catch(() => {})
        const next = page.getByRole('button', { name: 'Next song' }).first()
        const prev = page.getByRole('button', { name: 'Previous song' }).first()
        await next.click()
        await expect(page.getByText(/^Song 2 of 3$/).first()).toBeVisible({ timeout: 10_000 })
        await prev.click()
        await expect(page.getByText(/^Song 1 of 3$/).first()).toBeVisible({ timeout: 10_000 })

        // FINDING (b) — nav-reset: re-open the transposer and confirm the ad-hoc
        // +2 was DISCARDED on song navigation (store resets transposition to the
        // track's saved value = Original Key). Documented behavior; a passing
        // assertion records it as a regression test. If transpose ever persisted
        // across nav, this would fail and flag the change.
        await page.getByRole('button', { name: /^transpose$/i }).first().click({ timeout: 5000 })
        await expect(page.getByText('Original Key', { exact: false }).first()).toBeVisible({ timeout: 5000 })
    })

    test('probe 4 — long setlist (32 rows): no overflow, scroll, deep tap-targets', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!long) throw new Error('beforeAll did not seed long setlist')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${long.setlistId}`)
        await awaitRow(page, 'Long Row 01')
        await expect(page.locator('h1').first()).toHaveText(long.name, { timeout: 15_000 })

        // No horizontal overflow at the iPad width — never scroll sideways.
        const overflow = await horizontalOverflow(page)
        expect(
            overflow.scrollWidth,
            `horizontal overflow at iPad width: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        expect(overflow.clientWidth, 'viewport must be the 820px iPad width').toBeLessThanOrEqual(IPAD_PORTRAIT_WIDTH)

        // The last row is reachable by scrolling (deep in a 32-row list).
        const lastRowText = page.getByText('Long Row 32', { exact: true })
        await lastRowText.scrollIntoViewIfNeeded()
        await expect(lastRowText, 'last row must be reachable by scroll').toBeVisible({ timeout: 10_000 })

        // A deep row's tap target meets the iOS HIG 44px floor.
        const deepRow = lastRowText.locator('xpath=ancestor-or-self::*[@role="button"][1]')
        const box = await deepRow.boundingBox()
        expect(box, 'deep row must have a bounding box').not.toBeNull()
        expect(
            box!.height,
            `deep row tap target ${box?.height}px below the ${TAP_TARGET_MIN}px floor`,
        ).toBeGreaterThanOrEqual(TAP_TARGET_MIN)
    })

    test('probe 5 — unbonded row: graceful no-op, not a crash or spinner', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep) throw new Error('beforeAll did not seed')
        const consoleErrors = trackConsoleErrors(page)

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })

        const unbonded = page.getByText(UNBONDED_TITLE, { exact: true })
        await expect(unbonded, 'unbonded row must render').toBeVisible({ timeout: 10_000 })

        // For a musician, an unbonded song row is non-interactive — no role=button.
        const asButton = unbonded.locator('xpath=ancestor-or-self::*[@role="button"][1]')
        await expect(asButton, 'unbonded row must NOT be a role=button for a musician').toHaveCount(0)

        // Tapping it must NOT open the chart overlay and must not crash.
        await unbonded.click({ force: true })
        await page.waitForTimeout(750)
        await expect(
            page.getByRole('button', { name: /^Zoom (in|out)$/ }),
            'no chart overlay should open from an unbonded row',
        ).toHaveCount(0)
        // No infinite spinner / no loader stuck on screen.
        await expect(page.locator('h1').first(), 'list view must remain').toHaveText(deep.name)
        expect(consoleErrors, `console errors on unbonded tap:\n${consoleErrors.join('\n')}`).toEqual([])
    })

    test('probe 6 — header/section row: non-interactive label, not tappable-as-chart', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await expect(page.locator('h1').first()).toHaveText(deep.name, { timeout: 15_000 })

        const header = page.getByText(HEADER_TITLE, { exact: true })
        await expect(header, 'header label must render').toBeVisible({ timeout: 10_000 })

        // Header for a musician is a plain div, not a role=button.
        const headerButton = header.locator('xpath=ancestor-or-self::*[@role="button"][1]')
        await expect(headerButton, 'header must not be a role=button for a musician').toHaveCount(0)

        // Tapping it opens no chart overlay.
        await header.click({ force: true })
        await page.waitForTimeout(500)
        await expect(page.getByRole('button', { name: /^Zoom (in|out)$/ })).toHaveCount(0)
    })

    test('probe 7 — annotation surface: confirm presence/absence', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!deep) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${deep.setlistId}`)
        await awaitRow(page, DEEP_SONG_TITLES[0])
        await page.getByText(DEEP_SONG_TITLES[0], { exact: true }).first().click()
        await expect(page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()).toBeVisible({ timeout: 15_000 })

        // No freehand-draw / annotation control in the performance toolbar.
        // (Documents the prior finding: no user-draw surface shipped. If one
        // ships later, flip this to a draw→persist→nav probe.)
        const annotateControls = page.getByRole('button', { name: /annotat|draw|pen tool|highlighter/i })
        expect(
            await annotateControls.count(),
            'no user-draw annotation control is expected in Perform mode',
        ).toBe(0)
    })

    test('probe 9 — REGRESSION (fix-scraped-text-render): MCP-bonded text chart renders via TextScoreViewer in Perform', async ({ context, page, baseURL }) => {
        // REGRESSION (fix-scraped-text-render). An MCP-bonded scraped TEXT chart
        // must render through TextScoreViewer in Perform — NOT react-pdf. This was
        // the ipad-sweep-perform F-1 finding (formerly pinned with test.fail);
        // the fix landed so the marker was removed per its own instructions:
        //   - add_track_to_setlist / swap_chart now stamp mimeType on the
        //     SetlistTrack from the library_index row, so toQueueItem (which
        //     defaults extension-less `upload-<uuid>` fileIds to 'pdf') resolves
        //     'text'.
        //   - PDFOverlay's library_index mimeType backstop now also covers
        //     text/plain (+ musicxml), rescuing any already-bonded chart.
        //   [[project_track_mimetype_gotcha]]
        // Asserts the corrected behavior directly: TextScoreViewer renders a
        // sentinel line that react-pdf could never display.
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!textBonded) throw new Error('beforeAll did not seed the text-route setlist')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${textBonded.setlistId}`)
        await awaitRow(page, TEXT_ROW_TITLE)
        await expect(page.locator('h1').first()).toHaveText(textBonded.name, { timeout: 15_000 })

        await page.getByText(TEXT_ROW_TITLE, { exact: true }).first().click()
        await expect(page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()).toBeVisible({ timeout: 15_000 })

        // CORRECT behavior: the chart's text (a line only TextScoreViewer can
        // render) is visible. Today it is NOT — the bytes went to react-pdf.
        await expect(
            page.getByText(TEXT_SENTINEL, { exact: false }),
            'a TEXT chart should render its text via TextScoreViewer, not react-pdf',
        ).toBeVisible({ timeout: 15_000 })
    })
})

// ───────────────────────── LANDSCAPE (1180×820) ─────────────────────────

test.describe('ipad-sweep-perform — deep Perform-mode (landscape 1180)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin or band_leader) to mint test users + seed fixtures.')

    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit-landscape',
            `landscape suite runs only under ipad-webkit-landscape; current: ${testInfo.project.name}`,
        )
    })

    let musicianBearer = ''
    let leaderBearer = ''
    let land: SeededSetlist | null = null
    const createdUids: string[] = []
    const LAND_SONG = 'Landscape Track 1'
    const LAND_HEADER = 'Landscape Header'

    test.beforeAll(async ({ request, baseURL }, testInfo) => {
        if (testInfo.project.name !== 'ipad-webkit-landscape') return
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the iPad landscape sweep')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'ipad-sweep-perform-landscape-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'ipad-sweep-perform-landscape-musician',
        })
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        const fixture = await uploadFixtureChart(request, baseURL, leaderBearer, {
            title: `iPad landscape fixture — ${new Date().toISOString()}`,
        })

        land = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Landscape — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [
                { title: LAND_SONG, key: 'G', songId: fixture.fileId },
                { title: 'Landscape Track 2', key: 'D', songId: fixture.fileId },
                { title: LAND_HEADER, type: 'header' },
            ],
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('probe 8 — landscape golden subset: render, no overflow, overlay open/close', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!land) throw new Error('beforeAll did not seed landscape setlist')
        const consoleErrors = trackConsoleErrors(page)

        const { customToken } = await loginAsTestUser(context, baseURL, musicianBearer)
        await page.goto(`/perform/setlist/${land.setlistId}`, { waitUntil: 'domcontentloaded' })
        await signInWebSdk(page, customToken ?? '', { required: false })

        // Reload-on-miss for the SSR propagation race (see awaitRow docblock).
        await awaitRow(page, LAND_SONG)
        await expect(page.locator('h1').first()).toHaveText(land.name, { timeout: 15_000 })
        await expect(page.getByText(LAND_HEADER, { exact: true })).toBeVisible({ timeout: 15_000 })

        // No horizontal overflow at the wider landscape width.
        const overflow = await horizontalOverflow(page)
        expect(
            overflow.scrollWidth,
            `horizontal overflow at landscape width: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        expect(overflow.clientWidth, 'viewport must be the 1180px landscape width').toBeLessThanOrEqual(IPAD_LANDSCAPE_WIDTH)
        expect(overflow.clientWidth, 'landscape must be wider than portrait').toBeGreaterThan(IPAD_PORTRAIT_WIDTH)

        // Open + close the chart overlay (desktop toolbar layout at ≥lg).
        await page.getByText(LAND_SONG, { exact: true }).click()
        await expect(
            page.getByRole('button', { name: /^Zoom (in|out)$/ }).first(),
            'overlay must mount in landscape',
        ).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(/Failed to load|render error|Could not load chart/i)).toHaveCount(0)
        await page.keyboard.press('Escape').catch(() => {})
        await expect(page.locator('h1').first(), 'back to list after overlay close').toHaveText(land.name)

        expect(consoleErrors, `console errors in landscape:\n${consoleErrors.join('\n')}`).toEqual([])
    })
})
