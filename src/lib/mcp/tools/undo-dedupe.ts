import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import type { DedupeRunRecord, DedupeRunRow } from "./library"

/**
 * W3 of the content-hash order — `undo_dedupe_group` (R-0903-live-cw-2 §5).
 *
 * ─── why this exists ────────────────────────────────────────────────────────
 * `dedupe_library` has been able to hide rows since cycle-1 and nothing has
 * ever been able to un-hide them. 103 rows in production carry
 * `status: "duplicate"` right now [measured exhaustively over all 891
 * catalog rows, `live`, 2026-09-03] and the only reversal artifact in
 * existence is a hand-written JSON file in a DIFFERENT repository, covering
 * 83 of them. This tool is the missing half of a destructive operation.
 *
 * ─── the rule it is built around ────────────────────────────────────────────
 * R-0903-live-cw-2 §5: *a repair tool may not create the class of harm it
 * exists to repair.* Restoring is a write, and a careless restore is exactly
 * as destructive as a careless mark — 18 of the 85 rows in the 09-01 file
 * were `archived` BEFORE dedupe touched them, so "restore everything to
 * active" would un-archive 18 rows somebody deliberately archived, while
 * calling itself a repair. So:
 *
 *   - a `runId` restore uses each row's RECORDED `priorStatus`, never a
 *     default;
 *   - a single-row restore requires the caller to NAME the `toStatus`;
 *   - and a restore with neither a record nor an explicit status REFUSES,
 *     and says how many rows it would have wrongly activated.
 *
 * There is no third mode. "Restore everything you can find" is not offered,
 * because the safe version of it is a `runId` restore and the unsafe version
 * is the harm above.
 */

/** How a restore was authorised — surfaced per row so the report is auditable. */
export type UndoSource =
    /** From the run record's own `priorStatus`. */
    | "run-record"
    /** From the caller's explicit `toStatus`. */
    | "explicit"

export interface UndoDedupeGroupArgs {
    /**
     * Restore every row of this run to its RECORDED `priorStatus`. Mutually
     * exclusive with `fileId`.
     */
    runId?: string
    /** Restore this one row. Requires `toStatus`. */
    fileId?: string
    /**
     * The status to restore `fileId` to. REQUIRED with `fileId` — the tool
     * will not guess, because guessing is how an archived row becomes active.
     */
    toStatus?: string
    /** F-05 standing rule: report without writing. Does NOT require force. */
    dryRun?: boolean
    /** F-05 standing rule: required for real writes. */
    force?: boolean
}

export interface UndoDedupeRowResult {
    fileId: string
    /** The status the row actually carried when this tool read it. */
    fromStatus: string | null
    /** The status it was restored to (or would be). */
    toStatus: string
    /** Where `toStatus` came from. */
    source: UndoSource
    /** Whether the mirrored `songs/{id}` doc was updated too. */
    songMirrored: boolean
    /**
     * Set when the row was left alone, with the reason. A skip is a
     * conclusion, not a silence.
     */
    skipped?: string
}

export interface UndoDedupeGroupResult {
    mode: "run" | "row"
    runId?: string
    /** Rows the run record holds (run mode only). */
    recordedRows?: number
    /** Rows this call restored (0 on dryRun / refused). */
    restored: number
    /** Rows deliberately left alone, and why. */
    skipped: number
    dryRun: boolean
    refused?: boolean
    rows: UndoDedupeRowResult[]
}

const LIBRARY = "library_index"
const SONGS = "songs"
const RUNS = "dedupeRuns"

