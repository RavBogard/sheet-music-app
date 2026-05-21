import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * PGR-04 (2026-05-21) — admin-only read surface over the `aiSpend` sink
 * written per enrichment by `src/lib/library/ai-enrichment.ts`. Returns
 * trailing 7-day + 30-day token + estimated-USD rollups so Daniel can
 * snapshot the AI-cost baseline ([[project_ai_cost_baseline]]) without
 * leaving Claude.
 *
 * REPORT-ONLY by design — there is NO spend ceiling here. Daniel's standing
 * rule is "AI cost is REPORT, not CEILING" (decisions.md 2026-05-19). Cost
 * figures are estimates derived from per-1M-token pricing constants in
 * ai-enrichment.ts, not billing-grade.
 *
 * Admin gate mirrors `get_web_vitals_summary` / `dump_collection_size`.
 * The scan is a single-field `ts` range query — Firestore auto-indexes
 * single fields, so (unlike the surface+timestamp web-vitals composite)
 * NO composite index is required.
 */

export interface GetAiSpendSummaryArgs {
    /** Safety cap on docs scanned. Default 20000; hard max 100000. */
    maxDocs?: number
}

export interface SpendWindow {
    sinceDays: number
    since: string
    sampleCount: number
    totalTokens: number
    totalCostUsd: number
    byModel: Record<
        string,
        { sampleCount: number; totalTokens: number; totalCostUsd: number }
    >
}

export interface GetAiSpendSummaryResult {
    ok: true
    generatedAt: string
    truncated: boolean
    windows: { last7Days: SpendWindow; last30Days: SpendWindow }
}

const SCAN_WINDOW_DAYS = 30
const DEFAULT_MAX_DOCS = 20_000
const HARD_MAX_DOCS = 100_000
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** One persisted aiSpend doc (subset of fields this reader consumes). */
export interface SpendDoc {
    model?: string
    totalTokens?: number
    costUsd?: number
    ts?: string
}

function round6(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
}

async function loadCallerRole(uid: string): Promise<string | undefined> {
    const db = getFirestore()
    const snap = await db.collection("users").doc(uid).get()
    if (!snap.exists) return undefined
    const data = snap.data() as Record<string, unknown> | undefined
    return typeof data?.role === "string" ? data.role : undefined
}

/**
 * Pure rollup over already-fetched spend docs for a trailing window.
 * Extracted so the math is unit-testable without the emulator.
 */
export function rollupSpend(
    docs: SpendDoc[],
    windowDays: number,
    nowMs: number,
): SpendWindow {
    const sinceMs = nowMs - windowDays * MS_PER_DAY
    const sinceIso = new Date(sinceMs).toISOString()
    let sampleCount = 0
    let totalTokens = 0
    let totalCostUsd = 0
    const byModel: SpendWindow["byModel"] = {}

    for (const d of docs) {
        if (typeof d.ts !== "string" || d.ts < sinceIso) continue
        const model = typeof d.model === "string" && d.model ? d.model : "(unknown)"
        const tokens =
            typeof d.totalTokens === "number" && Number.isFinite(d.totalTokens)
                ? d.totalTokens
                : 0
        const cost =
            typeof d.costUsd === "number" && Number.isFinite(d.costUsd)
                ? d.costUsd
                : 0
        sampleCount++
        totalTokens += tokens
        totalCostUsd += cost
        const m = (byModel[model] ??= {
            sampleCount: 0,
            totalTokens: 0,
            totalCostUsd: 0,
        })
        m.sampleCount++
        m.totalTokens += tokens
        m.totalCostUsd += cost
    }

    totalCostUsd = round6(totalCostUsd)
    for (const m of Object.values(byModel)) m.totalCostUsd = round6(m.totalCostUsd)

    return {
        sinceDays: windowDays,
        since: sinceIso,
        sampleCount,
        totalTokens,
        totalCostUsd,
        byModel,
    }
}

export async function getAiSpendSummary(
    callerUid: string,
    args: GetAiSpendSummaryArgs = {},
): Promise<GetAiSpendSummaryResult | RichErrorEnvelope> {
    initAdmin()

    const role = await loadCallerRole(callerUid)
    if (role !== "admin") {
        return richError(
            "forbidden",
            "get_ai_spend_summary requires admin role.",
            { callerRole: role ?? null },
            "Sign in as admin to read the AI-spend rollup.",
        )
    }

    const maxDocs = Math.min(
        Math.max(1, args.maxDocs ?? DEFAULT_MAX_DOCS),
        HARD_MAX_DOCS,
    )

    const nowMs = Date.now()
    const sinceIso = new Date(nowMs - SCAN_WINDOW_DAYS * MS_PER_DAY).toISOString()

    const db = getFirestore()
    // Single-field `ts` range — no composite index needed.
    const snap = await db
        .collection("aiSpend")
        .where("ts", ">=", sinceIso)
        .limit(maxDocs + 1)
        .get()

    const truncated = snap.size > maxDocs
    const docs = (truncated ? snap.docs.slice(0, maxDocs) : snap.docs).map(
        (d) => d.data() as SpendDoc,
    )

    return {
        ok: true,
        generatedAt: new Date(nowMs).toISOString(),
        truncated,
        windows: {
            last7Days: rollupSpend(docs, 7, nowMs),
            last30Days: rollupSpend(docs, 30, nowMs),
        },
    }
}
