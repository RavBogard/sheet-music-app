import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import type { DedupeRunRecord, DedupeRunRow } from "./library"

/**
 * M1 of MARK-TOOL-AND-TENANT-WALL — the single-row mark
 * (`R-0904-live-cw-2` §2, `R-0904-live-cw-6`).
 *
 * ─── why a whole tool for one row ───────────────────────────────────────────
 * Every write this catalog has ever made to a row's status came from a sweep:
 * a predicate ran, a group formed, a canonical row won on a rule, and the
 * losers were hidden. That is the right shape for a conclusion the machine
 * reached. It is the wrong shape for a decision a PERSON made.
 *
 * Daniel decided on 2026-09-03 which of two byte-identical `Mizmor Shiru
 * Ladonai` recordings should stay visible (`R-0903-live-cw-8`). The system
 * could not carry that out for four orders — not because anyone reconsidered
 * it, but because no tool could write one row's status and leave a record
 * that reverses it. `R-0904-live-cw-2` refused the composition that would
 * have faked one: marking through `undo_dedupe_group` and then back-filling a
 * run record would have filed a person's decision under a sweep's id, with a
 * `priorStatus` an operator typed. This is the real thing.
 *
 * ─── the four properties, and where each is enforced ────────────────────────
 * 1. ONE ROW, NAMED. `fileId` only. There is no predicate, no threshold and
 *    no sweep in this file — a human mark is not a search result.
 * 2. THE TARGET STATUS IS ALWAYS PASSED, NEVER DEFAULTED. `toStatus` is
 *    required. The tool does not know what you meant.
 * 3. `priorStatus` IS READ, NOT PASSED. It is taken off the row inside this
 *    operation, and the args interface deliberately exposes no parameter for
 *    it. The field the caller cannot supply is the field that cannot be
 *    invented — an interface that permits the invention IS the invention,
 *    waiting (G4).
 * 4. REVERSIBILITY PRECEDES THE FLIP. The `dedupeRuns` record lands BEFORE
 *    the status write, for the same failure-direction reason `dedupe_library`
 *    orders it that way: a crash between the two leaves a record for a row
 *    that was never hidden, and undoing that is a no-op. The reverse leaves a
 *    hidden row nothing can reach.
 *
 * ─── and it must not read like a sweep ──────────────────────────────────────
 * A future reader who finds this record cold must be able to tell that a
 * person decided it. Three things say so and none of them is prose: the runId
 * is prefixed `human-mark-`, the record carries `decidedBy: "human"` with the
 * ruling id that authorised it, and every row's `groupedBy` reads
 * `"human-mark"` rather than a pass name. `threshold` is `null`, because a
 * decision does not have one — that is not a missing value, it is the
 * absence of a mechanism.
 *
 * The record is a `dedupeRuns` document on purpose: `undo_dedupe_group`'s
 * `runId` mode restores from `rows[].priorStatus`, so the mark is reversible
 * by an already-deployed tool the moment it is written, with nothing new to
 * build and nothing to remember.
 */

const LIBRARY = "library_index"
const SONGS = "songs"
const RUNS = "dedupeRuns"

/** Statuses a row may be marked to. Named, so a typo is a refusal. */
const ALLOWED_STATUSES = ["active", "duplicate", "archived"] as const

export interface MarkChartStatusArgs {
    /** The one row this decision is about. */
    fileId?: string
    /** REQUIRED. The status to write. Never defaulted. */
    toStatus?: string
    /**
     * The row that survives, when this mark hides one of a pair. Recorded so
     * a later reader can see WHY this row was hidden, exactly as a sweep's
     * record does. Context only — this tool never writes the canonical row.
     */
    canonicalFileId?: string
    /** The ruling that authorised the decision, e.g. `R-0903-live-cw-8`. */
    ruling?: string
    /** Why, in the decider's words. Recorded verbatim. */
    reason?: string
    /** F-05 standing rule: report without writing, and never needs `force`. */
    dryRun?: boolean
    /** F-05: a real write requires this. */
    force?: boolean
}

export interface MarkChartStatusResult {
    fileId: string
    name: string | null
    fromStatus: string | null
    toStatus: string
    /** Read off the row, in this operation. Identical to `fromStatus`. */
    priorStatus: string | null
    canonicalFileId: string | null
    ruling: string | null
    /** The `dedupeRuns/{runId}` to hand `undo_dedupe_group`. */
    runId: string | null
    songMirrored: boolean
    dryRun: boolean
    /** F-05: true when a real write was asked for without `force`. */
    refused?: boolean
    /** Present when the row already reads `toStatus` — nothing was written. */
    noop?: string
}

/**
 * Mark ONE library row to a named status, recording that a person decided it.
 */
