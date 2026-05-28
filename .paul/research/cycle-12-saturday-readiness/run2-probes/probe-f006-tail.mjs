import { chromium } from "@playwright/test"
const BASE = "https://www.centralreform.live"
const CLONE = "86a104ae-d728-4b64-9ec2-8c3b28b01613"
const tracks = [
  { id: "4a947356-7612-43c9-8bbf-23ec8c97e97e", order: 18, type: "song", title: "Mi shebeirach" },
  { id: "a485d719-71aa-4ceb-b6d3-605ce38d9a1a", order: 19, type: "song", title: "Eitz chayim" },
]
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })
const page = await ctx.newPage()
for (const t of tracks) {
  const url = `${BASE}/perform/setlist/${CLONE}/track/${t.id}`
  const expected = `/perform/setlist/${CLONE}/track/${t.id}`
  let initialOk = "?", initialUrl = "?", reloadUrl = "?", err = null
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 })
    initialOk = resp && resp.ok() ? "200" : (resp ? String(resp.status()) : "no-resp")
    await page.waitForTimeout(1500)
    initialUrl = await page.evaluate(() => location.pathname)
    await page.reload({ waitUntil: "domcontentloaded", timeout: 12000 })
    await page.waitForTimeout(1500)
    reloadUrl = await page.evaluate(() => location.pathname)
  } catch (e) { err = String(e.message || e).slice(0, 100) }
  console.log(JSON.stringify({ order: t.order, type: t.type, title: t.title, initialOk, initialPreserved: initialUrl === expected, reloadPreserved: reloadUrl === expected, err }))
}
await browser.close()
process.exit(0)
