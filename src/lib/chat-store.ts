import { create } from 'zustand'
import { SetlistTrack } from '@/types/models'

export interface Message {
    role: 'user' | 'assistant'
    content: string
}

/** An edit action from the AI chat assistant to modify the active setlist */
export interface ChatEditAction {
    action: 'add' | 'remove' | 'reorder'
    index?: number
    fromIndex?: number
    toIndex?: number
    title?: string
    fileId?: string
}

interface ChatContextData {
    currentSetlist?: SetlistTrack[]
    libraryFiles?: Array<{ id: string; name: string; mimeType: string }>
}

interface ChatState {
    // UI State
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void

    // Chat Data
    messages: Message[]
    addMessage: (message: Message) => void
    setMessages: (messages: Message[]) => void
    clearMessages: () => void

    // Context Data (Provided by active component like SetlistEditor)
    contextData: ChatContextData
    setContextData: (data: ChatContextData) => void

    // Callbacks
    onApplyEdits?: (edits: ChatEditAction[]) => void
    registerOnApplyEdits: (fn?: (edits: ChatEditAction[]) => void) => void

    // External Trigger
    pendingPrompt: string | null
    setPendingPrompt: (text: string) => void
    clearPendingPrompt: () => void
}

export const useChatStore = create<ChatState>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),

    messages: [],
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    setMessages: (messages) => set({ messages }),
    clearMessages: () => set({ messages: [] }),

    contextData: {},
    setContextData: (data) => set({ contextData: data }),

    onApplyEdits: undefined,
    registerOnApplyEdits: (fn) => set({ onApplyEdits: fn }),

    pendingPrompt: null,
    setPendingPrompt: (text) => set({ pendingPrompt: text }),
    clearPendingPrompt: () => set({ pendingPrompt: null })
}))
