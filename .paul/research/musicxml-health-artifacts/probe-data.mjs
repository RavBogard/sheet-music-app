// Query prod library for existing MusicXML/xml rows + their mimeType (routing evidence)
import { readRootBearer, mcp } from './mcp.mjs'
import { promises as fs } from 'fs'

const bearer = await readRootBearer()

// list_library — page through; capture id/name/mimeType-ish fields
let all = []
for (let offset = 0; offset < 700; offset += 100) {
  const r = await mcp(bearer, 'list_library', { limit: 100, offset })
  const rows = r.charts || r.items || r.library || r.results || r.rows || []
  if (!Array.isArray(rows) || rows.length === 0) { if (offset === 0) { console.log('[shape] list_library keys:', Object.keys(r)); console.log(JSON.stringify(r).slice(0, 800)) } break }
  all = all.concat(rows)
  if (rows.length < 100) break
}
console.log('[list_library] total rows:', all.length)
if (all[0]) console.log('[row shape] keys:', Object.keys(all[0]))

const xmlish = all.filter(r => {
  const mt = (r.mimeType || r.contentType || '').toLowerCase()
  const nm = (r.name || r.title || r.fileName || '').toLowerCase()
  const fid = (r.fileId || r.id || '').toLowerCase()
  return mt.includes('xml') || mt.includes('musescore') || mt.includes('octet') ||
    /\.(mxl|musicxml|xml|mscz|mscx)$/.test(nm) || /\.(mxl|musicxml|xml|mscz|mscx)$/.test(fid)
})
console.log('[xmlish rows]', xmlish.length)
for (const r of xmlish) {
  console.log(JSON.stringify({ id: r.id || r.fileId, name: r.name || r.title, mimeType: r.mimeType || r.contentType, status: r.status }))
}

// Also try search_library for "xml" hint
const s = await mcp(bearer, 'search_library', { query: 'xml', limit: 20 })
console.log('[search xml] keys:', Object.keys(s))

await fs.writeFile('./data-probe-out.json', JSON.stringify({ total: all.length, sampleRow: all[0], xmlish }, null, 2))
console.log('[done] wrote data-probe-out.json')
