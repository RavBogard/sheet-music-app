import { create } from 'zustand'
import { auth } from "@/lib/firebase"
import { DriveFile } from "@/types/models"
import Fuse from 'fuse.js'
import { logger } from "@/lib/logger"
import { getCachedLibrary, setCachedLibrary } from "@/lib/library-cache"

const FUSE_OPTIONS = {
    keys: ['name', 'metadata.key', 'metadata.artist', 'metadata.topics'],
    threshold: 0.3,
    distance: 100,
}

interface LibraryState {
    allFiles: DriveFile[]
    displayedFiles: DriveFile[]
    loading: boolean
    error: string | null
    initialized: boolean
    currentFolderId: string | null
    searchQuery: string
    /** True while background sync is checking for updates */
    syncing: boolean
    /** True if data came from IndexedDB cache (not yet verified fresh) */
    fromCache: boolean

    // Cached search index — rebuilt only when allFiles changes
    _fuseIndex: Fuse<DriveFile> | null

    loadLibrary: (force?: boolean) => Promise<void>
    setFilter: (folderId: string | null, query: string) => void
    hydrate: (files: DriveFile[]) => void
    reset: () => void
}

function sortFoldersFirst(files: DriveFile[]): DriveFile[] {
    return [...files].sort((a, b) => {
        const aIsFolder = a.mimeType.includes('folder')
        const bIsFolder = b.mimeType.includes('folder')
        if (aIsFolder && !bIsFolder) return -1
        if (!aIsFolder && bIsFolder) return 1
        return a.name.localeCompare(b.name)
    })
}

function applyFiles(files: DriveFile[], fromCache: boolean) {
    const fuseIndex = new Fuse(files, FUSE_OPTIONS)
    return {
        allFiles: files,
        displayedFiles: sortFoldersFirst(files),
        initialized: true,
        _fuseIndex: fuseIndex,
        fromCache,
    }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    allFiles: [],
    displayedFiles: [],
    loading: false,
    error: null,
    initialized: false,
    currentFolderId: null,
    searchQuery: "",
    syncing: false,
    fromCache: false,
    _fuseIndex: null,

    reset: () => set({
        allFiles: [],
        displayedFiles: [],
        currentFolderId: null,
        searchQuery: "",
        initialized: false,
        _fuseIndex: null,
        fromCache: false,
    }),

    hydrate: (files: DriveFile[]) => set(applyFiles(files, false)),

    loadLibrary: async (force = false) => {
        if (get().initialized && !force && get().allFiles.length > 0) return

        set({ loading: true, error: null })

        try {
            // ── Step 1: Try IndexedDB cache for instant load ──
            const cached = await getCachedLibrary()
            if (cached && cached.files.length > 0 && !force) {
                set({
                    ...applyFiles(cached.files, true),
                    loading: false,
                })
            }

            // ── Step 2: Fetch from API (background if cache hit, blocking if not) ──
            set({ syncing: true })

            const user = auth.currentUser
            const headers: HeadersInit = {}
            if (user) {
                const token = await user.getIdToken()
                headers['Authorization'] = `Bearer ${token}`
            }

            // Bypass browser cache if force is true. CDN is purged via revalidatePath on mutations.
            const endpoint = '/api/library/list?all=true'
            const options: RequestInit = { headers }
            if (force) {
                options.cache = 'no-store'
            }

            const res = await fetch(endpoint, options)
            if (!res.ok) throw new Error("Failed to load library")

            const data = await res.json()
            const files: DriveFile[] = data.files
            const lastModified: string = data.lastModified || new Date().toISOString()

            // ── Step 3: Compare with cache — skip update if identical ──
            const isSame = cached?.lastModified === lastModified && cached.files.length === files.length
            if (!isSame || force) {
                set(applyFiles(files, false))
                // Update IndexedDB in background
                setCachedLibrary(files, lastModified).catch(() => { })
            } else {
                // Cache is current — just mark as verified
                set({ fromCache: false })
            }

        } catch (err: unknown) {
            logger.error(err)
            // Only show error if we don't have cached data
            if (!get().initialized) {
                set({ error: err instanceof Error ? err.message : "Failed to fetch files" })
            }
        } finally {
            set({ loading: false, syncing: false })
        }
    },

    setFilter: (folderId, query) => {
        const { allFiles, _fuseIndex } = get()
        let result: DriveFile[]

        if (query.trim().length > 0) {
            if (_fuseIndex) {
                result = _fuseIndex.search(query).map(r => r.item)
            } else {
                const fuse = new Fuse(allFiles, FUSE_OPTIONS)
                result = fuse.search(query).map(r => r.item)
            }
        } else if (folderId) {
            result = allFiles.filter(f => f.parents?.includes(folderId))
        } else {
            result = allFiles
        }

        set({
            displayedFiles: sortFoldersFirst(result),
            currentFolderId: folderId,
            searchQuery: query,
        })
    }
}))
