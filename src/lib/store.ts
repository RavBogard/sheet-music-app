import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FileType = 'pdf' | 'musicxml' | 'chordpro'

export interface QueueItem {
    name: string
    fileId: string
    type: FileType
    audioFileId?: string
    transposition?: number
    targetKey?: string // For auto-transpose
}

export interface MusicState {
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

    // Audio State
    audio: {
        fileId: string | null
        url: string | null
        isPlaying: boolean
        volume: number
        isLooping: boolean
    }

    // Capo State
    capo: {
        active: boolean
        targetShape: string // e.g. "G"
        fret: number // e.g. 3
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

    // Audio Actions
    setAudioState: (state: Partial<MusicState['audio']>) => void

    // Capo Actions
    setCapoState: (state: Partial<MusicState['capo']>) => void

    reset: () => void
}

export const useMusicStore = create<MusicState>()(
    persist(
        (set, get) => ({
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

            capo: {
                active: false,
                targetShape: '',
                fret: 0
            },

            audio: {
                fileId: null,
                url: null,
                isPlaying: false,
                volume: 1,
                isLooping: false
            },

            setFile: (url: string, type: FileType) => set({
                fileUrl: url,
                fileType: type,
                transposition: 0,
                capo: { active: false, targetShape: '', fret: 0 },
                aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
            }),
            setTransposition: (t: number) => set({ transposition: t }),
            setZoom: (z: number) => set({ zoom: z }),

            setTransposerState: (newState: Partial<MusicState['aiTransposer']>) => set((state) => ({
                aiTransposer: { ...state.aiTransposer, ...newState }
            })),

            resetTransposer: () => set({
                aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
            }),

            setAudioState: (newState: Partial<MusicState['audio']>) => set((state) => ({
                audio: { ...state.audio, ...newState }
            })),

            setCapoState: (newState: Partial<MusicState['capo']>) => set((state) => ({
                capo: { ...state.capo, ...newState }
            })),

            setQueue: (items: QueueItem[], startIndex = 0) => {
                set({ playbackQueue: items, queueIndex: startIndex, capo: { active: false, targetShape: '', fret: 0 } })
                const item = items[startIndex]
                if (item) {
                    set({
                        fileUrl: `/api/drive/file/${item.fileId}`,
                        fileType: item.type,
                        transposition: item.transposition || 0,
                        audio: {
                            ...get().audio,
                            fileId: item.audioFileId || null,
                            url: item.audioFileId ? `/api/drive/file/${item.audioFileId}` : null,
                            isPlaying: false
                        },
                        aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
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
                        capo: { active: false, targetShape: '', fret: 0 },
                        audio: {
                            ...get().audio,
                            fileId: nextItem.audioFileId || null,
                            url: nextItem.audioFileId ? `/api/drive/file/${nextItem.audioFileId}` : null,
                            isPlaying: false
                        },
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
                        capo: { active: false, targetShape: '', fret: 0 },
                        audio: {
                            ...get().audio,
                            fileId: prevItem.audioFileId || null,
                            url: prevItem.audioFileId ? `/api/drive/file/${prevItem.audioFileId}` : null,
                            isPlaying: false
                        },
                        aiTransposer: { isVisible: false, status: 'idle', detectedKey: '' }
                    })
                    return prevItem
                }
                return null
            },

            reset: () => set({ transposition: 0, zoom: 1, playbackQueue: [], queueIndex: -1, capo: { active: false, targetShape: '', fret: 0 } }),
        }),
        {
            name: 'music-storage',
            partialize: (state) => ({
                playbackQueue: state.playbackQueue,
                queueIndex: state.queueIndex,
                transposition: state.transposition,
                zoom: state.zoom,
                fileUrl: state.fileUrl,
                fileType: state.fileType,
                audio: state.audio,
                capo: state.capo
            }),
        }
    )
)
