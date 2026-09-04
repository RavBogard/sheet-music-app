import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { fetchFileById } from "@/lib/file-fetcher"
import { getStorageObjectMd5 } from "@/lib/firebase-storage"
import { isGoogleAppsMime } from "@/lib/mcp/tools/library"
import { isNonChartArtifactShape } from "@/lib/library/junk-filter"
import {
    contentHashFor,
    crossCheckMd5,
    hashIsCurrent,
    type ContentHash,
    type HashFailure,
    type HashFailureReason,
} from "@/lib/library/content-hash"
import type { HygieneCoverage } from "./reconcile-library"

/**
 * W4 of the content-hash order (R-0903-live-cw-2 §3) — populate
 * `library_index.contentHash` by reading each row's bytes ONCE.
 *
 * Batched and resumable by design, because this is the only wave that costs
 * real money and time: it downloads every chart in the library. A row whose
 * recorded `contentHash.sizeBytes` still matches its `fileSize` is skipped
 * without a byte read, so a re-run after an interruption resumes rather than
 * restarting, and a re-run after a completed pass is free.
 *
 * The guard that matters here is G4: **a hash is never written for bytes
 * that did not verify.** Where a row already claims a `driveMd5` or a
 * Storage `md5Hash`, the md5 recomputed from the downloaded bytes must
 * agree. A disagreement means we fetched something other than what this row
 * claims — and a wrong hash is worse than no hash, because it makes a false
 * pair confidently. Those rows are recorded `hashFailed` and get no hash.
 *
 * Rows whose bytes are unreachable are reported as a POPULATION, not
 * skipped in silence: the Google-Apps rows (which have no bytes at all) and
 * the dead-byte rows `search_library` hides behind `includeUnbindable`.
 */

export interface BackfillContentHashArgs {
    /** F-05: report without writing. Never requires `force`. */
    dryRun?: boolean
    /** F-05: required for real writes. */
    force?: boolean
    /**
     * Stop after this many rows have had their bytes READ (not counting
     * skips). The backfill is resumable, so a small limit is the intended
     * way to run it: take a bite, see the failure shape, take another.
     */
    limit?: number
    /**
     * Re-hash rows that already carry a current hash. Off by default — the
     * whole point of the column is that it never needs doing twice.
     */
    rehash?: boolean
}

export interface BackfillContentHashFailureRow {
    fileId: string
    name: string
    mimeType: string | null
    fileSize: number | null
    reason: HashFailureReason
    detail: string
}

/**
 * One population's figures. Deliberately the same shape for both, so the
 * return can print them as two rows of one table and a reader can subtract.
 */
export interface BackfillPopulationTally {
    /** Eligible rows in this population. */
    rows: number
    /** Rows whose bytes were read this call. */
    read: number
    /** Bytes actually downloaded this call — the cost, in the unit that matters. */
    bytesRead: number
    /** Rows given a `contentHash` this call (0 on dryRun). */
    hashed: number
    /** Rows already current, skipped without a byte read. */
    alreadyCurrent: number
    /** Rows recorded `hashFailed` — no hash written. */
    failed: number
}

