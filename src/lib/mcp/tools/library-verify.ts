import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getChartHealth, type ChartHealth } from "@/lib/file-fetcher"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { logger } from "@/lib/logger"
import {
    EMPTY_ENRICHMENT_PROJECTION,
    loadEnrichmentProjection,
    type EnrichmentProjection,
} from "@/lib/library/enrichment-projection"

/**
 * Chart-health verification tools — close the orphan/unrenderable-chart
 * class flagged by the 2026-05-16 Bar Mitzvah session punch-list
 * (A-001 / B-002 / B-003 / L-001).
 *
 *  - `get_chart_status(fileId)` — single-file probe. Metadata only; no
 *     bytes pulled, so it's cheap to call from a bond-validation loop.
 *  - `verify_setlist_charts(setlistId)` — fan-out probe of every bonded
 *     track on a setlist. Used by `publish_setlist`'s pre-flight check
 *     and exposed directly so the agent can ask "what's broken?" before
 *     publishing.
 *
 * Neither tool mutates state. Both return per-row status with enough
 * detail for the agent to act (re-upload, swap, or drop the row).
 *
 * Auth/rate-limit: read-only, no role gate, `api` tier with trusted-leader
 * bypass. Mirrors the read-side of the other library tools.
 */

// Cycle-2 REG-001b: every error returns the canonical rich envelope.

export interface GetChartStatusArgs {
    fileId: string
    mimeType?: string
}

export interface GetChartStatusResult {
    ok: true
    fileId: string
    /**
     * E4 (`R-0904-live-cw-3`) — health, PLUS the catalog fact.
     *
     * `getChartHealth` probes Storage and Drive and consults no catalog at
     * all, so a fileId with bytes at a candidate path and NO `library_index`
     * row returned a flat `{status: "ok"}`. Callers read that green as "the
     * band can open this", and for such a row they cannot: `download_chart`
     * keys on `library_index` and answers `chart_not_found`. Five ZZTEST
     * fixtures held exactly that shape until they were deleted, and the
     * census that followed found 257 more rows in `songs` with no index row.
     *
     * So `ok` now requires reachable bytes AND an index row, and the
     * bytes-without-a-row case gets its own name rather than a green.
     */
    health: ChartStatusHealth
    /**
     * Cycle-3 AI-001 — enrichment projection of the matching
     * `library_index/{fileId}` row + retry-queue presence. Always populated;
     * defaults to {@link EMPTY_ENRICHMENT_PROJECTION} when no `library_index`
     * row exists (phantom bond, pre-NEW-3 upload, raw catalog-only row).
     */
    enrichment: EnrichmentProjection
}

async function readLeaderRole(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<"admin" | "band_leader" | "other"> {
    const snap = await db.collection("users").doc(uid).get()
    const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined
    if (role === "admin") return "admin"
    if (role === "band_leader") return "band_leader"
    return "other"
}

/**
 * E4 — `getChartHealth`'s answer widened by one case this tool can see and
 * that probe cannot. Every existing `ChartHealth` variant passes through
 * unchanged; only a green over a row-less fileId is re-labelled.
 */
export type ChartStatusHealth =
    | ChartHealth
    | {
          status: "bytes_without_index_row"
          reason: string
          mimeType?: string
      }

export async function getChartStatus(
    uid: string,
    args: GetChartStatusArgs,
): Promise<GetChartStatusResult | RichErrorEnvelope> {
    if (!args.fileId?.trim())
        return richError(
            "invalid_argument",
            "fileId must be a non-empty string.",
            { field: "fileId" },
        )

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited)
        return richError(
            "rate_limited",
            limited.error,
            undefined,
            "Retry after the cooldown window.",
        )

    const fileIdTrimmed = args.fileId.trim()
    // Cycle-3 AI-001: probe chart health + project enrichment state in
    // parallel — both are read-only Firestore/Storage reads. Enrichment is
    // fail-soft: a Firestore blip degrades to the empty projection so the
    // health probe still returns.
    const [health, enrichment, indexSnap] = await Promise.all([
        getChartHealth(fileIdTrimmed, args.mimeType),
        loadEnrichmentProjection(db, fileIdTrimmed).catch((err) => {
            logger.warn(
                `[mcp] get_chart_status enrichment projection failed for ${fileIdTrimmed}:`,
                err,
            )
            return EMPTY_ENRICHMENT_PROJECTION
        }),
        // E4 — the catalog fact. Read directly rather than inferred from the
        // enrichment projection, which cannot tell "no row" from "a row with
        // no enrichment fields".
        db
            .collection("library_index")
            .doc(fileIdTrimmed)
            .get()
            .catch((err) => {
                logger.warn(
                    `[mcp] get_chart_status index read failed for ${fileIdTrimmed}:`,
                    err,
                )
                return null
            }),
    ])

    // Fail-soft: a Firestore blip returns null, and an UNKNOWN catalog is not
    // evidence of absence — the health answer stands as probed.
    const hasIndexRow = indexSnap === null ? true : indexSnap.exists
    const projected: ChartStatusHealth =
        health.status === "ok" && !hasIndexRow
            ? {
                  status: "bytes_without_index_row",
                  reason:
                      "bytes are reachable, but no `library_index` row exists for this fileId. " +
                      "`download_chart` keys on that row and will answer `chart_not_found`, so this " +
                      "chart cannot be opened from a setlist even though the object is present. " +
                      "It may still be visible in `search_library`, which reads `songs`.",
                  ...(health.mimeType ? { mimeType: health.mimeType } : {}),
              }
            : health
    return { ok: true, fileId: args.fileId, health: projected, enrichment }
}

