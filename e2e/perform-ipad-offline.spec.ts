import { test, expect, type BrowserContext, type Page } from '@playwright/test'

import { mintTestAccount, loginAsTestUser, signInWebSdk, revokeTestAccounts } from './helpers/auth'
import { seedPublishedSetlist, uploadFixtureChart, findCuratedPdf, type SeededSetlist } from './helpers/seed'

/**
 * f1-offline-precache — OFFLINE Perform-mode coverage on standard 11" iPad (WebKit).
 *
 * F1 is the biggest live-service risk: shul WiFi drops mid-service and the band
 * loses their charts. This lane wired `prefetchSetlistPDFs` (previously ZERO
 * callers) onto Perform entry two ways — an idle-time auto-precache on mount and
 * an explicit "Save offline" CTA — both writing every bonded chart into the
 * `crc-offline` IndexedDB blob store that `PDFOverlay` already reads from before
 * falling back to network.
 *
 * The REQUIRED Tier-1 repro (prompt §Acceptance): load a setlist online → go
 * offline → charts still render from cache. Proven two ways here:
 *   - probe 1 (idle auto-precache): open the setlist, wait for the Save-offline
 *     control to reach its "saved" state PURELY from the on-mount idle precache
 *     (no tap), go offline, then open a chart → it renders from cache.
 *   - probe 2 (explicit CTA): tap "Save offline", confirm the done state, go
 *     offline, open a chart → renders from cache.
 *
 * Offline-render proof is viewer-agnostic: a TEXT fixture carries a sentinel
 * line only TextScoreViewer can produce, so its presence while `context.setOffline`
 * is true proves the bytes came from IDB, not the network. When the prod library
 * has a curated PDF we ALSO bond one and assert the realistic react-pdf offline
 * render (canvas + no error) — the band's real charts are PDF.
 *
 * Isolation (parallel sweep lanes share prod): mint lane-distinct labels, track
 * every uid, revoke-by-id in afterAll. NEVER cleanup_all_test_data
 * ([[feedback_sandbox_test_isolation]]).
 *
 * Run (against prod, after this lane deploys):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/perform-ipad-offline.spec.ts --project=ipad-webkit --retries=2
 *
 * Skips automatically when MCP_BEARER is unset (CI / local dev safe).
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

/** Standard 11" iPad portrait CSS viewport (Daniel-confirmed 2026-05-20). */
const IPAD_PORTRAIT_WIDTH = 820

/** A line ONLY TextScoreViewer can render verbatim (react-pdf never could). */
const TEXT_SENTINEL = 'f1-offline-cache-sentinel-line'
const TEXT_ROW_TITLE = 'Offline Text Chart'
const PDF_ROW_TITLE = 'Offline PDF Chart'

