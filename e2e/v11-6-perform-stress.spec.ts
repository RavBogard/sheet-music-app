/**
 * v11.6-01 — Live Perform stress sweep (DISCOVERY / characterization).
 *
 * Drives the DEPLOYED prod surface (set PLAYWRIGHT_BASE_URL=https://www.centralreform.live)
 * against the three real upcoming Camp Sabra weekend setlists, on the real 11" iPad-WebKit
 * viewport (ipad-webkit 820×1180 portrait + ipad-webkit-landscape 1180×820), exercising the
 * band's reading path: open set → open a chart (PDF + text/plain) → transpose → next/prev nav →
 * zoom/Fit → plus a WIFI-DROP cell (offline mid-read).
 *
 * CHARACTERIZATION sweep, not an assertion gate: every cell is wrapped so an observed defect is
 * RECORDED (console errors, failed requests, screenshots, notes) without aborting sibling cells.
 * Anon-reads only (err-public); never authenticates, mutates, or publishes.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live npx playwright test \
 *     e2e/v11-6-perform-stress.spec.ts --project=ipad-webkit --project=ipad-webkit-landscape
 */
import { test, expect, type Page } from '@playwright/test'

type Obs = { set: string; cell: string; ok: boolean; note: string }

const SETS = [
  {
    id: 'a84f8cce-176e-4b5e-9653-4df71db6f5ba',
    name: 'Shir Shabbat — Juneteenth (all PDF)',
    openSong: /Strange Fruit/i, // bonded PDF row
  },
  {
    id: '7e005452-7c42-4cdc-b27d-ff0c78b6667b',
    name: 'Camp Sabra — Havdalah (mostly text/plain)',
    openSong: /Wagon Wheel/i, // bonded text/plain row
  },
  {
    id: '7c640a8a-358e-48ee-8523-6b8a0eca9d05',
    name: 'Camp Sabra — Staff Concert (all text/plain)',
    openSong: /Wonderwall/i, // bonded text/plain row
  },
]

async function safe(obs: Obs[], set: string, cell: string, fn: () => Promise<string>) {
  try {
    obs.push({ set, cell, ok: true, note: await fn() })
  } catch (e) {
    obs.push({ set, cell, ok: false, note: (e as Error).message?.slice(0, 250) ?? 'error' })
  }
}

// Screenshots must never hang the test (a heavy PDF fullPage shot can stall WebKit headless).
async function shoot(page: Page, path: string) {
  await page.screenshot({ path, timeout: 12_000 }).catch(() => {})
}

function wireDiagnostics(page: Page, consoleErrors: string[], failedReq: string[]) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 250))
  })
  page.on('requestfailed', (r) =>
    failedReq.push(`${r.method()} ${r.url().slice(0, 140)} — ${r.failure()?.errorText ?? '?'}`),
  )
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 250)))
}

const OVERLAY = 'div.fixed.inset-0.z-50'

