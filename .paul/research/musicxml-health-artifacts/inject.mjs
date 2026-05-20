// Inject 3 MusicXML formats (.musicxml, .mxl, .mscz) + bond to a test setlist.
// Isolation: titles prefixed ZZ-MXLAUDIT-; test setlist isTest:true; cleaned by id afterward.
import { readRootBearer, mcp } from './mcp.mjs'
import { promises as fs } from 'fs'
import JSZip from '../../../node_modules/jszip/dist/jszip.min.js'

const bearer = await readRootBearer()
const PREFIX = 'ZZ-MXLAUDIT'

// --- 1. Load uncompressed MusicXML sample (demo) ---
const xmlText = await fs.readFile('../../../public/demo.musicxml', 'utf8')

// --- 2. Build a proper .mxl (compressed MusicXML container) ---
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`
const zip = new JSZip()
zip.file('META-INF/container.xml', container)
zip.file('score.musicxml', xmlText)
const mxlBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

// --- 3. Load .mscz fixture ---
const msczBuf = await fs.readFile('../../../src/lib/__tests__/fixtures/sample.mscz')

const samples = [
  { tag: 'xml', title: `${PREFIX}-uncompressed-xml`, fileName: 'audit.musicxml', mimeType: 'application/vnd.recordare.musicxml+xml', buf: Buffer.from(xmlText, 'utf8') },
  { tag: 'mxl', title: `${PREFIX}-compressed-mxl`, fileName: 'audit.mxl', mimeType: 'application/vnd.recordare.musicxml+xml', buf: mxlBuf },
  { tag: 'mscz', title: `${PREFIX}-musescore-mscz`, fileName: 'audit.mscz', mimeType: 'application/x-musescore', buf: msczBuf },
]

const out = { uploaded: [], setlist: null, tracks: [] }

// --- 4. Upload each ---
for (const s of samples) {
  const r = await mcp(bearer, 'upload_chart', {
    title: s.title, fileName: s.fileName, mimeType: s.mimeType,
    fileBase64: s.buf.toString('base64'), collection: 'uploads', force: true,
  })
  const rec = { tag: s.tag, title: s.title, sentMime: s.mimeType, bytes: s.buf.length, result: r }
  out.uploaded.push(rec)
  console.log(`[upload ${s.tag}] ok=${r.ok ?? '?'} id=${r.fileId || r.chartId || r.id || '?'} indexMime=${r.mimeType || r.contentType || '?'} ${r.error ? 'ERR:' + r.error : ''} ${r.__rpcError ? 'RPCERR:' + JSON.stringify(r.__rpcError).slice(0,200) : ''}`)
}

// --- 5. Create test setlist ---
const sl = await mcp(bearer, 'create_setlist', { name: `${PREFIX}-setlist`, eventDate: '2026-05-30', isTest: true })
out.setlist = sl
const setlistId = sl.setlistId || sl.id || sl.setlist?.id
console.log(`[setlist] id=${setlistId} ok=${sl.ok ?? '?'}`)

// --- 6. Bond each uploaded chart ---
for (const rec of out.uploaded) {
  const cid = rec.result.fileId || rec.result.chartId || rec.result.id
  if (!cid) { console.log(`[bond ${rec.tag}] SKIP no chart id`); continue }
  const t = await mcp(bearer, 'add_track_to_setlist', { setlistId, songId: cid, title: rec.title, force: true })
  console.log(`[bond ${rec.tag}] ok=${t.ok ?? '?'} trackId=${t.trackId || t.track?.id || '?'} ${t.error || ''} ${t.__rpcError ? 'RPCERR:'+JSON.stringify(t.__rpcError).slice(0,160):''}`)
  out.tracks.push({ tag: rec.tag, chartId: cid, addResult: t })
}

// --- 7. Read back the setlist to verify track mimeType persistence + type resolution ---
const got = await mcp(bearer, 'get_setlist', { setlistId })
out.getSetlist = got
const tracks = got.tracks || got.setlist?.tracks || []
console.log(`[get_setlist] ${tracks.length} tracks`)
for (const tr of tracks) {
  console.log(JSON.stringify({ id: tr.id, title: tr.title, fileId: tr.fileId, mimeType: tr.mimeType, type: tr.type }))
}

await fs.writeFile('./inject-out.json', JSON.stringify({ setlistId, ...out, tracks }, null, 2))
console.log(`\n[done] setlistId=${setlistId} — wrote inject-out.json`)
