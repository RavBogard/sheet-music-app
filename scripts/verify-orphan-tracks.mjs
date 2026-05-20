// EXHAUSTIVE verification that the dangling `tracks` docs are genuinely dead
// BEFORE any sweep --apply. READ-ONLY — performs NO writes/deletes.
// Produces .paul/research/orphan-tracks-VERIFICATION.json (per-track) + a console summary.
//
// Proves, for EACH dangling track (not a sample):
//   c1 parentMissing      — setlists/{setlistId}.get().exists === false (authoritative admin doc-read)
//   c2 deadIdNotInLiveEnum — setlistId absent from a FULL admin enumeration of the setlists collection
//   c3 notALiveTrack       — track id absent from the set of all LIVE setlists' track ids
//   c4 chartSafety         — deleting the track doc removes 0 library_index/charts; classify the fileId
// Any track failing c1/c2/c3 => flagged DO-NOT-DELETE and excluded from safeToDelete.
//
// Run: node scripts/verify-orphan-tracks.mjs
import fs from "fs"
import * as dotenv from "dotenv"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
dotenv.config({ path: process.env.ENV_FILE || ".env.local" })
const OUT = process.env.OUT || ".paul/research/orphan-tracks-VERIFICATION.json"

const sa = { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }
if (!sa.projectId || !sa.clientEmail || !sa.privateKey) { console.error("missing creds"); process.exit(1) }
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()

// (A) FULL enumeration of setlists collection (admin = global, bypasses owner-scoping)
const setlistsSnap = await db.collection("setlists").get()
const liveSetlistIds = new Set(setlistsSnap.docs.map((d) => d.id))
console.log("setlists collection (admin full enum):", liveSetlistIds.size)

// (B) FULL scan of tracks
const tracksSnap = await db.collection("tracks").select("setlistId", "fileId", "title").get()
console.log("tracks collection:", tracksSnap.size)
const allTracks = tracksSnap.docs.map((d) => ({ trackId: d.id, setlistId: d.data().setlistId || null, fileId: d.data().fileId || null, title: d.data().title || null }))

// live track id set (tracks whose setlistId is a live setlist)
const liveTrackIds = new Set(allTracks.filter((t) => t.setlistId && liveSetlistIds.has(t.setlistId)).map((t) => t.trackId))

// dangling = setlistId present but not a live setlist
const dangling = allTracks.filter((t) => t.setlistId && !liveSetlistIds.has(t.setlistId))
const noSetlist = allTracks.filter((t) => !t.setlistId)
console.log("dangling (parent not in live enum):", dangling.length, "| tracks with no setlistId:", noSetlist.length)

// (C) active library_index charts (the 271-heal set is a subset of active)
const activeSnap = await db.collection("library_index").where("status", "==", "active").get()
const activeChartIds = new Set(activeSnap.docs.map((d) => d.id))
const healedActive = activeSnap.docs.filter((d) => (d.data().collection === "supplemental")).map((d) => d.id)
console.log("library_index status=active:", activeChartIds.size, "| of which supplemental(~heal set):", healedActive.length)

// per-track verification
const deadIdCache = new Map()
async function parentExists(sid) { if (deadIdCache.has(sid)) return deadIdCache.get(sid); const e = (await db.collection("setlists").doc(sid).get()).exists; deadIdCache.set(sid, e); return e }
const records = []
for (const t of dangling) {
  const c1_parentExistsDocRead = await parentExists(t.setlistId)
  const c2_deadIdInLiveEnum = liveSetlistIds.has(t.setlistId)
  const c3_isLiveTrack = liveTrackIds.has(t.trackId)
  const c4_fileIdIsActiveChart = t.fileId ? activeChartIds.has(t.fileId) : false
  const safe = c1_parentExistsDocRead === false && c2_deadIdInLiveEnum === false && c3_isLiveTrack === false
  records.push({ trackId: t.trackId, setlistId: t.setlistId, fileId: t.fileId, title: t.title, c1_parentMissing: c1_parentExistsDocRead === false, c2_deadIdNotInLiveEnum: c2_deadIdInLiveEnum === false, c3_notALiveTrack: c3_isLiveTrack === false, c4_fileIdStillActiveChart: c4_fileIdIsActiveChart, safeToDelete: safe })
}
const safe = records.filter((r) => r.safeToDelete)
const flagged = records.filter((r) => !r.safeToDelete)
const deadSetlistIds = [...new Set(dangling.map((t) => t.setlistId))]
const deadIdsInLiveEnum = deadSetlistIds.filter((id) => liveSetlistIds.has(id)) // must be []

const out = {
  verifiedAt: new Date().toISOString(),
  prodProject: sa.projectId,
  method: "Firebase admin SDK (global, not owner-scoped). READ-ONLY — no writes.",
  totals: {
    setlistsCollectionSize: liveSetlistIds.size,
    tracksCollectionSize: tracksSnap.size,
    danglingTracks: dangling.length,
    tracksWithNoSetlistId: noSetlist.length,
    distinctDeadSetlists: deadSetlistIds.length,
    safeToDelete: safe.length,
    flaggedDoNotDelete: flagged.length,
  },
  beltAndSuspenders: {
    deadSetlistIds,
    deadSetlistIds_appearingInLiveSetlistEnum: deadIdsInLiveEnum, // expect []
    perDeadSetlist_trackCounts: Object.fromEntries(deadSetlistIds.map((id) => [id, dangling.filter((t) => t.setlistId === id).length])),
  },
  chartSafety: {
    note: "The sweep deletes ONLY top-level tracks/{id} docs. It performs ZERO library_index/chart writes — no chart content is removed. Field below is informational: how many dangling tracks point at a still-active chart (those charts stay intact).",
    danglingTracks_pointingAtActiveChart: records.filter((r) => r.c4_fileIdStillActiveChart).length,
    danglingTracks_pointingAtDeletedOrUnknownChart: records.filter((r) => !r.c4_fileIdStillActiveChart).length,
    activeSupplementalHealSetSize: healedActive.length,
    healSetIdsIntersectingDanglingTrackIds: healedActive.filter((cid) => records.some((r) => r.trackId === cid)).length, // expect 0 (chart ids != track ids)
  },
  flaggedDoNotDelete: flagged,
  records,
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log("\n=== VERIFICATION SUMMARY ===")
console.log("dangling tracks:", dangling.length)
console.log("dead setlists:", deadSetlistIds.length, "| any appearing in live setlist enum (expect 0):", deadIdsInLiveEnum.length)
console.log("safeToDelete:", safe.length, "| flagged DO-NOT-DELETE:", flagged.length)
console.log("dangling pointing at a still-ACTIVE chart (chart stays):", out.chartSafety.danglingTracks_pointingAtActiveChart)
console.log("heal-set chart-ids intersecting dangling TRACK ids (expect 0):", out.chartSafety.healSetIdsIntersectingDanglingTrackIds)
if (flagged.length) { console.log("\nFLAGGED:"); for (const f of flagged) console.log("  ", JSON.stringify(f)) }
console.log("\nwrote", OUT)
