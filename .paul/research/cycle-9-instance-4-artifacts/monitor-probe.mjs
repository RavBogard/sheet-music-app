/**
 * cycle-9-instance-4 monitor-route probe.
 *
 * Drives /monitor with three role-shapes (unauth, musician-no-bus, band_leader,
 * sound-engineer) and captures auth-gate behavior + WS connection layer state.
 *
 * Bearers are passed via env vars (C9I4_BEARER_MUSICIAN, C9I4_BEARER_BL,
 * C9I4_BEARER_SE) — they MUST NOT be written to disk per PARENT §2.
 *
 * Per META-003 the test-session route returns a customToken but the harness
 * does NOT pull the Firebase Web SDK in, so client-side `useAuth` will stay
 * unauthenticated. We document this in the artifact: the cowork limitation
 * is recorded, not a finding against /monitor itself.
 *
 * Limitations (documented, not bugs):
 *   - bridge WS target is wss://192.168.1.50:9001 (LAN). From the cowork
 *     sandbox this connect will fail; we observe the connection-error path,
 *     not happy-path UI.
 *   - Without Web SDK signin the auth-gate falls through to "Sign in" — we
 *     can confirm that path, but cannot directly observe the gated UI.
 */

import { chromium } from "playwright"
import { writeFileSync, mkdirSync } from "node:fs"

const BASE = "https://www.centralreform.live"
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || "./out"
mkdirSync(ARTIFACT_DIR, { recursive: true })

const TARGETS = [
    { label: "unauth", bearer: null, uid: null },
    { label: "musician", bearer: process.env.C9I4_BEARER_MUSICIAN, uid: "test-c9i4-musician-dc88f728" },
    { label: "band_leader", bearer: process.env.C9I4_BEARER_BL, uid: "test-c9i4-band_leader-459591bc" },
    { label: "sound_engineer", bearer: process.env.C9I4_BEARER_SE, uid: "test-c9i4-musician-13a08f0b" },
]

async function mintCookie(bearer, uid) {
    const res = await fetch(`${BASE}/api/auth/test-session`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({ uid }),
    })
    const setCookie = res.headers.get("set-cookie")
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body, setCookie }
}

function parseSessionCookie(setCookie) {
    if (!setCookie) return null
    const m = setCookie.match(/__session=([^;]+)/)
    return m ? m[1] : null
}

async function probeOne(target) {
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
        viewport: { width: 1024, height: 1366 }, // iPad-ish portrait
        userAgent:
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    })
    let cookieAdded = false
    let mintResult = null
    if (target.bearer && target.uid) {
        mintResult = await mintCookie(target.bearer, target.uid)
        const sess = parseSessionCookie(mintResult.setCookie)
        if (sess) {
            await ctx.addCookies([
                {
                    name: "__session",
                    value: sess,
                    domain: "www.centralreform.live",
                    path: "/",
                    secure: true,
                    httpOnly: true,
                    sameSite: "Lax",
                },
            ])
            cookieAdded = true
        }
    }
    const page = await ctx.newPage()
    const console_msgs = []
    page.on("console", (m) =>
        console_msgs.push({ type: m.type(), text: m.text().slice(0, 500) }),
    )
    const requests = []
    page.on("request", (r) => {
        const url = r.url()
        if (url.startsWith("ws") || url.includes("bridge") || url.includes("monitor")) {
            requests.push({ method: r.method(), url: url.slice(0, 300) })
        }
    })
    const wsEvents = []
    page.on("websocket", (ws) => {
        wsEvents.push({ event: "ws_open", url: ws.url().slice(0, 300) })
        ws.on("close", () => wsEvents.push({ event: "ws_close", url: ws.url().slice(0, 300) }))
        ws.on("socketerror", (e) => wsEvents.push({ event: "ws_error", url: ws.url().slice(0, 300), error: String(e).slice(0, 300) }))
    })
    const resp = await page.goto(`${BASE}/monitor`, { waitUntil: "domcontentloaded", timeout: 30000 })
    // Give client a moment to attempt WS connect / Firebase hydrate.
    await page.waitForTimeout(6000)
    const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 4000))
    const html = await page.content()
    const screenshotPath = `${ARTIFACT_DIR}/monitor-${target.label}.png`
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await browser.close()
    return {
        label: target.label,
        cookieAdded,
        mintResult: mintResult
            ? {
                  ok: mintResult.ok,
                  status: mintResult.status,
                  bodyKeys: Object.keys(mintResult.body || {}),
                  hasCustomToken: typeof mintResult.body?.customToken === "string",
              }
            : null,
        responseStatus: resp?.status() ?? null,
        visibleText,
        consoleErrors: console_msgs.filter((m) => m.type === "error"),
        consoleWarnings: console_msgs.filter((m) => m.type === "warning").slice(0, 10),
        wsEvents,
        bridgeRequestSeen: requests.find((r) => r.url.includes("192.168")) ?? null,
        htmlLength: html.length,
        screenshotPath,
    }
}

const out = []
for (const t of TARGETS) {
    process.stdout.write(`probing ${t.label}...\n`)
    try {
        const r = await probeOne(t)
        out.push(r)
        process.stdout.write(
            `  visibleText.head: ${JSON.stringify(r.visibleText.slice(0, 220))}\n`,
        )
    } catch (err) {
        out.push({ label: t.label, error: String(err) })
        process.stdout.write(`  ERROR: ${err}\n`)
    }
}
writeFileSync(
    `${ARTIFACT_DIR}/monitor-probe-results.json`,
    JSON.stringify(out, null, 2),
)
process.stdout.write(`wrote ${ARTIFACT_DIR}/monitor-probe-results.json\n`)
