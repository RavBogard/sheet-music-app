import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'
import { seedPublishedSetlist, seedLargeSetlist, findCuratedPdf, type SeededSetlist } from './helpers/seed'

/**
 * ipad-sweep-stress — resilience / stress probes on the band's real iPad
 * surface (WebKit @ 820×1180), under the adverse conditions of a live
 * service: 6 simultaneous iPads on shul wifi, long setlists, flaky network.
 *
 * Builds on the `9a6e6453c` harness (auth.ts Web-SDK sign-in, seed.ts,
 * perform-ipad.spec.ts). This is a FINDINGS sweep, not a fix lane — each
 * probe is its OWN test so one degradation doesn't mask the others, and a
 * failure here is a finding to log, not a blocker to patch in `src/`.
 *
 * Probes (lane PROMPT §"What to probe"):
 *   1. Large setlist (42 rows)  — load, scroll, overflow, all rows reachable.
 *   2. Rapid interaction        — open/close overlay ×6; no stuck overlay.
 *   3. Slow network             — 3G-ish chart load; graceful loading state.
 *   4. Offline / reconnect      — setOffline mid-session; recover, don't wedge.
 *   5. PDF load failure         — abort chart bytes; graceful error, no spinner.
 *   6. Concurrent roles         — musician + band_leader on the same setlist.
 *   7. Console-error budget     — folded into each probe (+ pageerror = crash).
 *   8. Landscape                — re-run the whole file under
 *                                 `--project=ipad-webkit-landscape`.
 *
 * Run (against prod; --workers=1 keeps beforeAll seeding to one large setlist):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/stress-ipad.spec.ts --project=ipad-webkit --workers=1
 *   # landscape spot-check: --project=ipad-webkit-landscape
 *
 * Skips automatically when MCP_BEARER is unset (CI / local dev safe).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''
const IPAD_WIDTH = 820
/** Standard 11" iPad LANDSCAPE CSS width — upper bound for the iPad-class
 *  viewport sanity check (works for both portrait 820 and landscape 1180). */
const IPAD_LANDSCAPE_WIDTH = 1180

/** Console noise we accept on a real prod cookie load (identical to
 *  perform-ipad.spec.ts). None indicate a perform-path regression. */
const CONSOLE_NOISE_PATTERNS: RegExp[] = [
    /Firebase\s+/i,
    /\[firebase\]/i,
    /Cross-Origin-Opener-Policy/i,
    /Failed to load resource: the server responded with a status of 4\d\d/i,
    /service-worker/i,
    /opaque response/i,
]

/** Network-disruption noise expected when we deliberately sever / throttle /
 *  abort the connection (offline + PDF-abort probes). A dropped fetch is the
 *  STIMULUS, not the regression — the regression would be a wedge or crash. */
const NETWORK_DISRUPTION_PATTERNS: RegExp[] = [
    /Failed to (load|fetch)/i,
    /Load failed/i, // WebKit's fetch-failure message
    /NetworkError/i,
    /net::/i,
    /ERR_(INTERNET_DISCONNECTED|FAILED|NETWORK)/i,
    /WebChannelConnection|transport errored|RPC.*stream/i, // Firestore listener churn offline
    /\[PDFViewer\]\s+Fetch error/i, // expected on the abort probe
    /The (network )?connection was lost/i,
    // WebKit-specific: on an offline transition the Firestore SDK fires
    // `TYPE=terminate` teardown beacons that Safari/WebKit rejects with
    // "Beacon API cannot load ... WebKit encountered an internal error".
    // Benign SDK teardown chatter, not an app fault — see finding F2.
    /Beacon API cannot load/i,
    /WebKit encountered an internal error/i,
]

/** Attach an error collector to a page: console.error + uncaught pageerror
 *  (a pageerror = a real crash). Returns the live array; filter by `allow`. */
function collectErrors(page: Page, allow: RegExp[]): string[] {
    const errors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (allow.some((re) => re.test(text))) return
        errors.push(text)
    })
    page.on('pageerror', (err) => {
        const text = err.message
        if (allow.some((re) => re.test(text))) return
        errors.push(`[pageerror] ${text}`)
    })
    return errors
}

