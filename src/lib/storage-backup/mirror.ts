import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import { DriveClient } from "@/lib/google-drive"
import {
    getStorageObjectMd5,
    downloadFromStoragePath,
} from "@/lib/firebase-storage"
import { inferChartExt } from "@/lib/chart-heal"
import { logger } from "@/lib/logger"

/**
 * storage-phase2 — Storage→Drive chart-byte mirror (pure, dependency-injected
 * core for `/api/cron/storage-backup`).
 *
 * Mirrors every `library_index` `status=='active'` chart's bytes from Firebase
 * Storage into a dedicated Drive **Shared Drive** (`CRC_BACKUP_DRIVE_FOLDER_ID`)
 * — the off-Firebase, human-browsable, Daniel-restorable copy from
 * `STORAGE-BACKUP-SYNTHESIS.md` Layer 2. Idempotent + self-healing:
 *
 *   - per active row, compare Storage md5 (base64→hex) to the Drive mirror's
 *     `md5Checksum`: absent → CREATE, match → SKIP (zero downloads in steady
 *     state), differ → UPDATE media (Drive keeps the prior revision for free)
 *   - record the backup pointer (`library_index.backupDriveId`) at mirror time
 *     so a restore keys on a recorded pointer, NOT on fileId==Drive-id (the
 *     exact reason reconcile_library can't recover the upload-keyed majority).
 *     This is Lane B's #1 structural requirement.
 *   - stamp backup files `appProperties:{crcBackup:"1"}` (loop-avoidance, paired
 *     with the dedicated-folder guard + the drive-sync importer skip).
 *
 * The DriveClient, Firestore, and Storage readers are injected so the suite can
 * drive the whole mirror against the emulator + a mock Drive with no real API
 * calls (mirrors the drive-sync poller's DI shape).
 */

export interface StorageBackupDeps {
    db: Firestore
    drive: Pick<
        DriveClient,
        "listFilesByQuery" | "ensureFolder" | "uploadBinaryFile" | "updateFileMedia"
    >
    /** Storage md5 (base64) + size + exact path, no download. null = no object. */
    getStorageMd5: (
        fileId: string,
        mimeType?: string,
    ) => Promise<{ md5Base64: string; size: number; path: string } | null>
    /** Download bytes at an exact Storage path. null on miss/error. */
    downloadStoragePath: (
        path: string,
    ) => Promise<{ buffer: Buffer; contentType: string } | null>
    now: () => Date
    /** CRC_BACKUP_DRIVE_FOLDER_ID. Empty/undefined → graceful no-op. */
    backupFolderId: string | undefined
    /**
     * Safety valve: max CREATE+UPDATE operations per run, so the first bulk
     * mirror (whole active set) self-heals across a few nightly ticks instead
     * of risking the 300s cron budget. SKIP rows don't count. Idempotent, so a
     * capped run is safe — the rest land next tick. Default 200.
     */
    maxMirrorsPerRun?: number
}

export interface StorageBackupResult {
    /** false only when backupFolderId is unset (dormant no-op). */
    ran: boolean
    scanned: number
    /** created + updated. */
    mirrored: number
    created: number
    updated: number
    skipped: number
    /** rows left for a later tick because maxMirrorsPerRun was hit. */
    deferred: number
    failed: number
    bytesMirrored: number
    /** bounded to 20 entries. */
    errors: string[]
    lastError: string | null
}

/** GCS stores the content MD5 base64-encoded; Drive reports it as lowercase hex. */
export function md5Base64ToHex(b64: string): string {
    return Buffer.from(b64, "base64").toString("hex")
}

/** Drive-name-safe stem: collapse whitespace, drop path/control chars, cap length. */
export function sanitizeStem(stem: string): string {
    const cleaned = stem
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[/\\]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120)
    return cleaned || "chart"
}

/** Deterministic backup filename: `<stem>__<fileId><ext>`. */
export function backupFileName(
    stem: string,
    fileId: string,
    mimeType: string,
): string {
    return `${sanitizeStem(stem)}__${fileId}${inferChartExt(mimeType)}`
}

/**
 * Extract the embedded `fileId` from a backup filename so the mirror finds an
 * existing backup by its STABLE fileId even if the human-friendly stem was
 * renamed (the `__` delimiter never appears inside a fileId: `upload-<uuid>`
 * uses single hyphens; raw Drive ids have no `__`).
 */
export function fileIdFromBackupName(name: string): string | null {
    const base = name.replace(/\.(pdf|xml|mp3)$/i, "")
    const idx = base.lastIndexOf("__")
    return idx >= 0 ? base.slice(idx + 2) : null
}

