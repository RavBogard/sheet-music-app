import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { reorderSetlist } from "@/lib/mcp/tools/setlist-write"

/**
 * Live reorder from the Perform page (Daniel, 2026-10-31). A leader moves a
 * row mid-service; this writes the new order for the whole band.
 *
 * It is the SAME server path as MCP `reorder_setlist`: `reorderSetlist`
 * checks the caller is an admin or band leader in this tenant, refuses
 * another tenant's setlist as not found, requires the ids to be an exact
 * permutation of the setlist's rows, and bumps the version of every row and
 * of the setlist in one transaction. Signed-in iPads pick the change up from
 * their live listener; signed-out ones see the "Setlist updated" strip.
 *
 * Body: `{ setlistId, orderedTrackIds }`. Errors answer `{ ok: false, code }`
 * with the envelope's own status (403 role, 404 not found, 400 a list that
 * no longer matches the setlist, 409 stale).
 */
const bodySchema = z
    .object({
        setlistId: z.string().min(1).max(200),
        orderedTrackIds: z.array(z.string().min(1).max(200)).min(1).max(500),
    })
    .strict()

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const { setlistId, orderedTrackIds } = ctx.body!
        const result = await reorderSetlist(
            ctx.auth.uid,
            { setlistId, orderedTrackIds },
            ctx.auth.orgId,
        )
        if (result.ok) return NextResponse.json({ ok: true })
        const body = (result as { error?: { code?: number; machine_code?: string } }).error
        const status = typeof body?.code === "number" && body.code >= 400 && body.code < 600 ? body.code : 500
        return NextResponse.json({ ok: false, code: body?.machine_code ?? "reorder_failed" }, { status })
    },
    { role: "band_leader", schema: bodySchema },
)
