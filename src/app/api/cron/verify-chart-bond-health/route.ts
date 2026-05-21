import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { verifySetlistCharts } from "@/lib/mcp/tools/library-verify"
import { recomputeTrackCount } from "@/lib/setlist-track-count"
import { captureException, captureMessage } from "@/lib/error-reporting"

/**
 * Cycle-7-fixes Lane 3 — chart-bond health cron.
 *
 * Daily Thursday-afternoon-UTC run (`0 15 * * 4` in vercel.json). Enumerates
 * every published setlist with an upcoming eventDate, runs the same chart-
 * health probe `verify_setlist_charts` would, and writes a row to
 * `chart_bond_alerts/{alertId}` whenever:
 *
 *   - aggregate okCount/bondedCount across the surveyed set is < 80%, OR
 *   - any individual surveyed setlist's okCount/bondedCount is < 70%
 *     (only setlists with at least MIN_BONDED_FOR_BREACH bonded tracks are
 *     evaluated, so stub/skeleton setlists never alert).
 *
 * The alert document is the surface a future admin push notification reads.
 * No push wiring is shipped in this lane; the document is the contract.
 *
 * Side effect: when a setlist's denormalized `trackCount` disagrees with the
 * actual `tracks/` subcollection length, the cron repairs it inline. This
 * closes C7I4-002 (Eitan Shabbat Morning 2/21 reports trackCount=43 but the
 * subcollection is empty) — once the cron runs daily, every stale denormalized
 * counter self-heals before Friday-night.
 *
 * Auth: `CRON_SECRET` Bearer mirrors the other crons. Vercel sets this
 * automatically on its cron invocations.
 */

const CRON_LANE = "verify-chart-bond-health"
const AGGREGATE_OK_THRESHOLD = 0.8
const PER_SETLIST_OK_THRESHOLD = 0.7
// C8I2-004: breach ratios are computed over BONDED tracks, not total tracks.
// A typical Shabbat-morning service carries ~16/30 intentional unbonded section
// markers, so an okCount/trackCount denominator false-fires (13/14 bonds healthy
// scores 43%). Stub/skeleton setlists with very few bonds are excluded from the
// per-setlist breach test entirely via this floor.
const MIN_BONDED_FOR_BREACH = 3
// Vercel cron invocations are anonymous from the function's POV — caller uid
// is unavailable, so we plumb a synthetic `system-cron` uid into the read-
// only `verifySetlistCharts` path. The role-gate inside it falls through to
// "other" (no admin/band_leader bypass) but the function does not require
// admin auth — it's a public read with rate limits. CRON_SECRET protects
// the route boundary; per-tool calls inherit that.
const CRON_UID = "system-cron-chart-bond"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

interface PerSetlistSummary {
    setlistId: string
    name: string
    eventDate: string | null
    trackCount: number
    bondedCount: number
    okCount: number
    missingCount: number
    needsSyncCount: number
    shortcutUnresolvedCount: number
    phantomBonds: number
    okPct: number
    repairedTrackCount: { from: number; to: number } | null
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()

        const nowIso = new Date().toISOString()
        // Two-step query: fetch published-status setlists, then filter by
        // eventDate in-process. eventDate is stored as either an ISO string
        // OR a Firestore Timestamp depending on writer; in-process filtering
        // avoids the index-shape coupling.
        const publishedSnap = await db
            .collection("setlists")
            .where("publishedAt", "!=", null)
            .get()

        const candidates: { id: string; data: Record<string, unknown> }[] = []
        for (const doc of publishedSnap.docs) {
            const data = doc.data() as Record<string, unknown>
            const eventDateRaw = data.eventDate
            // Skip past services — chart-bond breakage there is historical,
            // not Friday-night relevant.
            const eventDateIso =
                eventDateRaw &&
                typeof (eventDateRaw as { toDate?: () => Date }).toDate ===
                    "function"
                    ? (eventDateRaw as { toDate: () => Date })
                          .toDate()
                          .toISOString()
                    : typeof eventDateRaw === "string"
                      ? eventDateRaw
                      : null
            if (!eventDateIso) {
                // Undated published setlists — surface them too (Daniel may
                // want to know which permanent-published items are decaying).
                candidates.push({ id: doc.id, data })
                continue
            }
            if (eventDateIso < nowIso) continue
            candidates.push({ id: doc.id, data })
        }

        const summaries: PerSetlistSummary[] = []
        let aggTrack = 0
        let aggBonded = 0
        let aggOk = 0
        let repaired = 0
        const repairs: { setlistId: string; from: number; to: number }[] = []

