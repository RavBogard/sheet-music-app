import 'server-only'
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    uploadToStorage,
    getStorageObjectSize,
} from "@/lib/firebase-storage"
import { safelyDeleteLibraryObject } from "@/lib/library/safely-delete-library-object"
import { getChartHealth } from "@/lib/file-fetcher"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"
import { isNonChartArtifactShape } from "./library"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/errors"

/**
 * Cycle-3 NEW-2 (ADDENDUM-1 §3) — one-shot bootstrap reconciliation MCP
 * tool. Drains the ~250 currently-dead-looking `library_index` rows under
 * the storage-canonical direction:
 *
 *   - Storage 200                → already healthy; skip.
 *   - Storage 404 + Drive 200    → mirror Drive bytes into Storage at the
 *                                  EXISTING fileId (preserves every
 *                                  setlist/song bond), then merge-update
 *                                  `library_index/{fileId}` so `status`
 *                                  flips to `'active'` and the Drive
 *                                  provenance lands for the next NEW-1
 *                                  cron tick to maintain.
 *   - Storage 404 + Drive 404    → mark `status: 'orphaned'`. Surfaces
 *                                  in chart-health probes; hidden by
 *                                  default in search_library / list_library.
 *   - Drive 5xx / timeout        → leave row untouched; surface in
 *                                  `transient` bucket so the operator can
 *                                  re-run later. NEVER mark orphaned on a
 *                                  transient blip.
 *
 * NOT `processChartUpload` based — that path mints a fresh fileId (which
 * would break every existing bond), runs dedup against an existing-name
 * row (which would refuse), and `set`s the index doc (which would clobber
 * curation fields like `key` / `bpm` / `tags` / `bondCorrectionHistory`).
 * Reconcile is fundamentally a HEAL on an existing row, not a CREATE.
 * The atomic-guard contract is preserved here directly: Storage write →
 * read-verify by size → Firestore merge-update → compensating-delete on
 * Firestore failure → end-of-run `library_signals/latest` broadcast.
 * See [[feedback_upload_atomicity]] for the standing rule.
 *
 * Defaults `dryRun: true` per [[feedback_dryrun_is_observability]] — the
 * caller MUST pass `force: true` to actually write. dryRun returns the
 * full plan (bucket counts + per-row preview) without needing force.
 *
 * Admin-only at the registration layer (auth gate enforced here too).
 * Idempotent: a second force-run after the first leaves nothing to do
 * (every Drive-200 row was mirrored to Storage, every Drive-404 row was
 * marked orphaned and skipped on re-scan).
 */

const PROBE_CONCURRENCY = 6
const MIRROR_CONCURRENCY = 3
const BUCKET_REPORT_CAP = 500

export interface ReconcileLibraryArgs {
    /** When true (default), do not write — return the plan only. F-05. */
    dryRun?: boolean
    /** Required for writes. Refuses with rich envelope without `force: true`. */
    force?: boolean
}

interface MirrorRow {
    fileId: string
    name: string
    /** Bytes copied from Drive on commit — undefined until force-run. */
    sizeBytes?: number
}

interface OrphanRow {
    fileId: string
    name: string
}

interface TransientRow {
    fileId: string
    name: string
    error: string
}

/**
 * C9I3-002 — a `library_index` row whose canonical mime is a Google Drive
 * shortcut (`application/vnd.google-apps.shortcut`). Its bytes are an
 * unembeddable shortcut, not a chart, so a plain retry can NEVER heal it
 * (pre-fix these were mislabeled `transient`, which implied "re-run later").
 * A force-run attempts an in-place auto-resolve — download the shortcut
 * TARGET's bytes and store them at this SAME fileId with the target mime,
 * so every existing setlist/song bond keeps resolving. `error` is set on a
 * dry-run-plan row (absent) vs a force-run row that couldn't auto-resolve
 * (target gone, shortcut chain, empty bytes) and needs a manual re-bond.
 */
interface NeedsRebondRow {
    fileId: string
    name: string
    error?: string
}

interface SkippedNonChartRow {
    fileId: string
    name: string
    /** Drive mimeType that caused the skip — folder / audio / hidden / etc. */
    mimeType: string
    /** Which side of the predicate fired. */
    reason: "drive_folder" | "audio" | "hidden_dotfile" | "office_doc" | "other_non_chart"
}

/**
 * Cycle-3 DATA-002 — uniform `coverage` field shared across every hygiene
 * tool (list_library / dedupe_library / backfill_library_index /
 * reconcile_library). Lets Daniel reason about scan-total mismatches
 * (cowork captured 186 / 286 / 533 / 568 across the four tools at the
 * same point in time) without spelunking into source. Same shape across
 * tools so a single supervisor parser can render them.
 */
