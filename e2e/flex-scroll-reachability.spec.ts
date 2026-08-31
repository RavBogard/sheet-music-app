import { test, expect, type Page } from '@playwright/test'

/**
 * WAVE1 Bug 1 — the centring-crop mechanism, measured in REAL engines.
 *
 * The defect: a flex item wider than its scroll container, centred with
 * `justify-content: center`, has its start edge placed at a NEGATIVE offset
 * from the scroll origin. On a zoomed chart that stranded left slice is the
 * clef, key signature and first beat of every system — the exact thing a
 * musician zooms in to read.
 *
 * ── MEASURED ENGINE DIFFERENCE (2026-08-31, this repo's pinned browsers) ─────
 * container 805px, content 1602px (820x1180 iPad portrait, US Letter @ 200%):
 *
 *   engine    justify-center            scrollLeft range   scrollWidth
 *   Chromium  child left @ -398.5px     [0, 399]           1204  <- 398px LOST
 *   WebKit    child left @ -398.5px     [-398, 399]        1602  <- reachable
 *
 * So Chromium strands 398px with NO recovery (scrollWidth is short by exactly
 * the overflow), while WebKit gives the scroller a NEGATIVE scroll origin so
 * the region is reachable — but only if the user discovers a *backwards* swipe,
 * because the resting position (scrollLeft 0) still shows the MIDDLE of the
 * page with the clef off-screen. Both engines therefore fail the same
 * user-facing property, which is what this spec asserts:
 *
 *   AT THE RESTING SCROLL POSITION, THE START EDGE OF THE MUSIC MUST BE VISIBLE,
 *   AND THE SCROLLABLE EXTENT MUST COVER THE WHOLE CONTENT BOX.
 *
 * The fix — remove the centring keyword, centre with `margin-inline: auto` —
 * satisfies both in both engines. Auto margins absorb only POSITIVE free space
 * (CSS Flexbox L1 §9.5: "Otherwise, set all auto margins ... to zero"), so they
 * centre small content and collapse to 0 on overflow. That rule predates every
 * shipping flexbox implementation, unlike `justify-content: safe center` which
 * Safari/iOS Safari only gained in **17.6** (caniuse
 * mdn-css_properties_justify-content_flex_context_safe_unsafe) — too new to bet
 * a live service on, since an iPad held back on iPadOS 17.0-17.5 would drop the
 * whole declaration.
 *
 * NO SERVER, NO AUTH, NO NETWORK — everything is `page.setContent`. Run with:
 *
 *   PLAYWRIGHT_USE_REMOTE=1 npx playwright test e2e/flex-scroll-reachability.spec.ts \
 *     --project=ipad-webkit --project=chromium
 *
 * (`PLAYWRIGHT_USE_REMOTE=1` only suppresses playwright.config's `webServer`;
 * no remote origin is contacted.)
 */

/** iPad-class numbers from the characterization probe: 820x1180 portrait,
 *  US Letter page at 200% zoom => ~1602px of content in a ~805px container. */
const CONTAINER_W = 805
const CONTAINER_H = 700
const WIDE_CONTENT_W = 1602
const TALL_CONTENT_H = 1400
/** Content SMALLER than the container — the case centring exists to serve. */
const NARROW_CONTENT_W = 400
const SHORT_CONTENT_H = 300

interface Reach {
    /** Offset of the child's start edge from the container's start edge at the
     *  RESTING scroll position (scrollLeft/scrollTop = 0). Negative => the start
     *  of the music is off-screen the moment the chart renders. */
    startGapAtRest: number
    /** Offset of the child's start edge at the MINIMUM reachable scroll offset. */
    startGapAtMin: number
    /** Gap from the child's end edge to the container's end edge at MAX scroll. */
    endGapAtMax: number
    /** Total reachable scroll travel (max - min). */
    scrollTravel: number
    scrollSize: number
    clientSize: number
}

async function measure(
    page: Page,
    opts: { containerCss: string; childCss: string; childW: number; childH: number; axis: 'x' | 'y' },
): Promise<Reach> {
    await page.setContent(`
        <!doctype html><html><head><style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #eee; }
          #scroller {
            width: ${CONTAINER_W}px; height: ${CONTAINER_H}px;
            overflow: auto; display: flex; background: #ccc;
            ${opts.containerCss}
          }
          #child {
            width: ${opts.childW}px; height: ${opts.childH}px; flex: 0 0 auto;
            background: linear-gradient(90deg, #f00 0 8px, #06f 8px 100%);
            ${opts.childCss}
          }
        </style></head><body>
          <div id="scroller"><div id="child"></div></div>
        </body></html>`)

    return page.evaluate((axis) => {
        const s = document.getElementById('scroller') as HTMLElement
        const c = document.getElementById('child') as HTMLElement
        const gapStart = () =>
            axis === 'x'
                ? c.getBoundingClientRect().left - s.getBoundingClientRect().left
                : c.getBoundingClientRect().top - s.getBoundingClientRect().top
        const gapEnd = () =>
            axis === 'x'
                ? s.getBoundingClientRect().right - c.getBoundingClientRect().right
                : s.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom
        const pos = () => (axis === 'x' ? s.scrollLeft : s.scrollTop)
        const setPos = (v: number) => {
            if (axis === 'x') s.scrollLeft = v
            else s.scrollTop = v
        }

        setPos(0)
        const startGapAtRest = gapStart()
        setPos(-99999)
        const min = pos()
        const startGapAtMin = gapStart()
        setPos(99999)
        const max = pos()
        const endGapAtMax = gapEnd()

        return {
            startGapAtRest,
            startGapAtMin,
            endGapAtMax,
            scrollTravel: max - min,
            scrollSize: axis === 'x' ? s.scrollWidth : s.scrollHeight,
            clientSize: axis === 'x' ? s.clientWidth : s.clientHeight,
        }
    }, opts.axis)
}

