/**
 * Batch chart intake — Drive folder listing + shared "fetch these Drive bytes
 * ready for `processChartUpload`" helper.
 *
 * No `import "server-only"` here on purpose. Every dependency is pure:
 *  - `@/lib/google-drive` for `driveSourceIsConvertible` (a pure mime table)
 *    and the `DriveClient` TYPE only (erased at compile time),
 *  - `@/lib/library/chart-file-types` for the shared extension→mime table.
 * Nothing reaches Firebase, the filesystem, or the network at import time, so
 * the unit tests can drive a plain fake object through `DriveLike`.
 *
 * Callers:
 *  - `import_chart_from_drive` (MCP) — single-file path, uses
 *    `deriveDriveUploadTyping` + `fetchDriveFileForUpload`.
 *  - `import_drive_folder` (MCP) + its Inngest processor — folder path, uses
 *    `listDriveFolderCharts` then `fetchDriveFileForUpload` per candidate.
 */
import type { DriveClient } from "@/lib/google-drive"
import { driveSourceIsConvertible } from "@/lib/google-drive"
import { resolveChartMime } from "@/lib/library/chart-file-types"

/** Drive's mime for a folder. */
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"

/**
 * Per-file ceiling for batch intake. Drive happily hosts 200 MB scans; pulling
 * one through a serverless function's memory to `processChartUpload` is not a
 * batch-intake job, so oversized files are reported as skipped rather than
 * attempted.
 */
export const MAX_DRIVE_FILE_BYTES = 25 * 1024 * 1024

/** Deepest folder level `listDriveFolderCharts` will list (the root is 1). */
export const MAX_FOLDER_DEPTH = 3

/** Drive `files.list` field set the folder walk needs. */
const LIST_FIELDS =
    "nextPageToken, files(id, name, mimeType, modifiedTime, parents, md5Checksum, size)"

export interface DriveChartCandidate {
    driveFileId: string
    name: string
    mimeType: string
    sizeBytes: number
    md5Checksum?: string
    modifiedTime?: string
    parents?: string[]
}

export type DriveSkipReason = "folder" | "unsupported_type" | "too_large"

export interface DriveSkippedEntry {
    name: string
    reason: DriveSkipReason
}

/**
 * The slice of `DriveClient` these helpers use. Taking a `Pick` instead of the
 * class keeps the helpers unit-testable with a literal object and keeps the
 * real client's constructor (which builds a `GoogleAuth`) out of tests.
 */
export type DriveLike = Pick<
    DriveClient,
    "getFileMetadata" | "listFilesByQuery" | "getFile" | "fetchAsPdf"
>

/** The two metadata fields the upload typing actually reads. */
export interface DriveFileMetadataLike {
    name?: string | null
    mimeType?: string | null
}

export type DriveFetchFailureCode =
    | "drive_not_found"
    | "drive_forbidden"
    | "unsupported_type"
    | "empty_file"
    | "drive_error"

export type FetchDriveFileResult =
    | {
          ok: true
          buffer: Buffer
          mimeType: string
          originalFileName: string
          driveName: string
          driveMime: string
      }
    | { ok: false; code: DriveFetchFailureCode; message: string }

/**
 * Mirror of `musicMimeFromFileName` in `@/lib/library-upload`. That module is
 * `server-only` and statically pulls heic-convert + the MuseScore converter +
 * Firebase Admin, so importing it here would drag all of it into the browser
 * bundle and into these unit tests.
 *
 * Deliberately NOT `resolveChartMime`: the two tables disagree on `.mxl`
 * (`resolveChartMime` → `application/vnd.recordare.musicxml`, this one →
 * `…musicxml+xml`) and `import_chart_from_drive` has shipped the `+xml`
 * value since musicxml-health Phase 2. Changing it would re-route existing
 * MusicXML rows in Perform, so the historical behaviour is preserved
 * verbatim. `resolveChartMime` is still the acceptance test for folder
 * listing, where there is no historical value to preserve.
 */
function musicMimeFromDriveName(fileName: string | undefined | null): string | null {
    const ext = fileName?.toLowerCase().match(/\.(mxl|musicxml|xml|mscz|mscx)$/)?.[1]
    if (!ext) return null
    if (ext === "mscz") return "application/x-musescore"
    if (ext === "mscx") return "application/x-musescore+xml"
    return "application/vnd.recordare.musicxml+xml" // mxl, musicxml, xml
}

