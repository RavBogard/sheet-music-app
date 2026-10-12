#!/usr/bin/env node
/**
 * Multi-tenant phase 2 — what each CRC and Brothers Lazaroff role can read and
 * write under the DEPLOYED Firestore and Storage rules, through the browser
 * path (ID token + REST), not the Admin SDK. Run it before a rules change and
 * after, and diff the two outputs: every difference must be explained.
 *
 *   node scripts/dev/rules-persona-probe.mjs setup  [--claims legacy|members]  # throwaway accounts (test-mtprobe-*)
 *   node scripts/dev/rules-persona-probe.mjs run --out <file.json>
 *   node scripts/dev/rules-persona-probe.mjs diff <a.json> <b.json>
 *   node scripts/dev/rules-persona-probe.mjs teardown                          # deletes the accounts, their docs and memberships
 *
 * Accounts are email/password users with uid `test-mtprobe-<persona>` (test
 * uids are excluded from rosters and notifications). `setup --claims legacy`
 * gives them pre-phase-2 claims {role, orgIds} and users docs; the people
 * migration then turns them into memberships like everyone else.
 * Writes are a throwaway setlist per band leader, deleted at once (Admin SDK
 * cleanup in teardown catches strays). Reads use real production rows only
 * by count, never content.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS (Admin SDK, setup/teardown),
 * FIREBASE_WEB_API_KEY (public web key), PROBE_PASSWORD (any strong string).
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { readFileSync, writeFileSync } from "node:fs"

const PROJECT = "crcmusiccharts"
const BUCKET = "crcmusiccharts.firebasestorage.app"
const KEY = process.env.FIREBASE_WEB_API_KEY
const PASSWORD = process.env.PROBE_PASSWORD
const CRC = "crc", BL = "brotherslazaroff"

/** persona → legacy claims (pre-phase-2 shape). */
const PERSONAS = {
    crcAdmin: { role: "admin", orgIds: [CRC] },
    crcBandLeader: { role: "band_leader", orgIds: [CRC] },
    crcMusician: { role: "musician", orgIds: [CRC] },
    crcMember: { role: "member", orgIds: [CRC] },
    crcPending: null,
    blBandLeader: { role: "band_leader", orgIds: [BL] },
    blMusician: { role: "musician", orgIds: [BL] },
}
const uidOf = (p) => `test-mtprobe-${p.toLowerCase()}`
const emailOf = (p) => `${uidOf(p)}@probe.invalid`

function admin() {
    if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT })
    return { auth: getAuth(), db: getFirestore() }
}

async function setup() {
    const { auth, db } = admin()
    for (const [p, claims] of Object.entries(PERSONAS)) {
        const uid = uidOf(p)
        try { await auth.getUser(uid) } catch {
            await auth.createUser({ uid, email: emailOf(p), password: PASSWORD, displayName: `[TEST] probe ${p}` })
        }
        await auth.updateUser(uid, { password: PASSWORD, disabled: false })
        await auth.setCustomUserClaims(uid, claims ?? null)
        await db.doc(`users/${uid}`).set({
            uid, email: emailOf(p), displayName: `[TEST] probe ${p}`,
            role: claims?.role ?? "pending", orgIds: claims?.orgIds ?? [CRC],
            createdAt: FieldValue.serverTimestamp(),
        })
        console.log(`ready ${uid} ${JSON.stringify(claims)}`)
    }
}

async function teardown() {
    const { auth, db } = admin()
    for (const p of Object.keys(PERSONAS)) {
        const uid = uidOf(p)
        for (const t of [CRC, BL]) await db.doc(`memberships/${t}__${uid}`).delete().catch(() => {})
        await db.doc(`users/${uid}`).delete().catch(() => {})
        await auth.deleteUser(uid).catch(() => {})
        const stray = await db.collection("setlists").where("ownerId", "==", uid).get()
        for (const d of stray.docs) await d.ref.delete()
        console.log(`removed ${uid}${stray.size ? ` (+${stray.size} stray setlists)` : ""}`)
    }
}

