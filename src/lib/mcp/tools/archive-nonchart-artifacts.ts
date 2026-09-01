import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readUserRole } from "@/lib/mcp/server-tracks-write"
import {
    richError,
    forbiddenRoleEnvelope,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * `archive_nonchart_artifacts` — bulk soft-archive the UNAMBIGUOUS non-chart
 * residents of `library_index` (data-health dh-20260527a Class 3).
 *
 * Legacy Drive scans seeded `library_index` with rows that are not embeddable
 * charts — Google Drive *folders* and Google *Sheets*. `reconcile_library`
 * already buckets these as `skippedNonChart` (so `/library` and the picker hide
 * them via the `status !== 'archived'` filter at library.ts), but they remain
 * permanent residents of every raw scan. This tool flips their `status` to
 * `'archived'` — the same reversible soft-delete the in-app `/api/library/archive`
 * route performs — so they vanish from `list_library` AND (paired with the
 * reconcile-library skip-set fix in this lane) from `reconcile_library` scans.
 *
 * ★ NARROW BY DESIGN. Only two mimeType signatures are eligible:
 *   - `application/vnd.google-apps.folder`      → kind `'folder'`
 *   - `application/vnd.google-apps.spreadsheet` → kind `'sheet'`
 * Google *Docs* (`application/vnd.google-apps.document`) are deliberately NOT
 * archived — some are single-song docs already re-uploaded as PDFs and need
 * per-row triage. They surface in `heldGoogleDocs` with a recommendation so the
 * operator can decide in a second pass. EVERY other row (real charts, audio,
 * etc.) is out of scope and never touched — the guard refuses any fileId whose
 * mimeType is not folder/sheet, even when passed explicitly via `fileIds`.
 *
 * F-05 ([[feedback_dryrun_is_observability]]): `dryRun` defaults TRUE and
 * returns the full plan (the would-archive set + held docs) WITHOUT writing; a
 * real run (`dryRun:false`) still requires `force:true` or it returns the plan
 * with `refused:true` and no writes.
 *
 * Single-owner ([[feedback_single_owner_destructive_runs]]): ship the TOOL; the
 * prod APPLY is Daniel's single-owner, dryRun-first step (expect exactly 24
 * fileIds — 23 folders + 1 sheet — per the dh-20260527a Class-3 inventory).
 *
 * Atomicity ([[feedback_upload_atomicity]]): there is NO Storage mutation here
 * (soft-delete is a status flip, fully reversible by re-running with the in-app
 * restore or flipping status back). Each archived row is read-verified after the
 * batch commit; `verified` counts the rows confirmed at `status:'archived'`.
 */

const ARCHIVABLE_MIMETYPES: Record<string, ArchiveKind> = {
    "application/vnd.google-apps.folder": "folder",
    "application/vnd.google-apps.spreadsheet": "sheet",
}
const HELD_DOC_MIMETYPE = "application/vnd.google-apps.document"

const READ_CONCURRENCY = 10
const WRITE_BATCH_MAX = 400
const ROW_REPORT_CAP = 500

export type ArchiveKind = "folder" | "sheet"

export interface ArchiveNonChartArgs {
    /** When true (default), returns the plan without writing. F-05: no force needed. */
    dryRun?: boolean
    /** Required for real writes. Pair with `dryRun:false`. */
    force?: boolean
    /**
     * Optional — restrict the operation to this explicit fileId set (e.g. the
     * 24 from the dh-20260527a report) instead of scanning the whole catalog.
     * Each id is still subjected to the folder/sheet mimeType guard; any id that
     * is missing or not a folder/sheet is reported in `notMatched` and NEVER
     * archived. Cross-check tool: lets the operator pin the exact set.
     */
    fileIds?: string[]
}

export interface ArchiveRow {
    fileId: string
    name: string | null
    mimeType: string
    kind: ArchiveKind
}

export interface HeldDocRow {
    fileId: string
    name: string | null
    mimeType: string
    recommendation: string
}

interface RowReport<T> {
    count: number
    rows: T[]
    truncated: boolean
}

