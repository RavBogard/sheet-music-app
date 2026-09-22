import { test, expect } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { mcpCallOrThrow } from './helpers/mcp'
import { seedPublishedSetlist, type SeededSetlist } from './helpers/seed'
import { openSetlistEditorSignedIn } from './helpers/setlist-editor'

/**
 * David's ask 2 (2026-09-22) — on brotherslazaroff.live the chart picker
 * offers Brothers Lazaroff charts only, for an account that belongs to BOTH
 * tenants (as David's does, and nearly everyone's): membership is not scope.
 *
 * The count must equal list_library's for the tenant (same hidden set:
 * duplicates, archived, non-charts), and no CRC chip or other-sites control
 * appears for a band leader.
 *
 * Run (against prod, after deploy):
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://brotherslazaroff.live \
 *   MCP_BEARER=crl_live_... npx playwright test e2e/chart-picker-tenant.spec.ts --project=ipad-webkit
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('chart picker is scoped to the site, not the account', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin)')
    test.beforeEach(({}, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('ipad-webkit'), 'ipad-webkit only')
    })

    let bearer = ''
    let setlist: SeededSetlist | null = null
    let expected = 0
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        test.skip(!/brotherslazaroff/.test(baseURL), 'point PLAYWRIGHT_BASE_URL at brotherslazaroff.live')
        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'picker-tenant-bl',
            orgIds: ['brotherslazaroff', 'crc'],
        })
        bearer = leader.token
        createdUids.push(leader.uid)
        const lib = await mcpCallOrThrow<{ total?: number }>(request, baseURL, bearer, 'list_library', { limit: 1 })
        expected = lib.total ?? 0
        setlist = await seedPublishedSetlist(request, baseURL, bearer, {
            name: `ZZ Picker Tenant UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [{ title: 'ZZ Tenant Row', unbound: true }],
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('Bind Chart lists exactly the Brothers Lazaroff library', async ({ context, page, baseURL }) => {
        test.setTimeout(150_000)
        if (!baseURL || !setlist) throw new Error('seed failed')
        expect(expected, 'list_library total for brotherslazaroff').toBeGreaterThan(0)

        const ready = await openSetlistEditorSignedIn(page, context, baseURL, bearer, setlist.setlistId)
        test.skip(!ready, 'harness could not authorise the songs listener (not a product check)')

        await expect(page.getByTestId('mobile-card-list')).toBeVisible({ timeout: 30_000 })
        await page.locator('[aria-label="ZZ Tenant Row. Tap to edit."]').first().click()
        await page.getByRole('button', { name: /Bind Chart/i }).click()
        await expect(page.locator('input[cmdk-input]')).toBeVisible({ timeout: 10_000 })
        await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 20_000 })

        // Library group = every pickable row once (Recent may repeat some).
        const libraryItems = page.locator('[cmdk-group]:has([cmdk-group-heading]:text-is("Library")) [cmdk-item]')
        await expect(libraryItems).toHaveCount(expected, { timeout: 15_000 })
        await expect(page.getByTestId('picker-scope-bar')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Shireinu' })).toHaveCount(0)
        await expect(page.getByTestId('picker-other-sites')).toHaveCount(0)
    })
})
