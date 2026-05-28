import { test, expect, type ConsoleMessage } from '@playwright/test'

/**
 * perform-shell-sw-no-recovery-loop — NEGATIVE regression locking the
 * cycle-9 recovery-loop fingerprint OFF the perform routes.
 *
 * Background: cycle-9 (`f8d7d06a1a`, 2026-05-17) killed the serwist PWA SW
 * because SW + Firestore IDB lifecycle + setTimeout-reload-on-Firestore-
 * shutdown produced an infinite reload loop ("site refreshes within a few
 * seconds" complaint). The fix made auto-reload "architecturally impossible:
 * nothing reloads without user input." Re-introducing a SW for the perform
 * shell could regress this if any of the cycle-9 sites are re-added.
 *
 * This spec locks the absence of the recovery-loop fingerprint:
 *   - No `[FirestoreRecovery]` console line ever fires.
 *   - `DOMContentLoaded` only fires for user-driven reloads, never within
 *     2s of the previous `DOMContentLoaded` (would indicate an auto-reload
 *     was injected between two user reloads).
 *   - `navigator.serviceWorker.controller` URL stays stable across reloads
 *     after first install (the SW does not flap between scriptURLs).
 *
 * On master pre-fix: vacuously passes (no SW, no loop possible).
 * On master post-fix: still passes (the new SW has no controllerchange
 * handler, no setTimeout-reload, no Firestore IDB interaction).
 *
 * If a future commit re-introduces any cycle-9 site (auto-reload on
 * controllerchange, Firestore IDB clear from the SW, setTimeout-reload
 * anywhere), this spec FAILS — that's the point.
 *
 * ── How to run ──
 *   PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *     npx playwright test e2e/perform-shell-sw-no-recovery-loop.spec.ts \
 *       --project=ipad-webkit-landscape --project=chromium --reporter=list
 */

const REPRO_SETLIST_ID = process.env.REPRO_SETLIST_ID ?? 'UnjLqKTtS4lNKQfMY6hB'

const RELOAD_COUNT = 5
const RELOAD_GAP_MS = 2_000
/** Minimum gap between two consecutive `DOMContentLoaded` fires that we DO drive. */
const USER_RELOAD_MIN_GAP_MS = 1_500
/** Any DCL fire <800ms after the previous one is the cycle-9 auto-reload fingerprint. */
const AUTO_RELOAD_FINGERPRINT_THRESHOLD_MS = 800

test.describe('perform-shell-sw-no-recovery-loop — cycle-9 fingerprint must stay off', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit-landscape' && testInfo.project.name !== 'chromium',
            `recovery-loop spec runs only under ipad-webkit-landscape + chromium; current: ${testInfo.project.name}`,
        )
    })

    test('5× user-driven reloads on /perform/setlist/<id> never trigger an auto-reload', async ({ page, baseURL }) => {
        test.setTimeout(120_000)
        if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set')

        // ── Console listener BEFORE navigation ──
        // Captures every console message across all reloads. The
        // `[FirestoreRecovery]` token is the kill-commit's smoking-gun log
        // line for the cycle-9 loop.
        const recoveryLogs: string[] = []
        page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text()
            if (/\[FirestoreRecovery\]/.test(text)) {
                recoveryLogs.push(text)
            }
        })

        // ── DOMContentLoaded timeline tracker ──
        // Initialized inside the page so it survives reloads via
        // sessionStorage. Each DCL appends the timestamp; we read the array
        // out at the end of the test.
        await page.addInitScript(() => {
            window.addEventListener('DOMContentLoaded', () => {
                try {
                    const raw = sessionStorage.getItem('__dcl_timeline__') || '[]'
                    const arr = JSON.parse(raw) as number[]
                    arr.push(Date.now())
                    sessionStorage.setItem('__dcl_timeline__', JSON.stringify(arr))
                } catch {
                    /* sessionStorage unavailable — best-effort */
                }
            })
        })

        // ── Initial navigation ──
        await page.goto(`/perform/setlist/${REPRO_SETLIST_ID}`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('h1').first(), 'setlist heading must render').toBeVisible({ timeout: 20_000 })

        // Wait for the SW to register + take control (post-fix). On master
        // pre-fix this stays null forever; the test's pass criterion does
        // not require a non-null controller.
        const initialControllerUrl = await page.evaluate(
            () => navigator.serviceWorker?.controller?.scriptURL ?? null,
        )

        // ── 5 user-driven reloads, ~2s apart ──
        for (let i = 0; i < RELOAD_COUNT; i++) {
            await page.waitForTimeout(RELOAD_GAP_MS)
            await page.reload({ waitUntil: 'domcontentloaded' })
            await expect(page.locator('h1').first(), `heading visible after reload ${i + 1}`).toBeVisible({
                timeout: 15_000,
            })
        }

        // ── Read timeline + assertions ──
        const dclTimeline = await page.evaluate(() => {
            try {
                const raw = sessionStorage.getItem('__dcl_timeline__') || '[]'
                return JSON.parse(raw) as number[]
            } catch {
                return []
            }
        })

        // 1. No FirestoreRecovery console line ever fired.
        expect(
            recoveryLogs,
            `no [FirestoreRecovery] console line should fire across ${RELOAD_COUNT} reloads (cycle-9 fingerprint)`,
        ).toEqual([])

        // 2. Every DCL fire must be ≥ AUTO_RELOAD_FINGERPRINT_THRESHOLD_MS
        //    after the previous one. We deliberately wait
        //    RELOAD_GAP_MS=2000 between reloads, so any gap below 800ms is
        //    something else triggering DCL — the cycle-9 fingerprint.
        const tooFastGaps: Array<{ index: number; gapMs: number }> = []
        for (let i = 1; i < dclTimeline.length; i++) {
            const gap = dclTimeline[i] - dclTimeline[i - 1]
            if (gap < AUTO_RELOAD_FINGERPRINT_THRESHOLD_MS) {
                tooFastGaps.push({ index: i, gapMs: gap })
            }
        }
        expect(
            tooFastGaps,
            `no DOMContentLoaded should fire <${AUTO_RELOAD_FINGERPRINT_THRESHOLD_MS}ms after another (cycle-9 auto-reload fingerprint). User-driven gap is ${USER_RELOAD_MIN_GAP_MS}+ms.`,
        ).toEqual([])

        // 3. Controller scriptURL must be stable. If a SW exists, it must
        //    not flap between scriptURLs across reloads (would indicate
        //    install→activate→unregister cycling).
        const finalControllerUrl = await page.evaluate(
            () => navigator.serviceWorker?.controller?.scriptURL ?? null,
        )
        if (initialControllerUrl !== null && finalControllerUrl !== null) {
            expect(
                finalControllerUrl,
                'SW controller scriptURL must not change across user-driven reloads (cycle-9 SW-flap fingerprint)',
            ).toBe(initialControllerUrl)
        }
        // If both null (pre-fix master), no SW at all — vacuously OK.
        // If only one is null, the SW was registering during the test —
        // OK as long as scriptURL stayed stable once non-null.

        // 4. Captured DCL count must be ≥ RELOAD_COUNT (we drove 5 user
        //    reloads; if we see < 5, something cut a reload short).
        //    Strict equality would also catch extra DCLs but a transient
        //    early SSR DCL on first goto can append one extra; the
        //    gap-threshold check above already catches the unsafe case.
        expect(
            dclTimeline.length,
            `at least ${RELOAD_COUNT} DOMContentLoaded fires must be recorded (one per user reload)`,
        ).toBeGreaterThanOrEqual(RELOAD_COUNT)
    })
})
