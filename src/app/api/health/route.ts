import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/health
 *
 * `{ok, uptime}`. It used to add the age of the stored `today.json` per
 * tenant, which measured the 15-minute emit cron. `/api/today` now builds the
 * document on request, so that age measured nothing; ask `/today.json` itself
 * (its `generatedAt`) to see what the reader is looking at.
 */
export async function GET() {
    return NextResponse.json({
        ok: true,
        uptime: process.uptime(),
    })
}