export async function undoDedupeGroup(
    uid: string,
    args: UndoDedupeGroupArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<UndoDedupeGroupResult | RichErrorEnvelope> {
    const dryRun = args.dryRun === true
    const force = args.force === true
    try {
        initAdmin()
        const db = getFirestore()

        // Admin gate, mirroring the whole admin-hygiene family. This tool
        // writes `library_index` and `songs`, and un-hiding a row is as much
        // a mutation as hiding one.
        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "undo_dedupe_group is admin-only.",
                { callerRole: role ?? null, requiredRoles: ["admin"] },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

        const hasRun = typeof args.runId === "string" && args.runId.length > 0
        const hasFile = typeof args.fileId === "string" && args.fileId.length > 0

        if (hasRun && hasFile) {
            return richError(
                "invalid_arguments",
                "Pass EITHER runId (restore a whole run) or fileId + toStatus (restore one row), not both.",
                { runId: args.runId, fileId: args.fileId },
                "Drop one of the two. A run restore already covers every row that run marked.",
            )
        }

        /* ── the refusal the ruling asks for, and the reason it is a refusal
         * rather than a default ──────────────────────────────────────────────
         * A caller with neither a run record nor an explicit status is asking
         * this tool to invent a prior state. The only invention available is
         * "active", and that is precisely the wrong answer for the 18 rows
         * that were `archived` before dedupe ran. So the tool refuses, and
         * names the count so the refusal is informative rather than merely
         * obstructive. */
        if (!hasRun && !hasFile) {
            const wrongly = await countWronglyActivated(db, org)
            return richError(
                "restore_target_required",
                "A blanket restore is refused: this tool will not invent a prior status. " +
                    `${wrongly.archived} of the ${wrongly.recorded} rows with a recorded prior status ${wrongly.archived === 1 ? "was" : "were"} ARCHIVED before dedupe ran, ` +
                    "so a restore that defaulted to `active` would un-archive rows somebody deliberately archived — " +
                    "the exact class of harm this tool exists to repair (R-0903-live-cw-2 §5). " +
                    `${wrongly.unrecorded} marked ${wrongly.unrecorded === 1 ? "row has" : "rows have"} no recorded prior status at all, and this tool cannot guess ${wrongly.unrecorded === 1 ? "its" : "theirs"} either.`,
                {
                    wouldWronglyActivate: wrongly.archived,
                    rowsWithRecordedPriorStatus: wrongly.recorded,
                    markedRowsWithNoRecord: wrongly.unrecorded,
                    markedRowsTotal: wrongly.marked,
                },
                "Pass `runId` to restore one run to its recorded prior statuses, or `fileId` + `toStatus` to restore a single row you have decided about.",
            )
        }

        if (hasFile && (typeof args.toStatus !== "string" || !args.toStatus)) {
            const row = await db.collection(LIBRARY).doc(args.fileId!).get()
            const recorded = row.exists
                ? ((row.data()?.priorStatus as string | undefined) ?? null)
                : null
            return richError(
                "to_status_required",
                "A single-row restore must NAME the status to restore to. " +
                    (recorded
                        ? `This row records priorStatus \`${recorded}\` — pass that explicitly if it is what you intend.`
                        : "This row has no recorded priorStatus, so there is nothing to infer from."),
                { fileId: args.fileId, recordedPriorStatus: recorded },
                "Re-call with `toStatus`, e.g. `toStatus: \"active\"` — or `\"archived\"` if that is where the row belongs.",
            )
        }

        // F-05: a real run needs force; dryRun never does.
        if (!dryRun && !force) {
            const plan = hasRun
                ? await planRunRestore(db, args.runId!, org)
                : await planRowRestore(db, args.fileId!, args.toStatus!, org)
            if ("error" in plan) return plan
            return richError(
                "force_required",
                "undo_dedupe_group requires force:true to commit.",
                { dryRunPlan: { ...plan, dryRun: false, refused: true } },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }

        const plan = hasRun
            ? await planRunRestore(db, args.runId!, org)
            : await planRowRestore(db, args.fileId!, args.toStatus!, org)
        if ("error" in plan) return plan

        const toWrite = plan.rows.filter((r) => !r.skipped)
        if (!dryRun && toWrite.length > 0) {
            const BATCH_MAX = 400
            interface Op {
                ref: FirebaseFirestore.DocumentReference
                data: Record<string, unknown>
            }
            const ops: Op[] = []
            for (const r of toWrite) {
                // The restore clears the dedupe stamps as well as the status.
                // A row left carrying `dedupeRunId` after being restored would
                // report itself as belonging to a run that no longer holds it,
                // and the next undo of that run would try to restore it twice.
                ops.push({
                    ref: db.collection(LIBRARY).doc(r.fileId),
                    data: {
                        status: r.toStatus,
                        dedupedAt: null,
                        dedupeRunId: null,
                        priorStatus: null,
                    },
                })
                if (r.songMirrored) {
                    ops.push({
                        ref: db.collection(SONGS).doc(r.fileId),
                        data: {
                            status: r.toStatus,
                            dedupeRunId: null,
                            priorStatus: null,
                        },
                    })
                }
            }
            for (let i = 0; i < ops.length; i += BATCH_MAX) {
                const batch = db.batch()
                for (const { ref, data } of ops.slice(i, i + BATCH_MAX)) {
                    batch.update(ref, data)
                }
                await batch.commit()
            }
        }

        return {
            ...plan,
            restored: dryRun ? 0 : toWrite.length,
            skipped: plan.rows.filter((r) => r.skipped).length,
            dryRun,
        }
    } catch (err) {
        logger.warn("[mcp] undo_dedupe_group failed:", err)
        return richError(
            "internal_error",
            "Failed to run undo_dedupe_group.",
            { tool: "undo_dedupe_group" },
            "Retry; if the failure persists check the Firestore project / IAM.",
        )
    }
}

/**
 * The numbers behind the blanket refusal. Measured, not remembered — the
 * order quoted 100 marked rows and 15 unrecorded, and the live catalog says
 * otherwise, so this counts at call time.
 */
async function countWronglyActivated(
    db: FirebaseFirestore.Firestore,
    org: OrgId,
): Promise<{
    marked: number
    recorded: number
    archived: number
    unrecorded: number
}> {
    const snap = await db.collection(LIBRARY).get()
    const marked = snap.docs.filter(
        (d) => rowOrg(d.data().orgId) === org && d.data().status === "duplicate",
    )
    let recorded = 0
    let archived = 0
    const runSnap = await db.collection(RUNS).get()
    const recordedPrior = new Map<string, string | null>()
    for (const doc of runSnap.docs) {
        const rec = doc.data() as DedupeRunRecord
        for (const row of rec.rows ?? []) {
            recordedPrior.set(row.fileId, row.priorStatus)
        }
    }
    for (const d of marked) {
        const own = d.data().priorStatus as string | undefined
        const prior = own ?? recordedPrior.get(d.id)
        if (prior !== undefined) {
            recorded += 1
            if (prior === "archived") archived += 1
        }
    }
    return {
        marked: marked.length,
        recorded,
        archived,
        unrecorded: marked.length - recorded,
    }
}

type Plan = Omit<UndoDedupeGroupResult, "restored" | "skipped" | "dryRun">

async function planRunRestore(
    db: FirebaseFirestore.Firestore,
    runId: string,
    org: OrgId,
): Promise<Plan | RichErrorEnvelope> {
    const runSnap = await db.collection(RUNS).doc(runId).get()
    if (!runSnap.exists) {
        return richError(
            "run_not_found",
            `No dedupeRuns record \`${runId}\`. Without a record there is no recorded prior status, and this tool will not invent one.`,
            { runId },
            "List the runs you can restore, or restore a single row with `fileId` + an explicit `toStatus`.",
        )
    }
    const rec = runSnap.data() as DedupeRunRecord
    const rows: DedupeRunRow[] = rec.rows ?? []
    if (rows.length === 0) {
        return richError(
            "run_record_empty",
            `dedupeRuns/${runId} holds no rows, so there is nothing to restore.`,
            { runId },
            "Check the runId — a run that marked nothing writes no record at all.",
        )
    }

    const out: UndoDedupeRowResult[] = []
    for (const row of rows) {
        const doc = await db.collection(LIBRARY).doc(row.fileId).get()
        if (!doc.exists) {
            out.push({
                fileId: row.fileId,
                fromStatus: null,
                toStatus: row.priorStatus ?? "active",
                source: "run-record",
                songMirrored: false,
                skipped: "row absent from library_index",
            })
            continue
        }
        const data = doc.data() as Record<string, unknown>
        if (rowOrg(data.orgId) !== org) {
            // A restore must not cross tenants, for the same reason the scan
            // must not: L1-W3 found 7 of 8 groups in a live plan belonged to
            // another org entirely.
            out.push({
                fileId: row.fileId,
                fromStatus: (data.status as string) ?? null,
                toStatus: row.priorStatus ?? "active",
                source: "run-record",
                songMirrored: false,
                skipped: "row belongs to another org",
            })
            continue
        }
        const current = (data.status as string | undefined) ?? null
        if (current !== "duplicate") {
            // Idempotence, and honesty: the row has already moved on. Say so
            // rather than writing over whatever it is now.
            out.push({
                fileId: row.fileId,
                fromStatus: current,
                toStatus: row.priorStatus ?? "active",
                source: "run-record",
                songMirrored: false,
                skipped: `row is \`${current ?? "(none)"}\`, not \`duplicate\` — already restored or changed since the run`,
            })
            continue
        }
        const song = await db.collection(SONGS).doc(row.fileId).get()
        out.push({
            fileId: row.fileId,
            fromStatus: current,
            // The recorded prior status, verbatim. This is the whole point of
            // the record: `archived` rows go back to `archived`.
            toStatus: row.priorStatus ?? "active",
            source: "run-record",
            songMirrored: song.exists,
        })
    }
    return { mode: "run", runId, recordedRows: rows.length, rows: out }
}

async function planRowRestore(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    toStatus: string,
    org: OrgId,
): Promise<Plan | RichErrorEnvelope> {
    const doc = await db.collection(LIBRARY).doc(fileId).get()
    if (!doc.exists) {
        return richError(
            "row_not_found",
            `No library_index row \`${fileId}\`.`,
            { fileId },
            "Check the fileId with search_library or list_library.",
        )
    }
    const data = doc.data() as Record<string, unknown>
    if (rowOrg(data.orgId) !== org) {
        return richError(
            "forbidden_org",
            `Row \`${fileId}\` belongs to another org.`,
            { fileId },
            "Restore rows in your own tenant only.",
        )
    }
    const current = (data.status as string | undefined) ?? null
    const song = await db.collection(SONGS).doc(fileId).get()
    const row: UndoDedupeRowResult = {
        fileId,
        fromStatus: current,
        toStatus,
        source: "explicit",
        songMirrored: song.exists,
    }
    // An explicit single-row restore is the operator's decision, so it is
    // allowed even when the row is not `duplicate` — but it is never allowed
    // to be a no-op pretending to be a change.
    if (current === toStatus) {
        row.skipped = `row is already \`${toStatus}\``
    }
    return { mode: "row", rows: [row] }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The one-time legacy seed.
 *
 * `L1-W2-DEDUPE-UNDO-2026-09-01.json` is the hand-written undo artifact from
 * the 09-01 sweep, and it is the ONLY prior state that exists for those rows.
 * Seeding it as a `dedupeRuns` record puts it inside the system, where
 * `undo_dedupe_group` can reach it.
 *
 * What the seed refuses to do: invent records for the rows the file does not
 * cover. 20 marked rows have no prior status stamped anywhere [measured
 * exhaustively, `live`, 2026-09-03 — the order said 15], and most of them are
 * the 09-03 naming-dedupe run's work, which recorded nothing. Those rows get
 * NO record, the seed reports them as a population, and the undo tool says so
 * rather than assuming `active`.
 * ────────────────────────────────────────────────────────────────────────── */

export const LEGACY_RUN_ID = "legacy-2026-09-01"

export interface LegacyUndoFileRow {
    fileId: string
    name: string
    priorStatus: string
    canonicalFileId: string
    canonicalName?: string
}

export interface SeedLegacyResult {
    runId: string
    /** Rows written into the record. */
    seeded: number
    /** Of those, how many are still `duplicate` and therefore restorable. */
    stillMarked: number
    /** Rows in the file that are NOT marked today — recorded, but no-ops. */
    noLongerMarked: string[]
    /** Marked rows the file does not cover. These get NO record, by design. */
    markedWithNoRecord: string[]
    priorStatusHistogram: Record<string, number>
    dryRun: boolean
}

/**
 * Import the 09-01 undo file as a `dedupeRuns` record. Read-only against the
 * catalog until it writes; `dryRun` reports the whole shape without writing
 * (F-05).
 */
export async function seedLegacyDedupeRun(
    uid: string,
    rows: LegacyUndoFileRow[],
    opts: { dryRun?: boolean; force?: boolean } = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<SeedLegacyResult | RichErrorEnvelope> {
    const dryRun = opts.dryRun === true
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
                "seed_legacy_dedupe_run is admin-only.",
                { callerRole: role ?? null, requiredRoles: ["admin"] },
                "Ask an admin to elevate your account.",
            )
        }
        if (!dryRun && opts.force !== true) {
            return richError(
                "force_required",
                "Seeding the legacy run record requires force:true.",
                {},
                "Re-call with `force: true`, or `dryRun: true` to inspect first.",
            )
        }
        if (!rows.length) {
            return richError(
                "invalid_arguments",
                "The legacy undo file parsed to zero rows.",
                {},
                "Check the file path and that it is the 85-row 09-01 artifact.",
            )
        }

        const snap = await db.collection(LIBRARY).get()
        const live = new Map<string, Record<string, unknown>>()
        for (const d of snap.docs) {
            if (rowOrg(d.data().orgId) === org) live.set(d.id, d.data())
        }
        const markedIds = new Set(
            [...live.entries()]
                .filter(([, v]) => v.status === "duplicate")
                .map(([k]) => k),
        )

        const covered = new Set(rows.map((r) => r.fileId))
        const runRows: DedupeRunRow[] = rows.map((r) => ({
            fileId: r.fileId,
            priorStatus: r.priorStatus,
            canonicalFileId: r.canonicalFileId,
            // The 09-01 sweep was the normalized-name pass. Recording it
            // honestly matters: a later reader must not mistake these for
            // byte-identity groups, which is a much stronger claim.
            groupedBy: "exact-name",
        }))

        const hist: Record<string, number> = {}
        for (const r of runRows) {
            const k = r.priorStatus ?? "(none)"
            hist[k] = (hist[k] ?? 0) + 1
        }

        const noLongerMarked = rows
            .filter((r) => !markedIds.has(r.fileId))
            .map((r) => r.fileId)
        const markedWithNoRecord = [...markedIds].filter((id) => !covered.has(id))

        if (!dryRun) {
            const record: DedupeRunRecord = {
                runId: LEGACY_RUN_ID,
                at: "2026-09-01T00:00:00.000Z",
                threshold: 0.85,
                actorUid: uid,
                orgId: org,
                groupsFound: new Set(rows.map((r) => r.canonicalFileId)).size,
                marked: runRows.length,
                rows: runRows,
            }
            await db.collection(RUNS).doc(LEGACY_RUN_ID).set(record)
        }

        return {
            runId: LEGACY_RUN_ID,
            seeded: dryRun ? 0 : runRows.length,
            stillMarked: rows.filter((r) => markedIds.has(r.fileId)).length,
            noLongerMarked,
            markedWithNoRecord,
            priorStatusHistogram: hist,
            dryRun,
        }
    } catch (err) {
        logger.warn("[mcp] seed_legacy_dedupe_run failed:", err)
        return richError(
            "internal_error",
            "Failed to seed the legacy dedupe run record.",
            {},
            "Retry; if the failure persists check the Firestore project / IAM.",
        )
    }
}
