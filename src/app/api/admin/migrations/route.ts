import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { runPendingMigrations } from "@/lib/firebase/migrations"
import { z } from "zod"

/**
 * POST /api/admin/migrations
 * Body: {}
 * Requires: 'admin' role
 * 
 * Executes any pending sequential Firestore migrations defined in src/lib/firebase/migrations.ts
 */
export const POST = createApiHandler(
    async () => {
        const result = await runPendingMigrations()
        return NextResponse.json({
            success: true,
            message: result.errors.length > 0
                ? `Processed with ${result.errors.length} errors.`
                : `Successfully applied ${result.applied.length} migrations.`,
            ...result
        })
    },
    { role: 'admin', schema: z.object({}) }
)
