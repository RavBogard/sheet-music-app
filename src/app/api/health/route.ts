import { NextResponse } from "next/server"
import { readStoredToday } from "@/lib/today/emit-today"
import { ORGS } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { TODAY_STALE_AFTER_MS } from "@/app/api/cron/emit-today/evaluate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/health
 *
 * Adds the `today.json` age per tenant (2026-09-19 audit, item (c)). The
 * emit-today cron mails when the file goes stale, but an alert is a thing you
 * receive; this is a thing you can ask. Before a service, "is the reader
 * looking at tonight's plan?" should be answerable in one request without a
 * Firebase console.
 *
 * `ageSeconds` is measured from the document's own `generatedAt`, so it is the
 * age of the bytes a consumer would fetch, not of the last cron invocation.
 *
 * This route stays `ok: true` when the read fails. It is a health readout, not
 * a gate: a Storage hiccup here must not make a deploy check think the app is
 * down, and `today.json` is not load-bearing for a service in any case — both
 * the reader and Overlays keep working without it.
 */
export async function GET() {
    const today: Record<
        string,
        { ageSeconds: number | null; stale: boolean | null; error?: string }
    > = {}

    await Promise.all(
        (Object.keys(ORGS) as OrgId[]).map(async (org) => {
            try {
                const doc = await readStoredToday(org)
                if (!doc) {
                    today[org] = { ageSeconds: null, stale: true, error: "never emitted" }
                    return
                }
                const ms = Date.parse(doc.generatedAt)
                if (!Number.isFinite(ms)) {
                    today[org] = {
                        ageSeconds: null,
                        stale: true,
                        error: `unparseable generatedAt: ${String(doc.generatedAt)}`,
                    }
                    return
                }
                const ageMs = Date.now() - ms
                today[org] = {
                    ageSeconds: Math.round(ageMs / 1000),
                    stale: ageMs > TODAY_STALE_AFTER_MS,
                }
            } catch (err) {
                logger.warn("[health] today.json read failed", {
                    org,
                    err: err instanceof Error ? err.message : String(err),
                })
                today[org] = {
                    ageSeconds: null,
                    stale: null,
                    error: err instanceof Error ? err.message : String(err),
                }
            }
        }),
    )

    return NextResponse.json({
        ok: true,
        uptime: process.uptime(),
        today,
        todayStaleAfterSeconds: Math.round(TODAY_STALE_AFTER_MS / 1000),
    })
}
