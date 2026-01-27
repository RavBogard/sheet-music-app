import { create } from 'zustand'
import { auth } from "@/lib/firebase"

export interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
    webContentLink?: string
}

interface LibraryState {
    driveFiles: DriveFile[]
    loading: boolean
    error: string | null
    initialized: boolean

    // Actions
    fetchFiles: (force?: boolean) => Promise<void>
    setFiles: (files: DriveFile[]) => void

    // Selectors / Helpers
    getFolders: () => DriveFile[]
    getFilesByParent: (parentId?: string) => DriveFile[]
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    driveFiles: [],
    loading: false,
    error: null,
    initialized: false,

    setFiles: (files) => set({ driveFiles: files }),

    getFolders: () => get().driveFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder'),

    getFilesByParent: (parentId) => {
        const all = get().driveFiles
        if (!parentId) {
            // Root files (no parents or parent is not in our list... 
            // but Drive "root" is better handled by checking if parents contains the root ID if known,
            // or just files where parent is not found in our file list)
            return all.filter(f => !f.parents || f.parents.length === 0)
        }
        return all.filter(f => f.parents?.includes(parentId))
    },

    fetchFiles: async (force = false) => {
        if (!force && get().initialized && get().driveFiles.length > 0) return

        set({ loading: true, error: null })
        try {
            const user = auth.currentUser
            const headers: HeadersInit = {}
            if (user) {
                const token = await user.getIdToken()
                headers['Authorization'] = `Bearer ${token}`
            }

            const res = await fetch(`/api/drive/list`, { headers })
            if (!res.ok) throw new Error("Failed to sync library")

            const data = await res.json()
            set({ driveFiles: data, initialized: true })
        } catch (err: any) {
            console.error(err)
            set({ error: err.message || "Failed to fetch files" })
        } finally {
            set({ loading: false })
        }
    }
}))
