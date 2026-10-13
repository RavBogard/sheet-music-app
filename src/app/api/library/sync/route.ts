import { NextResponse } from "next/server"
import { syncLibraryIndex } from "@/lib/sync-engine"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireFeature } from "@/lib/org/features"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

export const maxDuration = 300

/**
 * Multi-tenant phase 6: the Drive library sync is part of driveInbox. It syncs
 * CRC's Drive root (GOOGLE_DRIVE_ROOT_FOLDER_ID) and stamps rows crc, so it
 * also refuses any tenant but crc, whose sync it is.
 */
export const POST = createApiHandler(
    async (ctx) => {
        const off = await requireFeature(ctx.auth.orgId, "driveInbox")
        if (off) return off
        if (ctx.auth.orgId !== DEFAULT_ORG_ID) {
            return NextResponse.json({ error: "not_configured", feature: "driveInbox" }, { status: 404 })
        }

        // Rate limit: 3 syncs/min
        const limited = await checkRateLimit(ctx.req, 'sync')
        if (limited) return limited

        const stats = await syncLibraryIndex()

        return NextResponse.json({ success: true, stats })
    },
    { role: 'admin' }
)
