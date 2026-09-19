#!/usr/bin/env node
/**
 * CHARTS-001 — READ ONLY. The two blockers the independent review left on the
 * Modeh row, re-checked against production immediately before any write:
 *
 *   1. "The source setlist is currently ineligible because isTest is absent
 *       rather than false."  The selection contract requires a LITERAL false.
 *   2. "Re-run the raw exact-identity conflict check immediately before any
 *       future write."  Exactly one track in the org may carry this
 *       (momentId, pieceId) with a complete binding.
 */
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

const UNIT = "awakening.modeh-ani@legacy-shabbat-morning"
const PIECE = "modeh-ani.halpert"
const SETLIST = "1e108f17-f24b-4bf0-a9f7-6a0392ccc43d"

const sl = await db.collection("setlists").doc(SETLIST).get()
const d = sl.data() ?? {}
console.log("setlist", SETLIST, sl.exists ? "" : "(MISSING)")
console.log(
    "  " +
        JSON.stringify({
            name: d.name,
            orgId: d.orgId,
            eventDate: d.eventDate,
            templateType: d.templateType,
            book: d.book,
            isTemplate: d.isTemplate,
            isTest: d.isTest,
            isTestType: typeof d.isTest,
            version: d.setlistVersion ?? d.version,
        }),
)
console.log(`  BLOCKER 1 — isTest is literally false: ${d.isTest === false ? "CLEAR" : "STILL OPEN"}`)

const tracks = await db.collection("tracks").where("setlistId", "==", SETLIST).get()
const bound = []
tracks.forEach((t) => {
    const r = t.data()
    const rm = r.readerMusic
    if (rm && rm.momentId === UNIT) bound.push({ id: t.id, ...r })
})
console.log(`\ntracks on that setlist: ${tracks.size}; carrying readerMusic for this unit: ${bound.length}`)
for (const b of bound) {
    console.log(
        "  " +
            JSON.stringify({
                id: b.id,
                title: b.title,
                orgId: b.orgId,
                songId: b.songId,
                fileId: b.fileId,
                key: b.key,
                mimeType: b.mimeType,
                readerMusic: b.readerMusic,
            }),
    )
}

// Raw global conflict check: any track anywhere claiming this piece.
const all = await db.collection("tracks").where("readerMusic.pieceId", "==", PIECE).get()
console.log(`\nglobal tracks with readerMusic.pieceId == ${PIECE}: ${all.size}`)
const sigs = new Set()
all.forEach((t) => {
    const r = t.data()
    sigs.add(
        JSON.stringify([r.orgId, r.songId, r.fileId, r.key ?? null, r.arrangement ?? null, r.stringVersion ?? null]),
    )
    console.log(`  ${t.id} | setlist ${r.setlistId} | org ${r.orgId} | file ${r.fileId} | key ${r.key ?? "-"}`)
})
console.log(`  distinct binding signatures: ${sigs.size}`)
console.log(`  BLOCKER 2 — one unambiguous binding: ${sigs.size === 1 ? "CLEAR" : "STILL OPEN"}`)
