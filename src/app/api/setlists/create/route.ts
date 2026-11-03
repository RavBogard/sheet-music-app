import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { coerceOrgId } from "@/lib/org/registry"
import { createSetlistForCaller, REFUSAL_STATUS } from "@/lib/setlist-ops"

/**
 * POST /api/setlists/create — the browser's create, duplicate, clone and
 * save-as-template paths. One transaction writes the setlist and its rows
 * (src/lib/setlist-ops/create.ts).
 *
 * Auth is the /ops bar: signed in, admin or band leader in the setlist's
 * tenant. That tenant is the source setlist's when copying, else the host's
 * (`x-org-id`, which the proxy sets and overwrites), never a body field.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const POST = createApiHandler(async (ctx) => {
    if (!initAdmin()) {
        return NextResponse.json({ ok: false, reason: "not-found", code: "server_not_ready" }, { status: 503 })
    }
    let body: unknown
    try {
        body = await ctx.req.json()
    } catch {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 })
    }
    const hostOrg = coerceOrgId(ctx.req.headers.get("x-org-id"))
    const result = await createSetlistForCaller(getFirestore(), ctx.auth.uid, hostOrg, body)
    if (!result.ok) return NextResponse.json(result, { status: REFUSAL_STATUS[result.reason] })
    return NextResponse.json(result)
})
