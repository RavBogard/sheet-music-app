import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import { DriveClient } from "@/lib/google-drive"
import {
    processChartUpload,
    type LibraryCollection,
    type ProcessChartUploadResult,
} from "@/lib/library-upload"
import { uploadToStorage } from "@/lib/firebase-storage"
import { logger } from "@/lib/logger"

/**
 * Cycle-3 NEW-1 (storage-canonical pipeline foundation).
 *
 * Pure poll logic for `/api/cron/drive-sync`. Watches David Lazaroff's
 * drop folder + its direct subfolders, mirrors new / renamed / replaced
 * files into Firebase Storage via `processChartUpload` (atomic-guard +
 * `library_signals` broadcast + 0.85 strict dedup + force override).
 *
 * State store: `driveWatchState/{parentFolderId}` Firestore doc.
 * Failure surface: per-file rows in `chartImportQueue/{queueId}`.
 *
 * Drive event semantics (per ADDENDUM-1):
 *  - new file        → import via processChartUpload with driveMetadata
 *  - rename (md5 unchanged, name differs) → update library row name
 *  - replace (md5 advanced)                → rewrite Storage bytes, version-bump
 *  - move between subfolders              → update collection if mapping differs
 *  - delete in Drive                      → NO propagation (Storage canonical)
 *
 * The poller is dependency-injected (DriveClient, Firestore, processor,
 * clock) so the unit suite can drive it against the emulator without
 * touching the real Drive API.
 */

export const DEFAULT_PER_TICK_FILE_CAP = 25
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"

export type ChartImportQueueStatus =
    | "drive_404"
    | "permission_lost"
    | "conversion_failed"
    | "mime_unrecognized"
    | "dedup_blocked"
    | "storage_failed"
    | "google_doc_skipped"
    | "unknown"

export interface DriveSyncDeps {
    drive: Pick<
        DriveClient,
        "listFilesByQuery" | "getFile" | "getFileMetadata"
    >
    db: Firestore
    processor: (
        input: Parameters<typeof processChartUpload>[0],
    ) => Promise<ProcessChartUploadResult>
    now: () => Date
}

export interface DriveSyncResult {
    watching: boolean
    parentFolderId?: string
    subfolderIds?: string[]
    filesScanned: number
    imported: number
    renamed: number
    replaced: number
    moved: number
    skipped: number
    queued: number
    /** ISO. The most recent `modifiedTime` advanced to in this tick. */
    advancedLastPollAt?: string
    /** Per-file error notes — bounded to 20 entries for log readability. */
    errors: string[]
}

interface SubfolderMapEntry {
    name: string
    collection: LibraryCollection
}

interface DriveWatchStateDoc {
    parentFolderId: string
    /** Direct child folder ids of the parent. Refreshed every tick. */
    subfolderIds: string[]
    /**
     * Subfolder id → {friendly name, mapped collection}. Keyed by ID so a
     * Drive rename of the subfolder doesn't orphan the mapping. The `name`
     * is informational (NEW-4 `/manage` UI displays it).
     */
    collectionMap: Record<string, SubfolderMapEntry>
    /** ISO. Default-initialized to `now()` so the first tick doesn't mass-import the historical backlog. */
    lastPollAt: string
    /** ISO; `null` when never synced cleanly. Firestore rejects `undefined`. */
    lastSuccessfulSyncAt: string | null
    consecutiveFailures: number
    /** `null` when last tick succeeded; string when last tick reported a failure. */
    lastError: string | null
    /** ISO; `null` only on the very first tick before persistence. */
    lastTickAt: string | null
}

interface DriveFile {
    id?: string
    name?: string
    mimeType?: string
    modifiedTime?: string
    parents?: string[]
    md5Checksum?: string
    size?: string | number
}

function defaultWatchState(
    parentFolderId: string,
    nowIso: string,
): DriveWatchStateDoc {
    return {
        parentFolderId,
        subfolderIds: [],
        collectionMap: {},
        // First-tick guard: do NOT backfill the historical Drive contents.
        // NEW-2 `reconcile_library` is the explicit bootstrap surface for
        // pre-existing rows (dry-run + force).
        lastPollAt: nowIso,
        lastSuccessfulSyncAt: null,
        consecutiveFailures: 0,
        lastError: null,
        lastTickAt: null,
    }
}

