import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore, ChatEditAction } from './chat-store'
import { parseTemplateRequest } from '@/lib/template-parser'

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

    describe('ChatEditAction with key/bpm/afterTitle fields', () => {
        it('accepts key and bpm fields on add action', () => {
            const edits: ChatEditAction[] = []
            useChatStore.getState().registerOnApplyEdits((e) => edits.push(...e))

            useChatStore.getState().onApplyEdits?.([
                { action: 'add', title: 'Mi Chamocha', key: 'Am', bpm: 120 }
            ])

            expect(edits).toHaveLength(1)
            expect(edits[0].key).toBe('Am')
            expect(edits[0].bpm).toBe(120)
        })

        it('accepts afterTitle for positional insertion', () => {
            const edits: ChatEditAction[] = []
            useChatStore.getState().registerOnApplyEdits((e) => edits.push(...e))

            useChatStore.getState().onApplyEdits?.([
                { action: 'add', title: 'Mi Chamocha', key: 'Am', afterTitle: 'Responsive Reading' }
            ])

            expect(edits).toHaveLength(1)
            expect(edits[0].afterTitle).toBe('Responsive Reading')
            expect(edits[0].key).toBe('Am')
        })

        it('correctly structures all ChatEditAction fields', () => {
            const action: ChatEditAction = {
                action: 'add',
                title: 'Oseh Shalom',
                fileId: 'file-123',
                type: 'song',
                performer: 'Cantor',
                estimatedMinutes: 3,
                key: 'G',
                bpm: 80,
                afterTitle: 'Silent Prayer',
            }
            expect(action.action).toBe('add')
            expect(action.key).toBe('G')
            expect(action.bpm).toBe(80)
            expect(action.afterTitle).toBe('Silent Prayer')
        })
    })

    describe('afterTitle positioning logic', () => {
        it('inserts after matching track title', () => {
            // Simulate the handleApplyEdits logic for afterTitle
            const tracks = [
                { id: '1', title: 'Barchu', key: '', notes: '' },
                { id: '2', title: 'Responsive Reading', key: '', notes: '' },
                { id: '3', title: 'Silent Prayer', key: '', notes: '' },
            ]

            const edit: ChatEditAction = {
                action: 'add',
                title: 'Mi Chamocha',
                key: 'Am',
                afterTitle: 'Responsive Reading',
            }

            // Replicate the afterTitle logic from use-setlist-logic.ts
            const newTracks = [...tracks]
            const afterIndex = newTracks.findIndex(t =>
                t.title.toLowerCase().includes(edit.afterTitle!.toLowerCase())
            )
            expect(afterIndex).toBe(1) // Found "Responsive Reading" at index 1
            if (afterIndex >= 0) {
                newTracks.splice(afterIndex + 1, 0, {
                    id: 'new-track',
                    title: edit.title!,
                    key: edit.key || '',
                    notes: '',
                })
            }

            expect(newTracks).toHaveLength(4)
            expect(newTracks[2].title).toBe('Mi Chamocha')
            expect(newTracks[2].key).toBe('Am')
        })

        it('appends to end when afterTitle not found', () => {
            const tracks = [
                { id: '1', title: 'Barchu', key: '', notes: '' },
                { id: '2', title: 'Shema', key: '', notes: '' },
            ]

            const edit: ChatEditAction = {
                action: 'add',
                title: 'Mi Chamocha',
                afterTitle: 'Nonexistent Track',
            }

            const newTracks = [...tracks]
            const afterIndex = newTracks.findIndex(t =>
                t.title.toLowerCase().includes(edit.afterTitle!.toLowerCase())
            )
            expect(afterIndex).toBe(-1)
            // When not found, append to end
            newTracks.push({
                id: 'new-track',
                title: edit.title!,
                key: '',
                notes: '',
            })

            expect(newTracks).toHaveLength(3)
            expect(newTracks[2].title).toBe('Mi Chamocha')
        })

        it('uses partial case-insensitive title matching', () => {
            const tracks = [
                { id: '1', title: 'Torah Service — Parashat Vayikra', key: '', notes: '' },
                { id: '2', title: 'The Responsive Reading for Shabbat', key: '', notes: '' },
            ]

            const afterIndex = tracks.findIndex(t =>
                t.title.toLowerCase().includes('responsive reading')
            )
            expect(afterIndex).toBe(1) // Partial match works
        })
    })
})

describe('parseTemplateRequest', () => {
    it('maps "Daniel Friday" to friday_night with rabbi daniel_karen', () => {
        const result = parseTemplateRequest('Create a Daniel Friday for March 14')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('friday_night')
        expect(result!.rabbi).toBe('daniel_karen')
    })

    it('maps "Saturday Morning" to shabbat_morning', () => {
        const result = parseTemplateRequest('Create a Saturday Morning service')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('shabbat_morning')
    })

    it('maps "Rosh Hashanah Evening" to rosh_hashanah_evening', () => {
        const result = parseTemplateRequest('Build a Rosh Hashanah Evening setlist')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('rosh_hashanah_evening')
    })

    it('maps "Randy Friday" to friday_night with rabbi randy', () => {
        const result = parseTemplateRequest('Create a Randy Friday night')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('friday_night')
        expect(result!.rabbi).toBe('randy')
    })

    it('maps "Kol Nidre" to yom_kippur_kol_nidre', () => {
        const result = parseTemplateRequest('Make a Kol Nidre service')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('yom_kippur_kol_nidre')
    })

    it('maps "Passover" to passover', () => {
        const result = parseTemplateRequest('Create a Passover seder service')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('passover')
    })

    it('maps "Shir Shabbat" to shir_shabbat', () => {
        const result = parseTemplateRequest('Build a Shir Shabbat for next week')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('shir_shabbat')
    })

    it('extracts date from "for March 14"', () => {
        const result = parseTemplateRequest('Create a Daniel Friday for March 14')
        expect(result).toBeTruthy()
        expect(result!.date).toBeInstanceOf(Date)
        expect(result!.date!.getMonth()).toBe(2) // March = 2
        expect(result!.date!.getDate()).toBe(14)
    })

    it('returns null for non-template requests', () => {
        const result = parseTemplateRequest('Add Mi Chamocha in Am')
        expect(result).toBeNull()
    })

    it('maps "Daniel Saturday" to shabbat_morning with rabbi daniel_karen', () => {
        const result = parseTemplateRequest('Create a Daniel Saturday morning')
        expect(result).toBeTruthy()
        expect(result!.templateKey).toBe('shabbat_morning')
        expect(result!.rabbi).toBe('daniel_karen')
    })
})
