import { create } from 'zustand'
import { auth } from "@/lib/firebase"
import { DriveFile } from "@/types/models"

interface LibraryState {
    driveFiles: DriveFile[]
    loading: boolean
    error: string | null
    initialized: boolean

    nextPageToken: string | null
    currentFolderId: string | null
    searchQuery: string

    // Actions
    fetchFiles: (options?: { force?: boolean, loadMore?: boolean, folderId?: string | null, query?: string }) => Promise<void>
    setFiles: (files: DriveFile[]) => void
    reset: () => void

    // Selectors
    // We remove getFolders/getFilesByParent because we now fetch *precisely* what is viewable
    // But we might want to keep some helpers if the UI expects separated lists
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    driveFiles: [],
    loading: false,
    error: null,
    initialized: false,
    nextPageToken: null,
    currentFolderId: null,
    searchQuery: "",

    setFiles: (files) => set({ driveFiles: files }),

    reset: () => set({ driveFiles: [], nextPageToken: null, currentFolderId: null, searchQuery: "", initialized: false }),

    fetchFiles: async (options = {}) => {
        const { force = false, loadMore = false, folderId = null, query = "" } = options

        // State updates based on intent
        if (!loadMore) {
            // New Search or Navigation: Reset list
            set({
                driveFiles: [],
                nextPageToken: null,
                currentFolderId: folderId || null,
                searchQuery: query,
                loading: true,
                error: null
            })
        } else {
            // Load More: Don't verify initialized, just check if we have more to load
            if (!get().nextPageToken) return // No more pages
            set({ loading: true })
        }

        try {
            const user = auth.currentUser
            const headers: HeadersInit = {}
            if (user) {
                const token = await user.getIdToken()
                headers['Authorization'] = `Bearer ${token}`
            }

            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            if (query) params.set('q', query)
            // if (loadMore && get().nextPageToken) params.set('pageToken', get().nextPageToken!) // Pagination paused for Phase 2
            params.set('limit', '100')

            // SWITCHED: Now calling local Firestore Index instead of Drive API
            const res = await fetch(`/api/library/list?${params.toString()}`, { headers })
            if (!res.ok) throw new Error("Failed to load library")

            const data = await res.json() // { files: [], nextPageToken: null }

            set(state => ({
                driveFiles: loadMore ? [...state.driveFiles, ...data.files] : data.files,
                nextPageToken: null, // data.nextPageToken,
                initialized: true
            }))

        } catch (err: any) {
            console.error(err)
            set({ error: err.message || "Failed to fetch files" })
        } finally {
            set({ loading: false })
        }
    }
}))
