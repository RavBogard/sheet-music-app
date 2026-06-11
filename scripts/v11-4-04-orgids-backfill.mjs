// v11.4-04-02 — default-both org-membership backfill.
//
// Stamps EVERY existing user with orgIds = ['crc','brotherslazaroff'] on BOTH
// the users/{uid} doc AND the Auth custom claim (lockstep, like /api/admin/set-role).
// Per Daniel's ratified scope (2026-06-11) this includes band_leaders/admins —
// "one unified team authors both bands" (cross-tenant authoring). Safe because
// v11.4-01 killed auto-blast: default-both only makes everyone a default
// publish-AUDIENCE candidate; live sends still require the explicit recipient picker.
//
// AUTH: this box has no Admin SA creds. We reuse the firebase CLI login by minting
// a temporary `authorized_user` ADC from the configstore refresh_token (public
// firebase-tools OAuth client), then delete the temp file (finally). Mirrors
// scripts/v11-3-03-library-orphan-sweep.mjs + scripts/add-auth-domains.mjs.
//
// USAGE:
//   node scripts/v11-4-04-orgids-backfill.mjs --diagnose         (read-only: distribution + would-change count)
//   node scripts/v11-4-04-orgids-backfill.mjs                    (dry-run DEFAULT: per-user change-set + would-write snapshot, NO writes)
//   node scripts/v11-4-04-orgids-backfill.mjs --apply --stamp "$(date -u +%Y%m%dT%H%M%SZ)"
//                                                                 (writes doc+claim both, writes a per-user rollback snapshot)
//   node scripts/v11-4-04-orgids-backfill.mjs --rollback scripts/.backfill-snapshots/<file>.json
//                                                                 (restore each user's prior doc+claim orgIds; absent prior → delete the field)
//
// SAFETY: dry-run is the DEFAULT; --apply and --rollback each require the explicit
// flag. Idempotent (a user already at both on doc AND claim is skipped). Other
// claims (role, soundEngineer, …) are never dropped. A snapshot is written for
// every CHANGED user so --rollback is exact.

// NOTE: firebase-admin is imported DYNAMICALLY inside the I/O functions (not at
// module top) so this module's top-level graph stays admin-free — the unit test
// can import the pure helpers below without pulling firebase-admin into the
// vitest/jsdom transform graph.
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, mkdirSync, existsSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

const PROJECT = process.env.FIREBASE_PROJECT || "crcmusiccharts"

// ────────────────────────────────────────────────────────────────────────────
// PURE decision logic (unit-tested in v11-4-04-orgids-backfill.test.ts — no
// Firestore/Auth dependency). main() below is the only place that does I/O.
// ────────────────────────────────────────────────────────────────────────────

export const TARGET_ORG_IDS = ["crc", "brotherslazaroff"]

/** The membership every user is stamped to. Returns a fresh copy (never aliased). */
export function targetOrgIds() {
    return [...TARGET_ORG_IDS]
}

/** Order-insensitive set equality against an arbitrary expected list. */
function setEq(a, b) {
    const sa = new Set(Array.isArray(a) ? a : [])
    const sb = new Set(Array.isArray(b) ? b : [])
    if (sa.size !== sb.size) return false
    for (const v of sa) if (!sb.has(v)) return false
    return true
}

/**
 * True iff BOTH the doc orgIds AND the claim orgIds already equal TARGET
 * (order-insensitive). A user where the doc is both but the claim is crc-only
 * is NOT alreadyBoth — it still needs the claim write (lockstep).
 */
export function alreadyBoth(docOrgIds, claimOrgIds) {
    return setEq(docOrgIds, TARGET_ORG_IDS) && setEq(claimOrgIds, TARGET_ORG_IDS)
}

/**
 * Record prior doc + claim orgIds for a CHANGED user. An ABSENT field (not an
 * array) is recorded as null so rollback can DELETE it (vs. restoring a value).
 */
export function snapshotEntry(uid, docOrgIds, claimOrgIds) {
    return {
        uid,
        prevDocOrgIds: Array.isArray(docOrgIds) ? docOrgIds : null,
        prevClaimOrgIds: Array.isArray(claimOrgIds) ? claimOrgIds : null,
    }
}

/**
 * Sentinel meaning "remove this field" — distinct from any orgIds array. Frozen
 * so identity comparison (`=== DELETE_SENTINEL`) is the contract the caller uses.
 */
export const DELETE_SENTINEL = Object.freeze({ __delete: true })

/**
 * Resolve what to restore for a snapshot entry: an array prev → write that array;
 * a null prev (field was ABSENT) → the DELETE sentinel (doc: FieldValue.delete();
 * claim: omit orgIds from the claim object).
 */
