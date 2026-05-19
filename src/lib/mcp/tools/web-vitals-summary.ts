import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Cycle-7-fixes Lane 4 sub-task I (C7I4-005) — admin-only read surface
 * for the `webVitalsObservations` sink populated by `/api/web-vitals`.
 *
 * Returns p75 LCP / CLS / INP / FCP / TTFB per `surface` (route) across
 * the past `sinceDays` (default 7). Computation is in-memory over all
 * observations matching the timestamp cutoff; the field-data sink has a
 * 90-day TTL (firestore.indexes.json) so unbounded growth is bounded
 * upstream. A per-call `maxDocs` safety cap (default 20k, hard max 100k)
 * protects against pathological scans.
 *
 * The MCP surface mirrors `dump_collection_size`'s admin-only gate
 * (caller's `users/{uid}.role` must equal `admin`). The data is field-RUM
 * which can be PII-adjacent at the IP-level; non-admin reads would
 * conflict with the unauth-public POST sink's pseudonymity contract.
 */

const METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const
type Metric = (typeof METRICS)[number]

export interface GetWebVitalsSummaryArgs {
    /** Optional `surface` filter — exact match against the value stored at write time. */
    surface?: string
    /** Lookback window in days. Default 7. Capped at 90 (the sink TTL). */
    sinceDays?: number
    /** Safety cap on docs scanned. Default 20000; hard max 100000. */
    maxDocs?: number
    /** Top-N routes to return when no `surface` filter is set. Default 5. */
    topRoutes?: number
}

export interface WebVitalsRouteSummary {
    surface: string
    sampleCount: number
    metrics: Record<Metric, { p75: number | null; sampleCount: number }>
}

export interface GetWebVitalsSummaryResult {
    ok: true
    sinceDays: number
    since: string
    sampleCount: number
    truncated: boolean
    routes: WebVitalsRouteSummary[]
}

const DEFAULT_SINCE_DAYS = 7
const MAX_SINCE_DAYS = 90
const DEFAULT_MAX_DOCS = 20_000
const HARD_MAX_DOCS = 100_000
const DEFAULT_TOP_ROUTES = 5

async function loadCallerRole(uid: string): Promise<string | undefined> {
    const db = getFirestore()
    const snap = await db.collection("users").doc(uid).get()
    if (!snap.exists) return undefined
    const data = snap.data() as Record<string, unknown> | undefined
    return typeof data?.role === "string" ? data.role : undefined
}

function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null
    const sorted = values.slice().sort((a, b) => a - b)
    // Standard nearest-rank p75: rank = ceil(p/100 * n). For our small/medium
    // sample sizes this is close enough to linear-interpolation p75 and stays
    // deterministic for emulator tests.
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
    return sorted[rank - 1]
}

export async function getWebVitalsSummary(
    callerUid: string,
    args: GetWebVitalsSummaryArgs = {},
): Promise<GetWebVitalsSummaryResult | RichErrorEnvelope> {
    initAdmin()

    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden",
            "get_web_vitals_summary requires admin role.",
            { callerRole: role ?? null },
            "Sign in as admin or ask one to read the field-data summary for you.",
        )
    }

    const sinceDays =
        args.sinceDays === undefined ? DEFAULT_SINCE_DAYS : args.sinceDays
    if (
        typeof sinceDays !== "number" ||
        !Number.isFinite(sinceDays) ||
        sinceDays <= 0 ||
        sinceDays > MAX_SINCE_DAYS
    ) {
        return richError(
            "invalid_argument",
            `sinceDays must be a number in (0, ${MAX_SINCE_DAYS}].`,
            { requestedSinceDays: sinceDays, maxSinceDays: MAX_SINCE_DAYS },
            `The sink TTL is ${MAX_SINCE_DAYS} days; older observations have been auto-purged.`,
        )
    }

    const maxDocs = Math.min(
        Math.max(1, args.maxDocs ?? DEFAULT_MAX_DOCS),
        HARD_MAX_DOCS,
    )
    const topRoutes = Math.max(1, args.topRoutes ?? DEFAULT_TOP_ROUTES)

    const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
    const sinceTs = Timestamp.fromMillis(sinceMs)

    const db = getFirestore()
    let query: FirebaseFirestore.Query = db
        .collection("webVitalsObservations")
        .where("timestamp", ">=", sinceTs)
    if (typeof args.surface === "string" && args.surface.trim()) {
        query = query.where("surface", "==", args.surface.trim())
    }
    // `limit(maxDocs + 1)` lets us detect truncation without a second scan.
    const snap = await query.limit(maxDocs + 1).get()
    const truncated = snap.size > maxDocs
    const docs = truncated ? snap.docs.slice(0, maxDocs) : snap.docs

    type Bucket = Record<Metric, number[]>
    const byRoute = new Map<string, Bucket>()
    const emptyBucket = (): Bucket => ({
        LCP: [],
        CLS: [],
        INP: [],
        FCP: [],
        TTFB: [],
    })

    for (const d of docs) {
        const data = d.data() as Record<string, unknown>
        const surface =
            typeof data.surface === "string" && data.surface.trim()
                ? data.surface
                : "(unknown)"
        const metric = data.metric
        const value = data.value
        if (typeof metric !== "string" || !METRICS.includes(metric as Metric)) {
            continue
        }
        if (typeof value !== "number" || !Number.isFinite(value)) continue
        let bucket = byRoute.get(surface)
        if (!bucket) {
            bucket = emptyBucket()
            byRoute.set(surface, bucket)
        }
        bucket[metric as Metric].push(value)
    }

    let routeEntries = [...byRoute.entries()].map(([surface, bucket]) => {
        const metrics: WebVitalsRouteSummary["metrics"] = {
            LCP: { p75: percentile(bucket.LCP, 75), sampleCount: bucket.LCP.length },
            CLS: { p75: percentile(bucket.CLS, 75), sampleCount: bucket.CLS.length },
            INP: { p75: percentile(bucket.INP, 75), sampleCount: bucket.INP.length },
            FCP: { p75: percentile(bucket.FCP, 75), sampleCount: bucket.FCP.length },
            TTFB: { p75: percentile(bucket.TTFB, 75), sampleCount: bucket.TTFB.length },
        }
        const sampleCount =
            metrics.LCP.sampleCount +
            metrics.CLS.sampleCount +
            metrics.INP.sampleCount +
            metrics.FCP.sampleCount +
            metrics.TTFB.sampleCount
        return { surface, sampleCount, metrics }
    })

    routeEntries.sort((a, b) => b.sampleCount - a.sampleCount)
    if (typeof args.surface !== "string" || !args.surface.trim()) {
        routeEntries = routeEntries.slice(0, topRoutes)
    }

    return {
        ok: true,
        sinceDays,
        since: new Date(sinceMs).toISOString(),
        sampleCount: docs.length,
        truncated,
        routes: routeEntries,
    }
}
