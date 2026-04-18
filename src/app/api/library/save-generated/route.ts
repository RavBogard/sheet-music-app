import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const schema = z.object({
    xmlContent: z.string().min(1),
    title: z.string().min(1),
    sourceFileId: z.string().optional(),
    originalName: z.string().optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 10 uploads/min
        const limited = await checkRateLimit(ctx.req, 'upload')
        if (limited) return limited

        const { xmlContent, title, sourceFileId, originalName } = ctx.body!

        const db = getFirestore()

        const docRef = await db.collection("digitized_charts").add({
            title,
            originalName: originalName || "Unknown",
            sourceFileId,
            xmlContent,
            createdAt: new Date().toISOString(),
            createdBy: ctx.auth.uid,
            createdByName: ctx.auth.token.name || ctx.auth.email || "Unknown"
        })

        return NextResponse.json({
            success: true,
            id: `db-${docRef.id}`, // Prefix to distinguish from Drive IDs
            message: "Saved to Application Library"
        }, { status: 201 })
    },
    { schema }
)
