import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { classifyService } from "@/lib/history/classify"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { updateRowsIfUnchanged } from "./backfill-conditional-write"

/**
 * `backfill_setlist_service_class` — store `serviceType`, `rabbiSlot` and
 * `special` on the caller's org's existing setlists, from `classifyService`
 * (the same read-time inference history uses). Only fields that are unset
 * are written, so an author's value is never replaced; an inferred null
 * (unknown service type or rabbi) is not written, it stays inferred.
 *
 * F-05: `dryRun` defaults true and returns the full report; a real run needs
 * `dryRun: false, force: true`. Each setlist is updated (never set) with a
 * lastUpdateTime precondition; one edited or deleted mid-run is counted in
 * `skipped.changedDuringRun` and left alone. Admin + band_leader. Ops surface.
 */

export interface BackfillServiceClassArgs {
    dryRun?: boolean
    force?: boolean
}

export interface ServiceClassChange {
    setlistId: string
    name: string
    /** Only the fields this run writes. */
    patch: { serviceType?: string; rabbiSlot?: string; special?: boolean }
}

export type BackfillServiceClassResult = {
    ok: true
    dryRun: boolean
    scanned: number
    changed: ServiceClassChange[]
    skipped: { alreadySet: number; changedDuringRun: number }
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

function unset(v: unknown): boolean {
    return v === undefined || v === null
}

export async function backfillSetlistServiceClass(
    uid: string,
    args: BackfillServiceClassArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<BackfillServiceClassResult | RichErrorEnvelope> {
    const dryRun = args?.dryRun !== false
    const force = args?.force === true

    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        // Whole-collection read filtered by rowOrg: a legacy setlist with no
        // orgId belongs to crc, which an orgId equality query would miss.
        const snap = await db.collection("setlists").get()
        const docs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)

        let alreadySet = 0
        const changed: ServiceClassChange[] = []
        const updateTimes = new Map<string, (typeof docs)[number]["updateTime"]>()
        for (const d of docs) {
            const data = d.data()
            const name = typeof data.name === "string" ? data.name : ""
            const cls = classifyService({
                name,
                templateType: str(data.templateType),
                rabbi: str(data.rabbi),
            })
            const patch: ServiceClassChange["patch"] = {}
            if (unset(data.serviceType) && cls.serviceType) patch.serviceType = cls.serviceType
            if (unset(data.rabbiSlot) && cls.rabbiSlot) patch.rabbiSlot = cls.rabbiSlot
            if (typeof data.special !== "boolean") patch.special = cls.special
            if (Object.keys(patch).length === 0) {
                alreadySet++
                continue
            }
            changed.push({ setlistId: d.id, name, patch })
            updateTimes.set(d.id, d.updateTime)
        }

        const report: BackfillServiceClassResult = {
            ok: true,
            dryRun,
            scanned: docs.length,
            changed,
            skipped: { alreadySet, changedDuringRun: 0 },
        }
        if (dryRun) return report
        if (!force) {
            return richError(
                "force_required",
                "backfill_setlist_service_class requires force:true to commit.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run report, then re-call with { dryRun: false, force: true }.",
            )
        }

        const { changedDuringRun } = await updateRowsIfUnchanged(
            db,
            changed.map((c) => ({
                fileId: c.setlistId,
                updateTime: updateTimes.get(c.setlistId),
                patch: c.patch,
            })),
            "setlists",
        )
        return {
            ...report,
            changed: changed.filter((c) => !changedDuringRun.has(c.setlistId)),
            skipped: { alreadySet, changedDuringRun: changedDuringRun.size },
        }
    } catch (error) {
        logger.warn("backfill_setlist_service_class failed:", error)
        return richError(
            "internal_error",
            "backfill_setlist_service_class failed.",
            { errorCode: 500 },
            "Retry the dry run; nothing is written until a forced real run.",
        )
    }
}
