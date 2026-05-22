import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * R1 — REAL-SETLIST render sweep on the standard 11" iPad (WebKit, 820×1180).
 *
 * THE launch-critical check (iPad fleet launch 2026-05-22 Fri-eve + 2026-05-23
 * Shabbat morning): does EVERY bonded chart in tonight's + tomorrow-morning's
 * ACTUAL setlists render correctly on an iPad? This is the bug that would
 * embarrass us in front of the band.
 *
 * READ-ONLY + NO AUTH: `/perform/setlist/[id]` is public-by-design (server-
 * fetches tracks; chart bytes are public per the chart-access policy), so this
 * sweep needs NO MCP_BEARER and mutates NOTHING. It only navigates, opens each
 * chart, observes the render, and screenshots. The real setlists/charts are
 * never touched.
 *
 * Run (against prod, no bearer needed):
 *   PLAYWRIGHT_USE_REMOTE=1 \
 *   PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
 *   npx playwright test e2e/perform-ipad-real-setlists.spec.ts \
 *     --project=ipad-webkit --retries=1
 *
 * Scope which setlists run via R1_RUN (default = both):
 *   R1_RUN=tonight   — only the Fri-eve setlist (fast smoke; 6 charts)
 *   R1_RUN=tomorrow  — only the Shabbat-morning setlist (13 charts)
 *   R1_RUN=both      — both (default)
 *
 * Override the targets (e.g. next week) via R1_SETLISTS as
 * "label:setlistId,label:setlistId".
 *
 * Verdict per chart: RENDERED (a canvas/svg/text/img render signature appears,
 * no error text, no un-noised console error) | AUDIO (gracefully bonded to an
 * audio file — handled, not a crash) | FAILED (error text, crash, or no render
 * signature within timeout). The test FAILS if any chart is FAILED; AUDIO is
 * reported but does not fail (it is a content/data finding, surfaced separately).
 */

const IPAD_PORTRAIT_WIDTH = 820

/** Real targets enumerated from prod Firestore 2026-05-22 (isTest:false). */
const DEFAULT_TARGETS: { label: string; id: string; expectedCharts: number; when: 'tonight' | 'tomorrow' }[] = [
    {
        label: 'kabbalat-shabbat-5-22',
        id: '226309e2-78b7-48af-aa21-6aaf606b4fbe', // "Kabbalat Shabbat — May 22, 2026" (15 trk, 6 bonded charts, all PDF)
        expectedCharts: 6,
        when: 'tonight',
    },
    {
        label: 'shavuot-yizkor-5-23',
        id: 'UnjLqKTtS4lNKQfMY6hB', // "Shavuot Yizkor — May 23" (36 trk, 13 bonded; 12 PDF + 1 audio "Adon Olam.mp3")
        expectedCharts: 13,
        when: 'tomorrow',
    },
]

const RUN = (process.env.R1_RUN ?? 'both').toLowerCase()

function targets() {
    if (process.env.R1_SETLISTS) {
        return process.env.R1_SETLISTS.split(',').map((pair) => {
            const [label, id] = pair.split(':')
            return { label: label.trim(), id: id.trim(), expectedCharts: 0, when: 'tonight' as const }
        })
    }
    return DEFAULT_TARGETS.filter((t) => RUN === 'both' || RUN === t.when)
}

/** Console noise accepted on a real prod load — same set the other iPad specs use.
 *  A react-pdf / WebKit render error ("Invalid PDF", "Failed to load PDF") is NOT
 *  in this set, so a genuine render failure still surfaces. */
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
    // WebKit blob: precache fallback: PDFOverlay resolves an offline/precache
    // `blob:` URL first; if that blob fetch fails under WebKit it logs this and
    // falls back to the network URL — the canvas STILL paints (per-chart RENDERED
    // verdict is the real gate). A real serving failure is an https: 4xx/5xx (the
    // canvas then never paints → FAILED). So the blob:-specific line is noise; the
    // https failure is NOT matched here and stays loud.
    /\[PDFViewer\] Fetch error: Load failed.*blob:/i,
    /^Failed to load resource$/i,
    // The app's own strict CSP blocking an EXTERNAL ancillary resource (analytics/
    // font/pixel) — CSP working as intended, not a Perform regression. Safe to noise:
    // a CSP-blocked CHART would leave the canvas un-painted → a FAILED render verdict
    // (the real gate), which is NOT matched here.
    /Blocked by Content Security Policy/i,
    // The graceful audio-bond diagnostic PDFViewer logs when a row is bonded to an
    // audio file — already captured as the AUDIO verdict (and surfaced to Daniel as a
    // content finding). Not a render failure.
    /bonded to an audio file.*not a chart/i,
]

function trackConsoleErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (CONSOLE_NOISE.some((re) => re.test(text))) return
        errors.push(text)
    })
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    return errors
}

const RENDER_ERROR = /Failed to load|render error|Could not load chart|Chart failed to load|Invalid PDF|chart load timed out/i
const AUDIO_BOND = /bonded to an audio file|not a chart/i

