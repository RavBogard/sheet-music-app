import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"

/**
 * `backfill_track_mimetype` — heal the denormalized `mimeType` cache on legacy
 * setlist `tracks` rows (cowork #2/#7; the known [[project_track_mimetype_gotcha]]).
 *
 * Track file-type metadata is ASYMMETRIC by bind path. The in-app chart picker
 * (SetlistGrid handleBindChart) and — since 2026-05-20 — the MCP bind path
 * (add_track_to_setlist / update_track / swap_chart, via `readLibraryMimeType`)
 * both stamp `mimeType` onto the track from its bonded `library_index/{fileId}`
 * row. `queue-utils.toQueueItem` routes a row to the right Perform viewer
 * (PDF / image / MusicXML / text) off that cached `mimeType`. LEGACY rows
 * bonded before those fixes carry NO `mimeType`, so a scraped/text/image chart
 * defaults to the PDF renderer and shows the wrong "sub-attached doc" styling
 * (#7) until the row is re-bonded.
 *
 * This tool scans every `tracks` row that is bonded (`fileId` OR `audioFileId`
 * present — ingest-mutator-matrix FINDING-6: audio-viewer-f7 introduced
 * `audioFileId`-only audio bonds that the legacy `fileId`-only filter missed)
 * but missing `mimeType`, and stamps the value from the bonded `library_index`
 * entry — exactly the same source the live bind paths read. When both fields
 * are present we prefer `fileId` (chart bond — PDFOverlay's primary dispatch
 * key); audio-only rows fall back to `audioFileId`. It does NOT touch the
 * bond, only the denormalized render-routing field.
 *
 * Atomic-guard note ([[feedback_upload_atomicity]]): there is NO Storage write
 * here, so the contract reduces to a merge-set (never clobber sibling track
 * fields) + the per-track Firestore write itself, which IS the broadcast —
 * the setlist's real-time listeners pick up the `updatedAt`/`version` bump.
 * There is deliberately NO `library_signals/latest` broadcast: that channel
 * drives the library CATALOG store, and this backfill changes setlist tracks,
 * not the catalog — signaling it would make library consumers refetch
 * needlessly. The healed value comes from the same authoritative source the
 * row's bond already points at, so a merge-set is idempotent and race-safe
 * (a concurrent bind would write the identical library-derived value).
 *
 * F-05 ([[feedback_dryrun_is_observability]]): `dryRun` defaults TRUE and
 * returns the full would-change report (counts + per-row before/after) without
 * writing; a real run (`dryRun:false`) still requires `force:true` or it
 * returns the plan with `refused:true`. Trusted-leader gated (admin /
 * band_leader via `assertEditor`; [[feedback_mcp_validation_shape]] — the
 * refusal surfaces as a rich `forbidden_role` envelope, never a JSON-RPC
 * error). Idempotent: a second force-run finds zero candidates (every bonded
 * row now carries `mimeType`).
 *
 * ★ Ship the TOOL; the prod RUN is Daniel's single-owner, dryRun-first step
 * ([[feedback_single_owner_destructive_runs]]).
 */

const LIBRARY_READ_CONCURRENCY = 10
const WRITE_BATCH_MAX = 400
const ROW_REPORT_CAP = 500

export interface BackfillTrackMimetypeArgs {
    /** When true (default), return the would-change plan without writing. F-05. */
    dryRun?: boolean
    /** Required for writes. Without it a real run returns refused:true, no writes. */
    force?: boolean
}

/**
 * Which track-side field supplied the `library_index` lookup key for this row.
 * `fileId` is the chart bond (PDF/MusicXML/text/image; PDFOverlay's primary
 * dispatch key); `audioFileId` is the audio bond (audio-viewer-f7 shape,
 * `track.type:'song'` with only an mp3/wav bonded). When both fields are
 * present we prefer `fileId` — the track has a single `mimeType` field and the
 * chart-side mime drives the routing the user actually sees.
 */
export type BondKind = "fileId" | "audioFileId"

export interface HealRow {
    trackId: string
    setlistId: string | null
    title: string | null
    /** The lookup key used to read library_index — either fileId or audioFileId. */
    fileId: string
    /** Which track-side field supplied the lookup key. FINDING-6 observability. */
    bondKind: BondKind
    /** Always null — these are the rows we're healing (missing/empty mimeType). */
    before: null
    /** mimeType resolved from the bonded library_index entry. */
    after: string
}

