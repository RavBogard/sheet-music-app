"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ListMusic, PlayCircle, Music2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function SetlistDrawer() {
    const router = useRouter()
    const { playbackQueue, queueIndex } = useMusicStore()
    const [open, setOpen] = useState(false)

    if (playbackQueue.length === 0) return null

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
                    <ListMusic className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] bg-zinc-950 border-t border-zinc-800 p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-zinc-800">
                    <SheetTitle className="flex items-center gap-2">
                        <ListMusic className="h-5 w-5 text-blue-500" />
                        Current Setlist
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="flex flex-col p-2 gap-1">
                        {playbackQueue.map((track, index) => {
                            const isCurrent = index === queueIndex
                            return (
                                <button
                                    key={`${track.fileId}-${index}`}
                                    onClick={() => {
                                        router.push(`/perform/${track.fileId}`)
                                        setOpen(false)
                                    }}
                                    className={cn(
                                        "flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                                        isCurrent
                                            ? "bg-blue-600 text-white shadow-lg"
                                            : "hover:bg-zinc-900 text-zinc-400 hover:text-white"
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                        isCurrent ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-500"
                                    )}>
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate text-lg">
                                            {track.name}
                                        </div>
                                        {track.type && (
                                            <div className="text-xs opacity-70 uppercase tracking-wider">
                                                {track.type}
                                            </div>
                                        )}
                                    </div>
                                    {isCurrent && <PlayCircle className="h-6 w-6 fill-white text-blue-600" />}
                                </button>
                            )
                        })}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                    <Button
                        variant="outline"
                        className="w-full h-12 text-lg font-bold border-zinc-700"
                        onClick={() => setOpen(false)}
                    >
                        Close
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
