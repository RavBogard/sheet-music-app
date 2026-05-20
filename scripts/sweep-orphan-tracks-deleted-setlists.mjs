// Generalized orphan-track sweep — deletes top-level `tracks` docs whose parent
// setlist no longer exists (pre-v60-07-02 cascade-gap residue). These dangling
// docs invisibly inflate delete_chart's chart_in_use guard. Lane C-2 follow-up.
//
// SAFETY: only deletes a track whose `setlistId` is a real string AND whose
// `setlists/{setlistId}` doc does NOT exist. Tracks with no setlistId are
// REPORTED but NOT deleted (separate bucket). Dry-run by default.
//
// Run: node scripts/sweep-orphan-tracks-deleted-setlists.mjs           (dry-run)
//      node scripts/sweep-orphan-tracks-deleted-setlists.mjs --apply   (delete)
import * as dotenv from "dotenv"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
dotenv.config({ path: process.env.ENV_FILE || ".env.local" })

const APPLY = process.argv.includes("--apply")
const sa = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}
if (!sa.projectId || !sa.clientEmail || !sa.privateKey) { console.error("missing creds"); process.exit(1) }
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()

const snap = await db.collection("tracks").select("setlistId", "fileId", "title").get()
console.log("total track docs:", snap.size)
const bySetlist = new Map()
let noSetlist = 0
for (const d of snap.docs) {
  const sid = d.data().setlistId
  if (!sid) { noSetlist++; continue }
  if (!bySetlist.has(sid)) bySetlist.set(sid, [])
  bySetlist.get(sid).push({ trackId: d.id, fileId: d.data().fileId, title: d.data().title })
}
console.log("tracks with NO setlistId (reported, NOT deleted):", noSetlist)
console.log("distinct setlistIds referenced:", bySetlist.size)

const dead = []
for (const sid of bySetlist.keys()) {
  const sl = await db.collection("setlists").doc(sid).get()
  if (!sl.exists) dead.push(sid)
}
const dangling = dead.flatMap((sid) => bySetlist.get(sid).map((t) => ({ ...t, setlistId: sid })))
console.log("\nDEAD setlists (referenced by tracks but missing):", dead.length)
console.log("DANGLING tracks (parent deleted):", dangling.length)
for (const sid of dead) console.log(`  ${sid}: ${bySetlist.get(sid).length} track(s)`)

if (!APPLY) {
  console.log(`\nDRY-RUN: would delete ${dangling.length} dangling track doc(s) across ${dead.length} dead setlist(s). Re-run with --apply.`)
  process.exit(0)
}

let deleted = 0
for (let i = 0; i < dangling.length; i += 400) {
  const chunk = dangling.slice(i, i + 400)
  const batch = db.batch()
  for (const t of chunk) batch.delete(db.collection("tracks").doc(t.trackId))
  await batch.commit()
  deleted += chunk.length
}
console.log(`\ndeleted ${deleted} dangling track doc(s)`)
// verify
const snap2 = await db.collection("tracks").select("setlistId").get()
const cache = new Map()
let remaining = 0
for (const d of snap2.docs) {
  const sid = d.data().setlistId
  if (!sid) continue
  let ex = cache.get(sid)
  if (ex === undefined) { ex = (await db.collection("setlists").doc(sid).get()).exists; cache.set(sid, ex) }
  if (!ex) remaining++
}
console.log("remaining dangling tracks after sweep:", remaining, "(expect 0)")
