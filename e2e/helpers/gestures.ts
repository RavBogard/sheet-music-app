import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared gesture + offline choreography for the iPad/Perform e2e suite (DESIGN §D4).
 *
 * These were copy-pasted across `live-director-gesture.spec.ts` (long-press),
 * `perform-ipad-offline.spec.ts` and `r1-offline-decisive.spec.ts` (offline).
 * Extracted verbatim so new stress specs reuse the SAME, hardware-verified
 * choreography instead of re-deriving it (and re-discovering the
 * `setOffline`-breaks-blob: trap the hard way).
 */

/**
 * Default synthetic long-press hold (ms). 700ms safely clears React's 500ms
 * `useLongPress` threshold under CI clock jitter.
 */
export const LONG_PRESS_HOLD_MS = 700

/**
 * Synthetic long-press on a locator's center: hover → mouse.down → hold → mouse.up.
 * WebKit + `hasTouch` translates this into a `pointerdown` that React's
 * `useLongPress` hook consumes; the 700ms default hold clears the 500ms threshold.
 *
 * Returns the resolved bounding box so callers can additionally assert tap-target
 * geometry (e.g. the 44px iOS HIG floor) without re-measuring.
 */
export async function longPress(
    target: Locator,
    opts: { holdMs?: number } = {},
): Promise<{ x: number; y: number; width: number; height: number }> {
    const holdMs = opts.holdMs ?? LONG_PRESS_HOLD_MS
    const page = target.page()
    const box = await target.boundingBox()
    if (!box) {
        throw new Error('longPress: target has no bounding box (not visible / not attached)')
    }
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.waitForTimeout(holdMs)
    await page.mouse.up()
    return box
}

/**
 * Real-offline: abort all http(s) requests but leave in-memory `blob:` URLs
 * intact, then flip `navigator.onLine=false` + dispatch the `offline` event.
 *
 * NOT Playwright's `context.setOffline(true)` — that ALSO blocks `blob:` URL
 * fetches, which a REAL offline iPad does not. react-pdf reads a cached chart
 * via a `blob:` URL, so `setOffline` yields a FALSE failure. Aborting only
 * http(s) leaves `blob:` intact (true real-offline); the `onLine` flip drives
 * the in-app OFFLINE indicator. (Empirically verified on ipad-webkit vs prod:
 * with setOffline, fetch(blobURL)→"Load failed"; with route-abort, fetch(blobURL)→ok.)
 */
export async function goOffline(page: Page): Promise<void> {
    await page.route(/^https?:\/\//, (r) => r.abort())
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
        window.dispatchEvent(new Event('offline'))
    })
}

/** Reverse {@link goOffline}: drop the http(s) abort route and flip back online. */
export async function goOnline(page: Page): Promise<void> {
    await page.unroute(/^https?:\/\//)
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
        window.dispatchEvent(new Event('online'))
    })
}

/**
 * Poll the `crc-offline` IndexedDB store until a specific chart's bytes are
 * present under its `fileId` key. Used to confirm whole-setlist precache landed
 * before going offline.
 */
export async function waitChartCached(page: Page, fileId: string, timeout = 120_000): Promise<void> {
    await expect
        .poll(
            async () =>
                page.evaluate(async (wantId) => {
                    const db: IDBDatabase = await new Promise((res, rej) => {
                        const open = indexedDB.open('crc-offline')
                        open.onsuccess = () => res(open.result)
                        open.onerror = () => rej(open.error)
                    })
                    try {
                        const keys: string[] = await new Promise((res, rej) => {
                            const r = db.transaction('files', 'readonly').objectStore('files').getAllKeys()
                            r.onsuccess = () => res(r.result as string[])
                            r.onerror = () => rej(r.error)
                        })
                        return keys.includes(wantId)
                    } finally {
                        db.close()
                    }
                }, fileId),
            { timeout, message: `chart ${fileId} must land in crc-offline IDB` },
        )
        .toBe(true)
}