async function loadOrInitWatchState(
    db: Firestore,
    parentFolderId: string,
    nowIso: string,
): Promise<{ state: DriveWatchStateDoc; isFirstTick: boolean }> {
    const ref = db.collection("driveWatchState").doc(parentFolderId)
    const snap = await ref.get()
    if (snap.exists) {
        const data = snap.data() as Partial<DriveWatchStateDoc>
        return {
            state: {
                parentFolderId,
                subfolderIds: data.subfolderIds ?? [],
                collectionMap: data.collectionMap ?? {},
                lastPollAt: data.lastPollAt ?? nowIso,
                lastSuccessfulSyncAt: data.lastSuccessfulSyncAt ?? null,
                consecutiveFailures: data.consecutiveFailures ?? 0,
                lastError: data.lastError ?? null,
                lastTickAt: data.lastTickAt ?? null,
            },
            isFirstTick: false,
        }
    }
    const initial = defaultWatchState(parentFolderId, nowIso)
    await ref.set(initial)
    return { state: initial, isFirstTick: true }
}

function resolveCollectionForFile(
    file: DriveFile,
    parentFolderId: string,
    collectionMap: Record<string, SubfolderMapEntry>,
): LibraryCollection {
    if (!file.parents || file.parents.length === 0) return "supplemental"
    for (const parentId of file.parents) {
        // Files directly in the drop-folder root → default to 'supplemental'.
        // Subfolder map takes precedence when matched.
        if (parentId === parentFolderId) continue
        const mapping = collectionMap[parentId]
        if (mapping) return mapping.collection
    }
    return "supplemental"
}

function chooseFileName(file: DriveFile): string {
    const raw = (file.name ?? "").trim()
    return raw || `drive-${file.id ?? "unknown"}`
}

/**
 * Firestore admin SDK rejects `undefined` field values. Strip any
 * keys whose value is `undefined` from a payload before passing to
 * `set` / `update`. (We keep explicit `null` — it's a valid Firestore
 * value and we use it for "cleared" state.)
 */
function stripUndefined<T extends Record<string, unknown>>(payload: T): T {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) out[k] = v
    }
    return out as T
}

function dropExt(name: string): string {
    return name.replace(/\.[^/.]+$/, "")
}

function isGoogleNativeDoc(mimeType?: string): boolean {
    if (!mimeType) return false
    return mimeType.startsWith("application/vnd.google-apps.")
}

async function enqueueFailure(
    db: Firestore,
    file: DriveFile,
    status: ChartImportQueueStatus,
    errorMessage: string,
    nowIso: string,
): Promise<void> {
    if (!file.id) return
    const queueRef = db.collection("chartImportQueue").doc(file.id)
    const existing = await queueRef.get()
    const attemptCount =
        existing.exists && typeof existing.data()?.attemptCount === "number"
            ? (existing.data()!.attemptCount as number) + 1
            : 1
    const firstSeenAt =
        existing.exists && typeof existing.data()?.firstSeenAt === "string"
            ? (existing.data()!.firstSeenAt as string)
            : nowIso
    await queueRef.set(
        stripUndefined({
            driveFileId: file.id,
            driveName: file.name ?? null,
            driveMimeType: file.mimeType ?? null,
            parents: file.parents ?? null,
            md5Checksum: file.md5Checksum ?? null,
            status,
            errorMessage,
            attemptCount,
            firstSeenAt,
            lastAttemptAt: nowIso,
        }),
    )
}

async function clearQueue(db: Firestore, driveFileId: string): Promise<void> {
    try {
        await db.collection("chartImportQueue").doc(driveFileId).delete()
    } catch {
        /* idempotent */
    }
}

async function findRowByDriveFileId(
    db: Firestore,
    driveFileId: string,
): Promise<
    | { docId: string; data: Record<string, unknown> }
    | null
