import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFirestore } from "@/lib/firebase-admin"
import { reorderSetlist } from "@/lib/mcp/tools/setlist-write"

/**
 * Live reorder from the Perform page (Daniel, 2026-10-31). A leader moves a
 * row mid-service; this writes the new order for the whole band.
 *
 * It is the SAME server path as MCP `reorder_setlist`: `reorderSetlist`
 * checks the caller is an admin or band leader in this tenant, refuses
 * another tenant's setlist as not found, requires the ids to be an exact
 * permutation of the setlist's rows, gates on the setlist version the page
 * last saw, and bumps the version of every row and of the setlist in one
 * transaction. Signed-in iPads pick the change up from their live listener;
 * signed-out ones see the "Setlist updated" strip.
 *
 * Body: `{ setlistId, orderedTrackIds, lastSeenVersion? }`. Errors answer
 * `{ ok: false, code }` with the envelope's own status (403 role, 404 not
 * found, 400 a list that no longer matches the setlist). A stale version
 * answers 409 with the setlist's `currentVersion` and `orderedTrackIds`, so
 * the page can re-apply the leader's move on the fresh order and retry once.
 */
const bodySchema = z
    .object({
        setlistId: z.string().min(1).max(200),
        orderedTrackIds: z.array(z.string().min(1).max(200)).min(1).max(500),
        lastSeenVersion: z.number().int().nonnegative().optional(),
    })
    .strict()

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const { setlistId, orderedTrackIds, lastSeenVersion } = ctx.body!
        const result = await reorderSetlist(
            ctx.auth.uid,
            { setlistId, orderedTrackIds, lastSeenVersion },
            ctx.auth.orgId,
        )
        if (result.ok) return NextResponse.json({ ok: true })
        const env = result as { error?: { code?: number; machine_code?: string }; currentVersion?: unknown }
        const code = env.error?.machine_code ?? "reorder_failed"
        if (code === "stale_version") {
            // reorderSetlist already passed the role and tenant checks to get
            // here, so reading this setlist's row order is allowed.
            const snap = await getFirestore().collection("tracks").where("setlistId", "==", setlistId).get()
            const current = snap.docs
                .map((d) => ({ id: d.id, order: typeof d.data().order === "number" ? (d.data().order as number) : 0 }))
                .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
                .map((r) => r.id)
            return NextResponse.json(
                { ok: false, code, currentVersion: env.currentVersion, orderedTrackIds: current },
                { status: 409 },
            )
        }
        const http = env.error?.code
        const status = typeof http === "number" && http >= 400 && http < 600 ? http : 500
        return NextResponse.json({ ok: false, code }, { status })
    },
    { role: "band_leader", schema: bodySchema },
)
