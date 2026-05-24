/**
 * F-3 (setlist-import-via-pcu-with-defaults-mirror lane) — testable core of
 * POST /api/setlists/import/execute.
 *
 * Pre-fix the route's per-row loop wrote `library_index/{newLibraryId}`
 * directly via 11-field literal — diverging from `processChartUpload`'s 18+
 * field shape, skipping the atomic-guard read-verify + compensating-delete,
 * skipping enrichment-emit (`emitLibraryRowCreated`), and writing neither
 * `songs/{id}` nor `songs/{id}.defaults`. The drive-id-write-symmetry fix at
 * master `0c0392a72` patched ONE field (driveFileId) onto the divergent
 * shape; THIS lane closes the divergence entirely by routing through PCU,
 * which inherits ALL the canonical write contracts (atomic-guard,
 * sibling-recount cascade, library_signals broadcast, library.row.created
 * emit) and now also writes `songs/{id}.defaults` via the new F-5 mirror
 * inside PCU. Coder-3's `driveFileId: fileId` write site is preserved by
 * passing `driveMetadata: { driveFileId: fileId }` to PCU — which writes it
 * into the same library_index field per library-upload.ts L572-583.
 *
 * Lives outside `app/api/.../route.ts` because Next.js App Router route
 * files may only export HTTP handlers + route-segment config (see
 * [[feedback_nextjs_route_exports]]). Importing this helper from the route
 * is fine; exporting it there would break `next build`.
 */

import "server-only"
import crypto from "crypto"
import { z } from "zod"
import type { Firestore } from "firebase-admin/firestore"
import { processChartUpload } from "@/lib/library-upload"
import { createSetlistServerSide } from "@/lib/setlist-write"
import { normalizeChartTitle } from "@/lib/library/normalize-chart-title"
import { logger } from "@/lib/logger"

// The import/parse route emits `null` for a header item's non-title fields, so
// optional fields are `.nullish()` (v70-08-02 — replaces the prior
// z.array(z.any()) escape hatch). Unknown keys (e.g. parse's `similarityScore`)
// are stripped by z.object's default behavior — execute does not read them.
export const ParsedItemSchema = z.object({
    type: z.enum(['header', 'song']),
    title: z.string().nullish(),
    key: z.string().nullish(),
    chartUrl: z.string().nullish(),
    performer: z.string().nullish(),
    referenceLink: z.string().nullish(),
    chartError: z.string().nullish(),
    libraryMatchId: z.string().nullish(),
    libraryMatchName: z.string().nullish(),
})

export type ParsedItem = z.infer<typeof ParsedItemSchema>

// F-3: per-row outcome surfaced in the import response so multi-chart imports
// don't fail-stop when one row dupes the library. Each `song` item produces at
// most one outcome row (Path C — no chart-bearing path — produces none).
// `header` items are not enumerated (they're not chart-bearing). A
// `duplicate` outcome means the existing library row was preserved and the
// new track was added to the setlist WITHOUT a fileId binding — the user
// can bond it later via the in-app picker. Pre-fix the route silently
// minted a duplicate library_index row for each `duplicate_exact` /
// `duplicate_similar` hit (because the legacy direct write bypassed
// PCU's dedup entirely).
export interface ImportOutcome {
    /** Final normalized title written to the setlist track. */
    title: string
    status:
        | "imported" // new chart minted via PCU; track bound to result.fileId
        | "matched-library" // parse step pre-matched to an existing library row
        | "duplicate" // PCU detected exact/fuzzy collision; track left unbonded
        | "drive-failed" // fetch/extract failed; track left unbonded
        | "process-failed" // PCU returned a non-dedup error; track left unbonded
    /** Set when the track was bound to a library row. */
    fileId?: string
    /** PCU error code on `duplicate` / `process-failed`. */
    code?: string
    /** Human-readable reason — surfaced as the import response's per-row note. */
    error?: string
}

