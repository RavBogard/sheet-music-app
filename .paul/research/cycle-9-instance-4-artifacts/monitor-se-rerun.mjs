// Single-shot SE re-probe with extended wait + console capture.
import { chromium } from "playwright"
import { writeFileSync } from "node:fs"

const BASE = "https://www.centralreform.live"
const BEARER = process.env.C9I4_BEARER_SE
const UID = "test-c9i4-musician-13a08f0b"
const OUT = "/sessions/magical-trusting-meitner/mnt/CentralReform.live/sheet-music-app/.paul/research/cycle-9-instance-4-artifacts"

const mint = await fetch(`${BASE}/api/auth/test-session`, {
    method: "POST",
    headers: { authorization: `Bearer ${BEARER}`, "content-type": "application/json" },
    body: JSON.stringify({ uid: UID }),
})
const setCookie = mint.headers.get("set-cookie")
const sess = setCookie && setCookie.match(/__session=([^;]+)/)
if (!sess) throw new Error("no cookie minted")

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
})
await ctx.addCookies([
    { name: "__session", value: sess[1], domain: "www.centralreform.live", path: "/", secure: true, httpOnly: true, sameSite: "Lax" },
])
const page = await ctx.newPage()
const msgs = []
page.on("console", function (m) { msgs.push({ t: m.type(), m: m.text().slice(0, 300) }) })
const wsEvents = []
page.on("websocket", function (ws) { wsEvents.push({ url: ws.url() }) })
await page.goto(BASE + "/monitor", { waitUntil: "domcontentloaded", timeout: 30000 })
await page.waitForTimeout(18000)
const visibleText = await page.evaluate(function () { return document.body.innerText.slice(0, 4000) })
await page.screenshot({ path: OUT + "/monitor-se-rerun.png", fullPage: true })
await browser.close()

const errs = msgs.filter(function (x) { return x.t === "error" })
writeFileSync(OUT + "/monitor-se-rerun.json", JSON.stringify({
    uid: UID,
    visibleText: visibleText,
    consoleErrors: errs,
    wsEvents: wsEvents,
}, null, 2))
console.log("VISIBLE:", visibleText.slice(0, 400))
console.log("ERRORS:", errs.length)
console.log("WSEVENTS:", wsEvents.length)
