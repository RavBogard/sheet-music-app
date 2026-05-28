// Resume F-C12-006: probe tracks 8-19 (12 tracks) in a single browser session.
import { chromium } from "@playwright/test"
const BASE = "https://www.centralreform.live"
const CLONE = "86a104ae-d728-4b64-9ec2-8c3b28b01613"
const tracks = [
  { id: "4efcc8f7-5850-4d6c-bc4d-39686a2bc88d", order: 8, type: "song", title: "Mi chamocha" },
  { id: "2353edbe-d553-4b12-976c-3e10e805b3ac", order: 9, type: "section", title: "Amidah" },
  { id: "c1cf291c-30a7-4232-8983-25fdc1b15e4b", order: 10, type: "song", title: "Adonai sfatai" },
  { id: "1c6b5637-b7cb-469d-aa32-82c5a763f3cc", order: 11, type: "song", title: "Kedusha" },
  { id: "b3e1704f-1bbb-48a8-a5db-1734dfb5d823", order: 12, type: "song", title: "Veshamru" },
  { id: "edab29e0-6248-4427-a726-20e62c3f9709", order: 13, type: "song", title: "Rtsei" },
  { id: "2e1a6291-92a6-4e52-9d83-b195e7af176f", order: 14, type: "song", title: "Sim Shalom" },
  { id: "5db0482b-0277-4865-8832-ecc4245bcf81", order: 15, type: "song", title: "Oseh shalom" },
  { id: "40a3373c-0f53-4e5b-82c5-a81756649554", order: 16, type: "section", title: "Torah Service" },
  { id: "c98db861-21f1-40b7-bf7b-ecdb26c33840", order: 17, type: "song", title: "Hakafah" },
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
  const initialPreserved = initialUrl === expected
  const reloadPreserved = reloadUrl === expected
  console.log(JSON.stringify({ order: t.order, type: t.type, title: t.title, initialOk, initialPreserved, reloadPreserved, initialUrl: initialPreserved ? "ok" : initialUrl.slice(-44), reloadUrl: reloadPreserved ? "ok" : reloadUrl.slice(-44), err }))
}
await browser.close()
process.exit(0)