export interface BackfillContentHashResult {
    /** Rows eligible for hashing in the caller's org. */
    scanned: number
    /** Rows whose bytes were read this call. */
    read: number
    /** Rows given a `contentHash` this call (0 on dryRun). */
    hashed: number
    /** Rows already current, skipped without a byte read. */
    alreadyCurrent: number
    /** Rows recorded `hashFailed` — no hash written. */
    failed: number
    /** Rows left for a later call because `limit` was reached. */
    remaining: number
    /**
     * §5 (amended, R-0903-live-cw-3 §3) — the two populations, reported
     * SEPARATELY and never blended.
     *
     * Daniel is waiting on one question about the `non_chart` rows (are the
     * 12 audio part-track groups one file uploaded under several part
     * names?) and a different question about the charts. A single blended
     * count answers neither, so the tally is partitioned by the SAME
     * classifier the browse surfaces use — `isNonChartArtifactShape` —
     * rather than by a second definition invented here.
     *
     * `bytesRead` is in bytes, not rows, because the amendment names the
     * cost in bytes: the audio population runs to roughly 1.5 MB per group
     * against a chart population of a few hundred KB in total. A row count
     * would hide the thing that makes this wave long.
     */
    populations: {
        chart: BackfillPopulationTally
        nonChart: BackfillPopulationTally
    }
    /**
     * The md5 cross-check tally. `mismatched` is the number that STOPS this
     * wave if it is not near zero (order §8): a handful is data, a
     * systematic rate means the download path and the row disagree about
     * which object is the row's, and that is a finding, not a retry.
     */
    md5CrossCheck: {
        /**
         * E2 (`R-0903-live-cw-11` §3) — the DENOMINATOR.
         *
         * Rows whose bytes came from a source that exposes a checksum of its
         * own. Rows with no Storage object (Google-Apps, Drive-only) are
         * outside this count BY CONSTRUCTION, not by exception, so the
         * guard's silence about them is not a gap.
         *
         * GREEN is `claimed === applicable && mismatched === 0`.
         * **`applicable === 0` is NOT APPLICABLE and is never a pass** — it
         * is what `{0, 0, 0}` meant for 853 rows while `storageMd5Hash` was
         * read at one site and written at none.
         */
        applicable: number
        claimed: number
        agreed: number
        mismatched: number
    }
    /** Every failure, named. A population, not a silence. */
    failures: BackfillContentHashFailureRow[]
    /** Byte-identical clusters visible in what has been hashed SO FAR. */
    byteIdenticalClusters: Array<{
        sha256: string
        sizeBytes: number
        rows: Array<{ fileId: string; name: string; status: string | null }>
    }>
    dryRun: boolean
    refused?: boolean
    coverage: HygieneCoverage
}

const LIBRARY = "library_index"