export interface VerifySetlistChartsArgs {
    setlistId: string
    /**
     * If true, every probed row whose `health.status === 'missing'` is
     * persisted as `library_index.{fileId}.status = 'orphaned'` (and the
     * matching `songs/{id}.status`). Subsequent `search_library` calls
     * exclude these by default. Use to triage stale catalog rows after
     * a "publish refused" or Bar-Mitzvah-style discovery. Off by default
     * — caller must opt in so a transient Drive/Storage blip doesn't
     * permanently mark a healthy chart as orphaned. L-001.
     */
    markOrphaned?: boolean
}

export interface SetlistTrackHealth {
    trackId: string
    title: string
    songId: string | null
    fileId: string | null
    health: ChartHealth | { status: "unbonded"; reason: string }
}

export interface VerifySetlistChartsResult {
    ok: true
    setlistId: string
    trackCount: number
    bondedCount: number
    okCount: number
    missingCount: number
    unreachableCount: number
    /**
     * Cycle-3 NEW-5 (storage-canonical direction). Rows where Drive has
     * the bytes but Storage doesn't yet — chart still SERVES because the
     * file-fetcher does Drive fallback. The transient state surfaces here
     * so callers know which charts the `/api/cron/drive-sync` importer
     * (NEW-1) is mid-resolving. Distinct from `okCount` (serving from
     * Storage) and `missingCount` (definitively gone).
     */
    needsSyncCount: number
    /**
     * Cycle-3 BUG-002. Rows whose source-of-truth mime is
     * `application/vnd.google-apps.shortcut` — un-embedable in
     * `generate_gig_packet`'s merged PDF. Pre-fix the per-row probe
     * returned `ok` (Storage had stale shortcut bytes) and pre-publish
     * health was green; the band still saw a broken chart because gig
     * packet correctly dropped the shortcut. Now surfaced explicitly so
     * the operator can re-bond to the shortcut target's fileId before
     * publishing.
     */
    shortcutUnresolvedCount: number
    /**
     * Number of `library_index` rows actually flipped to `status: 'orphaned'`
     * this call — i.e. rows that existed in the catalog and were re-confirmed
     * missing. Excludes phantom bonds (fileIds that had no catalog row at all).
     */
    orphanedMarked: number
    /**
     * F-04 (2026-05-16 bugstomp): tracks bonded to a fileId that has NO
     * matching `library_index` row at all. Distinct from `orphanedMarked` —
     * these never had a catalog row to flip. Operators triaging a library
     * hygiene pass usually want to re-bond or remove these rows entirely
     * rather than mark them orphaned (which would just create empty stub
     * rows). Always reported, regardless of `markOrphaned`.
     */
    phantomBonds: number
    rows: SetlistTrackHealth[]
}

