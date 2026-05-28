import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { isSongType } from "@/lib/setlist-track-count"
import { recomputeTrackCount } from "@/lib/setlist-track-count"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { captureException, captureMessage } from "@/lib/error-reporting"

/**
 * C11M1-001 — weekly backstop heal of `trackCount` + `songCount` across the
 * FULL `setlists` collection.
 *
 * Companion to the daily `/api/cron/verify-chart-bond-health` cron, which
 * heals only upcoming-published setlists (and is fading toward no-op as the
 * `publishedAt` gating concept is deprecated per the 2026-05-28T~16:00Z
 * `err-public-not-gated` decision). Past services, drafts, and never-
 * published setlists never got swept; their denormalized counters could
 * drift indefinitely.
 *
 * This route fixes that. It runs once per week (Sundays 07:00 UTC, after
 * the storage-backup at 05:00 UTC), iterates every doc in `setlists`,
 * and calls `recomputeTrackCount` (which is idempotent — no-op on synced
 * rows). The cron is read-mostly: a typical week ships <10 drift writes
 * across the catalog after the leak paths shipped in this same lane.
 *
 * Auth: `CRON_SECRET` Bearer mirrors the other crons (Vercel sets this
 * automatically on cron invocations).
 *
 * Out of scope: chart-bond breach alerting — that stays in
 * `verify-chart-bond-health`. This route ONLY repairs the counter denorm.
 */

const CRON_LANE = "recompute-all-setlist-counts"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"

interface DriftRow {
    setlistId: string
    trackBefore: number
    trackAfter: number
    songBefore: number
    songAfter: number
}

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (
            !cronSecret ||
            !authHeader ||
            !safeCompare(authHeader, `Bearer ${cronSecret}`)
        ) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                {
                    error: "Server not ready",
                    code: "FIREBASE_NOT_INITIALIZED",
                },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const startedAt = new Date().toISOString()

        // dryRun support — when ?dryRun=1, walk the collection, COMPUTE the
        // would-be drift report (declared vs actual trackCount + songCount),
        // but DO NOT write. Lets Daniel preview a backfill before the
        // scheduled Sunday tick applies it (single-owner destructive-run
        // discipline per [[feedback_single_owner_destructive_runs]]).
        const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"

        // Full-collection scan. The setlists collection is small (~hundreds
        // of rows in steady state); we don't page. `select()` would shave
        // reads but `recomputeTrackCount` wants the full doc data anyway.
        const snap = await db.collection("setlists").get()

        let scanned = 0
        let repaired = 0
        let writeFailures = 0
        const driftRows: DriftRow[] = []

        for (const doc of snap.docs) {
            scanned++
            const data = doc.data() as Record<string, unknown>
            try {
                if (dryRun) {
                    // Mirror recomputeTrackCount's compute but skip the write.
                    const tracks = await getTracksForSetlist(db, doc.id, data)
                    const actual = tracks.length
                    const actualSongs = tracks.filter((t) =>
                        isSongType((t as { type?: unknown }).type),
                    ).length
                    const declared =
                        typeof data.trackCount === "number"
                            ? data.trackCount
                            : 0
                    const declaredSongs =
                        typeof data.songCount === "number" ? data.songCount : 0
                    if (declared !== actual || declaredSongs !== actualSongs) {
                        repaired++ // "would-be repaired"
                        driftRows.push({
                            setlistId: doc.id,
                            trackBefore: declared,
                            trackAfter: actual,
                            songBefore: declaredSongs,
                            songAfter: actualSongs,
                        })
                    }
                    continue
                }
                const result = await recomputeTrackCount(db, doc.id, data)
                if (result.drifted && result.written) {
                    repaired++
                    driftRows.push({
                        setlistId: result.setlistId,
                        trackBefore: result.declared,
                        trackAfter: result.actual,
                        songBefore: result.declaredSongs,
                        songAfter: result.actualSongs,
                    })
                } else if (result.drifted && !result.written) {
                    writeFailures++
                }
            } catch (err) {
                writeFailures++
                logger.warn(
                    `[cron/${CRON_LANE}] recompute failed for ${doc.id}`,
                    { err: err instanceof Error ? err.message : String(err) },
                )
            }
        }

        // Report the repair pass to Sentry when meaningful — Daniel watches
        // the channel as the solo maintainer. A clean run (0 repaired) is
        // quiet by design. dryRun never reports to Sentry — it's an operator
        // preview, not a heartbeat.
        if (!dryRun && (repaired > 0 || writeFailures > 0)) {
            captureMessage(
                `[${CRON_LANE}] scanned ${scanned}; repaired ${repaired}; writeFailures ${writeFailures}`,
                {
                    source: "cron",
                    location: CRON_LANE,
                    extra: {
                        startedAt,
                        scanned,
                        repaired,
                        writeFailures,
                        // First 25 drifted rows for triage — drift > 25 is
                        // diagnostic, surface the count not the full list.
                        driftSample: driftRows.slice(0, 25),
                        driftTruncated: driftRows.length > 25,
                    },
                },
            )
        }

        logger.info(`[cron/${CRON_LANE}] complete`, {
            scanned,
            repaired,
            writeFailures,
            dryRun,
        })

        return NextResponse.json({
            ok: true,
            startedAt,
            dryRun,
            scanned,
            repaired,
            writeFailures,
            // dryRun returns ALL drift rows so Daniel sees the full
            // backfill plan (capped at 25 in the cron-tick response to
            // avoid alert-payload bloat).
            driftSample: dryRun ? driftRows : driftRows.slice(0, 25),
            driftTruncated: dryRun ? false : driftRows.length > 25,
        })
    } catch (err) {
        logger.error(`[cron/${CRON_LANE}] check failed:`, err)
        captureException(err, { source: "cron", location: CRON_LANE })
        return NextResponse.json(
            {
                error: "Check failed",
                message: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        )
    }
}
