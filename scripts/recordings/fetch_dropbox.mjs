#!/usr/bin/env node
/**
 * Recordings ingest, step 1: list the Dropbox shared folders and download the MP3s we cut.
 *
 *   node scripts/recordings/fetch_dropbox.mjs inventory
 *       Reads .recordings-work/sources.json, renders each shared folder in headless Chromium
 *       (the listing is client-side), recurses into subfolders, and writes
 *       .recordings-work/inventory.json: [{ folder, root, path, files: [{ name, size, sizeBytes,
 *       modified, modifiedApprox, url }] }].
 *
 *   node scripts/recordings/fetch_dropbox.mjs download <folder> [<folder> ...]
 *       For each named folder (its `folder` value in inventory.json), downloads the MP3s
 *       chosen by pickDownloads() into .recordings-work/src/<folder>/. Never a WAV.
 *       Resumable: a file already on disk with the listed size (within 2%) is skipped.
 *
 * No Dropbox token: each file's own shared link is read off the rendered page and fetched
 * with dl=1. Folder URLs live in sources.json, not in this file.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const WORK = path.resolve(process.env.RECORDINGS_WORK ?? '.recordings-work')

/** "180.2 MB" → bytes (approximate; Dropbox rounds). */
export function parseSize(text) {
    const m = /([\d.,]+)\s*(B|KB|MB|GB|TB)/i.exec(text ?? '')
    if (!m) return null
    const n = Number(m[1].replace(/,/g, ''))
    const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()]
    return Math.round(n * mult)
}

/** "9 months ago" / "2 days ago" / "10/3/2025" → approximate ISO date (YYYY-MM-DD) or null. */
export function approxModified(text, now = new Date()) {
    if (!text) return null
    const rel = /(\d+|an?)\s+(minute|hour|day|week|month|year)s?\s+ago/i.exec(text)
    if (rel) {
        const n = /^an?$/i.test(rel[1]) ? 1 : Number(rel[1])
        const d = new Date(now)
        const unit = rel[2].toLowerCase()
        if (unit === 'minute' || unit === 'hour') return d.toISOString().slice(0, 10)
        if (unit === 'day') d.setUTCDate(d.getUTCDate() - n)
        if (unit === 'week') d.setUTCDate(d.getUTCDate() - 7 * n)
        if (unit === 'month') d.setUTCMonth(d.getUTCMonth() - n)
        if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() - n)
        return d.toISOString().slice(0, 10)
    }
    const abs = Date.parse(text)
    return Number.isNaN(abs) ? null : new Date(abs).toISOString().slice(0, 10)
}

/**
 * Which files to download from one folder: the highest-V MP3 of each mix stem.
 * `SERVICE_V1.mp3` + `SERVICE_V2.mp3` → V2 only. A folder of single songs
 * (`MI SHEBEIRACH_V1.mp3`, `LECHA DODI_V2.mp3`) has several stems → the latest V of each.
 */
export function pickDownloads(files) {
    const best = new Map()
    for (const f of files) {
        if (!/\.mp3$/i.test(f.name)) continue
        const { stem, v } = mixStem(f.name)
        const cur = best.get(stem)
        if (!cur || v > cur.v) best.set(stem, { v, file: f })
    }
    return [...best.values()].map((b) => b.file)
}

/**
 * Split a mix file name into its stem and mix version. The V token sits anywhere:
 * `V1_4.24_SHIR SHABBAT.mp3`, `SAT MORNING_MICHAEL BAR MITZVAH_V2_25.06.28_1.mp3`,
 * `SHIR SHABBAT_11.14_V2.mp3`. A trailing `_1` copy suffix is ignored.
 */
export function mixStem(name) {
    const base = name.replace(/\.[^.]+$/, '')
    const m = /(?:^|[_ -])V(\d+)(?=[_ -]|$)/i.exec(base)
    const v = m ? Number(m[1]) : 0
    const stem = (m ? base.slice(0, m.index) + base.slice(m.index + m[0].length) : base)
        .replace(/_\d$/, '')
        .replace(/^[_ -]+|[_ -]+$/g, '')
        .toUpperCase()
    return { stem, v }
}

export function downloadUrl(url) {
    const u = new URL(url)
    u.searchParams.set('dl', '1')
    return u.toString()
}

