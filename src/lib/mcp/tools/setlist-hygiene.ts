/**
 * Cycle-2 SEC-004 — admin-only one-shot backfill that classifies every
 * existing setlist as `isTest:true|false` using the shared
 * `isTestSetlist` predicate.
 *
 * Forward fix lives in `createSetlistServerSide`: every new setlist
 * stamps `isTest` at write time, so /perform's public listing can rely
 * on the field. Legacy rows (everything created before the SEC-004
 * commit) need a one-shot pass to flip the field on; this tool is that
 * pass.
 *
 * Properties:
 *  - Admin-only at the function layer (reads `users/{uid}.role`).
 *  - Defaults `dryRun:true` per F-05 dry-run-is-observability.
 *  - `force:true` required for writes; a real run without force returns
 *    the plan with `refused:true` and no writes.
 *  - Idempotent — a second `force:true` run on a fully-classified
 *    library reports `rowsChanged:0`.
 */

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { isTestSetlist } from "@/types/models"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"

export interface BackfillSetlistTestFlagArgs {
    dryRun?: boolean
    force?: boolean
}

export interface BackfillSetlistTestFlagDelta {
    setlistId: string
    name: string | null
    ownerId: string | null
    from: boolean | null
    to: boolean
}

export interface BackfillSetlistTestFlagResult {
    scanned: number
    rowsChanged: number
    flaggedTest: number
    flaggedReal: number
    /** Up to 500 row blocks; large libraries truncate without losing totals. */
    deltas: BackfillSetlistTestFlagDelta[]
    deltasTruncated: boolean
    dryRun: boolean
}

const BACKFILL_DELTA_REPORT_CAP = 500

export async function backfillSetlistTestFlag(
    uid: string,
    args: BackfillSetlistTestFlagArgs = {},
): Promise<BackfillSetlistTestFlagResult | RichErrorEnvelope> {
    const dryRun = args.dryRun !== false
    const force = args.force === true

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
                "backfill_setlist_test_flag is admin-only.",
                {
                    callerRole: role ?? null,
                    requiredRoles: ["admin"],
                },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            )
        }

        if (!dryRun && !force) {
            // Cycle-3 REG-003: real-run without force returns the rich
            // `force_required` envelope carrying the dry-run plan in
            // extras. F-05 standing rule preserved.
            const planOnly = await backfillSetlistTestFlag(uid, { dryRun: true })
            if ("ok" in planOnly && planOnly.ok === false) return planOnly
            return richError(
                "force_required",
                "Pass force:true to commit backfill_setlist_test_flag writes.",
                {
                    dryRunPlan: planOnly as BackfillSetlistTestFlagResult,
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }

        const snap = await db.collection("setlists").get()

        const deltas: BackfillSetlistTestFlagDelta[] = []
        let flaggedTest = 0
        let flaggedReal = 0

        for (const d of snap.docs) {
            const data = d.data()
            const name =
                typeof data.name === "string" ? data.name : null
            const ownerId =
                typeof data.ownerId === "string" ? data.ownerId : null
            const desired = isTestSetlist({ name, ownerId })
            const currentRaw = data.isTest
            const current =
                currentRaw === true ? true : currentRaw === false ? false : null
            if (current !== desired) {
                deltas.push({
                    setlistId: d.id,
                    name,
                    ownerId,
                    from: current,
                    to: desired,
                })
                if (desired) flaggedTest++
                else flaggedReal++
            }
        }

        if (dryRun) {
            return {
                scanned: snap.size,
                rowsChanged: deltas.length,
                flaggedTest,
                flaggedReal,
                deltas: deltas.slice(0, BACKFILL_DELTA_REPORT_CAP),
                deltasTruncated: deltas.length > BACKFILL_DELTA_REPORT_CAP,
                dryRun: true,
            }
        }

        const BATCH_MAX = 400
        for (let i = 0; i < deltas.length; i += BATCH_MAX) {
            const batch = db.batch()
            for (const delta of deltas.slice(i, i + BATCH_MAX)) {
                batch.update(
                    db.collection("setlists").doc(delta.setlistId),
                    { isTest: delta.to },
                )
            }
            await batch.commit()
        }

        return {
            scanned: snap.size,
            rowsChanged: deltas.length,
            flaggedTest,
            flaggedReal,
            deltas: deltas.slice(0, BACKFILL_DELTA_REPORT_CAP),
            deltasTruncated: deltas.length > BACKFILL_DELTA_REPORT_CAP,
            dryRun: false,
        }
    } catch (err) {
        logger.warn("[mcp] backfill_setlist_test_flag failed:", err)
        return richError(
            "server_error",
            "Failed to run setlist isTest backfill.",
            { tool: "backfill_setlist_test_flag" },
            "Retry; if the failure persists check Firestore IAM and the [mcp] logs.",
        )
    }
}
