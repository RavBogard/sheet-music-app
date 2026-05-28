// F-C12-007: transpose cross-track persistence runtime probe.
// Strategy: open track A in chromium, click transpose trigger, simulate +N, navigate to track B, read state.
// Chromium-substituted (WebKit deps missing in sandbox).
import { chromium } from "@playwright/test"

const BASE = "https://www.centralreform.live"
const CLONE = "86a104ae-d728-4b64-9ec2-8c3b28b01613"

// 4 sample tracks: head / middle / end / divider-adjacent (per PROMPT §2.2)
const samples = [
  { id: "8d029da2-7dcd-45b0-94be-7631cf567099", order: 2, title: "Modah Ani (head)", role: "head" },
  { id: "c4843ec1-893d-4ceb-b37b-fa8779eefc0d", order: 6, title: "Barchu (divider-adjacent)", role: "divider-adjacent" },
  { id: "b3e1704f-1bbb-48a8-a5db-1734dfb5d823", order: 12, title: "Veshamru (middle)", role: "middle" },
  { id: "a485d719-71aa-4ceb-b6d3-605ce38d9a1a", order: 19, title: "Eitz chayim (end)", role: "end" },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })
const page = await ctx.newPage()

async function readTransposeState(page) {
  // Read transpose trigger button label + data-transposed attribute
  return await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="transpose-trigger-desktop"]')
      || document.querySelector('[data-testid="transpose-trigger-mobile"]')
    if (!btn) return { found: false }
    return {
      found: true,
      transposed: btn.getAttribute('data-transposed'),
      label: (btn.textContent || '').trim().slice(0, 50),
    }
  })
}

async function applyTransposePlusN(page, n) {
  // Click trigger to open menu, then click "+" n times. Returns success+menu-shape.
  return await page.evaluate(async (n) => {
    const btn = document.querySelector('[data-testid="transpose-trigger-desktop"]')
      || document.querySelector('[data-testid="transpose-trigger-mobile"]')
    if (!btn) return { ok: false, reason: 'no-trigger' }
    btn.click()
    await new Promise((r) => setTimeout(r, 400))
    // Find the "+" button — TransposerMenu line ~269 setTransposition(transposition + 1)
    const allButtons = Array.from(document.querySelectorAll('button'))
    // Heuristic: aria-label*="+" or text content "+1" or similar; also try chevron-up
    const plusBtn = allButtons.find((b) => {
      const t = (b.textContent || '').trim()
      const al = (b.getAttribute('aria-label') || '').toLowerCase()
      return t === '+' || al.includes('up') || al.includes('plus') || al.includes('higher')
    })
    if (!plusBtn) {
      // Close menu by clicking outside
      return { ok: false, reason: 'no-plus-btn', menuButtons: allButtons.slice(0, 12).map((b) => ({ t: (b.textContent || '').trim().slice(0, 20), a: (b.getAttribute('aria-label') || '').slice(0, 30) })) }
    }
    for (let i = 0; i < n; i++) {
      plusBtn.click()
      await new Promise((r) => setTimeout(r, 100))
    }
    return { ok: true }
  }, n)
}

const log = []
function rec(o) { log.push(o); console.log(JSON.stringify(o)) }

// Step 1: open track A (head: Modah Ani), read initial state
await page.goto(`${BASE}/perform/setlist/${CLONE}/track/${samples[0].id}`, { waitUntil: "domcontentloaded", timeout: 15000 })
await page.waitForTimeout(2500)
const s0 = await readTransposeState(page)
rec({ step: "open-A", track: samples[0].title, state: s0 })

// Step 2: apply +2 to track A
const apply = await applyTransposePlusN(page, 2)
rec({ step: "apply+2-A", track: samples[0].title, result: apply })
await page.waitForTimeout(800)
const s0_after = await readTransposeState(page)
rec({ step: "after-apply-A", state: s0_after })

// Step 3-N: navigate to each subsequent track, read state immediately
for (let i = 1; i < samples.length; i++) {
  await page.goto(`${BASE}/perform/setlist/${CLONE}/track/${samples[i].id}`, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.waitForTimeout(2500)
  const st = await readTransposeState(page)
  rec({ step: "open-next", track: samples[i].title, role: samples[i].role, state: st })
}

await browser.close()
process.exit(0)
