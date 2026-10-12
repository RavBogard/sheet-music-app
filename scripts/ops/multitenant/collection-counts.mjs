#!/usr/bin/env node
/**
 * Count documents in every top-level collection (and the users/* subcollections
 * as one total) — used to prove an export restores whole. Works against
 * production (GOOGLE_APPLICATION_CREDENTIALS) or an emulator
 * (FIRESTORE_EMULATOR_HOST). Read-only. Output: JSON {collection: count}.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
const projectId = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
if (!getApps().length)
    initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId })
const db = getFirestore()
const out = {}
for (const c of await db.listCollections()) out[c.id] = (await c.count().get()).data().count
const groups = ["tracks", "songPreferences", "notifications", "history"]
for (const g of groups) out[`group:${g}`] = (await db.collectionGroup(g).count().get()).data().count
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 1))
