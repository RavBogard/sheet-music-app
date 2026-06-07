// Pass 3 — focused probes: setlist card width measurement, full-page library, deep dialog dump
import { chromium, devices } from '@playwright/test'
import { promises as fs } from 'fs'

const ART_DIR = '.paul/research/cycle-7-instance-2-artifacts'
const BASE_URL = 'https://www.centralreform.live'

async function readBearer() {
  const raw = await fs.readFile('C:/Users/dsbog/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers', 'utf8')
  return raw.split(/\r?\n/).find(l => /ASSIGNMENT=cycle-7-instance-2\b/.test(l) && !/^#/.test(l)).split(/\s+/)[0]
}

async function mintSession(adminBearer) {
  const mintRes = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminBearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_test_account', arguments: { role: 'band_leader', uidPrefix: 'c7i2' } } }),
  })
  const inner = JSON.parse(JSON.parse((await mintRes.text()).match(/data: ({.*?})\s*$/m)[1]).result.content[0].text)
  const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
    method: 'POST', headers: { authorization: `Bearer ${inner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid: inner.uid }),
  })
  const sesBody = await sesRes.json()
  return { uid: inner.uid, role: inner.role, sessionCookie: (sesRes.headers.get('set-cookie') || '').match(/__session=([^;]+)/)[1] }
}

async function main() {
  const bearer = await readBearer()
  const ses = await mintSession(bearer)
  console.log(`[boot] ${ses.uid}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ ...devices['iPad Mini'], locale: 'en-US', timezoneId: 'America/Chicago' })
  await ctx.addCookies([{ name: '__session', value: ses.sessionCookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])

  const out = {}

  // PROBE 1: /setlists upcoming-services card title measurements
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/setlists`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    // wait a bit more for cards to render
    await page.waitForTimeout(2000)

    // Crop screenshot to upcoming services region
    const region = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('*')).find(el => /upcoming services/i.test(el.textContent || '') && el.children.length === 0)
      if (!heading) return null
      const section = heading.closest('section') || heading.parentElement?.parentElement
      if (!section) return null
      const r = section.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
    out.upcoming_section_rect = region
    if (region) {
      await page.screenshot({
        path: `${ART_DIR}/r7-upcoming-services-cropped.png`,
        clip: { x: Math.max(0, region.x), y: Math.max(0, region.y), width: Math.min(region.w, 768), height: Math.min(region.h, 700) },
      })
    }

    // Find card title elements + measure
    const cardData = await page.evaluate(() => {
      // Find upcoming services cards. They likely have an icon + name + date.
      // Strategy: look for elements with text matching MM/DD or day-month patterns OR look in cards.
      const candidates = Array.from(document.querySelectorAll('[class*="card"], article, [role="article"], a[href*="/setlists/"]'))
      return candidates.map(c => {
        const r = c.getBoundingClientRect()
        const txt = (c.textContent || '').trim().slice(0, 100)
        const cs = getComputedStyle(c)
        const titleEl = c.querySelector('h1, h2, h3, h4, .title, [class*="title"], [class*="name"]')
        const titleRect = titleEl?.getBoundingClientRect()
        const titleCS = titleEl ? getComputedStyle(titleEl) : null
        return {
          tag: c.tagName.toLowerCase(),
          width: r.width, height: r.height, x: r.x, y: r.y,
          textPreview: txt,
          containerWordBreak: cs.wordBreak,
          containerOverflow: cs.overflow,
          titleText: titleEl?.textContent?.trim().slice(0, 80) || null,
          titleWidth: titleRect?.width || null,
          titleHeight: titleRect?.height || null,
          titleFontSize: titleCS?.fontSize || null,
          titleWhitespace: titleCS?.whiteSpace || null,
          titleWordBreak: titleCS?.wordBreak || null,
          titleOverflowWrap: titleCS?.overflowWrap || null,
        }
      }).filter(c => c.width > 50 && c.width < 500 && c.height > 50 && c.height < 400 && c.y < 600)
       .slice(0, 12)
    })
    out.upcoming_cards = cardData

    await page.close()
  }

  // PROBE 2: /api/mcp/tokens auth shape (proves the 401 finding)
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const probe = await page.evaluate(async () => {
      const r = await fetch('/api/mcp/tokens', { credentials: 'include' })
      let bodyText = ''
      try { bodyText = await r.text() } catch {}
      return { status: r.status, ok: r.ok, body: bodyText.slice(0, 400), headers: Object.fromEntries([...r.headers]) }
    })
    out.api_mcp_tokens_probe = probe
    await page.close()
  }

  // PROBE 3: /perform/{fileId} extended wait — confirm chart actually loads (vs hangs forever)
  {
    const page = await ctx.newPage()
    const consoleErrs = []
    page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300)) })
    page.on('pageerror', err => consoleErrs.push(String(err).slice(0, 300)))
    const FILE_ID = '1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy'
    await page.goto(`${BASE_URL}/perform/${FILE_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait longer for chart to load
    await page.waitForTimeout(15000)
    await page.screenshot({ path: `${ART_DIR}/r5-perform-file-after-15s.png`, fullPage: false })
    const state = await page.evaluate(() => ({
      bodyLen: document.body.innerText.length,
      hasLoadingText: /loading/i.test(document.body.innerText),
      hasCanvasOrPdf: !!document.querySelector('canvas, embed[type*="pdf"], iframe[src*=".pdf"], [class*="pdf"]'),
      title: document.title,
      bodyTextPreview: document.body.innerText.slice(0, 300),
    }))
    out.r5_perform_file_15s = { consoleErrs, ...state }
    await page.close()
  }

  // PROBE 4: /perform/setlist/{id} PerformanceToolbar gesture-bar overlap check
  {
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/perform/setlist/NWPBba50fltX6pNcyOVK`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
    const safeArea = await page.evaluate(() => {
      // iPad-Mini gesture-bar safe area: env(safe-area-inset-bottom) is ~34px when set. Look for fixed elements within bottom 50px of viewport.
      const vh = window.innerHeight
      const fixedNearBottom = Array.from(document.querySelectorAll('*')).filter(el => {
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed') return false
        const r = el.getBoundingClientRect()
        return r.bottom > vh - 5 && r.height > 20  // bottom-anchored
      }).map(el => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string') ? el.className.slice(0, 100) : '',
          bottom: r.bottom, top: r.top, height: r.height,
          paddingBottom: cs.paddingBottom,
          marginBottom: cs.marginBottom,
          ariaLabel: el.getAttribute('aria-label'),
          // Detect if uses safe-area-inset-bottom anywhere
          hasSafeArea: /env\s*\(\s*safe-area-inset/i.test(cs.paddingBottom + cs.marginBottom + cs.cssText || '')
        }
      })
      return { vh, fixedNearBottom }
    })
    out.r4_perform_safe_area = safeArea
    await page.close()
  }

  await browser.close()
  await fs.writeFile(`${ART_DIR}/_pass3.json`, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2).slice(0, 3000))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
