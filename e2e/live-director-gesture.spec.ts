import { test, expect } from '@playwright/test'

import { mintTestAccount, revokeTestAccounts } from './helpers/auth'
import { longPress } from './helpers/gestures'
import { signInAndGoto } from './helpers/roles'
import { seedPublishedSetlist, type SeededSetlist } from './helpers/seed'

/**
 * live-director-gesture — band-leader long-press → action sheet → write.
 *
 * Hardware target: standard 11" iPad (820×1180 portrait, WebKit). The
 * gesture exists for Daniel + Bryn during a live service; Playwright's
 * mouse-pressed-for-700ms approximates the iOS finger-hold well enough
 * to verify the React handler + Sheet mount + KeyPicker write.
 *
 * Two acceptance bars:
 *   1. Band-leader iPad — a ~700ms hold on a song row opens the action
 *      sheet with all three options (change key / swap chart / insert new song).
 *      Picking "Change key" → "D" lands the patch in the live Dexie row,
 *      which feeds the on-screen `data-testid="key-badge"`.
 *   2. Musician iPad — the SAME hold does NOT open the sheet (auth gate
 *      `band_leader || admin` is inert). The native tap still opens the
 *      chart, so the gesture is invisible by design.
 *
 * The per-test sign-in (`signInAndGoto`) and the long-press synthesis
 * (`longPress`) are the shared DESIGN §D3/§D4 helpers — this spec is one of
 * their consuming proofs. The seed band_leader is reused across all three
 * tests (it owns the setlist the change-key test edits), so it is minted in
 * `beforeAll` rather than via the per-test `roleGate` fixture.
 *
 * Run (against prod):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   MCP_BEARER=crl_live_...   # admin or band_leader \
 *   npx playwright test e2e/live-director-gesture.spec.ts --project=ipad-webkit
 */

const MCP_BEARER = process.env.MCP_BEARER ?? ''
const TAP_TARGET_MIN = 44

test.describe('live-director-gesture — band-leader long-press → action sheet', () => {
    test.skip(
        !MCP_BEARER,
        'live-director-gesture needs MCP_BEARER (admin or band_leader) to mint a leader + musician + seed a setlist.',
    )

    test.beforeEach(({}, testInfo) => {
        test.skip(
            !testInfo.project.name.startsWith('ipad-webkit'),
            `runs only under ipad-webkit project(s); current: ${testInfo.project.name}`,
        )
    })

    let leaderBearer = ''
    let musicianBearer = ''
    let seeded: SeededSetlist | null = null
    let firstTrackTitle = ''
    const createdUids: string[] = []

    test.beforeAll(async ({ request, baseURL }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set for the live-director gesture spec')

        const leader = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'band_leader',
            label: 'live-director-leader',
        })
        leaderBearer = leader.token
        createdUids.push(leader.uid)

        const musician = await mintTestAccount(request, baseURL, MCP_BEARER, {
            role: 'musician',
            label: 'live-director-musician',
        })
        musicianBearer = musician.token
        createdUids.push(musician.uid)

        firstTrackTitle = `Live Director Track One — ${Date.now()}`
        seeded = await seedPublishedSetlist(request, baseURL, leaderBearer, {
            name: `live-director-gesture UAT — ${new Date().toISOString()}`,
            eventDate: new Date().toISOString().slice(0, 10),
            tracks: [
                { title: firstTrackTitle, key: 'C' },
                { title: `Live Director Track Two — ${Date.now()}`, key: 'G' },
            ],
            audience: 'band',
        })
    })

    test.afterAll(async ({ request, baseURL }) => {
        if (!baseURL || createdUids.length === 0) return
        await revokeTestAccounts(request, baseURL, MCP_BEARER, createdUids)
    })

    test('band-leader long-press on a setlist row → opens the live-director action sheet', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        await signInAndGoto(context, page, baseURL, leaderBearer, `/perform/setlist/${seeded.setlistId}`, {
            webSdk: 'required',
        })

        // First song row.
        const row = page.getByRole('button', { name: new RegExp(firstTrackTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
        await expect(row, 'seeded track row must be visible').toBeVisible({ timeout: 15_000 })

        // Synthetic long-press: hover center, mouse-down, hold > 500ms, mouse-up.
        // WebKit + hasTouch translates this into a pointerdown that React's
        // useLongPress hook consumes; the 700ms hold safely clears the 500ms
        // threshold under CI clock jitter. longPress() returns the row box so we
        // can also assert the iOS tap-target floor.
        const box = await longPress(row)
        expect(
            box.height,
            `row height ${box.height}px is below the ${TAP_TARGET_MIN}px iOS HIG floor`,
        ).toBeGreaterThanOrEqual(TAP_TARGET_MIN)

        // Action sheet header + chooser tiles.
        const sheet = page.getByRole('dialog')
        await expect(sheet, 'live-director action sheet must mount').toBeVisible({ timeout: 5_000 })
        await expect(sheet.getByRole('button', { name: /change key/i })).toBeVisible()
        await expect(sheet.getByRole('button', { name: /swap chart/i })).toBeVisible()
        await expect(sheet.getByRole('button', { name: /insert new song/i })).toBeVisible()
    })

    test('band-leader change-key → Dexie patch lands → key badge updates on the row', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        await signInAndGoto(context, page, baseURL, leaderBearer, `/perform/setlist/${seeded.setlistId}`, {
            webSdk: 'required',
        })

        const row = page.getByRole('button', { name: new RegExp(firstTrackTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
        await expect(row).toBeVisible({ timeout: 15_000 })

        // Verify the initial badge — C from the seed.
        const badge = row.locator('[data-testid="key-badge"]').first()
        await expect(badge).toHaveText('C', { timeout: 10_000 })

        // Long-press the row → action sheet.
        await longPress(row)

        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible({ timeout: 5_000 })
        await sheet.getByRole('button', { name: /change key/i }).click()

        // KeyPicker trigger renders the current key ("C") as its label.
        await sheet.getByRole('button', { name: /^C$/ }).click()
        await sheet.getByRole('button', { name: /^D$/ }).click()

        // Sheet closes on commit; badge reflects the new key after the
        // Firestore→Dexie roundtrip (≤2s on good prod WiFi).
        await expect(badge).toHaveText('D', { timeout: 15_000 })
    })

    test('musician iPad — same hold does NOT open the action sheet (auth gate)', async ({
        context,
        page,
        baseURL,
    }) => {
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')
        if (!seeded) throw new Error('beforeAll did not seed a setlist')

        await signInAndGoto(context, page, baseURL, musicianBearer, `/perform/setlist/${seeded.setlistId}`, {
            webSdk: 'optional',
        })

        const row = page.getByRole('button', { name: new RegExp(firstTrackTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
        await expect(row).toBeVisible({ timeout: 15_000 })

        await longPress(row)

        // The dialog NEVER appears on a musician iPad. Wait a beat to give
        // any wrongly-mounted sheet time to render, then assert absence.
        await page.waitForTimeout(500)
        await expect(page.getByRole('dialog')).toHaveCount(0)
    })
})
