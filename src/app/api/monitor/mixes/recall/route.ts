import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { mixerOn } from "@/lib/org/mixer"
import { recallMix } from "@/lib/monitor/mixes-server"
import { mixerFeatureOff, monitorResponse } from "@/lib/monitor/api-result"

/**
 * BET-4: POST /api/monitor/mixes/recall { snapshotId, busIndex?, dryRun? }.
 * dryRun (the default) returns the list of changes for the confirm sheet; the
 * confirmed call sends a ramped move through the normal command queue under
 * the caller's uid, so the bridge's ownership and limit checks apply.
 */
const RecallBody = z.object({
    snapshotId: z.string().min(1).max(200),
    busIndex: z.number().int().min(1).max(5).optional(),
    dryRun: z.boolean().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        if (!(await mixerOn(ctx.auth.orgId))) return mixerFeatureOff()
        initAdmin()
        return monitorResponse(await recallMix(getFirestore(), ctx.auth.uid, ctx.body!))
    },
    { schema: RecallBody },
)
