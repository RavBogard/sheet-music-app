import { create } from 'zustand'
import { DriveFile } from "@/types/models"
import Fuse from 'fuse.js'

// `metadata.artist` was listed here but is not a field on DriveFile
// (`src/types/models.ts` metadata = key | bpm | timeSignature | topics |
// enrichedAt | omrCorrections) and nothing writes it — every `artist` in the
// codebase belongs to the scraper/enrichment request-response shapes, never to
// a library row. Fuse silently scores a missing key as no-match, so the entry
// was dead config; removed 2026-08-31.
const FUSE_OPTIONS = {
    keys: ['name', 'metadata.key', 'metadata.topics'],
    threshold: 0.3,
    distance: 100,
}

interface LibraryState {
    allFiles: DriveFile[]
    displayedFiles: DriveFile[]
    loading: boolean // Indicates if filtering is happening
    initialized: boolean
    searchQuery: string

    // Cached search index
    _fuseIndex: Fuse<DriveFile> | null

    setFilter: (query: string) => void
    hydrate: (files: DriveFile[]) => void
}

function applyFiles(files: DriveFile[]) {
    // Filter out folders -- flat list only
    const nonFolders = files.filter(f => !f.mimeType.includes('folder'))
    // Sort alphabetically by name
    nonFolders.sort((a, b) => a.name.localeCompare(b.name))
    const fuseIndex = new Fuse(nonFolders, FUSE_OPTIONS)
    return {
        allFiles: nonFolders,
        displayedFiles: nonFolders,
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
    searchQuery: "",
    _fuseIndex: null,

    // Called by React Query hook to sync data to local ephemeral state
    hydrate: (files: DriveFile[]) => set(applyFiles(files)),

    setFilter: (query) => {
        const { allFiles, _fuseIndex } = get()
        let result: DriveFile[]

        if (query.trim().length > 0) {
            if (_fuseIndex) {
                result = _fuseIndex.search(query).map(r => r.item)
            } else {
                const fuse = new Fuse(allFiles, FUSE_OPTIONS)
                result = fuse.search(query).map(r => r.item)
            }
        } else {
            result = allFiles
        }

        set({
            displayedFiles: result,
            searchQuery: query,
        })
    }
}))
