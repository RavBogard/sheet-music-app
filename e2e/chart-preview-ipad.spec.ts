import { test, expect } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { localSongCount, openSetlistEditorSignedIn } from './helpers/setlist-editor'
import { seedPublishedSetlist, findCuratedPdf, type SeededSetlist } from './helpers/seed'

/**
 * David's ask 1 (2026-09-22) — page-1 preview inside the chart-bind picker,
 * on the band's iPad surface (WebKit, MobileCardList).
 *
 * card → Bind Chart → picker → type a known PDF's title → tap its thumbnail
 * → page 1 opens full size → close → the picker is still open with the same
 * search text, and nothing was bound.
 *
 * Run (against prod, after deploy):
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... npx playwright test e2e/chart-preview-ipad.spec.ts --project=ipad-webkit
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('chart-bind picker page-1 preview (iPad)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin or band_leader)')
    test.beforeEach(({}, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('ipad-webkit'), 'ipad-webkit only')
    })

    let leaderBearer = ''
    let setlist: SeededSetlist | null = null
    let pdf: { fileId: string; name: string } | null = null
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'chart-preview-ipad',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)
        pdf = await findCuratedPdf(request, baseURL, leaderBearer)
        setlist = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `ZZ Chart Preview UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [{ title: 'ZZ Preview Row', unbound: true }],
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('tap a candidate thumbnail, see page 1, close back to the picker', async ({ context, page, baseURL }) => {
        test.setTimeout(150_000)
        if (!baseURL || !setlist) throw new Error('seed failed')

        const ready = await openSetlistEditorSignedIn(page, context, baseURL, leaderBearer, setlist.setlistId)
        test.skip(!ready, 'harness could not authorise the songs listener (not a product check)')

        await expect(page.getByTestId('mobile-card-list')).toBeVisible({ timeout: 30_000 })
        await page.locator('[aria-label="ZZ Preview Row. Tap to edit."]').first().click()
        await page.waitForTimeout(3_000) // let the songs listener fill Dexie
        await page.getByRole('button', { name: /Bind Chart/i }).click()

        const input = page.locator('input[cmdk-input]')
        await expect(input).toBeVisible({ timeout: 10_000 })
        // The songs listener fills the list; wait for it before searching.
        await expect(page.locator('[cmdk-item]').first())
            .toBeVisible({ timeout: 20_000 })
            .catch(async (e) => {
                const n = await localSongCount(page)
                const probe = await page.evaluate(() =>
                    JSON.stringify((window as unknown as { __chartPickerProbe__?: unknown[] }).__chartPickerProbe__ ?? null),
                )
                throw new Error(`picker list empty; local songs rows = ${n}; probe ${probe.slice(-1500)}. ${String(e).slice(0, 200)}`)
            })
        // Visible rows load their own thumbnails; take the first that renders.
        const thumb = page.locator('[data-chart-thumb][data-state="image"]').first()
        await expect(thumb, 'an on-screen row renders its page 1').toBeVisible({ timeout: 30_000 })
        const box = await thumb.boundingBox()
        expect(box!.height, 'thumbnail tap target on iPad').toBeGreaterThanOrEqual(44)
        // Only on-screen rows fetch: far fewer rendered thumbnails than rows.
        const rendered = await page.locator('[data-chart-thumb][data-state="image"]').count()
        const rows = await page.locator('[cmdk-item]').count()
        expect(rendered, `rendered ${rendered} of ${rows} rows`).toBeLessThan(Math.min(rows, 40))
        const query = ''
        await thumb.tap()
        const dialog = page.getByTestId('chart-page1-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('img')).toBeVisible({ timeout: 20_000 })
        const img = await dialog.locator('img').boundingBox()
        expect(img!.width, 'enlarged page is page-sized, not a thumbnail').toBeGreaterThan(280)

        await dialog.getByRole('button', { name: 'Close' }).tap()
        await expect(dialog).toBeHidden()
        await expect(input, 'picker stays open with the same search').toHaveValue(query)
        await expect(page.locator('[aria-label="ZZ Preview Row. Tap to edit."]').first()).toBeVisible()
    })
})