export function rollbackTargets(entry) {
    return {
        doc: entry.prevDocOrgIds == null ? DELETE_SENTINEL : entry.prevDocOrgIds,
        claim: entry.prevClaimOrgIds == null ? DELETE_SENTINEL : entry.prevClaimOrgIds,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// ADC bootstrap (firebase-tools refresh-token → temp authorized_user ADC)
// ────────────────────────────────────────────────────────────────────────────

// Public firebase-tools OAuth client (embedded in the open-source CLI).
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi"

function refreshToken() {
    const p = join(homedir(), ".config", "configstore", "firebase-tools.json")
    let j
    try {
        j = JSON.parse(readFileSync(p, "utf8"))
    } catch {
        throw new Error(`Cannot read ${p} — run \`firebase login\` first (auth gate).`)
    }
    const t = j?.tokens?.refresh_token
    if (!t) throw new Error(`No refresh_token in ${p} — run \`firebase login\` first (auth gate).`)
    return t
}

let tmpAdcPath = null
function bootstrapAdc() {
    const dir = mkdtempSync(join(tmpdir(), "v11-4-04-adc-"))
    tmpAdcPath = join(dir, "adc.json")
    writeFileSync(
        tmpAdcPath,
        JSON.stringify({
            type: "authorized_user",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: refreshToken(),
        }),
    )
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpAdcPath
}

// ────────────────────────────────────────────────────────────────────────────
// CLI arg parsing
// ────────────────────────────────────────────────────────────────────────────

function argValue(flag) {
    const i = process.argv.indexOf(flag)
    return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}

const DIAGNOSE = process.argv.includes("--diagnose")
const APPLY = process.argv.includes("--apply")
const ROLLBACK_PATH = process.argv.includes("--rollback") ? argValue("--rollback") : null

const SNAPSHOT_DIR = join("scripts", ".backfill-snapshots")

// ────────────────────────────────────────────────────────────────────────────
// I/O helpers (read doc + claim orgIds for a uid)
// ────────────────────────────────────────────────────────────────────────────

function claimOrgIdsOf(customClaims) {
    const raw = customClaims?.orgIds
    return Array.isArray(raw) ? raw : undefined
}

async function readUserState(db, fbAuth, uid, docData) {
    const docOrgIds = Array.isArray(docData?.orgIds) ? docData.orgIds : undefined
    let claimOrgIds
    let existingClaims = {}
    let authMissing = false
    try {
        const authUser = await fbAuth.getUser(uid)
        existingClaims = authUser.customClaims || {}
        claimOrgIds = claimOrgIdsOf(existingClaims)
    } catch {
        authMissing = true // user doc exists but no Auth record — stamp doc, skip claim
    }
    return { uid, docOrgIds, claimOrgIds, existingClaims, authMissing }
}

// ────────────────────────────────────────────────────────────────────────────
// Modes
// ────────────────────────────────────────────────────────────────────────────

async function runRollback(db, fbAuth) {
    if (!ROLLBACK_PATH || !existsSync(ROLLBACK_PATH)) {
        throw new Error(`--rollback requires a readable snapshot file. Got: ${ROLLBACK_PATH ?? "(none)"}`)
    }
    const { FieldValue } = await import("firebase-admin/firestore")
    const snapshot = JSON.parse(readFileSync(ROLLBACK_PATH, "utf8"))
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : []
    console.log(`\nrollback from ${ROLLBACK_PATH}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`)

    let restored = 0
    for (const entry of entries) {
        const { doc: docTarget, claim: claimTarget } = rollbackTargets(entry)
        // Doc
        const userRef = db.collection("users").doc(entry.uid)
        if (docTarget === DELETE_SENTINEL) {
            await userRef.update({ orgIds: FieldValue.delete() }).catch(() => {})
        } else {
            await userRef.update({ orgIds: docTarget }).catch(() => {})
        }
        // Claim (preserve other claims)
        try {
            const authUser = await fbAuth.getUser(entry.uid)
            const existing = authUser.customClaims || {}
            const next = { ...existing }
            if (claimTarget === DELETE_SENTINEL) delete next.orgIds
            else next.orgIds = claimTarget
            await fbAuth.setCustomUserClaims(entry.uid, next)
        } catch {
            console.log(`  (claim restore skipped for ${entry.uid} — no Auth record)`)
        }
        restored++
        console.log(`  restored ${entry.uid}: doc=${docTarget === DELETE_SENTINEL ? "DELETE" : JSON.stringify(docTarget)} claim=${claimTarget === DELETE_SENTINEL ? "DELETE" : JSON.stringify(claimTarget)}`)
    }
    console.log(`\nrollback complete: ${restored} user(s) restored.`)
}

async function main() {
    bootstrapAdc()
    const { initializeApp, getApps, applicationDefault } = await import("firebase-admin/app")
    const { getFirestore } = await import("firebase-admin/firestore")
    const { getAuth } = await import("firebase-admin/auth")
    if (!getApps().length) {
        initializeApp({ credential: applicationDefault(), projectId: PROJECT })
    }
    const db = getFirestore()
    const fbAuth = getAuth()

    if (ROLLBACK_PATH !== null) {
        await runRollback(db, fbAuth)
        return
    }

    const snap = await db.collection("users").get()
    const states = []
    for (const d of snap.docs) {
        states.push(await readUserState(db, fbAuth, d.id, d.data() || {}))
    }

    // --diagnose: distribution only (read-only).
    if (DIAGNOSE) {
        const tally = (orgIds) => {
            if (!Array.isArray(orgIds)) return "absent"
            if (setEqTo(orgIds, ["crc", "brotherslazaroff"])) return "both"
            if (setEqTo(orgIds, ["crc"])) return "crc-only"
            if (setEqTo(orgIds, ["brotherslazaroff"])) return "bl-only"
            return `other(${JSON.stringify(orgIds)})`
        }
        const docDist = {}
        const claimDist = {}
        for (const s of states) {
            const dk = tally(s.docOrgIds)
            const ck = tally(s.claimOrgIds)
            docDist[dk] = (docDist[dk] || 0) + 1
            claimDist[ck] = (claimDist[ck] || 0) + 1
        }
        const wouldChange = states.filter((s) => !alreadyBoth(s.docOrgIds, s.claimOrgIds)).length
        console.log(`\n[diagnose] scanned ${states.length} users`)
        console.log(`  doc orgIds distribution:   ${JSON.stringify(docDist)}`)
        console.log(`  claim orgIds distribution: ${JSON.stringify(claimDist)}`)
        console.log(`  would change (not already both on BOTH doc+claim): ${wouldChange}`)
        return
    }

    // Build the change-set (shared by dry-run + apply).
    const changed = states.filter((s) => !alreadyBoth(s.docOrgIds, s.claimOrgIds))
    const skipped = states.length - changed.length
    const TARGET = targetOrgIds()

    console.log(`\nscanned users: ${states.length}`)
    console.log(`already both (skipped, idempotent): ${skipped}`)
    console.log(`to change: ${changed.length}`)
    for (const s of changed) {
        console.log(`  - ${s.uid}  doc=${s.docOrgIds ? JSON.stringify(s.docOrgIds) : "absent"}  claim=${s.claimOrgIds ? JSON.stringify(s.claimOrgIds) : "absent"}${s.authMissing ? "  (NO Auth record — claim skipped)" : ""}`)
    }

    if (!APPLY) {
        const wouldSnapshot = changed.map((s) => snapshotEntry(s.uid, s.docOrgIds, s.claimOrgIds))
        console.log(`\nDRY-RUN: no writes. Would stamp ${changed.length} user(s) to ${JSON.stringify(TARGET)} and write a ${wouldSnapshot.length}-entry snapshot.`)
        console.log(`Re-run with --apply --stamp "$(date -u +%Y%m%dT%H%M%SZ)" to write.`)
        return
    }

    if (changed.length === 0) {
        console.log("\n--apply: nothing to change (all users already both).")
        return
    }

    // --apply: stamp doc + claim (lockstep), accumulate a rollback snapshot.
    const entries = []
    let docWrites = 0
    let claimWrites = 0
    for (const s of changed) {
        entries.push(snapshotEntry(s.uid, s.docOrgIds, s.claimOrgIds))
        // Doc (merge — never clobber other fields).
        await db.collection("users").doc(s.uid).set({ orgIds: TARGET }, { merge: true })
        docWrites++
        // Claim (preserve role/soundEngineer/etc.).
        if (!s.authMissing) {
            await fbAuth.setCustomUserClaims(s.uid, { ...s.existingClaims, orgIds: TARGET })
            claimWrites++
        }
    }

    // Write the rollback snapshot.
    const stamp = argValue("--stamp") || new Date().toISOString().replace(/[:.]/g, "-")
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })
    const snapshotPath = join(SNAPSHOT_DIR, `v11-4-04-${stamp}.json`)
    writeFileSync(snapshotPath, JSON.stringify({ stamp, target: TARGET, entries }, null, 2))

    console.log(`\n--apply complete: scanned=${states.length} changed=${changed.length} skipped=${skipped} docWrites=${docWrites} claimWrites=${claimWrites}`)
    console.log(`snapshot written: ${snapshotPath}`)
    console.log(`rollback with: node scripts/v11-4-04-orgids-backfill.mjs --rollback ${snapshotPath}`)
}

// Local helper used only by --diagnose tally (kept out of the exported pure set).
function setEqTo(a, b) {
    const sa = new Set(Array.isArray(a) ? a : [])
    const sb = new Set(Array.isArray(b) ? b : [])
    if (sa.size !== sb.size) return false
    for (const v of sa) if (!sb.has(v)) return false
    return true
}

// Only run main() when executed directly (not when imported by the unit test).
const invokedDirectly = process.argv[1] && /v11-4-04-orgids-backfill\.mjs$/.test(process.argv[1])
if (invokedDirectly) {
    main()
        .catch((e) => {
            console.error("\nFATAL:", e instanceof Error ? e.message : String(e))
            process.exitCode = 1
        })
        .finally(() => {
            if (tmpAdcPath) {
                try {
                    unlinkSync(tmpAdcPath)
                } catch {}
            }
        })
}
