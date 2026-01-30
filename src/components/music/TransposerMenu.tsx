"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, ChevronUp, ChevronDown, Loader2, Edit3, X } from "lucide-react" // Edit3, X might be needed later
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function TransposerMenu() {
    const {
        transposition,
        setTransposition,
        aiState,
        setAiEnabled
    } = useMusicStore()

    const isScanning = aiState.scanningPages.length > 0;

    return (
        <div className="flex flex-col gap-4 p-4 min-w-[280px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h3 className="font-semibold text-white">Transposer Tools</h3>
                {isScanning && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
            </div>

            {/* Smart Transposer Toggle */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-base text-zinc-200">Smart Layer</Label>
                    <p className="text-xs text-zinc-500">Scan & overlay chords</p>
                </div>
                <Switch
                    checked={aiState.isEnabled}
                    onCheckedChange={setAiEnabled}
                    className="data-[state=checked]:bg-purple-600"
                />
            </div>

            {/* Manual Controls (Virtual Capo) */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-zinc-200">Key Shift</Label>
                    <span className="font-mono text-zinc-400 text-xs">
                        {transposition > 0 ? `+${transposition}` : transposition} semitones
                    </span>
                </div>

                <div className="flex items-center justify-between bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTransposition(transposition - 1)}
                        className="h-8 w-12 hover:bg-zinc-800"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>

                    <div className="font-bold text-lg text-white w-full text-center">
                        {transposition === 0 ? "Original" : (transposition > 0 ? `+${transposition}` : transposition)}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTransposition(transposition + 1)}
                        className="h-8 w-12 hover:bg-zinc-800"
                    >
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Info / Status */}
            {aiState.error && (
                <div className="text-xs text-red-400 bg-red-950/30 p-2 rounded">
                    Error: {aiState.error}
                </div>
            )}

            {aiState.isEnabled && !isScanning && (
                <p className="text-xs text-zinc-500 text-center">
                    Drag incorrectly detected chords to move them (Coming Soon)
                </p>
            )}
        </div>
    )
}