test.describe('f1-offline-precache — offline chart availability (portrait 820)', () => {
    test.skip(!MCP_BEARER, 'needs MCP_BEARER (admin or band_leader) to mint test users + seed fixtures.')

    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit',
            `offline suite runs only under ipad-webkit; current: ${testInfo.project.name}`,
        )
    })

    let musicianBearer = ''
    let leaderBearer = ''
    let setlist: SeededSetlist | null = null
    let hasPdf = false
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }, testInfo) => {
        if (testInfo.project.name !== 'ipad-webkit') return
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the iPad offline sweep')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'f1-offline-precache-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'f1-offline-precache-musician',
        })
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        // Text fixture with a sentinel line on its own row so TextScoreViewer
        // renders it as one contiguous node (a lyric under a chord line gets
        // split per-chord — see perform-ipad-deep probe 9).
        const textFixture = await uploadFixtureChart(request, baseURL, leaderBearer, {
            title: `f1 offline text fixture — ${new Date().toISOString()}`,
            content: [TEXT_SENTINEL, '', '[Verse]', 'G        D', 'an offline lyric line'].join('\n'),
        })

        // A curated PDF for the realistic react-pdf offline render, if the prod
        // library has one (else the PDF sub-assertion down-grades to a skip).
        const pdf = await findCuratedPdf(request, baseURL, leaderBearer)
        hasPdf = !!pdf

        const tracks = [{ title: TEXT_ROW_TITLE, key: 'G', songId: textFixture.fileId }]
        if (pdf) tracks.push({ title: PDF_ROW_TITLE, key: 'C', songId: pdf.fileId })

        setlist = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `f1 Offline — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks,
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    async function loginAndGoto(context: BrowserContext, page: Page, baseURL: string, path: string) {
        const { customToken } = await loginAsTestUser(context, baseURL, musicianBearer)
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await signInWebSdk(page, customToken ?? '', { required: false })
    }

    /** Reload-on-miss for the SSR/Firestore first-load settle (see perform-ipad-deep). */
    async function awaitRow(page: Page, rowText: string) {
        const row = page.getByText(rowText, { exact: true }).first()
        if (await row.isVisible({ timeout: 12_000 }).catch(() => false)) return
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.reload({ waitUntil: 'domcontentloaded' })
            if (await row.isVisible({ timeout: 15_000 }).catch(() => false)) return
        }
        await expect(row, `row "${rowText}" must render`).toBeVisible({ timeout: 15_000 })
    }

    /** Open a chart row and assert it RENDERS from cache while offline. */
    async function assertOfflineRender(context: BrowserContext, page: Page) {
        // The killer assertion: network is dead, yet a TextScoreViewer-only
        // sentinel line appears → the bytes were served from IndexedDB.
        await page.getByText(TEXT_ROW_TITLE, { exact: true }).first().click()
        await expect(
            page.getByRole('button', { name: /^Zoom (in|out)$/ }).first(),
            'overlay must mount offline',
        ).toBeVisible({ timeout: 15_000 })
        await expect(
            page.getByText(TEXT_SENTINEL, { exact: false }),
            'a cached TEXT chart must render offline (bytes from IndexedDB, network is down)',
        ).toBeVisible({ timeout: 15_000 })
        await page.keyboard.press('Escape').catch(() => {})

        // Realistic react-pdf offline render when a curated PDF was bonded.
        if (hasPdf) {
            await page.getByText(PDF_ROW_TITLE, { exact: true }).first().click()
            await expect(
                page.getByRole('button', { name: /^Zoom (in|out)$/ }).first(),
                'PDF overlay must mount offline',
            ).toBeVisible({ timeout: 15_000 })
            await expect(
                page.locator('canvas').first(),
                'react-pdf must paint a cached PDF offline',
            ).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(/Failed to load|render error|Could not load chart/i)).toHaveCount(0)
            await page.keyboard.press('Escape').catch(() => {})
        }
    }

    test('probe 1 — idle auto-precache: open online, go offline, chart renders from cache (no tap to save)', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!setlist) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${setlist.setlistId}`)
        await awaitRow(page, TEXT_ROW_TITLE)
        await expect(page.locator('h1').first()).toHaveText(setlist.name, { timeout: 15_000 })

        // The Save-offline control reaches "saved" from the ON-MOUNT idle
        // precache alone — proving every bonded chart auto-cached without a tap.
        const saveBtn = page.getByTestId('save-offline')
        await expect(saveBtn, 'Save-offline CTA must be present in the Perform header').toBeVisible({ timeout: 10_000 })
        await expect(saveBtn, 'idle auto-precache must cache the whole setlist on entry').toHaveAttribute(
            'data-state',
            'saved',
            { timeout: 20_000 },
        )

        // WiFi drops.
        await context.setOffline(true)
        await expect(
            page.getByText(/OFFLINE/i).first(),
            'offline indicator must surface when the network drops',
        ).toBeVisible({ timeout: 10_000 })

        await assertOfflineRender(context, page)

        await context.setOffline(false)
    })

    test('probe 2 — explicit "Save offline" CTA: force-cache with done state, then render offline', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!setlist) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${setlist.setlistId}`)
        await awaitRow(page, TEXT_ROW_TITLE)

        const saveBtn = page.getByTestId('save-offline')
        await expect(saveBtn).toBeVisible({ timeout: 10_000 })
        await saveBtn.click()
        // Force-cache completes → persistent "saved" done state.
        await expect(saveBtn, 'CTA must reach the saved done-state after force-cache').toHaveAttribute(
            'data-state',
            'saved',
            { timeout: 20_000 },
        )

        await context.setOffline(true)
        await assertOfflineRender(context, page)
        await context.setOffline(false)
    })

    test('probe 3 — viewport is the real 820px iPad width (no horizontal overflow with the new CTA)', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!setlist) throw new Error('beforeAll did not seed')

        await loginAndGoto(context, page, baseURL, `/perform/setlist/${setlist.setlistId}`)
        await awaitRow(page, TEXT_ROW_TITLE)

        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(
            overflow.scrollWidth,
            `header with the Save-offline CTA must not overflow at 820px: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
        expect(overflow.clientWidth).toBeLessThanOrEqual(IPAD_PORTRAIT_WIDTH)
    })
})