test.describe('scroll reachability of a centred, overflowing flex item', () => {
    // ── The defect, asserted in a way that is TRUE IN BOTH ENGINES ──────────
    test('DEFECT — justify-content:center puts the start of the music off-screen at rest', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'justify-content: center;',
            childCss: '',
            childW: WIDE_CONTENT_W,
            childH: 400,
            axis: 'x',
        })
        // (805 - 1602) / 2 = -398.5 — the clef/key-signature slice.
        expect(r.startGapAtRest).toBeCloseTo((CONTAINER_W - WIDE_CONTENT_W) / 2, 0)
        expect(r.startGapAtRest).toBeLessThan(-100)
    })

    test('DEFECT — justify-center is NOT rescued by also setting margin-inline:auto', async ({ page }) => {
        // `mx-auto` alone is not the fix. Auto margins absorb only POSITIVE free
        // space (Flexbox L1 §9.5); with negative free space they resolve to 0 and
        // `justify-content: center` still applies. The centring keyword must GO.
        const r = await measure(page, {
            containerCss: 'justify-content: center;',
            childCss: 'margin-inline: auto;',
            childW: WIDE_CONTENT_W,
            childH: 400,
            axis: 'x',
        })
        expect(r.startGapAtRest).toBeLessThan(-100)
    })

    test('DEFECT (cross axis) — align-items:center puts the TOP of the music off-screen at rest', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'align-items: center;',
            childCss: '',
            childW: 400,
            childH: TALL_CONTENT_H,
            axis: 'y',
        })
        expect(r.startGapAtRest).toBeCloseTo((CONTAINER_H - TALL_CONTENT_H) / 2, 0)
        expect(r.startGapAtRest).toBeLessThan(-100)
    })

    // ── The fix ────────────────────────────────────────────────────────────
    test('FIX — justify-start + margin-inline:auto: start edge visible at rest, whole box reachable', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'justify-content: flex-start;',
            childCss: 'margin-inline: auto;',
            childW: WIDE_CONTENT_W,
            childH: 400,
            axis: 'x',
        })
        // The chart opens showing the clef, not the middle of the bar.
        expect(r.startGapAtRest).toBeCloseTo(0, 0)
        // No stranded region in EITHER direction.
        expect(r.startGapAtMin).toBeCloseTo(0, 0)
        expect(r.endGapAtMax).toBeGreaterThanOrEqual(-1)
        // The scrollable extent covers the full content box (Chromium's
        // justify-center bug shows up here as a scrollWidth short by the overflow).
        expect(r.scrollSize).toBeCloseTo(WIDE_CONTENT_W, 0)
        expect(r.scrollTravel).toBeCloseTo(WIDE_CONTENT_W - CONTAINER_W, 0)
    })

    test('FIX — margin-inline:auto still CENTRES content narrower than the container', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'justify-content: flex-start;',
            childCss: 'margin-inline: auto;',
            childW: NARROW_CONTENT_W,
            childH: 300,
            axis: 'x',
        })
        expect(r.startGapAtRest).toBeCloseTo((CONTAINER_W - NARROW_CONTENT_W) / 2, 0)
        expect(r.scrollTravel).toBe(0)
    })

    test('FIX (cross axis) — items-start + margin-block:auto: top edge visible at rest, whole box reachable', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'align-items: flex-start;',
            childCss: 'margin-block: auto;',
            childW: 400,
            childH: TALL_CONTENT_H,
            axis: 'y',
        })
        expect(r.startGapAtRest).toBeCloseTo(0, 0)
        expect(r.startGapAtMin).toBeCloseTo(0, 0)
        expect(r.endGapAtMax).toBeGreaterThanOrEqual(-1)
        expect(r.scrollSize).toBeCloseTo(TALL_CONTENT_H, 0)
        expect(r.scrollTravel).toBeCloseTo(TALL_CONTENT_H - CONTAINER_H, 0)
    })

    test('FIX (cross axis) — margin-block:auto still CENTRES content shorter than the container', async ({ page }) => {
        const r = await measure(page, {
            containerCss: 'align-items: flex-start;',
            childCss: 'margin-block: auto;',
            childW: 400,
            childH: SHORT_CONTENT_H,
            axis: 'y',
        })
        expect(r.startGapAtRest).toBeCloseTo((CONTAINER_H - SHORT_CONTENT_H) / 2, 0)
    })
})
