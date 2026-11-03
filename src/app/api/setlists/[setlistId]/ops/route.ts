import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    applyOpsAuthorized,
    authorizeSetlistCaller,
    REFUSAL_STATUS,
    validateOpsRequest,
    type OpsRequest,
    type OpsRefusal,
} from "@/lib/setlist-ops"

/**
 * POST /api/setlists/{setlistId}/ops — the setlist op endpoint
 * (docs/planning/2026-11-03-setlist-sync-structural/OPS-CONTRACT.md).
 *
 * Auth: signed in, and admin or band leader IN THE SETLIST'S TENANT, which is
 * read from the setlist doc and never from the request. Every caller who
 * passes that check is a trusted leader, and trusted leaders skip the
 * per-user rate limit (as on the MCP writers), so there is no limiter here.
 *
 * (The contract names the segment `[id]`; Next.js refuses two slug names at
 * one level, and `/api/setlists/[setlistId]/…` already exists, so this route
 * uses `[setlistId]`. The URL is the same.)
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const refusal = (r: OpsRefusal) => NextResponse.json(r, { status: REFUSAL_STATUS[r.reason] })

export const POST = createApiHandler<{ setlistId: string }>(async (ctx) => {
    if (!initAdmin()) {
        return NextResponse.json({ ok: false, reason: "not-found", message: "Server not ready" }, { status: 503 })
    }
    const setlistId = ctx.params?.setlistId ?? ""

    let body: unknown
    try {
        body = await ctx.req.json()
    } catch {
        return refusal({ ok: false, reason: "invalid", message: "Invalid JSON" })
    }
    const invalid = validateOpsRequest(body)
    if (invalid) return refusal(invalid)

    const db = getFirestore()
    const auth = await authorizeSetlistCaller(db, ctx.auth.uid, setlistId)
    if (!auth.ok) return refusal(auth)

    const result = await applyOpsAuthorized(db, setlistId, body as OpsRequest, { actor: ctx.auth.uid })
    if (!result.ok) return refusal(result)
    return NextResponse.json(result)
})