        for (const { id, data } of candidates) {
            const repairResult = await recomputeTrackCount(db, id, data)
            const repair =
                repairResult.drifted && repairResult.written
                    ? { from: repairResult.declared, to: repairResult.actual }
                    : null
            if (repair) {
                repaired++
                repairs.push({ setlistId: id, ...repair })
            }
            // verify_setlist_charts: read-only (markOrphaned omitted) since
            // reconcile_library is the authoritative orphan-marker; the cron's
            // purpose is to ALERT, not to actuate.
            const result = await verifySetlistCharts(CRON_UID, {
                setlistId: id,
            })
            if (!("ok" in result) || !result.ok) {
                logger.warn(
                    `[cron/${CRON_LANE}] verify_setlist_charts failed for ${id}`,
                    { result },
                )
                continue
            }
            const okPct =
                result.bondedCount > 0
                    ? result.okCount / result.bondedCount
                    : 1
            summaries.push({
                setlistId: id,
                name: typeof data.name === "string" ? data.name : id,
                eventDate:
                    typeof data.eventDate === "string"
                        ? data.eventDate
                        : null,
                trackCount: result.trackCount,
                bondedCount: result.bondedCount,
                okCount: result.okCount,
                missingCount: result.missingCount,
                needsSyncCount: result.needsSyncCount,
                shortcutUnresolvedCount: result.shortcutUnresolvedCount,
                phantomBonds: result.phantomBonds,
                okPct: Math.round(okPct * 1000) / 10,
                repairedTrackCount: repair,
            })
            aggTrack += result.trackCount
            aggBonded += result.bondedCount
            aggOk += result.okCount
        }

        const aggregateOkPct =
            aggBonded > 0 ? aggOk / aggBonded : 1
        const aggregateBreached = aggregateOkPct < AGGREGATE_OK_THRESHOLD
        const perSetlistBreached = summaries.filter(
            (s) =>
                s.bondedCount >= MIN_BONDED_FOR_BREACH &&
                s.okCount / s.bondedCount < PER_SETLIST_OK_THRESHOLD,
        )

        if (aggregateBreached || perSetlistBreached.length > 0) {
            // PGR-03: chart_bond_alerts is a write-only queue with no reader,
            // so route the breach to Sentry (live in prod) — that is how it
            // actually reaches Daniel, the solo maintainer, before Friday.
            captureMessage(
                `[chart-bond-alert] ${perSetlistBreached.length} setlist(s) below ${PER_SETLIST_OK_THRESHOLD * 100}% bonded-OK; aggregate ${Math.round(aggregateOkPct * 1000) / 10}% across ${candidates.length} surveyed`,
                {
                    source: "cron",
                    location: CRON_LANE,
                    extra: {
                        aggregateOkPct: Math.round(aggregateOkPct * 1000) / 10,
                        aggregateBreached,
                        perSetlistBreachedCount: perSetlistBreached.length,
                        candidatesSurveyed: candidates.length,
                        perSetlistBreached: perSetlistBreached.map((s) => ({
                            setlistId: s.setlistId,
                            name: s.name,
                            eventDate: s.eventDate,
                            okPct: s.okPct,
                            missingCount: s.missingCount,
                        })),
                    },
                },
            )
            try {
                await db.collection("chart_bond_alerts").add({
                    detectedAt: nowIso,
                    aggregateOkPct: Math.round(aggregateOkPct * 1000) / 10,
                    aggregateBreached,
                    perSetlistBreachedCount: perSetlistBreached.length,
                    candidatesSurveyed: candidates.length,
                    summaries,
                    perSetlistBreached: perSetlistBreached.map((s) => ({
                        setlistId: s.setlistId,
                        name: s.name,
                        eventDate: s.eventDate,
                        okPct: s.okPct,
                        missingCount: s.missingCount,
                    })),
                    repairs,
                    cron: CRON_LANE,
                })
            } catch (err) {
                logger.warn(
                    `[cron/${CRON_LANE}] chart_bond_alerts write failed: ${err instanceof Error ? err.message : String(err)}`,
                )
                captureException(err, {
                    source: "cron",
                    location: `${CRON_LANE}:alert-write`,
                })
            }
        }

        logger.info(`[cron/${CRON_LANE}] complete`, {
            surveyed: candidates.length,
            aggTrack,
            aggOk,
            aggregateOkPct: Math.round(aggregateOkPct * 1000) / 10,
            perSetlistBreached: perSetlistBreached.length,
            repaired,
        })

        return NextResponse.json({
            ok: true,
            surveyed: candidates.length,
            aggregateOkPct: Math.round(aggregateOkPct * 1000) / 10,
            aggregateBreached,
            perSetlistBreached: perSetlistBreached.length,
            repaired,
            alertWritten: aggregateBreached || perSetlistBreached.length > 0,
        })
    } catch (err) {
        logger.error(`[cron/${CRON_LANE}] check failed:`, err)
        captureException(err, { source: "cron", location: CRON_LANE })
        return NextResponse.json(
            { error: "Check failed", message: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        )
    }
}
