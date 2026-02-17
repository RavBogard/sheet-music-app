import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const { xmlContent, title, sourceFileId, originalName } = await req.json()

        if (!xmlContent || !title) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        const db = getFirestore()

        const docRef = await db.collection("digitized_charts").add({
            title,
            originalName: originalName || "Unknown",
            sourceFileId,
            xmlContent,
            createdAt: new Date().toISOString(),
            createdBy: auth.uid,
            createdByName: auth.token.name || auth.email || "Unknown"
        })

        return NextResponse.json({
            success: true,
            id: `db-${docRef.id}`, // Prefix to distinguish from Drive IDs
            message: "Saved to Application Library"
        })

    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("Save Generated Error:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
    }
}
