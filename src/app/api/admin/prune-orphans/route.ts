import { NextResponse } from "next/server"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

/**
 * Sweeps all setlists, verifying each track's fileId and audioFileId against the current Library cache.
 * If a track references a file that is no longer in the DB cache, it unlinks it.
 * Note: Assumes `drive_files` is relatively synchronized.
 */
export async function POST(request: Request) {
    try {
        const auth = await withAuth(request, 'admin')
        if (auth instanceof NextResponse) return auth

        const db = getFirestore()

        // 1. Fetch all known file IDs from `drive_files` mapping or similar cache
        // Instead of querying Google Drive individually (which would hit API rate limits),
        // we use the local Firestore cache of library items.
        const filesSnap = await db.collection("drive_files").get()
        const validFileIds = new Set<string>()
        filesSnap.docs.forEach(d => validFileIds.add(d.id))

        // 2. Fetch all setlists
        const setlistsSnap = await db.collection("setlists").get()
        let setlistsModified = 0
        let tracksPruned = 0
        const batch = db.batch()

        for (const doc of setlistsSnap.docs) {
            const data = doc.data()
            if (!data.tracks || !Array.isArray(data.tracks)) continue

            let modified = false
            const newTracks = data.tracks.map((track: any) => {
                const updatedTrack = { ...track }

                // Check primary file attachment
                if (updatedTrack.fileId && !validFileIds.has(updatedTrack.fileId)) {
                    delete updatedTrack.fileId
                    delete updatedTrack.fileName
                    delete updatedTrack.type // Reset to undefined default if they want
                    modified = true
                    tracksPruned++
                }

                // Check audio file attachment
                if (updatedTrack.audioFileId && !validFileIds.has(updatedTrack.audioFileId)) {
                    delete updatedTrack.audioFileId
                    delete updatedTrack.audioFileName
                    modified = true
                    tracksPruned++
                }

                return updatedTrack
            })

            if (modified) {
                batch.update(doc.ref, { tracks: newTracks })
                setlistsModified++
            }
        }

        if (setlistsModified > 0) {
            await batch.commit()
            logger.info(`Pruned orphans: updated ${setlistsModified} setlists, scrubbed ${tracksPruned} missing file references.`)
        }

        return NextResponse.json({
            success: true,
            setlistsScanned: setlistsSnap.size,
            setlistsModified,
            tracksPruned,
            validFilesCount: validFileIds.size
        })

    } catch (error: unknown) {
        logger.error("Orphan Prune Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
