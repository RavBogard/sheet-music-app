/**
 * Server-side file fetcher.
 *
 * Primary path: Firebase Storage (fast, CDN-backed).
 * Fallback: Google Drive direct download when Storage misses (transient sync failure).
 *
 * Used by: file proxy API, print pipeline, enrichment engine.
 */

import { downloadFromStorage, fileExistsInStorage } from "@/lib/firebase-storage"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"

export interface FetchedFile {
    buffer: Buffer
    contentType: string
    source: 'firebase-storage' | 'google-drive-fallback'
}

/**
 * Fetch a file by ID from Firebase Storage.
 *
 * @param fileId - File ID (originally from Google Drive)
 * @param mimeType - Optional MIME type hint for Storage lookup
 * @returns FetchedFile or null if not in Storage
 */
export async function fetchFileById(fileId: string, mimeType?: string): Promise<FetchedFile | null> {
    // If the frontend passed a raw storageUrl with an extension, strip it so the candidate logic works correctly 
    const cleanId = fileId.replace(/\.(pdf|xml|musicxml|mp3)$/i, '')
    
    const storageResult = await downloadFromStorage(cleanId, mimeType)
    if (storageResult.success) {
        return {
            buffer: storageResult.data.buffer,
            contentType: storageResult.data.contentType,
            source: 'firebase-storage',
        }
    }

    if (storageResult.reason === 'network') {
        logger.warn(`[FileFetcher] Storage error for ${fileId}: ${storageResult.message}`)
    } else {
        logger.warn(`[FileFetcher] File not in Storage: ${fileId} — attempting Drive fallback`)
    }

    // Drive fallback: handles transient sync copy failures so files remain accessible
    // Only runs when Storage misses; Drive IDs starting with 'upload-' are local-only and won't be in Drive
    if (!cleanId.startsWith('upload-')) {
        try {
            const drive = new DriveClient()
            // Cycle-5 C5C-006: `getFileWithMime` transparently resolves Drive
            // shortcuts to their target's bytes AND reports the TARGET's
            // mimeType. Previously the Drive fallback echoed back the caller-
            // supplied `mimeType` hint, so shortcut-bonded library_index rows
            // (mimeType: application/vnd.google-apps.shortcut) returned the
            // target PDF bytes but with contentType=shortcut — gig-packet then
            // routed real PDFs into the "Unsupported content type" appendix.
            // Trust Drive's resolved mime; fall back to the caller hint only
            // when Drive returns nothing.
            const { data, mimeType: resolvedMime } = await drive.getFileWithMime(cleanId)
            const buffer = Buffer.from(data)
            const finalMime =
                resolvedMime && resolvedMime !== 'application/vnd.google-apps.shortcut'
                    ? resolvedMime
                    : (mimeType && mimeType !== 'application/vnd.google-apps.shortcut'
                        ? mimeType
                        : 'application/pdf')
            logger.info(`[FileFetcher] Served ${fileId} from Drive fallback (Storage miss; resolved mime: ${finalMime})`)
            return {
                buffer,
                contentType: finalMime,
                source: 'google-drive-fallback',
            }
        } catch (driveErr) {
            logger.warn(`[FileFetcher] Drive fallback failed for ${fileId}:`, driveErr instanceof Error ? driveErr.message : driveErr)
        }
    }

    return null
}

/**
 * Drive shortcut mime — un-embedable in `generate_gig_packet`'s merged PDF
 * (and equivalently broken for any byte consumer that needs a real chart
 * file). Detected separately from the storage/drive probe so the health
 * surface tells the operator the source-of-truth is a shortcut, not bytes.
 * Cycle-3 BUG-002.
 */
const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut"

/**
 * Metadata-only health probe for a library chart fileId. Unlike fetchFileById,
 * this does NOT download bytes — just probes Storage existence and Drive
 * metadata. Used by `verify_setlist_charts` and the publish pre-flight check
 * to catch orphaned library_index rows BEFORE the band ever sees a 404.
 *
 * Resolution mirrors fetchFileById: Storage primary → Drive fallback. An
 * `upload-` prefixed id that's missing from Storage is `status: 'missing'`
 * (the prefix indicates a local-only upload, no Drive backing).
 *
 * Returns:
 *  - { status: 'ok', source: 'firebase-storage', mimeType?: string }
 *  - { status: 'needs_storage_sync', reason: 'drive_only', mimeType?: string }
 *      — Drive has bytes but Storage doesn't yet. Bytes still SERVE because
 *        `fetchFileById` does the Drive fallback; the surface just flags the
 *        transient state so the /api/cron/drive-sync importer (NEW-1) can
 *        resolve it on the next tick. Storage-canonical direction (cycle-3
 *        ADDENDUM-1) makes Drive-only a non-steady state.
 *  - { status: 'shortcut_unresolved', reason, mimeType: SHORTCUT }
 *      — Cycle-3 BUG-002. Source-of-truth (library_index hint OR Drive
 *        metadata) reports the canonical mime as Google Drive shortcut.
 *        `generate_gig_packet` correctly drops these from the merged PDF;
 *        pre-flight health used to return ok and surprised the operator
 *        at publish time. Operator fix: re-bond the track to the shortcut's
 *        target chart (option a in BUG-002 was target-resolution; we ship
 *        option b — surface + refuse — because it's non-invasive).
 *  - { status: 'missing', reason }    — file not in Storage and (if applicable) not in Drive
 *  - { status: 'unreachable', error } — network/transient failure; caller may retry
 */
