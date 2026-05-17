import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    aggregateCorrectionSignals,
    readCorrectionStats,
    type CorrectionStats,
} from "@/lib/library/correction-signals"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"

/**
 * Cycle-3 c3 — `get_correction_stats` admin MCP tool.
 *
 * Surfaces the latest aggregate of `aiCorrectionSignals` (or computes a
 * windowed slice on demand) for human inspection in Claude Desktop.
 * Future c4-class auto-tuner reads the same shape to deterministically
 * propose threshold adjustments — this tool is its observation window.
 *
 * Auth: admin-only. Same gate as c2's ai-config tools so the surface
 * concerns (knobs + signals + future tuning) live behind one role.
 *
 * Behavior:
 *  - Default (`since`/`until` both omitted): reads
 *    `aiCorrectionStats/latest` (last cron pass). If the cron hasn't
 *    populated it yet, runs an inline aggregation and returns the
 *    result, but does NOT persist it — the cron is the canonical writer.
 *  - Windowed (`since`/`until` supplied): runs an on-demand aggregation
 *    over the supplied range. Never persisted. Capped at
 *    `aiCorrectionSignals` scan limit (5000) — `truncated: true` surfaces
 *    when hit.
 *
 * Read-only — no writes. F-05 dryRun/force not applicable.
 */

const SINCE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

export interface GetCorrectionStatsArgs {
    /** ISO-8601 UTC lower bound (inclusive). Omit for "use latest cron snapshot". */
    since?: string
    /** ISO-8601 UTC upper bound (exclusive). Omit for "up to now". */
    until?: string
}

export interface GetCorrectionStatsResult extends CorrectionStats {
    ok: true
    /** True when the response came from a windowed on-demand aggregation rather than the cron snapshot. */
    onDemand: boolean
    /** True when no cron snapshot exists yet AND no window was supplied — counters are still computed inline so callers always get a concrete shape. */
    snapshotMissing?: true
}

async function assertAdmin(
    uid: string,
): Promise<{ ok: true } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message: "get_correction_stats requires an admin account.",
        hint: "Ask an admin to elevate your account; correction signals contain per-uid review attribution.",
    })
}

function validateIso(label: string, value: string): RichErrorEnvelope | null {
    if (!SINCE_ISO_RE.test(value)) {
        return richError(
            "invalid_argument",
            `\`${label}\` must be an ISO-8601 UTC timestamp like '2026-05-18T00:00:00Z'.`,
            { [label]: value },
            "Use Date.prototype.toISOString() or a YYYY-MM-DDTHH:MM:SSZ literal.",
        )
    }
    return null
}

export async function getCorrectionStats(
    uid: string,
    args: GetCorrectionStatsArgs = {},
): Promise<GetCorrectionStatsResult | RichErrorEnvelope> {
    const gate = await assertAdmin(uid)
    if (!gate.ok) return gate

    if (args.since !== undefined) {
        const err = validateIso("since", args.since)
        if (err) return err
    }
    if (args.until !== undefined) {
        const err = validateIso("until", args.until)
        if (err) return err
    }
    if (args.since && args.until && args.since >= args.until) {
        return richError(
            "invalid_argument",
            "`since` must be strictly before `until`.",
            { since: args.since, until: args.until },
            "Pass `since` < `until` (lexicographic comparison on ISO-8601 UTC works).",
        )
    }

    try {
        const db = getFirestore()

        if (args.since === undefined && args.until === undefined) {
            const snapshot = await readCorrectionStats(db)
            if (snapshot) {
                return { ok: true, onDemand: false, ...snapshot }
            }
            // No cron snapshot yet. Aggregate inline so callers see a
            // concrete shape (zero counters everywhere) rather than null.
            const fresh = await aggregateCorrectionSignals(db)
            return {
                ok: true,
                onDemand: true,
                snapshotMissing: true,
                ...fresh,
            }
        }

        const windowed = await aggregateCorrectionSignals(db, {
            since: args.since,
            until: args.until,
        })
        return { ok: true, onDemand: true, ...windowed }
    } catch (err) {
        logger.warn(
            `[mcp] get_correction_stats failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "correction_stats_read_failed",
            `Failed to read correction stats: ${err instanceof Error ? err.message : String(err)}`,
            {},
            "Check Firestore connectivity; the snapshot lives at aiCorrectionStats/latest and signals at aiCorrectionSignals/*.",
        )
    }
}
