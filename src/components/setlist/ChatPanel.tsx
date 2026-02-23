"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Sparkles, X, Bot, User, Loader2, ShieldAlert, Check, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useChatStore, ChatEditAction } from "@/lib/chat-store"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
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

/** Commands that require user confirmation before execution */
const DESTRUCTIVE_COMMANDS = new Set([
    'PUBLISH_SETLIST',
    'ADMIN_ACTION',
])

/** Check if a REMOVE command is destructive (removing all tracks) */
function isDestructiveRemove(cmd: ChatCommand): boolean {
    if (cmd.type !== 'REMOVE_FROM_SETLIST') return false
    const p = cmd.payload as Record<string, unknown>
    return p.all === true || p.index === 'all'
}

/** Check if a batch of commands needs confirmation */
function needsConfirmation(commands: ChatCommand[]): boolean {
    return commands.some(cmd =>
        DESTRUCTIVE_COMMANDS.has(cmd.type) || isDestructiveRemove(cmd)
    )
}

/** Generate a human-readable summary of pending commands */
function summarizeCommands(commands: ChatCommand[], currentTrackCount: number): string[] {
    const summaries: string[] = []
    for (const cmd of commands) {
        const p = cmd.payload as Record<string, string | number | boolean | object[] | undefined>
        switch (cmd.type) {
            case 'PUBLISH_SETLIST':
                summaries.push(`Publish setlist for ${p.date || 'unknown date'}`)
                break
            case 'ADMIN_ACTION':
                summaries.push(`Change user ${p.userId || 'unknown'} role to "${p.targetRole || 'member'}"`)
                break
            case 'REMOVE_FROM_SETLIST':
                if (p.all === true || p.index === 'all') {
                    summaries.push(`Remove all ${currentTrackCount} tracks from setlist`)
                } else {
                    summaries.push(`Remove track at position ${Number(p.index) + 1}`)
                }
                break
            case 'CREATE_SETLIST':
                summaries.push(`Create new setlist "${p.name}"`)
                break
            case 'ADD_TO_SETLIST':
                summaries.push(`Add "${p.fileName || p.title || 'song'}" to setlist`)
                break
            case 'TRANSPOSE_CHART':
                summaries.push(`Transpose by ${p.steps} semitones`)
                break
            case 'SEARCH_LIBRARY':
                summaries.push(`Search library for "${p.query}"`)
                break
            case 'NAVIGATE':
                summaries.push(`Navigate to ${p.path}`)
                break
        }
    }
    return summaries
}

interface PendingConfirmation {
    commands: ChatCommand[]
    summaries: string[]
}

