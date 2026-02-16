import { NextResponse } from "next/server"
import { initAdmin, getFirestore, getAuth } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        // 1. Verify Admin
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        const decodedToken = await getAuth().verifyIdToken(token)

        const body = await req.json()
        const { fileIds } = body

        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return new NextResponse("No IDs provided", { status: 400 })
        }

        logger.info(`[Prune] Deleting ${fileIds.length} docs...`)

        initAdmin()
        const db = getFirestore()

        const batch = db.batch()
        fileIds.forEach((id: string) => {
            batch.delete(db.collection('library_index').doc(id))
        })

        await batch.commit()

        return NextResponse.json({
            success: true,
            deletedCount: fileIds.length
        })

    } catch (error: unknown) {
        logger.error("Prune Execute Failed:", error)
        return new NextResponse((error instanceof Error ? error.message : "Unknown error") || "Internal Server Error", { status: 500 })
    }
}
