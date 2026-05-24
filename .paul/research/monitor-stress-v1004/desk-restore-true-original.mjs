#!/usr/bin/env node
/**
 * Follow-up desk restore: write bus 5 → 0.7614858150482178 (the TRUE pre-probe
 * value M3 captured at T+~3s, before the probe's M4-tier MCP write of 0.5).
 *
 * The existing probe's snapshot/restore is F-tier-scoped: F2 snapshots state AFTER
 * M4 has already nudged the bus to ~0.5, so the F-tier "restore" returns to the
 * MCP-post-write value (0.4995), NOT the M3-read pre-probe value (0.7614). This
 * is pre-existing probe behavior — a NIT, separate from the v10.0.4 stress lane.
 *
 * This script restores bus 5 to the true M3 pre-probe value via the same
 * iPad-path addDoc the probe uses (auth via FIREBASE_CLIENT_EMAIL +
 * FIREBASE_PRIVATE_KEY). One write, snapshot/verify, exit.
 */

import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const TRUE_ORIGINAL = 0.7614858150482178
const BUS_INDEX = 5
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"

initializeApp({
    credential: cert({
        projectId: PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
    projectId: PROJECT_ID,
})

const db = getFirestore()
const cfg = (await db.collection("config").doc("monitor").get()).data() || {}
const a = cfg?.busAssignments?.[String(BUS_INDEX)]
const list = Array.isArray(a) ? a : a ? [a] : []
const uid = list[0]?.userId || "p0-b2-probe"

const ref = await db
    .collection("monitor-live")
    .doc("commands")
    .collection("pending")
    .add({
        type: "set_bus_master",
        busIndex: BUS_INDEX,
        value: TRUE_ORIGINAL,
        uid,
        createdAt: Date.now(),
    })
console.log(`enqueued restore-true-original ${ref.id}: bus ${BUS_INDEX} → ${TRUE_ORIGINAL}`)

const t0 = Date.now()
for (;;) {
    const snap = await ref.get()
    if (!snap.exists) {
        console.log(`applied in ${Date.now() - t0}ms`)
        break
    }
    const err = snap.data()?.error
    if (typeof err === "string") {
        console.error(`rejected: ${err}`)
        process.exit(1)
    }
    if (Date.now() - t0 >= 10_000) {
        console.error(`pending after 10s — bridge not processing?`)
        process.exit(2)
    }
    await new Promise((r) => setTimeout(r, 200))
}

// Verify state reflects
await new Promise((r) => setTimeout(r, 1500))
const state = (await db.collection("monitor-live").doc("state").get()).data()
const buses = state?.buses
const row = Array.isArray(buses) ? buses.find((b) => b?.index === BUS_INDEX) : buses?.[String(BUS_INDEX)]
console.log(`post-restore bus ${BUS_INDEX} fader = ${row?.fader}`)
if (row && Math.abs(row.fader - TRUE_ORIGINAL) < 0.01) {
    console.log(`✓ bus ${BUS_INDEX} restored byte-near-identical to original 0.7614`)
    process.exit(0)
}
console.error(`✗ bus ${BUS_INDEX} did not restore — manual check needed`)
process.exit(3)
