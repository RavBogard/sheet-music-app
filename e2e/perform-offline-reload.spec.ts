import { test, expect, type Page } from '@playwright/test'

import { goOffline, goOnline } from './helpers/gestures'

/**
 * perform-offline-reload — POSITIVE regression for F-C12-R2-009.
 *
 * The cycle-12 run-2 finding: chart bytes survive offline in IndexedDB (the
 * `crc-offline` store filled by `pdf-worker-offline` + viewer caches), but a
 * page-reload while offline returns the browser's "no internet" page because
 * `public/sw.js` is a self-unregistering tombstone with no fetch handler.
 * This spec locks the post-fix contract: with the new perform-shell SW
 * controlling `/perform/*`, an offline reload of a per-track URL renders the
 * page shell from cache + the cached chart bytes from IDB.
 *
 * ── Going offline in the harness ──
 * Uses `goOffline()` from helpers/gestures.ts (route-abort http(s) + flip
 * `navigator.onLine=false`), NOT Playwright's `context.setOffline(true)`.
 * setOffline blocks in-memory `blob:` URL fetches which a real offline iPad
 * doesn't, yielding false failures on chart-byte assertions. See
 * `perform-ipad-offline.spec.ts` for the empirical verification.
 *
 * ── Default target ──
 * Defaults to the public Shavuot Yizkor setlist `UnjLqKTtS4lNKQfMY6hB`
 * (public-by-design, no MCP_BEARER needed). Matches the default for
 * `perform-ipad-pwa-fresh-install.spec.ts` and `ipad-stuck-spinner-probe.spec.ts`
 * — keeps cold-boot, fresh-install, and offline-reload all grounded on the
 * same prod surface.
 *
 * Override with REPRO_SETLIST_ID for a different real published setlist.
 *
 * ── How to run ──
 * Against deployed prod (the auditor's Tier-2 verify pattern):
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *     npx playwright test e2e/perform-offline-reload.spec.ts \
 *       --project=ipad-webkit-landscape --reporter=list
 *
 * Against local `npm run start` (full prod build):
 *   npm run build && npm run start &
 *   npx playwright test e2e/perform-offline-reload.spec.ts \
 *     --project=ipad-webkit-landscape --project=chromium
 */

const REPRO_SETLIST_ID = process.env.REPRO_SETLIST_ID ?? 'UnjLqKTtS4lNKQfMY6hB'

const SHELL_HEADING_TIMEOUT = 20_000
const CHART_RENDER_TIMEOUT = 30_000
const OFFLINE_RELOAD_TIMEOUT = 20_000

/** Render-signature classifier — covers PDF (canvas), MusicXML (svg), image, and audio. */
const CHART_BYTE_SIGNATURE =
    'canvas, [aria-label="Sheet music score"] svg, img[src*="/api/drive/file/"], audio[src*="/api/drive/file/"]'

async function awaitSetlistShell(page: Page): Promise<void> {
    const heading = page.locator('h1').first()
    for (let attempt = 0; attempt < 4; attempt++) {
        if (await heading.isVisible({ timeout: 6_000 }).catch(() => false)) return
        await page.reload({ waitUntil: 'domcontentloaded' })
    }
    await expect(heading, 'setlist heading must render online before offline-reload probe').toBeVisible({
        timeout: SHELL_HEADING_TIMEOUT,
    })
}

async function openFirstChart(page: Page): Promise<void> {
    // Same row selector as perform-ipad-pwa-fresh-install.spec.ts — bonded
    // chart rows have the key-badge testid; non-bonded ones don't.
    const chartRows = page.locator('[role="button"]').filter({ has: page.getByTestId('key-badge') })
    for (let attempt = 0; attempt < 4 && (await chartRows.count()) === 0; attempt++) {
        await page.waitForTimeout(1_500)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.locator('h1').first()).toBeVisible({ timeout: SHELL_HEADING_TIMEOUT })
    }
    expect(await chartRows.count(), 'at least one bonded chart row must render').toBeGreaterThan(0)
    await chartRows.first().scrollIntoViewIfNeeded()
    await chartRows.first().click({ timeout: 8_000 })

    const zoom = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
    await expect(zoom, 'Perform overlay must mount online before offline-reload probe').toBeVisible({
        timeout: 15_000,
    })

    await expect(
        page.locator(CHART_BYTE_SIGNATURE).first(),
        'chart byte-signature must render online before offline-reload probe',
    ).toBeVisible({ timeout: CHART_RENDER_TIMEOUT })
}

test.describe('perform-offline-reload — F-C12-R2-009 page-shell offline recovery', () => {
    test.beforeEach(({}, testInfo) => {
        // Both engines run the same contract; matches dispatch acceptance criteria.
        test.skip(
            testInfo.project.name !== 'ipad-webkit-landscape' && testInfo.project.name !== 'chromium',
            `offline-reload spec runs only under ipad-webkit-landscape + chromium; current: ${testInfo.project.name}`,
        )
    })

    test('offline page-reload of a per-track URL renders shell + cached chart bytes', async ({ page, baseURL }) => {
        test.setTimeout(180_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        // ── Online phase: setlist shell + chart bytes land in IDB + SW registers ──
        await page.goto(`/perform/setlist/${REPRO_SETLIST_ID}`, { waitUntil: 'domcontentloaded' })
        await awaitSetlistShell(page)
        await openFirstChart(page)

        // URL should have updated to per-track route per `595153b192` (cycle-11
        // M3-009 fix). The new perform-shell SW caches this exact URL's HTML
        // shell during the NetworkFirst pass.
        const currentUrl = new URL(page.url())
        expect(
            currentUrl.pathname,
            'opening a chart row should rewrite URL to /perform/setlist/<id>/track/<trackId> per cycle-11 M3-009',
        ).toMatch(/^\/perform\/setlist\/[^/]+\/track\/[^/]+$/)

        // Give the perform-shell SW time to register + activate + cache the
        // current navigation. The registration helper is fire-and-forget in a
        // useEffect; on a slow first paint it can take ~1s.
        await page.waitForTimeout(2_000)

        // ── Offline reload ──
        await goOffline(page)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: OFFLINE_RELOAD_TIMEOUT })

        // ── Post-reload assertions (the contract) ──
        // Without the SW, this reload returns net::ERR_FAILED and the browser
        // paints its own offline page — `<h1>` never appears. With the SW,
        // the cached HTML serves and the heading renders.
        await expect(
            page.locator('h1').first(),
            'page shell must render from SW cache after offline reload',
        ).toBeVisible({ timeout: 15_000 })

        // Chart bytes come from IDB (separate from the SW cache); existing
        // `crc-offline` plumbing handles this. The SW just gets the page
        // bundle back; the chart-render side stays the same offline path.
        await expect(
            page.locator(CHART_BYTE_SIGNATURE).first(),
            'cached chart byte-signature must render after offline reload',
        ).toBeVisible({ timeout: 25_000 })

        // Explicit no-error guard: if the shell paints but a render-error
        // surface fires, that's a regression too.
        await expect(
            page.getByText(/Failed to load|render error|Could not load chart|chart load timed out/i),
            'no render-error text must surface after offline reload',
        ).toHaveCount(0)

        await page.screenshot({
            path: 'test-results/perform-offline-reload-01-post-reload.png',
            fullPage: false,
        })

        await goOnline(page)
    })
})
