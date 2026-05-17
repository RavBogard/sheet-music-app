import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { unassignAssignmentService } from "@/lib/scheduling/assignment-service"

const unassignSchema = z.object({
    assignmentId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-004: rate-limit cancellation cascade (email + SMS + push)
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { assignmentId } = ctx.body!
        const db = getFirestore()

        // Cycle-3 c1: shared service module — same logic the MCP `unassign_musician`
        // tool calls. Wire response shape is unchanged.
        const result = await unassignAssignmentService(db, assignmentId)

        if (!result.ok) {
            if (result.kind === "not_found") {
                return NextResponse.json(
                    { error: "Assignment not found" },
                    { status: 404 },
                )
            }
            // invalid_transition
            return NextResponse.json(
                {
                    error: `Cannot cancel assignment in '${result.currentStatus}' state`,
                    currentStatus: result.currentStatus,
                },
                { status: 400 },
            )
        }

        return NextResponse.json({
            success: true,
            assignmentId: result.assignmentId,
        })
    },
    { role: 'band_leader', schema: unassignSchema }
)
