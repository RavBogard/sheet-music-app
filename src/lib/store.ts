import { create } from 'zustand'

export type FileType = 'pdf' | 'musicxml' | 'chordpro'

interface QueueItem {
    name: string
    fileId: string
    type: FileType
    transposition?: number
    targetKey?: string // For auto-transpose
}

interface MusicState {
    fileType: FileType | null
    fileUrl: string | null
    transposition: number // 0 = original key, +1 = semitone up
    zoom: number // 1 = 100%

    // Playback Queue (For Setlist Mode)
    playbackQueue: QueueItem[]
    queueIndex: number // -1 if not playing from queue

    // AI Transposer State (Hoisted from PDFViewer)
    aiTransposer: {
        isVisible: boolean
        status: 'idle' | 'scanning' | 'ready' | 'error'
        detectedKey: string
    }

    setFile: (url: string, type: FileType) => void
    setTransposition: (semitones: number) => void
    setZoom: (zoom: number) => void

    // Queue Actions
    setQueue: (items: QueueItem[], startIndex?: number) => void
    nextSong: () => QueueItem | null
    prevSong: () => QueueItem | null

    // Transposer Actions
    setTransposerState: (state: Partial<MusicState['aiTransposer']>) => void
    resetTransposer: () => void

    reset: () => void
}

export const useMusicStore = create<MusicState>((set, get) => ({
    fileType: null,
    fileUrl: null,
    transposition: 0,
    zoom: 1,

    playbackQueue: [],
    queueIndex: -1,

    aiTransposer: {
        isVisible: false,
        status: 'idle',
        detectedKey: ''
    },

    setFile: (url, type) => set({ fileUrl: url, fileType: type }),
    setTransposition: (t) => set({ transposition: t }),
    setZoom: (z) => set({ zoom: z }),

    setTransposerState: (newState) => set((state) => ({
        aiTransposer: { ...state.aiTransposer, ...newState }
    })),

    resetTransposer: () => set({
        aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
    }),

    setQueue: (items, startIndex = 0) => {
        set({ playbackQueue: items, queueIndex: startIndex })
        // Auto-load the first song
        const first = items[startIndex]
        if (first) {
            set({
                fileUrl: `/api/drive/file/${first.fileId}`,
                fileType: first.type,
                transposition: first.transposition || 0
            })
        }
    },

    nextSong: () => {
        const { playbackQueue, queueIndex } = get()
        if (queueIndex < playbackQueue.length - 1) {
            const nextIndex = queueIndex + 1
            const nextItem = playbackQueue[nextIndex]
            set({
                queueIndex: nextIndex,
                fileUrl: `/api/drive/file/${nextItem.fileId}`,
                fileType: nextItem.type,
                transposition: nextItem.transposition || 0,
                // Reset transposer on song change (component will re-enable if targetKey exists)
                aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
            })
            return nextItem
        }
        return null
    },

    prevSong: () => {
        const { playbackQueue, queueIndex } = get()
        if (queueIndex > 0) {
            const prevIndex = queueIndex - 1
            const prevItem = playbackQueue[prevIndex]
            set({
                queueIndex: prevIndex,
                fileUrl: `/api/drive/file/${prevItem.fileId}`,
                fileType: prevItem.type,
                transposition: prevItem.transposition || 0,
                aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
            })
            return prevItem
        }
        return null
    },

    reset: () => set({ transposition: 0, zoom: 1, playbackQueue: [], queueIndex: -1 }),
}))
