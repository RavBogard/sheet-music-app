#!/usr/bin/env node
/**
 * CHARTS-001 / R4-e — READ ONLY.
 *
 * Find the one `reader_music_crosswalk` row for the Modeh Ani pilot, and
 * compute the manifest from the EXACT Storage generation that is live: path,
 * generation, size, and a sha256 over the bytes as they are now.
 *
 * Writes nothing. The write is a separate, deliberate script.
 */
import { Storage } from "@google-cloud/storage"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const ENV = process.env.CHARTS_ENV_FILE // pull production env to a scratchpad path first; never .env.local
for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v.replace(/\\n/g, "\n")
}

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = (process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`).replace(
    /^gs:\/\//,
    "",
)
const UNIT = "awakening.modeh-ani@legacy-shabbat-morning"
const PIECE = "modeh-ani.halpert"

if (getApps().length === 0) {
    initializeApp({
        credential: cert({
            projectId: PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY,
        }),
    })
}
const db = getFirestore()
const storage = new Storage({
    projectId: PROJECT_ID,
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY,
    },
})

const snap = await db.collection("reader_music_crosswalk").get()
console.log(`reader_music_crosswalk rows: ${snap.size}`)
const rows = []
snap.forEach((d) => rows.push({ id: d.id, ...d.data() }))
for (const r of rows) {
    console.log(
        `  ${r.id} | org ${r.orgId} | moment ${r.momentId} | piece ${r.pieceId} | status ${r.status} | public ${r.publicReaderStatus ?? "(none)"} | manifest ${r.publicReaderManifest ? "yes" : "no"}`,
    )
}

const mine = rows.filter((r) => r.momentId === UNIT && r.pieceId === PIECE)
if (mine.length !== 1) {
    console.error(`\nEXPECTED EXACTLY ONE ROW for ${UNIT} / ${PIECE}; found ${mine.length}.`)
    process.exit(1)
}
const row = mine[0]
console.log(`\nrow ${row.id}:`, JSON.stringify(row, null, 1))

const fileId = row.fileId ?? row.songId
console.log(`\nfileId from the row: ${fileId ?? "(absent — take it from the review artifact)"}`)

const candidates = process.argv.slice(2)
if (!candidates.length) {
    console.log("\nPass the fileId(s) to probe in Storage as arguments.")
    process.exit(0)
}

for (const id of candidates) {
    for (const name of [`library/${id}`, `library/${id}.pdf`]) {
        const file = storage.bucket(BUCKET).file(name)
        const [exists] = await file.exists()
        if (!exists) {
            console.log(`\n${name}: ABSENT`)
            continue
        }
        const [md] = await file.getMetadata()
        const buf = await new Promise((res, rej) => {
            const parts = []
            file.createReadStream()
                .on("data", (c) => parts.push(c))
                .on("end", () => res(Buffer.concat(parts)))
                .on("error", rej)
        })
        const sha = createHash("sha256").update(buf).digest("hex")
        console.log(
            `\n${name}:\n` +
                `  generation   ${md.generation}\n` +
                `  size         ${md.size} (read ${buf.byteLength})\n` +
                `  contentType  ${md.contentType}\n` +
                `  md5          ${md.md5Hash}\n` +
                `  updated      ${md.updated}\n` +
                `  sha256       ${sha}\n` +
                `  magic        ${JSON.stringify(buf.subarray(0, 5).toString("latin1"))}`,
        )
    }
}
