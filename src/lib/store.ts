import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChordOverlay } from '@/lib/chord-cache'

export type FileType = 'pdf' | 'musicxml' | 'chordpro' | 'text' | 'image'

export interface QueueItem {
    name: string
    fileId: string
    type: FileType
    audioFileId?: string
    transposition?: number
    targetKey?: string // For auto-transpose
    bpm?: number
    key?: string
    tune?: string
    // Service flow fields (for setlist performance mode)
    trackType?: string // 'song' | 'header' | 'reading' | 'prayer' | 'transition' | 'note'
    performer?: string
    description?: string
    estimatedMinutes?: number
}

export interface MusicState {
    fileType: FileType | null
    fileUrl: string | null
    transposition: number // 0 = original key, +1 = semitone up
    zoom: number // 1 = 100%

    // AI Transposer State
    aiState: {
        isEnabled: boolean
        scanningPages: number[]
        pageData: Record<number, {
            strips: { id: string; y: number; height: number; image?: string }[]
            chords: ChordOverlay[]
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

    // Chord Edit Mode
    isEditingChords: boolean
    setEditingChords: (editing: boolean) => void
    pendingEditCount: number
    incrementPendingEdits: () => void
    resetPendingEdits: () => void

    // Gig Mode (Performance)
    gigModeActive: boolean
    setGigModeActive: (active: boolean) => void

    capoFret: number | null
    setCapoFret: (fret: number | null) => void

    /**
     * Guitarist-set capo position in semitones (0-11). UNLIKE `capoFret`
     * (which the "Play As" shape grid sets as a transposition-bundled output:
     * choose D shapes → setCapoFret(2) + setTransposition(...)), this is an
     * INPUT the guitarist dials independently of the rendered key. The chart
     * still renders / sounds in its written key; the capo panel shows what
     * SHAPES the capo'd guitarist plays — written Eb + capo 3 → play C
     * shapes (`transposeChord(writtenKey, -capoSemitones)`).
     *
     * Render-time, in-memory, per-iPad. NOT persisted (kept out of
     * `partialize` — mirrors `musicXmlKey`). 0 = no capo (off).
     */
    capoSemitones: number
    setCapoSemitones: (n: number) => void

    /**
     * Native key parsed from MusicXML's first `<key>` signature, written by
     * `SmartScoreViewer` after `osmd.load()` succeeds and cleared on
     * unmount / sourceUrl change. Render-time only: NOT persisted (kept out
     * of `partialize` below).
     *
     * Consumers (`TransposerMenu`, `PerformanceToolbar`) use it as the
     * fallback for `detectedKey` when the PDF AI-chord overlay path
     * (`aiState.pageData`-derived key) is empty — which is the steady state
     * for MusicXML files. PDF AI-chord remains authoritative when present.
     *
     * See `.paul/research/musicxml-phase2-discuss/DISCUSSION.md` §2.1
     * (Build Lane A) for the broader rationale.
     */
    musicXmlKey: string | null
    setMusicXmlKey: (key: string | null) => void

    setFile: (url: string | null, type: FileType | null, returnPath?: string) => void
    setTransposition: (semitones: number) => void
    setZoom: (zoom: number) => void

    // AI Actions
    setAiEnabled: (enabled: boolean) => void
    setPageScanning: (pageIndex: number, isScanning: boolean) => void
    setPageData: (pageIndex: number, data: {
        strips: { id: string; y: number; height: number; image?: string }[]
        chords: ChordOverlay[]
    }) => void
    setAiError: (error: string | null) => void

    // Queue Actions
    setQueue: (items: QueueItem[], startIndex?: number, returnPath?: string, setlistId?: string) => void
    nextSong: () => QueueItem | null
    prevSong: () => QueueItem | null
    jumpToSong: (index: number) => QueueItem | null



    // Audio Actions
    setAudioState: (state: Partial<MusicState['audio']>) => void

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
            returnPath: null,
            currentSetlistId: null,

            aiState: {
                isEnabled: false,
                scanningPages: [],
                pageData: {},
                error: null
            },

            isEditingChords: false,
            pendingEditCount: 0,
            gigModeActive: false,
            capoFret: null,
            capoSemitones: 0,
            musicXmlKey: null,

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
                capoFret: null,
                capoSemitones: 0,
                musicXmlKey: null,
                isEditingChords: false,
                aiState: { isEnabled: false, scanningPages: [], pageData: {}, error: null },
                aiXmlContent: null, // Clear AI content
            }),
            setTransposition: (t: number) => set({ transposition: t }),
            setZoom: (z: number) => set({ zoom: z }),

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
                    set({
                        queueIndex: nextIndex,
                        transposition: nextTrack.transposition ?? 0,
                        isEditingChords: false,
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
                    set({
                        queueIndex: prevIndex,
                        transposition: prevTrack.transposition ?? 0,
                        isEditingChords: false,
                        aiState: { ...aiState, pageData: {}, scanningPages: [], error: null }
                    })
                    return prevTrack
                }
                return null
            },
            jumpToSong: (index: number) => {
                const { playbackQueue, aiState } = get()
                if (index >= 0 && index < playbackQueue.length) {
                    const track = playbackQueue[index]
                    set({
                        queueIndex: index,
                        transposition: track.transposition ?? 0,
                        isEditingChords: false,
                        aiState: { ...aiState, pageData: {}, scanningPages: [], error: null }
                    })
                    return track
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

            setCapoFret: (fret) => set({ capoFret: fret }),
            setCapoSemitones: (n) => set({ capoSemitones: Math.max(0, Math.min(11, Math.floor(n))) }),
            setMusicXmlKey: (key) => set({ musicXmlKey: key }),

            setEditingChords: (editing) => set({ isEditingChords: editing, ...(editing ? {} : { pendingEditCount: 0 }) }),
            incrementPendingEdits: () => set(s => ({ pendingEditCount: s.pendingEditCount + 1 })),
            resetPendingEdits: () => set({ pendingEditCount: 0 }),
            setGigModeActive: (active) => set({ gigModeActive: active }),

            reset: () => set({
                fileType: null,
                fileUrl: null,
                transposition: 0,
                zoom: 1,
                aiXmlContent: null,
                isEditingChords: false,
                pendingEditCount: 0,
                gigModeActive: false,
                capoFret: null,
                capoSemitones: 0,
                musicXmlKey: null,
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
