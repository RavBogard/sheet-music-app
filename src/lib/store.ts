import { create } from 'zustand'

export type FileType = 'pdf' | 'musicxml' | 'chordpro'

interface MusicState {
    fileType: FileType | null
    fileUrl: string | null
    transposition: number // 0 = original key, +1 = semitone up
    zoom: number // 1 = 100%

    setFile: (url: string, type: FileType) => void
    setTransposition: (semitones: number) => void
    setZoom: (zoom: number) => void
    reset: () => void
}

export const useMusicStore = create<MusicState>((set) => ({
    fileType: null,
    fileUrl: null,
    transposition: 0,
    zoom: 1,

    setFile: (url, type) => set({ fileUrl: url, fileType: type }),
    setTransposition: (t) => set({ transposition: t }),
    setZoom: (z) => set({ zoom: z }),
    reset: () => set({ transposition: 0, zoom: 1 }),
}))