export interface HygieneCoverage {
    /** Total library_index docs at scan time (the universe). */
    total: number
    /**
     * Rows the tool actually considers (post-filter). For tools that
     * scan the whole collection this equals `total`; for tools that
     * skip orphaned/duplicate/archived rows it's smaller.
     */
    eligible: number
    /** Rows actually visited (= eligible in steady state; smaller if the tool
     *  caps scans). Surfaced separately so a future bounded sweep can
     *  report partial coverage without lying about `eligible`. */
    scanned: number
    filteredOut: {
        /** Counts of `status` values that were filtered out. */
        byStatus: Record<string, number>
        /** Counts of `collection` values filtered out. Empty when no
         *  collection filter was active. */
        byCollection: Record<string, number>
        /** Counts for filters that aren't status or collection (non-chart
         *  mime, empty name, etc.). Empty when no other filter applied. */
        byOther: Record<string, number>
    }
}

export interface ReconcileLibraryResult {
    ok: true
    scanned: number
    /** Storage HEAD 200 — nothing to do. */
    alreadyHealthy: number
    /** Storage 404 + Drive 200 — mirror to Storage (on force). */
    driveMirror: {
        count: number
        rows: MirrorRow[]
        /** True when `count > BUCKET_REPORT_CAP`; report rows are capped. */
        truncated: boolean
    }
    /** Storage 404 + Drive 404 — mark orphaned (on force). */
    orphan: {
        count: number
        rows: OrphanRow[]
        truncated: boolean
    }
    /** Drive 5xx / timeout — left untouched; re-run later. */
    transient: {
        count: number
        rows: TransientRow[]
        truncated: boolean
    }
    /**
     * C9I3-002 — rows whose canonical mime is a Drive shortcut. dryRun lists
     * every shortcut row here (the plan). A force-run auto-resolves what it
     * can in place (those move to `driveMirror` / `committed`); rows whose
     * target is gone escalate to `orphan`; rows that still can't resolve
     * (shortcut chain / empty target) stay here with a per-row `error` so
     * the operator can re-bond manually. Previously these were silently
     * (and wrongly) demoted to `transient`.
     */
    needsRebond: {
        count: number
        rows: NeedsRebondRow[]
        truncated: boolean
    }
    /**
     * Cycle-3 BUG-001 — Drive 200 but the bytes aren't a chart (folder,
     * audio sidecar, .DS_Store, Office doc). Filtered OUT of driveMirror
     * at planning time so a force-run never writes 0-byte garbage at the
     * existing fileId. These rows stay untouched until an operator
     * decides whether to remove them (delete_chart) or leave as catalog
     * cruft. NOT marked orphaned — Drive still has the object.
     */
    skippedNonChart: {
        count: number
        rows: SkippedNonChartRow[]
        truncated: boolean
    }
    /** Cycle-3 DATA-002 — uniform scan-coverage report. */
    coverage: HygieneCoverage
    dryRun: boolean
    /** Number of writes actually committed this call. 0 if dryRun or refused. */
    committed: number
    /** When force omitted on a non-dryRun call: refused without writes. */
    refused?: boolean
}

/**
 * Cycle-3 REG-002: the reconcile_library error path is the canonical
 * rich envelope `{ok:false, error:{code, machine_code, message}, ...}`.
 */
export type ReconcileLibraryError = RichErrorEnvelope

interface Candidate {
    fileId: string
    name: string
    currentStatus: string
    currentMimeType: string | null
}

async function loadAdminCandidates(
    uid: string,
): Promise<
    | {
          ok: true
          candidates: Candidate[]
          total: number
          filteredByStatus: Record<string, number>
      }
    | { ok: false; envelope: RichErrorEnvelope }