export async function markChartStatus(
    uid: string,
    args: MarkChartStatusArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<MarkChartStatusResult | RichErrorEnvelope> {
    const fileId = typeof args.fileId === "string" ? args.fileId.trim() : ""
    const toStatus =
        typeof args.toStatus === "string" ? args.toStatus.trim() : ""
    const dryRun = args.dryRun === true
    const force = args.force === true

    if (!fileId) {
        return richError(
            "file_id_required",
            "mark_chart_status marks one named row. Pass `fileId`.",
            {},
            "Find the row with search_library or list_library, then pass its fileId.",
        )
    }
    if (!toStatus) {
        return richError(
            "to_status_required",
            "mark_chart_status will not guess a target status. Pass `toStatus` explicitly.",
            { allowed: ALLOWED_STATUSES },
            "Pass `toStatus: \"duplicate\"` to hide a row, or `\"active\"` to show it.",
        )
    }
    if (!(ALLOWED_STATUSES as readonly string[]).includes(toStatus)) {
        return richError(
            "to_status_invalid",
            `\`${toStatus}\` is not a status this catalog uses.`,
            { toStatus, allowed: ALLOWED_STATUSES },
            "Use one of `active`, `duplicate`, `archived`.",
        )
    }

    try {
        initAdmin()
        const db = getFirestore()

        // Same admin gate as the rest of the hygiene family. This tool writes
        // a status; it is never a read-anywhere browse path.
        const userSnap = await db.collection("users").doc(uid).get()
        const role = userSnap.exists
            ? (userSnap.data()?.role as string | undefined)
            : undefined
        if (role !== "admin") {
            return richError(
                "forbidden_role",
                "mark_chart_status is admin-only.",
                { callerRole: role ?? null, requiredRoles: ["admin"] },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

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
            // A mark must not cross tenants, for the same reason a scan must
            // not. Answered as an absence so the caller learns nothing about
            // another org's catalog.
            return richError(
                "row_not_found",
                `No library_index row \`${fileId}\`.`,
                { fileId },
                "Check the fileId with search_library or list_library.",
            )
        }

        // (3) READ, not passed. This is the only place the prior status comes
        // from, and there is no argument that could override it.
        const priorStatus = (data.status as string | undefined) ?? null
        const name = (data.name as string | undefined) ?? null

        if (priorStatus === toStatus) {
            // Honest idempotence: say the row already reads that way rather
            // than writing a record describing a change that did not happen.
            return {
                fileId,
                name,
                fromStatus: priorStatus,
                toStatus,
                priorStatus,
                canonicalFileId: args.canonicalFileId ?? null,
                ruling: args.ruling ?? null,
                runId: null,
                songMirrored: false,
                dryRun,
                noop: `row already reads \`${toStatus}\` — nothing written, and no record created for a change that did not happen`,
            }
        }

        const songSnap = await db.collection(SONGS).doc(fileId).get()

        if (dryRun || !force) {
            return {
                fileId,
                name,
                fromStatus: priorStatus,
                toStatus,
                priorStatus,
                canonicalFileId: args.canonicalFileId ?? null,
                ruling: args.ruling ?? null,
                runId: null,
                songMirrored: songSnap.exists,
                dryRun,
                ...(dryRun ? {} : { refused: true }),
            }
        }

        // The real timestamp, always. A human mark never borrows or back-dates
        // a runId: filing a decision under an old sweep's id is how it stops
        // being legible as a decision.
        const at = new Date().toISOString()
        const runId = `human-mark-${at.replace(/[:.]/g, "-")}-${fileId.slice(0, 12)}`

        // Exactly the row shape a sweep writes, so `undo_dedupe_group` reads
        // it with no special case. What differs is `groupedBy`, deliberately.
        const row: DedupeRunRow = {
            fileId,
            priorStatus,
            canonicalFileId: args.canonicalFileId ?? "",
            // Not a pass. This is the row-level marker that keeps a decision
            // from reading like a sweep result.
            groupedBy: "human-mark",
        }
        const record: DedupeRunRecord = {
            runId,
            at,
            // A decision has no threshold. Null is the absence of a
            // mechanism, not a missing number.
            threshold: null,
            actorUid: uid,
            orgId: org,
            groupsFound: 0,
            marked: 1,
            rows: [row],
            decidedBy: "human",
            ...(args.ruling ? { ruling: args.ruling } : {}),
            ...(args.reason ? { reason: args.reason } : {}),
        }

        // (4) The record lands FIRST. Reversibility precedes hiding.
        await db.collection(RUNS).doc(runId).set(record)

        const batch = db.batch()
        batch.update(db.collection(LIBRARY).doc(fileId), {
            priorStatus,
            dedupeRunId: runId,
            status: toStatus,
            dedupedAt: at,
        })
        if (songSnap.exists) {
            batch.update(db.collection(SONGS).doc(fileId), {
                priorStatus,
                dedupeRunId: runId,
                status: toStatus,
            })
        }
        await batch.commit()

        logger.info("mark_chart_status", {
            fileId,
            fromStatus: priorStatus,
            toStatus,
            runId,
            ruling: args.ruling ?? null,
            actorUid: uid,
        })

        return {
            fileId,
            name,
            fromStatus: priorStatus,
            toStatus,
            priorStatus,
            canonicalFileId: args.canonicalFileId ?? null,
            ruling: args.ruling ?? null,
            runId,
            songMirrored: songSnap.exists,
            dryRun: false,
        }
    } catch (err) {
        logger.error("mark_chart_status failed", { err, fileId })
        return richError(
            "mark_failed",
            err instanceof Error ? err.message : String(err),
            { fileId },
            "Re-read the row with get_chart_status; if the record exists without the flip, the row was never hidden and the record is a harmless no-op.",
        )
    }
}