async function listFolder(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    const seen = new Map()
    for (let i = 0; i < 30; i++) {
        const rows = await page.$$eval('[role="row"]', (rs) =>
            rs.map((r) => {
                const a = r.querySelector('a[data-testid="sl-list-column--name"]') ?? r.querySelector('a')
                const cell = (id) => r.querySelector(`[data-testid="sl-list-column--${id}"]`)?.innerText?.trim() ?? ''
                return { name: a?.getAttribute('aria-label') ?? a?.innerText?.trim() ?? '', href: a?.href ?? '', modified: cell('modified'), size: cell('size') }
            }),
        )
        const before = seen.size
        for (const r of rows) if (r.href && r.name) seen.set(r.href, r)
        if (seen.size === before && i > 0) break
        await page.mouse.wheel(0, 4000)
        await page.waitForTimeout(800)
    }
    return [...seen.values()]
}

async function inventory() {
    const { chromium } = await import('playwright')
    const sources = JSON.parse(fs.readFileSync(path.join(WORK, 'sources.json'), 'utf8'))
    const browser = await chromium.launch()
    const page = await browser.newPage()
    const out = []
    const visit = async (root, url, relPath, depth) => {
        const rows = await listFolder(page, url)
        const files = []
        for (const r of rows) {
            const isFolder = !r.size || r.size === '--'
            if (isFolder) {
                if (depth < 3) await visit(root, r.href, relPath ? `${relPath}/${r.name}` : r.name, depth + 1)
                continue
            }
            files.push({
                name: r.name,
                size: r.size,
                sizeBytes: parseSize(r.size),
                modified: r.modified,
                modifiedApprox: approxModified(r.modified),
                url: r.href,
            })
        }
        if (files.length) {
            const folder = relPath.split('/').pop()
            out.push({ folder: `${root}/${relPath}`, leaf: folder, root, path: relPath, files })
        }
        process.stderr.write(`listed ${root}/${relPath || '.'}: ${rows.length} rows\n`)
    }
    for (const s of sources.folders) await visit(s.label, s.url, '', 0)
    await browser.close()
    fs.writeFileSync(path.join(WORK, 'inventory.json'), JSON.stringify(out, null, 2))
    console.log(`inventory: ${out.length} folders with files → ${path.join(WORK, 'inventory.json')}`)
}

async function download(args) {
    const mi = args.indexOf('--match')
    const match = mi >= 0 ? new RegExp(args[mi + 1], 'i') : null
    const folders = mi >= 0 ? args.filter((_, i) => i !== mi && i !== mi + 1) : args
    const inv = JSON.parse(fs.readFileSync(path.join(WORK, 'inventory.json'), 'utf8'))
    for (const name of folders) {
        const entry = inv.find((e) => e.folder === name)
        if (!entry) throw new Error(`folder not in inventory: ${name}`)
        const dir = path.join(WORK, 'src', safeName(entry.folder))
        fs.mkdirSync(dir, { recursive: true })
        for (const f of pickDownloads(entry.files).filter((f) => !match || match.test(f.name))) {
            const dest = path.join(dir, f.name)
            if (fs.existsSync(dest) && f.sizeBytes && Math.abs(fs.statSync(dest).size - f.sizeBytes) / f.sizeBytes < 0.02) {
                console.log(`skip (have it): ${dest}`)
                continue
            }
            const res = await fetch(downloadUrl(f.url), { redirect: 'follow' })
            if (!res.ok || !res.body) throw new Error(`download failed ${res.status}: ${f.name}`)
            const tmp = `${dest}.part`
            await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp))
            fs.renameSync(tmp, dest)
            console.log(`downloaded ${dest} (${fs.statSync(dest).size} bytes)`)
        }
    }
}

export function safeName(folder) {
    return folder.replace(/[<>:"\\|?*]/g, '_').replace(/\//g, '__')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    const [cmd, ...rest] = process.argv.slice(2)
    if (cmd === 'inventory') await inventory()
    else if (cmd === 'download') await download(rest)
    else {
        console.error('usage: fetch_dropbox.mjs inventory | download <folder>... [--match <regex>]')
        process.exit(2)
    }
}
