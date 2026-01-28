import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"
import { withAuth } from "@/lib/api-middleware"

export const dynamic = 'force-dynamic'



// Main Handler wrapped in Middleware
export const GET = withAuth(async (request: Request) => {
    try {
        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId') || undefined
        const pageToken = searchParams.get('pageToken') || undefined
        const limit = parseInt(searchParams.get('limit') || '50')
        const q = searchParams.get('q') || undefined

        const drive = new DriveClient()

        // If no folderId and no query, we are at "Root".
        // But if the user has a massive root, we still need pagination.
        // We do typically want to support "Everything" if the UI expects it, but we can't efficiently.
        // The UI must adapt to pagination.

        const result = await drive.listFiles({
            folderId,
            pageToken,
            pageSize: limit,
            query: q
        })

        return NextResponse.json(result, {
            headers: {
                // Short cache for listings is fine, but pagination tokens expire so be careful.
                'Cache-Control': 'private, max-age=30, stale-while-revalidate=59'
            }
        })

    } catch (error) {
        // Middleware catches unhandled errors too, but we can handle specific API logic here if needed.
        // For now, rethrow to let middleware handle it or return specific drive error
        console.error("Drive API Logic Error:", error)
        throw error
    }
})
