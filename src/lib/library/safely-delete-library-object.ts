import "server-only"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { deleteStorageObjectAtPath } from "@/lib/firebase-storage"
import { FieldValue } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"

/**
 * Bond-aware delete guard for `library/{fileId}.*` Storage bytes.
 *
 * Daniel's directive 2026-05-24T~01:35Z: "what i care about is that it
 * doesn't happen again." Today's cron-blast was one mutator (now hard-
 * removed at a41f9aef8). The codebase has other paths that delete from
 * `library/*` Storage (MCP delete_chart, processChartUpload's atomic-guard
 * compensating-delete, chart-heal's atomic-guard compensating-delete,
 * reconcile_library's atomic-guard compensating-delete, future code we
 * haven't written yet). This helper installs a STRUCTURAL guard at the
 * chokepoint so the WHOLE CLASS of "bond-deleting-a-live-chart" bugs is
 * defended at one place, not per-mutator.
 *
 * Bond semantics MIRROR the existing `deleteChart` `chart_in_use` guard:
 * a fileId is "live-bonded" iff a track points at it AND that track's
 * parent setlist still EXISTS. Dangling tracks (parent setlist already
 * deleted) do NOT block — they're data-loss orphans that `remove_track`
 * can't clear, so the helper would otherwise block legitimate cleanup.
 *
 * Force escape-hatch: legitimate callers (compensating-delete rollbacks
 * inside an atomic-guard, test-fixture cleanups, the MCP delete_chart
 * tool that already has its own upstream `chart_in_use` guard) pass
 * `force: true` with an explicit reason. The audit log records EVERY
 * delete (forced or not) AND every refusal, so the WHOLE delete surface
 * is traceable. Per [[feedback_dryrun_is_observability]] — force is overt
 * and tracked, not a silent flag.
 *
 * Out of scope for this helper: non-`library/*` Storage subtrees
 * (`recordings/*`, `originals/*`, `charts-backup/*`, `monitor-live/*`).
 * Those keep using `deleteStorageObjectAtPath` directly.
 */

export interface SafelyDeleteOptions {
    /** Audit-trail string identifying the call site. REQUIRED. */
    reason: string
    /**
     * Override the bond check. Must be paired with an honest `reason`
     * explaining why bond-checking would be wrong here (typically:
     * compensating-delete rollbacks where the bytes-being-deleted are the
     * caller's own just-written attempt that needs to be undone).
     */
    force?: boolean
    /** Optional caller uid for the audit row. */
    callerUid?: string
    /**
     * Optional: delete ONLY this exact `library/{fileId}...` path instead
     * of all three (.pdf/.xml/no-ext) variants. Used by surgical
     * compensating-delete callers that want to roll back ONE just-written
     * byte stream without touching other variants. The path MUST start
     * with `library/<fileId>` for the supplied fileId — passing any other
     * subtree throws.
     */
    exactPath?: string
}

export interface SafelyDeleteResult {
    /** True iff at least one variant was attempted (refusal sets this false). */
    deleted: boolean
    /** Track ids that hold a live bond (only populated on refusal). */
    refusedBecauseBonded?: string[]
    /** Paths actually attempted via `bucket.file(p).delete({ignoreNotFound:true})`. */
    deletedPaths?: string[]
}

/**
 * Three `library/{fileId}` variants the upload + heal + reconcile paths
 * can produce, matching `getStoragePath` in firebase-storage.ts:
 *   - `.pdf` (application/pdf)
 *   - `.xml` (application/xml + text/xml + musicxml mimes)
 *   - `` (no-extension fallback for image/text/octet-stream/HEIC/etc.)
 *
 * We attempt to delete ALL three by default. In practice only one is
 * present, but `{ignoreNotFound: true}` makes the absent variants no-ops.
 */
const LIBRARY_PATH_VARIANTS = [".pdf", ".xml", ""] as const

/**
 * Treat "object not found" failures as silent no-ops — the helper is
 * idempotent. The Admin SDK surfaces 404s as an Error whose message
 * contains "No such object" / "not found" / "404"; other errors
 * (IAM, network, malformed path) still throw.
 */
function isNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return /no such object|not found|404/i.test(msg)
}

/**
 * Find tracks whose `fileId` matches AND whose parent setlist still
 * exists. Returns the track ids of LIVE bonds only — dangling tracks
 * (dead parent) are excluded, matching `deleteChart`'s `chart_in_use`
 * semantics so the helper doesn't over-block legitimate orphan-chart
 * cleanup.
 *
 * `tracks` is a flat collection (not a subcollection of setlists), so a
 * single `where("fileId", "==", fileId)` query covers all setlists.
 * Limited to 50 hits — same cap `deleteChart` uses; any chart in 50+
 * live setlists is unequivocally bonded and we don't need exhaustive
 * enumeration to refuse.
 */
async function findLiveBondedTracks(
    db: FirebaseFirestore.Firestore,
    fileId: string,
): Promise<string[]> {
    const tracksSnap = await db
        .collection("tracks")
        .where("fileId", "==", fileId)
        .limit(50)
        .get()
    if (tracksSnap.empty) return []

    const matched = tracksSnap.docs.map((d) => {
        const sid = d.data().setlistId
        return { id: d.id, setlistId: typeof sid === "string" ? sid : null }
    })
    const distinctSetlistIds = [
        ...new Set(
            matched.map((t) => t.setlistId).filter((s): s is string => !!s),
        ),
    ]
    if (distinctSetlistIds.length === 0) return []

    const parentSnaps = await db.getAll(
        ...distinctSetlistIds.map((id) => db.collection("setlists").doc(id)),
    )
    const liveSetlistIds = new Set<string>()
    for (const snap of parentSnaps) {
        if (snap.exists) liveSetlistIds.add(snap.id)
    }
    return matched
        .filter((t) => t.setlistId !== null && liveSetlistIds.has(t.setlistId))
        .map((t) => t.id)
}

