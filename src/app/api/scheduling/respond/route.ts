import { getT } from "@/i18n/server"
import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { respondToAssignmentService } from "@/lib/scheduling/assignment-service"

const respondSchema = z.object({
    assignmentId: z.string().min(1),
    action: z.enum(['accept', 'decline']),
    declineReason: z.string().optional(),
})

/** Assignment status → its translated word (unknown statuses pass through raw). */
const STATUS_WORD = {
    pending: "api-scheduling.statusPending",
    confirmed: "api-scheduling.statusConfirmed",
    declined: "api-scheduling.statusDeclined",
    cancelled: "api-scheduling.statusCancelled",
} as const
function statusWord(t: (key: string) => string, status: string): string {
    const key = (STATUS_WORD as Record<string, string>)[status]
    return key ? t(key) : status
}

export const POST = createApiHandler(
    async (ctx) => {
        // v4.4 SEC-005: rate-limit accept/decline toggles to prevent notification spam
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { assignmentId, action, declineReason } = ctx.body!
        const db = getFirestore()

        // Cycle-3 c1: shared service module — same logic the MCP `respond_to_assignment`
        // tool calls. Wire response shape is unchanged.
        const result = await respondToAssignmentService(db, {
            assignmentId,
            actorUid: ctx.auth.uid,
            action,
            declineReason,
        })

        if (!result.ok) {
            const t = await getT()
            if (result.kind === "not_found") {
                return NextResponse.json(
                    { error: t("api-scheduling.assignmentNotFound") },
                    { status: 404 },
                )
            }
            if (result.kind === "forbidden") {
                return NextResponse.json(
                    { error: t("api-scheduling.notYourAssignment") },
                    { status: 403 },
                )
            }
            // already_responded
            return NextResponse.json(
                {
                    error: t("api-scheduling.assignmentAlready", { status: statusWord(t, result.currentStatus) }),
                    currentStatus: result.currentStatus,
                },
                { status: 400 },
            )
        }

        return NextResponse.json({
            success: true,
            status: result.status,
            assignmentId: result.assignmentId,
        })
    },
    { role: 'musician', schema: respondSchema }
)
