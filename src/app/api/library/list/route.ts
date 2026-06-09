import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { httpError } from "@/lib/http/error-envelope"
import { coerceOrgId } from "@/lib/org/registry"
import { rowOrg } from "@/lib/org/membership"
import { getServerUser } from "@/lib/server-auth"

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

        // v11.1-03: host-org display filter. Default = the landing-page org
        // (x-org-id, Edge-resolved). An `allSites=true` opt-out is honored ONLY
        // for admins (full cross-tenant pool for authoring/binding). Display-only:
        // the file-serving routes are untouched, so direct access is never gated.
        const hostOrg = coerceOrgId(ctx.req.headers.get("x-org-id"))
        const wantsAllSites = url.searchParams.get("allSites") === "true"
        const su = wantsAllSites ? await getServerUser().catch(() => null) : null
        const allSites = wantsAllSites && !!su?.isAdmin

        if (!initAdmin()) {
            // Cycle-5 C5C-002 — rich envelope (was flat
            // `{error, code: 'FIREBASE_NOT_INITIALIZED'}`).
            return httpError(
                500,
                "server_not_ready",
                "Server not ready",
                { errorCode: 500, reason: "FIREBASE_NOT_INITIALIZED" },
            )
        }
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
                // v11.1-03: host-org isolation (display-only) unless an admin
                // opted into All-sites. Mirrors the MCP rowOrg filter pattern.
                if (!allSites && rowOrg(data.orgId) !== hostOrg) return false

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

        // Browser cache only — no CDN cache. The library_signals/latest
        // listener in useLibrary fires invalidateQueries on every MCP/in-app
        // upload+delete, but the refetch URL is stable (?all=true&collection=
        // ...&v=2) so any CDN-cached response masked the change for up to
        // s-maxage seconds. F5 doesn't override CDN cache — browsers can't.
        // The stress test on 2026-05-15 caught this: MCP-imported charts
        // never appeared in /library even after hard refresh. Library is
        // ~180 files, so per-request cost without CDN caching is negligible.
        // Keep the short browser cache so a click within 2 minutes is fast.
        if (all) {
            response.headers.set('Cache-Control', 'private, max-age=120')
        }

        return response
    }
)
