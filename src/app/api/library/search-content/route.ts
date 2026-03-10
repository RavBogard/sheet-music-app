import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = 'force-dynamic'

/**
 * GET /api/library/search-content?q=bridge&q=modulation
 *
 * Searches extracted chord/text data across the library.
 * Looks in library_index/chordData subcollections for matching content.
 *
 * Returns matching file IDs with the context of where the match was found.
 */
export const GET = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const searchTerm = ctx.req.nextUrl.searchParams.get('q')?.trim()
        if (!searchTerm || searchTerm.length < 2) {
            return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()
        const termLower = searchTerm.toLowerCase()

        // Use collectionGroup query to search all chordData across all files at once
        // This avoids the N+1 pattern of querying each file's subcollection individually
        const chordGroupSnap = await db.collectionGroup('chordData').limit(2000).get()

        // Build a map of fileId → file name for display
        const fileNameCache = new Map<string, string>()

        const results: Array<{
            fileId: string
            fileName: string
            matches: Array<{ page: number; context: string }>
        }> = []

        // Group chord docs by parent file
        const matchesByFile = new Map<string, Array<{ page: number; context: string }>>()

        for (const chordDoc of chordGroupSnap.docs) {
            const data = chordDoc.data()
            // Extract parent fileId from the doc path: library_index/{fileId}/chordData/{pageId}
            const fileId = chordDoc.ref.parent.parent?.id
            if (!fileId) continue

            // Search in raw text content, chord names, section labels
            const searchableFields = [
                data.rawText,
                ...(data.chords || []).map((c: { name?: string }) => c.name),
                ...(data.sections || []).map((s: { label?: string }) => s.label),
            ].filter(Boolean)

            const fullText = searchableFields.join(' ').toLowerCase()

            if (fullText.includes(termLower)) {
                const idx = fullText.indexOf(termLower)
                const start = Math.max(0, idx - 40)
                const end = Math.min(fullText.length, idx + termLower.length + 40)
                const context = (start > 0 ? '...' : '') +
                    fullText.slice(start, end) +
                    (end < fullText.length ? '...' : '')

                if (!matchesByFile.has(fileId)) {
                    matchesByFile.set(fileId, [])
                }
                matchesByFile.get(fileId)!.push({
                    page: parseInt(chordDoc.id.replace('page_', '')) || 1,
                    context: context.trim(),
                })
            }
        }

        // Fetch file names only for files that had matches
        if (matchesByFile.size > 0) {
            const fileIds = Array.from(matchesByFile.keys())
            const fileRefs = fileIds.map(id => db.collection('library_index').doc(id))
            const fileDocs = await db.getAll(...fileRefs)
            for (const doc of fileDocs) {
                if (doc.exists) {
                    fileNameCache.set(doc.id, doc.data()?.name || doc.id)
                }
            }
        }

        for (const [fileId, matches] of matchesByFile) {
            results.push({
                fileId,
                fileName: fileNameCache.get(fileId) || fileId,
                matches,
            })
        }

        return NextResponse.json({
            query: searchTerm,
            results,
            totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
        })
    }
)
