import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { proposeLineagePairs, type LineageCandidateRow, type LineagePair, type LineageProposal } from "@/lib/library/lineage-pure"
import { STANDING_COLLECTION } from "@/lib/profiles/standing"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { updateRowsIfUnchanged } from "./backfill-conditional-write"

/**
 * `backfill_chart_lineage` (bet 2, ops) — propose lineage links for obvious
 * siblings that are really versions of one chart: active rows of the caller's
 * org that share a partGroup and instrument part once version markers
 * ("v2", "updated", "DRAFT", "(updated PDF)", a date) are removed, and
 * differ only by those markers. Oldest upload first.
 *
 * F-05: `dryRun` defaults true and lists the pairs; a real run needs
 * `dryRun: false, force: true`. A real run writes the lineage fields only
 * (`lineageId`, `supersedes` / `supersededBy`, the first version's
 * `partGroup` on the later ones) with a lastUpdateTime precondition, and
 * moves standing choices to each chain's newest version. It does not archive
 * a row or touch a setlist: memory recalls the newest version from then on,
 * and every setlist keeps its chart. Admin + band_leader.
 */

export interface BackfillChartLineageArgs {
    dryRun?: boolean
    force?: boolean
}

export interface BackfillChartLineageReport {
    ok: true
    dryRun: boolean
    scanned: number
    pairs: LineagePair[]
    ambiguous: LineageProposal["ambiguous"]
    skipped: { changedDuringRun: number }
    standingMoved: number
    failed: Array<{ id: string; message: string }>
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v : null
}

/** Merge the pairs into one patch per row (a middle version gets both fields). */
export function lineagePatches(pairs: LineagePair[]): Map<string, Record<string, unknown>> {
    const out = new Map<string, Record<string, unknown>>()
    const patch = (id: string) => {
        const p = out.get(id) ?? {}
        out.set(id, p)
        return p
    }
    for (const pr of pairs) {
        Object.assign(patch(pr.from.fileId), { lineageId: pr.lineageId, supersededBy: pr.to.fileId })
        Object.assign(patch(pr.to.fileId), { lineageId: pr.lineageId, supersedes: pr.from.fileId, partGroup: pr.partGroup })
    }
    return out
}

/** Each version's chain tip (the newest version), from the pairs. */
export function chainTips(pairs: LineagePair[]): Map<string, string> {
    const next = new Map(pairs.map((p) => [p.from.fileId, p.to.fileId]))
    const out = new Map<string, string>()
    for (const from of next.keys()) {
        let cur = from
        const seen = new Set([cur])
        while (next.has(cur) && !seen.has(next.get(cur)!)) {
            cur = next.get(cur)!
            seen.add(cur)
        }
        out.set(from, cur)
    }
    return out
}

export async function backfillChartLineage(
    uid: string,
    args: BackfillChartLineageArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<BackfillChartLineageReport | RichErrorEnvelope> {
    const dryRun = args?.dryRun !== false
    const force = args?.force === true
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        // Whole-collection read filtered by rowOrg (a legacy row with no orgId is crc).
        const snap = await db.collection("library_index").get()
        const docs = snap.docs.filter((d) => rowOrg(d.data().orgId) === org)
        const rows: LineageCandidateRow[] = docs.map((d) => {
            const x = d.data()
            return {
                fileId: d.id,
                name: str(x.name) ?? str(x.title) ?? "",
                uploadedAt: str(x.uploadedAt) ?? str(x.authoredAt),
                status: str(x.status),
                partGroup: str(x.partGroup),
                lineageId: str(x.lineageId),
                supersedes: str(x.supersedes),
                supersededBy: str(x.supersededBy),
            }
        })
        const proposal = proposeLineagePairs(rows)
        const report: BackfillChartLineageReport = {
            ok: true,
            dryRun,
            scanned: docs.length,
            pairs: proposal.pairs,
            ambiguous: proposal.ambiguous,
            skipped: { changedDuringRun: 0 },
            standingMoved: 0,
            failed: [],
        }
        if (dryRun) return report
        if (!force) {
            return richError(
                "force_required",
                "backfill_chart_lineage requires force:true to commit.",
                { dryRunPlan: { ...report, dryRun: false } },
                "Review the dry-run pairs, then re-call with { dryRun: false, force: true }.",
            )
        }

        const updateTimes = new Map(docs.map((d) => [d.id, d.updateTime]))
        const patches = lineagePatches(proposal.pairs)
        const { changedDuringRun, failed } = await updateRowsIfUnchanged(
            db,
            [...patches.entries()].map(([fileId, patch]) => ({ fileId, updateTime: updateTimes.get(fileId), patch })),
            "library_index",
            { skipFailures: true },
        )
        // A pair is linked only when both of its rows were written.
        const bad = new Set([...changedDuringRun, ...failed.map((f) => f.id)])
        const linked = proposal.pairs.filter((p) => !bad.has(p.from.fileId) && !bad.has(p.to.fileId))

        // Standing choices follow each chain to its newest version.
        let standingMoved = 0
        const tips = chainTips(linked)
        for (const [from, tip] of tips) {
            try {
                const s = await db.collection(STANDING_COLLECTION).where("fileId", "==", from).get()
                for (const d of s.docs) {
                    if (rowOrg(d.data().orgId) !== org) continue
                    await d.ref.update({ fileId: tip, revisedFrom: from })
                    standingMoved++
                }
            } catch (err) {
                failed.push({ id: `standing:${from}`, message: err instanceof Error ? err.message : String(err) })
            }
        }
        return {
            ...report,
            pairs: linked,
            skipped: { changedDuringRun: changedDuringRun.size },
            standingMoved,
            failed,
        }
    } catch (error) {
        logger.warn("backfill_chart_lineage failed:", error)
        return richError(
            "internal_error",
            "backfill_chart_lineage failed.",
            { errorCode: 500 },
            "Retry the dry run; nothing is written until a forced real run.",
        )
    }
}
