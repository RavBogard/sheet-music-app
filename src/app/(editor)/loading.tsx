"use client"

import { Loader2 } from "lucide-react"

export default function EditorLoading() {
    return (
        <div className="h-[100dvh] flex flex-col bg-background">
            {/* Top bar skeleton */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="h-8 w-8 rounded bg-muted animate-pulse" />
                <div className="h-5 w-48 rounded bg-muted animate-pulse" />
            </div>

            {/* Track list skeleton */}
            <div className="flex-1 px-4 py-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                        <div className="h-5 w-5 rounded bg-muted animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 rounded bg-muted animate-pulse w-3/4" />
                            <div className="h-3 rounded bg-muted animate-pulse w-24" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Centered spinner overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        </div>
    )
}
