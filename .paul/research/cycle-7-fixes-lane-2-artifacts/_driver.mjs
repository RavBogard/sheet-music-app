// Cycle-7-fixes Lane 2 — iPad-Mini REPRO driver
// Verifies C7I2-001 / C7I2-002 / C7I2-003 fixes against deployed master.

import { chromium, devices } from '@playwright/test'
import { promises as fs } from 'fs'

const ART_DIR = '.paul/research/cycle-7-fixes-lane-2-artifacts'
const BASE_URL = 'https://www.centralreform.live'

async function readBearer() {
    const raw = await fs.readFile('C:/Users/dsbog/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers', 'utf8')
    const line = raw.split(/\r?\n/).find(l => /ASSIGNMENT=cycle-7-fixes-lane-2\b/.test(l) && !/^#/.test(l))
    if (!line) throw new Error('bearer not found')
    return line.split(/\s+/)[0]
}

async function mintSession(adminBearer) {
    const mintRes = await fetch(`${BASE_URL}/api/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminBearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_test_account', arguments: { role: 'band_leader', uidPrefix: 'c7fl2' } } }),
    })
    const raw = await mintRes.text()
    const m = raw.match(/data: ({.*})\s*$/m)
    if (!m) throw new Error('mint failed: ' + raw.slice(0, 400))
    const outer = JSON.parse(m[1])
    if (outer.error) throw new Error('mint error: ' + JSON.stringify(outer.error))
    const inner = JSON.parse(outer.result.content[0].text)
    const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
        method: 'POST', headers: { authorization: `Bearer ${inner.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ uid: inner.uid }),
    })
    const setCookie = sesRes.headers.get('set-cookie') || ''
    const cm = setCookie.match(/__session=([^;]+)/)
    if (!cm) throw new Error('session-cookie mint failed: ' + (await sesRes.text()).slice(0, 400))
    return { uid: inner.uid, role: inner.role, token: inner.token, sessionCookie: cm[1] }
}

async function cleanupTestData(adminBearer) {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminBearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'cleanup_all_test_data', arguments: { uidPrefix: 'c7fl2' } } }),
    })
    return (await res.text()).slice(0, 800)
}

