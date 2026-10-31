import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

/** Google Drive's mime type for a folder. A folder is never a chart. */
export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"

/** TEL-01: is this library row a Drive folder (indexed by legacy scans as if it were a chart)? */
export function isFolderMime(mimeType: unknown): boolean {
    return mimeType === DRIVE_FOLDER_MIME_TYPE
}

/**
 * TEL-01: does `library_index/{fileId}` describe a Drive folder? Never throws:
 * any read problem answers false so chart serving is unaffected.
 */
export async function isDriveFolderRow(fileId: string): Promise<boolean> {
    try {
        if (!fileId || fileId.startsWith("db-") || fileId.startsWith("upload-")) return false
        if (!initAdmin()) return false
        const snap = await getFirestore().collection("library_index").doc(fileId).get()
        return snap.exists && isFolderMime((snap.data() as { mimeType?: unknown }).mimeType)
    } catch (e) {
        logger.warn(`[folder-row] read for ${fileId} failed`, e)
        return false
    }
}
