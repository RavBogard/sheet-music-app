"use client"

import { SetlistTrack } from "@/lib/setlist-firebase"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Music2, ArrowRight } from "lucide-react"

interface SetlistTimelineProps {
    tracks: SetlistTrack[]
    onPlay: (fileId: string) => void
}

export function SetlistTimeline({ tracks, onPlay }: SetlistTimelineProps) {
    if (tracks.length === 0) return null

    return (
        <div className="w-full bg-muted border-b border-border p-4">
            <h3 className="text-muted-foreground text-xs font-bold uppercase mb-3">Set Flow</h3>
            <ScrollArea className="w-full whitespace-nowrap rounded-md">
                <div className="flex w-max space-x-4 pb-4">
                    {tracks.map((track, i) => (
                        <div
                            key={i}
                            onClick={() => track.fileId && onPlay(track.fileId)}
                            className="bg-black border border-border hover:border-muted-foreground rounded-xl p-4 w-60 shrink-0 cursor-pointer transition-colors relative group"
                        >
                            {/* Connector Line */}
                            {i < tracks.length - 1 && (
                                <div className="absolute top-1/2 -right-6 w-6 h-[2px] bg-muted" />
                            )}

                            <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline" className="bg-card">{i + 1}</Badge>
                                {track.key && (
                                    <span className="text-xs font-mono font-bold text-yellow-500">{track.key}</span>
                                )}
                            </div>

                            <div className="font-bold truncate text-lg group-hover:text-blue-400 transition-colors">
                                {track.title}
                            </div>

                            <div className="text-xs text-muted-foreground mt-1 truncate">
                                {track.duration ? `${track.duration}` : "3:30"} • Fast • 4/4
                            </div>
                        </div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    )
}
