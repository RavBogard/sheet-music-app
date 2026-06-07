// cycle-7 Instance 2 — iPad-Mini Playwright driver
// Walks 7 routes per .paul/research/cycle-7-instance-2-PROMPT.md §1.
// Auth strategy: __session cookie only (Web-SDK signInWithCustomToken not wired
// because the app's `auth` singleton from @/lib/firebase isn't window-exposed;
// driving the canonical signin flow would require a code-mod outside PROBE scope).
// Any route whose observation depends on a client-side Firebase listener firing
// will be flagged in the per-route notes.

import { chromium, devices } from '@playwright/test'
import { promises as fs } from 'fs'
import path from 'path'

const ART_DIR = '.paul/research/cycle-7-instance-2-artifacts'
const BASE_URL = 'https://www.centralreform.live'
const BEARER_POOL = 'C:/Users/dsbog/.claude/projects/C--Users-dsbog-centralreform-live/.supervisor-bearers'

const SETLIST_ID = 'NWPBba50fltX6pNcyOVK'  // 5/15 Shir Shabbat, 21 tracks
const FILE_ID = '1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy'  // Ana B Koach.pdf

const ROUTES = [
  { id: 'r1-setlist-editor', path: `/setlists/${SETLIST_ID}`, label: 'setlist editor (real existing setlist; read-only)' },
  { id: 'r2-library',        path: '/library',                 label: 'library page + UploadDialog + ScraperModal' },
  { id: 'r3-templates',      path: '/manage/templates',        label: 'manage templates UI' },
  { id: 'r4-perform-setlist',path: `/perform/setlist/${SETLIST_ID}`, label: 'perform setlist (consumer surface; public-by-design)' },
  { id: 'r5-perform-file',   path: `/perform/${FILE_ID}`,      label: 'single-chart deeplink' },
  { id: 'r6-settings',       path: '/settings',                label: 'MCP token UI' },
  { id: 'r7-login',          path: '/login',                   label: 'login page (unauth observation)' },
]

async function readBearer() {
  const raw = await fs.readFile(BEARER_POOL, 'utf8')
  const row = raw.split(/\r?\n/).find(l => /ASSIGNMENT=cycle-7-instance-2\b/.test(l) && !/^#/.test(l))
  if (!row) throw new Error('cycle-7-instance-2 bearer row not found in pool')
  return row.split(/\s+/)[0]
}

async function mintBandLeaderTestSession(adminBearer) {
  // create_test_account → band_leader test uid
  const mintRes = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminBearer}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 100, method: 'tools/call',
      params: { name: 'create_test_account', arguments: { role: 'band_leader', uidPrefix: 'c7i2' } },
    }),
  })
  const mintText = await mintRes.text()
  const mintMatch = mintText.match(/data: ({.*?})\s*$/m)
  if (!mintMatch) throw new Error(`mint: no SSE data line\n${mintText.slice(0,500)}`)
  const mintJson = JSON.parse(mintMatch[1])
  const inner = JSON.parse(mintJson.result.content[0].text)
  const { uid, role, token: leaderToken } = inner
  console.log(`[mint] created ${uid} role=${role}`)

  // POST /api/auth/test-session with the band_leader's OWN token (self-mint)
  const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${leaderToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ uid }),
  })
  const sesBody = await sesRes.json()
  if (!sesRes.ok || sesBody?.ok !== true) {
    throw new Error(`test-session refused: ${JSON.stringify(sesBody).slice(0,400)}`)
  }

  // Extract __session cookie from response (Set-Cookie header on the response)
  const setCookie = sesRes.headers.get('set-cookie') || ''
  const sessionMatch = setCookie.match(/__session=([^;]+)/)
  if (!sessionMatch) {
    throw new Error(`no __session cookie in Set-Cookie response: ${setCookie.slice(0,200)}`)
  }

  return {
    uid, role, leaderToken,
    sessionCookie: sessionMatch[1],
    customToken: sesBody.customToken,
    customTokenExpiresInSec: sesBody.customTokenExpiresInSec,
    expiresInSec: sesBody.expiresInSec,
  }
}

async function injectAxe(page) {
  // axe-core CDN inject (DEGRADED-OK per §7 if unreachable)
  try {
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' })
    return true
  } catch (e) {
    return false
  }
}

async function runAxe(page) {
  try {
    return await page.evaluate(async () => {
      // @ts-ignore - axe injected
      const r = await window.axe.run(document, { reporter: 'v2' })
      return {
        violations: r.violations.map(v => ({
          id: v.id, impact: v.impact, help: v.help,
          nodes: v.nodes.length,
          tags: v.tags,
        })),
        passes: r.passes.length,
      }
    })
  } catch (e) {
    return { error: String(e), violations: [], passes: 0 }
  }
}