> {
    initAdmin()
    const db = getFirestore()

    const userSnap = await db.collection("users").doc(uid).get()
    const role = userSnap.exists
        ? (userSnap.data()?.role as string | undefined)
        : undefined
    if (role !== "admin") {
        return {
            ok: false,
            envelope: richError(
                "forbidden_role",
                "reconcile_library is admin-only.",
                {
                    callerRole: role ?? null,
                    requiredRoles: ["admin"],
                },
                "Ask an admin to elevate your account, or call a tool your role is allowed to use.",
            ),
        }
    }

    const snap = await db.collection("library_index").get()
    const candidates: Candidate[] = []
    const filteredByStatus: Record<string, number> = {}
    for (const d of snap.docs) {
        const data = d.data()
        // Skip rows already definitively orphaned — re-running reconcile
        // should NOT re-probe them. They were marked orphaned for cause
        // (Drive 404), and unmarking requires explicit operator action
        // (manual re-upload). This is what makes the tool idempotent.
        // `duplicate` rows are also out of scope — handled by dedupe_library.
        // `archived` rows are intentional soft-deletes (e.g. the dh-20260527a
        // Class-3 non-chart folders/sheets archived via archive_nonchart_artifacts)
        // — reconcile must skip them so they vanish from every scan, not just
        // /library's status-filtered view.
        const status = typeof data.status === "string" ? data.status : "active"
        if (
            status === "orphaned" ||
            status === "duplicate" ||
            status === "archived"
        ) {
            filteredByStatus[status] = (filteredByStatus[status] ?? 0) + 1
            continue
        }
        const name =
            (typeof data.name === "string" && data.name) ||
            (typeof data.title === "string" && data.title) ||
            d.id
        const mimeType =
            typeof data.mimeType === "string" ? data.mimeType : null
        candidates.push({
            fileId: d.id,
            name,
            currentStatus: status,
            currentMimeType: mimeType,
        })
    }
    return {
        ok: true,
        candidates,
        total: snap.docs.length,
        filteredByStatus,
    }
}

interface ProbeResult {
    candidate: Candidate
    bucket:
        | "healthy"
        | "mirror"
        | "orphan"
        | "transient"
        | "skipped_non_chart"
        | "needs_rebond"
    /** Set when bucket === 'mirror' or 'skipped_non_chart' — drive metadata. */
    driveMimeType?: string
    /** Set only when bucket === 'transient'. */
    error?: string
    /** Set only when bucket === 'skipped_non_chart'. */
    skipReason?: SkippedNonChartRow["reason"]
}

/**
 * Cycle-3 BUG-001 — classify why a Drive-200 row is being skipped from
 * driveMirror. Uses the same negative-set predicate list_library applies
 * for `includeNonCharts:false`. Returns null when the row is a real chart
 * (should land in driveMirror).
 */
function classifyNonChart(
    name: string,
    driveMimeType: string,
): SkippedNonChartRow["reason"] | null {
    if (!isNonChartArtifactShape({ mimeType: driveMimeType, name })) return null
    const mime = driveMimeType.toLowerCase()
    if (mime.startsWith("application/vnd.google-apps.")) return "drive_folder"
    if (mime.startsWith("audio/")) return "audio"
    if (name.startsWith(".")) return "hidden_dotfile"
    if (
        mime ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        return "office_doc"
    }
    return "other_non_chart"
}

async function probeRow(c: Candidate): Promise<ProbeResult> {
    try {
        const health = await getChartHealth(c.fileId, c.currentMimeType ?? undefined)
        if (health.status === "ok") {
            return { candidate: c, bucket: "healthy" }
        }
        if (health.status === "needs_storage_sync") {
            // BUG-001 (cycle-3): folder / audio / .DS_Store / Office-doc rows
            // exist as library_index entries from legacy Drive scans but
            // their bytes are not embeddable charts. Filter BEFORE the
            // mirror bucket so dryRun output is honest about what a
            // force-run would actually write.
            const driveMimeType =
                health.mimeType ?? c.currentMimeType ?? "application/pdf"
            const skipReason = classifyNonChart(c.name, driveMimeType)
            if (skipReason) {
                return {
                    candidate: c,
                    bucket: "skipped_non_chart",
                    driveMimeType,
                    skipReason,
                }
            }
            return {
                candidate: c,
                bucket: "mirror",
                driveMimeType,
            }
        }
        if (health.status === "missing") {
            return { candidate: c, bucket: "orphan" }
        }
        if (health.status === "shortcut_unresolved") {
            // C9I3-002: the row's bytes are an unembeddable Drive shortcut.
            // It can NEVER heal via retry — pre-fix it fell through to the
            // `transient` bucket below, so reconcile demoted Tu Bishvat /
            // Lechu Goldman forever. Route to the needsRebond bucket; a
            // force-run attempts in-place auto-resolution of the shortcut
            // target.
            return { candidate: c, bucket: "needs_rebond" }
        }
        // status === "unreachable" — transient
        return {
            candidate: c,
            bucket: "transient",
            error: health.error,
        }
    } catch (err) {
        return {
            candidate: c,
            bucket: "transient",
            error: err instanceof Error ? err.message : String(err),
        }
    }
}

async function probeAll(candidates: Candidate[]): Promise<ProbeResult[]> {
    const results: ProbeResult[] = []
    for (let i = 0; i < candidates.length; i += PROBE_CONCURRENCY) {
        const batch = candidates.slice(i, i + PROBE_CONCURRENCY)
        const batchResults = await Promise.all(batch.map(probeRow))
        results.push(...batchResults)
    }
    return results
}

