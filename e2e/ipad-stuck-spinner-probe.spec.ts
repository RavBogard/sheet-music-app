import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

/**
 * ipad-stuck-spinner-probe — Tier-0 diagnostic for F-2 from the
 * `ipad-webkit-prod-sweep`.
 *
 * F-2 (recap): walking `perform-ipad-real-setlists.spec.ts > shavuot-yizkor-5-23`
 * on the iPad WebKit portrait viewport (820×1180) renders rows 1–12 fine, then
 * hangs at row 13 with `no render signature, audio-bond, or error within 25s
 * (stuck spinner?)`. The fileId differs across the initial attempt and the retry
 * (`6ca6e82c-…` vs `12JfLCHy…`) — failure is **position-bound, not chart-bound.**
 *
 * The parent spec's 25-s binary classifier doesn't reveal which subsystem is
 * starving. This probe is **instrumentation-only**: same walk, but at each step
 * we sample DOM state + network counters + storage usage so the mechanism
 * surfaces in the log.
 *
 * Hypotheses under test (see HYPOTHESES.md):
 *   H1 — pdf.js worker leak: `/pdf.worker.mjs` request count climbs monotonically.
 *   H2 — IDB backpressure: `navigator.storage.estimate().usage` climbs; getFile
 *        hangs in-flight under prefetcher write contention.
 *   H3 — WebKit memory pressure: `<canvas>` count climbs (PDFDocumentProxy +
 *        backing stores retained across chart change).
 *   H4 — PDFOverlay prefetch saturation: in-flight `/api/drive/file/*` requests
 *        > 0 at every advance; connection-pool / IDB-write queue clogged.
 *
 * Run (against prod, no bearer needed for the default Shavuot Yizkor target):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   npx playwright test e2e/ipad-stuck-spinner-probe.spec.ts \
 *     --project=ipad-webkit --workers=1 --retries=0 \
 *     --reporter=list 2>&1 | tee .paul/research/ipad-stuck-spinner/probe-run-001.log
 *
 * Override the target via R1_SETLISTS as "label:setlistId,…" (same shape the
 * parent sweep uses). A label of 15+ bonded charts is preferable but not
 * required — the known repro at position 13 in a 13-chart setlist is sufficient.
 *
 * The probe ALWAYS PASSES at the Playwright assertion level (no `expect(failed)`
 * gate — its job is to collect evidence, not to be a regression-guard). The only
 * conditions under which it FAILS are: setlist couldn't be loaded at all (the
 * probe failed to instrument), or the walk guard tripped (>40 charts walked,
 * meaning the Next button never disabled). All chart-by-chart verdicts are
 * informational and live in the structured log.
 */

const IPAD_PORTRAIT_WIDTH = 820

/** Same accept-list the parent sweep uses — keep render-failure signals loud. */
const CONSOLE_NOISE: RegExp[] = [
    /Firebase\s+/i,
    /\[firebase\]/i,
    /@firebase\//i,
    /Cross-Origin-Opener-Policy/i,
    /Failed to load resource: the server responded with a status of 4\d\d/i,
    /service-worker/i,
    /opaque response/i,
    /Could not reach Cloud Firestore backend/i,
    /client is offline/i,
    /code=unavailable/i,
    /ensuring user profile/i,
    /cleardot\.gif/i,
    /\[PDFViewer\] Fetch error: Load failed.*blob:/i,
    /^Failed to load resource$/i,
    /Blocked by Content Security Policy/i,
    /bonded to an audio file.*not a chart/i,
]

const RENDER_ERROR = /Failed to load|render error|Could not load chart|Chart failed to load|Invalid PDF|chart load timed out/i
const AUDIO_BOND = /bonded to an audio file|not a chart/i

const DEFAULT_TARGETS: { label: string; id: string; expectedCharts: number }[] = [
    {
        // Same setlist where F-2 reproduces. 13 bonded charts (12 PDF + 1 audio
        // "Adon Olam.mp3"); walking row 13 is the known failure boundary.
        label: 'shavuot-yizkor-5-23',
        id: 'UnjLqKTtS4lNKQfMY6hB',
        expectedCharts: 13,
    },
]

