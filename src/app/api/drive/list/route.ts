import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"
import { unstable_cache } from "next/cache"

export const dynamic = 'force-dynamic'

const getCachedFiles = unstable_cache(
    async (folderId: string | undefined) => {
        const drive = new DriveClient()
        console.log(`[Cache Miss] Fetching files from Drive for: ${folderId || 'Global'}`)
        return drive.listAllFiles(folderId)
    },
    ['drive-files-list'], // Base Key
    { revalidate: 300, tags: ['drive-files'] } // 5 Minutes
)

import { globalLimiter } from "@/lib/rate-limit"

import { verifyIdToken } from "@/lib/firebase-admin"

// ... 

export async function GET(request: Request) {
    const authHeader = request.headers.get("Authorization")
    const token = authHeader?.split("Bearer ")[1]

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decodedToken = await verifyIdToken(token)
    if (!decodedToken) {
        return NextResponse.json({ error: "Invalid Token" }, { status: 403 })
    }

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
                // 'Cache-Control': 'private, max-age=60' 
            }
        })

    } catch (error) {
        console.error("Drive API Error:", error)
        return NextResponse.json({ error: "Internal Server Error", details: String(error) }, { status: 500 })
    }
}
