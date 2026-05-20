// Lane C-2 follow-up — purge the dangling `tracks` docs that block delete_chart
// on the 5 byte-less upload-orphans. These tracks reference DELETED setlists
// (pre-v60-07-02 cascade-gap orphans); no setlist-scoped MCP tool can clear
// them (404 on dead parent). Admin SDK deletes the orphan track docs directly.
//
// SAFETY: only deletes a track whose parent setlist does NOT exist. If any
// matched track's parent setlist still EXISTS (a live bond), ABORTS without
// deleting anything.
//
// Run: node scripts/lane-c2-purge-dangling-tracks.mjs            (dry-run)
//      node scripts/lane-c2-purge-dangling-tracks.mjs --apply    (delete)
import * as dotenv from "dotenv"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
dotenv.config({ path: process.env.ENV_FILE || ".env.local" })

const FIDS = [
  "upload-037d9094-ccc8-4f0f-ba31-de1b3e4991b6", // Em Bar'chu-Yotzier Walkdown
  "upload-0792351b-3ee8-4e96-b7a0-2eeeb3b7fab4", // Lecha Dodi Lincoln's Nigun
  "upload-2db7e9ff-6224-4c0e-bbbe-4de37bf02f03", // Mizmor Shiru Ladonai
  "upload-3f576cb7-9c10-4a68-849d-4f3d669bdf80", // Niggun - Bonia Shur
  "upload-f39740c1-e90f-48c5-8adc-ab6b5d56fdbe", // Tu Bishvat
]
const APPLY = process.argv.includes("--apply")

const sa = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}
if (!sa.projectId || !sa.clientEmail || !sa.privateKey) {
  console.error("Missing Firebase admin creds in .env.local"); process.exit(1)
}
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()

const snap = await db.collection("tracks").where("fileId", "in", FIDS).get()
console.log(`tracks matching the 5 fileIds: ${snap.size}`)
const rows = []
for (const d of snap.docs) {
  const t = d.data()
  const sid = t.setlistId
  const sl = sid ? await db.collection("setlists").doc(sid).get() : { exists: false }
  rows.push({ trackId: d.id, fileId: t.fileId, setlistId: sid, title: t.title, parentExists: !!sl.exists })
}
const dangling = rows.filter((r) => !r.parentExists)
const liveStill = rows.filter((r) => r.parentExists)

console.log("\n--- DANGLING (parent setlist deleted → safe to purge) ---")
for (const r of dangling) console.log(`  ${r.fileId}  track ${r.trackId}  "${r.title}"  setlist=${r.setlistId} (MISSING)`)
console.log("\n--- LIVE (parent setlist EXISTS → would NOT touch) ---")
for (const r of liveStill) console.log(`  ${r.fileId}  track ${r.trackId}  "${r.title}"  setlist=${r.setlistId} (EXISTS)`)

if (liveStill.length > 0) {
  console.error(`\nABORT: ${liveStill.length} matched track(s) have a LIVE parent setlist — refusing to delete anything. Investigate (these are real bonds).`)
  process.exit(2)
}

if (!APPLY) {
  console.log(`\nDRY-RUN: would delete ${dangling.length} dangling track doc(s). Re-run with --apply to execute.`)
  process.exit(0)
}

let deleted = 0
for (const r of dangling) {
  await db.collection("tracks").doc(r.trackId).delete()
  deleted++
  console.log(`  deleted tracks/${r.trackId}`)
}
const after = await db.collection("tracks").where("fileId", "in", FIDS).get()
console.log(`\ndeleted ${deleted} dangling track(s). Remaining tracks matching the 5 fileIds: ${after.size} (expect 0)`)
