import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { mcpCallOrThrow } from './helpers/mcp'
import { signInAndGoto } from './helpers/roles'
import { seedPublishedSetlist, uploadFixtureChart, type SeededSetlist } from './helpers/seed'

/**
 * David's ask 4 (2026-09-22) — swap a chart for tonight on one iPad, and every
 * other iPad on the setlist follows without a reload.
 *
 * Two signed-in ipad-webkit contexts on one setlist: a band leader and a
 * musician. The leader taps Swap on a row and picks another chart; the
 * musician's row shows it within 5 s. The saved tracks are byte-identical
 * before and after. The setlist page says "Tonight: X (planned: Y)". Undo
 * (pick the plan) and Reset to plan both restore the plan on both iPads. A
 * signed-out iPad sees the swap after a reload. A musician has no Swap
 * control.
 *
 * Expiry the day after the service and reconcile_service on a fixture
 * history are covered by unit tests (tonight.test.ts,
 * use-setlist-performance-tonight.test.ts, reconcile-chart-swaps.test.ts):
 * production cannot be moved to tomorrow.
 *
 * Run (against prod, after deploy):
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_... npx playwright test e2e/tonight-swap-ipad.spec.ts --project=ipad-webkit
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''
const IPAD = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }

function chicagoToday(): string {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date())
    const g = (t: string) => p.find((x) => x.type === t)?.value
    return `${g('year')}-${g('month')}-${g('day')}`
}

async function performAs(browser: Browser, baseURL: string, bearer: string, path: string, label = 'page'): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext(IPAD)
    const page = await ctx.newPage()
    // Listener failures log as warnings; surface them if the test fails.
    page.on('console', (m) => {
        if (m.type() === 'warning' || m.type() === 'error') console.log(`[${label} ${m.type()}] ${m.text().slice(0, 300)}`)
    })
    await signInAndGoto(ctx, page, baseURL, bearer, path, { webSdk: 'required' })
    // Mount the listeners with the Web SDK session already in place.
    await page.reload({ waitUntil: 'domcontentloaded' })
    return { ctx, page }
}

const rowFor = (page: Page, rowId: string) => page.locator(`[data-testid="perform-row"][data-row-id="${rowId}"]`)

async function tracksSnapshot(request: import('@playwright/test').APIRequestContext, baseURL: string, bearer: string, setlistId: string) {
    const s = await mcpCallOrThrow<{ tracks?: unknown[] }>(request, baseURL, bearer, 'get_setlist', { id: setlistId })
    return JSON.stringify(s.tracks ?? null)
}

test.describe('tonight-only chart swap (two iPads)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin)')
    test.beforeEach(({}, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('ipad-webkit'), 'ipad-webkit only')
    })

    let leaderBearer = ''
    let musicianBearer = ''
    let setlist: SeededSetlist | null = null
    let alt: { fileId: string; title: string } | null = null
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'band_leader', label: 'tonight-leader' })
        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, { role: 'musician', label: 'tonight-musician' })
        leaderBearer = leader.token
        musicianBearer = musician.token
        createdUids.push(leader.uid, musician.uid)
        const stamp = Date.now()
        setlist = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `ZZ Tonight Swap UAT — ${new Date().toISOString()}`,
            eventDate: chicagoToday(),
            tracks: [{ title: `ZZ Barchu Plan ${stamp}` }, { title: `ZZ Second Row ${stamp}` }],
        })
        alt = await uploadFixtureChart(request, baseURL, leaderBearer, { title: `ZZ Barchu Tonight ${stamp}` })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('swap on one iPad → the other follows; plan untouched; undo and reset restore', async ({ browser, request, baseURL }) => {
        test.setTimeout(240_000)
        if (!baseURL || !setlist || !alt) throw new Error('seed failed')
        const row = setlist.tracks[0]
        const planned = row.fileId!
        const path = `/perform/setlist/${setlist.setlistId}`
        const before = await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)

        const L = await performAs(browser, baseURL, leaderBearer, path, 'leader')
        const M = await performAs(browser, baseURL, musicianBearer, path, 'musician')
        // Failure evidence: the server's overrides state and each page's Web SDK user.
        const probe = async (at: string) => {
            const r = await request.get(`${baseURL}/api/setlists/${setlist!.setlistId}/tracks`)
            const body = (await r.json().catch(() => null)) as { overrides?: { rev?: number; rows?: Record<string, { fileId?: string }> } | null } | null
            const who = (p: Page) =>
                p.evaluate(() => (window as unknown as { __c7_auth_for_probes__?: { auth?: { currentUser?: { uid?: string } | null } } }).__c7_auth_for_probes__?.auth?.currentUser?.uid ?? null).catch(() => 'n/a')
            await L.page.screenshot({ path: `test-results/tonight-probe-${at}-leader.png` }).catch(() => {})
            await M.page.screenshot({ path: `test-results/tonight-probe-${at}-musician.png` }).catch(() => {})
            console.log(`[probe ${at}] server rev=${body?.overrides?.rev ?? 'none'} row=${body?.overrides?.rows?.[row.id]?.fileId ?? 'none'} leaderUser=${await who(L.page)} musicianUser=${await who(M.page)}`)
        }
        try {
            await expect(rowFor(L.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 30_000 })
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 30_000 })

            // A musician has no Swap control.
            await expect(M.page.getByTestId('tonight-swap-button')).toHaveCount(0)

            // Tap 1: Swap. Tap 2: the chart (found by search — the fixture has
            // no moment or shared title with the plan).
            // The label names the chart the row shows now, so it changes with each swap.
            const swapFor = (title: string) => L.page.getByRole('button', { name: `Swap ${title} for tonight`, exact: true })
            const swapBtn = swapFor(row.title)
            await expect(swapBtn).toBeVisible({ timeout: 15_000 }).catch(async (e) => {
                await probe('swap-button')
                throw e
            })
            await swapBtn.click()
            const sheet = L.page.getByTestId('tonight-swap-sheet')
            await expect(sheet).toBeVisible()
            await expect(sheet.getByTestId('tonight-swap-planned')).toBeVisible()
            await expect(sheet.getByTestId('tonight-swap-save')).not.toBeChecked()
            await sheet.getByLabel("Search this site's library").fill(alt.title)
            await sheet.locator(`[data-testid="tonight-swap-candidate"][data-file-id="${alt.fileId}"]`).click({ timeout: 30_000 })
            await expect(sheet).toBeHidden({ timeout: 10_000 })

            // The other iPad follows within 5 seconds, no reload.
            const t0 = Date.now()
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', alt.fileId, { timeout: 5_000 }).catch(async (e) => {
                // Tell a write that never landed apart from a listener that never delivered.
                await probe('swap')
                throw e
            })
            test.info().annotations.push({ type: 'propagation-ms', description: String(Date.now() - t0) })
            console.log(`[timing] swap: musician followed after ${Date.now() - t0}ms`)
            await expect(rowFor(M.page, row.id).getByTestId('tonight-note')).toBeVisible()
            const tL = Date.now()
            // The leader who swapped sees it at once: the page adopts the doc its
            // own transaction committed instead of waiting for the listen echo.
            await expect(rowFor(L.page, row.id)).toHaveAttribute('data-file-id', alt.fileId, { timeout: 5_000 })
            console.log(`[timing] swap: leader showed it ${Date.now() - tL}ms after the musician`)
            await M.page.screenshot({ path: 'test-results/tonight-swap-musician.png' })
            await L.page.screenshot({ path: 'test-results/tonight-swap-leader.png' })

            // The saved setlist is untouched.
            expect(await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)).toBe(before)

            // A signed-out iPad sees it after a reload.
            const anon = await browser.newContext(IPAD)
            try {
                const ap = await anon.newPage()
                await ap.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
                await expect(rowFor(ap, row.id)).toHaveAttribute('data-file-id', alt.fileId, { timeout: 30_000 })
                await expect(ap.getByTestId('tonight-swap-button')).toHaveCount(0)
            } finally {
                await anon.close()
            }

            // The setlist page says so.
            const edit = await L.ctx.newPage()
            await edit.goto(`${baseURL}/setlists/${setlist.setlistId}`, { waitUntil: 'domcontentloaded' })
            await expect(edit.getByTestId('tonight-edit-note').first()).toContainText(
                `Tonight: ${alt.title} (planned: ${row.title})`,
                { timeout: 30_000 },
            )
            await edit.close()

            // Undo = pick the plan in the same sheet.
            await swapFor(alt.title).click()
            await L.page.getByTestId('tonight-swap-planned').click()
            const tU = Date.now()
            await expect(rowFor(L.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 5_000 }).catch(async (e) => {
                await probe('undo-leader')
                throw e
            })
            console.log(`[timing] undo: leader after ${Date.now() - tU}ms`)
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 5_000 }).catch(async (e) => {
                await probe('undo')
                throw e
            })
            console.log(`[timing] undo: musician after ${Date.now() - tU}ms`)

            // Swap again, then Reset to plan.
            await swapBtn.click()
            await L.page.getByTestId('tonight-swap-sheet').getByLabel("Search this site's library").fill(alt.title)
            await L.page.locator(`[data-testid="tonight-swap-candidate"][data-file-id="${alt.fileId}"]`).click({ timeout: 30_000 })
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', alt.fileId, { timeout: 5_000 })
            await L.page.getByTestId('tonight-reset').click()
            const tR = Date.now()
            await expect(rowFor(L.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 5_000 }).catch(async (e) => {
                await probe('reset-leader')
                throw e
            })
            console.log(`[timing] reset: leader after ${Date.now() - tR}ms`)
            await expect(rowFor(M.page, row.id)).toHaveAttribute('data-file-id', planned, { timeout: 5_000 }).catch(async (e) => {
                await probe('reset')
                throw e
            })
            console.log(`[timing] reset: musician after ${Date.now() - tR}ms`)
            await expect(L.page.getByTestId('tonight-reset')).toHaveCount(0)
            console.log('[timing] reset complete: plan on both iPads, Reset control gone')

            expect(await tracksSnapshot(request, baseURL, leaderBearer, setlist.setlistId)).toBe(before)
        } finally {
            await L.ctx.close()
            await M.ctx.close()
        }
    })
})