> {
    const snap = await db
        .collection("library_index")
        .where("driveFileId", "==", driveFileId)
        .limit(1)
        .get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return { docId: doc.id, data: doc.data() as Record<string, unknown> }
}

async function fetchDriveBytes(
    deps: DriveSyncDeps,
    fileId: string,
): Promise<Buffer> {
    const bytes = await deps.drive.getFile(fileId)
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
}

interface HandleNewFileOutcome {
    kind: "imported" | "queued" | "skipped"
    error?: string
    queueStatus?: ChartImportQueueStatus
}

async function handleNewFile(
    deps: DriveSyncDeps,
    file: DriveFile,
    collection: LibraryCollection,
): Promise<HandleNewFileOutcome> {
    if (isGoogleNativeDoc(file.mimeType)) {
        return {
            kind: "queued",
            queueStatus: "google_doc_skipped",
            error: `Drive file ${file.id} is a native Google ${file.mimeType?.replace(
                "application/vnd.google-apps.",
                "",
            )} document — export to PDF first.`,
        }
    }
    let buffer: Buffer
    try {
        buffer = await fetchDriveBytes(deps, file.id!)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const queueStatus: ChartImportQueueStatus = /not found|404/i.test(msg)
            ? "drive_404"
            : /permission|403/i.test(msg)
              ? "permission_lost"
              : "unknown"
        return { kind: "queued", queueStatus, error: msg }
    }
    if (buffer.byteLength === 0) {
        return {
            kind: "queued",
            queueStatus: "unknown",
            error: `Drive file ${file.id} returned empty bytes`,
        }
    }
    const driveName = chooseFileName(file)
    const result = await deps.processor({
        buffer,
        originalFileName: driveName,
        mimeType: file.mimeType ?? "application/octet-stream",
        title: dropExt(driveName),
        collection,
        uploaderUid: "cron:drive-sync",
        uploaderEmail: "drive-sync@cron.internal",
        source: "drive-sync",
        driveMetadata: {
            driveFileId: file.id!,
            modifiedTime: file.modifiedTime,
            md5Checksum: file.md5Checksum,
            parents: file.parents,
        },
    })
    if (result.ok) return { kind: "imported" }
    // Map processor error codes → queue statuses.
    const queueStatus: ChartImportQueueStatus =
        result.code === "duplicate_exact" || result.code === "duplicate_similar"
            ? "dedup_blocked"
            : result.code === "convert_failed"
              ? "conversion_failed"
              : result.code === "invalid_type"
                ? "mime_unrecognized"
                : result.code === "too_large" || result.code === "empty_file"
                  ? "unknown"
                  : result.code === "server_error"
                    ? "storage_failed"
                    : "unknown"
    return { kind: "queued", queueStatus, error: result.error }
}

interface HandleExistingFileOutcome {
    kind: "renamed" | "replaced" | "moved" | "skipped" | "queued"
    error?: string
    queueStatus?: ChartImportQueueStatus
}