export async function backfillContentHash(
    uid: string,
    args: BackfillContentHashArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<BackfillContentHashResult | RichErrorEnvelope> {
    const dryRun = args.dryRun === true
    const force = args.force === true
    const limit =
        typeof args.limit === "number" && args.limit > 0
            ? Math.floor(args.limit)
            : Number.POSITIVE_INFINITY
    const rehash = args.rehash === true

    try {
        initAdmin()
        const db = getFirestore()

        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "backfill_content_hash is admin-only.",
                { callerRole: role ?? null, requiredRoles: ["admin"] },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

        const snap = await db.collection(LIBRARY).get()
        const filteredOut: HygieneCoverage["filteredOut"] = {
            byStatus: {},
            byCollection: {},
            byOther: {},
        }

        // Tenant scope, for the same reason every other hygiene tool has it:
        // L1-W3 found 7 of 8 groups in a live plan belonged to another org.
        const rows = snap.docs.filter((d) => {
            if (rowOrg(d.data().orgId) !== org) {
                filteredOut.byOther.other_org =
                    (filteredOut.byOther.other_org ?? 0) + 1
                return false
            }
            return true
        })

        // Every status is in scope. A `duplicate` row's bytes are exactly
        // what decides whether the mark was right, so hashing only the
        // visible rows would leave the interesting half unmeasured.
        const eligible = rows

        let read = 0
        let hashed = 0
        let alreadyCurrent = 0

        // §5 (amended) — two populations, tallied as the loop goes rather
        // than reconstructed afterwards. Reconstructing would mean
        // re-classifying rows from the failure list, and a row that failed
        // for `bytes_unreachable` is not in the failure list twice.
        const emptyTally = (): BackfillPopulationTally => ({
            rows: 0,
            read: 0,
            bytesRead: 0,
            hashed: 0,
            alreadyCurrent: 0,
            failed: 0,
        })
        const populations = { chart: emptyTally(), nonChart: emptyTally() }
        // Which population each row belongs to, so the post-commit `hashed`
        // count (which is only knowable after the batches land) can be
        // attributed without classifying a row twice.
        const popOf = new Map<string, keyof typeof populations>()
        const failures: BackfillContentHashFailureRow[] = []
        const md5 = { applicable: 0, claimed: 0, agreed: 0, mismatched: 0 }
        const hashByRow = new Map<
            string,
            { hash: ContentHash; name: string; status: string | null }
        >()

        interface Write {
            fileId: string
            data: Record<string, unknown>
        }
        const writes: Write[] = []
        let remaining = 0

        for (const doc of eligible) {
            const data = doc.data() as Record<string, unknown>
            const name = (data.name as string) ?? doc.id
            const mimeType = (data.mimeType as string | undefined) ?? null
            const fileSize =
                typeof data.fileSize === "number" ? data.fileSize : null
            const status = (data.status as string | undefined) ?? null

            // §5 (amended) — the partition, taken from the SAME classifier
            // the browse surfaces and `search_library` use. Note that it
            // calls Google-Apps rows non_chart too, which is why the
            // `bytes_unreachable` gapps failures below land in that
            // population: they are counted where the classifier puts them,
            // not where a reader might expect a "chart" to be.
            const pop: keyof typeof populations = isNonChartArtifactShape({
                mimeType,
                name,
            })
                ? "nonChart"
                : "chart"
            popOf.set(doc.id, pop)
            populations[pop].rows += 1

            // Already current — the resumability path, and the reason a
            // second run is free.
            if (!rehash && hashIsCurrent(data.contentHash, data.fileSize)) {
                alreadyCurrent += 1
                populations[pop].alreadyCurrent += 1
                const h = data.contentHash as ContentHash
                hashByRow.set(doc.id, { hash: h, name, status })
                continue
            }

            // Google-Apps rows have no bytes to hash. This is not a failure
            // of the fetch, it is a property of the row, so it is recorded
            // as its own reason rather than as an unreachable byte read.
            if (isGoogleAppsMime(mimeType)) {
                failures.push({
                    fileId: doc.id,
                    name,
                    mimeType,
                    fileSize,
                    reason: "bytes_unreachable",
                    detail:
                        "Google-Apps row — no stored bytes exist to hash. " +
                        "This is why the metadata md5 cannot be the key: it is absent here.",
                })
                populations[pop].failed += 1
                continue
            }

            if (read >= limit) {
                remaining += 1
                continue
            }

            read += 1
            populations[pop].read += 1
            let fetched: Awaited<ReturnType<typeof fetchFileById>> = null
            let fetchError: string | null = null
            try {
                fetched = await fetchFileById(doc.id, mimeType ?? undefined)
            } catch (err) {
                fetchError = err instanceof Error ? err.message : String(err)
            }

            if (!fetched || !fetched.buffer) {
                failures.push({
                    fileId: doc.id,
                    name,
                    mimeType,
                    fileSize,
                    reason: "bytes_unreachable",
                    detail:
                        fetchError ??
                        "neither Firebase Storage nor the Drive fallback returned bytes",
                })
                populations[pop].failed += 1
                continue
            }
            populations[pop].bytesRead += fetched.buffer.byteLength

            if (fetched.buffer.byteLength === 0) {
                failures.push({
                    fileId: doc.id,
                    name,
                    mimeType,
                    fileSize,
                    reason: "empty_buffer",
                    detail: "the fetch succeeded but returned 0 bytes",
                })
                populations[pop].failed += 1
                continue
            }

            /**
             * E2 (`R-0903-live-cw-11`) — ask the OBJECT, not the row.
             *
             * `storageMd5Hash` is read here and written NOWHERE: the field
             * has never existed on a single row, which is the whole of the
             * `{claimed: 0}` this guard reported over 853 rows. The fix is
             * not to add the field and backfill it — `getStorageObjectMd5`
             * returns the object's own `md5Hash` from metadata without
             * downloading bytes, and the loop is already holding that object
             * open. A claim read off the artifact at the moment of use cannot
             * go stale and needs no migration; a claim stored on the row is a
             * second copy of a fact.
             *
             * WHAT AGREEMENT CERTIFIES, in one sentence: the store computed
             * that md5 over the bytes the store holds, so agreement proves
             * THE READ WAS FAITHFUL — that what we hashed is what is stored.
             * It does not prove the bytes are the right chart, and it is not
             * an independent witness to provenance. `crc32c` sits on every
             * object too and would certify exactly the same thing; it is not
             * taken here because Node has no built-in crc32c, so a second
             * implementation would have to be trusted to make a claim the
             * md5 already makes.
             *
             * The row's own `storageMd5Hash` is still honoured if some future
             * writer populates it — the object's answer simply takes
             * precedence, because it is the one that cannot be stale.
             */
            let objectMd5: string | null = null
            if (fetched.source === "firebase-storage") {
                const objectMeta = await getStorageObjectMd5(
                    doc.id,
                    mimeType ?? undefined,
                )
                objectMd5 =
                    objectMeta && objectMeta.md5Base64
                        ? objectMeta.md5Base64
                        : null
            }
            const driveClaim =
                typeof data.driveMd5 === "string" && data.driveMd5.length > 0
            if (objectMd5 || driveClaim) md5.applicable += 1

            // G4 — the cross-check, BEFORE any hash is written.
            const check = crossCheckMd5(fetched.buffer, {
                driveMd5: data.driveMd5,
                storageMd5Hash: objectMd5 ?? data.storageMd5Hash,
            })
            if (check.checked) {
                md5.claimed += 1
                if (check.ok) {
                    md5.agreed += 1
                } else {
                    md5.mismatched += 1
                    const failure: HashFailure = {
                        reason: "md5_mismatch",
                        detail: check.detail,
                        at: new Date().toISOString(),
                    }
                    failures.push({
                        fileId: doc.id,
                        name,
                        mimeType,
                        fileSize,
                        reason: "md5_mismatch",
                        detail: check.detail,
                    })
                populations[pop].failed += 1
                    // NO hash for this row. A wrong hash makes a false pair
                    // confidently, which is strictly worse than an absence.
                    writes.push({
                        fileId: doc.id,
                        data: { hashFailed: failure, contentHash: null },
                    })
                    continue
                }
            }

            const hash = contentHashFor(fetched.buffer, fetched.source)
            hashByRow.set(doc.id, { hash, name, status })
            writes.push({
                fileId: doc.id,
                // Clearing `hashFailed` matters: a row that failed once and
                // now verifies must not keep advertising a failure.
                data: { contentHash: hash, hashFailed: null },
            })
        }

        if (!dryRun && !force) {
            return richError(
                "force_required",
                "backfill_content_hash requires force:true to commit.",
                {
                    dryRunPlan: {
                        scanned: eligible.length,
                        read,
                        wouldHash: writes.filter((w) => w.data.contentHash)
                            .length,
                        alreadyCurrent,
                        failed: failures.length,
                        populations,
                        md5CrossCheck: md5,
                        dryRun: false,
                        refused: true,
                    },
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }

        if (!dryRun && writes.length > 0) {
            const BATCH_MAX = 400
            for (let i = 0; i < writes.length; i += BATCH_MAX) {
                const batch = db.batch()
                for (const w of writes.slice(i, i + BATCH_MAX)) {
                    batch.update(db.collection(LIBRARY).doc(w.fileId), w.data)
                }
                await batch.commit()
                // Counted AFTER the commit, per population, so a run that
                // dies mid-backfill reports what actually landed rather
                // than what it intended to write.
                for (const w of writes.slice(i, i + BATCH_MAX)) {
                    if (!w.data.contentHash) continue
                    hashed += 1
                    const pop = popOf.get(w.fileId)
                    if (pop) populations[pop].hashed += 1
                }
            }
        }

        // What the whole wave is FOR: the clusters the bytes reveal. Reported
        // from everything hashed so far, including rows already current, so
        // an incremental run still answers the question that matters.
        const clusters = new Map<
            string,
            Array<{ fileId: string; name: string; status: string | null }>
        >()
        const sizeOf = new Map<string, number>()
        for (const [fileId, v] of hashByRow) {
            const key = `${v.hash.alg}:${v.hash.value}`
            const arr = clusters.get(key) ?? []
            arr.push({ fileId, name: v.name, status: v.status })
            clusters.set(key, arr)
            sizeOf.set(key, v.hash.sizeBytes)
        }
        const byteIdenticalClusters = [...clusters.entries()]
            .filter(([, arr]) => arr.length > 1)
            .map(([key, arr]) => ({
                sha256: key.slice(key.indexOf(":") + 1),
                sizeBytes: sizeOf.get(key) ?? 0,
                rows: arr,
            }))
            .sort((a, b) => b.rows.length - a.rows.length)

        for (const f of failures) {
            filteredOut.byOther[f.reason] =
                (filteredOut.byOther[f.reason] ?? 0) + 1
        }

        return {
            scanned: eligible.length,
            read,
            hashed: dryRun ? 0 : hashed,
            alreadyCurrent,
            failed: failures.length,
            remaining,
            populations,
            md5CrossCheck: md5,
            failures,
            byteIdenticalClusters,
            dryRun,
            coverage: {
                total: snap.size,
                eligible: eligible.length,
                scanned: read + alreadyCurrent,
                filteredOut,
            },
        }
    } catch (err) {
        logger.warn("[mcp] backfill_content_hash failed:", err)
        return richError(
            "internal_error",
            "Failed to run backfill_content_hash.",
            { tool: "backfill_content_hash" },
            "Retry; if the failure persists check the Firestore project / IAM.",
        )
    }
}
