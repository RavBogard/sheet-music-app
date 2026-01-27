import { create } from 'zustand'

export interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
}

interface LibraryState {
    driveFiles: DriveFile[]
    loading: boolean
    error: string | null
    initialized: boolean

    // Actions
    fetchFiles: (force?: boolean) => Promise<void>
    setFiles: (files: DriveFile[]) => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    driveFiles: [],
    loading: false,
    error: null,
    initialized: false,

    setFiles: (files) => set({ driveFiles: files }),

    fetchFiles: async (force = false) => {
        // Prevent double fetching if already successful
        if (!force && get().initialized && get().driveFiles.length > 0) return

        set({ loading: true, error: null })
        try {
            const res = await fetch(`/api/drive/list`)
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
