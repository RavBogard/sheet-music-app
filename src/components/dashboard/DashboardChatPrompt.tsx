"use client"

import { useState } from "react"
import { Sparkles, Send } from "lucide-react"
import { useChatStore } from "@/lib/chat-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DashboardChatPrompt() {
    const { open, setPendingPrompt } = useChatStore()
    const [input, setInput] = useState("")

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!input.trim()) return

        setPendingPrompt(input)
        open()
        setInput("")
    }

    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Cantor AI
            </h3>

            <form
                onSubmit={handleSubmit}
                className="bg-muted border border-border rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden"
            >
                {/* Decorative BG */}
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <Sparkles className="w-32 h-32" />
                </div>

                <div className="relative z-10 space-y-4">
                    <div className="space-y-1">
                        <h4 className="font-bold text-lg text-foreground">How can I help you today?</h4>
                        <p className="text-sm text-muted-foreground">
                            Ask me to create a setlist, find a song, or schedule your next service.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="e.g. 'Create a setlist for this Friday'..."
                            className="bg-background/50 border-border h-12 rounded-xl focus-visible:ring-blue-500/50"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            className="h-12 w-12 rounded-xl bg-blue-600 hover:bg-blue-500 shrink-0"
                            disabled={!input.trim()}
                        >
                            <Send className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Quick Prompts */}
                    <div className="flex flex-wrap gap-2">
                        {[
                            "Create Shabbat Setlist",
                            "Find 'Adon Olam'",
                            "Schedule for Friday"
                        ].map((prompt) => (
                            <button
                                key={prompt}
                                type="button"
                                onClick={() => {
                                    setPendingPrompt(prompt)
                                    open()
                                }}
                                className="text-xs bg-muted hover:bg-accent text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border/50 transition-colors"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            </form>
        </div>
    )
}
