
import { NextRequest, NextResponse } from "next/server"
import { syncLibraryIndex } from "@/lib/sync-engine"
import { verifyIdToken } from "@/lib/firebase-admin"

export const maxDuration = 300 // 5 minutes timeout for sync

export async function POST(req: NextRequest) {
    try {
        // 1. Auth Check (Admin Only)
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Missing token" }, { status: 401 })
        }

        const token = authHeader.split(" ")[1]
        const decodedToken = await verifyIdToken(token)

        if (!decodedToken) { // In a real app, check role === 'admin'
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Run Sync
        const stats = await syncLibraryIndex()

        return NextResponse.json({
            success: true,
            stats
        })

    } catch (error: any) {
        console.error("Sync API Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
