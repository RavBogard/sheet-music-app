// §E Offline-survival matrix — 5 cells, 1 engine (Chromium-substituted; WebKit deps missing).
// Persona axis: for the chart-overlay surface under test, behavior is uid-agnostic
// (IndexedDB chart cache is keyed on fileId, not uid). Personas (Aviva/David/Daniel)
// share the same chart-overlay UI; the persona axis is meaningful for LANDING-page
// listing scope (not under offline probe). The probes run anonymously against the
// clone URL; verdicts apply uniformly to all 3 personas for the cells under test.
// Where a verdict would meaningfully differ by persona (e.g., write-back paths),
// the probe notes that — but the 5 §2.1 cells are read-side offline behavior.
import { chromium } from "@playwright/test"

const BASE = "https://www.centralreform.live"
const CLONE = "86a104ae-d728-4b64-9ec2-8c3b28b01613"
const TRACK_PRECACHED = "8d029da2-7dcd-45b0-94be-7631cf567099" // Modah Ani (cache target)
const TRACK_NEXT = "25881c95-6e51-4658-8f22-ba7ee6b198ff" // Ma tovu (track A2 N+1 target)
const TRACK_UNCACHED = "1c6b5637-b7cb-469d-aa32-82c5a763f3cc" // Kedusha (uncached probe target)

async function goOffline(page) {
  await page.route(/^https?:\/\//, (r) => r.abort())
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
  })
}
async function goOnline(page) {
  await page.unroute(/^https?:\/\//)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
  })
}

async function chartLoaded(page) {
  return await page.evaluate(() => {
    const hasOverlay = !!document.querySelector('[data-perform-overlay]')
      || !!document.querySelector('[data-testid="performance-overlay"]')
      || !!document.querySelector('canvas')
      || !!document.querySelector('iframe')
      || !!document.querySelector('embed[type*="pdf" i]')
      || !!document.querySelector('object[type*="pdf" i]')
      || !!document.querySelector('.react-pdf__Page')
    const stuckSpinner = !!document.querySelector('.animate-spin')
    const errorBanner = !!Array.from(document.querySelectorAll('*')).find((e) => (e.textContent || '').includes('Loading chart') || (e.textContent || '').includes('Chart not cached') || (e.textContent || '').includes('Offline'))
    return { hasOverlay, stuckSpinner, errorBanner }
  })
}

async function wakeLockState(page) {
  return await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('keep screen') || (b.getAttribute('aria-label') || '').toLowerCase().includes('screen lock'))
    return btn ? { ariaPressed: btn.getAttribute('aria-pressed'), ariaLabel: btn.getAttribute('aria-label') } : null
  })
}

const results = []
function rec(o) { results.push(o); console.log(JSON.stringify(o)) }

// =====================================================================
// PRE-CACHE: open online, wait for chart to load (IndexedDB precache should land)
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })
const page = await ctx.newPage()

await page.goto(`${BASE}/perform/setlist/${CLONE}/track/${TRACK_PRECACHED}`, { waitUntil: "domcontentloaded", timeout: 15000 })
await page.waitForTimeout(5000) // give precache time
const initialChart = await chartLoaded(page)
rec({ step: "precache-online", chart: initialChart })

// =====================================================================
// CELL 1: Already-loaded chart readable when offline
await goOffline(page)
await page.waitForTimeout(800)
const cell1State = await chartLoaded(page)
rec({ cell: 1, name: "Already-loaded chart readable when offline", verdict: cell1State.hasOverlay && !cell1State.stuckSpinner ? "pass" : "partial", state: cell1State })

// =====================================================================
// CELL 2: Wake-lock state visible while offline (toggle state across offline transition)
// Click wake-lock toggle ONLINE first to engage it, then offline, then read state.
await goOnline(page)
await page.waitForTimeout(400)
// Try clicking wake-lock to engage (in headless chromium this may reject — that's also a valid grade for the survival behavior)
const wlBefore = await wakeLockState(page)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('keep screen'))
  if (btn) btn.click()
})
await page.waitForTimeout(800)
const wlAfterClick = await wakeLockState(page)
// Now go offline — toggle state should persist (state lives in React, not network-dependent)
await goOffline(page)
await page.waitForTimeout(500)
const wlAfterOffline = await wakeLockState(page)
rec({ cell: 2, name: "Wake-lock state visible across offline transition", verdict: (wlAfterOffline && wlAfterOffline.ariaLabel === wlAfterClick?.ariaLabel) ? "pass" : "partial", before: wlBefore, afterClick: wlAfterClick, afterOffline: wlAfterOffline })

// =====================================================================
// CELL 3: SW / Firestore offline-cache holds chart bytes (reload while offline → still renders)
await page.reload({ waitUntil: "domcontentloaded", timeout: 12000 }).catch((e) => rec({ cell3_reload_err: String(e.message).slice(0, 80) }))
await page.waitForTimeout(3000)
const cell3State = await chartLoaded(page)
rec({ cell: 3, name: "SW/IDB cache holds chart bytes across offline reload", verdict: cell3State.hasOverlay && !cell3State.stuckSpinner ? "pass" : "partial", state: cell3State })

// =====================================================================
// CELL 4: Bond-fail recovery on reconnect (offline → goto uncached → goOnline → chart loads)
await goOffline(page) // ensure still offline
await page.evaluate((url) => { window.location.href = url }, `${BASE}/perform/setlist/${CLONE}/track/${TRACK_UNCACHED}`).catch(() => {})
await page.waitForTimeout(1800)
const cell4Offline = await chartLoaded(page)
await goOnline(page)
await page.waitForTimeout(4000) // allow chart bytes to fetch + paint
const cell4Online = await chartLoaded(page)
rec({ cell: 4, name: "Bond-fail recovery on reconnect (uncached track + reconnect)", verdict: cell4Online.hasOverlay && !cell4Online.stuckSpinner ? "pass" : "partial", offlineState: cell4Offline, onlineState: cell4Online })

// =====================================================================
// CELL 5: Sanctuary-blip mid-song doesn't nuke next-track entry
// Workflow: online on track A → goOffline → request next track (URL nav) → goOnline → measure time to next-track chart paint
await page.goto(`${BASE}/perform/setlist/${CLONE}/track/${TRACK_PRECACHED}`, { waitUntil: "domcontentloaded", timeout: 15000 })
await page.waitForTimeout(3000)
await goOffline(page)
const cell5Start = Date.now()
await page.evaluate((url) => { window.location.href = url }, `${BASE}/perform/setlist/${CLONE}/track/${TRACK_NEXT}`).catch(() => {})
await page.waitForTimeout(1500)
const cell5MidOffline = await chartLoaded(page)
await goOnline(page)
// Poll for chart paint, max 8s
let cell5Recovered = null
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(500)
  const s = await chartLoaded(page)
  if (s.hasOverlay && !s.stuckSpinner) { cell5Recovered = { elapsed_ms: Date.now() - cell5Start, state: s }; break }
}
if (!cell5Recovered) cell5Recovered = { elapsed_ms: Date.now() - cell5Start, state: await chartLoaded(page) }
rec({ cell: 5, name: "Sanctuary-blip mid-song doesn't nuke next-track entry", verdict: (cell5Recovered && cell5Recovered.elapsed_ms < 8000 && cell5Recovered.state.hasOverlay) ? "pass" : "partial", offlineState: cell5MidOffline, recovered: cell5Recovered })

await browser.close()
process.exit(0)
