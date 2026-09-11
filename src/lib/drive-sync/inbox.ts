import type { Firestore } from "firebase-admin/firestore"
import {
    runDriveSync,
    type DriveSyncDeps,
    type DriveSyncResult,
} from "./poller"

/**
 * Chart Inbox — the shared Google Drive folder that music directors and admins
 * drop chart files into from ANY device (phone share sheet, laptop browser,
 * Drive app). `/api/cron/drive-sync` imports whatever is new every 5 minutes;
 * `sync_chart_inbox` (MCP) runs the same tick on demand so a user who has just
 * dropped a file gets it in the library while they are still talking to Claude.
 *
 * Why a Drive folder: a remote MCP server can never reach a user's disk, and a
 * chat attachment cannot be forwarded to a tool as bytes. The only autonomous,
 * multi-user, device-agnostic byte path is "put the file somewhere the SERVER
 * can read" — and every user already has Drive on every device. Claude never
 * carries the bytes; it points the user at the folder and reads the outcome.
 *
 * Folder resolution: `CHART_INBOX_DRIVE_FOLDER_ID` wins; the legacy
 * `DAVID_DRIVE_DROP_FOLDER_ID` (cycle-3 NEW-1, David Lazaroff's personal drop
 * folder) is honoured as a fallback so an existing deployment keeps working.
 */

export const DRIVE_FOLDER_URL_PREFIX = "https://drive.google.com/drive/folders/"

/** Vercel cron cadence for /api/cron/drive-sync (vercel.json). */
export const INBOX_POLL_INTERVAL_MINUTES = 5

/**
 * Files imported per on-demand `sync_chart_inbox` call. The MCP wall is ~60 s
 * and each import (Drive download → Storage → text extraction) costs a few
 * seconds, so the tool caps itself and reports `capReached` so the caller
 * knows to run it again. The 5-minute cron (cap 25) mops up regardless.
 */
export const MCP_SYNC_FILE_CAP = 8

export interface InboxEnvSource {
    CHART_INBOX_DRIVE_FOLDER_ID?: string | undefined
    DAVID_DRIVE_DROP_FOLDER_ID?: string | undefined
}

export function resolveChartInboxFolderId(source: InboxEnvSource): string | null {
    const primary = (source.CHART_INBOX_DRIVE_FOLDER_ID ?? "").trim()
    if (primary) return primary
    const legacy = (source.DAVID_DRIVE_DROP_FOLDER_ID ?? "").trim()
    return legacy || null
}

export function chartInboxUrl(folderId: string): string {
    return `${DRIVE_FOLDER_URL_PREFIX}${encodeURIComponent(folderId)}`
}

export interface InboxSubfolder {
    id: string
    name: string
    collection: string
}

export interface InboxRecentImport {
    fileId: string
    name: string
    collection: string | null
    status: string | null
    uploadedAt: string | null
    driveFileId: string | null
}

export interface ChartInboxStatus {
    configured: boolean
    folderId: string | null
    folderUrl: string | null
    /** True once the cron has ticked at least once against this folder. */
    watching: boolean
    pollIntervalMinutes: number
    lastTickAt: string | null
    lastSuccessfulSyncAt: string | null
    lastError: string | null
    consecutiveFailures: number
    subfolders: InboxSubfolder[]
    recentImports: InboxRecentImport[]
}

/** Minimal Firestore surface the status reader touches (fakeable in tests). */
export interface InboxStatusDb {
    collection(name: string): {
        doc(id: string): {
            get(): Promise<{
                exists: boolean
                data(): Record<string, unknown> | undefined
            }>
        }
        where(
            field: string,
            op: "array-contains-any",
            value: string[],
        ): {
            limit(n: number): {
                get(): Promise<{
                    docs: Array<{ id: string; data(): Record<string, unknown> }>
                }>
            }
        }
    }
}

function str(v: unknown): string | null {
    return typeof v === "string" && v ? v : null
}

/** Firestore `array-contains-any` accepts at most 30 disjuncts. */
const ARRAY_CONTAINS_ANY_MAX = 30