/**
 * Mirror a single Drive-200 row into Storage at its EXISTING fileId.
 * Preserves the atomic-guard contract end-to-end:
 *   1. Drive download → bytes
 *   2. Storage upload at `library/{fileId}<ext>`
 *   3. Read-verify by byte size — refuses to update Firestore on mismatch
 *   4. Firestore merge-update — preserves curation fields the row already
 *      carries (key / bpm / tags / composer / bondCorrectionHistory / etc.)
 *   5. Compensating-delete: if the Firestore update throws, the Storage
 *      blob we just wrote is removed so we don't leave a reverse orphan.
 *
 * Drive download failures are surfaced as transient (not orphan) so the
 * operator can re-run after the blip clears.
 */
type MirrorOutcome =
    | { ok: true; sizeBytes: number }
    | { ok: false; kind: "orphaned"; error: string }
    | { ok: false; kind: "transient"; error: string }

/**
 * Shared atomic-guard tail for both the Drive-200 mirror and the C9I3-002
 * shortcut-rebond heal: upload `buffer` to Storage at the EXISTING `fileId`,
 * read-verify by byte size, then merge-update the storage-canonical surface
 * (curation fields preserved by the merge), compensating-deleting the Storage
 * blob if the Firestore write throws. Never returns `orphaned` — byte-source
 * resolution (and 404→orphan escalation) is the caller's job.
 */
async function commitResolvedBytes(
    db: FirebaseFirestore.Firestore,
    fileId: string,
    buffer: Buffer,
    mimeType: string,
    actorUid?: string,
): Promise<MirrorOutcome> {
    // Storage path mirrors `getStoragePath` extension logic (pdf/xml/audio);
    // any other mime gets "" — matches `getStorageObjectSize`.
    const ext = mimeType.includes("pdf")
        ? ".pdf"
        : mimeType.includes("xml")
          ? ".xml"
          : mimeType.includes("audio")
            ? ".mp3"
            : ""
    const storagePath = `library/${fileId}${ext}`

    try {
        await uploadToStorage(fileId, buffer, mimeType)
    } catch (err) {
        return {
            ok: false,
            kind: "transient",
            error: `Storage upload failed: ${err instanceof Error ? err.message : String(err)}`,
        }
    }

    const verifiedSize = await getStorageObjectSize(storagePath)
    if (verifiedSize === null || verifiedSize <= 0) {
        // Bytes vanished between write + read-verify — same posture as
        // processChartUpload: refuse to mutate Firestore on a broken write.
        // force:true with explicit reason — atomic-guard rollback of bytes
        // we just attempted to write; audit row records the override.
        try {
            await safelyDeleteLibraryObject(fileId, {
                reason: "reconcile-compensation:storage-verify-missing",
                force: true,
                callerUid: actorUid,
                exactPath: storagePath,
            })
        } catch {
            // best effort
        }
        return {
            ok: false,
            kind: "transient",
            error: `Storage read-verify failed at ${storagePath} (object missing)`,
        }
    }
    if (verifiedSize !== buffer.byteLength) {
        try {
            await safelyDeleteLibraryObject(fileId, {
                reason: "reconcile-compensation:size-mismatch",
                force: true,
                callerUid: actorUid,
                exactPath: storagePath,
            })
        } catch {
            // best effort
        }
        return {
            ok: false,
            kind: "transient",
            error: `Storage size mismatch (wrote ${buffer.byteLength}, read ${verifiedSize})`,
        }
    }

    // Firestore merge-update — keep fileId STABLE so every setlist/song
    // bond keeps resolving. Curation fields the row already carries are
    // preserved by the merge; we only set the storage-canonical-direction
    // surface: mimeType, fileSize, source, drive provenance, status,
    // reconciledAt marker.
    const nowIso = new Date().toISOString()
    const patch: Record<string, unknown> = {
        mimeType,
        fileSize: buffer.byteLength,
        source: "drive-sync",
        status: "active",
        reconciledAt: nowIso,
        driveFileId: fileId,
    }
    try {
        await db.collection("library_index").doc(fileId).set(patch, { merge: true })
    } catch (err) {
        // Compensating-delete: roll the Storage blob back so we don't
        // leave a reverse orphan (bytes-without-index-update). force:true
        // because reconcile heals an EXISTING fileId (the bond is by
        // design); audit row records the override.
        try {
            await safelyDeleteLibraryObject(fileId, {
                reason: "reconcile-compensation:firestore-merge-failed",
                force: true,
                callerUid: actorUid,
                exactPath: storagePath,
            })
        } catch (rbErr) {
            logger.warn(
                `[reconcile_library] compensating-delete failed for ${storagePath}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
            )
        }
        return {
            ok: false,
            kind: "transient",
            error: `Firestore merge-update failed: ${err instanceof Error ? err.message : String(err)}`,
        }
    }
    return { ok: true, sizeBytes: buffer.byteLength }
}

async function mirrorRow(
    db: FirebaseFirestore.Firestore,
    drive: DriveClient,
    c: Candidate,
    driveMimeType: string,
    actorUid: string,
): Promise<MirrorOutcome> {
    // Drive 200 was confirmed at the METADATA probe step; the actual bytes
    // can still 404 (deleted file, shortcut to a deleted target). C5C-007:
    // distinguish a 404 byte fetch (orphan — escalate to the orphan bucket
    // so the row's `status:'active'` finally flips to `'orphaned'`) from
    // other failures (transient — leave the row untouched for re-run).
    // Real-prod row Hashkiveinu (Brodsky-Zweiback) had this exact shape:
    // metadata exists, bytes 404, so reconcile kept demoting it to transient
    // forever instead of orphaning it.
    let buffer: Buffer
    try {
        const bytes = await drive.getFile(c.fileId)
        buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/not found|404/i.test(msg)) {
            return {
                ok: false,
                kind: "orphaned",
                error: `Drive byte fetch 404'd at commit time: ${msg}`,
            }
        }
        return {
            ok: false,
            kind: "transient",
            error: `Drive download failed: ${msg}`,
        }
    }
    if (buffer.byteLength === 0) {
        // Empty Drive payload — surface as transient rather than orphan;
        // an operator-driven re-fetch is the right call, not a permanent
        // status flip.
        return { ok: false, kind: "transient", error: "Drive payload empty" }
    }

    // Storage upload + read-verify + Firestore merge — shared atomic-guard
    // tail (also used by the C9I3-002 shortcut-rebond heal path). actorUid
    // flows into the safely-delete-library-object audit row on any
    // compensating-delete (bond-aware-delete-guard contract).
    return commitResolvedBytes(db, c.fileId, buffer, driveMimeType, actorUid)
}

