import { test, expect } from '@playwright/test'

/**
 * WAVE1 Bug 2 — why fit-page rendered every chart ~21% undersized.
 *
 * `PDFViewer` measures its scroll container with a `ResizeObserver` and feeds
 * `entry.contentRect.height` into `computeFitPageWidth`. `contentRect` is the
 * CONTENT box: it EXCLUDES padding. The container carried `pb-32` (128px), so
 * the fit-page height budget was `visibleHeight - 128 - 4`.
 *
 * This spec is the ground truth for that claim — it measures the real
 * `ResizeObserver` in real Chromium and real iPad WebKit rather than trusting
 * the API docs. The jsdom test
 * `src/components/music/__tests__/pdf-fit-page-measurement.test.tsx` models the
 * behaviour proven here and applies it to the component.
 *
 * NO SERVER, NO AUTH, NO NETWORK. Run with:
 *
 *   PLAYWRIGHT_USE_REMOTE=1 npx playwright test e2e/resize-observer-padding.spec.ts \
 *     --project=ipad-webkit --project=chromium
 */

/** iPad landscape (1180x820) minus the 112px two-row perform toolbar. */
const VISIBLE_H = 755
const PAD_BOTTOM = 128 // pb-32
/** US Letter portrait: 11 / 8.5. */
const LETTER_ASPECT = 11 / 8.5

async function observe(page: import('@playwright/test').Page, paddingBottom: number) {
    await page.setContent(`
        <!doctype html><html><head><style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          #box {
            width: 600px; height: ${VISIBLE_H}px;
            overflow: auto; background: #ccc;
            padding-bottom: ${paddingBottom}px;
          }
          #inner { height: 50px; }
        </style></head><body>
          <div id="box"><div id="inner"></div></div>
        </body></html>`)

    return page.evaluate(() => {
        const box = document.getElementById('box') as HTMLElement
        return new Promise<{ contentRectHeight: number; clientHeight: number }>((resolve) => {
            const ro = new ResizeObserver((entries) => {
                for (const e of entries) {
                    ro.disconnect()
                    resolve({ contentRectHeight: e.contentRect.height, clientHeight: box.clientHeight })
                }
            })
            ro.observe(box)
        })
    })
}

test.describe('ResizeObserver.contentRect vs padding (WAVE1 Bug 2)', () => {
    test('contentRect.height EXCLUDES padding-bottom — the measured height under-reports', async ({ page }) => {
        const r = await observe(page, PAD_BOTTOM)
        // clientHeight includes the padding; contentRect.height does not.
        expect(r.clientHeight).toBe(VISIBLE_H)
        expect(r.contentRectHeight).toBeCloseTo(VISIBLE_H - PAD_BOTTOM, 0)
    })

    test('with no padding the measured height matches what is actually available', async ({ page }) => {
        const r = await observe(page, 0)
        expect(r.contentRectHeight).toBeCloseTo(VISIBLE_H, 0)
        expect(r.contentRectHeight).toBeCloseTo(r.clientHeight, 0)
    })

    test('quantifies the fit-page shortfall the padding caused', async ({ page }) => {
        const padded = await observe(page, PAD_BOTTOM)
        const unpadded = await observe(page, 0)

        // computeFitPageWidth's height branch, with PDFViewer's 4px slack.
        const fitWidth = (measured: number) => (measured - 4) / LETTER_ASPECT

        const before = fitWidth(padded.contentRectHeight)
        const after = fitWidth(unpadded.contentRectHeight)

        // Characterization measured 481px rendered. It also quoted "583px
        // available", which used the raw 755 without the viewer's 4px slack;
        // the slack-inclusive figure is 580.3px. Both agree on the defect.
        expect(before).toBeCloseTo(481.4, 0)
        expect(after).toBeCloseTo(580.3, 0)

        // CORRECTION to the characterization's "~21% undersized": the shortfall
        // is 17.0% OF THE AVAILABLE WIDTH (481.4 / 580.3 = 0.830). The 21% is
        // the same defect measured from the other base — removing the padding
        // makes the chart 20.5% BIGGER (580.3 / 481.4 = 1.205). Asserting the
        // shortfall base here because that is what "renders undersized" means.
        const shortfall = 1 - before / after
        expect(shortfall).toBeGreaterThan(0.16)
        expect(shortfall).toBeLessThan(0.18)
        expect(after / before - 1).toBeGreaterThan(0.20)
    })
})
