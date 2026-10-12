#!/usr/bin/env node
/**
 * Read-only: per collection, how many documents carry each orgId and how many
 * carry none. Sizes the phase 2 stamp. Credentials: GOOGLE_APPLICATION_CREDENTIALS.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
const projectId = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })
const db = getFirestore()
const names = process.argv.slice(2)
const cols = names.length ? names : (await db.listCollections()).map((c) => c.id)
for (const name of cols.sort()) {
    const snap = await db.collection(name).select("orgId").get()
    const by = {}
    for (const d of snap.docs) {
        const o = d.get("orgId")
        const k = typeof o === "string" && o.trim() ? o : "<none>"
        by[k] = (by[k] ?? 0) + 1
    }
    console.log(name.padEnd(28), String(snap.size).padStart(6), JSON.stringify(by))
}