/**
 * C9I3-002 — heal one shortcut-bonded row in place. Resolves the shortcut's
 * TARGET via `getFileWithMime` (one Drive round-trip: target bytes + target
 * mime), then writes those bytes to Storage at the SAME fileId with the
 * target mime via the shared atomic-guard tail. The fileId is unchanged, so
 * every existing setlist/song bond keeps resolving — this is a HEAL, not a
 * re-key. A target that 404s escalates to the orphan bucket; an unresolvable
 * shortcut (chain / no targetMimeType / empty target) stays needsRebond for
 * a manual re-bond.
 */
type RebondOutcome =
    | { ok: true; sizeBytes: number }
    | { ok: false; kind: "orphaned"; error: string }
    | { ok: false; kind: "needs_rebond"; error: string }

async function rebondRow(
    db: FirebaseFirestore.Firestore,
    drive: DriveClient,
    c: Candidate,
    actorUid?: string,
): Promise<RebondOutcome> {
    let data: ArrayBuffer
    let targetMime: string | null
    try {
        const resolved = await drive.getFileWithMime(c.fileId)
        data = resolved.data
        targetMime = resolved.mimeType
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/not found|404/i.test(msg)) {
            return {
                ok: false,
                kind: "orphaned",
                error: `Shortcut target 404'd at rebond time: ${msg}`,
            }
        }
        // Shortcut chain exceeded, or any other Drive failure — needs a
        // manual re-bond to the underlying chart fileId.
        return { ok: false, kind: "needs_rebond", error: msg }
    }
    if (!targetMime || targetMime === "application/vnd.google-apps.shortcut") {
        return {
            ok: false,
            kind: "needs_rebond",
            error: "Shortcut target mime unresolved (chain or missing targetMimeType) — re-bond manually to the underlying chart fileId.",
        }
    }
    const buffer = Buffer.from(data)
    if (buffer.byteLength === 0) {
        return {
            ok: false,
            kind: "needs_rebond",
            error: "Shortcut target returned empty bytes.",
        }
    }
    const out = await commitResolvedBytes(db, c.fileId, buffer, targetMime, actorUid)
    if (out.ok) return { ok: true, sizeBytes: out.sizeBytes }
    // commitResolvedBytes only fails transiently (upload/verify/merge); keep
    // the row in needsRebond so a re-run retries the heal.
    return { ok: false, kind: "needs_rebond", error: out.error }
}