for (const set of SETS) {
  test(`perform sweep — ${set.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const obs: Obs[] = []
    const consoleErrors: string[] = []
    const failedReq: string[] = []
    wireDiagnostics(page, consoleErrors, failedReq)

    // --- Cell: load + HYDRATE (wait for the real song-row buttons to mount) ---
    await safe(obs, set.id, 'load-setlist', async () => {
      const resp = await page.goto(`/perform/setlist/${set.id}`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading').first().waitFor({ timeout: 30_000 })
      // Rows hydrate client-side from Dexie/Firestore after first paint — wait for the target row.
      await page.getByRole('button', { name: set.openSong }).first().waitFor({ timeout: 30_000 })
      return `status=${resp?.status()} heading="${(await page.getByRole('heading').first().textContent())?.trim()?.slice(0, 50)}"`
    })
    await shoot(page, testInfo.outputPath('01-listing.png'))

    await safe(obs, set.id, 'enumerate-rows', async () => {
      const total = await page.getByRole('button').count()
      const offlineSaved = await page.getByRole('button', { name: /saved for offline|Saved/i }).count()
      return `buttons(post-hydration)=${total}; offline-saved-indicator=${offlineSaved > 0}`
    })

    // --- Cell: open the known bonded chart ---
    await safe(obs, set.id, 'open-chart', async () => {
      await page.getByRole('button', { name: set.openSong }).first().click({ timeout: 8000 })
      await page.locator(OVERLAY).first().waitFor({ timeout: 25_000 })
      const pos = await page.getByText(/Song \d+ of \d+/).first().textContent().catch(() => null)
      return `overlay open; position="${pos ?? 'n/a'}"`
    })
    await shoot(page, testInfo.outputPath('02-chart-open.png'))

    // --- Cell: transpose (key for the text/plain camp sets — TXT-1 chord drift) ---
    await safe(obs, set.id, 'transpose', async () => {
      const trigger = page
        .getByTestId('transpose-trigger-mobile')
        .or(page.getByTestId('transpose-trigger-desktop'))
        .or(page.getByRole('button', { name: /^transpose$/i }))
        .first()
      const present = await trigger.count()
      if (!present) return 'no transpose control on this chart type (expected for PDF)'
      await trigger.click({ timeout: 6000 })
      await page.getByRole('button', { name: 'Transpose up' }).first().click({ timeout: 5000 })
      await page.getByRole('button', { name: 'Transpose up' }).first().click({ timeout: 5000 })
      await shoot(page, testInfo.outputPath('03-transposed.png'))
      await page.getByRole('button', { name: 'Transpose down' }).first().click({ timeout: 5000 })
      await page.keyboard.press('Escape').catch(() => {})
      return 'transpose +2 / -1 applied (check 03-transposed.png for chord alignment — TXT-1)'
    })

    // --- Cell: zoom + Fit ---
    await safe(obs, set.id, 'zoom-fit', async () => {
      const zin = page.getByRole('button', { name: 'Zoom in' }).first()
      if (!(await zin.count())) return 'no zoom control present'
      await zin.click({ timeout: 5000 })
      await zin.click({ timeout: 5000 })
      await page.getByRole('button', { name: /Fit chart to width/ }).first().click({ timeout: 5000 }).catch(() => {})
      return 'zoom +2 then Fit reset'
    })

    // --- Cell: next/prev navigation ---
    await safe(obs, set.id, 'nav-next-prev', async () => {
      const next = page.getByRole('button', { name: 'Next song' }).first()
      const prev = page.getByRole('button', { name: 'Previous song' }).first()
      const before = (await page.getByText(/Song \d+ of \d+/).first().textContent().catch(() => '?'))?.trim()
      await next.click({ timeout: 5000 })
      await page.waitForTimeout(700)
      const afterNext = (await page.getByText(/Song \d+ of \d+/).first().textContent().catch(() => '?'))?.trim()
      await prev.click({ timeout: 5000 })
      await page.waitForTimeout(700)
      const afterPrev = (await page.getByText(/Song \d+ of \d+/).first().textContent().catch(() => '?'))?.trim()
      return `before="${before}" afterNext="${afterNext}" afterPrev="${afterPrev}"`
    })
    await shoot(page, testInfo.outputPath('04-after-nav.png'))

    // --- Cell: WIFI-DROP (off-site resilience — does the open set survive?) ---
    await safe(obs, set.id, 'wifi-drop', async () => {
      await page.context().setOffline(true)
      const visibleOffline = await page.locator(OVERLAY).first().isVisible().catch(() => false)
      let navOffline: string
      try {
        await page.getByRole('button', { name: 'Next song' }).first().click({ timeout: 5000 })
        await page.waitForTimeout(1500)
        const pos = (await page.getByText(/Song \d+ of \d+/).first().textContent().catch(() => '?'))?.trim()
        navOffline = `next-while-offline → "${pos}"`
      } catch (e) {
        navOffline = 'next-tap failed offline: ' + (e as Error).message.slice(0, 100)
      }
      await shoot(page, testInfo.outputPath('05-offline.png'))
      await page.context().setOffline(false)
      return `openChartVisibleOffline=${visibleOffline}; ${navOffline}`
    })

    await testInfo.attach('observations.json', {
      body: JSON.stringify(
        { set: set.name, id: set.id, project: testInfo.project.name, obs, consoleErrors, failedReq },
        null,
        2,
      ),
      contentType: 'application/json',
    })
    console.log(
      `\n[SWEEP ${testInfo.project.name}] ${set.name}\n` +
        obs.map((o) => `  ${o.ok ? 'PASS' : 'FAIL'} ${o.cell}: ${o.note}`).join('\n') +
        `\n  consoleErrors(${consoleErrors.length}): ${consoleErrors.slice(0, 6).join(' | ')}` +
        `\n  failedRequests(${failedReq.length}): ${failedReq.slice(0, 6).join(' | ')}\n`,
    )

    expect(obs.find((o) => o.cell === 'load-setlist')?.ok, 'setlist page must load + hydrate').toBeTruthy()
  })
}
