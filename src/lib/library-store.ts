import { create } from 'zustand'
import { auth } from "@/lib/firebase"
import { DriveFile } from "@/types/models"
import Fuse from 'fuse.js'
import { logger } from "@/lib/logger"

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

    // Cached search index — rebuilt only when allFiles changes
    _fuseIndex: Fuse<DriveFile> | null

    loadLibrary: (force?: boolean) => Promise<void>
    setFilter: (folderId: string | null, query: string) => void
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

export const useLibraryStore = create<LibraryState>((set, get) => ({
    allFiles: [],
    displayedFiles: [],
    loading: false,
    error: null,
    initialized: false,
    currentFolderId: null,
    searchQuery: "",
    _fuseIndex: null,

    reset: () => set({
        allFiles: [],
        displayedFiles: [],
        currentFolderId: null,
        searchQuery: "",
        initialized: false,
        _fuseIndex: null,
    }),

    loadLibrary: async (force = false) => {
        if (get().initialized && !force && get().allFiles.length > 0) return

        set({ loading: true, error: null })
        try {
            const user = auth.currentUser
            const headers: HeadersInit = {}
            if (user) {
                const token = await user.getIdToken()
                headers['Authorization'] = `Bearer ${token}`
            }

            const res = await fetch('/api/library/list?all=true', { headers })
            if (!res.ok) throw new Error("Failed to load library")

            const data = await res.json()
            const files: DriveFile[] = data.files

            // Build Fuse index once on load — reused for all subsequent searches
            const fuseIndex = new Fuse(files, FUSE_OPTIONS)

            set({
                allFiles: files,
                displayedFiles: sortFoldersFirst(files),
                initialized: true,
                _fuseIndex: fuseIndex,
            })

        } catch (err: unknown) {
            logger.error(err)
            set({ error: err instanceof Error ? err.message : "Failed to fetch files" })
        } finally {
            set({ loading: false })
        }
    },

    setFilter: (folderId, query) => {
        const { allFiles, _fuseIndex } = get()
        let result: DriveFile[]

        if (query.trim().length > 0) {
            // Use cached Fuse index — instant search without rebuild
            if (_fuseIndex) {
                result = _fuseIndex.search(query).map(r => r.item)
            } else {
                // Fallback: build index on the fly (shouldn't happen)
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
