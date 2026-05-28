// F-C12-008: wake-lock visibilitychange + denied runtime probe.
// Chromium-substituted. Tests both verdict paths from KeepAwakeToggle.tsx:69-70.
import { chromium } from "@playwright/test"
const BASE = "https://www.centralreform.live"
const CLONE = "86a104ae-d728-4b64-9ec2-8c3b28b01613"
const TRACK = "8d029da2-7dcd-45b0-94be-7631cf567099" // Modah Ani

const ERROR_COPY = {
  hidden: "Tab not focused — tap chart to retry",
  denied: "Wake-lock blocked — tap again to retry",
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })

async function gotoFresh(persona) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/perform/setlist/${CLONE}/track/${TRACK}`, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.waitForTimeout(2500)
  return page
}

async function findKeepAwakeBtn(page) {
  return await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[aria-pressed], button[aria-label*="screen" i], button[aria-label*="keep" i], button[aria-label*="wake" i]'))
    const target = btns.find((b) => {
      const al = (b.getAttribute('aria-label') || '').toLowerCase()
      return al.includes('keep screen') || al.includes('screen lock') || al.includes('wake-lock unavailable') || al.includes('keep awake')
    })
    return target ? {
      found: true,
      ariaLabel: target.getAttribute('aria-label'),
      ariaPressed: target.getAttribute('aria-pressed'),
      disabled: target.disabled,
    } : { found: false, candidateAriaLabels: btns.map((b) => b.getAttribute('aria-label')).slice(0, 6) }
  })
}

async function readWakeLockUI(page) {
  return await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const toggle = btns.find((b) => {
      const al = (b.getAttribute('aria-label') || '').toLowerCase()
      return al.includes('keep screen') || al.includes('screen lock') || al.includes('wake-lock')
    })
    // Error pill: look for any element with text matching ERROR_COPY
    const allText = document.body.innerText
    const hiddenMsgPresent = allText.includes('Tab not focused')
    const deniedMsgPresent = allText.includes('Wake-lock blocked')
    return {
      toggleAriaPressed: toggle ? toggle.getAttribute('aria-pressed') : null,
      toggleAriaLabel: toggle ? toggle.getAttribute('aria-label') : null,
      hiddenMsgPresent,
      deniedMsgPresent,
      wakeLockAPIPresent: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    }
  })
}

const results = []
function rec(o) { results.push(o); console.log(JSON.stringify(o)) }

// PROBE 1: button discovery + initial state
{
  const page = await gotoFresh()
  const found = await findKeepAwakeBtn(page)
  const ui = await readWakeLockUI(page)
  rec({ probe: "1-discovery", found, ui })
  await page.close()
}

// PROBE 2: denied path — monkey-patch navigator.wakeLock.request to throw NotAllowedError BEFORE click, then click toggle
{
  const page = await gotoFresh()
  await page.evaluate(() => {
    // Replace wakeLock.request to always throw NotAllowedError (denied path)
    if (navigator.wakeLock) {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () => Promise.reject(new DOMException('Wake Lock blocked', 'NotAllowedError')),
        },
      })
    } else {
      // wakeLock API not present in headless; install stub
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () => Promise.reject(new DOMException('Wake Lock blocked', 'NotAllowedError')),
        },
      })
    }
  })
  // Click the toggle
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const t = btns.find((b) => {
      const al = (b.getAttribute('aria-label') || '').toLowerCase()
      return al.includes('keep screen') || al.includes('screen lock')
    })
    if (!t) return { clicked: false }
    t.click()
    return { clicked: true, ariaLabel: t.getAttribute('aria-label') }
  })
  await page.waitForTimeout(900)
  const ui = await readWakeLockUI(page)
  rec({ probe: "2-denied", clicked, ui, expected_pill: ERROR_COPY.denied, observed_denied_pill: ui.deniedMsgPresent })
  await page.close()
}

// PROBE 3: hidden path — set document.visibilityState='hidden', dispatch event, then click toggle
{
  const page = await gotoFresh()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    // Ensure wakeLock API exists but request honors hidden check (the hook itself reads visibilityState before calling request)
    if (!navigator.wakeLock) {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: () => Promise.reject(new DOMException('Hidden', 'NotAllowedError')) },
      })
    }
  })
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const t = btns.find((b) => {
      const al = (b.getAttribute('aria-label') || '').toLowerCase()
      return al.includes('keep screen') || al.includes('screen lock')
    })
    if (!t) return { clicked: false }
    t.click()
    return { clicked: true }
  })
  await page.waitForTimeout(900)
  const ui = await readWakeLockUI(page)
  rec({ probe: "3-hidden", clicked, ui, expected_pill: ERROR_COPY.hidden, observed_hidden_pill: ui.hiddenMsgPresent })
  await page.close()
}

await browser.close()
process.exit(0)
