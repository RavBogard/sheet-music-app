"use client"
import { Skeleton } from "@/components/ui/skeleton"

export function LibrarySkeleton() {
    return (
        <div className="flex-1 p-4 grid grid-cols-1 gap-2 max-w-3xl mx-auto w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-full text-left p-6 rounded-2xl flex items-center gap-5 bg-zinc-900 border border-zinc-800">
                    <Skeleton className="h-10 w-10 rounded-lg" /> {/* Icon matches size */}
                    <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-6 w-1/3" />     {/* Title */}
                        <Skeleton className="h-4 w-1/4" />     {/* Subtitle/Metadata */}
                    </div>
                </div>
            ))}
        </div>
    )
}
