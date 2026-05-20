// Clean up MusicXML-audit fixtures BY ID (never cleanup_all_test_data).
import { readRootBearer, mcp } from './mcp.mjs'
const bearer = await readRootBearer()

const CHART_IDS = [
  'upload-897575aa-9c6b-42d0-a664-e34c6df49334',
  'upload-8738c267-e699-4035-ad77-3bbeb0c818fe',
  'upload-db18f672-ba75-403a-a3c8-de5d26dbc555',
]
const SETLIST_ID = 'e7fef07d-2120-4850-98e0-677a74e2ba75'

// 1) delete setlist (unbonds its tracks)
const ds = await mcp(bearer, 'delete_setlist', { setlistId: SETLIST_ID, id: SETLIST_ID })
console.log('[delete_setlist]', JSON.stringify(ds).slice(0, 160))

// 2) delete charts
for (const id of CHART_IDS) {
  const r = await mcp(bearer, 'delete_chart', { fileId: id, force: true })
  console.log(`[delete_chart ${id.slice(0,18)}]`, JSON.stringify(r).slice(0, 160))
}

// 3) revoke all zzmxl test accounts
const list = await mcp(bearer, 'list_test_accounts', {})
const accs = (list.accounts || list.rows || list.testAccounts || []).filter(a => /zzmxl/.test(a.uid || a.id || ''))
console.log(`[test accounts] zzmxl: ${accs.length}`)
for (const a of accs) {
  const uid = a.uid || a.id
  const r = await mcp(bearer, 'revoke_test_account', { uid })
  console.log(`  revoke ${uid}:`, JSON.stringify(r).slice(0, 100))
}

// 4) verify gone
const check = await mcp(bearer, 'list_test_accounts', {})
const left = (check.accounts || check.rows || check.testAccounts || []).filter(a => /zzmxl/.test(a.uid || a.id || ''))
console.log(`[verify] zzmxl accounts remaining: ${left.length}`)
console.log('[cleanup done]')
