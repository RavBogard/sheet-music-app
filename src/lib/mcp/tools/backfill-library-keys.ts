import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"

/**
 * `backfill_library_keys` — fill an empty library `key` (the chart's WRITTEN
 * key) from the chart's own AI reading, `aiSuggestion.suggested_key`, when
 * that reading's confidence is at least 0.9. Never from setlist usage: the
 * key a band played is not the key the chart is written in.
 *
 * Skips, and counts: a row a person curated (`enrichmentStatus:
 * 'human_curated'`), a row that already has a key, a row with no suggested
 * key, and a reading under the confidence floor. `minConfidence` can raise
 * the floor, never lower it below 0.9. F-05: `dryRun` defaults true and
 * returns the full report; a real run needs `dryRun: false, force: true`,
 * and writes only `key` and `keySource: 'ai_backfill'`. Admin + band_leader,
 * caller's org only. Ops surface.
 */

export const KEY_BACKFILL_CONFIDENCE_FLOOR = 0.9
const WRITE_BATCH_MAX = 400

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

export async function backfillLibraryKeys(
    uid: string,
    args: BackfillLibraryKeysArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | {
          ok: true
          dryRun: boolean
          scanned: number
          changed: KeyChange[]
          skipped: { human: number; lowConfidence: number; noSuggestion: number; hasKey: number }
      }
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

        const skipped = { human: 0, lowConfidence: 0, noSuggestion: 0, hasKey: 0 }
        const changed: KeyChange[] = []
        for (const d of docs) {
            const data = d.data()
            if (data.enrichmentStatus === "human_curated") {
                skipped.human++
                continue
            }
            if (typeof data.key === "string" && data.key.trim()) {
                skipped.hasKey++
                continue
            }
            const sug = data.aiSuggestion as
                | { suggested_key?: unknown; confidence?: unknown }
                | null
                | undefined
            const key =
                sug && typeof sug.suggested_key === "string" ? sug.suggested_key.trim() : ""
            if (!key) {
                skipped.noSuggestion++
                continue
            }
            const confidence = typeof sug?.confidence === "number" ? sug.confidence : 0
            if (confidence < minConfidence) {
                skipped.lowConfidence++
                continue
            }
            const name =
                (typeof data.name === "string" && data.name) ||
                (typeof data.title === "string" && data.title) ||
                d.id
            changed.push({ fileId: d.id, name, key, confidence })
        }

        const report = { ok: true as const, dryRun, scanned: docs.length, changed, skipped }
        if (dryRun) return report
        if (!force) {
            return richError(
                "force_required",
                "backfill_library_keys requires force:true to commit.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run report, then re-call with { dryRun: false, force: true }.",
            )
        }

        for (let i = 0; i < changed.length; i += WRITE_BATCH_MAX) {
            const batch = db.batch()
            for (const c of changed.slice(i, i + WRITE_BATCH_MAX)) {
                batch.set(
                    db.collection("library_index").doc(c.fileId),
                    { key: c.key, keySource: "ai_backfill" },
                    { merge: true },
                )
            }
            await batch.commit()
        }
        return report
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
