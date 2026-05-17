import { test, expect } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, revokeTestAccounts } from './helpers/auth'
import { seedPublishedSetlist, uploadFixtureChart, type SeededSetlist } from './helpers/seed'
import { mcpCallOrThrow } from './helpers/mcp'

/**
 * b6 — Chart-bind picker UAT.
 *
 * Coverage of the one authored surface that survives the 2026-05-15
 * MCP-first-authoring pivot for the band/musician audience: the
 * `ChartBindPopover` opened from a SetlistGrid row's chart cell at
 * `/setlists/[id]`. The picker's data source is Dexie (`getDb().songs`),
 * primed from Firestore by `songs/subscribe.ts`; our seed lands a
 * fixture library entry owned by the test band_leader, and the editor
 * page subscribes on mount, so the picker populates after a short sync
 * window.
 *
 * Flow:
 *   1. Mint a test-band_leader (the picker is gated on write capability).
 *   2. Seed a setlist with one *unbound* row (no `songId`) + a fixture
 *      library chart with a unique title.
 *   3. Visit `/setlists/{setlistId}` (editor — band_leader sees the grid).
 *   4. Wait for SetlistGrid hydration; click the chart cell for the
 *      unbound row.
 *   5. Type the fixture chart's title into the cmdk input (`aria-label`
 *      = "Bind a chart"); select the result.
 *   6. Verify the bond via MCP `get_setlist` — the track now carries
 *      `fileId`/`songId` matching the fixture.
 *
 * **Why MCP verify, not UI verify**: the chart cell's aria-label switches
 * from "No chart bound" to "Chart bound" client-side after the bind,
 * but the write propagates through `setlist-firebase` + Firestore round-
 * trip, and waiting on the optimistic local update is racy against the
 * server-confirmed state. Reading the durable answer is the floor.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... \
 *   npx playwright test e2e/chart-bind-picker.spec.ts --project=chromium
 *
 * Skips automatically when `MCP_BEARER` is unset.
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('b6 — Chart-bind picker UAT', () => {
    test.skip(!MCP_BEARER, 'b6 chart-bind picker needs MCP_BEARER env var. Skipped without it.')

    let leaderBearer = ''
    let seeded: SeededSetlist | null = null
    let fixtureFileId = ''
    let fixtureTitle = ''
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for b6 UAT')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'b6-chart-bind-picker',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        // Pre-mint a fixture library chart with a *unique* title we can
        // search for in the picker. The seed will then create a setlist
        // with one unbound row that the test binds via the UI.
        fixtureTitle = `b6 ChartBind Fixture ${Date.now()}`
        const fixture = await uploadFixtureChart(request, baseURL, leaderBearer, {
            title: fixtureTitle,
        })
        fixtureFileId = fixture.fileId

        seeded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `b6 ChartBind UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [{ title: 'b6 Unbound Row', unbound: true }],
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('band_leader can bind an unbound track via the chart-bind picker', async ({ context, page, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        await loginAsTestUser(context, baseURL, leaderBearer)

        // Visit the setlist EDITOR (not /perform). The editor is where
        // SetlistGrid + ChartBindPopover live.
        await page.goto(`/setlists/${seeded.setlistId}`, {
            waitUntil: 'domcontentloaded',
        })

        // Wait for grid hydration. The chart cell has data-testid="chart-cell"
        // (ChartCell.tsx:28) and is the click target. With a single unbound
        // row in the seed, there's exactly one chart-cell rendered before
        // the bind. Allow Dexie sync time as well — picker results pull
        // from getDb().songs which is primed by the live subscription.
        const chartCell = page.getByTestId('chart-cell').first()
        await expect(chartCell, 'SetlistGrid must render at least one chart-cell').toBeVisible({ timeout: 30_000 })

        // The freshly uploaded fixture lands in Firestore immediately but
        // the client's Dexie mirror needs a moment to absorb the live
        // update. 5s is generous for a single-doc upsert.
        await page.waitForTimeout(5_000)

        await chartCell.click()

        // The popover's cmdk input — ChartBindPopover.tsx:55 sets
        // `inputAriaLabel = 'Bind a chart'` as the default.
        const cmdkInput = page.getByRole('combobox', { name: 'Bind a chart' }).or(
            page.getByPlaceholder(/Bind a chart/i),
        ).or(page.locator('input[cmdk-input]'))
        await expect(cmdkInput, 'ChartBindPopover cmdk input must mount on chart-cell click').toBeVisible({ timeout: 10_000 })

        await cmdkInput.fill(fixtureTitle)

        // CommandItem renders the song title — click the first non-empty
        // result. CmdK filters synchronously, so a small wait is enough.
        await page.waitForTimeout(500)
        const result = page.getByRole('option', { name: new RegExp(fixtureTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
            .or(page.getByText(fixtureTitle, { exact: true }))
        await expect(result, 'fixture chart must surface in the cmdk results').toBeVisible({ timeout: 10_000 })
        await result.first().click()

        // The picker writes via `setlist-firebase` — give the round-trip
        // a beat before verifying server state.
        await page.waitForTimeout(1500)

        // Verify the bond via MCP get_setlist. The track must now carry a
        // fileId matching the fixture (the bond fields are
        // songId+fileId+title+key in commit_staged_changes' field set —
        // see [[feedback_upload_atomicity]]).
        const fetched = await mcpCallOrThrow<{
            tracks?: Array<{ id?: string; fileId?: string; songId?: string; title?: string }>
        }>(page.request, baseURL, leaderBearer, 'get_setlist', { id: seeded.setlistId })
        const tracks = fetched.tracks ?? []
        expect(tracks.length, 'seeded setlist has 1 track').toBe(1)
        const bond = tracks[0]
        const boundId = bond.fileId ?? bond.songId
        expect(
            boundId,
            `track must carry the fixture fileId after picker bind. Got: ${JSON.stringify(bond)}`,
        ).toBe(fixtureFileId)
    })
})
