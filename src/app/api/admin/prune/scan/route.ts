import { NextResponse } from "next/server"
import { initAdmin, getFirestore, getAuth } from "@/lib/firebase-admin"
import { DriveClient } from "@/lib/google-drive"
import { logger } from "@/lib/logger"

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
    try {
        // Initialize Admin SDK first
        initAdmin()

        // 1. Verify Admin
        const authHeader = req.headers.get("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
            return new NextResponse("Unauthorized", { status: 401 })
        }
        const token = authHeader.split("Bearer ")[1]
        const decodedToken = await getAuth().verifyIdToken(token)

        // Optional: strict check
        // if (decodedToken.role !== 'admin') ...

        logger.info("[Prune] Starting Consistency Scan...")

        // 2. Fetch Source of Truth (Google Drive)
        const drive = new DriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        const driveFiles = await drive.listAllFiles(rootFolderId)

        const driveIdSet = new Set(driveFiles.map(f => f.id))
        logger.info(`[Prune] Found ${driveIdSet.size} active files in Drive`)

        // 3. Fetch Local State (Firestore)
        // initAdmin() called at top
        const db = getFirestore()
        const snapshot = await db.collection('library_index').get()

        logger.info(`[Prune] Found ${snapshot.size} indexed files in Database`)

        // 4. Find Ghosts
        const ghosts: { id: string; name: string; mimeType: string; lastSyncedAt: string }[] = []
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

        logger.info(`[Prune] Found ${ghosts.length} ghosts`)

        return NextResponse.json({
            success: true,
            driveCount: driveIdSet.size,
            dbCount: snapshot.size,
            ghostCount: ghosts.length,
            ghosts
        })

    } catch (error: unknown) {
        logger.error("Prune Scan Failed:", error)
        return new NextResponse((error instanceof Error ? error.message : "Unknown error") || "Internal Server Error", { status: 500 })
    }
}