async function idToken(p) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailOf(p), password: PASSWORD, returnSecureToken: true }),
    })
    const j = await r.json()
    if (!j.idToken) throw new Error(`sign-in ${p}: ${JSON.stringify(j.error?.message)}`)
    return j.idToken
}

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const val = (v) => (typeof v === "string" ? { stringValue: v } : { integerValue: String(v) })

async function query(tok, collection, where = [], limit = 300) {
    const filters = where.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: val(v) } }))
    const structuredQuery = { from: [{ collectionId: collection }], limit }
    if (filters.length === 1) structuredQuery.where = filters[0]
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } }
    const r = await fetch(`${FS}:runQuery`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ structuredQuery }) })
    const j = await r.json()
    if (!r.ok || j[0]?.error) return { ok: false, status: r.status, code: (j.error ?? j[0]?.error)?.status }
    return { ok: true, n: j.filter((x) => x.document).length }
}

async function get(tok, path) {
    const r = await fetch(`${FS}/${path}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} })
    return r.ok ? { ok: true, exists: true } : r.status === 404 ? { ok: true, exists: false } : { ok: false, status: r.status }
}

async function storageGet(tok, object) {
    const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(object)}`, { headers: tok ? { authorization: `Firebase ${tok}` } : {} })
    return { ok: r.ok, status: r.status }
}

async function createAndDeleteSetlist(tok, uid, orgId) {
    const name = `test-mtprobe-${Date.now()}`
    const r = await fetch(`${FS}/setlists?documentId=${name}`, {
        method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ fields: { name: { stringValue: "[TEST] probe" }, orgId: { stringValue: orgId }, ownerId: { stringValue: uid }, createdAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() } } }),
    })
    if (!r.ok) return { ok: false, status: r.status }
    const d = await fetch(`${FS}/setlists/${name}`, { method: "DELETE", headers: { authorization: `Bearer ${tok}` } })
    return { ok: true, deleted: d.ok }
}

/** One real id per tenant, read with the Admin SDK (setup context only). */
async function fixtures() {
    const { db } = admin()
    const out = {}
    for (const t of [CRC, BL]) {
        const s = await db.collection("setlists").where("orgId", "==", t).limit(1).get()
        const lib = await db.collection("library_index").where("orgId", "==", t).limit(1).get()
        out[t] = { setlistId: s.docs[0]?.id, fileId: lib.docs[0]?.id }
    }
    const bucket = (await import("firebase-admin/storage")).getStorage().bucket(BUCKET)
    for (const t of [CRC, BL]) {
        const [files] = await bucket.getFiles({ prefix: `library/${out[t].fileId}` })
        out[t].object = files[0]?.name
        if (!out[t].object) throw new Error(`no Storage object for ${t} chart ${out[t].fileId}`)
    }
    return out
}

