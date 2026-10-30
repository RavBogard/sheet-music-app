import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { computeSettingPartFields } from "@/lib/library/setting-part"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { updateRowsIfUnchanged } from "./backfill-conditional-write"

/**
 * `backfill_library_setting_parts` — stamp `setting`, `part` and `partGroup`
 * on the caller's org's existing `library_index` rows, from their titles.
 * New writes compute them inline (library-upload, rename, Drive poller,
 * edit_library_entry, heal); this catches the rows that predate that.
 *
 * A row a person set (`settingSource: 'human'`) is never touched. F-05:
 * `dryRun` defaults true and returns the full report; a real run needs
 * `dryRun: false, force: true`. A real run updates (never sets) each row
 * with a lastUpdateTime precondition; a row edited or deleted mid-run is
 * counted in `skipped.changedDuringRun` and left alone. Admin + band_leader.
 * Ops surface.
 */

export interface BackfillLibrarySettingPartsArgs {
    dryRun?: boolean
    force?: boolean
}

export interface SettingPartChange {
    fileId: string
    name: string
    setting: string | null
    part: string | null
    partGroup: string
}

export async function backfillLibrarySettingParts(
    uid: string,
    args: BackfillLibrarySettingPartsArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<
    | {
          ok: true
          dryRun: boolean
          scanned: number
          changed: SettingPartChange[]
          skippedHuman: number
          skipped: { human: number; changedDuringRun: number }
          /** Rows whose write failed for a reason other than a changed row; the run kept going. */
          failed: Array<{ id: string; message: string }>
      }
    | RichErrorEnvelope
> {
    const dryRun = args?.dryRun !== false
    const force = args?.force === true

    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        // Whole-collection read filtered by rowOrg, the same scoping
        // list_library and reconcile_library use: a legacy row with no
        // orgId belongs to crc, which an orgId equality query would miss.
        const snap = await db.collection("library_index").get()
        const docs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)

        let skippedHuman = 0
        const changed: SettingPartChange[] = []
        const updateTimes = new Map<string, (typeof docs)[number]["updateTime"]>()
        for (const d of docs) {
            const data = d.data()
            if (data.settingSource === "human") {
                skippedHuman++
                continue
            }
            const name =
                (typeof data.name === "string" && data.name) ||
                (typeof data.title === "string" && data.title) ||
                ""
            if (!name) continue
            const next = computeSettingPartFields(name)
            const same =
                (data.setting ?? null) === next.setting &&
                (data.part ?? null) === next.part &&
                data.partGroup === next.partGroup
            if (same) continue
            changed.push({ fileId: d.id, name, ...next })
            updateTimes.set(d.id, d.updateTime)
        }

        const report = {
            ok: true as const,
            dryRun,
            scanned: docs.length,
            changed,
            skippedHuman,
            skipped: { human: skippedHuman, changedDuringRun: 0 },
            failed: [] as Array<{ id: string; message: string }>,
        }
        if (dryRun) return report
        if (!force) {
            return richError(
                "force_required",
                "backfill_library_setting_parts requires force:true to commit.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run report, then re-call with { dryRun: false, force: true }.",
            )
        }

        const { changedDuringRun, failed } = await updateRowsIfUnchanged(
            db,
            changed.map((c) => ({
                fileId: c.fileId,
                updateTime: updateTimes.get(c.fileId),
                patch: { setting: c.setting, part: c.part, partGroup: c.partGroup },
            })),
            "library_index",
            { skipFailures: true },
        )
        const failedIds = new Set(failed.map((f) => f.id))
        return {
            ...report,
            changed: changed.filter((c) => !changedDuringRun.has(c.fileId) && !failedIds.has(c.fileId)),
            skipped: { human: skippedHuman, changedDuringRun: changedDuringRun.size },
            failed,
        }
    } catch (error) {
        logger.warn("backfill_library_setting_parts failed:", error)
        return richError(
            "internal_error",
            "backfill_library_setting_parts failed.",
            { errorCode: 500 },
            "Retry the dry run; nothing is written until a forced real run.",
        )
    }
}
