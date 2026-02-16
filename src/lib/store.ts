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
    currentVisiblePage: number // 1-indexed, tracks which PDF page is most visible

    // AI Transposer State (New Approach)
    aiState: {
        isEnabled: boolean
        scanningPages: number[] // List of page indexes currently scanning
        pageData: Record<number, {
            strips: { id: string; y: number; height: number; image?: string }[]
            chords: { text: string; x: number; y: number; originalText: string; pxHeight?: number; h?: number; w?: number }[]
        }>
        error: string | null
    }

    // Playback Queue (For Setlist Mode)
    playbackQueue: QueueItem[]
    queueIndex: number // -1 if not playing from queue
    returnPath: string | null // Where to go when exiting performance mode
    currentSetlistId: string | null // Which setlist is currently being performed

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

    capoFret: number | null
    setCapoFret: (fret: number | null) => void

    setFile: (url: string, type: FileType, returnPath?: string) => void
    setTransposition: (semitones: number) => void
    setZoom: (zoom: number) => void
    setCurrentVisiblePage: (page: number) => void

    // AI Actions
    setAiEnabled: (enabled: boolean) => void
    setPageScanning: (pageIndex: number, isScanning: boolean) => void
    setPageData: (pageIndex: number, data: {
        strips: { id: string; y: number; height: number; image?: string }[]
        chords: { text: string; x: number; y: number; originalText: string; pxHeight?: number; h?: number; w?: number }[]
    }) => void
    setAiError: (error: string | null) => void

    // Queue Actions
    setQueue: (items: QueueItem[], startIndex?: number, returnPath?: string, setlistId?: string) => void
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
            currentVisiblePage: 1,
            aiXmlContent: null, // Init

            playbackQueue: [],
            queueIndex: -1,
            returnPath: null,
            currentSetlistId: null,

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
            capoFret: null,

            audio: {
                fileId: null,
                url: null,
                isPlaying: false,
                volume: 1,
                isLooping: false
            },

            setFile: (url, type, returnPath) => set({
                fileUrl: url,
                fileType: type,
                returnPath: returnPath ?? get().returnPath,
                transposition: 0,
                capo: { active: false, targetShape: '', fret: 0 },
                capoFret: null,
                aiState: { isEnabled: false, scanningPages: [], pageData: {}, error: null },
                aiXmlContent: null // Clear AI content
            }),
            setTransposition: (t: number) => set({ transposition: t }),
            setZoom: (z: number) => set({ zoom: z }),
            setCurrentVisiblePage: (page: number) => set({ currentVisiblePage: page }),

            setQueue: (items, startIndex = 0, returnPath, setlistId) => {
                // Apply per-track transposition from the first song
                const firstTrack = items[startIndex]
                const trackTransposition = firstTrack?.transposition ?? 0
                set({
                    playbackQueue: items,
                    queueIndex: startIndex,
                    returnPath: returnPath || null,
                    currentSetlistId: setlistId || null,
                    transposition: trackTransposition,
                    // Clear page data when starting a new queue
                    aiState: { ...get().aiState, pageData: {}, scanningPages: [], error: null }
                })
            },
            nextSong: () => {
                const { playbackQueue, queueIndex, aiState } = get()
                if (queueIndex < playbackQueue.length - 1) {
                    const nextIndex = queueIndex + 1
                    const nextTrack = playbackQueue[nextIndex]
                    // Apply per-track transposition, clear page data for new song
                    set({
                        queueIndex: nextIndex,
                        transposition: nextTrack.transposition ?? 0,
                        aiState: { ...aiState, pageData: {}, scanningPages: [], error: null }
                    })
                    return nextTrack
                }
                return null
            },
            prevSong: () => {
                const { playbackQueue, queueIndex, aiState } = get()
                if (queueIndex > 0) {
                    const prevIndex = queueIndex - 1
                    const prevTrack = playbackQueue[prevIndex]
                    // Apply per-track transposition, clear page data for new song
                    set({
                        queueIndex: prevIndex,
                        transposition: prevTrack.transposition ?? 0,
                        aiState: { ...aiState, pageData: {}, scanningPages: [], error: null }
                    })
                    return prevTrack
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

            setCapoFret: (fret) => set({ capoFret: fret }),

            reset: () => set({
                fileType: null,
                fileUrl: null,
                transposition: 0,
                zoom: 1,
                currentVisiblePage: 1,
                aiXmlContent: null,
                playbackQueue: [],
                queueIndex: -1,
                returnPath: null,
                currentSetlistId: null,
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
