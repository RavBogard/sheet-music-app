// Deployed REPRO for the MusicXML intake-mime fix.
// BEFORE deploy: octet-stream + .mxl is REJECTED (G-7). AFTER: accepted + typed application/xml.
import { readRootBearer, mcp, BASE_URL } from './mcp.mjs'

const bearer = await readRootBearer()
const ver = await fetch(`${BASE_URL}/api/version`).then(r => r.json())
console.log('[prod sha]', ver.sha)

const xml = '<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>'
const b64 = Buffer.from(xml, 'utf8').toString('base64')

const created = []
async function tryUpload(label, fileName) {
  const r = await mcp(bearer, 'upload_chart', {
    title: `ZZ-MIMEREPRO-${label}`, fileName, mimeType: 'application/octet-stream',
    fileBase64: b64, collection: 'uploads', force: true,
  })
  const ok = r.ok === true
  let indexMime = null
  if (ok) {
    created.push(r.fileId)
    // read library_index mime via list_library
    for (let o = 0; o < 800 && !indexMime; o += 200) {
      const L = await mcp(bearer, 'list_library', { limit: 200, offset: o })
      const row = (L.rows || []).find(x => x.fileId === r.fileId)
      if (row) indexMime = row.mimeType
      if ((L.rows || []).length < 200) break
    }
  }
  console.log(`[${label}] ok=${ok} fileId=${r.fileId || '-'} indexMime=${indexMime || '-'} ${r.error?.message ? 'ERR: ' + r.error.message.slice(0, 90) : ''}`)
  return { label, fileName, ok, fileId: r.fileId, indexMime, error: r.error?.message }
}

const results = []
results.push(await tryUpload('mxl', 'repro.mxl'))
results.push(await tryUpload('musicxml', 'repro.musicxml'))
results.push(await tryUpload('unknownbin', 'repro.bin')) // must STAY rejected (G-7)

// cleanup any created
for (const id of created) { await mcp(bearer, 'delete_chart', { fileId: id, force: true }).catch(()=>{}) }
console.log(`[cleanup] deleted ${created.length} repro charts`)
console.log(JSON.stringify({ sha: ver.sha, results }, null, 2))
