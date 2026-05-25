import { test, expect, type Page } from '@playwright/test'

/**
 * perform-ipad-pwa-fresh-install — Tier-0 spec extension that closes the
 * ipad-webkit-prod-sweep §Coverage gap "No PWA fresh-install spec
 * (cold-boot, no service worker cached)".
 *
 * The band-launch gating scenario: a band iPad in incognito mode, OR a
 * freshly-installed PWA, OR a manually-cleared browser state
 * ([[project_band_ipads_incognito_state]] — 2026-05-23 Yizkor: band iPads
 * were in incognito → no Dexie persistence, no authed listeners).
 *
 * The hypothesis under test: in a true cold-boot state (empty IDB, blocked
 * service workers, no cached chart bytes), can a user enter Perform on a
 * real public prod setlist and get chart bytes loaded successfully via the
 * explicit-tap path? F-4 (idle auto-precache failure) lives one layer above
 * this — even WITHOUT working idle precache, the band must still be able
 * to open charts by tapping them.
 *
 * ── Cold-boot mechanism (Phase-1 decision; documented in FINDINGS.md) ──
 * Three options were considered (new `ipad-webkit-fresh-install` project /
 * per-test IDB-clear fixture / `test.use({ serviceWorkers: 'block' })`).
 * Chosen: `test.use({ serviceWorkers: 'block' })` at describe level + rely
 * on Playwright's default per-test fresh `BrowserContext` (empty IDB,
 * empty localStorage, empty cookies). Cleanest: no playwright.config.ts
 * diff, no new project, no fixture machinery — the cold-boot guarantees
 * are declarative.
 *
 * Run (against prod, no bearer needed — uses the public Shavuot Yizkor
 * setlist that the stuck-spinner-probe + audio-bond-prod-verify already
 * target):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   npx playwright test e2e/perform-ipad-pwa-fresh-install.spec.ts \
 *     --project=ipad-webkit --workers=1 --retries=0 --reporter=list
 *
 * Override the target with REPRO_SETLIST_ID (real published setlist id).
 */

const IPAD_PORTRAIT_WIDTH = 820

/**
 * Default target: the public Shavuot Yizkor setlist `UnjLqKTtS4lNKQfMY6hB`
 * (13 bonded charts: 12 PDF + 1 audio "Adon Olam.mp3"). Already the default
 * for `e2e/ipad-stuck-spinner-probe.spec.ts` + `audio-bond-prod-verify`'s
 * verify gate — keeps the cold-boot run grounded in the same prod surface.
 * `Fiddley Tune.pdf` is the first row → first-tap exercises the PDF cold-boot
 * dispatch path.
 */
const REPRO_SETLIST_ID = process.env.REPRO_SETLIST_ID ?? 'UnjLqKTtS4lNKQfMY6hB'

/** Render-error signals the audio-viewer-blob-url-fix lane standardized on. */
const RENDER_ERROR =
    /Failed to load|render error|Could not load chart|Chart failed to load|Invalid PDF|chart load timed out|Audio file not found/i

/**
 * Assert the fresh-install state at the moment of page navigation: no
 * service worker installed/controlling the page, no pre-existing IDB
 * databases owned by this origin. The serviceWorkers:'block' context
 * option guarantees the SW gate; the empty-IDB assertion guards against
 * the (unlikely) case that test isolation breaks. Done in a single
 * page.evaluate() so the cold-boot proof lives inline with the run.
 */
