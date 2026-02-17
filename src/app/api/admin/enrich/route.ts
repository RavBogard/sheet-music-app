import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { enrichFile } from "@/lib/enrichment-engine"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req, 'admin')
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(req, 'ai')
        if (limited) return limited

        initAdmin()
        const db = getFirestore()

        // Scan for unenriched files
        const snapshot = await db.collection('library_index')
            .where('metadata.enrichedAt', '==', null)
            .limit(10)
            .get()

        if (snapshot.empty) {
            return NextResponse.json({ success: true, message: "No files need enrichment", stats: { total: 0, success: 0 } })
        }

        const stats = {
            total: snapshot.size,
            success: 0,
            failed: 0,
            skipped: 0,
            enrichedFiles: [] as string[],
            failedFiles: [] as string[],
        }

        logger.info(`[Admin] Starting Manual Enrichment Batch: ${stats.total} files`)

        for (const doc of snapshot.docs) {
            const data = doc.data()
            if (data.mimeType.includes('folder') || data.mimeType.startsWith('audio/')) {
                stats.skipped++
                continue
            }

            try {
                await enrichFile(doc.id)
                stats.success++
                stats.enrichedFiles.push(data.name || doc.id)
            } catch (e) {
                logger.error(`[Admin] Failed to enrich ${data.name}`, e)
                stats.failed++
                stats.failedFiles.push(data.name || doc.id)
            }
        }

        return NextResponse.json({ success: true, message: "Enrichment batch complete", stats })
    } catch (error: unknown) {
        logger.error("Admin Enrichment Error:", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
    }
}
