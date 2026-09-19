/**
 * The verdict half of the `today.json` freshness check — pure, so the alerting
 * behaviour can be tested without Firestore, Storage or Resend.
 *
 * WHY THIS EXISTS. `emitToday` returns `{ok:false, error}` and never throws
 * (`src/lib/today/emit-today.ts`) — deliberately, because a failed emit must
 * not cost a service. Once Publish was retired (R-0919-audit-3) this cron
 * became the ONLY writer of `public/today/<org>.json`. Put those two facts
 * together and a silent failure looks exactly like success: the object is
 * still there, still parses, still serves — and its `generatedAt` quietly
 * stops moving. The reader and Overlays would go on believing a week-old plan.
 *
 * So the cron no longer trusts its own return value. It writes, then reads the
 * object back and asks how old the bytes on the wire actually are. Two
 * different failures, one alert:
 *
 *   emit_failed  — `emitToday` said `ok:false`. We know why; the error is in
 *                  the message.
 *   stale        — the emit claimed success but the object we read back is
 *                  older than the tolerance. Something is wrong between here
 *                  and the bucket (wrong bucket, silent permission failure, a
 *                  write that went to a different path).
 *   missing      — nothing has ever been emitted for this org.
 *
 * TOLERANCE. The cron runs every 15 minutes, so a healthy object is at most
 * one slot old plus the run's own duration. 20 minutes is that slot plus
 * margin: tight enough that one wholly missed run is visible, loose enough
 * that a slow run or a little clock skew is not an alert.
 */

/** A healthy object is at most one 15-minute slot old, plus margin. */
export const TODAY_STALE_AFTER_MS = 20 * 60 * 1000

export interface OrgEmitOutcome {
    org: string
    /** What `emitToday` returned. */
    ok: boolean
    error?: string
    /**
     * `generatedAt` of the object read back AFTER the emit, as epoch ms.
     * `null` means no object exists; `undefined` means the read-back itself
     * failed (which is reported as its own problem, not as freshness).
     */
    readBackGeneratedAtMs?: number | null
    /** Why the read-back could not be done, when it could not be. */
    readBackError?: string
}

export interface TodayFreshnessVerdict {
    healthy: boolean
    problems: string[]
    /**
     * A stable shape-of-the-problem string. Two runs with the same signature
     * are the same outstanding problem and must not re-notify; a different
     * signature is news and always sends. Empty when healthy.
     */
    signature: string
    remedy: string
    /** Per-org detail for the alert body and the JSON response. */
    detail: Array<{
        org: string
        state: "ok" | "emit_failed" | "stale" | "missing" | "unreadable"
        ageSeconds: number | null
        error?: string
    }>
}

function ageSecondsOf(generatedAtMs: number, now: number): number {
    return Math.round((now - generatedAtMs) / 1000)
}

/**
 * Decide whether this run of the emitter actually left a fresh `today.json`
 * behind for every tenant.
 */
export function evaluateTodayFreshness(params: {
    outcomes: OrgEmitOutcome[]
    now: number
    staleAfterMs?: number
}): TodayFreshnessVerdict {
    const { outcomes, now } = params
    const staleAfterMs = params.staleAfterMs ?? TODAY_STALE_AFTER_MS

    const problems: string[] = []
    const signatureParts: string[] = []
    const detail: TodayFreshnessVerdict["detail"] = []

    for (const o of outcomes) {
        if (!o.ok) {
            problems.push(
                `${o.org}: today.json emit FAILED — ${o.error ?? "no error reported"}`,
            )
            signatureParts.push(`${o.org}:emit_failed`)
            detail.push({ org: o.org, state: "emit_failed", ageSeconds: null, error: o.error })
            continue
        }

        if (o.readBackError !== undefined) {
            problems.push(
                `${o.org}: the emit reported success but the object could not be read back — ${o.readBackError}`,
            )
            signatureParts.push(`${o.org}:unreadable`)
            detail.push({
                org: o.org,
                state: "unreadable",
                ageSeconds: null,
                error: o.readBackError,
            })
            continue
        }

        if (o.readBackGeneratedAtMs == null) {
            problems.push(
                `${o.org}: the emit reported success but no today.json exists at the expected path.`,
            )
            signatureParts.push(`${o.org}:missing`)
            detail.push({ org: o.org, state: "missing", ageSeconds: null })
            continue
        }

        const ageSeconds = ageSecondsOf(o.readBackGeneratedAtMs, now)
        if (now - o.readBackGeneratedAtMs > staleAfterMs) {
            problems.push(
                `${o.org}: the emit reported success but the object served is ${ageSeconds}s old ` +
                    `(tolerance ${Math.round(staleAfterMs / 1000)}s) — the write is not landing where the reader looks.`,
            )
            signatureParts.push(`${o.org}:stale`)
            detail.push({ org: o.org, state: "stale", ageSeconds })
            continue
        }

        detail.push({ org: o.org, state: "ok", ageSeconds })
    }

    const healthy = problems.length === 0
    return {
        healthy,
        problems,
        signature: healthy ? "" : signatureParts.sort().join(","),
        remedy: healthy
            ? ""
            : "Check the Vercel cron log for /api/cron/emit-today and the Firebase Storage bucket " +
              "(public/today/<org>.json). Nothing is broken for a service in progress — the reader " +
              "and Overlays both keep working without today.json — but the plan they show is the last " +
              "one that emitted, so fix it before the next service is authored.",
        detail,
    }
}
