import { test, expect } from '@playwright/test'

import { goOffline } from './helpers/gestures'

/**
 * R1 DECISIVE offline test (coder-3, exec-perform-ux) — settles whether the
 * seeded offline-probe failures are a fixture artifact or a real launch risk.
 *
 * The seeded authed probes fail two ways: save-offline stuck at data-state="idle"
 * (whole-setlist precache never completes) + a fresh PDF won't paint offline. The
 * DEPLOYED repro passes but only proves "cache one chart, keep it OPEN through the
 * drop" — it never opens a fresh chart while fully offline. This test runs the
 * STRICT real-band scenario on REAL prod data (no auth, no seeding, no fixture
 * confound): Save-offline → reach "saved" → go fully offline → open a chart FRESH.
 *
 * Run: PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   npx playwright test e2e/r1-offline-decisive.spec.ts --project=ipad-webkit --workers=1
 */

const SETLIST_ID = process.env.DECISIVE_SETLIST_ID ?? 'UnjLqKTtS4lNKQfMY6hB' // tomorrow Shavuot Yizkor
const PDF_ROW = process.env.DECISIVE_PDF_ROW ?? 'Fiddley Tune'
const PDF_FILEID = process.env.DECISIVE_PDF_FILEID ?? '11w4r08HnXYR-eRFzcMIs-ud4k1Ut1jwB'

// goOffline now lives in ./helpers/gestures (DESIGN §D4), shared verbatim.

test('R1 decisive — real setlist: Save-offline reaches saved, fresh chart paints fully offline', async ({
    page,
    baseURL,
}) => {
    test.setTimeout(240_000)
    if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

    const visibleRow = () => page.getByText(PDF_ROW, { exact: true }).filter({ visible: true }).first()
    const zoom = () => page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()

    // ── ONLINE: load the real published setlist (public-by-design) ──
    await page.goto(`/perform/setlist/${SETLIST_ID}`, { waitUntil: 'domcontentloaded' })
    for (let attempt = 0; attempt < 4; attempt++) {
        if (await visibleRow().isVisible({ timeout: 12_000 }).catch(() => false)) break
        await page.reload({ waitUntil: 'domcontentloaded' })
    }
    await expect(visibleRow(), `bonded PDF row "${PDF_ROW}" must render`).toBeVisible({ timeout: 15_000 })

    // ── The exact assertion that stuck on the seeded suite: whole-setlist precache ──
    const saveBtn = page.getByTestId('save-offline')
    await expect(saveBtn, 'Save-offline CTA present on deployed prod').toBeVisible({ timeout: 15_000 })
    await saveBtn.click()
    await expect(
        saveBtn,
        'Save-offline must reach data-state="saved" (whole-setlist precache complete) on a REAL setlist',
    ).toHaveAttribute('data-state', 'saved', { timeout: 180_000 })

    // ── Go FULLY offline, then open the chart FRESH (never opened online) ──
    await goOffline(page)
    await expect(page.getByText(/OFFLINE/i).first(), 'offline indicator must surface').toBeVisible({ timeout: 10_000 })

    await visibleRow().click()
    await expect(zoom(), 'overlay mounts offline on a fresh open').toBeVisible({ timeout: 15_000 })
    await expect(
        page.locator('canvas').first(),
        'react-pdf must paint a FRESH cached PDF fully offline (the real band scenario)',
    ).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/Failed to load|render error|Could not load chart/i)).toHaveCount(0)

    // Keystone: the chart's bytes are independently present in IDB offline.
    const cached = await page.evaluate(async (fileId) => {
        const db: IDBDatabase = await new Promise((res, rej) => {
            const o = indexedDB.open('crc-offline')
            o.onsuccess = () => res(o.result)
            o.onerror = () => rej(o.error)
        })
        const entry: { data?: ArrayBuffer } = await new Promise((res, rej) => {
            const r = db.transaction('files', 'readonly').objectStore('files').get(fileId)
            r.onsuccess = () => res(r.result)
            r.onerror = () => rej(r.error)
        })
        db.close()
        return { present: !!entry?.data, bytes: entry?.data?.byteLength ?? 0 }
    }, PDF_FILEID)
    expect(cached.present, `chart ${PDF_FILEID} bytes must be in crc-offline IDB`).toBe(true)
    console.log(`[R1-decisive] ${PDF_ROW} cached offline: ${cached.bytes} bytes`)
})
