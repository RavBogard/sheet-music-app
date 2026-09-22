import { test, expect } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'
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
        test.setTimeout(90_000)
        if (!baseURL || !setlist) throw new Error('seed failed')
        test.skip(!pdf, 'no active PDF in the library to preview')

        await loginAsTestUser(context, baseURL, leaderBearer)
        await page.goto(`/setlists/${setlist.setlistId}`, { waitUntil: 'domcontentloaded' })
        const { customToken } = await loginAsTestUser(context, baseURL, leaderBearer)
        await signInWebSdk(page, customToken ?? '', { required: false })

        await expect(page.getByTestId('mobile-card-list')).toBeVisible({ timeout: 30_000 })
        await page.locator('[aria-label="ZZ Preview Row. Tap to edit."]').first().click()
        await page.waitForTimeout(3_000) // let the songs listener fill Dexie
        await page.getByRole('button', { name: /Bind Chart/i }).click()

        const input = page.locator('input[cmdk-input]')
        await expect(input).toBeVisible({ timeout: 10_000 })
        const query = pdf!.name.replace(/\.pdf$/i, '')
        await input.fill(query)

        const thumb = page.locator(`[data-chart-thumb="${pdf!.fileId}"]`).first()
        await expect(thumb).toBeVisible({ timeout: 10_000 })
        // The on-screen row loads its thumbnail by itself.
        await expect(thumb).toHaveAttribute('data-state', 'image', { timeout: 20_000 })
        const box = await thumb.boundingBox()
        expect(box!.height, 'thumbnail tap target on iPad').toBeGreaterThanOrEqual(44)

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