async function walkRoute(context, route) {
  const out = { id: route.id, path: route.path, label: route.label, ts: new Date().toISOString() }
  const page = await context.newPage()
  const consoleMsgs = []
  const networkErrors = []
  const networkFailures = []

  page.on('console', m => {
    consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 500) })
  })
  page.on('pageerror', err => {
    consoleMsgs.push({ type: 'pageerror', text: String(err).slice(0, 500) })
  })
  page.on('requestfailed', req => {
    networkFailures.push({ url: req.url(), failure: req.failure()?.errorText, method: req.method() })
  })
  page.on('response', res => {
    if (res.status() >= 400) {
      networkErrors.push({ url: res.url(), status: res.status(), method: res.request().method() })
    }
  })

  const navStart = Date.now()
  try {
    const resp = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    out.httpStatus = resp?.status() ?? null
    out.finalUrl = page.url()
    // Wait for network to idle (or 5s max)
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 })
    } catch { /* swallow timeout, capture anyway */ }
  } catch (e) {
    out.navError = String(e).slice(0, 300)
  }
  out.loadMs = Date.now() - navStart

  // Capture viewport-level metrics + a11y-relevant DOM signals
  try {
    out.metrics = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'))
      const unnamed = buttons.filter(b => {
        const txt = (b.textContent || '').trim()
        const aria = (b.getAttribute('aria-label') || '').trim()
        const title = (b.getAttribute('title') || '').trim()
        return !txt && !aria && !title
      })
      const small = buttons.filter(b => {
        const r = b.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)
      })
      const fixedBottom = Array.from(document.querySelectorAll('*')).filter(el => {
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed') return false
        const bottom = parseFloat(cs.bottom || '0')
        return !isNaN(bottom) && bottom >= -20 && bottom <= 20
      }).map(el => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '',
        rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
      })).slice(0, 10)
      const viewportMeta = document.querySelector('meta[name="viewport"]')
      return {
        title: document.title,
        bodyLen: document.body?.innerText?.length || 0,
        buttonCount: buttons.length,
        unnamedButtonCount: unnamed.length,
        smallTouchTargetCount: small.length,
        fixedBottomElements: fixedBottom,
        viewportContent: viewportMeta?.getAttribute('content') || null,
        hasMain: !!document.querySelector('main'),
        h1Count: document.querySelectorAll('h1').length,
        landmarkCounts: {
          banner: document.querySelectorAll('[role="banner"], header').length,
          nav: document.querySelectorAll('[role="navigation"], nav').length,
          main: document.querySelectorAll('[role="main"], main').length,
          contentinfo: document.querySelectorAll('[role="contentinfo"], footer').length,
        },
      }
    })
  } catch (e) {
    out.metricsError = String(e).slice(0, 200)
  }

  // axe-core
  const axeOk = await injectAxe(page)
  if (axeOk) {
    out.axe = await runAxe(page)
  } else {
    out.axe = { skipped: true, reason: 'axe-core CDN unreachable' }
  }

  // Screenshot
  const shotPath = path.join(ART_DIR, `${route.id}.png`)
  try {
    await page.screenshot({ path: shotPath, fullPage: false })
    out.screenshot = shotPath
  } catch (e) {
    out.screenshotError = String(e).slice(0, 200)
  }

  // Save per-route json
  out.console = consoleMsgs
  out.networkErrors = networkErrors
  out.networkFailures = networkFailures
  await fs.writeFile(path.join(ART_DIR, `${route.id}.json`), JSON.stringify(out, null, 2))

  await page.close()
  return out
}

async function main() {
  const bearer = await readBearer()
  console.log(`[boot] bearer ${bearer.slice(0,18)}…`)

  const ses = await mintBandLeaderTestSession(bearer)
  console.log(`[boot] session minted uid=${ses.uid} role=${ses.role}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['iPad Mini'],
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  })

  // Set __session cookie for both apex + www (apex 307→www but cookie set on www is enough for /api/mcp etc.)
  await context.addCookies([
    {
      name: '__session', value: ses.sessionCookie,
      domain: 'www.centralreform.live', path: '/',
      httpOnly: true, secure: true, sameSite: 'Lax',
    },
    {
      name: '__session', value: ses.sessionCookie,
      domain: 'centralreform.live', path: '/',
      httpOnly: true, secure: true, sameSite: 'Lax',
    },
  ])

  // Quick auth sanity: hit /api/auth/session or similar to verify cookie is honored
  // (Skip — we'll see auth state via the route walks themselves.)

  const summary = { authMode: 'cookie-only (Web-SDK NOT wired)', uid: ses.uid, role: ses.role, results: [] }

  for (const route of ROUTES) {
    console.log(`[walk] ${route.id} → ${route.path}`)
    try {
      const r = await walkRoute(context, route)
      summary.results.push({
        id: r.id, path: r.path, label: r.label,
        httpStatus: r.httpStatus, finalUrl: r.finalUrl, loadMs: r.loadMs,
        navError: r.navError,
        consoleErrorCount: r.console?.filter(m => m.type === 'error' || m.type === 'pageerror').length || 0,
        networkErrorCount: r.networkErrors?.length || 0,
        networkFailureCount: r.networkFailures?.length || 0,
        axeViolations: r.axe?.violations?.length || 0,
        axeSkipped: !!r.axe?.skipped,
        title: r.metrics?.title,
        bodyLen: r.metrics?.bodyLen,
        unnamedButtonCount: r.metrics?.unnamedButtonCount,
        smallTouchTargetCount: r.metrics?.smallTouchTargetCount,
        fixedBottomCount: r.metrics?.fixedBottomElements?.length || 0,
        viewportContent: r.metrics?.viewportContent,
        hasMain: r.metrics?.hasMain,
        landmarks: r.metrics?.landmarkCounts,
      })
    } catch (e) {
      summary.results.push({ id: route.id, fatal: String(e).slice(0, 400) })
    }
  }

  await browser.close()

  await fs.writeFile(path.join(ART_DIR, '_summary.json'), JSON.stringify(summary, null, 2))
  console.log(`[done] wrote ${path.join(ART_DIR, '_summary.json')}`)
  console.log(JSON.stringify(summary, null, 2))

  return ses
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
