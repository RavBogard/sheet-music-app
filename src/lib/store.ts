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
    bpm?: number
    key?: string
}

export interface MusicState {
    fileType: FileType | null
    fileUrl: string | null
    transposition: number // 0 = original key, +1 = semitone up
    zoom: number // 1 = 100%

    // AI Transposer State (New Approach)
    aiState: {
        isEnabled: boolean
        scanningPages: number[] // List of page indexes currently scanning
        pageData: Record<number, {
            strips: any[] // Store debug info if needed
            chords: { text: string, x: number, y: number, originalText: string }[]
        }>
        error: string | null
    }

    // Playback Queue (For Setlist Mode)
    playbackQueue: QueueItem[]
    queueIndex: number // -1 if not playing from queue



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

    // AI Actions
    setAiEnabled: (enabled: boolean) => void
    setPageScanning: (pageIndex: number, isScanning: boolean) => void
    setPageData: (pageIndex: number, data: any) => void
    setAiError: (error: string | null) => void

    // Queue Actions
    setQueue: (items: QueueItem[], startIndex?: number) => void
    nextSong: () => QueueItem | null
    prevSong: () => QueueItem | null



    // Audio Actions
    setAudioState: (state: Partial<MusicState['audio']>) => void

    // Capo Actions
    setCapoState: (state: Partial<MusicState['capo']>) => void

    // AI OMR Content
    aiXmlContent: string | null
    setAiXmlContent: (xml: string | null) => void

    reset: () => void
}

export const useMusicStore = create<MusicState>()(
    persist(
        (set, get) => ({
            fileType: null,
            fileUrl: null,
            transposition: 0,
            zoom: 1,
            aiXmlContent: null, // Init

            playbackQueue: [],
            queueIndex: -1,

            aiState: {
                isEnabled: false,
                scanningPages: [],
                pageData: {},
                error: null
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

            setFile: (url, type) => set({
                fileUrl: url,
                fileType: type,
                transposition: 0,
                capo: { active: false, targetShape: '', fret: 0 },
                aiState: { isEnabled: false, scanningPages: [], pageData: {}, error: null },
                aiXmlContent: null // Clear AI content
            }),
            setTransposition: (t: number) => set({ transposition: t }),
            setZoom: (z: number) => set({ zoom: z }),

            setQueue: (items, startIndex = 0) => set({ playbackQueue: items, queueIndex: startIndex }),
            nextSong: () => {
                const { playbackQueue, queueIndex } = get()
                if (queueIndex < playbackQueue.length - 1) {
                    const nextIndex = queueIndex + 1
                    set({ queueIndex: nextIndex })
                    return playbackQueue[nextIndex]
                }
                return null
            },
            prevSong: () => {
                const { playbackQueue, queueIndex } = get()
                if (queueIndex > 0) {
                    const prevIndex = queueIndex - 1
                    set({ queueIndex: prevIndex })
                    return playbackQueue[prevIndex]
                }
                return null
            },

            setAiXmlContent: (xml: string | null) => set({ aiXmlContent: xml }),

            setAiEnabled: (enabled) => set(prev => ({
                aiState: { ...prev.aiState, isEnabled: enabled }
            })),
            setPageScanning: (pageIndex, isScanning) => set(prev => {
                const current = prev.aiState.scanningPages.filter(p => p !== pageIndex);
                if (isScanning) current.push(pageIndex);
                return {
                    aiState: { ...prev.aiState, scanningPages: current }
                };
            }),
            setPageData: (pageIndex, data) => set(prev => ({
                aiState: {
                    ...prev.aiState,
                    pageData: { ...prev.aiState.pageData, [pageIndex]: data }
                }
            })),
            setAiError: (error) => set(prev => ({
                aiState: { ...prev.aiState, error }
            })),

            setAudioState: (newState: Partial<MusicState['audio']>) => set((state) => ({
                audio: { ...state.audio, ...newState }
            })),

            setCapoState: (newState: Partial<MusicState['capo']>) => set((state) => ({
                capo: { ...state.capo, ...newState }
            })),

            reset: () => set({
                fileType: null,
                fileUrl: null,
                transposition: 0,
                zoom: 1,
                aiXmlContent: null,
                playbackQueue: [],
                queueIndex: -1,
                audio: { fileId: null, url: null, isPlaying: false, volume: 1, isLooping: false }
            })
        }),
        {
            name: 'music-storage',
            partialize: (state) => ({
                zoom: state.zoom,
                audio: { ...state.audio, isPlaying: false }, // Don't persist playing state
            })
        }
    )
)
