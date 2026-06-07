// Pass 2 — full-page screenshots + dialog opens + setlist cards probe
import { chromium, devices } from '@playwright/test'
import { promises as fs } from 'fs'

const ART_DIR = '.paul/research/cycle-7-instance-2-artifacts'
const BASE_URL = 'https://www.centralreform.live'
const BEARER_POOL = 'C:/Users/dsbog/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers'

async function readBearer() {
  const raw = await fs.readFile(BEARER_POOL, 'utf8')
  const row = raw.split(/\r?\n/).find(l => /ASSIGNMENT=cycle-7-instance-2\b/.test(l) && !/^#/.test(l))
  return row.split(/\s+/)[0]
}

async function mintSession(adminBearer) {
  const mintRes = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminBearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_test_account', arguments: { role: 'band_leader', uidPrefix: 'c7i2' } } }),
  })
  const mintMatch = (await mintRes.text()).match(/data: ({.*?})\s*$/m)
  const inner = JSON.parse(JSON.parse(mintMatch[1]).result.content[0].text)
  const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${inner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: inner.uid }),
  })
  const sesBody = await sesRes.json()
  const sessionCookie = (sesRes.headers.get('set-cookie') || '').match(/__session=([^;]+)/)[1]
  return { uid: inner.uid, role: inner.role, sessionCookie, customToken: sesBody.customToken }
}

async function main() {
  const bearer = await readBearer()
  const ses = await mintSession(bearer)
  console.log(`[boot] ${ses.uid}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ ...devices['iPad Mini'], locale: 'en-US', timezoneId: 'America/Chicago' })
  await ctx.addCookies([
    { name: '__session', value: ses.sessionCookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
  ])

  const out = {}

  // PASS2-A: /settings full-page screenshot to confirm McpAccessSettings renders
  {
    const page = await ctx.newPage()
    const consoleErrs = []
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300)) })
    page.on('pageerror', err => consoleErrs.push(String(err).slice(0, 300)))
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    await page.screenshot({ path: `${ART_DIR}/r6-settings-fullpage.png`, fullPage: true })
    // Check for McpAccess section presence
    const mcpSection = await page.evaluate(() => {
      const all = document.body.innerText
      return {
        hasMcpHeader: /MCP|Integrations|Bearer|Token/i.test(all),
        hasLeadersOnlyText: /Leaders Only/i.test(all),
        bodyLen: all.length,
        roleShown: (all.match(/MEMBER|MUSICIAN|BAND_LEADER|ADMIN/i) || [])[0] || null,
      }
    })
    out.r6_settings_pass2 = { consoleErrs, ...mcpSection }
    await page.close()
  }

  // PASS2-B: /library — open UploadDialog + ScraperModal
  {
    const page = await ctx.newPage()
    const consoleErrs = []
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300)) })
    page.on('pageerror', err => consoleErrs.push(String(err).slice(0, 300)))
    await page.goto(`${BASE_URL}/library`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    await page.screenshot({ path: `${ART_DIR}/r2-library-fullpage.png`, fullPage: true })

    // Find upload trigger — common patterns
    const triggers = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, [role="button"], a'))
      return all.map(b => ({
        text: (b.textContent || '').trim().slice(0, 50),
        aria: (b.getAttribute('aria-label') || '').slice(0, 50),
        title: (b.getAttribute('title') || '').slice(0, 50),
      })).filter(b => b.text || b.aria || b.title)
        .filter(b => /upload|scraper|add|import|new|\+/i.test(b.text + ' ' + b.aria + ' ' + b.title))
    })
    out.r2_library_triggers = triggers.slice(0, 30)

    // Try clicking 'Upload' or '+' trigger
    let uploadClicked = false, scraperClicked = false
    try {
      const upload = page.getByRole('button', { name: /upload/i }).first()
      if (await upload.count() > 0) {
        await upload.click({ timeout: 3000 })
        await page.waitForTimeout(1500)
        await page.screenshot({ path: `${ART_DIR}/r2-library-upload-dialog.png`, fullPage: false })
        uploadClicked = true
        // close it
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    } catch (e) { out.r2_upload_err = String(e).slice(0, 200) }

    try {
      const scraper = page.getByRole('button', { name: /scraper|scrape|import/i }).first()
      if (await scraper.count() > 0) {
        await scraper.click({ timeout: 3000 })
        await page.waitForTimeout(1500)
        await page.screenshot({ path: `${ART_DIR}/r2-library-scraper-modal.png`, fullPage: false })
        scraperClicked = true
        await page.keyboard.press('Escape')
      }
    } catch (e) { out.r2_scraper_err = String(e).slice(0, 200) }

    out.r2_library_pass2 = { consoleErrs, uploadClicked, scraperClicked }
    await page.close()
  }

  // PASS2-C: /setlists card-title truncation probe (r7 follow-up — /login → /setlists redirect)
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/setlists`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    await page.screenshot({ path: `${ART_DIR}/r7-setlists-fullpage.png`, fullPage: true })

    // Inspect setlist card titles for truncation
    const cards = await page.evaluate(() => {
      // Heuristic: setlist cards are typically inside a grid; titles are h2/h3 or div with role
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [class*="card"] [class*="title"], [class*="card"] [class*="name"]'))
      return headings.map(h => {
        const r = h.getBoundingClientRect()
        const txt = (h.textContent || '').trim()
        const cs = getComputedStyle(h)
        return {
          text: txt.slice(0, 80),
          width: r.width,
          height: r.height,
          fontSize: cs.fontSize,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          whitespace: cs.whiteSpace,
          parentWidth: h.parentElement?.getBoundingClientRect().width,
        }
      }).filter(h => h.text.length > 0).slice(0, 30)
    })
    out.r7_setlist_cards = cards

    // Also check unauth /login — fresh ctx with no cookie
    await page.close()
  }

  // PASS2-D: unauth /login
  {
    const freshCtx = await browser.newContext({ ...devices['iPad Mini'] })
    const page = await freshCtx.newPage()
    const consoleErrs = []
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300)) })
    page.on('pageerror', err => consoleErrs.push(String(err).slice(0, 300)))
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    await page.screenshot({ path: `${ART_DIR}/r7-login-unauth-fullpage.png`, fullPage: true })
    const loginShape = await page.evaluate(() => {
      return {
        finalUrl: location.href,
        hasEmailInput: !!document.querySelector('input[type="email"], input[name="email"]'),
        hasPasswordInput: !!document.querySelector('input[type="password"]'),
        hasGoogleSignIn: /google/i.test(document.body.innerText),
        hasQRSection: /qr|scan/i.test(document.body.innerText),
        hasLegalLinks: /privacy|terms|accessibility/i.test(document.body.innerText),
        bodyLen: document.body.innerText.length,
      }
    })
    out.r7_login_unauth = { consoleErrs, ...loginShape }
    await freshCtx.close()
  }

  await browser.close()
  await fs.writeFile(`${ART_DIR}/_pass2.json`, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
