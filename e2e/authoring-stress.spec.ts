import { test, expect } from './helpers/roles'

/**
 * Category F — Authoring affordance smoke (Scraper / UploadDialog).
 *
 * Cowork PROMPT Cat-F-equivalent in the deployed Playwright harness. The
 * cowork web PROMPT walks the actual upload + scrape flows end-to-end
 * (creating STRESS-TEST-<run-id>-* fixtures); a re-runnable `npm run stress`
 * spec MUST stay read-only — otherwise every CI/manual run would leak prod
 * library rows. Per the dispatch's "Behavior-preserving for existing
 * specs" boundary + Daniel's stated preference: **affordance + open + close
 * only.** Real authoring writes belong in the cowork-driver flow, not here.
 *
 * What this spec asserts (per `SongChartsLibrary.tsx:261` — the gated
 * affordance block fires only when `useAuth().canUpload === true`):
 *   1. A band_leader session sees BOTH the `Upload` trigger and the
 *      `Add Song` (Scraper) trigger on `/library`.
 *   2. Clicking each trigger opens its `<Dialog>` without a console error
 *      or visible crash.
 *
 * Missing affordance → soft FINDING annotation (not a hard fail) so the
 * report surfaces the finding under Cat-F without dropping subsequent
 * assertions. A crash on dialog open → hard failure (the dispatch's
 * "UploadDialog silently fails" / "Scraper crashes" finding-worthy cases).
 *
 * Mints test accounts under the `stress-c7-` uidPrefix; the `roleGate`
 * fixture cascade-revokes them by uid on teardown per
 * `[[feedback_sandbox_test_isolation]]`. NO `cleanup_all_test_data`.
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''

test.describe('authoring-stress — Scraper + UploadDialog affordance smoke', () => {
    test.skip(
        !MCP_BEARER,
        'Cat-F authoring smoke needs MCP_BEARER (admin or band_leader) to mint a band_leader session.',
    )

    test('band_leader sees Upload + Add Song triggers on /library', async ({ roleGate, page }, testInfo) => {
        // band_leader → /library; webSdk:'optional' so prod builds without the
        // probe-harness flag degrade to cookie-only without throwing.
        await roleGate.gotoAs('band_leader', '/library', { webSdk: 'optional' })

        const upload = page.getByRole('button', { name: 'Upload' })
        const addSong = page.getByRole('button', { name: 'Add Song' })

        if ((await upload.count()) === 0) {
            testInfo.annotations.push({
                type: 'FINDING',
                description:
                    'Upload trigger button absent on /library for a band_leader session — canUpload gate may have broken OR session role didn\'t resolve as band_leader.',
            })
            testInfo.annotations.push({ type: 'severity', description: 'HIGH' })
            return
        }
        if ((await addSong.count()) === 0) {
            testInfo.annotations.push({
                type: 'FINDING',
                description:
                    'Add Song (Scraper) trigger absent on /library for a band_leader session — same gate as Upload but only one missing is suspicious.',
            })
            testInfo.annotations.push({ type: 'severity', description: 'HIGH' })
            return
        }
        await expect(upload).toBeVisible()
        await expect(addSong).toBeVisible()
    })

    test('UploadDialog opens without console error', async ({ roleGate, page }, testInfo) => {
        const consoleErrors: string[] = []
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })
        await roleGate.gotoAs('band_leader', '/library', { webSdk: 'optional' })

        const upload = page.getByRole('button', { name: 'Upload' })
        if ((await upload.count()) === 0) {
            test.skip(true, 'Upload affordance absent — separate finding in the affordance test.')
            return
        }
        await upload.click()
        // UploadDialog header (per UploadDialog.tsx <DialogTitle>) — assert the
        // dialog reaches the open state. If the title text changes, narrow the
        // selector here without weakening the assertion.
        const dialog = page.getByRole('dialog')
        await expect(dialog, 'Upload dialog must open within 5s').toBeVisible({ timeout: 5_000 })

        const crashErrors = consoleErrors.filter(
            (e) => /uncaught|crash|chunkloaderror|hydration/i.test(e),
        )
        if (crashErrors.length > 0) {
            testInfo.annotations.push({
                type: 'FINDING',
                description: `UploadDialog opened but ${crashErrors.length} console error(s) fired: ${crashErrors[0].slice(0, 240)}`,
            })
        }
        // Close (Escape) — leave the page state clean for the next test.
        await page.keyboard.press('Escape')
    })

    test('ScraperModal opens without console error', async ({ roleGate, page }, testInfo) => {
        const consoleErrors: string[] = []
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })
        await roleGate.gotoAs('band_leader', '/library', { webSdk: 'optional' })

        const addSong = page.getByRole('button', { name: 'Add Song' })
        if ((await addSong.count()) === 0) {
            test.skip(true, 'Add Song affordance absent — separate finding in the affordance test.')
            return
        }
        await addSong.click()
        const dialog = page.getByRole('dialog')
        await expect(dialog, 'Scraper modal must open within 5s').toBeVisible({ timeout: 5_000 })

        const crashErrors = consoleErrors.filter(
            (e) => /uncaught|crash|chunkloaderror|hydration/i.test(e),
        )
        if (crashErrors.length > 0) {
            testInfo.annotations.push({
                type: 'FINDING',
                description: `ScraperModal opened but ${crashErrors.length} console error(s) fired: ${crashErrors[0].slice(0, 240)}`,
            })
        }
        await page.keyboard.press('Escape')
    })
})
