import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { z } from "zod"

const LibraryFileSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string(),
    parents: z.array(z.string()).default([]),
    modifiedTime: z.string().nullable().optional(),
    webViewLink: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.any()).nullable().optional()
})

export type LibraryFile = z.infer<typeof LibraryFileSchema>

/**
 * Fetch the entire library index server-side.
 */
export async function getServerLibrary() {
    try {
        initAdmin()
        const db = getFirestore()

        const limit = 500
        let lastVisible = null
        let maxModified = ''
        const files: LibraryFile[] = []

        while (true) {
            let query = db.collection('library_index')
                .orderBy('name')
                .limit(limit)

            if (lastVisible) {
                query = query.startAfter(lastVisible)
            }

            const snapshot = await query.get()
            if (snapshot.empty) {
                break
            }

            snapshot.docs.forEach(doc => {
                const data = doc.data()
                if (data.lastSyncedAt && data.lastSyncedAt > maxModified) {
                    maxModified = data.lastSyncedAt
                }

                const parsed = LibraryFileSchema.safeParse({
                    id: doc.id,
                    name: data.name,
                    mimeType: data.mimeType,
                    parents: data.parents || [],
                    modifiedTime: data.modifiedTime || null,
                    webViewLink: data.webViewLink || null,
                    metadata: data.metadata || null
                })

                if (parsed.success) {
                    files.push(parsed.data)
                } else {
                    logger.warn(`Skipping malformed library document: ${doc.id}`, parsed.error.issues)
                }
            })

            lastVisible = snapshot.docs[snapshot.docs.length - 1]
            if (snapshot.docs.length < limit) {
                break
            }
        }

        return {
            files,
            lastModified: maxModified || new Date().toISOString()
        }
    } catch (error) {
        logger.error("Server library fetch failed:", error)
        return { files: [], lastModified: new Date().toISOString() }
    }
}