export interface ArchiveNonChartResult {
    ok: true
    /** Total library_index rows scanned (or `fileIds.length` in targeted mode). */
    scanned: number
    /** The UNAMBIGUOUS non-chart rows that would be / were archived (folders + sheets). */
    toArchive: RowReport<ArchiveRow>
    /** Google Docs held back for per-row triage — enumerated, NEVER archived. */
    heldGoogleDocs: RowReport<HeldDocRow>
    /** Eligible rows already at `status:'archived'` — skipped for idempotency. */
    alreadyArchived: number
    /**
     * Targeted-mode safety: provided fileIds that are missing or whose mimeType
     * is not folder/sheet. Always present (possibly empty) so a caller pinning a
     * set can confirm the guard rejected nothing unexpected.
     */
    notMatched: string[]
    dryRun: boolean
    /** Rows actually archived this call. 0 on dryRun or refused. */
    committed: number
    /** Rows confirmed at `status:'archived'` by post-commit read-back. */
    verified: number
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

function readMimeType(data: FirebaseFirestore.DocumentData): string {
    return typeof data.mimeType === "string" ? data.mimeType.trim() : ""
}
function readName(data: FirebaseFirestore.DocumentData): string | null {
    if (typeof data.name === "string" && data.name) return data.name
    if (typeof data.title === "string" && data.title) return data.title
    return null
}
function readStatus(data: FirebaseFirestore.DocumentData): string {
    return typeof data.status === "string" ? data.status : "active"
}

export async function archiveNonChartArtifacts(
    uid: string,
    args: ArchiveNonChartArgs = {},
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ArchiveNonChartResult | RichErrorEnvelope> {
    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        initAdmin()
        const db = getFirestore()

        // Admin-only — bulk catalog mutation. band_leader's standing scope is
        // mix + setlist authoring, not catalog soft-deletes. Mirrors the
        // bridge-housekeeping admin gate.
        const role = await readUserRole(db, uid)
        if (role !== "admin") {
            return forbiddenRoleEnvelope({
                callerRole: role ?? null,
                requiredRoles: ["admin"],
                message:
                    "archive_nonchart_artifacts is admin-only (bulk catalog soft-delete).",
                hint: "This flips status:'archived' across multiple library_index rows. Run it as the admin operator, dryRun-first.",
            })
        }

        // ── Gather candidate docs ────────────────────────────────────────────
        // Targeted mode (fileIds[]) does point-reads so an operator can pin the
        // exact dh-report set; untargeted mode does the full library_index scan
        // (mirrors reconcile_library — Firestore can't express "mimeType in
        // {folder,sheet}" cheaply across legacy rows with mixed shapes).
        const archiveRows: ArchiveRow[] = []
        const heldDocs: HeldDocRow[] = []
        const notMatched: string[] = []
        let alreadyArchived = 0
        let scanned = 0

        const classify = (
            fileId: string,
            data: FirebaseFirestore.DocumentData,
        ): void => {
            const mimeType = readMimeType(data)
            const kind = ARCHIVABLE_MIMETYPES[mimeType]
            if (kind) {
                if (readStatus(data) === "archived") {
                    alreadyArchived++
                    return
                }
                archiveRows.push({
                    fileId,
                    name: readName(data),
                    mimeType,
                    kind,
                })
                return
            }
            if (mimeType === HELD_DOC_MIMETYPE) {
                heldDocs.push({
                    fileId,
                    name: readName(data),
                    mimeType,
                    recommendation:
                        "HOLD — Google Doc needs per-row triage; some are single-song docs already re-uploaded as PDFs. Do not bulk-archive.",
                })
            }
            // any other mimeType (real chart / audio / image) → out of scope
        }

        if (args.fileIds && args.fileIds.length > 0) {
            const ids = [...new Set(args.fileIds.map((s) => s.trim()).filter(Boolean))]
            scanned = ids.length
            for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
                const chunk = ids.slice(i, i + READ_CONCURRENCY)
                const refs = chunk.map((id) =>
                    db.collection("library_index").doc(id),
                )
                const docs = await db.getAll(...refs)
                docs.forEach((doc, j) => {
                    const id = chunk[j]
                    if (!doc.exists) {
                        notMatched.push(id)
                        return
                    }
                    const data = doc.data() as FirebaseFirestore.DocumentData
                    // v11-02-02 tenant isolation — L1-W3, Daniel's call
                    // 2026-09-01. A row in another org is refused the same
                    // way a non-folder/sheet mime is: into `notMatched`,
                    // never archived, even when its id is passed explicitly.
                    if (rowOrg(data.orgId) !== org) {
                        notMatched.push(id)
                        return
                    }
                    const mimeType = readMimeType(data)
                    if (!ARCHIVABLE_MIMETYPES[mimeType]) {
                        // explicit guard: a provided id that is NOT a folder/sheet
                        // is refused — even a chart fileId can never be archived.
                        notMatched.push(id)
                        // still classify so held google-docs surface in the report
                        if (mimeType === HELD_DOC_MIMETYPE) classify(id, data)
                        return
                    }
                    classify(id, data)
                })
            }
        } else {
            const snap = await db.collection("library_index").get()
            // v11-02-02 tenant isolation — L1-W3. This scan took the whole
            // collection and this tool WRITES `status:'archived'`, so an
            // admin of one org could soft-delete another org's folders and
            // sheets. `scanned` now reports the caller's tenant only.
            const orgDocs = snap.docs.filter(
                (d) => rowOrg(d.data().orgId) === org,
            )
            scanned = orgDocs.length
            for (const d of orgDocs) {
                classify(d.id, d.data() as FirebaseFirestore.DocumentData)
            }
        }

        // ── dryRun: plan only, no writes (F-05 dryRun-is-observability) ───────
        if (dryRun) {
            return {
                ok: true,
                scanned,
                toArchive: rowReport(archiveRows),
                heldGoogleDocs: rowReport(heldDocs),
                alreadyArchived,
                notMatched,
                dryRun: true,
                committed: 0,
                verified: 0,
            }
        }

        // ── real run without force → rich force_required envelope, no writes ──
        // FU-1: carries the would-archive plan in `dryRunPlan` so the caller
        // can inspect the set before committing. Still no writes — aligns with
        // backfill_library_index / dedupe_library / library-review.
        if (!force) {
            return richError(
                "force_required",
                "archive_nonchart_artifacts requires force:true to commit.",
                {
                    dryRunPlan: {
                        scanned,
                        toArchive: rowReport(archiveRows),
                        heldGoogleDocs: rowReport(heldDocs),
                        alreadyArchived,
                        notMatched,
                        dryRun: false,
                        committed: 0,
                        verified: 0,
                    },
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }

        // ── force run: batched status flip, mirroring /api/library/archive ────
        // library_index/{id}.status → 'archived' (+ archivedBy/archivedAt audit
        // trail). songs/{id} mirror ONLY if a songs doc already exists — folders
        // and sheets were never songs, so we never create a spurious songs doc.
        const nowIso = new Date().toISOString()
        const songExists = new Set<string>()
        const archiveIds = archiveRows.map((r) => r.fileId)
        for (let i = 0; i < archiveIds.length; i += READ_CONCURRENCY) {
            const chunk = archiveIds.slice(i, i + READ_CONCURRENCY)
            const refs = chunk.map((id) => db.collection("songs").doc(id))
            const docs = await db.getAll(...refs)
            docs.forEach((doc, j) => {
                if (doc.exists) songExists.add(chunk[j])
            })
        }

        let committed = 0
        for (let i = 0; i < archiveRows.length; i += WRITE_BATCH_MAX) {
            const slice = archiveRows.slice(i, i + WRITE_BATCH_MAX)
            const batch = db.batch()
            for (const r of slice) {
                batch.update(db.collection("library_index").doc(r.fileId), {
                    status: "archived",
                    modifiedTime: nowIso,
                    archivedBy: uid,
                    archivedAt: nowIso,
                })
                if (songExists.has(r.fileId)) {
                    batch.set(
                        db.collection("songs").doc(r.fileId),
                        { status: "archived", updatedAt: Date.now() },
                        { merge: true },
                    )
                }
            }
            await batch.commit()
            committed += slice.length
        }

        // ── read-back verify (atomic-guard read-verify contract) ──────────────
        let verified = 0
        for (let i = 0; i < archiveIds.length; i += READ_CONCURRENCY) {
            const chunk = archiveIds.slice(i, i + READ_CONCURRENCY)
            const refs = chunk.map((id) =>
                db.collection("library_index").doc(id),
            )
            const docs = await db.getAll(...refs)
            for (const doc of docs) {
                if (doc.exists && readStatus(doc.data()!) === "archived") {
                    verified++
                }
            }
        }

        logger.info("[mcp] archive_nonchart_artifacts committed", {
            uid,
            scanned,
            committed,
            verified,
            heldGoogleDocs: heldDocs.length,
            alreadyArchived,
            notMatched: notMatched.length,
        })

        return {
            ok: true,
            scanned,
            toArchive: rowReport(archiveRows),
            heldGoogleDocs: rowReport(heldDocs),
            alreadyArchived,
            notMatched,
            dryRun: false,
            committed,
            verified,
        }
    } catch (err) {
        logger.warn(
            `[mcp] archive_nonchart_artifacts failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "internal_error",
            "Failed to archive non-chart artifacts.",
            { tool: "archive_nonchart_artifacts" },
            "Retry; if the failure persists check Firestore IAM.",
        )
    }
}