export interface DriveUploadTyping {
    /** Trimmed Drive file name, or `drive-<id>` when Drive reported none. */
    driveName: string
    /** Lowercased Drive mime (`""` when Drive reported none). */
    driveMime: string
    /** `driveSourceIsConvertible(driveMime)` — "export" | "copy" | null. */
    conversion: "export" | "copy" | null
    /** Mime to hand `processChartUpload` (post-conversion when converting). */
    mimeType: string
    /** File name to hand `processChartUpload` (`.pdf` when converting). */
    originalFileName: string
}

/**
 * Decide the mime + filename `processChartUpload` should see for a Drive file.
 *
 * Extracted verbatim from `importChartFromDrive` so the single-file MCP tool,
 * its dryRun branch, and the batch processor all type files identically:
 *  - convertible (Google-native doc or Office file): the bytes WILL be PDF
 *    after `fetchAsPdf`, so type `application/pdf` and swap the extension.
 *  - Drive gave no mime or `application/octet-stream` (how it reports
 *    `.mxl`/`.musicxml`/`.mscz`): derive the music mime from the name, else
 *    fall back to the reported mime, else `application/pdf`.
 *  - otherwise: trust Drive's specific mime.
 */
export function deriveDriveUploadTyping(
    driveFileId: string,
    metadata: DriveFileMetadataLike | null | undefined,
): DriveUploadTyping {
    const driveMime = (metadata?.mimeType || "").toLowerCase()
    const conversion = driveSourceIsConvertible(driveMime)
    const driveName = (metadata?.name || `drive-${driveFileId}`).trim()

    const mimeType =
        conversion !== null
            ? "application/pdf"
            : !driveMime || driveMime === "application/octet-stream"
              ? (musicMimeFromDriveName(driveName) ?? (driveMime || "application/pdf"))
              : driveMime
    const originalFileName =
        conversion !== null
            ? `${driveName.replace(/\.[^/.]+$/, "")}.pdf`
            : driveName

    return { driveName, driveMime, conversion, mimeType, originalFileName }
}

/**
 * Classify a thrown Drive error into a stable code + message.
 *
 * Single source of truth for the 404/403 sniffing that
 * `library-upload.ts:mapDriveError` used to do inline — that function now
 * calls this and only owns the rich-error prose, so the MCP tool and the
 * batch processor can never drift on what counts as "not found".
 */
export function classifyDriveFailure(err: unknown): {
    code: "drive_not_found" | "drive_forbidden" | "drive_error"
    message: string
} {
    const e = err as { code?: number; status?: number; message?: string }
    const statusCandidate =
        typeof e?.code === "number"
            ? e.code
            : typeof e?.status === "number"
              ? e.status
              : null
    const message = e?.message ?? String(err)

    if (statusCandidate === 404 || /not found|404/i.test(message))
        return { code: "drive_not_found", message }
    if (
        statusCandidate === 403 ||
        /permission|forbidden|403|insufficientPermissions/i.test(message)
    )
        return { code: "drive_forbidden", message }
    return { code: "drive_error", message }
}

function sizeOf(raw: string | number | undefined | null): number {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0
    if (typeof raw === "string") {
        const n = Number.parseInt(raw, 10)
        return Number.isFinite(n) ? n : 0
    }
    return 0
}

/**
 * List the chart-typed files inside a Drive folder.
 *
 * Acceptance: Google-native docs and Office files pass because
 * `driveSourceIsConvertible` can turn them into PDF server-side; everything
 * else passes iff `resolveChartMime(name, mime)` resolves — which covers the
 * `application/octet-stream` `.mxl`/`.mscz` case Drive is fond of.
 *
 * Traversal is depth-first in listing order so `candidates` reads the way the
 * folder does. Depth is capped at `MAX_FOLDER_DEPTH`; a folder at the cap is
 * reported as skipped `"folder"`, same as any folder when `recursive` is off.
 * The walk stops the moment `max` candidates are collected — no further Drive
 * round-trips.
 */
