import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * Library List API — Optimized with pagination + ETag caching
 * 
 * Modes:
 *   GET /api/library/list                    → All files, paginated (default 200)
 *   GET /api/library/list?cursor=XXXX        → Next page
 *   GET /api/library/list?folderId=XXXX      → Files in folder
 *   GET /api/library/list?all=true           → Full dump for client-side search (cached)
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Auth
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        // 2. Parse params
        const url = new URL(req.url)
        const folderId = url.searchParams.get("folderId")
        const cursor = url.searchParams.get("cursor")
        const all = url.searchParams.get("all") === "true"
        const limitParam = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500)

        initAdmin()
        const db = getFirestore()

        // 3. Build query
        let dbQuery: FirebaseFirestore.Query = db.collection('library_index')
            .orderBy('name')

        if (folderId) {
            // Folder navigation — Firestore composite index: parents + name
            dbQuery = db.collection('library_index')
                .where('parents', 'array-contains', folderId)
                .orderBy('name')
        }

        // For "all" mode: fetch everything for client-side Fuse.js search
        // This is the right tradeoff at ~180 files: one cached request vs many paginated ones
        if (all) {
            dbQuery = dbQuery.limit(5000)
        } else {
            dbQuery = dbQuery.limit(limitParam)
        }

        // Cursor-based pagination (use document snapshot, not offset)
        if (cursor && !all) {
            const cursorDoc = await db.collection('library_index').doc(cursor).get()
            if (cursorDoc.exists) {
                dbQuery = dbQuery.startAfter(cursorDoc)
            }
        }

        // 4. Execute
        const snapshot = await dbQuery.get()

        // Track the most recent modification across all documents
        let maxModified = ''

        const files = snapshot.docs.map(doc => {
            const data = doc.data()
            // Track latest modification for cache staleness
            if (data.lastSyncedAt && data.lastSyncedAt > maxModified) {
                maxModified = data.lastSyncedAt
            }
            return {
                id: doc.id,
                name: data.name,
                mimeType: data.mimeType,
                parents: data.parents,
                modifiedTime: data.modifiedTime || null,
                webViewLink: data.webViewLink,
                metadata: data.metadata || null
            }
        })

        // 5. Build response with caching headers
        const lastDoc = snapshot.docs[snapshot.docs.length - 1]
        const hasMore = !all && snapshot.docs.length === limitParam

        const body = {
            files,
            nextCursor: hasMore ? lastDoc?.id : null,
            total: files.length,
            lastModified: maxModified || new Date().toISOString(),
        }

        const response = NextResponse.json(body)

        // Cache "all" responses for 5 minutes (library changes only via admin sync)
        if (all) {
            response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60')
        }

        return response

    } catch (error: unknown) {
        logger.error("Library List Error:", error)
        return NextResponse.json({ error: "Failed to load library" }, { status: 500 })
    }
}
