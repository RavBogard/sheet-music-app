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

// ─── Lean cached fetch (doc-import resolve hot path) ─────────────────
// Module-scoped TTL cache: 60s is long enough that resolve retries within a
// doc-import session skip the full scan, short enough that a freshly-uploaded
// chart surfaces quickly.
const LEAN_CACHE_TTL_MS = 60_000
let leanCache: { files: LibraryFile[]; expiresAt: number } | null = null

/** Test helper — clears the lean-library cache so tests stay deterministic. */
export function __resetServerLibraryCache(): void {
    leanCache = null
}

/**
 * Lean, cached library fetch for the doc-import resolve hot path.
 *
 * Projects only the fields resolve needs (`name`, `mimeType`) via `.select()`,
 * and serves repeat calls within a 60s TTL from a module-scoped cache so a
 * resolve retry doesn't re-scan the whole `library_index` collection. Returns
 * `LibraryFile[]` directly — resolve only reads `id`/`name`/`mimeType`;
 * `parents` is filled with `[]` (it has a schema default). Never throws — an
 * internal failure returns `[]` (an empty library is usable, not a failure).
 */
export async function getServerLibraryLean(): Promise<LibraryFile[]> {
    if (leanCache && Date.now() < leanCache.expiresAt) {
        return leanCache.files
    }
    try {
        initAdmin()
        const db = getFirestore()

        const limit = 500
        let lastVisible = null
        const files: LibraryFile[] = []

        while (true) {
            let query = db.collection('library_index')
                .orderBy('name')
                .select('name', 'mimeType')
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
                // Minimal inline guard — the full LibraryFileSchema parse is
                // unnecessary for two projected fields.
                if (
                    typeof data.name === 'string' &&
                    typeof data.mimeType === 'string'
                ) {
                    files.push({
                        id: doc.id,
                        name: data.name,
                        mimeType: data.mimeType,
                        parents: [],
                    })
                } else {
                    logger.warn(
                        `Skipping malformed library document (lean): ${doc.id}`,
                    )
                }
            })

            lastVisible = snapshot.docs[snapshot.docs.length - 1]
            if (snapshot.docs.length < limit) {
                break
            }
        }

        leanCache = { files, expiresAt: Date.now() + LEAN_CACHE_TTL_MS }
        return files
    } catch (error) {
        logger.error("Lean server library fetch failed:", error)
        return []
    }
}

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
