import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import {
    computeHealRowMetadata,
    buildHealRowCreatedEvent,
    inferChartExt,
    type HealRowMetadata,
} from "@/lib/chart-heal"
import { downloadFromStoragePath } from "@/lib/firebase-storage"
import {
    buildDefaultDeps,
    enrichLibraryRow,
} from "@/lib/library/ai-enrichment"
import { logger } from "@/lib/logger"

/**
 * One-time backfill tool — storage-recovery Lane B follow-up.
 *
 * The 271 Shireinu rows healed before the chart-heal.ts metadata fix landed
 * (master @ 60aedd6be) carry bytes + status:'active' but are MISSING the
 * derived dedup/search fields (`normalizedName` / `stem` / `titleSpecificity`)
 * and never got an AI enrichment pass (`enrichmentStatus` unset, no
 * `library.row.created` ever fired for them). That leaves them invisible to
 * fuzzy-dedup (`library-upload.ts` ranges on `normalizedName`) and to the
 * Gemini enrichment subscriber. coder-1 §3 + auditor-044/045 flagged it;
 * Daniel approved the follow-up.
 *
 * This tool, given a single already-healed `fileId`, recomputes the four
 * fields via the SHARED `computeHealRowMetadata` helper (so the keys match
 * the forward heal path + the upload path exactly) and — on commit — fires
 * the enrichment pass deterministically (awaited, not fire-and-forget) so the
 * operator script gets a real per-row outcome and the serverless function
 * never spins down mid-enrichment.
 *
 * Per-fileId (not batch) so the operator script paginates + stays resumable,
 * mirroring `scripts/heal-run-from-plan.ts`. Admin-only (it spends Gemini
 * tokens + mutates the curated catalog). F-05: `dryRun` defaults true and
 * returns the computed plan WITHOUT writing or enriching.
 */

export interface BackfillHealMetadataArgs {
    /** The healed library_index row's fileId (from heal-run-report.json). */
    fileId: string
    /** When true (default), compute + return the plan without writing/enriching. */
    dryRun?: boolean
}

export interface BackfillHealMetadataOk {
    ok: true
    fileId: string
    name: string
    dryRun: boolean
    action: "would-stamp" | "stamped" | "skipped"
    /** Populated when action === 'skipped'. */
    reason?: string
    /** The recomputed fields (would-be on dryRun, applied on commit). */
    computed: HealRowMetadata
    /** What the row already carried, for drift visibility. */
    prior: {
        normalizedName: string | null
        stem: string | null
        titleSpecificity: number | null
        enrichmentStatus: string | null
    }
    /** Final enrichmentStatus after the enrichment pass (commit only). */
    enrichmentStatus?: string
    /** Whether the enrichment pass actually ran (commit only). */
    enrichment?: "ran" | "skipped_no_bytes"
}

export type BackfillHealMetadataResult =
    | BackfillHealMetadataOk
    | RichErrorEnvelope

