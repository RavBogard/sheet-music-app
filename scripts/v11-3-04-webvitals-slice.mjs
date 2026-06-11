// v11.3-04-01 BUG-2 VERIFY-FIRST — slice webVitalsObservations field RUM by
// surface × navigationType × deviceType → p75 per metric, so we can tell
// cold first-loads (navigationType='navigate') from steady-state
// (back_forward/reload), iPad (deviceType='tablet') from other, and the
// /perform listing from the /perform/setlist/[id] chart viewer.
//
// `get_web_vitals_summary` only buckets by `surface` — it cannot answer the
// cold-vs-steady question the milestone's VERIFY-FIRST constraint mandates.
// This probe reads the raw docs (which carry navigationType+deviceType+
// userAgent from the WebVitalReport payload) and does the extra grouping.
//
// READ-ONLY. No writes, no deletes.
//
// AUTH: no Admin SA creds on this box. Reuse the firebase CLI login by minting
// a temporary `authorized_user` ADC from the configstore refresh_token (public
// firebase-tools OAuth client), then delete the temp file (finally). Same
// pattern as scripts/v11-3-03-library-orphan-sweep.mjs.
//
// USAGE:
//   node scripts/v11-3-04-webvitals-slice.mjs            (sinceDays=7)
//   node scripts/v11-3-04-webvitals-slice.mjs --since 14

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

const PROJECT = process.env.FIREBASE_PROJECT || "crcmusiccharts"
const sinceArgIdx = process.argv.indexOf("--since")
const SINCE_DAYS =
    sinceArgIdx !== -1 && process.argv[sinceArgIdx + 1]
        ? Number(process.argv[sinceArgIdx + 1])
        : 7

const METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB"]
const FOCUS_SURFACES = ["/perform", "/perform/setlist/[id]", "/setlists"]

// Public firebase-tools OAuth client (embedded in the open-source CLI).
const CLIENT_ID =
    "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi"

function refreshToken() {
    const p = join(homedir(), ".config", "configstore", "firebase-tools.json")
    let j
    try {
        j = JSON.parse(readFileSync(p, "utf8"))
    } catch {
        throw new Error(`Cannot read ${p} — run \`firebase login\` first (auth gate).`)
    }
    const t = j?.tokens?.refresh_token
    if (!t) throw new Error(`No refresh_token in ${p} — run \`firebase login\` first (auth gate).`)
    return t
}

let tmpAdcPath = null
function bootstrapAdc() {
    const dir = mkdtempSync(join(tmpdir(), "v11-3-04-adc-"))
    tmpAdcPath = join(dir, "adc.json")
    writeFileSync(
        tmpAdcPath,
        JSON.stringify({
            type: "authorized_user",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: refreshToken(),
        }),
    )
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpAdcPath
}

// Mirror src/lib/mcp/tools/web-vitals-summary.ts percentile() exactly so
// numbers reconcile with the MCP tool: nearest-rank p75, rank=ceil(p/100*n).
function percentile(values, p) {
    if (values.length === 0) return null
    const sorted = values.slice().sort((a, b) => a - b)
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
    return sorted[rank - 1]
}

// Normalize dynamic segments the same way src/lib/web-vitals.ts getSurface does,
// in case any older row stored a raw path (defensive; client already normalizes).
function normSurface(s) {
    if (typeof s !== "string" || !s.trim()) return "(unknown)"
    return s
        .replace(/\/setlists\/[^/]+/g, "/setlists/[id]")
        .replace(/\/perform\/setlist\/[^/]+/g, "/perform/setlist/[id]")
        .replace(/\/manage\/library-review\/[^/]+/g, "/manage/library-review/[id]")
}

// cold = a fresh navigation; warm = repeat/back-forward/restore.
function coldWarm(navType) {
    if (navType === "navigate") return "cold(navigate)"
    if (navType === "reload" || navType === "back_forward" || navType === "back-forward")
        return "warm(reload/bf)"
    if (navType === "prerender") return "prerender"
    return "(nav?)"
}

// deviceType is set client-side; fall back to userAgent for older/missing rows.
function device(deviceType, userAgent) {
    if (deviceType === "tablet") return "tablet(iPad)"
    if (deviceType === "mobile" || deviceType === "desktop") return deviceType
    if (typeof userAgent === "string" && /iPad|tablet/i.test(userAgent)) return "tablet(iPad?)"
    if (typeof userAgent === "string" && /Mobi|Android|iPhone/i.test(userAgent)) return "mobile?"
    return deviceType || "(device?)"
}

