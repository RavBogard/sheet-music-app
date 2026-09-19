#!/usr/bin/env node
/**
 * CHARTS-001 / R4-e — write the Modeh Ani public-reader approval.
 *
 * Daniel approved option 2 on 2026-09-15 (R4-e, reaffirmed round 5 item 4).
 * This writes ONE document: `publicReaderStatus: "approved"` plus the exact
 * `publicReaderManifest` computed from the reviewed Storage generation.
 *
 * PRECONDITION, not a hope. The write runs in a transaction and refuses
 * unless, at write time:
 *   - the crosswalk row is still exactly the reviewed row (org, moment,
 *     piece, status reviewed) and carries no approval yet;
 *   - the Storage object is still at the generation, size and sha256 this
 *     manifest names.
 * A byte that changed under the manifest means the reviewed object is not the
 * object that would be served, and the approval must not be written.
 *
 * Dry run by default. Pass --commit to write.
 */
import { Storage } from "@google-cloud/storage"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const ENV = process.env.CHARTS_ENV_FILE // a scratchpad path from `vercel env pull`; never .env.local, and delete it after
for (const line of readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v.replace(/\\n/g, "\n")
}

const COMMIT = process.argv.includes("--commit")
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
const BUCKET = (process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`).replace(
    /^gs:\/\//,
    "",
)

const UNIT = "awakening.modeh-ani@legacy-shabbat-morning"
const PIECE = "modeh-ani.halpert"
const FILE_ID = "upload-ac582fb1-f27d-4530-9a01-1c3b74cf7500"
const STORAGE_PATH = `library/${FILE_ID}.pdf`
// Measured 2026-09-15 by work/r5/charts-probe.mjs against production Storage.
const EXPECT = {
    generation: "1779586334638196",
    sha256: "da9ec13856f388c956594bd5ceaad8b6dad310854c66673ebb55728a60af64a2",
    sizeBytes: 3008,
}

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

// ── The bytes, as they are right now ────────────────────────────────────────
const file = storage.bucket(BUCKET).file(STORAGE_PATH)
const [md] = await file.getMetadata()
const buf = await new Promise((res, rej) => {
    const parts = []
    file.createReadStream()
        .on("data", (c) => parts.push(c))
        .on("end", () => res(Buffer.concat(parts)))
        .on("error", rej)
})
const sha256 = createHash("sha256").update(buf).digest("hex")
const live = {
    generation: String(md.generation),
    sha256,
    sizeBytes: buf.byteLength,
    contentType: (md.contentType ?? "").split(";")[0].trim().toLowerCase(),
}
console.log("storage now:", JSON.stringify(live))

const drift = Object.entries(EXPECT).filter(([k, v]) => live[k] !== v)
if (drift.length) {
    console.error(
        "\nREFUSING: the object moved under the reviewed manifest — " +
            drift.map(([k, v]) => `${k} expected ${v}, got ${live[k]}`).join("; "),
    )
    process.exit(1)
}
if (live.contentType !== "application/pdf") {
    console.error(`\nREFUSING: contentType is '${live.contentType}', not application/pdf.`)
    process.exit(1)
}
if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d)) {
    console.error("\nREFUSING: the bytes do not begin %PDF-.")
    process.exit(1)
}

const manifest = {
    version: 1,
    songId: FILE_ID,
    fileId: FILE_ID,
    storagePath: STORAGE_PATH,
    generation: live.generation,
    sha256: live.sha256,
    sizeBytes: live.sizeBytes,
    contentType: "application/pdf",
}
console.log("\nmanifest to write:\n" + JSON.stringify(manifest, null, 2))

const ref = db.collection("reader_music_crosswalk").doc(UNIT)
if (!COMMIT) {
    const snap = await ref.get()
    console.log("\nrow as it stands:", JSON.stringify(snap.data()))
    console.log("\nDRY RUN — nothing written. Pass --commit to write.")
    process.exit(0)
}

await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error("the crosswalk row is gone")
    const row = snap.data() ?? {}
    if (
        row.orgId !== "crc" ||
        row.momentId !== UNIT ||
        row.pieceId !== PIECE ||
        row.status !== "reviewed"
    ) {
        throw new Error(`the row is not the reviewed row any more: ${JSON.stringify(row)}`)
    }
    if (row.publicReaderStatus || row.publicReaderManifest) {
        throw new Error("the row already carries an approval; refusing to overwrite it")
    }
    tx.update(ref, {
        publicReaderStatus: "approved",
        publicReaderManifest: manifest,
        publicReaderApprovedAt: new Date().toISOString(),
        publicReaderApprovedBy: "daniel:R4-e",
    })
})
console.log("\nWRITTEN.")
console.log(JSON.stringify((await ref.get()).data(), null, 2))
