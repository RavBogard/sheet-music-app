import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { FileType } from './store'

export interface SetlistItem {
    id: string // Unique ID for the setlist item
    fileId: string // The Drive ID or URL
    name: string
    type: FileType
    url?: string // Web link or direct link
    transposition?: number // Saved key for this specific item
}

interface SetlistState {
    items: SetlistItem[]
    activeIndex: number | null

    addItem: (item: Omit<SetlistItem, 'id'>) => void
    removeItem: (id: string) => void
    moveItem: (oldIndex: number, newIndex: number) => void
    setActiveIndex: (index: number | null) => void
    updateItemTransposition: (id: string, transposition: number) => void
    clear: () => void
}

export const useSetlistStore = create<SetlistState>()(
    persist(
        (set) => ({
            items: [],
            activeIndex: null,

            addItem: (item) => set((state) => ({
                items: [...state.items, { ...item, id: uuidv4(), transposition: 0 }]
            })),

            removeItem: (id) => set((state) => ({
                items: state.items.filter((i) => i.id !== id),
                activeIndex: state.activeIndex // Might need adjustment, but safe for now
            })),

            moveItem: (oldIndex, newIndex) => set((state) => {
                const newItems = [...state.items]
                const [moved] = newItems.splice(oldIndex, 1)
                newItems.splice(newIndex, 0, moved)
                return { items: newItems }
            }),

            setActiveIndex: (index) => set({ activeIndex: index }),

            updateItemTransposition: (id, t) => set((state) => ({
                items: state.items.map(item =>
                    item.id === id ? { ...item, transposition: t } : item
                )
            })),

            clear: () => set({ items: [], activeIndex: null }),
        }),
        {
            name: 'sheet-music-setlist-storage',
        }
    )
)