/**
 * Write a row to `auditLogs` describing the delete operation. Best-effort
 * — audit-log failure must NEVER fail the delete (matches the
 * library_signals broadcast pattern in deleteChart). On audit failure we
 * log the error and proceed.
 */
async function writeAuditLog(
    db: FirebaseFirestore.Firestore,
    payload: {
        type: "library-object-deleted" | "library-object-delete-refused"
        fileId: string
        reason: string
        forcedOverride: boolean
        bondedTrackIds: string[]
        callerUid: string | null
        paths: string[]
    },
): Promise<void> {
    try {
        await db.collection("auditLogs").add({
            ...payload,
            ts: FieldValue.serverTimestamp(),
        })
    } catch (auditErr) {
        logger.warn(
            `[safelyDeleteLibraryObject] audit-log write failed (${payload.type}): ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`,
        )
    }
}

/**
 * Delete `library/{fileId}.*` Storage bytes with a live-bond safety check.
 *
 * Default mode: deletes all three `library/{fileId}.{pdf|xml|}` variants.
 *
 * `exactPath` mode: deletes only the supplied path (must be `library/<fileId>...`).
 *
 * Refuses with `{deleted: false, refusedBecauseBonded: [trackIds]}` if
 * any live bond exists AND `opts.force !== true`. Audit log row is
 * written on EVERY operation including refusals.
 */
export async function safelyDeleteLibraryObject(
    fileId: string,
    opts: SafelyDeleteOptions,
): Promise<SafelyDeleteResult> {
    if (!fileId || !fileId.trim()) {
        throw new Error(
            "safelyDeleteLibraryObject: fileId must be a non-empty string",
        )
    }
    if (!opts || !opts.reason || !opts.reason.trim()) {
        throw new Error(
            "safelyDeleteLibraryObject: opts.reason is required for the audit trail",
        )
    }
    if (opts.exactPath !== undefined) {
        if (!opts.exactPath.startsWith(`library/${fileId}`)) {
            throw new Error(
                `safelyDeleteLibraryObject: exactPath '${opts.exactPath}' must start with 'library/${fileId}' — this helper only manages the library/* subtree.`,
            )
        }
    }

    initAdmin()
    const db = getFirestore()

    const bondedTracks = await findLiveBondedTracks(db, fileId)
    if (bondedTracks.length > 0 && !opts.force) {
        logger.warn(
            `[safelyDeleteLibraryObject] REFUSED bonded fileId=${fileId} ` +
                `liveTracks=${bondedTracks.length} reason='${opts.reason}'`,
        )
        await writeAuditLog(db, {
            type: "library-object-delete-refused",
            fileId,
            reason: opts.reason,
            forcedOverride: false,
            bondedTrackIds: bondedTracks,
            callerUid: opts.callerUid ?? null,
            paths: [],
        })
        return { deleted: false, refusedBecauseBonded: bondedTracks }
    }

    // Proceed with deletion. Route every delete through the existing
    // `deleteStorageObjectAtPath` helper so test scaffolding that already
    // mocks that surface continues to work — this helper is the LOGICAL
    // chokepoint for bond-checking; the byte-level delete still flows
    // through the standard helper. Not-found errors are swallowed so the
    // helper is idempotent across all 3 variants (only one is normally
    // present per fileId).
    const targetPaths: string[] = opts.exactPath
        ? [opts.exactPath]
        : LIBRARY_PATH_VARIANTS.map((ext) => `library/${fileId}${ext}`)

    const attemptedPaths: string[] = []
    for (const path of targetPaths) {
        try {
            await deleteStorageObjectAtPath(path)
            attemptedPaths.push(path)
        } catch (err) {
            if (isNotFoundError(err)) {
                // Absent variant — idempotent no-op. Do NOT record in
                // attemptedPaths since nothing was actually deleted.
                continue
            }
            // A real failure (IAM, network) on one variant aborts — we
            // record the partial-success in the audit log so forensic
            // queries can reconstruct the state.
            logger.error(
                `[safelyDeleteLibraryObject] delete threw at ${path}: ${err instanceof Error ? err.message : String(err)}`,
            )
            await writeAuditLog(db, {
                type: "library-object-deleted",
                fileId,
                reason: `${opts.reason}#partial-failure`,
                forcedOverride: !!opts.force,
                bondedTrackIds: opts.force ? bondedTracks : [],
                callerUid: opts.callerUid ?? null,
                paths: attemptedPaths,
            })
            throw err
        }
    }

    await writeAuditLog(db, {
        type: "library-object-deleted",
        fileId,
        reason: opts.reason,
        forcedOverride: !!opts.force,
        bondedTrackIds: opts.force ? bondedTracks : [],
        callerUid: opts.callerUid ?? null,
        paths: attemptedPaths,
    })

    return { deleted: true, deletedPaths: attemptedPaths }
}