export async function verifySetlistCharts(
    uid: string,
    args: VerifySetlistChartsArgs,
): Promise<VerifySetlistChartsResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited)
        return richError(
            "rate_limited",
            limited.error,
            undefined,
            "Retry after the cooldown window.",
        )

    const setlistDoc = await db.collection("setlists").doc(args.setlistId).get()
    if (!setlistDoc.exists)
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    const setlistData = setlistDoc.data() as Record<string, unknown>

    const tracks = await getTracksForSetlist(db, args.setlistId, setlistData)

    const probes = await Promise.all(
        tracks.map(async (t): Promise<SetlistTrackHealth> => {
            const row = t as Record<string, unknown>
            const trackId = String(row.id ?? "")
            const title =
                typeof row.title === "string" && row.title
                    ? row.title
                    : trackId
            const songId =
                typeof row.songId === "string" && row.songId ? row.songId : null
            const fileId =
                typeof row.fileId === "string" && row.fileId
                    ? (row.fileId as string)
                    : null
            const mimeHint =
                typeof row.mimeType === "string"
                    ? (row.mimeType as string)
                    : undefined
            if (!fileId) {
                return {
                    trackId,
                    title,
                    songId,
                    fileId: null,
                    health: {
                        status: "unbonded",
                        reason:
                            "Track has no fileId bound — either an intentional non-song row (header/reading/etc) or an unbonded placeholder.",
                    },
                }
            }
            const health = await getChartHealth(fileId, mimeHint)
            return { trackId, title, songId, fileId, health }
        }),
    )

    const bondedCount = probes.filter((p) => p.fileId).length
    const okCount = probes.filter((p) => p.health.status === "ok").length
    const missingCount = probes.filter(
        (p) => p.health.status === "missing",
    ).length
    const unreachableCount = probes.filter(
        (p) => p.health.status === "unreachable",
    ).length
    const needsSyncCount = probes.filter(
        (p) => p.health.status === "needs_storage_sync",
    ).length
    const shortcutUnresolvedCount = probes.filter(
        (p) => p.health.status === "shortcut_unresolved",
    ).length

    // Opportunistic orphan marking. Only fires on `missing` (definitive
    // not-found) — never on `unreachable` (transient blip). L-001.
    //
    // F-04 (2026-05-16 bugstomp): split missing fileIds into two classes
    // BEFORE writing. Phantom bonds (no library_index row at all) used to
    // get a blank `{status: "orphaned"}` doc created via batch.set + merge,
    // AND inflate `orphanedMarked` to match the report's missingCount —
    // operators believed they'd cleaned up rows that weren't there to
    // begin with, and the catalog filled with stub docs. We now split:
    // existing catalog rows → flipped + counted in `orphanedMarked`;
    // phantoms → counted separately in `phantomBonds`, never written.
    let orphanedMarked = 0
    let phantomBonds = 0
    const missingFileIds = probes
        .filter((p) => p.fileId && p.health.status === "missing")
        .map((p) => p.fileId as string)
    if (missingFileIds.length > 0) {
        const existingSnaps = await Promise.all(
            missingFileIds.map((fid) =>
                db.collection("library_index").doc(fid).get(),
            ),
        )
        const existingFileIds: string[] = []
        for (let i = 0; i < missingFileIds.length; i++) {
            if (existingSnaps[i].exists) {
                existingFileIds.push(missingFileIds[i])
            } else {
                phantomBonds++
            }
        }
        if (args.markOrphaned && existingFileIds.length > 0) {
            const batch = db.batch()
            for (const fid of existingFileIds) {
                batch.update(db.collection("library_index").doc(fid), {
                    status: "orphaned",
                })
                // songs/{fid} parallel write stays set+merge: some catalog
                // entries don't have a sibling songs/{fid} row, and we want
                // the orphaned status to land regardless so `search_library`
                // exclusion sees it on either collection.
                batch.set(
                    db.collection("songs").doc(fid),
                    { status: "orphaned" },
                    { merge: true },
                )
            }
            try {
                await batch.commit()
                orphanedMarked = existingFileIds.length
            } catch (err) {
                logger.warn("[mcp] verify_setlist_charts orphan-mark failed", {
                    setlistId: args.setlistId,
                    count: existingFileIds.length,
                    err: err instanceof Error ? err.message : String(err),
                })
            }
        }
    }

    logger.info("[mcp] verify_setlist_charts", {
        setlistId: args.setlistId,
        trackCount: probes.length,
        bondedCount,
        okCount,
        missingCount,
        unreachableCount,
        needsSyncCount,
        shortcutUnresolvedCount,
        orphanedMarked,
        phantomBonds,
    })

    return {
        ok: true,
        setlistId: args.setlistId,
        trackCount: probes.length,
        bondedCount,
        okCount,
        missingCount,
        unreachableCount,
        needsSyncCount,
        shortcutUnresolvedCount,
        orphanedMarked,
        phantomBonds,
        rows: probes,
    }
}