async function commitMirrorBatch(
    db: FirebaseFirestore.Firestore,
    drive: DriveClient,
    plan: ProbeResult[],
    uid: string,
): Promise<{
    committed: number
    /** Rows that flipped from mirror → transient at commit time. */
    demoted: TransientRow[]
    /**
     * Cycle-5 C5C-007 — rows that flipped from mirror → orphan at commit
     * time (Drive metadata 200 at probe, but byte fetch 404'd). Surface
     * separately so the caller can fold them into the orphan commit batch
     * rather than leaving them stuck as transient indefinitely.
     */
    orphanedDuringMirror: { probe: ProbeResult; row: OrphanRow; error: string }[]
    /** Per-row sizeBytes for the report. */
    sizes: Map<string, number>
}> {
    const demoted: TransientRow[] = []
    const orphanedDuringMirror: {
        probe: ProbeResult
        row: OrphanRow
        error: string
    }[] = []
    const sizes = new Map<string, number>()
    let committed = 0
    for (let i = 0; i < plan.length; i += MIRROR_CONCURRENCY) {
        const batch = plan.slice(i, i + MIRROR_CONCURRENCY)
        const results = await Promise.all(
            batch.map(async (p) => {
                const driveMime = p.driveMimeType ?? "application/pdf"
                const r = await mirrorRow(db, drive, p.candidate, driveMime, uid)
                return { p, r }
            }),
        )
        for (const { p, r } of results) {
            if (r.ok) {
                committed++
                sizes.set(p.candidate.fileId, r.sizeBytes)
            } else if (r.kind === "orphaned") {
                orphanedDuringMirror.push({
                    probe: p,
                    row: {
                        fileId: p.candidate.fileId,
                        name: p.candidate.name,
                    },
                    error: r.error,
                })
            } else {
                demoted.push({
                    fileId: p.candidate.fileId,
                    name: p.candidate.name,
                    error: r.error,
                })
            }
        }
    }
    return { committed, demoted, orphanedDuringMirror, sizes }
}

async function commitRebondBatch(
    db: FirebaseFirestore.Firestore,
    drive: DriveClient,
    plan: ProbeResult[],
    actorUid?: string,
): Promise<{
    committed: number
    /** Rows healed in place — folded into the driveMirror report. */
    healed: MirrorRow[]
    /** Rows whose shortcut target 404'd — folded into the orphan commit. */
    orphanedDuringRebond: { probe: ProbeResult; row: OrphanRow; error: string }[]
    /** Rows that still couldn't auto-resolve — surfaced for manual re-bond. */
    stillNeedsRebond: NeedsRebondRow[]
}> {
    const healed: MirrorRow[] = []
    const orphanedDuringRebond: {
        probe: ProbeResult
        row: OrphanRow
        error: string
    }[] = []
    const stillNeedsRebond: NeedsRebondRow[] = []
    let committed = 0
    for (let i = 0; i < plan.length; i += MIRROR_CONCURRENCY) {
        const batch = plan.slice(i, i + MIRROR_CONCURRENCY)
        const results = await Promise.all(
            batch.map(async (p) => {
                const r = await rebondRow(db, drive, p.candidate, actorUid)
                return { p, r }
            }),
        )
        for (const { p, r } of results) {
            if (r.ok) {
                committed++
                healed.push({
                    fileId: p.candidate.fileId,
                    name: p.candidate.name,
                    sizeBytes: r.sizeBytes,
                })
            } else if (r.kind === "orphaned") {
                orphanedDuringRebond.push({
                    probe: p,
                    row: { fileId: p.candidate.fileId, name: p.candidate.name },
                    error: r.error,
                })
            } else {
                stillNeedsRebond.push({
                    fileId: p.candidate.fileId,
                    name: p.candidate.name,
                    error: r.error,
                })
            }
        }
    }
    return { committed, healed, orphanedDuringRebond, stillNeedsRebond }
}

async function commitOrphanBatch(
    db: FirebaseFirestore.Firestore,
    plan: ProbeResult[],
): Promise<number> {
    if (plan.length === 0) return 0
    const nowIso = new Date().toISOString()
    const BATCH_MAX = 400
    let committed = 0
    for (let i = 0; i < plan.length; i += BATCH_MAX) {
        const slice = plan.slice(i, i + BATCH_MAX)
        const batch = db.batch()
        for (const p of slice) {
            batch.set(
                db.collection("library_index").doc(p.candidate.fileId),
                { status: "orphaned", orphanedAt: nowIso },
                { merge: true },
            )
            // Mirror onto songs/{id} when present so search_library's
            // status filter agrees on either collection. set+merge is
            // safe — songs/{id} may not exist for every library row,
            // and a stub `{status:'orphaned'}` doc is still a valid
            // shape there (verify_setlist_charts uses the same pattern).
            batch.set(
                db.collection("songs").doc(p.candidate.fileId),
                { status: "orphaned" },
                { merge: true },
            )
        }
        await batch.commit()
        committed += slice.length
    }
    return committed
}

