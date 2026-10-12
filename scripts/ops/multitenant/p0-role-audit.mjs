#!/usr/bin/env node
/**
 * Multi-tenant phase 0 — read-only audit of platform-wide admin and of the
 * self-assigned-role hole (firestore.rules users/{uid} + /api/auth/sync-claims).
 *
 * Lists every account whose claim or users/{uid}.role is above member, every
 * uid in config/admins, and flags:
 *   - DOC>CLAIM   users/{uid}.role ranks above the claim (an attempt in flight)
 *   - NO-AUDIT    elevated claim with no ROLE_CHANGE row in auditLogs granting it
 * Writes nothing. Credentials: GOOGLE_APPLICATION_CREDENTIALS (temp ADC).
 * Output: JSON to stdout.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const auth = getAuth()

const RANK = { pending: 0, member: 1, musician: 2, band_leader: 3, admin: 4 }
const rank = (r) => (typeof r === "string" && r in RANK ? RANK[r] : -1)

const users = []
let page
do {
    const res = await auth.listUsers(1000, page)
    users.push(...res.users)
    page = res.pageToken
} while (page)

const docs = new Map()
for (const d of (await db.collection("users").get()).docs) docs.set(d.id, d.data())

const grants = new Map() // uid -> [newRole...]
for (const d of (await db.collection("auditLogs").where("action", "==", "ROLE_CHANGE").get()).docs) {
    const a = d.data()
    if (!grants.has(a.targetUserId)) grants.set(a.targetUserId, [])
    grants.get(a.targetUserId).push({ newRole: a.newRole, by: a.actorEmail, at: a.timestamp?.toDate?.()?.toISOString?.() ?? null })
}
const adminsDoc = await db.collection("config").doc("admins").get()
const configAdmins = adminsDoc.exists ? adminsDoc.data().uids ?? [] : []

const rows = []
for (const u of users) {
    const c = u.customClaims ?? {}
    const doc = docs.get(u.uid) ?? {}
    const claimRole = c.role ?? null
    const docRole = doc.role ?? null
    const inConfig = configAdmins.includes(u.uid)
    if (rank(claimRole) < 2 && rank(docRole) < 2 && !inConfig) continue
    const flags = []
    if (rank(docRole) > rank(claimRole)) flags.push("DOC>CLAIM")
    const g = grants.get(u.uid) ?? []
    if (rank(claimRole) >= 3 && !g.some((x) => x.newRole === claimRole)) flags.push("NO-AUDIT")
    rows.push({
        uid: u.uid, email: u.email ?? null, name: u.displayName ?? null,
        claimRole, docRole, orgIdsClaim: c.orgIds ?? null, orgIdsDoc: doc.orgIds ?? null,
        soundEngineer: c.soundEngineer ?? null, inConfigAdmins: inConfig,
        created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime,
        grants: g, flags,
    })
}
const docOnly = [...docs.keys()].filter((id) => !users.some((u) => u.uid === id) && rank(docs.get(id).role) >= 3)
console.log(JSON.stringify({
    totalAuthUsers: users.length, totalUserDocs: docs.size, configAdmins,
    elevated: rows.sort((a, b) => rank(b.claimRole) - rank(a.claimRole)),
    docsWithoutAuthUserElevated: docOnly,
}, null, 2))
