// F-C12-006: 20-track URL preservation runtime probe.
// Chromium-substituted (WebKit deps missing in sandbox). Relaunches browser
// per chunk to dodge sandbox memory closures observed in first attempt.
import { chromium } from "@playwright/test"

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://www.centralreform.live"
const CLONE_ID = process.env.CLONE_ID || "86a104ae-d728-4b64-9ec2-8c3b28b01613"

const tracks = [
  { id: "b176c4c5-dc76-4992-86a1-f4a869a2addb", order: 0, type: "song", title: "Fiddley Tune" },
  { id: "8e53db26-cf54-462a-b543-26ecd6311d5f", order: 1, type: "section", title: "INTRO" },
  { id: "8d029da2-7dcd-45b0-94be-7631cf567099", order: 2, type: "song", title: "Modah Ani" },
  { id: "25881c95-6e51-4658-8f22-ba7ee6b198ff", order: 3, type: "song", title: "Ma tovu / Hinei ma tov" },
  { id: "4d3b44d2-429f-4241-83af-79a43754860a", order: 4, type: "song", title: "Psukei dzimrah" },
  { id: "aaf1fb09-864e-4351-8789-797aab35c6e2", order: 5, type: "section", title: "shema and Blessings" },
  { id: "c4843ec1-893d-4ceb-b37b-fa8779eefc0d", order: 6, type: "song", title: "Barchu (Friedman)" },
  { id: "7c7efcef-4015-4cc9-aae1-3a77af0cc37d", order: 7, type: "song", title: "Ahava raba" },
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

async function probeTrack(page, t) {
  const url = `${BASE}/perform/setlist/${CLONE_ID}/track/${t.id}`
  const expectedPath = `/perform/setlist/${CLONE_ID}/track/${t.id}`
  let initialOk = "?", initialUrl = "?", reloadUrl = "?", err = null
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
    initialOk = resp && resp.ok() ? "200" : (resp ? String(resp.status()) : "no-resp")
    await page.waitForTimeout(1800)
    initialUrl = await page.evaluate(() => window.location.pathname)
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(1800)
    reloadUrl = await page.evaluate(() => window.location.pathname)
  } catch (e) {
    err = String(e.message || e).slice(0, 120)
  }
  const initialPreserved = initialUrl === expectedPath
  const reloadPreserved = reloadUrl === expectedPath
  return { order: t.order, type: t.type, title: t.title, initialOk, initialPreserved, reloadPreserved, initialUrl: initialPreserved ? "ok" : initialUrl.slice(-44), reloadUrl: reloadPreserved ? "ok" : reloadUrl.slice(-44), err }
}

const results = []
const CHUNK = 4
for (let i = 0; i < tracks.length; i += CHUNK) {
  const chunk = tracks.slice(i, i + CHUNK)
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
  })
  const page = await ctx.newPage()
  for (const t of chunk) {
    const r = await probeTrack(page, t)
    results.push(r)
    console.log(JSON.stringify(r))
  }
  await browser.close()
}

const pass = results.filter((r) => r.initialPreserved && r.reloadPreserved && r.initialOk === "200").length
const sectionsRedirecting = results.filter((r) => r.type === "section" && !r.initialPreserved).length
console.log(`\nSUMMARY: ${pass}/${results.length} URL preservation pass; ${sectionsRedirecting}/4 section dividers redirected away`)
process.exit(0)
