#!/usr/bin/env node
/**
 * Multi-tenant phase 1 — golden HTTP outputs for CRC and Brothers Lazaroff.
 *
 * Fetches every public, host-dependent surface from a deployment, normalises
 * away what changes on every build (chunk hashes, build ids, nonces, dates),
 * and writes one text file per surface per tenant. Run once before a change
 * (`--out <dir>`), again after (`--out <dir2>`), and compare with `--diff`.
 *
 *   node scripts/dev/golden-http-capture.mjs --out <dir>
 *   node scripts/dev/golden-http-capture.mjs --diff <dirA> <dirB>
 *
 * Optional MCP instructions capture (initialize result) when bearers are set:
 *   CRC_BEARER=... BL_BEARER=...
 * Hosts can be overridden: CRC_ORIGIN, BL_ORIGIN.
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { JSDOM } from "jsdom"

const TENANTS = {
    crc: { origin: process.env.CRC_ORIGIN || "https://www.centralreform.live", bearer: process.env.CRC_BEARER },
    brotherslazaroff: { origin: process.env.BL_ORIGIN || "https://www.brotherslazaroff.live", bearer: process.env.BL_BEARER },
}

const PAGES = ["/", "/login", "/perform", "/privacy", "/terms", "/sms-consent", "/accessibility", "/changelog", "/unauthorized", "/no-such-page-golden"]
const TEXT = ["/robots.txt", "/sitemap.xml"]

const slug = (p) => (p === "/" ? "root" : p.replace(/^\//, "").replace(/[^a-z0-9.-]+/gi, "_"))

/** next/font class names are build hashes: an uncached rebuild of the same source renames them. */
const fontHash = (v) => (v ?? "").replace(/__(variable|className)_[0-9a-f]{6}/g, "__$1_<H>")

function normText(s) {
    return s
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<DATE>")
        .replace(/\r\n/g, "\n")
}

