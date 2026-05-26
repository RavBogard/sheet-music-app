import "server-only"

import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { downloadFromStoragePath, downloadFromStorage } from "@/lib/firebase-storage"
import {
    extractSearchableText,
    type ExtractSearchableTextResult,
} from "@/lib/library/searchable-text"
import { logger } from "@/lib/logger"

/**
 * `backfill_searchable_text` — f4-lyric-search-persistence-mod Phase 3.
 *
 * Heal historical `library_index/{id}` rows that lack `searchableText` — the
 * lowercased + whitespace-normalized chart body that PCU started persisting at
 * write time as part of this lane. The field powers `search_chart_text`'s
 * `lyrics` scope; without it, pre-lane historical rows (~625 in prod at lane
 * dispatch) are invisible to lyric search until backfilled.
 *
 * For each candidate row, the tool:
 *   1. Reads `storageUrl` + `mimeType` + `originalName` (filename for extension
 *      fallback)
 *   2. Fetches Storage bytes via the admin SDK (`downloadFromStoragePath` when
 *      `storageUrl` is present, falling back to `downloadFromStorage(fileId)`
 *      for legacy rows)
 *   3. Runs the SAME `extractSearchableText` helper PCU uses — guarantees the
 *      backfilled rows are byte-equivalent to fresh writes for the same source
 *   4. On `dryRun:false` + `force:true` writes `searchableText` +
 *      `searchableTextBackfilledAt` audit-trail field via Firestore `update`
 *
 * Sequential per-row processing — admin-SDK Storage reads are network-bound and
 * the extraction step (especially pdfjs on PDFs) is CPU-bound. Parallelism here
 * would just contend on the same Vercel function's CPU + Storage egress; the
 * gain isn't worth the operational complexity of partial-failure mid-batch.
 * Per-row error capture keeps a single bad PDF from aborting the whole call.
 *
 * F-05 ([[feedback_dryrun_is_observability]]): `dryRun` defaults TRUE and
 * returns the full plan + per-row preview without writing; a real run
 * (`dryRun:false`) still requires `force:true` or returns refused:true with
 * the plan, no writes.
 *
 * Admin-only ([[feedback_single_owner_destructive_runs]]) — backfilling
 * persistence-shape fields at scale is destructive in the "expensive to
 * unwind" sense; band_leader's standing scope is mix + setlist authoring, not
 * persistence-shape stewardship.
 *
 * `[[feedback_admin_rate_limit_bypass]]` — admin gets the rate-limit bypass via
 * the same role precondition; no separate `checkUserRateLimit` call here
 * because backfill is gate-then-go (one-shot), not a per-call write surface.
 *
 * Idempotent: a second `force:true` run skips rows whose `searchableText` is
 * already populated (unless the second call ALSO passes `force:true` AND
 * `overwrite:true` — surfaced as a separate flag so a re-run doesn't
 * accidentally re-extract every row).
 *
 * ★ Apply run is Daniel-named single-owner. Pattern: dryRun-first, surface
 * the report via supervisor, get explicit "go", then run apply in `limit`-d
 * batches.
 */

const ROW_REPORT_CAP = 200
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export interface BackfillSearchableTextArgs {
    /** When true (default), return the would-change plan without writing. F-05. */
    dryRun?: boolean
    /** Required for writes. Without it a real run returns refused:true, no writes. */
    force?: boolean
    /** Max rows to process this call. Default 100; max 500. Caller paginates by re-invoking. */
    limit?: number
    /**
     * Target a specific row set instead of scanning for missing-searchableText.
     * Useful for re-runs after an extractor improvement, or for healing
     * a specific known-bad chart.
     */
    fileIds?: string[]
    /**
     * When true together with `force:true`, re-extract + overwrite rows that
     * already carry a non-empty `searchableText`. Default false — a second
     * run skips already-populated rows for idempotency.
     */
    overwrite?: boolean
}

export type SkipReason =
    | "already_populated"
    | "no_storage_url"
    | "storage_missing"
    | "storage_download_failed"
    | "extraction_skipped_image"
    | "extraction_skipped_audio"
    | "extraction_skipped_no_text"
    | "extraction_skipped_unsupported"

export interface HealRow {
    fileId: string
    /** Resolved title from library_index — for the report-readability. */
    title: string | null
    /** Storage path read for extraction. */
    storagePath: string
    /** Format that yielded the text. */
    format: "pdf" | "txt" | "musicxml"
    /** Length of the extracted (normalized + capped) text. */
    chars: number
    /** True when the raw extraction exceeded SEARCHABLE_TEXT_MAX_BYTES. */
    truncated: boolean
}

export interface SkippedRow {
    fileId: string
    title: string | null
    /**
     * Why this row was skipped. Field name mirrors the extractor's
     * `ExtractSearchableTextResult.skipReason` discriminator for consistent
     * client-side parsing across the dryRun response — readers that walk
     * `skipped.rows[].skipReason` work uniformly with extractor-side
     * `extracted.skipReason` for the same row class.
     */
    skipReason: SkipReason
    /** Extractor / Storage error message when skipReason is *_failed. */
    detail?: string
}

