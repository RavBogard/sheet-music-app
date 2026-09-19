#!/usr/bin/env node
/**
 * CHARTS-001 — READ ONLY. What are these 3,008 bytes, exactly?
 *
 * Before making an object publicly fetchable, look at it. A small PDF is not
 * automatically a stub — a one-page lead sheet set in vector type is small —
 * but "small" is also what a placeholder looks like, and the two must not be
 * confused on the way to a public URL.
 */
import { Storage } from "@google-cloud/storage"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"

const ENV = process.env.CHARTS_ENV_FILE // a scratchpad path from `vercel env pull`; never .env.local, and delete it after
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
const FILE_ID = process.argv[2]

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

for (const coll of ["library_index", "songs"]) {
    const snap = await db.collection(coll).where("fileId", "==", FILE_ID).get()
    console.log(`\n${coll}: ${snap.size} row(s) with fileId ${FILE_ID}`)
    snap.forEach((d) => {
        const r = d.data()
        console.log(
            "  " +
                JSON.stringify(
                    {
                        id: d.id,
                        title: r.title ?? r.name,
                        orgId: r.orgId,
                        status: r.status,
                        mimeType: r.mimeType,
                        sizeBytes: r.sizeBytes ?? r.size,
                        pageCount: r.pageCount,
                        key: r.key,
                    },
                    null,
                    0,
                ),
        )
    })
    const byDoc = await db.collection(coll).doc(FILE_ID).get()
    if (byDoc.exists) console.log(`  (doc id ${FILE_ID}):`, JSON.stringify(byDoc.data()).slice(0, 400))
}

const buf = await new Promise((res, rej) => {
    const parts = []
    storage
        .bucket(BUCKET)
        .file(`library/${FILE_ID}.pdf`)
        .createReadStream()
        .on("data", (c) => parts.push(c))
        .on("end", () => res(Buffer.concat(parts)))
        .on("error", rej)
})
const text = buf.toString("latin1")
console.log(`\nPDF ${buf.byteLength} bytes`)
console.log("  header      ", JSON.stringify(text.slice(0, 9)))
console.log("  /Type /Page ", (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length)
console.log("  /Count      ", (text.match(/\/Count\s+(\d+)/) ?? [])[1] ?? "(none)")
console.log("  objects     ", (text.match(/\d+ 0 obj/g) ?? []).length)
console.log("  streams     ", (text.match(/stream/g) ?? []).length)
console.log("  fonts       ", [...new Set(text.match(/\/BaseFont\s*\/[A-Za-z0-9+#-]+/g) ?? [])].join(", ") || "(none)")
console.log("  images      ", (text.match(/\/Subtype\s*\/Image/g) ?? []).length)
console.log("  producer    ", (text.match(/\/Producer\s*\(([^)]*)\)/) ?? [])[1] ?? "(none)")
console.log("  creator     ", (text.match(/\/Creator\s*\(([^)]*)\)/) ?? [])[1] ?? "(none)")
console.log("  title       ", (text.match(/\/Title\s*\(([^)]*)\)/) ?? [])[1] ?? "(none)")
console.log("  ends with   ", JSON.stringify(text.slice(-20)))
