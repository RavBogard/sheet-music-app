import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export async function GET(request: Request) {
    try {
        const auth = await withAuth(request, 'admin')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()

        // Users counts
        const usersSnap = await db.collection("users").get()
        const totalUsers = usersSnap.size

        let pendingUsers = 0
        let activeLast30Days = 0
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        usersSnap.docs.forEach(doc => {
            const data = doc.data()
            if (data.role === 'pending') pendingUsers++

            if (data.lastLoginAt) {
                const lastLogin = data.lastLoginAt.toDate ? data.lastLoginAt.toDate() : new Date(data.lastLoginAt)
                if (lastLogin > thirtyDaysAgo) activeLast30Days++
            }
        })

        // Library stats
        const filesSnap = await db.collection("library_index").get()
        const totalFiles = filesSnap.size

        // Setlists
        const setlistsSnap = await db.collection("setlists").get()
        const totalSetlists = setlistsSnap.size

        // Song Usage
        const songCounts: Record<string, { count: number, name: string }> = {}
        setlistsSnap.docs.forEach(doc => {
            const data = doc.data()
            if (data.tracks && Array.isArray(data.tracks)) {
                data.tracks.forEach((track: any) => {
                    // count songs only
                    if ((!track.type || track.type === 'song') && track.title) {
                        const key = track.fileId || track.title.toLowerCase()
                        if (!songCounts[key]) {
                            songCounts[key] = { count: 0, name: track.title }
                        }
                        songCounts[key].count++
                    }
                })
            }
        })

        const topSongs = Object.values(songCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)

        return NextResponse.json({
            users: { total: totalUsers, pending: pendingUsers, active30d: activeLast30Days },
            library: { files: totalFiles, setlists: totalSetlists },
            topSongs
        })

    } catch (error: unknown) {
        logger.error("Analytics Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