/** Head tags (sorted, hashes stripped) + html attrs + visible body text. */
function normHtml(html) {
    const dom = new JSDOM(html)
    const d = dom.window.document
    for (const el of d.querySelectorAll("script, style, noscript, template")) el.remove()
    const strip = (v) =>
        (v ?? "")
            .replace(/\/_next\/static\/[^"' )]+/g, "/_next/static/<H>")
            .replace(/[?&]dpl=[^"'& ]+/g, "")
            .replace(/[?&]v=[0-9a-f]{6,}/gi, "")
    const lines = []
    const htmlEl = d.documentElement
    lines.push(`html lang=${htmlEl.getAttribute("lang")} dir=${htmlEl.getAttribute("dir")} data-org=${htmlEl.getAttribute("data-org")} class=${fontHash(htmlEl.getAttribute("class"))}`)
    lines.push(`body class=${fontHash(d.body?.getAttribute("class"))}`)
    lines.push(`title=${d.title}`)
    const head = []
    for (const el of d.head.querySelectorAll("meta, link")) {
        const attrs = [...el.attributes]
            .filter((a) => !["nonce", "data-precedence", "precedence", "crossorigin", "fetchpriority"].includes(a.name))
            .map((a) => `${a.name}=${strip(a.value)}`)
            .sort()
        if (el.tagName === "LINK" && /preload|modulepreload|stylesheet|preconnect|dns-prefetch/.test(el.getAttribute("rel") ?? "")) continue
        head.push(`${el.tagName.toLowerCase()} ${attrs.join(" ")}`)
    }
    lines.push(...head.sort())
    lines.push("--- body text ---")
    const text = (d.body?.textContent ?? "").replace(/\s+/g, " ").trim()
    lines.push(normText(text))
    lines.push("--- images ---")
    for (const img of d.querySelectorAll("img")) lines.push(`img src=${strip(img.getAttribute("src"))} alt=${img.getAttribute("alt")}`)
    return lines.join("\n") + "\n"
}

async function get(url, init) {
    const res = await fetch(url, { redirect: "manual", ...init })
    return res
}

async function mcpInstructions(origin, bearer) {
    const res = await fetch(`${origin}/api/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "golden-capture", version: "1" } } }),
    })
    const text = await res.text()
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? text
    const j = JSON.parse(data)
    return { serverInfo: j.result?.serverInfo, instructions: j.result?.instructions ?? null }
}

async function capture(outDir) {
    for (const [org, t] of Object.entries(TENANTS)) {
        const dir = join(outDir, org)
        mkdirSync(dir, { recursive: true })
        for (const p of PAGES) {
            const res = await get(t.origin + p)
            const loc = res.headers.get("location")
            const body = res.status >= 300 && res.status < 400 ? "" : await res.text()
            const out = `status=${res.status}${loc ? ` location=${loc.replace(t.origin, "")}` : ""}\n` + (body ? normHtml(body) : "")
            writeFileSync(join(dir, `page_${slug(p)}.txt`), out)
        }
        for (const p of TEXT) {
            const res = await get(t.origin + p)
            writeFileSync(join(dir, `text_${slug(p)}.txt`), `status=${res.status}\n` + normText(await res.text()))
        }
        // Icons, Open Graph and Twitter images: fetch exactly what the login head links.
        const login = readFileSync(join(dir, "page_login.txt"), "utf8")
        const bins = new Set()
        for (const m of login.matchAll(/^link href=(\/\S+) rel=(?:icon|apple-touch-icon)/gm)) bins.add(m[1])
        for (const m of login.matchAll(/^meta content=(\S+) (?:property=og:image|name=twitter:image)$/gm)) bins.add(m[1])
        const binLines = []
        for (const u of [...bins].sort()) {
            // og/twitter URLs are absolute on the canonical bare host; fetch them on this origin.
            const path = u.replace(/^https?:\/\/[^/]+/, "")
            const res = await get(t.origin + path)
            const buf = Buffer.from(await res.arrayBuffer())
            binLines.push(`${u} status=${res.status}${res.headers.get("location") ? ` location=${res.headers.get("location")}` : ""} type=${res.headers.get("content-type")} bytes=${buf.length} sha256=${createHash("sha256").update(buf).digest("hex")}`)
        }
        writeFileSync(join(dir, "binaries.txt"), binLines.join("\n") + "\n")
        // The page head names the manifest; capture whichever one this tenant links.
        const m = login.match(/link href=(\/[^ ]*manifest[^ ]*\.json)/)
        if (m) {
            const res = await get(t.origin + m[1])
            writeFileSync(join(dir, `manifest.txt`), `path=${m[1]} status=${res.status}\n` + (await res.text()))
        }
        if (t.bearer) {
            const r = await mcpInstructions(t.origin, t.bearer)
            writeFileSync(join(dir, "mcp_instructions.txt"), `serverInfo=${JSON.stringify(r.serverInfo)}\n${r.instructions ?? "<none>"}\n`)
        }
        console.log(`captured ${org} → ${dir}`)
    }
}

function diff(a, b) {
    let bad = 0
    for (const org of Object.keys(TENANTS)) {
        const da = join(a, org), db = join(b, org)
        const files = new Set([...(existsSync(da) ? readdirSync(da) : []), ...(existsSync(db) ? readdirSync(db) : [])])
        for (const f of [...files].sort()) {
            // Checked-in goldens may come back with CRLF on Windows checkouts.
            // Older captures kept raw font hashes, so mask them on both sides.
            const norm = (t) => fontHash(t.replace(/\r\n/g, "\n"))
            const fa = existsSync(join(da, f)) ? norm(readFileSync(join(da, f), "utf8")) : "<missing>"
            const fb = existsSync(join(db, f)) ? norm(readFileSync(join(db, f), "utf8")) : "<missing>"
            if (fa === fb) continue
            bad++
            const la = fa.split("\n"), lb = fb.split("\n")
            const first = la.findIndex((l, i) => l !== lb[i])
            console.log(`DIFF ${org}/${f} first differing line ${first + 1}:\n  - ${la[first]?.slice(0, 300)}\n  + ${lb[first]?.slice(0, 300)}`)
        }
    }
    console.log(bad ? `${bad} surface(s) differ` : "all surfaces identical")
    process.exit(bad ? 1 : 0)
}

const args = process.argv.slice(2)
if (args[0] === "--diff") diff(args[1], args[2])
else if (args[0] === "--out") await capture(args[1])
else {
    console.error("usage: --out <dir> | --diff <dirA> <dirB>")
    process.exit(2)
}
