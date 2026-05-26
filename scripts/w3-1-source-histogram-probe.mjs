#!/usr/bin/env node
/**
 * One-shot probe for `w3-1-library-index-normalizedname-subsumption-verify`.
 * Read-only enumeration of `library_index` reporting:
 *   - total document count
 *   - status histogram
 *   - source histogram
 *   - normalizedName presence histogram
 *
 * Mirrors the .env.local loader from `restamp-normalizedname-drift.mjs`
 * verbatim so single-quoted-key handling matches the canonical scripts.
 *
 * NO writes; uses firebase-admin SDK with creds from `.env.local`.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// ---------- .env.local loader (verbatim from restamp-normalizedname-drift.mjs) ----------
const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, "..", ".env.local")
{
    let envText
    try {
        envText = readFileSync(ENV_PATH, "utf8")
    } catch (err) {
        process.stderr.write(`!! Cannot read ${ENV_PATH}: ${err.message}\n`)
        process.exit(1)
    }
    for (const line of envText.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (!m) continue
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        val = val.replace(/\\n/g, "\n")
        if (!(m[1] in process.env)) process.env[m[1]] = val
    }
}

const PROJECT_ID =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"

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
const snap = await db.collection("library_index").get()

const statusH = {}
const sourceH = {}
const normPresenceH = { present: 0, absent: 0 }
const namePresenceH = { present: 0, absent: 0 }

for (const d of snap.docs) {
    const x = d.data()
    statusH[x.status ?? "<missing>"] = (statusH[x.status ?? "<missing>"] ?? 0) + 1
    sourceH[x.source ?? "<missing>"] = (sourceH[x.source ?? "<missing>"] ?? 0) + 1
    normPresenceH[x.normalizedName === undefined ? "absent" : "present"]++
    namePresenceH[x.name === undefined ? "absent" : "present"]++
}

const out = {
    probedAt: new Date().toISOString(),
    totalDocs: snap.size,
    statusHistogram: statusH,
    sourceHistogram: sourceH,
    normalizedNamePresence: normPresenceH,
    namePresence: namePresenceH,
}

console.log(JSON.stringify(out, null, 2))
process.exit(0)
