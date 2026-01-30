"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, ChevronUp, ChevronDown, Loader2, Edit3, X } from "lucide-react" // Edit3, X might be needed later
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { calculateCapo, estimateKey } from "@/lib/music-math"
import { toast } from "sonner"

export function TransposerMenu() {
    const {
        transposition,
        setTransposition,
        aiState,
        setAiEnabled
    } = useMusicStore()

    const isScanning = aiState.scanningPages.length > 0;

    const handleSmartCapo = (targetShape: string) => {
        // Gather all detected chords
        const allChords = Object.values(aiState.pageData).flatMap(p => p.chords.map((c: any) => c.originalText));

        if (allChords.length === 0) {
            toast.error("No chords detected yet. Please scan the chart first.");
            return;
        }

        const estimatedKey = estimateKey(allChords);
        if (!estimatedKey) {
            toast.error("Could not detect key.");
            return;
        }

        const result = calculateCapo(estimatedKey, targetShape);
        if (!result) {
            toast.error("Could not calculate capo.");
            return;
        }

        setTransposition(result.transposition);
        toast.success(`Original Key: ${estimatedKey}. Use Capo ${result.fret} to play as ${targetShape}.`);
    };

    return (
        <div className="flex flex-col gap-4 p-4 min-w-[280px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h3 className="font-semibold text-white">Transposer Tools</h3>
                {isScanning && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
            </div>

            {/* Smart Transposer Activation */}
            <div className="space-y-2">
                <div className="space-y-0.5">
                    <Label className="text-base text-zinc-200">Smart Transposer</Label>
                    <p className="text-xs text-zinc-500">
                        Automatically detects and overlays chords.
                    </p>
                </div>

                <Button
                    className={cn(
                        "w-full transition-all",
                        aiState.isEnabled
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-purple-600 hover:bg-purple-700 text-white"
                    )}
                    onClick={() => setAiEnabled(!aiState.isEnabled)}
                    disabled={isScanning}
                >
                    {isScanning ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Scanning...
                        </>
                    ) : aiState.isEnabled ? (
                        <>
                            <Sparkles className="mr-2 h-4 w-4 fill-white" />
                            Active (Click to Stop)
                        </>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Activate
                        </>
                    )}
                </Button>
            </div>

            {/* Capo / Transpose Controls */}
            <div className="space-y-4 pt-2">

                {/* Manual Transpose */}
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

                {/* Smart Capo (Play As...) */}
                <div className="space-y-2">
                    <Label className="text-zinc-200 text-xs uppercase tracking-wider font-bold">Smart Capo (Play as...)</Label>
                    <div className="grid grid-cols-4 gap-2">
                        {['G', 'C', 'D', 'A', 'E', 'Am', 'Em', 'Dm'].map(shape => (
                            <Button
                                key={shape}
                                variant="outline"
                                size="sm"
                                onClick={() => handleSmartCapo(shape)}
                                className="h-8 text-xs border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white hover:bg-zinc-800"
                            >
                                {shape}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Quick Capo (Just sets transposition to negative) */}
                <div className="space-y-2">
                    <Label className="text-zinc-200 text-xs uppercase tracking-wider font-bold">Quick Capo</Label>
                    <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                        {[0, 1, 2, 3, 4, 5].map(fret => (
                            <Button
                                key={fret}
                                variant={transposition === -fret ? "default" : "outline"}
                                size="sm"
                                onClick={() => setTransposition(-fret)}
                                className={cn(
                                    "h-8 w-8 min-w-[2rem] p-0 text-xs border-zinc-700 bg-zinc-950",
                                    transposition === -fret ? "bg-purple-600 border-purple-600 text-white" : "text-zinc-400"
                                )}
                            >
                                {fret === 0 ? "None" : fret}
                            </Button>
                        ))}
                    </div>
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
