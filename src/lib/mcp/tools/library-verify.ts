import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { getChartHealth, type ChartHealth } from "@/lib/file-fetcher"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { logger } from "@/lib/logger"

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

type ToolError = { error: string }

export interface GetChartStatusArgs {
    fileId: string
    mimeType?: string
}

export interface GetChartStatusResult {
    ok: true
    fileId: string
    health: ChartHealth
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

export async function getChartStatus(
    uid: string,
    args: GetChartStatusArgs,
): Promise<GetChartStatusResult | ToolError> {
    if (!args.fileId?.trim()) return { error: "fileId is required" }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return { error: limited.error }

    const health = await getChartHealth(args.fileId.trim(), args.mimeType)
    return { ok: true, fileId: args.fileId, health }
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
    /** Number of catalog rows marked `status: 'orphaned'` this call. */
    orphanedMarked: number
    rows: SetlistTrackHealth[]
}

export async function verifySetlistCharts(
    uid: string,
    args: VerifySetlistChartsArgs,
): Promise<VerifySetlistChartsResult | ToolError> {
    if (!args.setlistId?.trim()) return { error: "setlistId is required" }

    initAdmin()
    const db = getFirestore()

    const role = await readLeaderRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return { error: limited.error }

    const setlistDoc = await db.collection("setlists").doc(args.setlistId).get()
    if (!setlistDoc.exists) return { error: "Setlist not found" }
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

    // Opportunistic orphan marking. Only fires on `missing` (definitive
    // not-found) — never on `unreachable` (transient blip). L-001.
    let orphanedMarked = 0
    if (args.markOrphaned) {
        const missingFileIds = probes
            .filter((p) => p.fileId && p.health.status === "missing")
            .map((p) => p.fileId as string)
        if (missingFileIds.length > 0) {
            const batch = db.batch()
            for (const fid of missingFileIds) {
                batch.set(
                    db.collection("library_index").doc(fid),
                    { status: "orphaned" },
                    { merge: true },
                )
                batch.set(
                    db.collection("songs").doc(fid),
                    { status: "orphaned" },
                    { merge: true },
                )
            }
            try {
                await batch.commit()
                orphanedMarked = missingFileIds.length
            } catch (err) {
                logger.warn("[mcp] verify_setlist_charts orphan-mark failed", {
                    setlistId: args.setlistId,
                    count: missingFileIds.length,
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
        orphanedMarked,
    })

    return {
        ok: true,
        setlistId: args.setlistId,
        trackCount: probes.length,
        bondedCount,
        okCount,
        missingCount,
        unreachableCount,
        orphanedMarked,
        rows: probes,
    }
}
