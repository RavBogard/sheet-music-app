#!/usr/bin/env node
/**
 * Rebuild `setlists/{id}.fileIds[]` denorm from current `tracks` bonds.
 *
 * Tier-0 ops tool — historical-data fixup only. Sibling of
 * `scripts/restore-gcs-versions.mjs` / `scripts/probe-gcs-versions-wider-blast.mjs`
 * (same auth path, same DRY-RUN-by-default discipline).
 *
 * **The gap this script closes.** The MCP write path (`setlist-write.ts`,
 * `propose-changes.ts`, `clone-setlist.ts`, `templates.ts`) maintains
 * `setlist.fileIds[]` correctly going forward — it's the union of every
 * track's `fileId` across the setlist's `tracks` subcollection. But
 * historical setlists whose tracks were rebonded at some point before the
 * denorm-maintenance logic landed (or via legacy paths) carry stale entries
 * the write path never cleans up. coder-3's wider-blast probe Phase 4
 * setlist-coverage intersected against this stale denorm and misled the
 * Friday hot list (caught + ratified during the restore-gcs-versions lane).
 *
 * **Canonical denorm shape** (mirrors `propose-changes.ts:513-518`,
 * `clone-setlist.ts:283-289`, `templates.ts:807-813` verbatim):
 *
 *     const canonical = new Set<string>()
 *     for (const track of tracks-where-setlistId-eq-this-setlist) {
 *       if (typeof track.fileId === "string" && track.fileId) {
 *         canonical.add(track.fileId)
 *       }
 *     }
 *     // setlist.fileIds = [...canonical]
 *
 * NO filter on `type`. NO inclusion of `audioFileId` (the write path
 * doesn't include it — H-1 test in `mcp-setlist-write.emulator.test.ts`
 * confirms). NO inclusion of `chartFileIds` or any other denorm — only the
 * primary `fileId` field on each track row.
 *
 * **Behavior.** DRY-RUN by default (no writes). `--apply` required for
 * real run. Idempotent — re-running after `--apply` reports zero deltas.
 *
 * **Output.** Per-setlist record streamed to stderr (human trace) and
 * accumulated to stdout as a JSON report at the end:
 *   { setlistId, setlistName, eventDate, currentDenormCount,
 *     computedFromBondsCount, extraInDenorm[], missingFromDenorm[] }
 * Plus an aggregate summary: scanned / stale / would-update / updated.
 *
 * **Sanity ceilings.** Caller (dispatch) asked us to surface as HEADS-UP
 * if dry-run shows >5% of setlists with deltas OR any single setlist
 * losing >50% of its denorm. These are reported in the summary but the
 * script does NOT block on them — the human reviews the dry-run before
 * `--apply`.
 *
 * Usage:
 *   node scripts/rebuild-setlist-fileids-denorm.mjs            # DRY-RUN
 *   node scripts/rebuild-setlist-fileids-denorm.mjs --apply    # real run
 *
 * Auth: .env.local with FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY +
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID. firebase-adminsdk-fbsvc@crcmusiccharts
 * SA — needs `datastore.user` (collection-group `tracks` read + `setlists`
 * read/write).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

// ---------- .env.local loader ----------
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
const APPLY = process.argv.includes("--apply")

// ---------- Firebase admin init ----------
function initFirestore() {
    const email = process.env.FIREBASE_CLIENT_EMAIL
    const key = process.env.FIREBASE_PRIVATE_KEY
    if (!email || !key) {
        throw new Error(
            "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY required in .env.local",
        )
    }
    if (getApps().length === 0) {
        initializeApp({
            credential: cert({
                projectId: PROJECT_ID,
                clientEmail: email,
                privateKey: key,
            }),
        })
    }
    return getFirestore()
}

// ---------- Canonical denorm helper ----------
// Mirror propose-changes.ts:513-518 verbatim. The condition is intentionally
// `typeof === "string" && fid` (truthy non-empty) — null/undefined/"" all
// excluded. We sort the output for stable diffs; the write path doesn't
// sort but `Set.has(x)` doesn't care about order, so this is safe.
function canonicalFileIdsFromTracks(trackDocs) {
    const set = new Set()
    for (const doc of trackDocs) {
        const data = doc.data()
        const fid = data.fileId
        if (typeof fid === "string" && fid) set.add(fid)
    }
    return [...set].sort()
}

// ---------- Per-setlist diff ----------
function diffDenorm(current, computed) {
    const cur = new Set(Array.isArray(current) ? current : [])
    const com = new Set(computed)
    const extraInDenorm = [...cur].filter((x) => !com.has(x)).sort()
    const missingFromDenorm = [...com].filter((x) => !cur.has(x)).sort()
    return { extraInDenorm, missingFromDenorm }
}

// ---------- Main ----------
async function main() {
    const db = initFirestore()

    process.stderr.write(
        `# rebuild-setlist-fileids-denorm.mjs — mode=${
            APPLY ? "APPLY" : "DRY-RUN"
        }\n`,
    )
    process.stderr.write(`# project=${PROJECT_ID}\n`)
    process.stderr.write(`# started=${new Date().toISOString()}\n\n`)

    // Pull every setlist. CRC has ~hundreds, well under any practical
    // pagination concern — single get() is fine.
    const setlistsSnap = await db.collection("setlists").get()
    process.stderr.write(
        `Phase 1: enumerated ${setlistsSnap.size} setlists\n\n`,
    )

    const records = []
    let stale = 0
    let wouldUpdate = 0
    let updated = 0
    let writeErrors = 0
    let maxFractionLost = 0 // for sanity ceiling

    for (const setlistDoc of setlistsSnap.docs) {
        const setlistId = setlistDoc.id
        const setlistData = setlistDoc.data()
        const setlistName = String(setlistData.name ?? "")
        const eventDate = setlistData.eventDate ?? null

        // Query tracks for this setlist. Top-level `tracks` collection
        // keyed by setlistId per coder-3's wider-blast findings (and
        // confirmed against propose-changes.ts which writes via
        // `db.collection("tracks")`).
        const tracksSnap = await db
            .collection("tracks")
            .where("setlistId", "==", setlistId)
            .get()
        const computed = canonicalFileIdsFromTracks(tracksSnap.docs)
        const current = Array.isArray(setlistData.fileIds)
            ? setlistData.fileIds.filter((x) => typeof x === "string" && x)
            : []
        const { extraInDenorm, missingFromDenorm } = diffDenorm(
            current,
            computed,
        )

        const record = {
            setlistId,
            setlistName,
            eventDate: eventDate
                ? typeof eventDate.toDate === "function"
                    ? eventDate.toDate().toISOString()
                    : String(eventDate)
                : null,
            currentDenormCount: current.length,
            computedFromBondsCount: computed.length,
            extraInDenorm,
            missingFromDenorm,
            updated: false,
        }

        const hasDelta =
            extraInDenorm.length > 0 || missingFromDenorm.length > 0
        if (hasDelta) {
            stale += 1
            wouldUpdate += 1

            // Sanity ceiling: any single setlist losing >50% of its denorm.
            if (current.length > 0) {
                const lostFraction = extraInDenorm.length / current.length
                if (lostFraction > maxFractionLost) {
                    maxFractionLost = lostFraction
                }
            }

            process.stderr.write(
                `STALE  ${setlistId} "${setlistName}" cur=${current.length} computed=${computed.length} extra=${extraInDenorm.length} missing=${missingFromDenorm.length}\n`,
            )
            if (extraInDenorm.length > 0) {
                process.stderr.write(
                    `       extra-in-denorm: ${extraInDenorm.join(", ")}\n`,
                )
            }
            if (missingFromDenorm.length > 0) {
                process.stderr.write(
                    `       missing-from-denorm: ${missingFromDenorm.join(", ")}\n`,
                )
            }

            if (APPLY) {
                try {
                    // We rewrite the field outright to the computed set —
                    // the WRITE path would do the same via the canonical
                    // `[...canonical]` assignment. We do NOT touch version,
                    // updatedAt, lastModifiedAt, or any other field — this
                    // is a historical-data fixup, NOT a user-facing edit.
                    // (If touching version mattered for cache invalidation,
                    // we'd need to coordinate with the auditor; for now,
                    // mirror the write path's literal field write only.)
                    await db
                        .collection("setlists")
                        .doc(setlistId)
                        .update({ fileIds: computed })
                    updated += 1
                    record.updated = true
                    process.stderr.write(`  -> UPDATED\n`)
                } catch (err) {
                    writeErrors += 1
                    record.updateError = err.message
                    process.stderr.write(
                        `  !! UPDATE FAILED: ${err.message}\n`,
                    )
                }
            }
        }

        records.push(record)
    }

    const summary = {
        mode: APPLY ? "apply" : "dry-run",
        startedAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        scanned: records.length,
        stale,
        wouldUpdate: APPLY ? 0 : wouldUpdate,
        updated: APPLY ? updated : 0,
        writeErrors,
        staleFraction: records.length > 0 ? stale / records.length : 0,
        maxSingleSetlistFractionLost: maxFractionLost,
        sanityCeilings: {
            staleFractionCeiling: 0.05,
            maxSingleSetlistFractionLostCeiling: 0.5,
            staleFractionExceeded:
                records.length > 0 && stale / records.length > 0.05,
            maxSingleSetlistFractionLostExceeded: maxFractionLost > 0.5,
        },
    }

    process.stderr.write(`\n=== Summary ===\n`)
    process.stderr.write(`  mode:             ${summary.mode}\n`)
    process.stderr.write(`  scanned:          ${summary.scanned}\n`)
    process.stderr.write(`  stale:            ${summary.stale}\n`)
    if (APPLY) {
        process.stderr.write(`  updated:          ${summary.updated}\n`)
        process.stderr.write(`  writeErrors:      ${summary.writeErrors}\n`)
    } else {
        process.stderr.write(`  wouldUpdate:      ${summary.wouldUpdate}\n`)
    }
    process.stderr.write(
        `  staleFraction:    ${(summary.staleFraction * 100).toFixed(2)}%  (ceiling 5%)\n`,
    )
    process.stderr.write(
        `  maxSingleLost:    ${(summary.maxSingleSetlistFractionLost * 100).toFixed(2)}%  (ceiling 50%)\n`,
    )
    if (summary.sanityCeilings.staleFractionExceeded) {
        process.stderr.write(
            `  WARN: staleFraction > 5% — surface as HEADS-UP to supervisor before --apply\n`,
        )
    }
    if (summary.sanityCeilings.maxSingleSetlistFractionLostExceeded) {
        process.stderr.write(
            `  WARN: a single setlist would lose > 50% of its denorm — surface as HEADS-UP before --apply\n`,
        )
    }

    process.stdout.write(
        JSON.stringify({ summary, records }, null, 2) + "\n",
    )

    if (writeErrors > 0) process.exit(1)
}

main().catch((err) => {
    process.stderr.write(`\n!! FATAL: ${err.stack || err.message}\n`)
    process.exit(1)
})