async function handleExistingFile(
    deps: DriveSyncDeps,
    file: DriveFile,
    existing: { docId: string; data: Record<string, unknown> },
    parentFolderId: string,
    collectionMap: Record<string, SubfolderMapEntry>,
    nowIso: string,
): Promise<HandleExistingFileOutcome> {
    const db = deps.db
    const row = existing.data
    const rowMd5 = typeof row.driveMd5 === "string" ? (row.driveMd5 as string) : undefined
    const rowName = typeof row.name === "string" ? (row.name as string) : ""
    const rowCollection =
        typeof row.collection === "string"
            ? (row.collection as LibraryCollection)
            : "supplemental"
    const rowParents = Array.isArray(row.driveParents)
        ? (row.driveParents as string[])
        : []
    const driveName = chooseFileName(file)
    const newTitle = dropExt(driveName)
    const newCollection = resolveCollectionForFile(
        file,
        parentFolderId,
        collectionMap,
    )

    const md5Advanced =
        !!file.md5Checksum && !!rowMd5 && file.md5Checksum !== rowMd5
    const md5Unknown = !file.md5Checksum || !rowMd5
    const nameChanged = driveName !== row.originalName && newTitle !== rowName
    const parentsChanged =
        file.parents &&
        (file.parents.length !== rowParents.length ||
            file.parents.some((p) => !rowParents.includes(p)))
    const collectionChanged = newCollection !== rowCollection

    // REPLACE: md5 advanced — rewrite Storage bytes, version-bump library row.
    if (md5Advanced) {
        if (isGoogleNativeDoc(file.mimeType)) {
            return {
                kind: "queued",
                queueStatus: "google_doc_skipped",
                error: `Replace skipped: ${file.id} is a Google-native doc.`,
            }
        }
        let buffer: Buffer
        try {
            buffer = await fetchDriveBytes(deps, file.id!)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            const queueStatus: ChartImportQueueStatus = /not found|404/i.test(
                msg,
            )
                ? "drive_404"
                : /permission|403/i.test(msg)
                  ? "permission_lost"
                  : "unknown"
            return { kind: "queued", queueStatus, error: msg }
        }
        try {
            await uploadToStorage(
                existing.docId,
                buffer,
                (typeof row.mimeType === "string" ? row.mimeType : file.mimeType) ??
                    "application/pdf",
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return {
                kind: "queued",
                queueStatus: "storage_failed",
                error: `Storage rewrite failed: ${msg}`,
            }
        }
        const updates: Record<string, unknown> = {
            fileSize: buffer.byteLength,
            modifiedTime: nowIso,
        }
        if (file.md5Checksum) updates.driveMd5 = file.md5Checksum
        if (file.modifiedTime) updates.driveModifiedTime = file.modifiedTime
        if (nameChanged) {
            updates.name = newTitle
            updates.nameLower = newTitle.toLowerCase()
            updates.normalizedName = newTitle
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
            updates.originalName = driveName
        }
        if (collectionChanged) updates.collection = newCollection
        if (parentsChanged && file.parents) updates.driveParents = file.parents
        await db
            .collection("library_index")
            .doc(existing.docId)
            .update(stripUndefined(updates))
        await db.collection("library_signals").doc("latest").set({
            at: nowIso,
            fileId: existing.docId,
            op: "drive-sync:replace",
            by: "cron:drive-sync",
        })
        return { kind: "replaced" }
    }

    // MOVE: parents changed → update collection if the new subfolder maps differently.
    if (parentsChanged && collectionChanged) {
        const moveUpdates: Record<string, unknown> = {
            collection: newCollection,
        }
        if (file.parents) moveUpdates.driveParents = file.parents
        if (file.modifiedTime) moveUpdates.driveModifiedTime = file.modifiedTime
        await db
            .collection("library_index")
            .doc(existing.docId)
            .update(stripUndefined(moveUpdates))
        return { kind: "moved" }
    }

    // RENAME: md5 unchanged (or unknown) but name changed → update name fields only.
    if (nameChanged && !md5Advanced) {
        const updates: Record<string, unknown> = {
            name: newTitle,
            nameLower: newTitle.toLowerCase(),
            normalizedName: newTitle
                .toLowerCase()
                .replace(/[^a-z0-9]/g, ""),
            originalName: driveName,
        }
        if (file.modifiedTime) updates.driveModifiedTime = file.modifiedTime
        if (parentsChanged && file.parents) updates.driveParents = file.parents
        if (collectionChanged) updates.collection = newCollection
        await db
            .collection("library_index")
            .doc(existing.docId)
            .update(stripUndefined(updates))
        return { kind: "renamed" }
    }

    // No-op: modifiedTime bumped but nothing we care about changed.
    if (md5Unknown && !nameChanged && !parentsChanged && file.modifiedTime) {
        await db
            .collection("library_index")
            .doc(existing.docId)
            .update({ driveModifiedTime: file.modifiedTime })
    }
    return { kind: "skipped" }
}

export async function refreshSubfolders(
    deps: DriveSyncDeps,
    parentFolderId: string,
    existingMap: Record<string, SubfolderMapEntry>,
): Promise<{
    subfolderIds: string[]
    collectionMap: Record<string, SubfolderMapEntry>
}> {
    const q = `'${parentFolderId}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`
    const folders: DriveFile[] = []
    let pageToken: string | undefined = undefined
    do {
        const res = await deps.drive.listFilesByQuery({
            q,
            fields: "nextPageToken, files(id, name, mimeType)",
            pageSize: 100,
            pageToken,
            orderBy: "name",
        })
        folders.push(...(res.files as DriveFile[]))
        pageToken = res.nextPageToken ?? undefined
    } while (pageToken)

    const subfolderIds: string[] = []
    const nextMap: Record<string, SubfolderMapEntry> = {}
    for (const f of folders) {
        if (!f.id) continue
        subfolderIds.push(f.id)
        const prior = existingMap[f.id]
        nextMap[f.id] = {
            name: f.name ?? prior?.name ?? f.id,
            collection: prior?.collection ?? "supplemental",
        }
    }
    return { subfolderIds, collectionMap: nextMap }
}

function buildModifiedSinceQuery(
    parentFolderId: string,
    subfolderIds: string[],
    lastPollAt: string,
): string {
    const parents = [parentFolderId, ...subfolderIds]
    const parentsClause = parents.map((p) => `'${p}' in parents`).join(" or ")
    return `trashed = false and mimeType != '${DRIVE_FOLDER_MIME}' and modifiedTime > '${lastPollAt}' and (${parentsClause})`
}

export async function runDriveSync(opts: {
    deps: DriveSyncDeps
    parentFolderId: string
    perTickFileCap?: number
}): Promise<DriveSyncResult> {
    const { deps, parentFolderId } = opts
    const fileCap = opts.perTickFileCap ?? DEFAULT_PER_TICK_FILE_CAP
    const nowIso = deps.now().toISOString()
    const result: DriveSyncResult = {
        watching: true,
        parentFolderId,
        subfolderIds: [],
        filesScanned: 0,
        imported: 0,
        renamed: 0,
        replaced: 0,
        moved: 0,
        skipped: 0,
        queued: 0,
        errors: [],
    }

    const { state, isFirstTick } = await loadOrInitWatchState(
        deps.db,
        parentFolderId,
        nowIso,
    )
    let workingState = state

    // Subfolder refresh — cheap and idempotent.
    try {
        const refreshed = await refreshSubfolders(
            deps,
            parentFolderId,
            workingState.collectionMap,
        )
        workingState = {
            ...workingState,
            subfolderIds: refreshed.subfolderIds,
            collectionMap: refreshed.collectionMap,
        }
        result.subfolderIds = refreshed.subfolderIds
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        workingState = {
            ...workingState,
            consecutiveFailures: workingState.consecutiveFailures + 1,
            lastError: `subfolder refresh failed: ${msg}`,
            lastTickAt: nowIso,
        }
        await deps.db
            .collection("driveWatchState")
            .doc(parentFolderId)
            .set(stripUndefined(workingState))
        result.errors.push(`subfolder refresh failed: ${msg}`)
        return result
    }

    // First-tick guard: even if Drive has historical files modified since
    // 1970, we kept lastPollAt = now() so this tick is a no-op for files.
    if (isFirstTick) {
        await deps.db
            .collection("driveWatchState")
            .doc(parentFolderId)
            .set({
                ...workingState,
                lastSuccessfulSyncAt: nowIso,
                lastTickAt: nowIso,
                consecutiveFailures: 0,
                lastError: null,
            })
        return result
    }

    // Modified-since query across parent + subfolders.
    const q = buildModifiedSinceQuery(
        parentFolderId,
        workingState.subfolderIds,
        workingState.lastPollAt,
    )

    let pageToken: string | undefined = undefined
    const files: DriveFile[] = []
    try {
        while (files.length < fileCap) {
            const res = await deps.drive.listFilesByQuery({
                q,
                pageSize: Math.min(100, fileCap - files.length),
                pageToken,
                orderBy: "modifiedTime",
            })
            files.push(...(res.files as DriveFile[]))
            pageToken = res.nextPageToken ?? undefined
            if (!pageToken) break
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        workingState = {
            ...workingState,
            consecutiveFailures: workingState.consecutiveFailures + 1,
            lastError: `list query failed: ${msg}`,
            lastTickAt: nowIso,
        }
        await deps.db
            .collection("driveWatchState")
            .doc(parentFolderId)
            .set(stripUndefined(workingState))
        result.errors.push(`list query failed: ${msg}`)
        return result
    }

    result.filesScanned = files.length

    // Sort ascending by modifiedTime so partial-success advances lastPollAt
    // cleanly. Drive's orderBy=modifiedTime is ascending by default.
    files.sort((a, b) =>
        (a.modifiedTime ?? "").localeCompare(b.modifiedTime ?? ""),
    )

    let latestProcessedModifiedTime: string | undefined = undefined

    for (const file of files) {
        if (!file.id) continue
        const collection = resolveCollectionForFile(
            file,
            parentFolderId,
            workingState.collectionMap,
        )
        try {
            const existing = await findRowByDriveFileId(deps.db, file.id)
            if (!existing) {
                const outcome = await handleNewFile(deps, file, collection)
                if (outcome.kind === "imported") {
                    result.imported++
                    await clearQueue(deps.db, file.id)
                } else if (outcome.kind === "queued") {
                    result.queued++
                    await enqueueFailure(
                        deps.db,
                        file,
                        outcome.queueStatus ?? "unknown",
                        outcome.error ?? "unknown error",
                        nowIso,
                    )
                    if (result.errors.length < 20 && outcome.error) {
                        result.errors.push(`${file.id}: ${outcome.error}`)
                    }
                } else {
                    result.skipped++
                }
            } else {
                const outcome = await handleExistingFile(
                    deps,
                    file,
                    existing,
                    parentFolderId,
                    workingState.collectionMap,
                    nowIso,
                )
                if (outcome.kind === "renamed") result.renamed++
                else if (outcome.kind === "replaced") result.replaced++
                else if (outcome.kind === "moved") result.moved++
                else if (outcome.kind === "skipped") result.skipped++
                else if (outcome.kind === "queued") {
                    result.queued++
                    await enqueueFailure(
                        deps.db,
                        file,
                        outcome.queueStatus ?? "unknown",
                        outcome.error ?? "unknown error",
                        nowIso,
                    )
                    if (result.errors.length < 20 && outcome.error) {
                        result.errors.push(`${file.id}: ${outcome.error}`)
                    }
                }
            }
            if (
                file.modifiedTime &&
                (!latestProcessedModifiedTime ||
                    file.modifiedTime > latestProcessedModifiedTime)
            ) {
                latestProcessedModifiedTime = file.modifiedTime
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            result.queued++
            await enqueueFailure(deps.db, file, "unknown", msg, nowIso).catch(
                () => undefined,
            )
            if (result.errors.length < 20) {
                result.errors.push(`${file.id}: ${msg}`)
            }
            logger.warn(`[drive-sync] file ${file.id} failed: ${msg}`)
        }
    }

    // Advance lastPollAt to the latest modifiedTime we observed (whether
    // successful or queued for failure) — so a poisoned file doesn't pin
    // the cron at the same boundary forever. The chartImportQueue carries
    // the retry surface.
    const advanced =
        latestProcessedModifiedTime ?? workingState.lastPollAt
    result.advancedLastPollAt = advanced
    workingState = {
        ...workingState,
        lastPollAt: advanced,
        lastSuccessfulSyncAt: nowIso,
        lastTickAt: nowIso,
        consecutiveFailures: 0,
        lastError: null,
    }
    await deps.db
        .collection("driveWatchState")
        .doc(parentFolderId)
        .set(workingState)

    return result
}

/** Convenience wrapper using the real DriveClient + processChartUpload. */
export async function runDriveSyncProd(
    db: Firestore,
    parentFolderId: string,
): Promise<DriveSyncResult> {
    const drive = new DriveClient()
    return runDriveSync({
        deps: {
            drive,
            db,
            processor: processChartUpload,
            now: () => new Date(),
        },
        parentFolderId,
    })
}
