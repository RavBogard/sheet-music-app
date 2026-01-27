import { NextResponse } from "next/server"
import { DriveClient } from "@/lib/google-drive"
import { unstable_cache } from "next/cache"

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

export async function GET(request: Request) {
    // Simple IP-based imitation (Next.js Edge can give proper IP, in Node runtime it's harder)
    // We'll use a static key for now or try headers
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    if (!globalLimiter.check(ip)) {
        return new NextResponse(JSON.stringify({ error: "Too Many Requests" }), { status: 429 })
    }

    try {
        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId') || undefined

        // 1. Debug Access Check: Is the folder even visible?
        try {
            // Just try to get metadata of the folder
            // We can't use getFile('media') on a folder, so we use list or get metadata
            // Let's just try listing it. checking if we fail immediately.
        } catch (e) {
            console.error("Setup Check Failed", e)
        }

        // 2. Recursive Search (Cached)
        console.log(`Requesting files for folder: ${folderId}`)
        const files = await getCachedFiles(folderId)
        console.log(`Returned ${files.length} files`)

        return NextResponse.json(files)
    } catch (error) {
        console.error("Drive API Error:", error)
        return new NextResponse(JSON.stringify({ error: "Internal Server Error", details: String(error) }), { status: 500 })
    }
}