function pickStem(row: Record<string, unknown>, fileId: string): string {
    const stem = typeof row.stem === "string" && row.stem.trim() ? row.stem : ""
    const name = typeof row.name === "string" && row.name.trim() ? row.name : ""
    const nameLower =
        typeof row.nameLower === "string" && row.nameLower.trim() ? row.nameLower : ""
    return stem || name || nameLower || fileId
}

export async function runStorageBackup(
    deps: StorageBackupDeps,
): Promise<StorageBackupResult> {
    try {
        return await runStorageBackupInner(deps)
    } catch (err) {
        // Fail-loud: write the real exception into a doc anyone can read via MCP
        // so the next failure self-diagnoses without log archaeology. Best-effort;
        // a recording failure must NOT double-fault — swallow it and re-throw the
        // original error so the route handler still returns 500.
        await writeStorageBackupError(deps.db, err, deps.now())
        throw err
    }
}

async function runStorageBackupInner(
    deps: StorageBackupDeps,
): Promise<StorageBackupResult> {
    const result: StorageBackupResult = {
        ran: true,
        scanned: 0,
        mirrored: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        deferred: 0,
        failed: 0,
        bytesMirrored: 0,
        errors: [],
        lastError: null,
    }
    const pushErr = (msg: string) => {
        result.lastError = msg
        if (result.errors.length < 20) result.errors.push(msg)
    }

    if (!deps.backupFolderId) {
        return { ...result, ran: false }
    }
    const cap = deps.maxMirrorsPerRun ?? 200

    // charts/ wrapper under the backup root (collection subfolders live below it).
    const chartsRootId = await deps.drive.ensureFolder({
        name: "charts",
        parentId: deps.backupFolderId,
    })

    const snap = await deps.db
        .collection("library_index")
        .where("status", "==", "active")
        .get()
    result.scanned = snap.size

    // Caches: one ensureFolder + one folder-listing per collection per run.
    const collectionFolderIds = new Map<string, string>()
    // collection folderId → (fileId → { id, name, md5Checksum })
    const folderListings = new Map<
        string,
        Map<string, { id: string; name: string; md5Checksum?: string }>
    >()

    const ensureCollectionFolder = async (collection: string): Promise<string> => {
        const cached = collectionFolderIds.get(collection)
        if (cached) return cached
        const id = await deps.drive.ensureFolder({
            name: collection,
            parentId: chartsRootId,
        })
        collectionFolderIds.set(collection, id)
        return id
    }

    const listFolder = async (folderId: string) => {
        const cached = folderListings.get(folderId)
        if (cached) return cached
        const byFileId = new Map<
            string,
            { id: string; name: string; md5Checksum?: string }
        >()
        let pageToken: string | undefined = undefined
        do {
            const res = await deps.drive.listFilesByQuery({
                q: `'${folderId}' in parents and trashed = false`,
                fields: "nextPageToken, files(id, name, md5Checksum)",
                pageSize: 100,
                pageToken,
            })
            for (const f of res.files) {
                if (!f.id || !f.name) continue
                const fid = fileIdFromBackupName(f.name)
                if (fid) byFileId.set(fid, { id: f.id, name: f.name, md5Checksum: f.md5Checksum })
            }
            pageToken = res.nextPageToken ?? undefined
        } while (pageToken)
        folderListings.set(folderId, byFileId)
        return byFileId
    }

    let mirrorOps = 0

    for (const doc of snap.docs) {
        const fileId = doc.id
        const row = doc.data() as Record<string, unknown>
        const mimeType =
            typeof row.mimeType === "string" && row.mimeType
                ? row.mimeType
                : "application/pdf"
        const collection =
            typeof row.collection === "string" && row.collection
                ? row.collection
                : "uploads"
        const expectedName = backupFileName(pickStem(row, fileId), fileId, mimeType)

        try {
            const storage = await deps.getStorageMd5(fileId, mimeType)
            if (!storage || !storage.md5Base64) {
                // Active row with no Storage bytes (or md5 unreadable) — not the
                // backup's job to heal; reconcile_library owns that. Skip.
                result.skipped++
                pushErr(`${fileId}: no Storage object (skipped)`)
                continue
            }
            const storageHex = md5Base64ToHex(storage.md5Base64)

            const collFolderId = await ensureCollectionFolder(collection)
            const listing = await listFolder(collFolderId)
            const existing = listing.get(fileId)

            // SKIP — already mirrored, byte-identical. Heal the pointer if absent.
            if (existing && existing.md5Checksum && existing.md5Checksum === storageHex) {
                result.skipped++
                if (row.backupDriveId !== existing.id) {
                    await deps.db
                        .collection("library_index")
                        .doc(fileId)
                        .set({ backupDriveId: existing.id }, { merge: true })
                }
                continue
            }

            // CREATE or UPDATE needs bytes — respect the per-run cap.
            if (mirrorOps >= cap) {
                result.deferred++
                continue
            }

            const bytes = await deps.downloadStoragePath(storage.path)
            if (!bytes) {
                result.failed++
                pushErr(`${fileId}: Storage download failed at ${storage.path}`)
                continue
            }

            if (existing) {
                const upd = await deps.drive.updateFileMedia(
                    existing.id,
                    bytes.buffer,
                    mimeType,
                )
                mirrorOps++
                result.updated++
                result.mirrored++
                result.bytesMirrored += bytes.buffer.byteLength
                listing.set(fileId, {
                    id: existing.id,
                    name: existing.name,
                    md5Checksum: upd.md5Checksum,
                })
                if (row.backupDriveId !== existing.id) {
                    await deps.db
                        .collection("library_index")
                        .doc(fileId)
                        .set({ backupDriveId: existing.id }, { merge: true })
                }
            } else {
                const created = await deps.drive.uploadBinaryFile({
                    name: expectedName,
                    mimeType,
                    buffer: bytes.buffer,
                    parents: [collFolderId],
                    appProperties: { crcBackup: "1" },
                })
                if (!created.id) throw new Error("Drive create returned no id")
                mirrorOps++
                result.created++
                result.mirrored++
                result.bytesMirrored += bytes.buffer.byteLength
                listing.set(fileId, {
                    id: created.id,
                    name: expectedName,
                    md5Checksum: created.md5Checksum,
                })
                await deps.db
                    .collection("library_index")
                    .doc(fileId)
                    .set({ backupDriveId: created.id }, { merge: true })
            }
        } catch (err) {
            result.failed++
            pushErr(`${fileId}: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    return result
}

/**
 * Shape of the fail-loud error payload written to Firestore on a thrown run.
 * Exposed so the route-level defense-in-depth catch (route.ts) can write the
 * same shape if the mirror crashes before reaching its own catch.
 */
export interface StorageBackupErrorPayload {
    message: string
    name: string
    stack: string | null
    httpStatus: number | null
}

function buildErrorPayload(err: unknown): StorageBackupErrorPayload {
    const e = err instanceof Error ? err : null
    let httpStatus: number | null = null
    if (err && typeof err === "object") {
        const o = err as { response?: { status?: unknown }; code?: unknown }
        if (typeof o.response?.status === "number") httpStatus = o.response.status
        else if (typeof o.code === "number") httpStatus = o.code
    }
    return {
        message: e?.message ?? String(err),
        name: e?.name ?? "UnknownError",
        stack: e?.stack ? e.stack.slice(0, 2000) : null,
        httpStatus,
    }
}

/**
 * Fail-loud breadcrumb writer. On a thrown run, writes the real exception text +
 * stack into `storageBackups/{YYYY-MM-DD}` + sets `config/storageBackup.lastError`
 * so the next failure self-diagnoses without log archaeology. **Best-effort:**
 * any Firestore write failure here is swallowed (logged only) — the caller
 * re-throws the original error so the route returns 500 to the caller and we
 * don't double-fault.
 *
 * `merge: true` on both writes is load-bearing: same-day prior success fields
 * (`lastBackupAt`, counts) are preserved, and a duplicate write from a
 * defense-in-depth route-level catch overlays idempotently.
 *
 * Exported so the route handler (`/api/cron/storage-backup`) can write the same
 * shape if the mirror crashed BEFORE reaching its own catch (e.g. `new
 * DriveClient()` threw, or `getFirestore()` returned a broken handle).
 */
export async function writeStorageBackupError(
    db: Firestore,
    err: unknown,
    now: Date,
): Promise<void> {
    try {
        const errorPayload = buildErrorPayload(err)
        const iso = now.toISOString()
        const dateKey = iso.slice(0, 10)
        await db.collection("storageBackups").doc(dateKey).set(
            {
                ran: false,
                dormant: false,
                error: errorPayload,
                lastError: errorPayload.message,
                attemptedAt: now,
                lastTickAt: now,
                timestamp: iso,
            },
            { merge: true },
        )
        await db.collection("config").doc("storageBackup").set(
            {
                lastError: errorPayload.message,
                lastErrorAt: now,
                lastTickAt: now,
                dormant: false,
            },
            { merge: true },
        )
    } catch (catchErr) {
        // Defense in depth: never double-fault. The route-level catch may also
        // try to write a breadcrumb; log and let the original error propagate.
        logger.warn(
            `[storage-backup] failed to record fail-loud error doc: ${
                catchErr instanceof Error ? catchErr.message : String(catchErr)
            }`,
        )
    }
}

/**
 * Dormant-tick heartbeat. The route hits its `CRC_BACKUP_DRIVE_FOLDER_ID`-unset
 * early return BEFORE `runStorageBackupProd` runs, so neither `recordStorageBackupRun`
 * (success) nor `writeStorageBackupError` (failure) ever writes a doc. Without
 * this heartbeat PGR-03 sees a permanently missing `config/storageBackup` and
 * silently fail-opens — the "silent death" failure mode (see
 * `.paul/research/storage-backup-silent-death/DIAGNOSIS.md`).
 *
 * Writes `lastTickAt` + `dormant: true` + `dormantReason` to both
 * `config/storageBackup` (merge) and `storageBackups/{YYYY-MM-DD}` (merge so a
 * same-day prior real run is preserved). Critically does NOT touch
 * `lastBackupAt` (dormant != successful backup) or `lastError` (dormant !=
 * error). Fail-open — a Firestore write failure is logged but the route still
 * returns 200 with `ran: false`.
 */
export async function writeStorageBackupDormantHeartbeat(
    db: Firestore,
    now: Date,
    reason: string,
): Promise<void> {
    try {
        const iso = now.toISOString()
        const dateKey = iso.slice(0, 10)
        await db.collection("config").doc("storageBackup").set(
            {
                lastTickAt: now,
                dormant: true,
                dormantReason: reason,
            },
            { merge: true },
        )
        await db.collection("storageBackups").doc(dateKey).set(
            {
                ran: false,
                dormant: true,
                dormantReason: reason,
                lastTickAt: now,
                timestamp: iso,
            },
            { merge: true },
        )
    } catch (catchErr) {
        logger.warn(
            `[storage-backup] failed to record dormant heartbeat: ${
                catchErr instanceof Error ? catchErr.message : String(catchErr)
            }`,
        )
    }
}

/**
 * Persist the run outcome for observability (mirrors `/api/cron/backup`'s
 * `config/backup` + `backups/{date}` pattern). `config/storageBackup` is the
 * single latest-run pointer; `storageBackups/{YYYY-MM-DD}` is the dated audit
 * trail so a future staleness alarm can detect a silent death (the failure
 * class that left the Firestore backup dead for 3 months). Same-day reruns
 * overwrite. Fail-open: a recording failure never fails the backup.
 */
export async function recordStorageBackupRun(
    db: Firestore,
    result: StorageBackupResult,
    now: Date,
): Promise<void> {
    const iso = now.toISOString()
    const dateKey = iso.slice(0, 10)
    const audit = {
        ts: now,
        timestamp: iso,
        ran: result.ran,
        dormant: false,
        scanned: result.scanned,
        mirrored: result.mirrored,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        deferred: result.deferred,
        failed: result.failed,
        bytesMirrored: result.bytesMirrored,
        lastError: result.lastError,
        lastTickAt: now,
    }
    try {
        await db.collection("config").doc("storageBackup").set(
            { lastBackupAt: now, ...audit },
            { merge: true },
        )
        await db.collection("storageBackups").doc(dateKey).set(audit)
    } catch (err) {
        logger.warn(
            `[storage-backup] failed to record audit doc: ${err instanceof Error ? err.message : String(err)}`,
        )
    }
}

/**
 * Production wiring for `/api/cron/storage-backup` (mirrors
 * `runDriveSyncProd`). Builds the real DriveClient + Storage readers, runs the
 * mirror, and records the audit doc. `backupFolderId` unset → dormant no-op.
 */
export async function runStorageBackupProd(
    db: Firestore,
    backupFolderId: string | undefined,
    opts?: { maxMirrorsPerRun?: number },
): Promise<StorageBackupResult> {
    const drive = new DriveClient()
    const now = () => new Date()
    const result = await runStorageBackup({
        db,
        drive,
        getStorageMd5: (fileId, mimeType) => getStorageObjectMd5(fileId, mimeType),
        downloadStoragePath: async (path) => {
            const res = await downloadFromStoragePath(path)
            return res.success ? res.data : null
        },
        now,
        backupFolderId,
        maxMirrorsPerRun: opts?.maxMirrorsPerRun,
    })
    await recordStorageBackupRun(db, result, now())
    return result
}
