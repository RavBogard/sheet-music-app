"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Sparkles, X, Bot, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/lib/chat-store"

export function ChatPanel() {
    const { isOpen, close, messages, addMessage, contextData, onApplyEdits } = useChatStore()
    const [input, setInput] = useState("")
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Scroll to bottom on new message
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages, loading])

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    const handleSend = async () => {
        if (!input.trim() || loading) return

        const userMsg = { role: 'user' as const, content: input }
        addMessage(userMsg)
        setInput("")
        setLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

            addMessage({ role: 'assistant', content: data.message })

            if (data.edits && data.edits.length > 0 && onApplyEdits) {
                onApplyEdits(data.edits)
            }

        } catch (error: any) {
            console.error(error)
            addMessage({ role: 'assistant', content: `Error: ${error.message || "I had trouble connecting."} Please check your API Key configuration.` })
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transition-transform animate-in slide-in-from-right">
            {/* Header */}
            <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md">
                <div className="flex items-center gap-2 text-blue-400">
                    <Sparkles className="h-5 w-5" />
                    <h2 className="font-bold">Cantor AI</h2>
                </div>
                <Button size="icon" variant="ghost" onClick={close} className="text-zinc-400 hover:text-white">
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 pb-4">
                    {messages.length === 0 && (
                        <div className="text-center text-zinc-500 mt-10 space-y-2">
                            <Bot className="h-12 w-12 mx-auto opacity-20" />
                            <p>Hello! I can help you build your setlist.</p>
                            <p className="text-sm">Try asking: <br />"Add a festive opening song"<br />"What do we have for Shabbat?"</p>
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
                                m.role === 'user' ? "bg-blue-600/20 text-blue-100" : "bg-zinc-800 text-zinc-100"
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
                            <div className="bg-zinc-800 rounded-2xl px-4 py-2 text-sm text-zinc-400">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900">
                <div className="flex gap-2">
                    <Input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask me to suggest or add songs..."
                        className="bg-zinc-800 border-zinc-700 focus-visible:ring-blue-500/50"
                        disabled={loading}
                    />
                    <Button
                        onClick={handleSend}
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
