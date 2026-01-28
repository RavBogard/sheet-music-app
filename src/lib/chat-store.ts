import { create } from 'zustand'

export interface Message {
    role: 'user' | 'assistant'
    content: string
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
    contextData: {
        currentSetlist?: any[]
        libraryFiles?: any[]
    }
    setContextData: (data: ChatState['contextData']) => void

    // Callbacks
    onApplyEdits?: (edits: any[]) => void
    registerOnApplyEdits: (fn?: (edits: any[]) => void) => void
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
    registerOnApplyEdits: (fn) => set({ onApplyEdits: fn })
}))
