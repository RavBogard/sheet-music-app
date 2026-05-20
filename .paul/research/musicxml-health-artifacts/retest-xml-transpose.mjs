// Focused: does uncompressed-XML transpose reliably? Test xml NOT-first, generous settle.
import { webkit, devices } from '@playwright/test'
import { readRootBearer, mcp, BASE_URL } from './mcp.mjs'

const XML = 'upload-897575aa-9c6b-42d0-a664-e34c6df49334'
const MXL = 'upload-8738c267-e699-4035-ad77-3bbeb0c818fe'

const bearer = await readRootBearer()
const acc = await mcp(bearer, 'create_test_account', { role: 'band_leader', uidPrefix: 'zzmxl' })
const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, { method: 'POST', headers: { authorization: `Bearer ${acc.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ uid: acc.uid }) })
const body = await sesRes.json()
const cookie = (sesRes.headers.get('set-cookie') || '').match(/__session=([^;]+)/)[1]

const browser = await webkit.launch({ headless: true })
const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } })
await ctx.addCookies([{ name: '__session', value: cookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
const boot = await ctx.newPage()
await boot.goto(`${BASE_URL}/perform`, { waitUntil: 'domcontentloaded' })
await boot.waitForFunction(() => !!window.__c7_auth_for_probes__, null, { timeout: 15000 })
await boot.evaluate(t => window.__c7_auth_for_probes__.signIn(t), body.customToken)
await boot.waitForFunction(() => !!(window.__c7_auth_for_probes__?.auth?.currentUser), null, { timeout: 15000 }).catch(()=>{})
await boot.close()

async function sig(page) {
  return page.evaluate(() => {
    const cont = document.querySelector('div.text-black'); const svg = cont?.querySelector('svg')
    const accidentals = svg ? svg.querySelectorAll('[class*="accidental" i]').length : 0
    // count key-signature sharp/flat glyphs heuristically via path count + bbox width
    return { paths: svg ? svg.querySelectorAll('path').length : 0, gEls: svg ? svg.querySelectorAll('g').length : 0, w: svg ? Math.round(svg.getBoundingClientRect().width) : 0 }
  })
}

async function run(fileId, label) {
  const page = await ctx.newPage()
  await page.goto(`${BASE_URL}/perform/${fileId}`, { waitUntil: 'domcontentloaded' })
  // wait for real render
  for (let i = 0; i < 40; i++) { const s = await sig(page); if (s.paths > 4) break; await page.waitForTimeout(500) }
  await page.waitForTimeout(2500) // generous settle
  const s0 = await sig(page)
  // open transpose popover
  await page.locator('button:has-text("Transpose")').first().click({ timeout: 6000 })
  await page.waitForTimeout(500)
  const up = page.locator('button[aria-label="Transpose up"]')
  await up.click(); await page.waitForTimeout(1500)
  const s1 = await sig(page)
  await up.click(); await page.waitForTimeout(1500) // +2 total
  const s2 = await sig(page)
  await page.screenshot({ path: `./retest-${label}.png` })
  console.log(`[${label}] s0.paths=${s0.paths} -> +1 s1.paths=${s1.paths} -> +2 s2.paths=${s2.paths} | changed=${s2.paths !== s0.paths || s1.paths !== s0.paths}`)
  await page.close()
}

await run(MXL, 'mxl-first')   // sanity: mxl first
await run(XML, 'xml-second')  // xml NOT first
await run(XML, 'xml-third-repeat') // xml again

await browser.close()
await mcp(bearer, 'revoke_test_account', { uid: acc.uid }).catch(()=>{})
console.log('[retest done]')
