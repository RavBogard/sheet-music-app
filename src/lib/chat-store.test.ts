import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore, ChatEditAction } from './chat-store'

describe('useChatStore', () => {
    beforeEach(() => {
        // Reset store state between tests
        const store = useChatStore.getState()
        store.clearMessages()
        store.setContextData({})
        store.registerOnApplyEdits(undefined)
        store.clearPendingPrompt()
        if (store.isOpen) store.close()
    })

    describe('UI state', () => {
        it('starts closed', () => {
            expect(useChatStore.getState().isOpen).toBe(false)
        })

        it('opens', () => {
            useChatStore.getState().open()
            expect(useChatStore.getState().isOpen).toBe(true)
        })

        it('closes', () => {
            useChatStore.getState().open()
            useChatStore.getState().close()
            expect(useChatStore.getState().isOpen).toBe(false)
        })

        it('toggles', () => {
            useChatStore.getState().toggle()
            expect(useChatStore.getState().isOpen).toBe(true)
            useChatStore.getState().toggle()
            expect(useChatStore.getState().isOpen).toBe(false)
        })
    })

    describe('messages', () => {
        it('starts with empty messages', () => {
            expect(useChatStore.getState().messages).toEqual([])
        })

        it('adds a message', () => {
            useChatStore.getState().addMessage({ role: 'user', content: 'Hello' })
            expect(useChatStore.getState().messages).toHaveLength(1)
            expect(useChatStore.getState().messages[0]).toEqual({
                role: 'user',
                content: 'Hello'
            })
        })

        it('preserves message order', () => {
            useChatStore.getState().addMessage({ role: 'user', content: 'Add Lecha Dodi' })
            useChatStore.getState().addMessage({ role: 'assistant', content: 'Done!' })
            const messages = useChatStore.getState().messages
            expect(messages).toHaveLength(2)
            expect(messages[0].role).toBe('user')
            expect(messages[1].role).toBe('assistant')
        })

        it('sets messages (replaces all)', () => {
            useChatStore.getState().addMessage({ role: 'user', content: 'Old' })
            useChatStore.getState().setMessages([
                { role: 'user', content: 'New' }
            ])
            expect(useChatStore.getState().messages).toHaveLength(1)
            expect(useChatStore.getState().messages[0].content).toBe('New')
        })

        it('clears messages', () => {
            useChatStore.getState().addMessage({ role: 'user', content: 'Test' })
            useChatStore.getState().clearMessages()
            expect(useChatStore.getState().messages).toEqual([])
        })
    })

    describe('context data', () => {
        it('starts with empty context', () => {
            expect(useChatStore.getState().contextData).toEqual({})
        })

        it('sets context data', () => {
            useChatStore.getState().setContextData({
                currentSetlist: [
                    { id: '1', title: 'Lecha Dodi', key: 'Am', notes: '' }
                ]
            })
            expect(useChatStore.getState().contextData.currentSetlist).toHaveLength(1)
        })
    })

    describe('edit callbacks', () => {
        it('starts with no callback', () => {
            expect(useChatStore.getState().onApplyEdits).toBeUndefined()
        })

        it('registers and invokes edit callback', () => {
            const edits: ChatEditAction[] = []
            useChatStore.getState().registerOnApplyEdits((e) => edits.push(...e))

            useChatStore.getState().onApplyEdits?.([
                { action: 'add', title: 'Mi Chamocha' }
            ])

            expect(edits).toHaveLength(1)
            expect(edits[0].title).toBe('Mi Chamocha')
        })

        it('unregisters callback', () => {
            useChatStore.getState().registerOnApplyEdits(() => {})
            useChatStore.getState().registerOnApplyEdits(undefined)
            expect(useChatStore.getState().onApplyEdits).toBeUndefined()
        })
    })

    describe('pending prompt', () => {
        it('starts with null', () => {
            expect(useChatStore.getState().pendingPrompt).toBeNull()
        })

        it('sets pending prompt', () => {
            useChatStore.getState().setPendingPrompt('Add a closing song')
            expect(useChatStore.getState().pendingPrompt).toBe('Add a closing song')
        })

        it('clears pending prompt', () => {
            useChatStore.getState().setPendingPrompt('Test')
            useChatStore.getState().clearPendingPrompt()
            expect(useChatStore.getState().pendingPrompt).toBeNull()
        })
    })
})
