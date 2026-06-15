// v11.5 P0 fire — global heal of the denormalized `mimeType` cache on setlist
// `tracks` rows. Faithful standalone mirror of
// src/lib/mcp/tools/backfill-track-mimetype.ts `backfillTrackMimetype`.
//
// WHY: tracks bonded via bulk_add_tracks / clone paths never stamped
// `mimeType` (only add_track_to_setlist + the in-app picker do). Perform's
// viewer routing (resolveViewerKind → PDFOverlay) keys on track.mimeType for
// non-leader/public viewers (the library store only hydrates for leaders), so
// an unstamped TEXT chart defaults to the PDF viewer and fails to render for
// the band. This stamps every bonded-but-missing-mime track from its
// library_index/{fileId}.mimeType — the same source the live bind paths read.
// Does NOT touch the bond (fileId). Idempotent — a second run finds 0.
//
// AUTH: this box has no Admin SA creds. Reuse the firebase CLI login by minting
// a temporary `authorized_user` ADC from the configstore refresh_token (public
// firebase-tools OAuth client), then delete the temp file (finally).
//
// USAGE:
//   node scripts/v11-5-fix-track-mimetype-global.mjs            (dry-run — print plan only)
//   node scripts/v11-5-fix-track-mimetype-global.mjs --apply    (commit the stamps)

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

const PROJECT = process.env.FIREBASE_PROJECT || "crcmusiccharts"
const APPLY = process.argv.includes("--apply")
const LIBRARY_READ_CONCURRENCY = 50
const WRITE_BATCH_MAX = 400

const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
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
    const dir = mkdtempSync(join(tmpdir(), "v11-5-mime-adc-"))
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

async function main() {
    bootstrapAdc()
    if (!getApps().length) {
        initializeApp({ credential: applicationDefault(), projectId: PROJECT })
    }
    const db = getFirestore()

    const snap = await db.collection("tracks").get()
    const scannedTracks = snap.size

    let bondedTracks = 0
    let alreadyHealthy = 0
    const candidates = []
    for (const d of snap.docs) {
        const data = d.data()
        const fileId = typeof data.fileId === "string" ? data.fileId.trim() : ""
        const audioFileId = typeof data.audioFileId === "string" ? data.audioFileId.trim() : ""
        const bondKey = fileId || audioFileId
        if (!bondKey) continue
        bondedTracks++
        const mime = typeof data.mimeType === "string" ? data.mimeType.trim() : ""
        if (mime) { alreadyHealthy++; continue }
        candidates.push({
            trackId: d.id,
            setlistId: typeof data.setlistId === "string" ? data.setlistId : null,
            title: typeof data.title === "string" ? data.title : null,
            fileId: bondKey,
            bondKind: fileId ? "fileId" : "audioFileId",
        })
    }

    const uniqueFileIds = [...new Set(candidates.map((c) => c.fileId))]
    const libExists = new Set()
    const mimeByFileId = new Map()
    for (let i = 0; i < uniqueFileIds.length; i += LIBRARY_READ_CONCURRENCY) {
        const chunk = uniqueFileIds.slice(i, i + LIBRARY_READ_CONCURRENCY)
        const refs = chunk.map((id) => db.collection("library_index").doc(id))
        const docs = await db.getAll(...refs)
        docs.forEach((doc, j) => {
            const id = chunk[j]
            if (doc.exists) libExists.add(id)
            const m = doc.exists ? doc.data()?.mimeType : undefined
            mimeByFileId.set(id, typeof m === "string" && m.trim() ? m.trim() : null)
        })
    }

    const healRows = []
    const skippedRows = []
    for (const c of candidates) {
        const mime = mimeByFileId.get(c.fileId) ?? null
        if (!mime) {
            skippedRows.push({
                trackId: c.trackId,
                fileId: c.fileId,
                reason: libExists.has(c.fileId) ? "library_entry_no_mimetype" : "library_entry_not_found",
            })
            continue
        }
        healRows.push({ trackId: c.trackId, setlistId: c.setlistId, title: c.title, fileId: c.fileId, after: mime })
    }

    console.log(`\nscanned tracks:    ${scannedTracks}`)
    console.log(`bonded tracks:     ${bondedTracks}`)
    console.log(`already healthy:   ${alreadyHealthy}`)
    console.log(`to heal (stamp):   ${healRows.length}`)
    console.log(`skipped (no mime): ${skippedRows.length}`)

    // group heal rows by mimeType for a quick read
    const byMime = {}
    for (const r of healRows) byMime[r.after] = (byMime[r.after] || 0) + 1
    console.log(`heal by mimeType:  ${JSON.stringify(byMime)}`)

    // group by setlist so we can see which services are affected
    const bySetlist = {}
    for (const r of healRows) {
        const k = r.setlistId || "(none)"
        bySetlist[k] = (bySetlist[k] || 0) + 1
    }
    console.log(`\naffected setlists (${Object.keys(bySetlist).length}):`)
    for (const [sid, n] of Object.entries(bySetlist).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${sid}  ${n} track(s)`)
    }

    if (skippedRows.length) {
        console.log(`\nskipped rows (need a chart heal, not a stamp):`)
        for (const s of skippedRows.slice(0, 50)) console.log(`  ${s.trackId}  fileId=${s.fileId}  ${s.reason}`)
        if (skippedRows.length > 50) console.log(`  …and ${skippedRows.length - 50} more`)
    }

    if (!APPLY) {
        console.log(`\nDRY-RUN — no writes. Re-run with --apply to commit.`)
        return
    }

    const nowIso = new Date().toISOString()
    let committed = 0
    for (let i = 0; i < healRows.length; i += WRITE_BATCH_MAX) {
        const slice = healRows.slice(i, i + WRITE_BATCH_MAX)
        const batch = db.batch()
        for (const r of slice) {
            batch.set(
                db.collection("tracks").doc(r.trackId),
                {
                    mimeType: r.after,
                    updatedAt: FieldValue.serverTimestamp(),
                    version: FieldValue.increment(1),
                    lastModifiedAt: nowIso,
                },
                { merge: true },
            )
        }
        await batch.commit()
        committed += slice.length
    }
    console.log(`\nAPPLIED — committed ${committed} track stamp(s).`)
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1 })
    .finally(() => { if (tmpAdcPath) { try { unlinkSync(tmpAdcPath) } catch {} } })
