// MusicXML Phase-2 UX REPRO — fit-to-screen + de-jank transpose on deployed iPad WebKit (820x1180).
// Reuses the Phase-1 harness (Web-SDK client auth via __c7_auth_for_probes__).
//
// Usage:
//   node probe-phase2-ux.mjs            -> injects a fresh multi-system chart, probes, prints FILE_ID
//   FILE_ID=upload-... LABEL=fix node probe-phase2-ux.mjs   -> reuse an existing chart (before/after)
//
// Outputs: phase2-<LABEL>-out.json + phase2-<LABEL>-{initial,transposed}.png
import { webkit, devices } from '@playwright/test'
import { readRootBearer, mcp, BASE_URL } from '../musicxml-health-artifacts/mcp.mjs'
import { promises as fs } from 'fs'

const LABEL = process.env.LABEL || 'run'
const PREFIX = 'ZZ-MXLP2'

// --- Fixture: N measures, D major (2 sharps), one note + harmony chord per measure.
// MEASURES=4 -> short single-system score (demonstrates fit enlargement);
// MEASURES=24 (default) -> multi-system score (scroll + no-regression). ---
const N_MEASURES = +(process.env.MEASURES || 24)
function buildMultiSystemXml() {
    const steps = ['D', 'E', 'F', 'G', 'A', 'B', 'C', 'D']
    const alters = { F: 1, C: 1 } // D major
    const chordRoots = ['D', 'G', 'A', 'B', 'E', 'A', 'D', 'G']
    let measures = ''
    for (let i = 1; i <= N_MEASURES; i++) {
        const step = steps[(i - 1) % steps.length]
        const octave = 4 + Math.floor(((i - 1) % steps.length) / 7)
        const alterEl = alters[step] ? `<alter>${alters[step]}</alter>` : ''
        const root = chordRoots[(i - 1) % chordRoots.length]
        const attrs = i === 1
            ? `<attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`
            : ''
        measures += `<measure number="${i}">${attrs}` +
            `<harmony><root><root-step>${root}</root-step></root><kind>major</kind></harmony>` +
            `<note><pitch><step>${step}</step>${alterEl}<octave>${octave}</octave></pitch><duration>4</duration><type>whole</type></note>` +
            `</measure>`
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`
}

async function mintSession(bearer) {
    const acc = await mcp(bearer, 'create_test_account', { role: 'band_leader', uidPrefix: 'zzmxlp2' })
    const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
        method: 'POST', headers: { authorization: `Bearer ${acc.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ uid: acc.uid }),
    })
    const body = await sesRes.json()
    const cm = (sesRes.headers.get('set-cookie') || '').match(/__session=([^;]+)/)
    if (!cm) throw new Error('session cookie mint failed')
    if (!body.customToken) throw new Error('no customToken: ' + JSON.stringify(body).slice(0, 200))
    return { uid: acc.uid, cookie: cm[1], customToken: body.customToken }
}

async function clientSignIn(page, customToken) {
    await page.waitForFunction(() => !!(window).__c7_auth_for_probes__, null, { timeout: 15000 })
    const r = await page.evaluate(async (tok) => {
        try { await (window).__c7_auth_for_probes__.signIn(tok); return { ok: true } }
        catch (e) { return { ok: false, err: String(e).slice(0, 200) } }
    }, customToken)
    await page.waitForFunction(() => {
        const h = (window).__c7_auth_for_probes__
        return !!(h && h.auth && h.auth.currentUser)
    }, null, { timeout: 15000 }).catch(() => {})
    return r
}

// Measure fit (content width vs container) + score vertical occupancy + a notation signal.
async function measure(page) {
    return page.evaluate(() => {
        const cont = document.querySelector('div.text-black')
        const svg = cont ? cont.querySelector('svg') : null
        let bbox = null
        try { bbox = svg && svg.getBBox ? svg.getBBox() : null } catch { bbox = null }
        const contRect = cont ? cont.getBoundingClientRect() : null
        const svgRect = svg ? svg.getBoundingClientRect() : null
        const vf = document.querySelectorAll('svg [class*="vf-"]').length
        const paths = svg ? svg.querySelectorAll('path').length : 0
        const texts = svg ? Array.from(svg.querySelectorAll('text')).map(t => t.textContent).join('|') : ''
        const containerW = cont ? cont.clientWidth : 0
        const contentW = bbox ? bbox.width : (svgRect ? svgRect.width : 0)
        const contentH = bbox ? bbox.height : (svgRect ? svgRect.height : 0)
        return {
            rendered: vf > 0 || paths > 4,
            vf, paths, textsLen: texts.length, texts: texts.slice(0, 120),
            containerW,
            contentW: Math.round(contentW),
            contentH: Math.round(contentH),
            fitRatio: containerW ? +(contentW / containerW).toFixed(3) : null,
            svgRenderedW: svgRect ? Math.round(svgRect.width) : 0,
            svgRenderedH: svgRect ? Math.round(svgRect.height) : 0,
            viewportH: window.innerHeight,
            heightFrac: window.innerHeight ? +((svgRect ? svgRect.height : 0) / window.innerHeight).toFixed(3) : null,
        }
    })
}

