"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Sparkles, X, Bot, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/lib/chat-store"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { createSetlistService } from "@/lib/setlist-firebase"
import { SetlistTrack } from "@/types/models"

interface ChatCommand {
    type: 'CREATE_SETLIST' | 'PUBLISH_SETLIST' | 'ADD_TO_SETLIST' | 'REMOVE_FROM_SETLIST' | 'TRANSPOSE_CHART' | 'SEARCH_LIBRARY' | 'ADMIN_ACTION' | 'NAVIGATE'
    payload: Record<string, unknown>
}
import { toast } from "sonner"
import { logger } from "@/lib/logger"

export function ChatPanel() {
    const { user } = useAuth() // Get user for auth token
    const { isOpen, close, messages, addMessage, contextData, onApplyEdits } = useChatStore()
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const router = useRouter() // For navigation commands

    const { pendingPrompt, clearPendingPrompt } = useChatStore()

    // Initialize Services
    const setlistService = useMemo(() => createSetlistService(user ? user.uid : null, user?.displayName), [user])

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages, loading])

    // Focus input and handle Pending Prompt
    useEffect(() => {
        if (isOpen) {
            if (inputRef.current) {
                inputRef.current.focus()
            }
            if (pendingPrompt) {
                setInput(pendingPrompt)
                clearPendingPrompt()
                setTimeout(() => handleSend(pendingPrompt), 100)
            }
        }
    }, [isOpen, pendingPrompt])

    const handleSend = async (overrideInput?: string) => {
        const textToSend = overrideInput || input
        if (!textToSend.trim() || loading) return

        const userMsg = { role: 'user' as const, content: textToSend }
        addMessage(userMsg)
        setInput("")
        setLoading(true)

        try {
            // Get Token
            const token = user ? await user.getIdToken() : null

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    currentSetlist: contextData.currentSetlist || [],
                    libraryFiles: contextData.libraryFiles?.map(f => ({ id: f.id, name: f.name })) || []
                })
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || `Server error (${res.status})`)
            }

            const data = await res.json()

            // 1. Add Message
            if (data.message) {
                addMessage({ role: 'assistant', content: data.message })
            }

            // 2. Handle Legacy Edits (Backward compatibility)
            if (data.edits && data.edits.length > 0 && onApplyEdits) {
                onApplyEdits(data.edits)
                toast.success("Setlist updated!")
            }

            // 3. Handle New Commands (The Agent Logic)
            if (data.commands && Array.isArray(data.commands)) {
                await handleCommands(data.commands)
            }

        } catch (error: unknown) {
            logger.error(error)
            addMessage({ role: 'assistant', content: `Error: ${error instanceof Error ? error.message : "I had trouble connecting."}` })
        } finally {
            setLoading(false)
        }
    }

    const handleCommands = async (commands: ChatCommand[]) => {
        for (const cmd of commands) {
            const p = cmd.payload as Record<string, string | number | boolean | object[] | undefined>
            try {
                switch (cmd.type) {
                    case 'CREATE_SETLIST':
                        const _newId = await setlistService.createSetlist(
                            String(p.name),
                            (p.tracks || []) as SetlistTrack[],
                            !!p.isPublic
                        )
                        toast.success(`Created setlist: ${p.name}`)
                        break;

                    case 'PUBLISH_SETLIST':
                        if (p.setlistId === 'current') {
                            toast.error("Bot tried to update unknown setlist")
                        } else {
                            await setlistService.updateSetlist(String(p.setlistId), false, {
                                eventDate: String(p.date)
                            })
                            toast.success(`Scheduled for ${p.date}`)
                        }
                        break;

                    case 'ADD_TO_SETLIST':
                        if (contextData.currentSetlist) {
                            const pathParts = window.location.pathname.split('/')
                            const potentialId = pathParts[pathParts.length - 1]

                            if (potentialId && potentialId !== 'new') {
                                const newTrack: SetlistTrack = {
                                    id: crypto.randomUUID(),
                                    type: 'song',
                                    title: String(p.fileName),
                                    fileId: String(p.fileId)
                                }
                                const newTracks: SetlistTrack[] = [...contextData.currentSetlist, newTrack]
                                await setlistService.updateSetlist(potentialId, false, { tracks: newTracks })
                                toast.success(`Added ${p.fileName}`)
                            } else {
                                toast.error("Open a setlist first")
                            }
                        }
                        break;

                    case 'REMOVE_FROM_SETLIST':
                        const pathPartsRemote = window.location.pathname.split('/')
                        const setlistId = pathPartsRemote[pathPartsRemote.length - 1]
                        if (setlistId && contextData.currentSetlist) {
                            const idx = Number(p.index)
                            const track = contextData.currentSetlist[idx]
                            if (track) {
                                const newTracks = [...contextData.currentSetlist]
                                newTracks.splice(idx, 1)
                                await setlistService.updateSetlist(setlistId, false, { tracks: newTracks })
                                toast.success("Removed track")
                            } else {
                                toast.error("Could not find track at that index")
                            }
                        }
                        break;

                    case 'TRANSPOSE_CHART':
                        const steps = Number(p.steps)
                        useMusicStore.getState().setTransposition(steps)
                        toast.success(`Transposed ${steps > 0 ? '+' : ''}${steps}`)
                        break;

                    case 'SEARCH_LIBRARY':
                        useLibraryStore.getState().setFilter(null, String(p.query))
                        router.push('/library')
                        break;

                    case 'ADMIN_ACTION':
                        const token = user ? await user.getIdToken() : null
                        if (!token) throw new Error("Unauthorized")
                        await fetch('/api/admin/set-role', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                uid: String(p.userId),
                                role: String(p.targetRole || 'member')
                            })
                        })
                        toast.success(`Admin action applied`)
                        break;

                    case 'NAVIGATE':
                        if (p.path) {
                            router.push(String(p.path))
                        }
                        break;
                }
            } catch (err) {
                logger.error(`Failed command ${cmd.type}`, err)
                toast.error(`Failed to execute: ${cmd.type}`)
            }
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-card border-l border-border shadow-2xl z-50 flex flex-col transition-transform animate-in slide-in-from-right">
            {/* Header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-muted backdrop-blur-md">
                <div className="flex items-center gap-2 text-blue-400">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="font-bold">Cantor AI</h2>
                </div>
                <Button size="icon" variant="ghost" onClick={close} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 pb-4">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground mt-10 space-y-2">
                            <Bot className="h-12 w-12 mx-auto opacity-20" />
                            <p>Hello! I can help you build your setlist.</p>
                            <p className="text-sm">Try asking: <br />&ldquo;Add a festive opening song&rdquo;<br />&ldquo;What do we have for Shabbat?&rdquo;</p>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                m.role === 'user' ? "bg-blue-600" : "bg-purple-600"
                            )}>
                                {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                            </div>
                            <div className={cn(
                                "rounded-2xl px-4 py-2 max-w-[80%] text-sm",
                                m.role === 'user' ? "bg-blue-600/20 text-blue-900 dark:text-blue-100" : "bg-muted text-foreground"
                            )}>
                                {m.content}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                            <div className="bg-muted rounded-2xl px-4 py-2 text-sm text-muted-foreground">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-border bg-card">
                <div className="flex gap-2">
                    <Input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask me to suggest or add songs..."
                        className="bg-muted border-border focus-visible:ring-blue-500/50"
                        disabled={loading}
                    />
                    <Button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || loading}
                        className="bg-blue-600 hover:bg-blue-500"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
