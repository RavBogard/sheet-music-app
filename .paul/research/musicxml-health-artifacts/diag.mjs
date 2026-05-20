import { webkit, devices } from '@playwright/test'
import { readRootBearer, mcp, BASE_URL } from './mcp.mjs'

const bearer = await readRootBearer()
const acc = await mcp(bearer, 'create_test_account', { role: 'band_leader', uidPrefix: 'zzmxl' })
const sesRes = await fetch(`${BASE_URL}/api/auth/test-session`, { method: 'POST', headers: { authorization: `Bearer ${acc.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ uid: acc.uid }) })
const cookie = (sesRes.headers.get('set-cookie') || '').match(/__session=([^;]+)/)[1]

const browser = await webkit.launch({ headless: true })
const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 820, height: 1180 } })
await ctx.addCookies([{ name: '__session', value: cookie, domain: 'www.centralreform.live', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])

// 1) /perform/[fileId] — dump all buttons
const p = await ctx.newPage()
await p.goto(`${BASE_URL}/perform/upload-897575aa-9c6b-42d0-a664-e34c6df49334`, { waitUntil: 'domcontentloaded', timeout: 40000 })
await p.waitForTimeout(4000)
const btns = await p.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"]')).map(b => ({ aria: b.getAttribute('aria-label'), txt: (b.textContent || '').trim().slice(0, 30), vis: b.getBoundingClientRect().width > 0 })).filter(b => b.vis))
console.log('[perform/fileId buttons]', JSON.stringify(btns, null, 0))
const overlay = await p.evaluate(() => ({ intro: /tap|swipe|drag|gesture/i.test(document.body.innerText.slice(0,300)), bodyTop: document.body.innerText.replace(/\s+/g,' ').slice(0,200) }))
console.log('[overlay?]', JSON.stringify(overlay))
await p.close()

// 2) /perform/setlist/[id] — wait longer, dump state over time
const p2 = await ctx.newPage()
await p2.goto(`${BASE_URL}/perform/setlist/e7fef07d-2120-4850-98e0-677a74e2ba75`, { waitUntil: 'domcontentloaded', timeout: 40000 })
for (const w of [2000, 4000, 8000]) {
  await p2.waitForTimeout(w === 2000 ? 2000 : (w - (w === 4000 ? 2000 : 4000)))
  const st = await p2.evaluate(() => ({ body: document.body.innerText.replace(/\s+/g,' ').slice(0,180), svgPaths: document.querySelectorAll('svg path').length, hasCanvas: !!document.querySelector('canvas') }))
  console.log(`[setlist @${w}ms]`, JSON.stringify(st))
}
await p2.screenshot({ path: './diag-setlist.png' })
await p2.close()

await browser.close()
// cleanup this diag account
await mcp(bearer, 'revoke_test_account', { uid: acc.uid }).catch(()=>{})
console.log('[diag done]')