export interface ErrorRow {
    fileId: string
    title: string | null
    /** The thrown message. */
    message: string
}

interface RowReport<T> {
    count: number
    rows: T[]
    truncated: boolean
}

export interface BackfillSearchableTextResult {
    ok: true
    scanned: number
    /** Rows considered (after limit/fileIds narrowing). */
    candidates: number
    heal: RowReport<HealRow>
    skipped: RowReport<SkippedRow>
    errors: RowReport<ErrorRow>
    dryRun: boolean
    /** Rows actually written this call. 0 on dryRun / refused. */
    committed: number
    /** Set when a real run omitted `force` — plan returned, no writes. */
    refused?: boolean
}

function rowReport<T>(rows: T[]): RowReport<T> {
    return {
        count: rows.length,
        rows: rows.slice(0, ROW_REPORT_CAP),
        truncated: rows.length > ROW_REPORT_CAP,
    }
}

/** Admin role gate. Mirrors `bridge-housekeeping.ts:assertAdmin` shape. */
async function assertAdmin(
    db: ReturnType<typeof getFirestore>,
    uid: string,
): Promise<{ ok: true } | RichErrorEnvelope> {
    const role = await readUserRole(db, uid)
    if (role === "admin") return { ok: true }
    return forbiddenRoleEnvelope({
        callerRole: role ?? null,
        requiredRoles: ["admin"],
        message:
            "backfill_searchable_text is admin-only (persistence-shape backfill at scale).",
        hint:
            "band_leader's standing scope is mix + setlist authoring, not library persistence-shape stewardship. Ask an admin to run the backfill once; the new field appears on fresh uploads automatically.",
    })
}

interface CandidateRow {
    fileId: string
    title: string | null
    storageUrl: string | undefined
    mimeType: string | undefined
    originalName: string | undefined
    alreadyHasText: boolean
}

function toCandidate(
    id: string,
    data: Record<string, unknown>,
): CandidateRow {
    const titleStr =
        typeof data.title === "string" && data.title
            ? data.title
            : typeof data.name === "string" && data.name
                ? data.name
                : null
    const storageUrl =
        typeof data.storageUrl === "string" && data.storageUrl
            ? data.storageUrl
            : undefined
    const mimeType =
        typeof data.mimeType === "string" && data.mimeType
            ? data.mimeType
            : undefined
    const originalName =
        typeof data.originalName === "string" && data.originalName
            ? data.originalName
            : undefined
    const existing =
        typeof data.searchableText === "string" && data.searchableText.length > 0
    return {
        fileId: id,
        title: titleStr,
        storageUrl,
        mimeType,
        originalName,
        alreadyHasText: existing,
    }
}

