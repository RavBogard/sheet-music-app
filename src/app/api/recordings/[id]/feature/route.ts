import { NextResponse } from "next/server"

import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { hasTenantRole } from "@/lib/org/access"
import { RecordingRefusal, setFeaturedRecording } from "@/lib/recordings/featured-server"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * POST /api/recordings/[id]/feature
 *
 * Make this recording its song's one featured take. Band leader or admin of
 * the host congregation; a recording of another congregation answers 404
 * (setFeaturedRecording only finds the host tenant's recordings).
 */
export const POST = createApiHandler<{ id: string }>(async (ctx) => {
    const limited = await checkRateLimit(ctx.req, "api")
    if (limited) return limited

    if (!hasTenantRole(ctx.auth.access, "band_leader")) {
        return apiError("Only a band leader or admin can choose the featured recording.", 403, "forbidden_role")
    }
    const id = ctx.params?.id
    if (!id) return apiError("Missing recording id", 400, "invalid_argument")
    if (!initAdmin()) return apiError("Server not ready", 500, "FIREBASE_NOT_INITIALIZED")

    try {
        const result = await setFeaturedRecording(getFirestore(), ctx.auth.orgId, id)
        return NextResponse.json({ ok: true, recordingId: id, ...result })
    } catch (err) {
        if (err instanceof RecordingRefusal) {
            return NextResponse.json(err.envelope, { status: err.status })
        }
        logger.error("[recordings/feature] failed", { id, err })
        return apiError("Could not set the featured recording", 500, "INTERNAL_ERROR")
    }
})
