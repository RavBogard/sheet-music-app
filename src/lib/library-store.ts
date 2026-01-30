import { create } from 'zustand'
import { auth } from "@/lib/firebase"
import { DriveFile } from "@/types/models"
import Fuse from 'fuse.js'

interface LibraryState {
    allFiles: DriveFile[] // The Master List (Client Cache)
    displayedFiles: DriveFile[] // What is actually shown (Filtered)

    loading: boolean
    error: string | null
    initialized: boolean

    currentFolderId: string | null
    searchQuery: string

    // Actions
    // "loadLibrary" fetches the ENTIRE index once.
    loadLibrary: (force?: boolean) => Promise<void>

    // "navigate" or "search" just filters the local list
    setFilter: (folderId: string | null, query: string) => void

    reset: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    allFiles: [],
    displayedFiles: [],
    loading: false,
    error: null,
    initialized: false,
    currentFolderId: null,
    searchQuery: "",

    reset: () => set({
        allFiles: [],
        displayedFiles: [],
        currentFolderId: null,
        searchQuery: "",
        initialized: false
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

            // Fetch ALL (limit=2000 or high number)
            // We rely on the API filter logic being loose enough or we pass a special param
            // Actually, let's just fetch root or "all". The current API supports no params -> all.
            const res = await fetch(`/api/library/list?limit=5000`, { headers })
            if (!res.ok) throw new Error("Failed to load library")

            const data = await res.json()

            // Initial filter (Root)
            set({
                allFiles: data.files,
                displayedFiles: data.files.filter((f: DriveFile) =>
                    // Show root folders + files with no parent (orphans) or specific root parent logic
                    // For now, let's just show everything or let the setFilter handle it.
                    // Actually, we should probably run setFilter logic immediately via state update.
                    true
                ),
                initialized: true
            })

            // Apply initial filter (null folder, empty query)
            get().setFilter(null, "")

        } catch (err: any) {
            console.error(err)
            set({ error: err.message || "Failed to fetch files" })
        } finally {
            set({ loading: false })
        }
    },

    setFilter: (folderId, query) => {
        const { allFiles } = get()
        let result = allFiles

        // 1. Search (Priority)
        if (query.trim().length > 0) {
            const fuse = new Fuse(allFiles, {
                keys: ['name', 'metadata.key', 'metadata.artist'],
                threshold: 0.3, // Fuzzy match sensitivity
                distance: 100
            })
            result = fuse.search(query).map(r => r.item)
        }
        // 2. Folder Navigation (Only if NO search)
        else {
            if (folderId) {
                result = allFiles.filter(f => f.parents?.includes(folderId))
            } else {
                // Root View: Show items with NO parents or explicitly in specific root folders?
                // Drive "parents" array is tricky. Often we don't know the root ID.
                // Strategy: Show folders + files that have NO known parents in our index?
                // Or just show everything if we can't determine root?
                // Better Strategy for this app: Show Folders + Non-Folder Files sorted.
                // But for "Browsing", we specifically want hierarchical.
                // If we don't have a known "Root ID", filtering by "No Parents" is shaky.
                // Let's rely on the API's initial sort or just show top-level folders?

                // Hack: If we have > 0 folders, show only items that are folders OR items that are not in any of our known folders?
                // Too complex. Let's simplfy:
                // If folderId is NULL, we are in "All Songs" mode or "Root" mode.
                // User probably uses Search 90% of time.
                // Let's show All Folders + All Files sorted A-Z for now.
                result = allFiles
            }
        }

        // Sort: Folders first, then Name
        result.sort((a, b) => {
            const aIsFolder = a.mimeType.includes('folder')
            const bIsFolder = b.mimeType.includes('folder')
            if (aIsFolder && !bIsFolder) return -1
            if (!aIsFolder && bIsFolder) return 1
            return a.name.localeCompare(b.name)
        })

        set({
            displayedFiles: result,
            currentFolderId: folderId,
            searchQuery: query
        })
    }
}))