export async function backfillSearchableText(
    uid: string,
    args: BackfillSearchableTextArgs = {},
): Promise<BackfillSearchableTextResult | RichErrorEnvelope> {
    const dryRun = args.dryRun !== false
    const force = args.force === true
    const overwrite = args.overwrite === true
    const requestedLimit =
        typeof args.limit === "number" && args.limit > 0
            ? Math.min(args.limit, MAX_LIMIT)
            : DEFAULT_LIMIT
    const targetedFileIds =
        Array.isArray(args.fileIds) && args.fileIds.length > 0
            ? args.fileIds.filter(
                  (s): s is string => typeof s === "string" && s.length > 0,
              )
            : null

    if (targetedFileIds && targetedFileIds.length > MAX_LIMIT) {
        return richError(
            "invalid_argument",
            `fileIds[] length (${targetedFileIds.length}) exceeds MAX_LIMIT (${MAX_LIMIT}).`,
            { field: "fileIds", max: MAX_LIMIT },
        )
    }

    try {
        initAdmin()
        const db = getFirestore()

        const gate = await assertAdmin(db, uid)
        if (!gate.ok) return gate

        // ─── Resolve the candidate set ─────────────────────────────────
        let scanned = 0
        let candidates: CandidateRow[] = []
        if (targetedFileIds) {
            // Targeted re-run — fetch exact rows.
            const refs = targetedFileIds.map((id) =>
                db.collection("library_index").doc(id),
            )
            const docs = await db.getAll(...refs)
            for (const d of docs) {
                scanned++
                if (!d.exists) continue
                const data = d.data() as Record<string, unknown>
                candidates.push(toCandidate(d.id, data))
            }
        } else {
            // Untargeted — scan library_index, filter to candidates in memory.
            // Firestore can't express "field absent" efficiently; we pull pages
            // until we accumulate `requestedLimit` candidates (or exhaust the
            // collection). Defensive ceiling on total scanned to keep one call
            // bounded.
            const SCAN_CEILING = 5000
            const PAGE = 500
            let lastDocId: string | null = null
            while (
                scanned < SCAN_CEILING &&
                candidates.length < requestedLimit
            ) {
                let q = db
                    .collection("library_index")
                    .orderBy("__name__")
                    .limit(PAGE)
                if (lastDocId) q = q.startAfter(lastDocId)
                const snap = await q.get()
                if (snap.empty) break
                scanned += snap.size
                for (const d of snap.docs) {
                    const data = d.data() as Record<string, unknown>
                    const c = toCandidate(d.id, data)
                    // Status filter — backfill `active` rows only. Orphaned /
                    // deleted rows would just consume budget without value.
                    const status =
                        typeof data.status === "string"
                            ? data.status
                            : "active"
                    if (status !== "active") continue
                    if (c.alreadyHasText && !overwrite) continue
                    candidates.push(c)
                    if (candidates.length >= requestedLimit) break
                }
                lastDocId = snap.docs[snap.docs.length - 1].id
                if (snap.size < PAGE) break
            }
        }

        const healRows: HealRow[] = []
        const skippedRows: SkippedRow[] = []
        const errorRows: ErrorRow[] = []

        // ─── Per-row extraction + (optional) write ─────────────────────
        for (const c of candidates) {
            // Idempotency guard for the targeted-fileIds branch (the
            // untargeted scan already filters above when `!overwrite`).
            if (c.alreadyHasText && !overwrite) {
                skippedRows.push({
                    fileId: c.fileId,
                    title: c.title,
                    skipReason: "already_populated",
                })
                continue
            }

            try {
                // Fetch Storage bytes. storageUrl is the canonical post-C9I3-004
                // path (matches what uploadToStorage actually wrote to); fall
                // back to downloadFromStorage by fileId for legacy rows where
                // storageUrl wasn't backfilled.
                let downloaded
                if (c.storageUrl) {
                    downloaded = await downloadFromStoragePath(c.storageUrl)
                } else {
                    downloaded = await downloadFromStorage(
                        c.fileId,
                        c.mimeType,
                    )
                }
                if (!downloaded.success) {
                    skippedRows.push({
                        fileId: c.fileId,
                        title: c.title,
                        skipReason:
                            downloaded.reason === "not_found"
                                ? "storage_missing"
                                : "storage_download_failed",
                        detail: downloaded.message,
                    })
                    continue
                }

                const fileName = c.originalName ?? c.fileId
                const contentType =
                    c.mimeType ?? downloaded.data.contentType

                const extracted: ExtractSearchableTextResult =
                    await extractSearchableText({
                        buffer: downloaded.data.buffer,
                        contentType,
                        fileName,
                    })

                if (!extracted.ok) {
                    errorRows.push({
                        fileId: c.fileId,
                        title: c.title,
                        message: extracted.reason,
                    })
                    continue
                }

                if (extracted.text === null) {
                    const sub = extracted.skipReason ?? "no_text"
                    const skipReason: SkipReason =
                        sub === "image"
                            ? "extraction_skipped_image"
                            : sub === "audio"
                                ? "extraction_skipped_audio"
                                : sub === "unsupported_format"
                                    ? "extraction_skipped_unsupported"
                                    : "extraction_skipped_no_text"
                    skippedRows.push({
                        fileId: c.fileId,
                        title: c.title,
                        skipReason,
                    })
                    continue
                }

                healRows.push({
                    fileId: c.fileId,
                    title: c.title,
                    storagePath: c.storageUrl ?? `library/${c.fileId}`,
                    format:
                        extracted.format === "pdf"
                            ? "pdf"
                            : extracted.format === "musicxml"
                                ? "musicxml"
                                : "txt",
                    chars: extracted.text.length,
                    truncated: extracted.truncated,
                })

                // ─── Real run + force → write the field ─────────────────
                if (!dryRun && force) {
                    await db
                        .collection("library_index")
                        .doc(c.fileId)
                        .update({
                            searchableText: extracted.text,
                            searchableTextBackfilledAt:
                                FieldValue.serverTimestamp(),
                        })
                }
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Unknown error"
                errorRows.push({
                    fileId: c.fileId,
                    title: c.title,
                    message,
                })
            }
        }

        // ─── Build the response shape ──────────────────────────────────
        if (dryRun) {
            return {
                ok: true,
                scanned,
                candidates: candidates.length,
                heal: rowReport(healRows),
                skipped: rowReport(skippedRows),
                errors: rowReport(errorRows),
                dryRun: true,
                committed: 0,
            }
        }

        if (!force) {
            return {
                ok: true,
                scanned,
                candidates: candidates.length,
                heal: rowReport(healRows),
                skipped: rowReport(skippedRows),
                errors: rowReport(errorRows),
                dryRun: false,
                committed: 0,
                refused: true,
            }
        }

        logger.info("[mcp] backfill_searchable_text committed", {
            uid,
            scanned,
            candidates: candidates.length,
            healed: healRows.length,
            skipped: skippedRows.length,
            errors: errorRows.length,
        })

        return {
            ok: true,
            scanned,
            candidates: candidates.length,
            heal: rowReport(healRows),
            skipped: rowReport(skippedRows),
            errors: rowReport(errorRows),
            dryRun: false,
            committed: healRows.length,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        logger.warn(
            `[backfill_searchable_text] outer-loop failure: ${message}`,
        )
        return richError(
            "internal_error",
            `Backfill failed: ${message}`,
            { tool: "backfill_searchable_text" },
        )
    }
}
