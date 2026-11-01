import { NextRequest, NextResponse } from "next/server"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { readCeremonyCard } from "@/lib/family/ceremony-card"
import { coerceOrgId } from "@/lib/org/registry"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * GET /api/setlists/{setlistId}/ceremony — BET-6, the read-only Beit Mitzvah
 * card for a setlist (student names, slot, reading reference names, rehearsal
 * dates). Public like the setlist itself (/perform/setlist/<id> is public by
 * design, and Daniel allows names here), rate-limited, CRC host only.
 *
 * Fails quietly: anything unavailable answers `{ card: null }` with 200, so
 * the card simply hides. Never an error a musician has to read.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const HEADERS = { "Cache-Control": "private, max-age=60" }

export async function GET(req: NextRequest, ctx: { params: Promise<{ setlistId: string }> }) {
    const limited = await checkRateLimit(req, "perform")
    if (limited) return limited
    const { setlistId } = await ctx.params
    const org = coerceOrgId(req.headers.get("x-org-id"))
    if (!setlistId || !initAdmin()) return NextResponse.json({ card: null }, { headers: HEADERS })
    const card = await readCeremonyCard(getFirestore(), setlistId, org)
    return NextResponse.json({ card }, { headers: HEADERS })
}
