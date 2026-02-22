import { create } from 'zustand'
import { DriveFile } from "@/types/models"
import Fuse from 'fuse.js'

const FUSE_OPTIONS = {
    keys: ['name', 'metadata.key', 'metadata.artist', 'metadata.topics'],
    threshold: 0.3,
    distance: 100,
}

interface LibraryState {
    allFiles: DriveFile[]
    displayedFiles: DriveFile[]
    loading: boolean // Indicates if filtering is happening
    initialized: boolean
    currentFolderId: string | null
    searchQuery: string

    // Cached search index
    _fuseIndex: Fuse<DriveFile> | null

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

function applyFiles(files: DriveFile[]) {
    const fuseIndex = new Fuse(files, FUSE_OPTIONS)
    return {
        allFiles: files,
        displayedFiles: sortFoldersFirst(files),
        initialized: true,
        loading: false,
        _fuseIndex: fuseIndex,
    }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    allFiles: [],
    displayedFiles: [],
    loading: false,
    initialized: false,
    currentFolderId: null,
    searchQuery: "",
    _fuseIndex: null,

    reset: () => set((state) => ({
        displayedFiles: state.allFiles, // Reset view back to root
        currentFolderId: null,
        searchQuery: "",
        loading: false,
    })),

    // Called by React Query hook to sync data to local ephemeral state
    hydrate: (files: DriveFile[]) => set(applyFiles(files)),

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