export interface SkippedRow {
    trackId: string
    fileId: string
    /** Which track-side field supplied the lookup key. FINDING-6 observability. */
    bondKind: BondKind
    /**
     * Why the row can't be healed from the catalog:
     *  - library_entry_not_found  → no library_index/{fileId} doc
     *  - library_entry_no_mimetype → doc exists but carries no usable mimeType
     */
    reason: "library_entry_not_found" | "library_entry_no_mimetype"
}

interface RowReport<T> {
    count: number
    rows: T[]
    truncated: boolean
}

export interface BackfillTrackMimetypeResult {
    ok: true
    scannedTracks: number
    /** Tracks carrying a non-empty `fileId` (bonded to a chart). */
    bondedTracks: number
    /** Bonded tracks that already carry a `mimeType` — nothing to do. */
    alreadyHealthy: number
    /** Bonded + missing-mime rows we CAN heal (the library entry supplies a mimeType). */
    heal: RowReport<HealRow>
    /** Bonded + missing-mime rows we CANNOT heal (the catalog can't supply one). */
    skipped: RowReport<SkippedRow>
    dryRun: boolean
    /** Tracks actually written this call. 0 on dryRun or refused. */
    committed: number
    /** Set when a real run omitted `force` — plan returned, no writes. */
    refused?: boolean
    /**
     * F-008: set true when the caller passed `force:true` but the call still
     * dry-ran — `dryRun` defaults true, so `{force:true}` alone NEVER commits.
     * Flags the force flag as a no-op so the caller doesn't assume a write
     * landed; re-call with `{dryRun:false, force:true}` to actually heal.
     */
    forceWithoutCommit?: boolean
}

function rowReport<T>(rows: T[]): RowReport<T> {
    return {
        count: rows.length,
        rows: rows.slice(0, ROW_REPORT_CAP),
        truncated: rows.length > ROW_REPORT_CAP,
    }
}

interface Candidate {
    trackId: string
    setlistId: string | null
    title: string | null
    /** library_index lookup key — either the row's `fileId` or `audioFileId`. */
    fileId: string
    bondKind: BondKind
}