async function viewerState(page) {
    return page.evaluate(() => {
        const body = document.body.innerText || ''
        return {
            failedPdf: /Failed to render PDF/i.test(body),
            failedXml: /Failed to load music ?XML/i.test(body),
            renderingScore: /Rendering Score/i.test(body),
            signInReq: /Sign in required|Couldn[’']t load chart/i.test(body),
        }
    })
}

async function waitRender(page, ms = 25000) {
    const t0 = Date.now()
    for (let i = 0; i < ms / 400; i++) {
        const m = await measure(page); const v = await viewerState(page)
        if (m.rendered) return { renderMs: Date.now() - t0, m, v }
        if (v.failedPdf || v.failedXml || v.signInReq) return { renderMs: Date.now() - t0, m, v }
        await page.waitForTimeout(400)
    }
    return { renderMs: null, m: await measure(page), v: await viewerState(page) }
}

// Poll fast for the "Rendering Score" overlay right after a transpose tap (de-jank feedback).
async function pollOverlay(page, ms = 1500) {
    let seen = false
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
        const v = await viewerState(page)
        if (v.renderingScore) { seen = true; break }
        await page.waitForTimeout(40)
    }
    return seen
}

async function main() {
    const bearer = await readRootBearer()
    const ver = await fetch(`${BASE_URL}/api/version`).then(r => r.json())
    let fileId = process.env.FILE_ID || null

    if (!fileId) {
        const xml = buildMultiSystemXml()
        const up = await mcp(bearer, 'upload_chart', {
            title: `${PREFIX}-multisystem`, fileName: 'phase2.musicxml',
            mimeType: 'application/vnd.recordare.musicxml+xml',
            fileBase64: Buffer.from(xml, 'utf8').toString('base64'), collection: 'uploads', force: true,
        })
        fileId = up.fileId || up.chartId || up.id
        console.log(`[inject] ok=${up.ok ?? '?'} fileId=${fileId} indexMime=${up.mimeType || up.contentType || '?'} ${up.error || ''}`)
        if (!fileId) { console.error('inject failed', JSON.stringify(up).slice(0, 300)); process.exit(1) }
    }

    const ses = await mintSession(bearer)
    console.log(`[boot] sha=${ver.sha} label=${LABEL} fileId=${fileId} uid=${ses.uid}`)

    const browser = await webkit.launch({ headless: true })
    const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } })
    await ctx.addCookies([{ name: '__session', value: ses.cookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])

    const boot = await ctx.newPage()
    await boot.goto(`${BASE_URL}/perform`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    const signin = await clientSignIn(boot, ses.customToken)
    console.log(`[auth] webSdk signIn ok=${signin.ok} ${signin.err || ''}`)
    await boot.close()

    const page = await ctx.newPage()
    const cerr = []
    page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 160)) })
    page.on('pageerror', e => cerr.push('PAGEERR: ' + String(e).slice(0, 160)))

    await page.goto(`${BASE_URL}/perform/${fileId}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    const r = await waitRender(page)
    await page.waitForTimeout(600) // let fit second-render settle
    const fit = await measure(page)
    await page.screenshot({ path: `./phase2-${LABEL}-initial.png`, fullPage: false })
    console.log(`[fit] rendered=${r.m.rendered} renderMs=${r.renderMs} fitRatio=${fit.fitRatio} (content ${fit.contentW}/${fit.containerW}px) heightFrac=${fit.heightFrac} vf=${fit.vf} paths=${fit.paths}`)

    // --- Transpose de-jank ---
    const transpose = { popoverOpened: false, overlaySeenSingle: null, changedSingle: null, msSingle: null, overlaySeenRapid: null, finalTexts: null, err: null }
    const base = await measure(page)
    try {
        const trig = page.locator('button:has-text("Transpose"), button:has-text("TRANSPOSE"), button[aria-label*="ranspose"]').first()
        await trig.click({ timeout: 5000 })
        await page.waitForTimeout(400)
        const upBtn = page.locator('button[aria-label="Transpose up"]')
        transpose.popoverOpened = (await upBtn.count()) > 0
        if (transpose.popoverOpened) {
            // Single step: tap, then immediately poll for the working overlay.
            const tt = Date.now()
            await upBtn.click()
            transpose.overlaySeenSingle = await pollOverlay(page, 1500)
            await page.waitForTimeout(1600)
            const m1 = await measure(page)
            transpose.msSingle = Date.now() - tt
            transpose.changedSingle = (m1.texts !== base.texts) || (m1.paths !== base.paths) || (m1.vf !== base.vf)
            await page.screenshot({ path: `./phase2-${LABEL}-transposed.png`, fullPage: false })

            // Rapid double-tap: should coalesce; overlay shows, settles to a correct frame.
            await upBtn.click(); await upBtn.click()
            transpose.overlaySeenRapid = await pollOverlay(page, 1500)
            await page.waitForTimeout(1800)
            const m2 = await measure(page)
            transpose.finalTexts = m2.texts.slice(0, 120)
            transpose.staleAfterRapid = (await viewerState(page)).renderingScore // should be false (settled)
        }
    } catch (e) { transpose.err = String(e).slice(0, 200) }

    const out = { prodSha: ver.sha, label: LABEL, fileId, uid: ses.uid, render: { renderMs: r.renderMs, state: r.v }, fit, transpose, consoleErrors: cerr.slice(0, 10) }
    await browser.close()
    await fs.writeFile(`./phase2-${LABEL}-out.json`, JSON.stringify(out, null, 2))
    console.log(`[transpose] opened=${transpose.popoverOpened} overlaySingle=${transpose.overlaySeenSingle} changed=${transpose.changedSingle}(${transpose.msSingle}ms) overlayRapid=${transpose.overlaySeenRapid} staleAfterRapid=${transpose.staleAfterRapid}`)
    console.log(`[done] FILE_ID=${fileId} — wrote phase2-${LABEL}-out.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