export interface ExecuteSetlistImportInput {
    db: Firestore
    items: ParsedItem[]
    setName: string
    uploaderUid: string
    uploaderEmail?: string | null
}

export interface ExecuteSetlistImportResult {
    setlistId: string
    importOutcomes: ImportOutcome[]
}

/**
 * Core of POST /api/setlists/import/execute. The route is a thin wrapper that
 * handles auth + rate-limit + admin-init; this function owns the per-row
 * resolution loop + the setlist write. Exported for direct emulator-test
 * exercise without going through `createApiHandler` plumbing.
 */
export async function executeSetlistImport(
    opts: ExecuteSetlistImportInput,
): Promise<ExecuteSetlistImportResult> {
    const { db, items, setName, uploaderUid, uploaderEmail } = opts
    const resolvedTracks: Array<Record<string, unknown>> = []
    const importOutcomes: ImportOutcome[] = []
    let trackCounter = 0

    for (const item of items) {
        if (item.type === 'header') {
            resolvedTracks.push({
                id: crypto.randomUUID(),
                type: 'header',
                title: item.title || "Section",
            })
            continue
        }

        if (item.type !== 'song') continue
        trackCounter++
        const trackId = crypto.randomUUID()
        const trackPayload: Record<string, unknown> = {
            id: trackId,
            type: 'song',
            title: item.title || `Song ${trackCounter}`,
        }

        if (item.key) trackPayload.key = item.key
        if (item.performer) trackPayload.leadMusician = item.performer
        if (item.referenceLink) trackPayload.referenceLink = item.referenceLink

        // Path A: parse step pre-matched to an existing library row — bind +
        // continue. PCU not involved.
        if (item.libraryMatchId) {
            trackPayload.fileId = item.libraryMatchId
            trackPayload.fileName = item.libraryMatchName || item.title
            resolvedTracks.push(trackPayload)
            importOutcomes.push({
                title: trackPayload.title as string,
                status: "matched-library",
                fileId: item.libraryMatchId,
            })
            continue
        }

        // Path B: parsed a public Drive URL — download bytes and route them
        // through PCU. This is the F-3 fix locus.
        if (item.chartUrl && !item.chartError) {
            const driveRegex = /\/d\/([a-zA-Z0-9-_]+)/
            const match = item.chartUrl.match(driveRegex)

            if (match && match[1]) {
                const fileId = match[1]
                const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

                // Compose + normalize the title BEFORE PCU sees it (PCU
                // normalizes again — idempotent — but keeping it here lets
                // the import outcome carry the human-readable title even
                // when PCU rejects the row).
                const composedTitle = item.performer
                    ? `${item.title} (${item.performer})`
                    : item.title || "Unknown Title"
                const finalTitle =
                    normalizeChartTitle(composedTitle) || "Unknown Title"

                let buffer: Buffer | null = null
                let driveFailReason: string | null = null
                try {
                    const driveRes = await fetch(downloadUrl)
                    const contentType =
                        driveRes.headers.get('content-type') || ''
                    if (
                        driveRes.ok &&
                        contentType.startsWith('application/pdf')
                    ) {
                        buffer = Buffer.from(await driveRes.arrayBuffer())
                    } else {
                        driveFailReason = `Drive download rejected (status=${driveRes.status} content-type="${contentType}")`
                        logger.warn(
                            `[Setlist Importer] Failed to download Drive file ${fileId}. Status: ${driveRes.status}`,
                        )
                    }
                } catch (err) {
                    driveFailReason =
                        err instanceof Error ? err.message : String(err)
                    logger.error(
                        `[Setlist Importer] Drive download threw error for ${fileId}`,
                        err,
                    )
                }

                if (!buffer) {
                    importOutcomes.push({
                        title: finalTitle,
                        status: "drive-failed",
                        error: driveFailReason ?? "Drive download returned no bytes",
                    })
                    // Track stays unbonded; user can re-bond via the picker.
                    resolvedTracks.push(trackPayload)
                    continue
                }

                // Route bytes through PCU. driveMetadata.driveFileId preserves
                // coder-3's F-1 write site (drive-sync poller queries
                // library_index where driveFileId == X via findRowByDriveFileId,
                // so importing a Drive file by URL must persist this lookup
                // key to keep the poller from later re-importing as a NEW
                // file via PCU and creating a sibling). songDefaults forwards
                // the per-row key + performer (lead) to the new F-5 mirror so
                // `songs/{id}.defaults` is populated at upload time, not via a
                // follow-up update_song.
                const result = await processChartUpload({
                    buffer,
                    originalFileName: `${finalTitle}.pdf`,
                    mimeType: 'application/pdf',
                    title: finalTitle,
                    uploaderUid,
                    uploaderEmail: uploaderEmail ?? undefined,
                    source: 'upload',
                    driveMetadata: { driveFileId: fileId },
                    // F-5: per-row catalog metadata. item.key and item.performer
                    // are the only signals the parse step carries; bpm is not in
                    // the CSV schema. `applySongMetadata` ignores undefined
                    // fields so this is safe when both are absent.
                    songDefaults:
                        item.key || item.performer
                            ? {
                                  key: item.key ?? undefined,
                                  leadMusician: item.performer ?? undefined,
                              }
                            : undefined,
                })

                if (!result.ok) {
                    if (
                        result.code === "duplicate_exact" ||
                        result.code === "duplicate_similar"
                    ) {
                        logger.info(
                            `[Setlist Importer] PCU dedup ${result.code} for "${finalTitle}" (continuing import)`,
                        )
                        importOutcomes.push({
                            title: finalTitle,
                            status: "duplicate",
                            code: result.code,
                            error: result.error,
                        })
                    } else {
                        logger.warn(
                            `[Setlist Importer] PCU rejected "${finalTitle}" (${result.code}): ${result.error}`,
                        )
                        importOutcomes.push({
                            title: finalTitle,
                            status: "process-failed",
                            code: result.code,
                            error: result.error,
                        })
                    }
                    // Either way: don't bind. Track stays in the setlist
                    // unbonded — user can bond later. Critically, we DO NOT
                    // abort the whole multi-chart import (auditor's specific
                    // call-out on this lane).
                    resolvedTracks.push(trackPayload)
                    continue
                }

                trackPayload.fileId = result.fileId
                trackPayload.fileName = finalTitle
                importOutcomes.push({
                    title: finalTitle,
                    status: "imported",
                    fileId: result.fileId,
                })
                resolvedTracks.push(trackPayload)
                continue
            }
        }

        // Path C: no chart-bearing path (no libraryMatchId, no parseable
        // Drive URL, or a parse-time chartError). Track is added to the
        // setlist unbonded. No outcome row — the chart side never engaged.
        resolvedTracks.push(trackPayload)
    }

    // v70-07-01: the parent-setlist-doc build + top-level tracks/{id} seed
    // is now the shared server-side write path (src/lib/setlist-write.ts) —
    // one write path consumed by this route, v70-07's doc-import commit,
    // and the MCP write tools. `eventDate: new Date()` preserves this
    // route's prior behavior of defaulting eventDate at import time (CSV
    // import carries no service date); the module itself does not default.
    const { setlistId } = await createSetlistServerSide({
        name: setName,
        ownerId: uploaderUid,
        ownerName: uploaderEmail || "Unknown",
        eventDate: new Date(),
        tracks: resolvedTracks.map((t) => {
            // resolvedTracks is a union (header obj | song Record) — read
            // through a Record view for the optional song fields.
            const rec = t as Record<string, unknown>
            return {
                type: (rec.type as 'song' | 'header') ?? 'song',
                title: (rec.title as string) ?? 'Untitled',
                key: rec.key as string | undefined,
                leadMusician: rec.leadMusician as string | undefined,
                referenceLink: rec.referenceLink as string | undefined,
                fileId: rec.fileId as string | undefined,
                fileName: rec.fileName as string | undefined,
            }
        }),
    })

    return { setlistId, importOutcomes }
}
