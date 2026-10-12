#!/usr/bin/env node
/**
 * Multi-tenant phase 0 — production proof that the self-assigned-role hole is
 * closed. Creates a throwaway pending account (uid prefix `test-`), signs it in
 * through the public Identity Toolkit REST API, and as that account:
 *   1. creates its own users/{uid} as pending           → must SUCCEED
 *   2. writes role:'admin' into its own users/{uid}       → must be REFUSED (403)
 *   3. writes a profile field (displayName)               → must SUCCEED
 *   4. (server-side, Admin SDK) forces role:'admin' onto the doc, then calls the
 *      DEPLOYED /api/auth/sync-claims                     → claim must stay unraised
 *   5. calls the DEPLOYED /api/auth/refresh-session      → signed role must not be admin
 * Then deletes the account and its document, and confirms both are gone.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS (temp ADC), FIREBASE_WEB_API_KEY (the
 * public web key served in the site bundle), APP_ORIGIN (default www).
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { randomBytes } from "node:crypto"

const PROJECT_ID = "crcmusiccharts"
const KEY = process.env.FIREBASE_WEB_API_KEY
const ORIGIN = process.env.APP_ORIGIN || "https://www.centralreform.live"
if (!KEY) throw new Error("FIREBASE_WEB_API_KEY required")
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
const db = getFirestore()
const auth = getAuth()

const results = []
const check = (name, ok, detail = "") => {
    results.push({ name, ok })
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

const uid = `test-p0probe-${Date.now()}`
const email = `${uid}@example.com`
const password = randomBytes(18).toString("base64url")
const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`

async function signIn() {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    const j = await r.json()
    if (!j.idToken) throw new Error(`sign-in failed: ${JSON.stringify(j.error ?? j)}`)
    return j.idToken
}
const fsValue = (v) => (typeof v === "string" ? { stringValue: v } : { arrayValue: { values: v.map((x) => ({ stringValue: x })) } })
async function patch(idToken, fields, mask) {
    const qs = mask ? "?" + mask.map((m) => `updateMask.fieldPaths=${m}`).join("&") : ""
    const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)])) }
    const r = await fetch(docUrl + qs, {
        method: "PATCH",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
    })
    return r.status
}

console.log(`# p0 production escalation probe — uid=${uid} origin=${ORIGIN}`)
await auth.createUser({ uid, email, password, displayName: "P0 probe" })
try {
    let idToken = await signIn()

    // 1. sign-up shape as today's ensureUserProfile
    const s1 = await patch(idToken, { uid, email, displayName: "P0 probe", role: "pending", orgIds: ["crc", "brotherslazaroff"] })
    check("self-create as pending succeeds", s1 === 200, `status ${s1}`)

    // 2. the attack
    const s2 = await patch(idToken, { role: "admin" }, ["role"])
    check("self-write role:'admin' is refused by deployed rules", s2 === 403, `status ${s2}`)
    const after2 = (await db.collection("users").doc(uid).get()).data()
    check("document role still pending", after2?.role === "pending", `role=${after2?.role}`)

    // 3. a profile write still works
    const s3 = await patch(idToken, { displayName: "P0 probe renamed" }, ["displayName"])
    check("self-write displayName succeeds", s3 === 200, `status ${s3}`)

    // 4. sync-claims must not raise even if the doc somehow says admin
    await db.collection("users").doc(uid).update({ role: "admin" })
    const r4 = await fetch(`${ORIGIN}/api/auth/sync-claims`, {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: "{}",
    })
    const j4 = await r4.json().catch(() => ({}))
    const claims4 = (await auth.getUser(uid)).customClaims ?? {}
    check("deployed sync-claims does not raise the claim", r4.status === 200 && claims4.role !== "admin",
        `status ${r4.status} body=${JSON.stringify(j4)} claim=${claims4.role ?? "none"}`)

    // 5. refresh-session must not sign admin
    idToken = await signIn()
    const r5 = await fetch(`${ORIGIN}/api/auth/refresh-session`, {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: "{}",
    })
    const j5 = await r5.json().catch(() => ({}))
    check("deployed refresh-session does not sign 'admin'", r5.status === 200 && j5.role !== "admin",
        `status ${r5.status} role=${j5.role}`)
} finally {
    await db.collection("users").doc(uid).delete().catch(() => {})
    await auth.deleteUser(uid).catch(() => {})
    const gone = !(await db.collection("users").doc(uid).get()).exists &&
        (await auth.getUser(uid).then(() => false, () => true))
    check("throwaway account and document deleted", gone)
}
const failed = results.filter((r) => !r.ok).length
console.log(`# ${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
