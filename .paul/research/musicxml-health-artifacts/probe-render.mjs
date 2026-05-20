// MusicXML render + transpose probe — deployed Perform on iPad WebKit (820x1180)
// Uses Web-SDK client auth via the prod probe hook (__c7_auth_for_probes__).
import { webkit, devices } from '@playwright/test'
import { readRootBearer, mcp, BASE_URL } from './mcp.mjs'
import { promises as fs } from 'fs'

const ART = '.'
const SETLIST_ID = 'e7fef07d-2120-4850-98e0-677a74e2ba75'
const CHARTS = [
  { tag: 'xml', fileId: 'upload-897575aa-9c6b-42d0-a664-e34c6df49334' },
  { tag: 'mxl', fileId: 'upload-8738c267-e699-4035-ad77-3bbeb0c818fe' },
  { tag: 'mscz', fileId: 'upload-db18f672-ba75-403a-a3c8-de5d26dbc555' },
]

async function mintSession(bearer) {
  const acc = await mcp(bearer, 'create_test_account', { role: 'band_leader', uidPrefix: 'zzmxl' })
  const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
    method: 'POST', headers: { authorization: `Bearer ${acc.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: acc.uid }),
  })
  const body = await sesRes.json()
  const setCookie = sesRes.headers.get('set-cookie') || ''
  const cm = setCookie.match(/__session=([^;]+)/)
  if (!cm) throw new Error('session cookie mint failed')
  if (!body.customToken) throw new Error('no customToken in test-session response: ' + JSON.stringify(body).slice(0, 200))
  return { uid: acc.uid, cookie: cm[1], customToken: body.customToken }
}

async function clientSignIn(page, customToken) {
  await page.waitForFunction(() => !!(window).__c7_auth_for_probes__, null, { timeout: 15000 })
  const r = await page.evaluate(async (tok) => {
    try { await (window).__c7_auth_for_probes__.signIn(tok); return { ok: true } }
    catch (e) { return { ok: false, err: String(e).slice(0, 200) } }
  }, customToken)
  // wait for client user to populate
  await page.waitForFunction(() => {
    const h = (window).__c7_auth_for_probes__
    return !!(h && h.auth && h.auth.currentUser)
  }, null, { timeout: 15000 }).catch(() => {})
  return r
}

// OSMD/VexFlow render signal — NOT an icon svg
async function scoreSig(page) {
  return page.evaluate(() => {
    const vf = document.querySelectorAll('svg [class*="vf-"]').length
    // OSMD container is the .text-black div inside the score Card
    const cont = document.querySelector('div.text-black')
    const contSvg = cont ? cont.querySelector('svg') : null
    const contPaths = contSvg ? contSvg.querySelectorAll('path').length : 0
    const contText = contSvg ? Array.from(contSvg.querySelectorAll('text')).map(t => t.textContent).join('') : ''
    // largest svg on the page by path count (score >> icon)
    let maxPaths = 0
    document.querySelectorAll('svg').forEach(s => { const n = s.querySelectorAll('path').length; if (n > maxPaths) maxPaths = n })
    return { vfEls: vf, contPaths, maxPaths, contTextLen: contText.length, rendered: vf > 0 || contPaths > 4 }
  })
}

async function viewerState(page) {
  return page.evaluate(() => {
    const body = document.body.innerText || ''
    return {
      hasCanvas: !!document.querySelector('canvas'),
      failedPdf: /Failed to render PDF/i.test(body),
      failedXml: /Failed to load music ?XML/i.test(body),
      renderingScore: /Rendering Score/i.test(body),
      signInReq: /Sign in required|Couldn[’']t load chart/i.test(body),
      bodySample: body.replace(/\s+/g, ' ').slice(0, 160),
    }
  })
}

async function waitRender(page, t0, ms = 22000) {
  for (let i = 0; i < ms / 500; i++) {
    const s = await scoreSig(page); const v = await viewerState(page)
    if (s.rendered) return { renderMs: Date.now() - t0, sig: s, state: v }
    if (v.failedPdf || v.failedXml || v.signInReq || v.hasCanvas) return { renderMs: Date.now() - t0, sig: s, state: v }
    await page.waitForTimeout(500)
  }
  return { renderMs: null, sig: await scoreSig(page), state: await viewerState(page) }
}

async function main() {
  const bearer = await readRootBearer()
  const ver = await fetch(`${BASE_URL}/api/version`).then(r => r.json())
  const ses = await mintSession(bearer)
  const out = { prodSha: ver.sha, uid: ses.uid, charts: [], setlistView: null }
  console.log(`[boot] sha=${ver.sha} uid=${ses.uid}`)

  const browser = await webkit.launch({ headless: true })
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } })
  await ctx.addCookies([{ name: '__session', value: ses.cookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])

  // Establish client Web-SDK auth once (persists in context IndexedDB)
  const boot = await ctx.newPage()
  await boot.goto(`${BASE_URL}/perform`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  const signin = await clientSignIn(boot, ses.customToken)
  console.log(`[auth] webSdk signIn ok=${signin.ok} ${signin.err || ''}`)
  await boot.close()

  for (const c of CHARTS) {
    const page = await ctx.newPage()
    const cerr = []
    page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 160)) })
    page.on('pageerror', e => cerr.push('PAGEERR: ' + String(e).slice(0, 160)))
    const t0 = Date.now()
    await page.goto(`${BASE_URL}/perform/${c.fileId}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    const r = await waitRender(page, t0)
    await page.screenshot({ path: `${ART}/render-${c.tag}-initial.png` })

    let transpose = { popoverOpened: false, changed: null, ms: null, sig1: null, err: null }
    if (r.sig.rendered) {
      try {
        const trig = page.locator('button:has-text("Transpose"), button:has-text("TRANSPOSE"), button[aria-label*="ranspose"]').first()
        await trig.click({ timeout: 5000 })
        await page.waitForTimeout(400)
        const upBtn = page.locator('button[aria-label="Transpose up"]')
        transpose.popoverOpened = (await upBtn.count()) > 0
        if (transpose.popoverOpened) {
          const tt = Date.now()
          await upBtn.click(); await page.waitForTimeout(200)
          await upBtn.click(); await page.waitForTimeout(900)
          const sig1 = await scoreSig(page)
          transpose.ms = Date.now() - tt
          transpose.sig1 = sig1
          transpose.changed = (sig1.contTextLen !== r.sig.contTextLen) || (sig1.contPaths !== r.sig.contPaths) || (sig1.vfEls !== r.sig.vfEls)
          await page.screenshot({ path: `${ART}/render-${c.tag}-transposed.png` })
        }
      } catch (e) { transpose.err = String(e).slice(0, 160) }
    }
    out.charts.push({ ...c, renderMs: r.renderMs, sig: r.sig, state: r.state, transpose, consoleErrors: cerr.slice(0, 8) })
    console.log(`[${c.tag}] render=${r.renderMs}ms rendered=${r.sig.rendered} vf=${r.sig.vfEls} contPaths=${r.sig.contPaths} | signInReq=${r.state.signInReq} failPdf=${r.state.failedPdf} | transpose opened=${transpose.popoverOpened} changed=${transpose.changed}(${transpose.ms}ms) | cerr=${cerr.length}`)
    await page.close()
  }

  // setlist Perform: tap first track to open PDFOverlay
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/perform/setlist/${SETLIST_ID}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.waitForTimeout(2500)
    const tapped = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button, [role="button"], a, li, div'))
        .find(e => /ZZ-MXLAUDIT-uncompressed-xml/.test(e.textContent || '') && e.getBoundingClientRect().width > 0)
      if (el) { (el).click(); return true }
      return false
    })
    await page.waitForTimeout(500)
    const t0 = Date.now()
    const r = await waitRender(page, t0, 18000)
    await page.screenshot({ path: `${ART}/render-setlist-perform.png` })
    out.setlistView = { tapped, renderMs: r.renderMs, sig: r.sig, state: r.state }
    console.log(`[setlist] tapped=${tapped} render=${r.renderMs}ms rendered=${r.sig.rendered} vf=${r.sig.vfEls} body="${r.state.bodySample}"`)
    await page.close()
  }

  await browser.close()
  await fs.writeFile(`${ART}/render-out.json`, JSON.stringify(out, null, 2))
  console.log('[done] wrote render-out.json')
}

main().catch(e => { console.error(e); process.exit(1) })