test.describe('R1 real-setlist render sweep (iPad WebKit portrait 820)', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'ipad-webkit',
            `real-setlist sweep runs only under ipad-webkit; current: ${testInfo.project.name}`,
        )
    })

    for (const target of targets()) {
        test(`every chart renders — ${target.label} (${target.id})`, async ({ page, baseURL }) => {
            test.setTimeout(300_000) // up to 13 charts × react-pdf paint against prod
            if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL must be set (run with PLAYWRIGHT_USE_REMOTE=1)')
            const consoleErrors = trackConsoleErrors(page)

            // Track which chart fileId the overlay is fetching, so a FAILED verdict
            // names the offending chart (and whether it retries to success = transient).
            let lastChartFileId = ''
            page.on('request', (r) => {
                const m = r.url().match(/\/api\/drive\/file\/([^/?]+)/)
                if (m) lastChartFileId = decodeURIComponent(m[1])
            })

            // ── Load the public setlist (no auth) ──
            await page.goto(`/perform/setlist/${target.id}`, { waitUntil: 'domcontentloaded' })

            // The setlist heading + at least one chart row must appear (reload-on-miss
            // for the SSR/Firestore first-load settle — the band hits this on venue wifi).
            const heading = page.locator('h1').first()
            await expect(heading, 'setlist heading must render').toBeVisible({ timeout: 20_000 })

            // Bonded chart rows are role=button carrying a key-badge testid. A cold
            // first load against prod can show the heading before its rows hydrate
            // (SSR/Firestore settle — the band hits this on venue wifi); reload-on-miss.
            const chartRows = page.locator('[role="button"]').filter({ has: page.getByTestId('key-badge') })
            for (let attempt = 0; attempt < 5 && (await chartRows.count()) === 0; attempt++) {
                await page.waitForTimeout(1500)
                await page.reload({ waitUntil: 'domcontentloaded' })
                await expect(heading).toBeVisible({ timeout: 25_000 })
                await page.waitForTimeout(1500)
            }
            const rowCount = await chartRows.count()
            // Discovery aid on first run: dump what the page exposes.
            const allButtonNames = await page.locator('[role="button"]').evaluateAll((els) =>
                els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 60)).filter(Boolean),
            )
            console.log(`[R1] ${target.label}: heading="${await heading.textContent()}" chartRows=${rowCount}`)
            console.log(`[R1] ${target.label}: role=button names = ${JSON.stringify(allButtonNames)}`)
            expect(rowCount, 'at least one bonded chart row must be present').toBeGreaterThan(0)

            // ── Open the first chart, then walk the overlay queue with Next ──
            // The live Firestore frame can re-render the row list between locate and
            // click ("Element is not attached to the DOM") on a cold first load — the
            // band hits this on venue wifi too. Retry the open a few times.
            const zoom = page.getByRole('button', { name: /^Zoom (in|out)$/ }).first()
            for (let openTry = 1; openTry <= 4; openTry++) {
                try {
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

            // Classify the current overlay chart: RENDERED | AUDIO | FAILED.
            async function classifyCurrent(): Promise<{ verdict: 'RENDERED' | 'AUDIO' | 'FAILED'; detail: string }> {
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
                return { verdict, detail }
            }

            const verdicts: { idx: number; verdict: 'RENDERED' | 'AUDIO' | 'FAILED'; detail: string }[] = []
            let guard = 0
            // The overlay queue == bonded charts in order. Walk to the end.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                guard++
                if (guard > 40) throw new Error('walk guard tripped (>40 charts) — overlay nav loop?')

                const label = (await counter.textContent().catch(() => null)) ?? `chart ${guard}`

                let { verdict, detail } = await classifyCurrent()

                // A transient "Failed to load PDF" (WebKit blob-precache fallback race)
                // is what a band member resolves by tapping the in-overlay Retry. Do the
                // same once before recording FAILED — so the verdict means "broken even
                // after a retry" (truly launch-blocking), not "flaked once".
                if (verdict === 'FAILED') {
                    const retryBtn = page.getByRole('button', { name: /^retry|retrying/i }).first()
                    if (await retryBtn.isVisible().catch(() => false)) {
                        await retryBtn.click().catch(() => {})
                        const second = await classifyCurrent()
                        verdict = second.verdict
                        detail = `${second.detail} (after in-overlay retry; first attempt: ${detail})`
                    }
                }

                detail = `${detail}${detail ? ' ' : ''}[fileId=${lastChartFileId || 'unknown'}]`
                verdicts.push({ idx: guard, verdict, detail })
                await page.screenshot({
                    path: `test-results/r1-${target.label}-${String(guard).padStart(2, '0')}-${verdict}.png`,
                })
                console.log(`[R1] ${target.label} — ${label}: ${verdict} ${detail}`)

                if (await next.isDisabled().catch(() => true)) break
                await next.click()
                await expect(zoom, 'overlay stays mounted across nav').toBeVisible({ timeout: 15_000 })
                await page.waitForTimeout(400) // let the next chart begin its load
            }

            await page.keyboard.press('Escape').catch(() => {})

            // ── Report + assert ──
            const failed = verdicts.filter((v) => v.verdict === 'FAILED')
            const audio = verdicts.filter((v) => v.verdict === 'AUDIO')
            const rendered = verdicts.filter((v) => v.verdict === 'RENDERED')
            console.log(
                `[R1] ${target.label} SUMMARY: ${rendered.length} RENDERED, ${audio.length} AUDIO, ${failed.length} FAILED of ${verdicts.length} walked`,
            )
            test.info().annotations.push({
                type: 'r1-summary',
                description: `${target.label}: rendered=${rendered.length} audio=${audio.length} failed=${failed.length} | ${verdicts.map((v) => `${v.idx}:${v.verdict}`).join(' ')}`,
            })
            if (consoleErrors.length) console.log(`[R1] ${target.label} CONSOLE ERRORS: ${JSON.stringify(consoleErrors)}`)

            expect(
                failed,
                `charts that FAILED to render in ${target.label}:\n${failed.map((f) => `  #${f.idx}: ${f.detail}`).join('\n')}`,
            ).toEqual([])
            expect(
                consoleErrors,
                `un-noised console/page errors during ${target.label} sweep:\n${consoleErrors.join('\n')}`,
            ).toEqual([])
        })
    }
})