async function broadcastReconcileSignal(
    db: FirebaseFirestore.Firestore,
    uid: string,
    committed: number,
): Promise<void> {
    if (committed === 0) return
    try {
        await db.collection("library_signals").doc("latest").set({
            at: new Date().toISOString(),
            fileId: "<reconcile-batch>",
            op: "reconcile",
            by: uid,
            count: committed,
        })
    } catch (err) {
        logger.warn(
            `[reconcile_library] library_signals broadcast failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        )
    }
}

function bucketReport<T>(rows: T[]): {
    count: number
    rows: T[]
    truncated: boolean
} {
    return {
        count: rows.length,
        rows: rows.slice(0, BUCKET_REPORT_CAP),
        truncated: rows.length > BUCKET_REPORT_CAP,
    }
}

export async function reconcileLibrary(
    uid: string,
    args: ReconcileLibraryArgs = {},
): Promise<ReconcileLibraryResult | ReconcileLibraryError> {
    const dryRun = args.dryRun !== false
    const force = args.force === true

    try {
        const loaded = await loadAdminCandidates(uid)
        if (!loaded.ok) return loaded.envelope
        const candidates = loaded.candidates
        const coverage: HygieneCoverage = {
            total: loaded.total,
            eligible: candidates.length,
            scanned: candidates.length,
            filteredOut: {
                byStatus: loaded.filteredByStatus,
                byCollection: {},
                byOther: {},
            },
        }

        if (candidates.length === 0) {
            // Empty library — nothing to plan. dryRun returns the
            // zero-bucket report; a real-run with !force shifts to the
            // rich force_required envelope per REG-003.
            const zeroPlan = {
                scanned: 0,
                alreadyHealthy: 0,
                driveMirror: { count: 0, rows: [], truncated: false },
                orphan: { count: 0, rows: [], truncated: false },
                transient: { count: 0, rows: [], truncated: false },
                skippedNonChart: { count: 0, rows: [], truncated: false },
                needsRebond: { count: 0, rows: [], truncated: false },
                coverage,
            }
            if (!dryRun && !force) {
                return richError(
                    "force_required",
                    "Pass force:true to commit reconcile_library writes.",
                    { dryRunPlan: zeroPlan },
                    "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
                )
            }
            return {
                ok: true,
                ...zeroPlan,
                dryRun,
                committed: 0,
            }
        }

        const probes = await probeAll(candidates)

        const healthy = probes.filter((p) => p.bucket === "healthy")
        const mirrorPlan = probes.filter((p) => p.bucket === "mirror")
        const orphanPlan = probes.filter((p) => p.bucket === "orphan")
        const transientPlan = probes.filter((p) => p.bucket === "transient")
        const skippedNonChartPlan = probes.filter(
            (p) => p.bucket === "skipped_non_chart",
        )
        const needsRebondPlan = probes.filter(
            (p) => p.bucket === "needs_rebond",
        )

        const mirrorRows: MirrorRow[] = mirrorPlan.map((p) => ({
            fileId: p.candidate.fileId,
            name: p.candidate.name,
        }))
        const orphanRows: OrphanRow[] = orphanPlan.map((p) => ({
            fileId: p.candidate.fileId,
            name: p.candidate.name,
        }))
        const transientRows: TransientRow[] = transientPlan.map((p) => ({
            fileId: p.candidate.fileId,
            name: p.candidate.name,
            error: p.error ?? "unknown",
        }))
        const skippedNonChartRows: SkippedNonChartRow[] = skippedNonChartPlan.map(
            (p) => ({
                fileId: p.candidate.fileId,
                name: p.candidate.name,
                mimeType: p.driveMimeType ?? "application/octet-stream",
                reason: p.skipReason ?? "other_non_chart",
            }),
        )
        const needsRebondRows: NeedsRebondRow[] = needsRebondPlan.map((p) => ({
            fileId: p.candidate.fileId,
            name: p.candidate.name,
        }))

        if (dryRun) {
            return {
                ok: true,
                scanned: candidates.length,
                alreadyHealthy: healthy.length,
                driveMirror: bucketReport(mirrorRows),
                orphan: bucketReport(orphanRows),
                transient: bucketReport(transientRows),
                skippedNonChart: bucketReport(skippedNonChartRows),
                needsRebond: bucketReport(needsRebondRows),
                coverage,
                dryRun: true,
                committed: 0,
            }
        }

        if (!force) {
            // Cycle-3 REG-003: real-run without force returns the rich
            // `force_required` envelope carrying the dry-run plan in
            // extras. F-05 standing rule preserved: dryRun is observability,
            // a real-run path needs explicit `force: true` to commit.
            // Plan keeps the cycle-3 reconcile-data lane's additive bucket
            // (`skippedNonChart`) + `coverage` so the dryRunPlan is a true
            // mirror of the dryRun-mode success body.
            return richError(
                "force_required",
                "Pass force:true to commit reconcile_library writes.",
                {
                    dryRunPlan: {
                        scanned: candidates.length,
                        alreadyHealthy: healthy.length,
                        driveMirror: bucketReport(mirrorRows),
                        orphan: bucketReport(orphanRows),
                        transient: bucketReport(transientRows),
                        skippedNonChart: bucketReport(skippedNonChartRows),
                        needsRebond: bucketReport(needsRebondRows),
                        coverage,
                    },
                },
                "Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing.",
            )
        }

        // Force-run. Mirror first (per-row atomic-guard; rows that fail
        // at commit time get demoted to transient and reported). Then
        // orphan-mark the Drive-404 bucket in a batched Firestore commit.
        initAdmin()
        const db = getFirestore()
        const drive = new DriveClient()

        const mirrorOutcome = await commitMirrorBatch(db, drive, mirrorPlan, uid)
        // Fold per-row sizeBytes into the mirror report; rows that demoted
        // drop out of mirrorRows and either land in transientRows or — per
        // C5C-007 — escalate into orphanRows when the byte fetch 404'd.
        const droppedFromMirror = new Set([
            ...mirrorOutcome.demoted.map((d) => d.fileId),
            ...mirrorOutcome.orphanedDuringMirror.map((o) => o.row.fileId),
        ])
        // C9I3-002: auto-resolve shortcut rows in place (download the target's
        // bytes → store at this fileId with the target mime). Healed rows fold
        // into the mirror report; targets that 404 escalate to orphan; the
        // rest stay needsRebond for a manual re-bond.
        const rebondOutcome = await commitRebondBatch(db, drive, needsRebondPlan, uid)

        const finalMirrorRows: MirrorRow[] = [
            ...mirrorRows
                .filter((r) => !droppedFromMirror.has(r.fileId))
                .map((r) => ({
                    ...r,
                    sizeBytes: mirrorOutcome.sizes.get(r.fileId),
                })),
            ...rebondOutcome.healed,
        ]
        const finalTransientRows: TransientRow[] = [
            ...transientRows,
            ...mirrorOutcome.demoted,
        ]
        const escalatedOrphanProbes = mirrorOutcome.orphanedDuringMirror.map(
            (o) => o.probe,
        )
        const rebondOrphanProbes = rebondOutcome.orphanedDuringRebond.map(
            (o) => o.probe,
        )
        const finalOrphanRows: OrphanRow[] = [
            ...orphanRows,
            ...mirrorOutcome.orphanedDuringMirror.map((o) => o.row),
            ...rebondOutcome.orphanedDuringRebond.map((o) => o.row),
        ]
        const fullOrphanPlan = [
            ...orphanPlan,
            ...escalatedOrphanProbes,
            ...rebondOrphanProbes,
        ]
        const finalNeedsRebondRows: NeedsRebondRow[] =
            rebondOutcome.stillNeedsRebond

        const orphansCommitted = await commitOrphanBatch(db, fullOrphanPlan)
        const committed =
            mirrorOutcome.committed +
            rebondOutcome.committed +
            orphansCommitted

        await broadcastReconcileSignal(db, uid, committed)

        logger.info("[mcp] reconcile_library committed", {
            uid,
            scanned: candidates.length,
            alreadyHealthy: healthy.length,
            mirrored: mirrorOutcome.committed,
            rebonded: rebondOutcome.committed,
            orphaned: orphansCommitted,
            orphanedDuringMirror: mirrorOutcome.orphanedDuringMirror.length,
            orphanedDuringRebond: rebondOutcome.orphanedDuringRebond.length,
            stillNeedsRebond: finalNeedsRebondRows.length,
            transient: finalTransientRows.length,
        })

        return {
            ok: true,
            scanned: candidates.length,
            alreadyHealthy: healthy.length,
            driveMirror: bucketReport(finalMirrorRows),
            orphan: bucketReport(finalOrphanRows),
            transient: bucketReport(finalTransientRows),
            skippedNonChart: bucketReport(skippedNonChartRows),
            needsRebond: bucketReport(finalNeedsRebondRows),
            coverage,
            dryRun: false,
            committed,
        }
    } catch (err) {
        logger.warn(
            `[mcp] reconcile_library failed: ${err instanceof Error ? err.message : String(err)}`,
        )
        return richError(
            "server_error",
            "Failed to run library reconciliation.",
            { tool: "reconcile_library" },
            "Retry; if the failure persists check Drive / Storage IAM and the [mcp] logs.",
        )
    }
}
