// v11.3-03 BUG-1 — sweep orphan `[role-*]` rows from CRC library_index.
//
// An orphan = a library_index row whose `uploadedBy` is a test-shape uid
// (isTestUid: test-*, c<N>i<N>[a]-*, cf<N>-*) AND whose owner user-record
// (users/{uid}) is ABSENT. These survive cleanup_all_test_data's owner-bonded
// cascade because the owner account was deleted out-of-band. Mirrors the
// library_index coverage just added to sweepOrphanTestDataCore (run-1 §BUG-1).
//
// AUTH: this box has no Admin SA creds. We reuse the firebase CLI login by
// minting a temporary `authorized_user` ADC from the configstore refresh_token
// (public firebase-tools OAuth client), then delete the temp file (finally).
//
// USAGE:
//   node scripts/v11-3-03-library-orphan-sweep.mjs            (dry-run — print only)
//   node scripts/v11-3-03-library-orphan-sweep.mjs --apply    (delete orphans + best-effort Storage)
//
// SAFETY: never deletes a row whose owner user-doc EXISTS or whose uploadedBy
// is not test-shape. Dry-run is the default; --apply is required to write.

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const PROJECT = process.env.FIREBASE_PROJECT || "crcmusiccharts"
const APPLY = process.argv.includes("--apply")

// Public firebase-tools OAuth client (embedded in the open-source CLI) — same
// trick scripts/add-auth-domains.mjs uses.
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi"

// test-isolation predicate — replicates src/lib/test-isolation.ts TEST_UID_PREFIXES.
const TEST_UID_PREFIXES = /^(test-|c\d+i\d+[a-z]?-|cf\d+-)/
const isTestUid = (uid) => typeof uid === "string" && TEST_UID_PREFIXES.test(uid)

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
    const dir = mkdtempSync(join(tmpdir(), "v11-3-03-adc-"))
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

    const snap = await db.collection("library_index").get()

    // --diagnose: characterize any `[role-…]`-titled rows (the BUG-1 report's
    // shape) regardless of the orphan filter, so we can see WHY the sweep
    // matched 0 (uploadedBy not test-shape? owner still present? already gone?).
    if (process.argv.includes("--diagnose")) {
        const roleRows = []
        for (const doc of snap.docs) {
            const data = doc.data() || {}
            const title = typeof data.title === "string" ? data.title : ""
            const name = typeof data.name === "string" ? data.name : ""
            if (/\[role-/i.test(title) || /\[role-/i.test(name) || /^\[role-/i.test(doc.id)) {
                const u = typeof data.uploadedBy === "string" ? data.uploadedBy : null
                const ownerExists = u ? (await db.collection("users").doc(u).get()).exists : null
                roleRows.push({
                    id: doc.id,
                    title: data.title ?? data.name ?? null,
                    uploadedBy: u,
                    uploadedByIsTestShape: isTestUid(u),
                    ownerExists,
                    org: data.org ?? data.orgId ?? null,
                })
            }
        }
        console.log(`\n[diagnose] rows with a [role-…] title/name/id: ${roleRows.length}`)
        for (const r of roleRows) console.log("  " + JSON.stringify(r))

        // Exact id-prefix check for the two rows named in run-1 §BUG-1
        // (titles could have been edited; ids are stable).
        const ID_PREFIXES = ["upload-0d872e08", "upload-cef9ddf9"]
        const byPrefix = snap.docs.filter((d) => ID_PREFIXES.some((p) => d.id.startsWith(p)))
        console.log(`\n[diagnose] rows matching BUG-1 id-prefixes ${JSON.stringify(ID_PREFIXES)}: ${byPrefix.length}`)
        for (const d of byPrefix) {
            const x = d.data() || {}
            console.log("  " + JSON.stringify({ id: d.id, title: x.title ?? x.name ?? null, uploadedBy: x.uploadedBy ?? null, status: x.status ?? null, org: x.org ?? x.orgId ?? null }))
        }
        return
    }

    const orphans = []
    for (const doc of snap.docs) {
        const data = doc.data() || {}
        const uploadedBy = typeof data.uploadedBy === "string" ? data.uploadedBy : null
        if (!isTestUid(uploadedBy)) continue
        const userSnap = await db.collection("users").doc(uploadedBy).get()
        if (userSnap.exists) continue // live owner → NOT an orphan
        orphans.push({ id: doc.id, uploadedBy, title: data.title ?? null })
    }

    console.log(`\nscanned library_index: ${snap.size} rows`)
    console.log(`test-shape, owner-absent orphans: ${orphans.length}`)
    for (const o of orphans) {
        console.log(`  - ${o.id}  uploadedBy=${o.uploadedBy}  title=${JSON.stringify(o.title)}`)
    }

    if (!APPLY) {
        console.log(`\nDRY-RUN: no writes. Re-run with --apply to delete the ${orphans.length} orphan row(s).`)
        return
    }
    if (orphans.length === 0) {
        console.log("\n--apply: nothing to delete (0 orphans).")
        return
    }

    // Delete docs.
    let deleted = 0
    for (const o of orphans) {
        await db.collection("library_index").doc(o.id).delete()
        deleted++
        console.log(`  deleted library_index/${o.id}`)
    }

    // Best-effort Storage purge (doc id == fileId; charts/{id}/ prefix). Never fatal.
    let storageDeleted = 0
    let storageFailed = 0
    try {
        const bucket = getStorage().bucket()
        for (const o of orphans) {
            try {
                const [files] = await bucket.getFiles({ prefix: `charts/${o.id}/` })
                for (const f of files) {
                    try {
                        await f.delete()
                        storageDeleted++
                    } catch {
                        storageFailed++
                    }
                }
            } catch {
                storageFailed++
            }
        }
    } catch {
        console.log("  (Storage bucket unavailable — skipped best-effort byte purge)")
    }

    // Re-probe.
    const after = await db.collection("library_index").get()
    let remaining = 0
    for (const doc of after.docs) {
        const u = doc.data()?.uploadedBy
        if (!isTestUid(u)) continue
        const us = await db.collection("users").doc(u).get()
        if (!us.exists) remaining++
    }
    console.log(
        `\ndeleted ${deleted} orphan row(s); storageDeleted=${storageDeleted} storageFailed=${storageFailed}. ` +
            `Remaining test-shape owner-absent library_index orphans: ${remaining} (expect 0).`,
    )
}

main()
    .catch((e) => {
        console.error("\nFATAL:", e instanceof Error ? e.message : String(e))
        process.exitCode = 1
    })
    .finally(() => {
        if (tmpAdcPath) {
            try {
                unlinkSync(tmpAdcPath)
            } catch {}
        }
    })