export async function listDriveFolderCharts(
    drive: DriveLike,
    folderId: string,
    opts: { recursive: boolean; max: number },
): Promise<{
    candidates: DriveChartCandidate[]
    skipped: DriveSkippedEntry[]
}> {
    const candidates: DriveChartCandidate[] = []
    const skipped: DriveSkippedEntry[] = []
    const seenFolders = new Set<string>()

    async function walk(id: string, depth: number): Promise<void> {
        if (candidates.length >= opts.max) return
        if (seenFolders.has(id)) return
        seenFolders.add(id)

        let pageToken: string | undefined
        do {
            const page = await drive.listFilesByQuery({
                q: `'${id}' in parents and trashed = false`,
                fields: LIST_FIELDS,
                pageToken,
            })

            for (const f of page.files ?? []) {
                if (candidates.length >= opts.max) return
                const name = (f.name ?? "").trim() || `drive-${f.id ?? "unknown"}`
                const mimeType = (f.mimeType ?? "").toLowerCase()

                if (mimeType === DRIVE_FOLDER_MIME) {
                    if (opts.recursive && depth < MAX_FOLDER_DEPTH && f.id) {
                        await walk(f.id, depth + 1)
                        if (candidates.length >= opts.max) return
                    } else {
                        skipped.push({ name, reason: "folder" })
                    }
                    continue
                }

                const accepted =
                    driveSourceIsConvertible(mimeType) !== null ||
                    resolveChartMime(name, mimeType) !== null
                if (!accepted) {
                    skipped.push({ name, reason: "unsupported_type" })
                    continue
                }

                const sizeBytes = sizeOf(f.size)
                if (sizeBytes > MAX_DRIVE_FILE_BYTES) {
                    skipped.push({ name, reason: "too_large" })
                    continue
                }

                if (!f.id) {
                    skipped.push({ name, reason: "unsupported_type" })
                    continue
                }

                candidates.push({
                    driveFileId: f.id,
                    name,
                    mimeType,
                    sizeBytes,
                    ...(f.md5Checksum ? { md5Checksum: f.md5Checksum } : {}),
                    ...(f.modifiedTime ? { modifiedTime: f.modifiedTime } : {}),
                    ...(f.parents ? { parents: f.parents } : {}),
                })
            }

            pageToken = page.nextPageToken ?? undefined
        } while (pageToken && candidates.length < opts.max)
    }

    await walk(folderId, 1)
    return { candidates, skipped }
}

/**
 * Fetch one Drive file's bytes, already typed for `processChartUpload`.
 *
 * Metadata → conversion decision → `fetchAsPdf` or `getFile`. Pass
 * `opts.metadata` when the caller has already read it (the MCP tool does, for
 * its folder / non-convertible-native refusals) to avoid a second round-trip.
 *
 * Returns a discriminated result rather than throwing so both callers can map
 * failures into their own envelopes without re-sniffing Drive errors.
 */
export async function fetchDriveFileForUpload(
    drive: DriveLike,
    driveFileId: string,
    opts?: { metadata?: DriveFileMetadataLike | null },
): Promise<FetchDriveFileResult> {
    let metadata: DriveFileMetadataLike | null | undefined = opts?.metadata
    if (metadata === undefined) {
        try {
            metadata = (await drive.getFileMetadata(
                driveFileId,
            )) as DriveFileMetadataLike
        } catch (err) {
            return { ok: false, ...classifyDriveFailure(err) }
        }
    }

    const typing = deriveDriveUploadTyping(driveFileId, metadata)

    if (typing.driveMime === DRIVE_FOLDER_MIME) {
        return {
            ok: false,
            code: "unsupported_type",
            message: `Drive id ${driveFileId} points to a folder, not a chart file.`,
        }
    }
    if (
        typing.conversion === null &&
        typing.driveMime.startsWith("application/vnd.google-apps.")
    ) {
        return {
            ok: false,
            code: "unsupported_type",
            message: `Drive file ${driveFileId} is a native Google ${typing.driveMime.replace(
                "application/vnd.google-apps.",
                "",
            )} type that can't be converted to a chart.`,
        }
    }

    let buffer: Buffer
    try {
        if (typing.conversion !== null) {
            // Convert server-side to PDF (files.export for native Google docs;
            // convert-on-copy for uploaded Office files). The bytes never
            // round-trip through the agent — Drive egress runs on the server.
            const bytes = await drive.fetchAsPdf(driveFileId, typing.driveMime)
            buffer = Buffer.from(bytes)
        } else {
            const bytes = await drive.getFile(driveFileId)
            // DriveClient requests responseType 'arraybuffer'; Node hands back
            // ArrayBuffer or Buffer depending on transport. Normalize.
            buffer = Buffer.isBuffer(bytes)
                ? bytes
                : Buffer.from(bytes as ArrayBuffer)
        }
    } catch (err) {
        return { ok: false, ...classifyDriveFailure(err) }
    }

    if (buffer.byteLength === 0) {
        return {
            ok: false,
            code: "empty_file",
            message: `Drive file ${driveFileId} is empty.`,
        }
    }

    return {
        ok: true,
        buffer,
        mimeType: typing.mimeType,
        originalFileName: typing.originalFileName,
        driveName: typing.driveName,
        driveMime: typing.driveMime,
    }
}
