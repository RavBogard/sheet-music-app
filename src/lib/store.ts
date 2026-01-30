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

            aiTransposer: {
                isVisible: false,
                status: 'idle',
                detectedKey: '',
                isEditing: false,
                corrections: []
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