function targets() {
    if (process.env.R1_SETLISTS) {
        return process.env.R1_SETLISTS.split(',').map((pair) => {
            const [label, id] = pair.split(':')
            return { label: label.trim(), id: id.trim(), expectedCharts: 0 }
        })
    }
    return DEFAULT_TARGETS
}

/**
 * Per-step probe sample. Emitted as one JSON line to stdout per chart, so the
 * run log is grep-friendly.
 */
interface StepSample {
    step: number
    label: string
    counterText: string
    fileId: string
    verdict: 'RENDERED' | 'AUDIO' | 'FAILED'
    detail: string
    ttfrMs: number
    canvasCount: number
    svgCount: number
    imgCount: number
    audioCount: number
    /** Cumulative count of network requests for `/api/drive/file/<id>` since spec start. */
    cumChartFetches: number
    /** Currently-in-flight `/api/drive/file/<id>` requests at the moment of advance. */
    inFlightChartFetches: number
    /** Cumulative count of `pdf.worker.mjs` script-load requests since spec start.
     *  H1's load-bearing counter — climbs with worker churn. */
    cumWorkerFetches: number
    /** `navigator.storage.estimate()` snapshot (best-effort; some WebKit builds
     *  reject under iframe / privacy modes — we record -1 then). */
    storageUsageBytes: number
    storageQuotaBytes: number
    /** Console error count since spec start, AFTER noise filtering. */
    consoleErrorsCum: number
    /** Wall-clock ms since spec start (rough memory-pressure axis surrogate). */
    elapsedMs: number
    /** Number of `.animate-spin` elements (Loader2 instances) in the overlay. */
    spinnerCount: number
    /** Parent text of the first found `.animate-spin` — discriminates between
     *  PDFViewer "Loading Chart..." vs AudioViewer "Loading audio…" vs
     *  react-pdf "Rendering…" vs custom in-overlay spinners. */
    spinnerText: string
    /** Whether `<div class="react-pdf__Document">` exists — present means
     *  PDFViewer reached the <Document> mount stage (got bytes). Absent
     *  means PDFViewer hasn't started rendering yet OR isn't the active viewer. */
    documentExists: boolean
    /** `<audio>` element's `src` attribute, if any — AudioViewer sets this on
     *  IDB-resolve or network fallback. Empty = AudioViewer is still in resolve(). */
    audioElementSrc: string
    /** Head 600 chars of the overlay innerHTML (with class/style/aria stripped)
     *  at sample time — surfaces which viewer mounted on a stuck step. */
    overlayHtmlHead: string
}

