import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { updateRowsIfUnchanged } from "./backfill-conditional-write"

/**
 * `backfill_library_keys` — fill an empty library `key` (the chart's WRITTEN
 * key) from the chart's own AI reading, `aiSuggestion.suggested_key`, when
 * that reading's confidence is at least 0.9. Never from setlist usage: the
 * key a band played is not the key the chart is written in.
 *
 * Writes only a reading the AI itself was sure of: `is_chart === true`, no
 * `review_required`, and a plain key (`/^[A-G][#b]?m?$/`). Skips, and counts:
 *   - human:      a row a person curated (`human_curated`)
 *   - rejected:   a row a person rejected (`human_rejected`)
 *   - reviewHeld: a row waiting in the review queue (`review_pending`), or a
 *                 reading that flagged `review_required`
 *   - hasKey / noSuggestion / notChart / badKey / lowConfidence
 *   - changedDuringRun: a row edited or deleted between scan and write
 * `minConfidence` can raise the floor, never lower it below 0.9. F-05:
 * `dryRun` defaults true and returns the full report; a real run needs
 * `dryRun: false, force: true`, and updates only `key` and
 * `keySource: 'ai_backfill'`. Admin + band_leader, caller's org only.
 */

export const KEY_BACKFILL_CONFIDENCE_FLOOR = 0.9
const PLAIN_KEY_RE = /^[A-G][#b]?m?$/

export interface BackfillLibraryKeysArgs {
    dryRun?: boolean
    force?: boolean
    /** default 0.9, floor 0.9 */
    minConfidence?: number
}

export interface KeyChange {
    fileId: string
    name: string
    key: string
    confidence: number
}

export interface KeyBackfillSkips {
    human: number
    rejected: number
    reviewHeld: number
    lowConfidence: number
    noSuggestion: number
    notChart: number
    badKey: number
    hasKey: number
    changedDuringRun: number
}

export async function backfillLibraryKeys(
    uid: string,
    args: BackfillLibraryKeysArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | { ok: true; dryRun: boolean; scanned: number; changed: KeyChange[]; skipped: KeyBackfillSkips }
    | RichErrorEnvelope
> {
    const dryRun = args?.dryRun !== false
    const force = args?.force === true
    const requested =
        typeof args?.minConfidence === "number" && Number.isFinite(args.minConfidence)
            ? args.minConfidence
            : KEY_BACKFILL_CONFIDENCE_FLOOR
    const minConfidence = Math.min(1, Math.max(KEY_BACKFILL_CONFIDENCE_FLOOR, requested))

    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        // Same scoping as list_library / reconcile_library: whole collection,
        // filtered by rowOrg (a legacy row with no orgId is crc's).
        const snap = await db.collection("library_index").get()
        const docs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)

        const skipped: KeyBackfillSkips = {
            human: 0,
            rejected: 0,
            reviewHeld: 0,
            lowConfidence: 0,
            noSuggestion: 0,
            notChart: 0,
            badKey: 0,
            hasKey: 0,
            changedDuringRun: 0,
        }
        const changed: KeyChange[] = []
        const updateTimes = new Map<string, (typeof docs)[number]["updateTime"]>()
        for (const d of docs) {
            const data = d.data()
            if (data.enrichmentStatus === "human_curated") {
                skipped.human++
                continue
            }
            if (data.enrichmentStatus === "human_rejected") {
                skipped.rejected++
                continue
            }
            if (typeof data.key === "string" && data.key.trim()) {
                skipped.hasKey++
                continue
            }
            const sug = data.aiSuggestion as
                | { suggested_key?: unknown; confidence?: unknown; is_chart?: unknown; review_required?: unknown }
                | null
                | undefined
            if (data.enrichmentStatus === "review_pending" || sug?.review_required === true) {
                skipped.reviewHeld++
                continue
            }
            const key =
                sug && typeof sug.suggested_key === "string" ? sug.suggested_key.trim() : ""
            if (!key) {
                skipped.noSuggestion++
                continue
            }
            if (sug?.is_chart !== true) {
                skipped.notChart++
                continue
            }
            if (!PLAIN_KEY_RE.test(key)) {
                skipped.badKey++
                continue
            }
            const confidence = typeof sug.confidence === "number" ? sug.confidence : 0
            if (confidence < minConfidence) {
                skipped.lowConfidence++
                continue
            }
            const name =
                (typeof data.name === "string" && data.name) ||
                (typeof data.title === "string" && data.title) ||
                d.id
            changed.push({ fileId: d.id, name, key, confidence })
            updateTimes.set(d.id, d.updateTime)
        }

        if (dryRun) return { ok: true, dryRun, scanned: docs.length, changed, skipped }
        if (!force) {
            return richError(
                "force_required",
                "backfill_library_keys requires force:true to commit.",
                { dryRunPlan: { ok: true, dryRun: false, scanned: docs.length, changed, skipped } },
                "Review the dry-run report, then re-call with { dryRun: false, force: true }.",
            )
        }

        const { changedDuringRun } = await updateRowsIfUnchanged(
            db,
            changed.map((c) => ({
                fileId: c.fileId,
                updateTime: updateTimes.get(c.fileId),
                patch: { key: c.key, keySource: "ai_backfill" },
            })),
        )
        skipped.changedDuringRun = changedDuringRun.size
        return {
            ok: true,
            dryRun,
            scanned: docs.length,
            changed: changed.filter((c) => !changedDuringRun.has(c.fileId)),
            skipped,
        }
    } catch (error) {
        logger.warn("backfill_library_keys failed:", error)
        return richError(
            "internal_error",
            "backfill_library_keys failed.",
            { errorCode: 500 },
            "Retry the dry run; nothing is written until a forced real run.",
        )
    }
}
