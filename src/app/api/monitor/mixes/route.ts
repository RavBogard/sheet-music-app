import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { mixerOn } from "@/lib/org/mixer"
import { listSavedMixes, saveMix } from "@/lib/monitor/mixes-server"
import { MIX_NAME_MAX } from "@/lib/monitor/saved-mixes"
import { mixerFeatureOff, monitorResponse } from "@/lib/monitor/api-result"

/**
 * BET-4 saved mixes for the iPad (the MCP has list_saved_mixes).
 *   GET  /api/monitor/mixes?busIndex=N  — your named mixes + the last 3 auto snapshots
 *   POST /api/monitor/mixes             — save this bus's current levels under a name
 * Own bus only unless sound engineer or admin; named mixes are private to their
 * owner. CRC only (the mixer is CRC's).
 */

function busParam(v: string | null): number | undefined {
    if (v == null || v === "") return undefined
    const n = Number(v)
    return Number.isInteger(n) ? n : NaN
}

export const GET = createApiHandler(async (ctx) => {
    if (!(await mixerOn(ctx.auth.orgId))) return mixerFeatureOff()
    initAdmin()
    const busIndex = busParam(ctx.req.nextUrl.searchParams.get("busIndex"))
    return monitorResponse(await listSavedMixes(getFirestore(), ctx.auth.uid, { busIndex }))
})

const SaveBody = z.object({
    busIndex: z.number().int().min(1).max(5).optional(),
    name: z.string().trim().min(1).max(MIX_NAME_MAX),
    serviceType: z.string().max(40).nullable().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        if (!(await mixerOn(ctx.auth.orgId))) return mixerFeatureOff()
        initAdmin()
        return monitorResponse(await saveMix(getFirestore(), ctx.auth.uid, ctx.body!))
    },
    { schema: SaveBody },
)