export function ChatPanel() {
    const { user } = useAuth() // Get user for auth token
    const { isOpen, close, messages, addMessage, replaceLastAssistant, contextData, onApplyEdits } = useChatStore()
    const { allFiles } = useLibraryStore()
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
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
    }, [messages, loading, pendingConfirmation])

    // Focus input and handle Pending Prompt (M6 fix: deps + cleanup)
    useEffect(() => {
        if (!isOpen) return
        inputRef.current?.focus()
        if (pendingPrompt) {
            setInput(pendingPrompt)
            clearPendingPrompt()
            const timer = setTimeout(() => handleSend(pendingPrompt), 100)
            return () => clearTimeout(timer)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, pendingPrompt])

    const handleSend = async (overrideInput?: string) => {
        const textToSend = overrideInput || input
        if (!textToSend.trim() || loading) return

        const userMsg = { role: 'user' as const, content: textToSend }
        addMessage(userMsg)
        setInput("")
        setLoading(true)

        try {
            // Send to AI API (now returns SSE stream)
            const res = await apiFetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    currentSetlist: contextData.currentSetlist || [],
                    setlistName: contextData.setlistName,
                    rabbi: contextData.rabbi,
                    libraryFiles: allFiles.map(f => ({ id: f.id, name: f.name }))
                })
            })

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || `Server error (${res.status})`)
            }

            // Read the SSE stream
            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response stream")

            const decoder = new TextDecoder()
            let streamedMessage = ""
            let assistantMsgAdded = false
            let sseBuffer = "" // M1 fix: buffer for SSE chunks split across TCP boundaries

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                sseBuffer += decoder.decode(value, { stream: true })
                const lines = sseBuffer.split('\n')
                sseBuffer = lines.pop() || "" // Keep incomplete last line in buffer
                // Parse SSE lines
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const payload = JSON.parse(line.slice(6))

                        if (payload.error) {
                            throw new Error(payload.error)
                        }

                        if (payload.done) {
                            // Final message — process commands
                            const finalMessage = payload.message || streamedMessage
                            if (finalMessage) {
                                // Replace streaming message with final
                                replaceLastAssistant(finalMessage)
                            }

                            // Handle Legacy Edits
                            if (payload.edits && payload.edits.length > 0 && onApplyEdits) {
                                onApplyEdits(payload.edits)
                                toast.success("Setlist updated!")
                            }

                            // Handle Commands — with guardrails for destructive ones
                            if (payload.commands && Array.isArray(payload.commands)) {
                                if (needsConfirmation(payload.commands)) {
                                    const trackCount = contextData.currentSetlist?.length || 0
                                    setPendingConfirmation({
                                        commands: payload.commands,
                                        summaries: summarizeCommands(payload.commands, trackCount),
                                    })
                                } else {
                                    await handleCommands(payload.commands)
                                }
                            }
                        } else if (payload.chunk) {
                            // Streaming chunk — show progressive text
                            streamedMessage = payload.accumulated || (streamedMessage + payload.chunk)
                            if (!assistantMsgAdded) {
                                addMessage({ role: 'assistant', content: streamedMessage })
                                assistantMsgAdded = true
                            } else {
                                replaceLastAssistant(streamedMessage)
                            }
                        }
                    } catch (parseErr) {
                        // Skip malformed SSE lines
                        if (parseErr instanceof Error && parseErr.message !== "No response stream") {
                            logger.warn("SSE parse error:", parseErr)
                        }
                    }
                }
            }

            // If no streaming messages came through, ensure we have something
            if (!assistantMsgAdded && streamedMessage) {
                addMessage({ role: 'assistant', content: streamedMessage })
            }

        } catch (error: unknown) {
            logger.error(error)
            addMessage({ role: 'assistant', content: `Error: ${error instanceof Error ? error.message : "I had trouble connecting."}` })
        } finally {
            setLoading(false)
        }
    }

    const handleConfirmPending = async () => {
        if (!pendingConfirmation) return
        const commands = pendingConfirmation.commands
        setPendingConfirmation(null)
        await handleCommands(commands)
    }

    const handleRejectPending = () => {
        setPendingConfirmation(null)
        addMessage({ role: 'assistant', content: "Cancelled. No changes were made." })
    }

    const handleCommands = async (commands: ChatCommand[]) => {
        let lastCreatedSetlistId: string | null = null

        // ── Batch all setlist modifications into edits ──
        // This ensures all changes go through local React state (via onApplyEdits)
        // instead of writing directly to Firestore (which causes stale-read races).
        const edits: { action: string; title?: string; fileId?: string; index?: number; type?: string; performer?: string; estimatedMinutes?: number }[] = []
        let shouldClearFirst = false

        for (const cmd of commands) {
            const p = cmd.payload as Record<string, string | number | boolean | object[] | undefined>
            try {
                switch (cmd.type) {
                    case 'CREATE_SETLIST':
                        const newId = await setlistService.createSetlist(
                            String(p.name),
                            (p.tracks || []) as SetlistTrack[],
                            !!p.isPublic
                        )
                        lastCreatedSetlistId = newId
                        toast.success(`Created setlist: ${p.name}`)
                        break;

                    case 'PUBLISH_SETLIST':
                        {
                            const resolvedId = lastCreatedSetlistId || (
                                p.setlistId && p.setlistId !== 'current'
                                    ? String(p.setlistId)
                                    : (contextData.setlistId || null)
                            )

                            if (!resolvedId) {
                                toast.error("No setlist to publish — create one first")
                            } else {
                                await setlistService.updateSetlist(resolvedId, false, {
                                    eventDate: String(p.date)
                                })
                                toast.success(`Scheduled for ${p.date}`)
                            }
                        }
                        break;

                    case 'ADD_TO_SETLIST':
                        // Route through local state, not Firestore
                        edits.push({
                            action: 'add',
                            title: String(p.fileName || p.title || 'Untitled'),
                            fileId: p.fileId ? String(p.fileId) : undefined,
                            type: p.type ? String(p.type) : undefined,
                            performer: p.performer ? String(p.performer) : undefined,
                            estimatedMinutes: p.estimatedMinutes ? Number(p.estimatedMinutes) : undefined,
                        })
                        break;

                    case 'REMOVE_FROM_SETLIST':
                        if (p.all === true || p.index === 'all') {
                            // "Delete everything" — mark for clearing
                            shouldClearFirst = true
                        } else {
                            const idx = Number(p.index)
                            edits.push({ action: 'remove', index: idx })
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
                        await apiFetch('/api/admin/set-role', {
                            method: 'POST',
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

        // ── Apply batched setlist edits ──
        if ((shouldClearFirst || edits.length > 0) && onApplyEdits) {
            const batchedEdits: { action: string; title?: string; fileId?: string; index?: number; type?: string; performer?: string; estimatedMinutes?: number }[] = []

            if (shouldClearFirst) {
                // Remove all tracks by index, from last to first
                const currentLen = contextData.currentSetlist?.length || 0
                for (let i = currentLen - 1; i >= 0; i--) {
                    batchedEdits.push({ action: 'remove', index: i })
                }
            } else {
                // For individual removes, sort descending so indices don't shift
                const removes = edits.filter(e => e.action === 'remove').sort((a, b) => (b.index || 0) - (a.index || 0))
                batchedEdits.push(...removes)
            }

            // Then adds (always after removes)
            const adds = edits.filter(e => e.action === 'add')
            batchedEdits.push(...adds)

            if (batchedEdits.length > 0) {
                onApplyEdits(batchedEdits as ChatEditAction[])
                const addCount = adds.length
                const removeCount = shouldClearFirst ? (contextData.currentSetlist?.length || 0) : edits.filter(e => e.action === 'remove').length
                if (removeCount > 0 && addCount > 0) {
                    toast.success(`Cleared ${removeCount} tracks, added ${addCount} new`)
                } else if (addCount > 0) {
                    toast.success(`Added ${addCount} track${addCount !== 1 ? 's' : ''}`)
                } else if (removeCount > 0) {
                    toast.success(`Removed ${removeCount} track${removeCount !== 1 ? 's' : ''}`)
                }
            }
        } else if (edits.length > 0 && !onApplyEdits) {
            toast.error("Can't modify setlist — open a setlist first")
        }

        // Navigate to newly created setlist after all commands finish
        if (lastCreatedSetlistId) {
            router.push(`/setlists/${lastCreatedSetlistId}`)
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

                    {/* Pending confirmation banner */}
                    {pendingConfirmation && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
                                <ShieldAlert className="h-4 w-4" />
                                Confirm actions
                            </div>
                            <ul className="space-y-1.5">
                                {pendingConfirmation.summaries.map((s, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <span className="text-amber-400 mt-0.5">&#8226;</span>
                                        {s}
                                    </li>
                                ))}
                            </ul>
                            <div className="flex gap-2 pt-1">
                                <Button
                                    size="sm"
                                    onClick={handleConfirmPending}
                                    className="bg-amber-600 hover:bg-amber-500 text-white"
                                >
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleRejectPending}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <XCircle className="h-3.5 w-3.5 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

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
                        disabled={loading || !!pendingConfirmation}
                    />
                    <Button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || loading || !!pendingConfirmation}
                        className="bg-blue-600 hover:bg-blue-500"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
