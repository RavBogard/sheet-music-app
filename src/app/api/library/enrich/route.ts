
import { NextRequest, NextResponse } from "next/server"
import { enrichFile } from "@/lib/enrichment-engine"
import { getAuth } from "firebase-admin/auth"
import { initAdmin } from "@/lib/firebase-admin"

initAdmin()

// Max duration for Vercel Pro (though we target <10s per file, sometimes AI is slow or file is large)
export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        // 1. Verify Admin
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        await getAuth().verifyIdToken(token)

        // 2. Parse Body
        const { fileId } = await req.json()
        if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 })

        // 3. Run Enrichment
        const data = await enrichFile(fileId)

        return NextResponse.json({ success: true, data })

    } catch (error: any) {
        console.error("Enrichment API Error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to enrich file" },
            { status: 500 }
        )
    }
}