async function main() {
    const ver = await fetch(`${BASE_URL}/api/version`).then(r => r.json())
    console.log(`[boot] prod SHA: ${ver.sha}`)

    const bearer = await readBearer()
    const ses = await mintSession(bearer)
    console.log(`[boot] minted test session uid=${ses.uid} role=${ses.role}`)

    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
        ...devices['iPad Mini'],
        locale: 'en-US',
        timezoneId: 'America/Chicago',
    })
    await ctx.addCookies([{
        name: '__session', value: ses.sessionCookie,
        domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
    }])

    const out = { prodSha: ver.sha, mintedUid: ses.uid }

    // =====================================================================
    // REPRO-L2-card-title-iPad-Mini  (C7I2-001)
    // =====================================================================
    {
        const page = await ctx.newPage()
        await page.goto(`${BASE_URL}/setlists`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
        await page.waitForTimeout(2500)

        await page.screenshot({ path: `${ART_DIR}/r1-setlists-fullpage.png`, fullPage: true })

        // Crop to upcoming services region
        const region = await page.evaluate(() => {
            const heading = Array.from(document.querySelectorAll('*'))
                .find(el => /upcoming services/i.test(el.textContent || '') && el.children.length === 0)
            if (!heading) return null
            const section = heading.closest('section') || heading.parentElement?.parentElement
            if (!section) return null
            const r = section.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
        })
        if (region) {
            await page.screenshot({
                path: `${ART_DIR}/r1-upcoming-services-cropped.png`,
                clip: { x: Math.max(0, region.x), y: Math.max(0, region.y), width: Math.min(region.w, 768), height: Math.min(region.h, 700) },
            })
        }

        // Measure each card's title cell width
        const cards = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('article')).map(c => {
                const r = c.getBoundingClientRect()
                const titleEl = c.querySelector('h1, h2, h3, h4, h5, h6')
                const titleR = titleEl?.getBoundingClientRect()
                // Action buttons inside the card
                const actionBtns = Array.from(c.querySelectorAll('button, a[role="button"], [role="button"]'))
                    .map(b => {
                        const br = b.getBoundingClientRect()
                        const cs = getComputedStyle(b)
                        return { tag: b.tagName.toLowerCase(), label: b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 30), w: Math.round(br.width), h: Math.round(br.height), visible: cs.display !== 'none' && br.width > 0 && br.height > 0 }
                    })
                    .filter(b => b.visible)
                return {
                    cardW: Math.round(r.width),
                    title: titleEl?.textContent?.trim().slice(0, 80) || null,
                    titleW: titleR ? Math.round(titleR.width) : null,
                    titleH: titleR ? Math.round(titleR.height) : null,
                    titleX: titleR ? Math.round(titleR.x) : null,
                    actionLabels: actionBtns.map(b => `${b.label}(${b.w}px)`),
                }
            }).filter(c => c.title && c.title.length > 0)
        })
        out.repro_l2_card_title = { cards }
        console.log(`[r1] ${cards.length} cards found; titleWidths=`, cards.slice(0, 3).map(c => `"${c.title}":${c.titleW}px`).join(' '))
        await page.close()
    }

    // =====================================================================
    // REPRO-L2-chart-spinner-timeout  (C7I2-002)
    // Force invalid fileId → error UI within ≤15s with Retry + Back affordances
    // =====================================================================
    {
        const page = await ctx.newPage()
        const invalidId = 'L2_INVALID_FILEID_FOR_REPRO_xyz123'
        const start = Date.now()
        await page.goto(`${BASE_URL}/perform/${invalidId}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        // Wait up to 18s for the error UI to appear
        let errorUiVisibleAt = null
        for (let i = 0; i < 36; i++) {
            const visible = await page.evaluate(() => {
                const body = document.body.innerText || ''
                return /Couldn[’']t load chart|Chart not found|Sign in/i.test(body) && /Retry|Sign in|Back|Library/i.test(body)
            })
            if (visible) { errorUiVisibleAt = Date.now() - start; break }
            await page.waitForTimeout(500)
        }
        await page.screenshot({ path: `${ART_DIR}/r2-perform-invalid-error.png`, fullPage: true })

        const ui = await page.evaluate(() => {
            const body = document.body.innerText || ''
            const buttons = Array.from(document.querySelectorAll('button, a'))
                .map(b => (b.textContent || '').trim())
                .filter(t => /Retry|Sign in|Back|Library/i.test(t))
            return { bodyText: body.slice(0, 800), affordances: buttons }
        })
        out.repro_l2_spinner_timeout = {
            invalidId,
            errorUiVisibleAtMs: errorUiVisibleAt,
            withinTimeout: errorUiVisibleAt !== null && errorUiVisibleAt <= 16000,
            affordances: ui.affordances,
            bodyText: ui.bodyText,
        }
        console.log(`[r2] error UI visible at ${errorUiVisibleAt}ms; affordances=${ui.affordances.join('|')}`)
        await page.close()
    }

    // =====================================================================
    // REPRO-L2-library-row-clipping  (C7I2-003)
    // =====================================================================
    {
        const page = await ctx.newPage()
        await page.goto(`${BASE_URL}/library`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
        await page.waitForTimeout(3000)

        await page.screenshot({ path: `${ART_DIR}/r3-library-fullpage.png`, fullPage: true })

        // Find the longest-named row and measure its leftmost text x-coord
        const rowProbe = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('button, [role="button"]'))
                .filter(r => {
                    const txt = (r.textContent || '').trim()
                    return txt.length > 40 && /[a-zA-Z]/.test(txt)
                })
            const measurements = rows.slice(0, 30).map(r => {
                const rect = r.getBoundingClientRect()
                const cs = getComputedStyle(r)
                // Try to find the displayName div (the bold font row)
                const nameEl = r.querySelector('.font-bold, [class*="font-bold"]')
                const nameRect = nameEl?.getBoundingClientRect()
                return {
                    text: (r.textContent || '').trim().slice(0, 80),
                    rowX: Math.round(rect.x),
                    rowW: Math.round(rect.width),
                    rowJustify: cs.justifyContent,
                    nameX: nameRect ? Math.round(nameRect.x) : null,
                    nameW: nameRect ? Math.round(nameRect.width) : null,
                    nameOverflowsLeft: nameRect ? nameRect.x < rect.x - 1 : null,
                    nameOverflowsRight: nameRect ? (nameRect.x + nameRect.width) > (rect.x + rect.width + 1) : null,
                }
            })
            const adonaiOzRow = measurements.find(m => /adonai oz/i.test(m.text)) || null
            return { count: rows.length, rows: measurements, adonaiOzRow }
        })
        out.repro_l2_library_row = rowProbe
        console.log(`[r3] longRow Adonai Oz: leftOverflow=${rowProbe.adonaiOzRow?.nameOverflowsLeft} justify=${rowProbe.adonaiOzRow?.rowJustify}`)
        await page.close()
    }

    await browser.close()

    // Cleanup test fixtures
    const cleanup = await cleanupTestData(bearer)
    out.cleanup = cleanup.slice(0, 400)

    await fs.writeFile(`${ART_DIR}/_summary.json`, JSON.stringify(out, null, 2))
    console.log('[done] summary at', `${ART_DIR}/_summary.json`)
    console.log('verdicts:',
        `C7I2-001 cards=${out.repro_l2_card_title?.cards?.length || 0}`,
        `C7I2-002 errorUiAt=${out.repro_l2_spinner_timeout?.errorUiVisibleAtMs}ms`,
        `C7I2-003 adonaiOzLeftOverflow=${out.repro_l2_library_row?.adonaiOzRow?.nameOverflowsLeft}`,
    )
}

main().catch(err => { console.error(err); process.exit(1) })
