import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * Library List API — Optimized with pagination + ETag caching
 *
 * Modes:
 *   GET /api/library/list                    → All files, paginated (default 200)
 *   GET /api/library/list?cursor=XXXX        → Next page
 *   GET /api/library/list?folderId=XXXX      → Files in folder
 *   GET /api/library/list?all=true           → Full dump for client-side search (cached)
 *   GET /api/library/list?status=archived   → Archived files only
 */
export const GET = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        // 2. Parse params
        const url = new URL(ctx.req.url)
        const folderId = url.searchParams.get("folderId")
        const cursor = url.searchParams.get("cursor")
        const all = url.searchParams.get("all") === "true"
        const statusFilter = url.searchParams.get("status") // 'archived' to show only archived
        const collectionFilter = url.searchParams.get("collection") // 'supplemental' or 'core'
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

        const files = snapshot.docs
            .filter(doc => {
                const data = doc.data()
                const status = data.status
                if (statusFilter === 'archived' && status !== 'archived') return false
                if (statusFilter !== 'archived' && status === 'archived') return false
                
                const col = data.collection || 'core'
                if (collectionFilter && collectionFilter !== 'all' && col !== collectionFilter) return false
                
                return true
            })
            .map(doc => {
                const data = doc.data()
                // Track latest modification for cache staleness
                if (data.lastSyncedAt && data.lastSyncedAt > maxModified) {
                    maxModified = data.lastSyncedAt
                }
                return {
                    id: doc.id,
                    name: data.name,
                    ...(data.displayName ? { displayName: data.displayName } : {}),
                    mimeType: data.mimeType,
                    parents: data.parents,
                    modifiedTime: data.modifiedTime || null,
                    webViewLink: data.webViewLink,
                    metadata: data.metadata || null,
                    collection: data.collection || 'core',
                    status: (data.status as string) || 'active',
                    ...(statusFilter === 'archived' ? {
                        archivedAt: data.archivedAt || null,
                        archivedBy: data.archivedBy || null,
                    } : {}),
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

        // Cache "all" responses at the CDN edge for 5 min, serve stale for 1hr while revalidating.
        // The library is the same for all authenticated users, so CDN caching is safe.
        // Browser cache (max-age) is shorter to pick up changes on manual refresh.
        if (all) {
            response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600')
        }

        return response
    }
)
