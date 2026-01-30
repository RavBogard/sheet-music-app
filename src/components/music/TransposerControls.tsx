"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, ChevronUp, ChevronDown, Loader2 } from "lucide-react"

export function TransposerControls() {
    const {
        transposition,
        setTransposition,
        aiState,
        setAiEnabled
    } = useMusicStore()

    const handleScan = () => {
        // Toggle AI state
        setAiEnabled(!aiState.isEnabled);
    }

    const isScanning = aiState.scanningPages.length > 0;

    return (
        <div className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur rounded-lg p-1 border border-zinc-800 shadow-xl">
            {/* AI Toggle */}
            <Button
                size="sm"
                variant={aiState.isEnabled ? "default" : "ghost"}
                className={`gap-2 ${aiState.isEnabled ? 'bg-purple-600 hover:bg-purple-500' : 'text-zinc-400'}`}
                onClick={handleScan}
            >
                {isScanning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Sparkles className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                    {aiState.isEnabled ? "Smart Transposer Active" : "Enable Smart Transposer"}
                </span>
            </Button>

            <div className="w-px h-6 bg-zinc-700 mx-1" />

            {/* Virtual Capo Controls */}
            <div className="flex items-center gap-1">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 hover:bg-zinc-700 text-zinc-300"
                    onClick={() => setTransposition(transposition - 1)}
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>

                <div className="min-w-[3rem] text-center font-mono font-bold text-white">
                    {transposition > 0 ? `+${transposition}` : transposition}
                </div>

                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 hover:bg-zinc-700 text-zinc-300"
                    onClick={() => setTransposition(transposition + 1)}
                >
                    <ChevronUp className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
