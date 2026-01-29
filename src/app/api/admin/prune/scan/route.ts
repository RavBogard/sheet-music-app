import { NextResponse } from "next/server"
import { initAdmin, getFirestore, getAuth } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
    try {
        // 1. Verify Admin
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        const decodedToken = await getAuth().verifyIdToken(token)

        // Optional: strict check
        // if (decodedToken.role !== 'admin') ...

        console.log("[Prune] Starting Consistency Scan...")

        // 2. Fetch Source of Truth (Google Drive)
        const drive = new DriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const driveFiles = await drive.listAllFiles(rootFolderId)

        const driveIdSet = new Set(driveFiles.map(f => f.id))
        console.log(`[Prune] Found ${driveIdSet.size} active files in Drive`)

        // 3. Fetch Local State (Firestore)
        initAdmin()
        const db = getFirestore()
        const snapshot = await db.collection('library_index').get()

        console.log(`[Prune] Found ${snapshot.size} indexed files in Database`)

        // 4. Find Ghosts
        const ghosts: any[] = []
        snapshot.forEach(doc => {
            // If the Doc ID is NOT in the Drive Set, it's a ghost
            if (!driveIdSet.has(doc.id)) {
                const data = doc.data()
                ghosts.push({
                    id: doc.id,
                    name: data.name,
                    mimeType: data.mimeType,
                    lastSyncedAt: data.lastSyncedAt
                })
            }
        })

        console.log(`[Prune] Found ${ghosts.length} ghosts`)

        return NextResponse.json({
            success: true,
            driveCount: driveIdSet.size,
            dbCount: snapshot.size,
            ghostCount: ghosts.length,
            ghosts
        })

    } catch (error: any) {
        console.error("Prune Scan Failed:", error)
        return new NextResponse(error.message || "Internal Server Error", { status: 500 })
    }
}
