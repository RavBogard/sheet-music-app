import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { detectKeyFromPdf } from "@/lib/key-detection"
import { getFirestore } from "firebase-admin/firestore"
import { z } from "zod"

export const maxDuration = 30

const schema = z.object({
    fileId: z.string().min(1),
})

/**
 * POST /api/library/detect-key
 * Detect the native key of a PDF chart using text layer extraction.
 * Returns { key: string | null }
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { fileId } = ctx.body!

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
    },
    { schema }
)
