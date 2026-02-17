import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { requireAuth } from "@/lib/api-auth"

export const dynamic = 'force-dynamic'

/**
 * GET /api/library/search-content?q=bridge&q=modulation
 * 
 * Searches extracted chord/text data across the library.
 * Looks in library_index/chordData subcollections for matching content.
 * 
 * Returns matching file IDs with the context of where the match was found.
 */
export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)
    } catch (response) {
        return response as NextResponse
    }

    const searchTerm = req.nextUrl.searchParams.get('q')?.trim()
    if (!searchTerm || searchTerm.length < 2) {
        return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 })
    }

    try {
        initAdmin()
        const db = getFirestore()
        const termLower = searchTerm.toLowerCase()

        // Get all library files (we search their chord data)
        const librarySnap = await db.collection('library_index')
            .where('mimeType', '!=', 'application/vnd.google-apps.folder')
            .limit(500)
            .get()

        const results: Array<{
            fileId: string
            fileName: string
            matches: Array<{ page: number; context: string }>
        }> = []

        // For each file, check its chordData subcollection
        for (const fileDoc of librarySnap.docs) {
            const fileName = fileDoc.data().name || fileDoc.id
            const chordSnap = await db.collection('library_index')
                .doc(fileDoc.id)
                .collection('chordData')
                .get()

            if (chordSnap.empty) continue

            const matches: Array<{ page: number; context: string }> = []

            for (const chordDoc of chordSnap.docs) {
                const data = chordDoc.data()
                // Search in raw text content, chord names, section labels
                const searchableFields = [
                    data.rawText,
                    ...(data.chords || []).map((c: { name?: string }) => c.name),
                    ...(data.sections || []).map((s: { label?: string }) => s.label),
                ].filter(Boolean)

                const fullText = searchableFields.join(' ').toLowerCase()

                if (fullText.includes(termLower)) {
                    // Extract context around the match
                    const idx = fullText.indexOf(termLower)
                    const start = Math.max(0, idx - 40)
                    const end = Math.min(fullText.length, idx + termLower.length + 40)
                    const context = (start > 0 ? '...' : '') +
                        fullText.slice(start, end) +
                        (end < fullText.length ? '...' : '')

                    matches.push({
                        page: parseInt(chordDoc.id.replace('page_', '')) || 1,
                        context: context.trim(),
                    })
                }
            }

            if (matches.length > 0) {
                results.push({ fileId: fileDoc.id, fileName, matches })
            }
        }

        return NextResponse.json({
            query: searchTerm,
            results,
            totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
        })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Search failed" },
            { status: 500 }
        )
    }
}
