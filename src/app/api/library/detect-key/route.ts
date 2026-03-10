import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { detectKeyFromPdf } from "@/lib/key-detection"
import { getFirestore } from "firebase-admin/firestore"
import { logger } from "@/lib/logger"

export const maxDuration = 30

/**
 * POST /api/library/detect-key
 * Detect the native key of a PDF chart using text layer extraction.
 * Returns { key: string | null }
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const body = await req.json()
        const { fileId } = body

        if (!fileId || typeof fileId !== "string") {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 })
        }

        // Check if we already have a cached native key
        const db = getFirestore()
        const doc = await db.collection("library_index").doc(fileId).get()
        if (doc.exists && doc.data()?.nativeKey) {
            return NextResponse.json({ key: doc.data()!.nativeKey, source: "cached" })
        }

        // Detect key from PDF
        const key = await detectKeyFromPdf(fileId)

        // Save to library_index if detected
        if (key) {
            await db.collection("library_index").doc(fileId).set(
                { nativeKey: key, nativeKeySource: "auto" },
                { merge: true }
            )
        }

        return NextResponse.json({ key, source: key ? "detected" : null })
    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("[DetectKey] Error:", error)
        return NextResponse.json({ error: "Key detection failed" }, { status: 500 })
    }
}
