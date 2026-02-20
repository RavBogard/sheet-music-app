import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

/**
 * Fetch the entire library index server-side.
 */
export async function getServerLibrary() {
    try {
        initAdmin()
        const db = getFirestore()

        const snapshot = await db.collection('library_index')
            .orderBy('name')
            .limit(5000)
            .get()

        let maxModified = ''

        const files = snapshot.docs.map(doc => {
            const data = doc.data()
            if (data.lastSyncedAt && data.lastSyncedAt > maxModified) {
                maxModified = data.lastSyncedAt
            }
            return {
                id: doc.id,
                name: data.name,
                mimeType: data.mimeType,
                parents: data.parents || [],
                modifiedTime: data.modifiedTime || null,
                webViewLink: data.webViewLink || null,
                metadata: data.metadata || null
            }
        })

        return {
            files,
            lastModified: maxModified || new Date().toISOString()
        }
    } catch (error) {
        logger.error("Server library fetch failed:", error)
        return { files: [], lastModified: new Date().toISOString() }
    }
}