export async function backfillHealMetadata(
    uid: string,
    args: BackfillHealMetadataArgs,
): Promise<BackfillHealMetadataResult> {
    const dryRun = args?.dryRun !== false
    const fileId = args?.fileId

    if (!fileId || typeof fileId !== "string") {
        return richError(
            "invalid_argument",
            "fileId is required and must be a string.",
            { argument: "fileId", errorCode: 422 },
            "Pass a healed library_index row id (from heal-run-report.json action:'healed').",
        )
    }

    try {
        initAdmin()
        const db = getFirestore()

        const role = await readUserRole(db, uid)
        if (role !== "admin") {
            return forbiddenRoleEnvelope({
                callerRole: role ?? null,
                requiredRoles: ["admin"],
                message: "backfill_heal_metadata is admin-only.",
                hint: "Ask an admin to run the heal-metadata backfill.",
                context: { fileId },
            })
        }

        const ref = db.collection("library_index").doc(fileId)
        const snap = await ref.get()
        if (!snap.exists) {
            return richError(
                "row_not_found",
                `library_index/${fileId} does not exist.`,
                { fileId, errorCode: 422 },
                "Verify the fileId via list_library or the heal-run-report.json manifest.",
            )
        }
        const data = snap.data() ?? {}
        const title =
            (typeof data.name === "string" && data.name) ||
            (typeof data.title === "string" && data.title) ||
            fileId
        const collection =
            typeof data.collection === "string" ? data.collection : "uploads"
        const mimeType =
            typeof data.mimeType === "string" ? data.mimeType : "application/pdf"
        const status = typeof data.status === "string" ? data.status : null

        const prior = {
            normalizedName:
                typeof data.normalizedName === "string"
                    ? data.normalizedName
                    : null,
            stem: typeof data.stem === "string" ? data.stem : null,
            titleSpecificity:
                typeof data.titleSpecificity === "number"
                    ? data.titleSpecificity
                    : null,
            enrichmentStatus:
                typeof data.enrichmentStatus === "string"
                    ? data.enrichmentStatus
                    : null,
        }

        // Only stamp rows that are actually healed (active + have bytes). An
        // orphaned row needs a real heal first (salvage_chart_bytes /
        // finalize_chart_upload), not a metadata backfill — refuse to paper
        // over a missing-bytes row with dedup metadata.
        if (status !== "active") {
            return {
                ok: true,
                fileId,
                name: title,
                dryRun,
                action: "skipped",
                reason: `row status is '${status ?? "unset"}' (expected 'active') — heal the bytes before backfilling metadata`,
                computed: await computeHealRowMetadata(db, fileId, title),
                prior,
            }
        }

        const computed = await computeHealRowMetadata(db, fileId, title)

        if (dryRun) {
            return {
                ok: true,
                fileId,
                name: title,
                dryRun: true,
                action: "would-stamp",
                computed,
                prior,
            }
        }

        // ─── Commit: stamp the four fields ─────────────────────────────────
        await ref.set(
            {
                normalizedName: computed.normalizedName,
                stem: computed.stem,
                titleSpecificity: computed.titleSpecificity,
                enrichmentStatus: computed.enrichmentStatus,
            },
            { merge: true },
        )

        // ─── Trigger AI enrichment on the recovered bytes ──────────────────
        // Derive the canonical Storage path the heal wrote to (heal does not
        // stamp storageUrl) and download the bytes once. Reuse them for both
        // the contentHash (cache key) and the model call by injecting a
        // fetchBytes override so we never double-download.
        const storagePath = `library/${fileId}${inferChartExt(mimeType)}`
        const dl = await downloadFromStoragePath(storagePath)
        if (!dl.success) {
            // Fields are stamped; bytes unreadable → leave at 'pending' so a
            // later cron/retrigger can enrich. Report it rather than failing.
            logger.warn(
                `[mcp] backfill_heal_metadata: stamped ${fileId} but bytes unreadable at ${storagePath}; enrichment skipped`,
            )
            return {
                ok: true,
                fileId,
                name: title,
                dryRun: false,
                action: "stamped",
                computed,
                prior,
                enrichmentStatus: "pending",
                enrichment: "skipped_no_bytes",
            }
        }
        const buffer = dl.data.buffer

        const event = buildHealRowCreatedEvent({
            fileId,
            title,
            collection,
            mimeType,
            buffer,
            uid,
            storagePath,
        })
        // enrichLibraryRow is fail-open (never throws); await it so the pass
        // completes within the request lifetime. Inject the already-downloaded
        // buffer as fetchBytes to avoid a second Storage round-trip.
        const deps = buildDefaultDeps()
        await enrichLibraryRow(event, {
            ...deps,
            fetchBytes: async () => buffer,
        })

        const after = (await ref.get()).data() ?? {}
        const enrichmentStatus =
            typeof after.enrichmentStatus === "string"
                ? after.enrichmentStatus
                : "pending"

        logger.info("[mcp] backfill_heal_metadata committed", {
            uid,
            fileId,
            stem: computed.stem,
            titleSpecificity: computed.titleSpecificity,
            enrichmentStatus,
        })

        return {
            ok: true,
            fileId,
            name: title,
            dryRun: false,
            action: "stamped",
            computed,
            prior,
            enrichmentStatus,
            enrichment: "ran",
        }
    } catch (err) {
        logger.warn(
            `[mcp] backfill_heal_metadata failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "internal_error",
            "Failed to backfill heal metadata.",
            { fileId, tool: "backfill_heal_metadata" },
            "Retry; if the failure persists check Firestore + Storage IAM.",
        )
    }
}