async function run(outFile) {
    const fx = await fixtures()
    const result = { at: new Date().toISOString(), personas: {} }
    const cases = (tok, uid) => {
        const c = {}
        for (const t of [CRC, BL]) {
            const T = t === CRC ? "crc" : "bl"
            c[`list setlists where orgId==${T}`] = () => query(tok, "setlists", [["orgId", "EQUAL", t]])
            c[`get setlist ${T}`] = () => get(tok, `setlists/${fx[t].setlistId}`)
            c[`list tracks of ${T} setlist`] = () => query(tok, "tracks", [["setlistId", "EQUAL", fx[t].setlistId]])
            c[`list songs where orgId==${T}`] = () => query(tok, "songs", [["orgId", "EQUAL", t]])
            c[`list library_index where orgId==${T}`] = () => query(tok, "library_index", [["orgId", "EQUAL", t]])
            c[`list setlistTemplates where orgId==${T}`] = () => query(tok, "setlistTemplates", [["orgId", "EQUAL", t]])
            c[`list contacts where orgId==${T}`] = () => query(tok, "contacts", [["orgId", "EQUAL", t]])
            c[`list recordings where orgId==${T}`] = () => query(tok, "recordings", [["orgId", "EQUAL", t]])
            c[`list scheduling_assignments mine where orgId==${T}`] = () => query(tok, "scheduling_assignments", [["orgId", "EQUAL", t], ["musicianUid", "EQUAL", uid]])
            c[`list scheduling_history where orgId==${T}`] = () => query(tok, "scheduling_history", [["orgId", "EQUAL", t]])
            c[`list templates where orgId==${T}`] = () => query(tok, "templates", [["orgId", "EQUAL", t]])
            c[`storage read ${T} chart`] = () => storageGet(tok, fx[t].object)
            c[`create+delete setlist stamped ${T}`] = () => createAndDeleteSetlist(tok, uid, t)
        }
        c["list setlists (no filter)"] = () => query(tok, "setlists")
        c["list songs (no filter)"] = () => query(tok, "songs")
        c["list contacts (no filter)"] = () => query(tok, "contacts")
        c["list scheduling_assignments (no filter)"] = () => query(tok, "scheduling_assignments")
        c["list users"] = () => query(tok, "users")
        c["get own user doc"] = () => get(tok, `users/${uid}`)
        c["get config/congregation"] = () => get(tok, "config/congregation")
        c["get config/defaults"] = () => get(tok, "config/defaults")
        c["get config/monitor"] = () => get(tok, "config/monitor")
        c["get own crc membership"] = () => get(tok, `memberships/crc__${uid}`)
        c["list mcpTokens"] = () => query(tok, "mcpTokens")
        return c
    }
    const signedOut = {
        "get setlist crc": () => get(null, `setlists/${fx[CRC].setlistId}`),
        "get setlist bl": () => get(null, `setlists/${fx[BL].setlistId}`),
        "list tracks of crc setlist": () => query(null, "tracks", [["setlistId", "EQUAL", fx[CRC].setlistId]]),
        "list setlists (no filter)": () => query(null, "setlists"),
        "storage read crc chart": () => storageGet(null, fx[CRC].object),
    }
    for (const p of [...Object.keys(PERSONAS), "signedOut"]) {
        const tok = p === "signedOut" ? null : await idToken(p)
        const cs = p === "signedOut" ? signedOut : cases(tok, uidOf(p))
        const rows = {}
        for (const [name, fn] of Object.entries(cs)) {
            try { rows[name] = await fn() } catch (e) { rows[name] = { ok: false, error: String(e).slice(0, 120) } }
        }
        result.personas[p] = rows
        console.log(`${p}: ${Object.values(rows).filter((r) => r.ok).length}/${Object.keys(rows).length} allowed`)
    }
    writeFileSync(outFile, JSON.stringify(result, null, 1) + "\n")
}

function diff(a, b) {
    const A = JSON.parse(readFileSync(a, "utf8")).personas, B = JSON.parse(readFileSync(b, "utf8")).personas
    let n = 0
    for (const p of new Set([...Object.keys(A), ...Object.keys(B)])) {
        for (const c of new Set([...Object.keys(A[p] ?? {}), ...Object.keys(B[p] ?? {})])) {
            const x = JSON.stringify(A[p]?.[c]), y = JSON.stringify(B[p]?.[c])
            if (x !== y) { n++; console.log(`${p.padEnd(14)} ${c.padEnd(50)} ${x}  →  ${y}`) }
        }
    }
    console.log(n ? `${n} difference(s)` : "identical")
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === "setup") await setup()
else if (cmd === "teardown") await teardown()
else if (cmd === "run") await run(rest[rest.indexOf("--out") + 1])
else if (cmd === "diff") diff(rest[0], rest[1])
else { console.error("usage: setup | run --out f | diff a b | teardown"); process.exit(2) }
