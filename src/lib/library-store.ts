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
    /** Own rows (the host-scoped library list) plus the shared section rows. */
    allFiles: DriveFile[]
    /** The host-scoped library list as last hydrated. */
    ownFiles: DriveFile[]
    /**
     * Multi-tenant phase 5: rows another tenant owns that feed one of this
     * tenant's own sections (CRC's "Nava Tehilah" tab after the nava move).
     * Empty unless something is shared that way; then allFiles = own + these.
     */
    sharedSectionFiles: DriveFile[]
    displayedFiles: DriveFile[]
    loading: boolean // Indicates if filtering is happening
    initialized: boolean
    searchQuery: string

    // Cached search index
    _fuseIndex: Fuse<DriveFile> | null

    setFilter: (query: string) => void
    hydrate: (files: DriveFile[]) => void
    setSharedSectionFiles: (files: DriveFile[]) => void
}

function sameFiles(a: DriveFile[], b: DriveFile[]): boolean {
    if (a.length !== b.length) return false
    return a.every((f, i) => f.id === b[i].id && f.name === b[i].name && f.displayName === b[i].displayName && f.status === b[i].status)
}

/** Own rows win on an id clash; shared section rows the own list lacks are added. */
function mergeFiles(own: DriveFile[], shared: DriveFile[]): DriveFile[] {
    if (shared.length === 0) return own
    const ids = new Set(own.map(f => f.id))
    return [...own, ...shared.filter(f => !ids.has(f.id))]
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
    ownFiles: [],
    sharedSectionFiles: [],
    displayedFiles: [],
    loading: false,
    initialized: false,
    searchQuery: "",
    _fuseIndex: null,

    // Called by React Query hook to sync data to local ephemeral state
    hydrate: (files: DriveFile[]) =>
        set({ ownFiles: files, ...applyFiles(mergeFiles(files, get().sharedSectionFiles)) }),

    setSharedSectionFiles: (files: DriveFile[]) => {
        const { ownFiles, sharedSectionFiles, initialized, searchQuery } = get()
        if (sameFiles(files, sharedSectionFiles)) return
        const next = applyFiles(mergeFiles(ownFiles, files))
        set({
            sharedSectionFiles: files,
            ...next,
            // Do not flip the page out of its skeleton before the own list lands.
            initialized,
        })
        if (searchQuery) get().setFilter(searchQuery)
    },

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