export type ChartHealth =
    | { status: "ok"; source: "firebase-storage"; mimeType?: string }
    | { status: "needs_storage_sync"; reason: "drive_only"; mimeType?: string }
    | {
          status: "shortcut_unresolved"
          reason: string
          mimeType: typeof DRIVE_SHORTCUT_MIME
          /**
           * BUG-002 forward-compat: `error` mirrors `reason` so legacy
           * callers that previously narrowed `unreachable | shortcut_unresolved`
           * down to "must have .error" (because shortcut_unresolved didn't
           * exist) keep compiling without per-caller patches. The intent is
           * `reason`; once every caller has an explicit shortcut branch this
           * field can drop.
           */
          error: string
      }
    | { status: "missing"; reason: string }
    | { status: "unreachable"; error: string }

export async function getChartHealth(
    fileId: string,
    mimeType?: string,
): Promise<ChartHealth> {
    if (!fileId) return { status: "missing", reason: "empty fileId" }
    // Cycle-3 BUG-002: if the caller already knows the canonical mime is a
    // Drive shortcut (library_index row's mimeType field carries this for
    // bonded-but-broken rows), skip the storage/drive probe — Storage may
    // have a stale shortcut blob and would otherwise return ok.
    if (mimeType === DRIVE_SHORTCUT_MIME) {
        const reason =
            "library_index mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId."
        return {
            status: "shortcut_unresolved",
            reason,
            mimeType: DRIVE_SHORTCUT_MIME,
            error: reason,
        }
    }
    const cleanId = fileId.replace(/\.(pdf|xml|musicxml|mp3)$/i, "")
    try {
        const storage = await fileExistsInStorage(cleanId, mimeType)
        if (storage.success && storage.data) {
            return { status: "ok", source: "firebase-storage", mimeType }
        }
        if (storage.success === false && storage.reason === "network") {
            return { status: "unreachable", error: storage.message }
        }
        // Storage miss → only Drive can help for non-upload-prefixed ids.
        if (cleanId.startsWith("upload-")) {
            return {
                status: "missing",
                reason: "Not in Storage; upload- prefix has no Drive fallback",
            }
        }
        try {
            const drive = new DriveClient()
            const meta = (await drive.getFileMetadata(cleanId)) as {
                mimeType?: string | null
            }
            // Cycle-3 BUG-002: Drive metadata reports a shortcut mime. We
            // do NOT follow `shortcutDetails.targetId` here (option a) —
            // simpler to surface the issue so the operator re-bonds at
            // the source. The `mimeType` hint may have been stale or absent
            // when the row was last written; this catches it on probe.
            if (meta?.mimeType === DRIVE_SHORTCUT_MIME) {
                const reason =
                    "Drive metadata mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId."
                return {
                    status: "shortcut_unresolved",
                    reason,
                    mimeType: DRIVE_SHORTCUT_MIME,
                    error: reason,
                }
            }
            // Cycle-3 NEW-5 (storage-canonical direction): Drive has bytes
            // but Storage doesn't. Bytes still SERVE via the fetchFileById
            // Drive fallback — the surface just flags the transient state
            // for the /api/cron/drive-sync importer to resolve. Operators
            // can also reconcile a backlog via the `reconcile_library` MCP
            // tool (NEW-2, A2's ship).
            return {
                status: "needs_storage_sync",
                reason: "drive_only",
                mimeType: meta?.mimeType ?? mimeType,
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (/not found|404/i.test(msg)) {
                // Cycle-1 F-004: mention BOTH stores in the reason so the
                // caller (and the agent reading the response) can tell that
                // Storage was probed first and also missed. Cowork-era
                // "Drive: File not found" was misleading enough that agents
                // assumed only Drive was checked.
                return {
                    status: "missing",
                    reason: `Not in Storage; Drive 404: ${msg}`,
                }
            }
            return { status: "unreachable", error: msg }
        }
    } catch (err) {
        return {
            status: "unreachable",
            error: err instanceof Error ? err.message : String(err),
        }
    }
}