test.describe('ipad-sweep-stress — resilience under live-service conditions (WebKit)', () => {
    test.skip(
        !MCP_BEARER,
        'iPad stress sweep needs MCP_BEARER (admin or band_leader bearer) to mint test users + seed fixtures. Skipped without it.',
    )

    // Meaningful only at the iPad WebKit viewport(s). A blanket `playwright
    // test` run (chromium / mobile-chrome) skips it; --project=ipad-webkit
    // (or -landscape) runs it.
    test.beforeEach(({}, testInfo) => {
        test.skip(
            !testInfo.project.name.startsWith('ipad-webkit'),
            `runs only under the ipad-webkit project(s); current project: ${testInfo.project.name}`,
        )
    })

    let leaderBearer = ''
    let musicianBearer = ''
    let musicianUid = ''
    let bonded: SeededSetlist | null = null
    let large: SeededSetlist | null = null
    let pdfTitle = ''
    let pdfFound = false
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the iPad stress sweep')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'ipad-stress-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'ipad-stress-musician',
        })
        musicianUid = musician.uid
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        // A real curated PDF to drive the react-pdf / slow / abort probes. Text
        // fixtures route to TextScoreViewer and never exercise react-pdf.
        const pdf = await findCuratedPdf(request, baseURL, leaderBearer)
        pdfFound = !!pdf
        pdfTitle = `iPad Stress PDF — ${new Date().toISOString()}`

        // Small bonded setlist: a text fixture (fast overlay, no network) +
        // a curated PDF (network-dependent — slow / abort / render probes).
        const bondedTracks: Array<{ title: string; key?: string; songId?: string }> = [
            { title: `iPad Stress Text — ${Date.now()}`, key: 'G' },
        ]
        if (pdf) bondedTracks.push({ title: pdfTitle, songId: pdf.fileId, key: 'C' })
        bonded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `iPad Stress Bonded — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: bondedTracks,
            audience: 'band',
        })

        // Long setlist (42 rows) — Shabbat-morning-scale. One bonded PDF row at
        // the end so an "open a chart from deep in a long list" sub-probe has a
        // target. Cheap: title-only rows via one bulk_add_tracks call.
        large = await seedLargeSetlist(request, baseURL, leaderBearer, {
            name: `iPad Stress Large — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            trackCount: 42,
            bondPdfId: pdf?.fileId,
            bondPdfTitle: pdfTitle,
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        // Cascade-revoke both test users → tears down BOTH seeded setlists +
        // all track rows + text fixture charts + Auth users. The bonded curated
        // PDF (shared-library-owned) is left intact. No 40-row orphan in prod.
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    /** Cookie + best-effort Web-SDK sign-in, land on the perform view. */
    async function gotoPerform(
        context: import('@playwright/test').BrowserContext,
        page: Page,
        baseURL: string,
        setlistId: string,
        bearer: string,
    ): Promise<void> {
        const { customToken } = await loginAsTestUser(context, baseURL, bearer)
        await page.goto(`/perform/setlist/${setlistId}`, { waitUntil: 'domcontentloaded' })
        await signInWebSdk(page, customToken ?? '', { required: false })
    }

    // ── Probe 1: large setlist ───────────────────────────────────────────────
    test('large setlist (42 rows) — loads, no overflow, every row reachable', async ({
        context,
        page,
        baseURL,
    }, testInfo) => {
        // Generous: a 42-row setlist hydrates row-by-row through the
        // snapshot-listener → Dexie pipeline (F1), and that cold-open latency is
        // highly variable on prod — measured from ~4s up to >30s. The budget
        // must exceed worst-case cold hydration so this asserts "fully renders +
        // scrollable", not "renders fast" (latency is documented as F1).
        test.setTimeout(150_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!large) throw new Error('beforeAll did not seed the large setlist')

        const errors = collectErrors(page, CONSOLE_NOISE_PATTERNS)

        const t0 = Date.now()
        await gotoPerform(context, page, baseURL, large.setlistId, musicianBearer)
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(large.name, { timeout: 20_000 })
        const loadMs = Date.now() - t0

        // Navigation timing (the real perceived-load signal under WebKit).
        const nav = await page.evaluate(() => {
            const e = performance.getEntriesByType('navigation')[0] as
                | PerformanceNavigationTiming
                | undefined
            return e
                ? {
                      domContentLoaded: Math.round(e.domContentLoadedEventEnd - e.startTime),
                      loadEvent: Math.round(e.loadEventEnd - e.startTime),
                  }
                : null
        })
        testInfo.annotations.push({
            type: 'perf',
            description: `large(42) load: wall ${loadMs}ms; nav DCL ${nav?.domContentLoaded ?? '?'}ms / load ${nav?.loadEvent ?? '?'}ms`,
        })

        // First row visible. Generous timeout: perform rows are gated on the
        // snapshot-listener → Dexie hydration pipeline (use-setlist-performance:127),
        // which lags the heading by seconds on a cold context — the F1 finding.
        await expect(
            page.getByText(large.tracks[0].title, { exact: true }),
            'first row of the long list must render',
        ).toBeVisible({ timeout: 60_000 })

        // Last seeded row must be reachable by scrolling — no truncation, no
        // virtualization gap that hides the tail of a Shabbat-morning setlist.
        const lastTitle = large.tracks[large.tracks.length - 1].title
        const lastRow = page.getByText(lastTitle, { exact: true })
        await lastRow.scrollIntoViewIfNeeded({ timeout: 60_000 })
        await expect(lastRow, 'last row must be reachable by scroll').toBeVisible()

        // No horizontal overflow at the device width — the band must never have
        // to scroll sideways on a music stand. 1px sub-pixel tolerance.
        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(
            overflow.scrollWidth,
            `horizontal overflow on the long list: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        // Sanity: we're at an iPad-class viewport (portrait 820 / landscape 1180),
        // not a desktop width. Orientation-agnostic so the spec is valid under
        // both the ipad-webkit and ipad-webkit-landscape projects.
        expect(overflow.clientWidth, 'viewport must be an iPad-class width (≤1180)').toBeLessThanOrEqual(
            IPAD_LANDSCAPE_WIDTH,
        )

        // Optional heap snapshot (Chromium-only; undefined under WebKit — noted).
        const heap = await page.evaluate(
            () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
        )
        if (heap !== null) {
            testInfo.annotations.push({ type: 'perf', description: `JS heap after large load: ${Math.round(heap / 1e6)}MB` })
        }

        expect(
            errors,
            `console/page errors during large-setlist load:\n${errors.join('\n')}`,
        ).toEqual([])
    })

    // ── Probe 2: rapid interaction ───────────────────────────────────────────
    test('rapid overlay open/close ×6 — no stuck overlay, no error storm', async ({
        context,
        page,
        baseURL,
    }) => {
        test.setTimeout(90_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!bonded) throw new Error('beforeAll did not seed the bonded setlist')

        const errors = collectErrors(page, CONSOLE_NOISE_PATTERNS)
        await gotoPerform(context, page, baseURL, bonded.setlistId, musicianBearer)
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(bonded.name, { timeout: 20_000 })

        // Use the text fixture row — overlay mounts the PerformanceToolbar fast
        // without a network chart fetch, so the open/close cycle is the thing
        // under stress, not PDF I/O.
        const row = page.getByText(bonded.tracks[0].title, { exact: true }).first()
        const zoomBtn = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()

        for (let i = 0; i < 6; i++) {
            await row.click()
            await expect(zoomBtn, `overlay must open on cycle ${i + 1}`).toBeVisible({ timeout: 10_000 })
            await page.keyboard.press('Escape')
            await expect(zoomBtn, `overlay must fully close on cycle ${i + 1} (no stuck overlay)`).toHaveCount(0, {
                timeout: 10_000,
            })
        }

        // List is live + scrollable after the churn.
        await expect(heading, 'heading must remain after rapid cycling').toHaveText(bonded.name)
        expect(
            errors,
            `console/page errors during rapid open/close:\n${errors.join('\n')}`,
        ).toEqual([])
    })

    // ── Probe 3: slow network ────────────────────────────────────────────────
    test('slow chart load (3G-ish) — graceful loading state, eventually paints', async ({
        context,
        page,
        baseURL,
    }, testInfo) => {
        test.setTimeout(120_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!bonded) throw new Error('beforeAll did not seed the bonded setlist')
        test.skip(!pdfFound, 'no curated PDF in library to drive the slow-load probe')

        const errors = collectErrors(page, CONSOLE_NOISE_PATTERNS)

        // Throttle ONLY the chart-byte request — a 3.5s stall simulates a chart
        // crawling in over shul wifi. The page itself loads normally.
        await context.route('**/api/drive/file/**', async (route) => {
            await new Promise((r) => setTimeout(r, 3500))
            await route.continue()
        })

        await gotoPerform(context, page, baseURL, bonded.setlistId, musicianBearer)
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(bonded.name, { timeout: 20_000 })

        await page.getByText(pdfTitle, { exact: true }).click()
        const zoomBtn = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
        await expect(zoomBtn, 'overlay must mount immediately even while bytes are slow').toBeVisible({
            timeout: 15_000,
        })

        // A loading affordance — NOT a frozen white panel — while bytes crawl.
        const loading = page.getByText(/Loading Chart/i)
        const sawLoading = await loading.isVisible({ timeout: 3000 }).catch(() => false)
        testInfo.annotations.push({
            type: 'note',
            description: `slow-load: "Loading Chart" affordance ${sawLoading ? 'shown' : 'not observed (resolved faster than poll)'}`,
        })

        // The real bar: react-pdf eventually paints under the slow profile.
        const canvas = page.locator('canvas.react-pdf__Page__canvas').first()
        await expect(canvas, 'chart must eventually paint under a slow connection (no permanent spinner)').toBeVisible({
            timeout: 60_000,
        })
        const dims = await canvas.evaluate((el) => {
            const c = el as HTMLCanvasElement
            return { w: c.width, h: c.height }
        })
        expect(dims.w, 'slow-loaded canvas must have painted').toBeGreaterThan(0)
        expect(dims.h, 'slow-loaded canvas must have painted').toBeGreaterThan(0)

        await context.unroute('**/api/drive/file/**')
        expect(
            errors,
            `console/page errors during slow chart load:\n${errors.join('\n')}`,
        ).toEqual([])
    })

    // ── Probe 4: offline / reconnect ─────────────────────────────────────────
    test('offline mid-session then reconnect — surfaces state, recovers, no wedge', async ({
        context,
        page,
        baseURL,
    }) => {
        test.setTimeout(90_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!bonded) throw new Error('beforeAll did not seed the bonded setlist')

        // Network churn is the stimulus here, so allow disruption noise; a real
        // crash (pageerror) outside the allow-list still fails the budget.
        const errors = collectErrors(page, [...CONSOLE_NOISE_PATTERNS, ...NETWORK_DISRUPTION_PATTERNS])

        await gotoPerform(context, page, baseURL, bonded.setlistId, musicianBearer)
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(bonded.name, { timeout: 20_000 })

        // CRITICAL ordering: tracks are Dexie-backed (use-setlist-performance:127),
        // populated asynchronously by the snapshot-listener AFTER the heading
        // (a single Firestore doc) resolves. We must wait for a row to actually
        // render — proving Dexie is populated — BEFORE severing the network.
        // Otherwise we'd catch a cold-open race (Dexie still empty) rather than
        // measuring true offline resilience. See finding F-OFFLINE-COLDOPEN.
        const row0 = page.getByText(bonded.tracks[0].title, { exact: true })
        await expect(row0, 'tracks must render online before we test offline').toBeVisible({ timeout: 30_000 })

        // Go offline mid-session.
        await context.setOffline(true)
        // The PerformanceOfflineIndicator must surface an OFFLINE badge (it
        // listens to the window 'offline' event).
        await expect(
            page.getByText(/OFFLINE/i).first(),
            'offline indicator must surface when the connection drops',
        ).toBeVisible({ timeout: 15_000 })
        // The view must NOT white-screen — already-rendered content stays put.
        await expect(heading, 'setlist heading must survive going offline (no wedge/white-screen)').toHaveText(
            bonded.name,
        )
        // Tracks already loaded into local Dexie must persist through the drop —
        // the band keeps their setlist when shul wifi blips mid-service.
        await expect(
            page.getByText(bonded.tracks[0].title, { exact: true }),
            'already-rendered track rows must survive going offline (Dexie is local)',
        ).toBeVisible({ timeout: 10_000 })

        // Back online — the app should recognise reconnection + recover.
        await context.setOffline(false)
        await expect(
            page.getByText(/RECONNECTED/i).first(),
            'reconnect must be acknowledged (RECONNECTED badge)',
        ).toBeVisible({ timeout: 15_000 })
        await expect(heading, 'heading must remain after reconnect (listeners resync, no crash)').toHaveText(
            bonded.name,
        )

        // After recovery, the app is still interactive: opening a chart works.
        const row = page.getByText(bonded.tracks[0].title, { exact: true }).first()
        await row.click()
        await expect(
            page.getByRole('button', { name: /^Zoom (in|out)$/ }).first(),
            'overlay must still open after an offline→online cycle',
        ).toBeVisible({ timeout: 15_000 })

        expect(
            errors,
            `unexpected (non-network) console/page errors across offline cycle:\n${errors.join('\n')}`,
        ).toEqual([])
    })

    // ── Probe 5: PDF load failure ────────────────────────────────────────────
    test('chart bytes fail (abort) — graceful error, no infinite spinner, no crash', async ({
        context,
        page,
        baseURL,
    }) => {
        test.setTimeout(90_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!bonded) throw new Error('beforeAll did not seed the bonded setlist')
        test.skip(!pdfFound, 'no curated PDF in library to drive the abort probe')

        const errors = collectErrors(page, [...CONSOLE_NOISE_PATTERNS, ...NETWORK_DISRUPTION_PATTERNS])

        // Hard-fail every chart-byte fetch. Fresh context ⇒ empty IDB ⇒ the
        // PDFViewer falls through to the network path, which we abort.
        await context.route('**/api/drive/file/**', (route) => route.abort())

        await gotoPerform(context, page, baseURL, bonded.setlistId, musicianBearer)
        const heading = page.locator('h1').first()
        await expect(heading).toHaveText(bonded.name, { timeout: 20_000 })

        await page.getByText(pdfTitle, { exact: true }).click()
        const zoomBtn = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
        await expect(zoomBtn, 'overlay must mount even when bytes fail').toBeVisible({ timeout: 15_000 })

        // A legible error with a Retry path — NOT a permanent spinner, NOT a
        // crash. (PDFViewer surfaces "Failed to load PDF" + Retry on fetch fail.)
        await expect(
            page.getByText(/Failed to load PDF|Could not load chart|PDF render error/i),
            'a failed chart must show a graceful error, not hang on a spinner',
        ).toBeVisible({ timeout: 20_000 })

        // The loading skeleton must have given way (no infinite "Loading Chart").
        await expect(
            page.getByText(/Loading Chart/i),
            'loading skeleton must not persist after the fetch failed',
        ).toHaveCount(0, { timeout: 5_000 })

        // No canvas painted (nothing to paint) — confirms we are on the error
        // path, not a false pass.
        await expect(page.locator('canvas.react-pdf__Page__canvas')).toHaveCount(0)

        // Recoverable: closing the overlay returns to a live list.
        await page.keyboard.press('Escape').catch(() => {})
        await expect(heading, 'must return to a live setlist after a failed chart').toHaveText(bonded.name)

        await context.unroute('**/api/drive/file/**')
        expect(
            errors,
            `unexpected (non-network) console/page errors during chart-abort:\n${errors.join('\n')}`,
        ).toEqual([])
    })

    // ── Probe 6: concurrent roles ────────────────────────────────────────────
    test('concurrent musician + band_leader on the same setlist — both render, no cross-talk', async ({
        browser,
        baseURL,
    }) => {
        test.setTimeout(150_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!bonded) throw new Error('beforeAll did not seed the bonded setlist')

        const ctxM = await browser.newContext({ viewport: { width: IPAD_WIDTH, height: 1180 } })
        const ctxL = await browser.newContext({ viewport: { width: IPAD_WIDTH, height: 1180 } })
        try {
            const pM = await ctxM.newPage()
            const pL = await ctxL.newPage()
            const errM = collectErrors(pM, CONSOLE_NOISE_PATTERNS)
            const errL = collectErrors(pL, CONSOLE_NOISE_PATTERNS)

            await loginAsTestUser(ctxM, baseURL, musicianBearer)
            await loginAsTestUser(ctxL, baseURL, leaderBearer)

            await Promise.all([
                pM.goto(`/perform/setlist/${bonded.setlistId}`, { waitUntil: 'domcontentloaded' }),
                pL.goto(`/perform/setlist/${bonded.setlistId}`, { waitUntil: 'domcontentloaded' }),
            ])

            // Both contexts render the same setlist correctly. Generous row
            // timeouts: each cold context hydrates tracks via its own
            // snapshot-listener → Dexie pipeline (F1), and two simultaneous
            // cold opens lengthen that window.
            await expect(pM.locator('h1').first(), 'musician view heading').toHaveText(bonded.name, {
                timeout: 25_000,
            })
            await expect(pL.locator('h1').first(), 'band_leader view heading').toHaveText(bonded.name, {
                timeout: 25_000,
            })
            await expect(
                pM.getByText(bonded.tracks[0].title, { exact: true }),
                'musician sees the seeded track',
            ).toBeVisible({ timeout: 30_000 })
            await expect(
                pL.getByText(bonded.tracks[0].title, { exact: true }),
                'band_leader sees the seeded track',
            ).toBeVisible({ timeout: 30_000 })

            // Musician opens a chart while the leader page stays live — no
            // cross-context interference.
            await pM.getByText(bonded.tracks[0].title, { exact: true }).first().click()
            await expect(
                pM.getByRole('button', { name: /^Zoom (in|out)$/ }).first(),
                'musician overlay opens independently',
            ).toBeVisible({ timeout: 20_000 })
            await expect(pL.locator('h1').first(), 'leader view unaffected by musician interaction').toHaveText(
                bonded.name,
            )

            expect(errM, `musician console/page errors:\n${errM.join('\n')}`).toEqual([])
            expect(errL, `band_leader console/page errors:\n${errL.join('\n')}`).toEqual([])
        } finally {
            await ctxM.close()
            await ctxL.close()
        }
    })
})