async function assertColdBootState(page: Page) {
    const state = await page.evaluate(async () => {
        const swController = navigator.serviceWorker?.controller ?? null
        const swRegistrations = navigator.serviceWorker
            ? (await navigator.serviceWorker.getRegistrations()).length
            : 0
        const idbDbs =
            'databases' in indexedDB && typeof (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases === 'function'
                ? await (indexedDB as IDBFactory & { databases: () => Promise<{ name?: string }[]> }).databases()
                : []
        return {
            hasSwController: swController !== null,
            swRegistrations,
            idbDbNames: idbDbs.map((d) => d.name ?? '').filter(Boolean),
            localStorageLen: localStorage.length,
        }
    })
    expect(state.hasSwController, 'cold-boot: no service worker should be controlling the page').toBe(false)
    expect(state.swRegistrations, 'cold-boot: no service worker registrations').toBe(0)
    expect(
        state.idbDbNames.filter((n) => n === 'crc-offline').length,
        'cold-boot: crc-offline IDB store must not pre-exist',
    ).toBe(0)
    expect(state.localStorageLen, 'cold-boot: localStorage must be empty').toBe(0)
    return state
}

test.describe('perform-ipad-pwa-fresh-install — cold-boot Perform render (portrait 820)', () => {
    // The cold-boot guarantee: block service-worker registration at the
    // context level. Combined with Playwright's default per-test fresh
    // BrowserContext, this gives empty IDB + empty localStorage + empty
    // cookies + no SW cache layer — the band-incognito / PWA-fresh state.
    test.use({ serviceWorkers: 'block' })

    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit',
            `fresh-install spec runs only under ipad-webkit; current: ${testInfo.project.name}`,
        )
    })

    test('cold-boot → public setlist → first chart bytes load via explicit tap', async ({ page, baseURL }) => {
        // 13 charts walk is NOT exercised here (that's the stuck-spinner probe's
        // job); this spec only asserts FIRST-tap from cold-boot works. Generous
        // budget anyway so SSR settle + first-PDF-fetch don't cap the run.
        test.setTimeout(120_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set (run with PLAYWRIGHT_USE_REMOTE=1)')

        // ── Cold-boot navigation ──
        // The very first hit on the origin from this fresh context: no SW
        // registered, no IDB content, no cookies. Identical state to a band
        // iPad in incognito mode (the 2026-05-23 Yizkor scenario).
        await page.goto(`/perform/setlist/${REPRO_SETLIST_ID}`, { waitUntil: 'domcontentloaded' })

        const coldBoot = await assertColdBootState(page)
        console.log(`[cold-boot-state] ${JSON.stringify(coldBoot)}`)

        // ── Setlist must render via SSR (no auth, public-by-design) ──
        const heading = page.locator('h1').first()
        await expect(heading, 'setlist heading must render from cold-boot SSR').toBeVisible({ timeout: 20_000 })

        // Bonded chart rows (mirror the stuck-spinner probe's selector — keyed
        // by the key-badge testid so non-bonded rows don't match).
        const chartRows = page.locator('[role="button"]').filter({ has: page.getByTestId('key-badge') })
        // Same hydration retry pattern as the probe — unauth client listeners
        // can clear tracks ~3-5s after SSR, so the first-tap must land within
        // the hydration window.
        for (let attempt = 0; attempt < 5 && (await chartRows.count()) === 0; attempt++) {
            await page.waitForTimeout(1500)
            await page.reload({ waitUntil: 'domcontentloaded' })
            await expect(heading).toBeVisible({ timeout: 25_000 })
            await page.waitForTimeout(1500)
        }
        const rowCount = await chartRows.count()
        console.log(
            `[fresh-install] heading="${await heading.textContent()}" chartRows=${rowCount} viewport=${IPAD_PORTRAIT_WIDTH}×1180`,
        )
        expect(rowCount, 'at least one bonded chart row must render from cold-boot SSR').toBeGreaterThan(0)

        // ── Explicit tap: open the first chart ──
        // F-4 (idle auto-precache failure) lives one layer above this assertion —
        // we don't depend on idle precache for the cold-boot first-render gate.
        const firstRow = chartRows.first()
        await firstRow.scrollIntoViewIfNeeded({ timeout: 8_000 })
        await firstRow.click({ timeout: 8_000 })

        const zoom = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
        await expect(zoom, 'Perform overlay must mount from cold-boot first-tap').toBeVisible({ timeout: 15_000 })

        // ── Chart bytes must load ──
        // Same render-signature classifier as the stuck-spinner probe — covers
        // PDF (canvas) + MusicXML (svg) + image (img) + audio (audio); any of
        // the four counts as a successful cold-boot first-render.
        const renderSig = page
            .locator(
                'canvas, [aria-label="Sheet music score"] svg, img[src*="/api/drive/file/"], audio[src*="/api/drive/file/"]',
            )
            .first()
        await expect(
            renderSig,
            'a chart byte-signature (canvas/svg/img/audio) must appear within 25s from cold-boot',
        ).toBeVisible({ timeout: 25_000 })

        // No render-error text — explicit guard against the silent-failure
        // class where the overlay mounts but the viewer renders an error
        // message instead of bytes.
        await expect(
            page.getByText(RENDER_ERROR),
            'no render-error text should surface for the first cold-boot chart',
        ).toHaveCount(0)

        // ── Optional witness: IDB starts empty, then the viewer writes bytes ──
        // After a successful first render we expect SOMETHING in `crc-offline`
        // (PDFOverlay/AudioViewer cache the bytes they fetched). This isn't a
        // hard pre-F1 assertion — IDB writes are best-effort under WebKit —
        // so we record it rather than gate on it.
        const postRenderIdb = await page.evaluate(async () => {
            const dbs =
                'databases' in indexedDB
                    ? await (indexedDB as IDBFactory & { databases: () => Promise<{ name?: string }[]> }).databases()
                    : []
            return dbs.map((d) => d.name ?? '').filter(Boolean)
        })
        console.log(`[post-render-idb] ${JSON.stringify(postRenderIdb)}`)

        // No-overflow sanity at the 820 portrait width (matches f1-offline
        // probe 3's overflow check — keeps the cold-boot path honest about
        // the real iPad viewport).
        const overflow = await page.evaluate(() => {
            const el = document.scrollingElement || document.documentElement
            return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        })
        expect(
            overflow.scrollWidth,
            `Perform overlay must not horizontal-overflow at 820px in cold-boot: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)

        await page.screenshot({
            path: `test-results/pwa-fresh-install-01-first-render.png`,
            fullPage: false,
        })
    })
})