const fmt = (v, metric) =>
    v === null ? "—" : metric === "CLS" ? v.toFixed(3) : `${Math.round(v)}`

function emptyBucket() {
    return { LCP: [], CLS: [], INP: [], FCP: [], TTFB: [] }
}

function summarize(bucket) {
    const m = {}
    let n = 0
    for (const metric of METRICS) {
        m[metric] = { p75: percentile(bucket[metric], 75), n: bucket[metric].length }
        n += bucket[metric].length
    }
    return { metrics: m, total: n }
}

function printTable(title, rows) {
    // rows: [{ label, summary }]
    console.log(`\n### ${title}`)
    console.log(
        "| slice | LCP | FCP | CLS | TTFB | INP | n(LCP/CLS) |",
    )
    console.log("|---|---|---|---|---|---|---|")
    for (const { label, summary } of rows) {
        const m = summary.metrics
        console.log(
            `| ${label} | ${fmt(m.LCP.p75, "LCP")} | ${fmt(m.FCP.p75, "FCP")} | ${fmt(
                m.CLS.p75,
                "CLS",
            )} | ${fmt(m.TTFB.p75, "TTFB")} | ${fmt(m.INP.p75, "INP")} | ${m.LCP.n}/${m.CLS.n} |`,
        )
    }
}

async function main() {
    bootstrapAdc()
    if (!getApps().length) {
        initializeApp({ credential: applicationDefault(), projectId: PROJECT })
    }
    const db = getFirestore()

    const sinceMs = Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000
    const sinceTs = Timestamp.fromMillis(sinceMs)
    const snap = await db
        .collection("webVitalsObservations")
        .where("timestamp", ">=", sinceTs)
        .get()

    console.log(
        `# /perform web-vitals slice — sinceDays=${SINCE_DAYS}, scanned ${snap.size} observations (since ${new Date(
            sinceMs,
        ).toISOString()})`,
    )

    // Grouping maps.
    const bySurface = new Map() // surface -> bucket  (reconcile w/ MCP tool)
    const byCell = new Map() // surface -> Map(cellKey -> bucket)  (cold/warm × device)

    for (const d of snap.docs) {
        const data = d.data() || {}
        const metric = data.metric
        const value = data.value
        if (typeof metric !== "string" || !METRICS.includes(metric)) continue
        if (typeof value !== "number" || !Number.isFinite(value)) continue
        const surface = normSurface(data.surface)

        if (!bySurface.has(surface)) bySurface.set(surface, emptyBucket())
        bySurface.get(surface)[metric].push(value)

        const cell = `${coldWarm(data.navigationType)} · ${device(data.deviceType, data.userAgent)}`
        if (!byCell.has(surface)) byCell.set(surface, new Map())
        const cm = byCell.get(surface)
        if (!cm.has(cell)) cm.set(cell, emptyBucket())
        cm.get(cell)[metric].push(value)
    }

    // 1) Per-surface aggregate (reconciles with get_web_vitals_summary).
    const surfaceRows = [...bySurface.entries()]
        .map(([surface, bucket]) => ({ surface, summary: summarize(bucket) }))
        .sort((a, b) => b.summary.total - a.summary.total)
    printTable(
        "Per-surface p75 (reconcile vs get_web_vitals_summary; CWV good: LCP≤2500 FCP≤1800 CLS≤0.1 TTFB≤800)",
        surfaceRows.map((r) => ({
            label: `\`${r.surface}\``,
            summary: r.summary,
        })),
    )

    // 2) Focus surfaces broken down by (cold/warm × device) cell.
    for (const surface of FOCUS_SURFACES) {
        const cm = byCell.get(surface)
        if (!cm) {
            console.log(`\n### \`${surface}\` — no observations in window`)
            continue
        }
        const rows = [...cm.entries()]
            .map(([cell, bucket]) => ({ label: cell, summary: summarize(bucket) }))
            .sort((a, b) => b.summary.total - a.summary.total)
        printTable(`\`${surface}\` — by navigationType × deviceType`, rows)
    }
}

main()
    .catch((e) => {
        console.error("\nFATAL:", e instanceof Error ? e.message : String(e))
        process.exitCode = 1
    })
    .finally(() => {
        if (tmpAdcPath) {
            try {
                unlinkSync(tmpAdcPath)
            } catch {}
        }
    })