test.describe('ipad-stuck-spinner-probe (instrumentation-only)', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit',
            `probe runs only under ipad-webkit; current: ${testInfo.project.name}`,
        )
    })

    for (const target of targets()) {
        test(`walk + sample — ${target.label} (${target.id})`, async ({ page, baseURL }) => {
            // 13 charts × up to 25s timeout + 15s open + per-step screenshot/sample
            // overhead. Generous budget so position-13 hang doesn't cap the run.
            test.setTimeout(420_000)
            if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set (run with PLAYWRIGHT_USE_REMOTE=1)')

            // ── Network counters ──
            let cumChartFetches = 0
            let cumWorkerFetches = 0
            let lastChartFileId = ''
            // Track in-flight by url. Decremented in 'requestfinished' / 'requestfailed'.
            const inFlightChartFetches = new Set<string>()
            page.on('request', (r: Request) => {
                const url = r.url()
                const m = url.match(/\/api\/drive\/file\/([^/?]+)/)
                if (m) {
                    lastChartFileId = decodeURIComponent(m[1])
                    cumChartFetches++
                    inFlightChartFetches.add(url)
                }
                if (/pdf\.worker\.mjs/.test(url)) {
                    cumWorkerFetches++
                }
            })
            const finishHandler = (r: Request) => {
                if (inFlightChartFetches.has(r.url())) inFlightChartFetches.delete(r.url())
            }
            page.on('requestfinished', finishHandler)
            page.on('requestfailed', finishHandler)

            // ── Console-error counters (noise-filtered to match parent sweep) ──
            const consoleErrors: string[] = []
            page.on('console', (msg: ConsoleMessage) => {
                if (msg.type() !== 'error') return
                const text = msg.text()
                if (CONSOLE_NOISE.some((re) => re.test(text))) return
                consoleErrors.push(text)
            })
            page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

            const t0 = Date.now()

            // ── Load the public setlist (no auth) ──
            await page.goto(`/perform/setlist/${target.id}`, { waitUntil: 'domcontentloaded' })

            const heading = page.locator('h1').first()
            await expect(heading, 'setlist heading must render').toBeVisible({ timeout: 20_000 })

            const chartRows = page.locator('[role="button"]').filter({ has: page.getByTestId('key-badge') })
            // Mirror parent F-2 spec's wait pattern: ONLY retry if count is 0
            // (the rows-not-hydrated case). Stay fast — observed on this prod
            // build, the Firestore client listener on unauth clients clears
            // tracks ~3-5s after hydration (permission-denied snapshot replaces
            // SSR's populated state with empty). F-2 succeeded because it
            // clicked within that hydration window. Stability waits push us
            // past it and break the repro.
            for (let attempt = 0; attempt < 5 && (await chartRows.count()) === 0; attempt++) {
                await page.waitForTimeout(1500)
                await page.reload({ waitUntil: 'domcontentloaded' })
                await expect(heading).toBeVisible({ timeout: 25_000 })
                await page.waitForTimeout(1500)
            }
            const rowCount = await chartRows.count()
            console.log(
                `[probe] ${target.label}: heading="${await heading.textContent()}" chartRows=${rowCount} viewport=${IPAD_PORTRAIT_WIDTH}×1180`,
            )
            expect(rowCount, 'at least one bonded chart row must be present to instrument').toBeGreaterThan(0)

            // ── Open the first chart (mirror parent F-2 spec) ──
            const zoom = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
            for (let openTry = 1; openTry <= 4; openTry++) {
                try {
                    if (await zoom.isVisible().catch(() => false)) break // already open
                    const firstRow = chartRows.first()
                    await firstRow.scrollIntoViewIfNeeded({ timeout: 8_000 })
                    await firstRow.click({ timeout: 8_000 })
                    await expect(zoom).toBeVisible({ timeout: 15_000 })
                    break
                } catch (err) {
                    if (openTry === 4) throw err
                    await page.waitForTimeout(800)
                }
            }

            const next = page.getByRole('button', { name: 'Next song' }).first()
            const counter = page.getByText(/^Song \d+ of \d+$/).first()

            /** Wait for a render signature (or AUDIO_BOND, or RENDER_ERROR) for the
             *  current overlay chart. Returns the verdict + how long it took. */
            async function classifyCurrent(): Promise<{
                verdict: 'RENDERED' | 'AUDIO' | 'FAILED'
                detail: string
                ttfrMs: number
            }> {
                const start = Date.now()
                const renderSig = page
                    .locator('canvas, [aria-label="Sheet music score"] svg, img[src*="/api/drive/file/"]')
                    .first()
                const textSig = page.locator('.text-brand.font-bold').first()
                let verdict: 'RENDERED' | 'AUDIO' | 'FAILED' = 'FAILED'
                let detail = ''
                try {
                    await Promise.race([
                        renderSig.waitFor({ state: 'visible', timeout: 25_000 }).then(() => {
                            verdict = 'RENDERED'
                        }),
                        textSig.waitFor({ state: 'visible', timeout: 25_000 }).then(() => {
                            verdict = 'RENDERED'
                            detail = 'text-chart'
                        }),
                        page.getByText(AUDIO_BOND).first().waitFor({ state: 'visible', timeout: 25_000 }).then(() => {
                            verdict = 'AUDIO'
                            detail = 'bonded to audio file'
                        }),
                        page.getByText(RENDER_ERROR).first().waitFor({ state: 'visible', timeout: 25_000 }).then(async () => {
                            verdict = 'FAILED'
                            detail = ((await page.getByText(RENDER_ERROR).first().textContent()) ?? '').slice(0, 120)
                        }),
                    ])
                } catch {
                    verdict = 'FAILED'
                    detail = 'no render signature, audio-bond, or error within 25s (stuck spinner?)'
                }
                return { verdict, detail, ttfrMs: Date.now() - start }
            }

            /** Snapshot DOM + storage in-browser. Resilient: each measurement is
             *  wrapped so one rejection doesn't drop the whole sample. */
            async function snapshot(): Promise<Pick<StepSample,
                'canvasCount' | 'svgCount' | 'imgCount' | 'audioCount' | 'storageUsageBytes' | 'storageQuotaBytes' |
                'spinnerCount' | 'spinnerText' | 'overlayHtmlHead' | 'documentExists' | 'audioElementSrc'
            >> {
                return page.evaluate(async () => {
                    const safeCount = (sel: string) => {
                        try { return document.querySelectorAll(sel).length } catch { return -1 }
                    }
                    let usage = -1, quota = -1
                    try {
                        if (navigator.storage?.estimate) {
                            const e = await navigator.storage.estimate()
                            usage = typeof e.usage === 'number' ? e.usage : -1
                            quota = typeof e.quota === 'number' ? e.quota : -1
                        }
                    } catch { /* swallow */ }
                    // Find the chart-surface region (PDFOverlay's fixed inset-0 z-50
                    // takeover). Its innerHTML head identifies which viewer is mounted
                    // and what state it's in (which spinner text, which loader, etc.).
                    let overlayHtmlHead = ''
                    let spinnerText = ''
                    try {
                        const overlay = document.querySelector('div.fixed.inset-0.z-50')
                        if (overlay) {
                            // Strip class/style soup to keep the head readable.
                            overlayHtmlHead = overlay.innerHTML
                                .replace(/\s+class="[^"]*"/g, '')
                                .replace(/\s+style="[^"]*"/g, '')
                                .replace(/\s+data-[a-z-]+="[^"]*"/g, '')
                                .replace(/\s+aria-[a-z-]+="[^"]*"/g, '')
                                .replace(/\s+/g, ' ')
                                .slice(0, 600)
                            // Look for the parent text of any animate-spin element
                            // (Loader2 + sibling text — the "Loading audio…" /
                            // "Loading Chart..." / "Rendering…" lineage).
                            const spinners = overlay.querySelectorAll('.animate-spin')
                            for (const s of Array.from(spinners)) {
                                const p = s.parentElement
                                if (p) {
                                    const t = (p.textContent ?? '').trim()
                                    if (t) { spinnerText = t.slice(0, 80); break }
                                }
                            }
                        }
                    } catch { /* swallow */ }
                    // Did react-pdf <Document> mount at all? Its rendered class is
                    // `react-pdf__Document`. Absent = PDFViewer didn't mount or hasn't
                    // reached the <Document> stage (still in fetch-bytes phase).
                    const documentExists = safeCount('.react-pdf__Document') > 0
                    let audioElementSrc = ''
                    try {
                        const a = document.querySelector('audio')
                        audioElementSrc = a?.getAttribute('src') ?? ''
                    } catch { /* swallow */ }
                    return {
                        canvasCount: safeCount('canvas'),
                        svgCount: safeCount('svg'),
                        imgCount: safeCount('img'),
                        audioCount: safeCount('audio'),
                        storageUsageBytes: usage,
                        storageQuotaBytes: quota,
                        spinnerCount: safeCount('.animate-spin'),
                        spinnerText,
                        overlayHtmlHead,
                        documentExists,
                        audioElementSrc,
                    }
                })
            }

            const samples: StepSample[] = []
            let guard = 0
            // The overlay queue == bonded charts in order. Walk to the end.
            while (guard < 40) {
                guard++
                if (guard > 40) throw new Error('walk guard tripped (>40 charts) — overlay nav loop?')

                const counterText = (await counter.textContent().catch(() => null)) ?? `chart ${guard}`

                // Sample the in-flight count at the moment of advance / at the start
                // of each chart — H4's load-bearing signal.
                const inFlightAtAdvance = inFlightChartFetches.size

                const { verdict, detail, ttfrMs } = await classifyCurrent()

                const snap = await snapshot()
                const fileIdAtStep = lastChartFileId || 'unknown'

                const sample: StepSample = {
                    step: guard,
                    label: target.label,
                    counterText,
                    fileId: fileIdAtStep,
                    verdict,
                    detail,
                    ttfrMs,
                    ...snap,
                    cumChartFetches,
                    inFlightChartFetches: inFlightAtAdvance,
                    cumWorkerFetches,
                    consoleErrorsCum: consoleErrors.length,
                    elapsedMs: Date.now() - t0,
                }
                samples.push(sample)
                // Grep-friendly emit: prefix [SAMPLE], one JSON per line.
                console.log(`[SAMPLE] ${JSON.stringify(sample)}`)

                // Screenshots at the transition into the failure zone — F-2 puts
                // the boundary at step 13 in shavuot-yizkor-5-23. Take steps 12,
                // 13, 14 (or last reachable). Always take the LAST step too.
                if (guard === 12 || guard === 13 || guard === 14) {
                    await page.screenshot({
                        path: `test-results/probe-${target.label}-${String(guard).padStart(2, '0')}-${verdict}.png`,
                        fullPage: false,
                    })
                }

                if (await next.isDisabled().catch(() => true)) {
                    // Final-step screenshot (even if it's not 12/13/14).
                    await page.screenshot({
                        path: `test-results/probe-${target.label}-${String(guard).padStart(2, '0')}-final-${verdict}.png`,
                        fullPage: false,
                    })
                    break
                }
                await next.click()
                await expect(zoom, 'overlay stays mounted across nav').toBeVisible({ timeout: 15_000 })
                // 400 ms dwell — matches parent sweep's pacing (lets the next chart
                // begin its load, gives prefetcher idle-callback time to fire).
                await page.waitForTimeout(400)
            }

            await page.keyboard.press('Escape').catch(() => {})

            // ── Summary block ──
            const rendered = samples.filter((s) => s.verdict === 'RENDERED').length
            const audio = samples.filter((s) => s.verdict === 'AUDIO').length
            const failed = samples.filter((s) => s.verdict === 'FAILED').length
            const failedSteps = samples.filter((s) => s.verdict === 'FAILED').map((s) => s.step)

            // Trajectory analysis: deltas between first sample and last sample,
            // and (if reached) step 12 → step 13 deltas. This is what FINDINGS.md
            // grounds the SUPPORT / REFUTE / INCONCLUSIVE verdicts on.
            const first = samples[0]
            const last = samples[samples.length - 1]
            const s12 = samples.find((s) => s.step === 12) ?? null
            const s13 = samples.find((s) => s.step === 13) ?? null

            const summary = {
                label: target.label,
                setlistId: target.id,
                steps: samples.length,
                rendered,
                audio,
                failed,
                failedSteps,
                walkElapsedMs: last ? last.elapsedMs : 0,
                trajectory_first_to_last: first && last ? {
                    canvasDelta: last.canvasCount - first.canvasCount,
                    svgDelta: last.svgCount - first.svgCount,
                    imgDelta: last.imgCount - first.imgCount,
                    storageUsageDelta: last.storageUsageBytes - first.storageUsageBytes,
                    workerFetchesDelta: last.cumWorkerFetches - first.cumWorkerFetches,
                    chartFetchesDelta: last.cumChartFetches - first.cumChartFetches,
                } : null,
                trajectory_step12_to_step13: s12 && s13 ? {
                    canvasDelta: s13.canvasCount - s12.canvasCount,
                    svgDelta: s13.svgCount - s12.svgCount,
                    imgDelta: s13.imgCount - s12.imgCount,
                    storageUsageDelta: s13.storageUsageBytes - s12.storageUsageBytes,
                    workerFetchesDelta: s13.cumWorkerFetches - s12.cumWorkerFetches,
                    chartFetchesDelta: s13.cumChartFetches - s12.cumChartFetches,
                    s12_verdict: s12.verdict,
                    s13_verdict: s13.verdict,
                    s12_ttfrMs: s12.ttfrMs,
                    s13_ttfrMs: s13.ttfrMs,
                } : null,
                consoleErrors,
            }
            console.log(`[PROBE-SUMMARY] ${JSON.stringify(summary)}`)

            // Always-PASS assertion model: the probe's job is to collect evidence,
            // not to fail the run on a stuck spinner. We DO assert the instrumentation
            // itself worked — i.e. we walked at least 1 step. A truly catastrophic
            // failure (couldn't even open the overlay) would have thrown earlier.
            expect(samples.length, 'must have walked at least one step').toBeGreaterThan(0)
        })
    }
})