export async function backfillTrackMimetype(
    uid: string,
    args: BackfillTrackMimetypeArgs = {},
): Promise<BackfillTrackMimetypeResult | RichErrorEnvelope> {
    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        initAdmin()
        const db = getFirestore()

        // Trusted-leader gate — assertEditor returns the rich forbidden_role
        // envelope (assignable to RichErrorEnvelope) on refusal.
        const editor = await assertEditor(db, uid)
        if (!editor.ok) return editor

        // Full scan of the tracks collection. The candidate set is "bonded
        // (fileId present) but no mimeType". Firestore can't express "field
        // absent", so we filter in memory — mirrors reconcile_library's full
        // library_index scan.
        const snap = await db.collection("tracks").get()
        const scannedTracks = snap.size

        let bondedTracks = 0
        let alreadyHealthy = 0
        const candidates: Candidate[] = []
        for (const d of snap.docs) {
            const data = d.data()
            const fileId =
                typeof data.fileId === "string" ? data.fileId.trim() : ""
            // FINDING-6: audio bonds via audio-viewer-f7 may carry only
            // `audioFileId` (no `fileId`). Accept that as a bonded row too.
            // When both are set, prefer `fileId` (chart bond — drives PDFOverlay
            // dispatch off `library_index/{fileId}.mimeType`, which is the
            // mimeType the user actually sees rendered).
            const audioFileId =
                typeof data.audioFileId === "string"
                    ? data.audioFileId.trim()
                    : ""
            const bondKey = fileId || audioFileId
            if (!bondKey) continue // unbonded row — no chart or audio to route; skip
            bondedTracks++
            const mime =
                typeof data.mimeType === "string" ? data.mimeType.trim() : ""
            if (mime) {
                alreadyHealthy++
                continue
            }
            candidates.push({
                trackId: d.id,
                setlistId:
                    typeof data.setlistId === "string" ? data.setlistId : null,
                title: typeof data.title === "string" ? data.title : null,
                fileId: bondKey,
                bondKind: fileId ? "fileId" : "audioFileId",
            })
        }

        // Resolve mimeType once per unique bonded fileId from library_index —
        // the same source the live bind paths read (readLibraryMimeType).
        const uniqueFileIds = [...new Set(candidates.map((c) => c.fileId))]
        const libExists = new Set<string>()
        const mimeByFileId = new Map<string, string | null>()
        for (let i = 0; i < uniqueFileIds.length; i += LIBRARY_READ_CONCURRENCY) {
            const chunk = uniqueFileIds.slice(i, i + LIBRARY_READ_CONCURRENCY)
            const refs = chunk.map((id) =>
                db.collection("library_index").doc(id),
            )
            const docs = await db.getAll(...refs)
            docs.forEach((doc, j) => {
                const id = chunk[j]
                if (doc.exists) libExists.add(id)
                const m = doc.exists ? doc.data()?.mimeType : undefined
                mimeByFileId.set(
                    id,
                    typeof m === "string" && m.trim() ? m.trim() : null,
                )
            })
        }

        const healRows: HealRow[] = []
        const skippedRows: SkippedRow[] = []
        for (const c of candidates) {
            const mime = mimeByFileId.get(c.fileId) ?? null
            if (!mime) {
                skippedRows.push({
                    trackId: c.trackId,
                    fileId: c.fileId,
                    bondKind: c.bondKind,
                    reason: libExists.has(c.fileId)
                        ? "library_entry_no_mimetype"
                        : "library_entry_not_found",
                })
                continue
            }
            healRows.push({
                trackId: c.trackId,
                setlistId: c.setlistId,
                title: c.title,
                fileId: c.fileId,
                bondKind: c.bondKind,
                before: null,
                after: mime,
            })
        }

        // ─── dryRun: plan only, no writes (F-05 dryRun-is-observability) ──────
        if (dryRun) {
            return {
                ok: true,
                scannedTracks,
                bondedTracks,
                alreadyHealthy,
                heal: rowReport(healRows),
                skipped: rowReport(skippedRows),
                dryRun: true,
                committed: 0,
                // F-008: `{force:true}` without `dryRun:false` is a no-op —
                // flag it so the caller knows force didn't write anything.
                ...(force ? { forceWithoutCommit: true } : {}),
            }
        }

        // ─── real run without force → plan + refused:true, still no writes ────
        if (!force) {
            return {
                ok: true,
                scannedTracks,
                bondedTracks,
                alreadyHealthy,
                heal: rowReport(healRows),
                skipped: rowReport(skippedRows),
                dryRun: false,
                committed: 0,
                refused: true,
            }
        }

        // ─── force run: batched merge-set of mimeType + version bump ──────────
        // merge-set so we touch ONLY mimeType (+ the W-04 version/timestamp
        // contract every track write stamps) and never clobber bond fields.
        const nowIso = new Date().toISOString()
        let committed = 0
        for (let i = 0; i < healRows.length; i += WRITE_BATCH_MAX) {
            const slice = healRows.slice(i, i + WRITE_BATCH_MAX)
            const batch = db.batch()
            for (const r of slice) {
                batch.set(
                    db.collection("tracks").doc(r.trackId),
                    {
                        mimeType: r.after,
                        updatedAt: FieldValue.serverTimestamp(),
                        version: FieldValue.increment(1),
                        lastModifiedAt: nowIso,
                    },
                    { merge: true },
                )
            }
            await batch.commit()
            committed += slice.length
        }

        logger.info("[mcp] backfill_track_mimetype committed", {
            uid,
            scannedTracks,
            bondedTracks,
            alreadyHealthy,
            healed: committed,
            skipped: skippedRows.length,
        })

        return {
            ok: true,
            scannedTracks,
            bondedTracks,
            alreadyHealthy,
            heal: rowReport(healRows),
            skipped: rowReport(skippedRows),
            dryRun: false,
            committed,
        }
    } catch (err) {
        logger.warn(
            `[mcp] backfill_track_mimetype failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "internal_error",
            "Failed to backfill track mimeType.",
            { tool: "backfill_track_mimetype" },
            "Retry; if the failure persists check Firestore IAM.",
        )
    }
}
