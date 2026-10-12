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
 * Multi-tenant phase 2 (W9): metadata writes must never mint a stub
 * library_index row (a stub has no orgId and would be invisible to / mis-scoped
 * for every tenant). Update only an existing row; a missing row (or one
 * deleted between the read and the write) is a silent no-op. Module-local —
 * App Router route.ts may only export HTTP handlers + route config.
 */
async function updateLibraryRowIfExists(
    db: ReturnType<typeof getFirestore>,
    fileId: string,
    data: Record<string, unknown>,
): Promise<boolean> {
    const ref = db.collection("library_index").doc(fileId)
    const snap = await ref.get()
    if (!snap.exists) return false
    try {
        await ref.update(data)
        return true
    } catch (err) {
        const e = err as { code?: unknown; message?: unknown }
        if (e?.code === 5 || e?.code === "not-found" || /NOT_FOUND|No document to update/i.test(String(e?.message ?? ""))) {
            return false
        }
        throw err
    }
}

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
            await updateLibraryRowIfExists(db, fileId, { nativeKey: key, nativeKeySource: "auto" })
        }

        return NextResponse.json({ key, source: key ? "detected" : null })
    },
    { schema }
)
