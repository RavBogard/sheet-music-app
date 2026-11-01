#!/usr/bin/env node
/**
 * Recordings ingest: export the CRC setlists and songs the matcher needs, through the
 * READ-ONLY tools of the production MCP server (list_setlists, get_setlist, list_library).
 * This is the pilot's catalog source: it needs no admin credential. The planned
 * export_catalog.ts (admin SDK) writes the same shape.
 *
 *   BEARER=$(node scripts/supervisor-prod-bearer.mjs) \
 *     node scripts/recordings/export_catalog_mcp.mjs [--from 2025-01-01]
 *
 * Writes .recordings-work/catalog.json:
 *   { setlists: [{ id, name, eventDate, templateType, occasion, tracks: [{ order, title, type, songId }] }],
 *     songs: [{ songId, title }] }
 * The bearer's tenant scopes every call (CRC). Only read tools are called.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORK = path.resolve(process.env.RECORDINGS_WORK ?? '.recordings-work')
const ENDPOINT = process.env.MCP_ENDPOINT ?? 'https://www.centralreform.live/api/mcp'
const READ_ONLY = new Set(['list_setlists', 'get_setlist', 'list_library', 'search_setlists'])

let rpcId = 0
export async function callTool(name, args, bearer = process.env.BEARER) {
    if (!READ_ONLY.has(name)) throw new Error(`export_catalog_mcp only calls read tools, not ${name}`)
    if (!bearer) throw new Error('BEARER is not set')
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    })
    if (res.status === 401 || res.status === 403) throw new Error(`MCP refused the bearer (${res.status})`)
    const text = await res.text()
    return parseToolResult(text)
}

/** Parse an SSE (`data: {...}`) or plain JSON-RPC response into the tool's JSON payload. */
export function parseToolResult(text) {
    const line = text.split(/\r?\n/).find((l) => l.startsWith('data: '))
    const msg = JSON.parse(line ? line.slice(6) : text)
    if (msg.error) throw new Error(`MCP error: ${JSON.stringify(msg.error)}`)
    const body = msg.result?.content?.[0]?.text
    if (msg.result?.isError) throw new Error(`tool error: ${body}`)
    return JSON.parse(body)
}

/** Reduce a get_setlist payload to the catalog shape. */
export function toCatalogSetlist(s) {
    return {
        id: s.id,
        name: s.name,
        eventDate: s.eventDate ?? null,
        templateType: s.templateType ?? null,
        occasion: s.occasion ?? null,
        tracks: (s.tracks ?? []).map((t) => ({
            order: t.order,
            title: t.title,
            type: t.type ?? 'song',
            songId: t.songId ?? t.fileId ?? null,
        })),
    }
}

async function listAllSetlists(from) {
    // list_setlists caps at 200 per window; walk month windows so no window can overflow.
    const out = new Map()
    const start = new Date(`${from}T00:00:00Z`)
    const end = new Date()
    end.setUTCMonth(end.getUTCMonth() + 3)
    for (let d = new Date(start); d < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
        const next = new Date(d)
        next.setUTCMonth(next.getUTCMonth() + 1)
        const rows = await callTool('list_setlists', {
            from: d.toISOString(),
            to: new Date(next.getTime() - 1).toISOString(),
            limit: 200,
            sort: 'recent_event',
        })
        if (rows.length >= 200) throw new Error(`more than 200 setlists in ${d.toISOString().slice(0, 7)}`)
        for (const r of rows) out.set(r.id, r)
    }
    return [...out.values()]
}

async function listAllSongs() {
    const songs = []
    for (let offset = 0; ; offset += 200) {
        const page = await callTool('list_library', { limit: 200, offset })
        for (const r of page.rows ?? []) songs.push({ songId: r.fileId, title: r.name, collection: r.collection ?? null })
        if (!page.rows?.length || offset + 200 >= (page.total ?? 0)) break
    }
    return songs
}

async function main() {
    const i = process.argv.indexOf('--from')
    const from = i > 0 ? process.argv[i + 1] : '2025-01-01'
    const heads = await listAllSetlists(from)
    process.stderr.write(`setlists from ${from}: ${heads.length}\n`)
    const setlists = []
    for (const h of heads) setlists.push(toCatalogSetlist(await callTool('get_setlist', { id: h.id })))
    setlists.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)))
    const songs = await listAllSongs()
    fs.mkdirSync(WORK, { recursive: true })
    fs.writeFileSync(path.join(WORK, 'catalog.json'), JSON.stringify({ exportedAt: new Date().toISOString(), setlists, songs }, null, 2))
    console.log(`catalog: ${setlists.length} setlists, ${songs.length} songs → ${path.join(WORK, 'catalog.json')}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()