export async function readChartInboxStatus(
    db: InboxStatusDb,
    folderId: string | null,
    opts: { recentLimit?: number } = {},
): Promise<ChartInboxStatus> {
    const recentLimit = opts.recentLimit ?? 15
    const empty: ChartInboxStatus = {
        configured: false,
        folderId: null,
        folderUrl: null,
        watching: false,
        pollIntervalMinutes: INBOX_POLL_INTERVAL_MINUTES,
        lastTickAt: null,
        lastSuccessfulSyncAt: null,
        lastError: null,
        consecutiveFailures: 0,
        subfolders: [],
        recentImports: [],
    }
    if (!folderId) return empty

    const status: ChartInboxStatus = {
        ...empty,
        configured: true,
        folderId,
        folderUrl: chartInboxUrl(folderId),
    }

    const stateSnap = await db.collection("driveWatchState").doc(folderId).get()
    const state = stateSnap.exists ? (stateSnap.data() ?? {}) : null
    if (state) {
        status.watching = true
        status.lastTickAt = str(state.lastTickAt)
        status.lastSuccessfulSyncAt = str(state.lastSuccessfulSyncAt)
        status.lastError = str(state.lastError)
        status.consecutiveFailures =
            typeof state.consecutiveFailures === "number"
                ? state.consecutiveFailures
                : 0
        const map = (state.collectionMap ?? {}) as Record<
            string,
            { name?: unknown; collection?: unknown }
        >
        status.subfolders = Object.entries(map).map(([id, entry]) => ({
            id,
            name: str(entry?.name) ?? id,
            collection: str(entry?.collection) ?? "supplemental",
        }))
    }

    const parentIds = [folderId, ...status.subfolders.map((s) => s.id)].slice(
        0,
        ARRAY_CONTAINS_ANY_MAX,
    )
    const rows = await db
        .collection("library_index")
        .where("driveParents", "array-contains-any", parentIds)
        .limit(Math.max(recentLimit * 4, 40))
        .get()
    status.recentImports = rows.docs
        .map((d) => {
            const x = d.data()
            return {
                fileId: d.id,
                name: str(x.name) ?? str(x.title) ?? d.id,
                collection: str(x.collection),
                status: str(x.status),
                uploadedAt: str(x.uploadedAt),
                driveFileId: str(x.driveFileId),
            }
        })
        .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""))
        .slice(0, recentLimit)

    return status
}

export interface InboxSyncResult extends DriveSyncResult {
    folderUrl: string
    /** Per-call cap hit — more files may still be waiting; run again. */
    capReached: boolean
    fileCap: number
}

export type DriveSyncRunner = (opts: {
    deps: DriveSyncDeps
    parentFolderId: string
    perTickFileCap?: number
}) => Promise<DriveSyncResult>

/**
 * One on-demand importer tick against the inbox. Identical to the cron tick
 * (same `runDriveSync`, same watch-state cursor, same idempotent per-file
 * import), just capped lower so it fits inside an MCP call.
 */
export async function syncChartInboxNow(
    folderId: string,
    deps: DriveSyncDeps,
    opts: { fileCap?: number; run?: DriveSyncRunner } = {},
): Promise<InboxSyncResult> {
    const fileCap = Math.max(1, Math.min(opts.fileCap ?? MCP_SYNC_FILE_CAP, 25))
    const run = opts.run ?? runDriveSync
    const result = await run({ deps, parentFolderId: folderId, perTickFileCap: fileCap })
    return {
        ...result,
        folderUrl: chartInboxUrl(folderId),
        fileCap,
        capReached: result.filesScanned >= fileCap,
    }
}

/**
 * Production deps — real Drive client + the real upload pipeline. Lazy imports
 * so unit tests of this module never load googleapis or the upload pipeline.
 */
export async function buildProdDriveSyncDeps(db: Firestore): Promise<DriveSyncDeps> {
    const [{ DriveClient }, { processChartUpload }] = await Promise.all([
        import("@/lib/google-drive"),
        import("@/lib/library-upload"),
    ])
    return {
        drive: new DriveClient(),
        db,
        processor: processChartUpload,
        now: () => new Date(),
    }
}
